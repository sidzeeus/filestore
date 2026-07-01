# Simple S3 File Storage Web App

A minimal file storage app: upload, list, download, delete files — stored in
Amazon S3, served by a small Node/Express backend, with a plain HTML/JS
frontend. Runs in Docker, deployable on a single EC2 instance.

## Stack
- **Frontend:** plain HTML/CSS/JS (served as static files by Express — no build step)
- **Backend:** Node.js + Express + AWS SDK v3
- **Storage:** Amazon S3
- **Hosting:** Amazon EC2 (Docker container)
- **Permissions:** an IAM Role attached to the EC2 instance (no access keys to manage)

```
filestore-app/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── Dockerfile
│   ├── .env.example
│   └── public/        (frontend: index.html, app.js, style.css)
└── docker-compose.yml
```

---

## 1. Create the AWS resources

### S3 bucket
1. S3 console → **Create bucket**.
2. Name it something globally unique, e.g. `my-filestore-app-bucket-2026`.
3. Keep "Block all public access" **ON** (the app uses temporary signed URLs
   for downloads, so the bucket itself never needs to be public).
4. Leave everything else default → Create.

### IAM Role (attached to EC2, so the app never needs hardcoded AWS keys)
1. IAM console → **Roles** → **Create role**.
2. Trusted entity: **AWS service** → **EC2**.
3. Skip attaching a managed policy for now; create an inline policy instead
   (Permissions → Add permissions → Create inline policy) scoped to just your
   bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket", "s3:DeleteObject"],
      "Resource": [
        "arn:aws:s3:::my-filestore-app-bucket-2026",
        "arn:aws:s3:::my-filestore-app-bucket-2026/*"
      ]
    }
  ]
}
```
4. Name the role e.g. `filestore-ec2-role` and create it.

### EC2 instance
1. EC2 console → **Launch instance**.
2. Amazon Linux 2023 (or Ubuntu), **t2.micro** (free-tier eligible) is enough.
3. Under **IAM instance profile**, select `filestore-ec2-role`.
4. Security group: allow inbound **SSH (22)** from your IP, and **HTTP (3000)**
   (or 80, see note below) from `0.0.0.0/0` so you can reach the app.
5. Launch, and SSH into it once it's running.

---

## 2. Install Docker on the EC2 instance

```bash
# Amazon Linux 2023
sudo yum update -y
sudo yum install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
# log out and back in so the group change applies

# Docker Compose plugin
sudo mkdir -p /usr/libexec/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/libexec/docker/cli-plugins/docker-compose
sudo chmod +x /usr/libexec/docker/cli-plugins/docker-compose
```

(On Ubuntu, use `apt` instead of `yum` and follow Docker's official Ubuntu install steps.)

---

## 3. Deploy the app

```bash
git clone <your-repo-url> filestore-app   # or scp the folder up
cd filestore-app/backend
cp .env.example .env
nano .env   # set S3_BUCKET_NAME, AWS_REGION, AUTH_USERNAME, AUTH_PASSWORD (leave AWS keys blank — IAM role handles auth)

cd ..
docker compose up -d --build
```

Visit `http://<EC2-public-IP>:3000` in your browser — the app should be live.

To view logs: `docker compose logs -f`
To stop: `docker compose down`

---

## Notes / simple ways to harden later
- **Port 80 instead of 3000:** either change the container's port mapping to
  `"80:3000"` in `docker-compose.yml`, or put a small **Nginx** reverse proxy
  in front (also lets you add HTTPS via Let's Encrypt/certbot).
- **HTTPS:** put **Amazon CloudFront** or an **Application Load Balancer**
  with an ACM certificate in front of the EC2 instance for SSL — both are
  optional add-ons, not required for the app to work.
- **No database needed:** S3's own object listing is used as the "file list,"
  so there's nothing else to provision.
- **Costs:** t2.micro + a small S3 bucket are within AWS's free tier for the
  first 12 months on a new account.
