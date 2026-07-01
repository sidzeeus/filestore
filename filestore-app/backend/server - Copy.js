require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
const PORT = process.env.PORT || 3000;
const BUCKET = process.env.S3_BUCKET_NAME;
const REGION = process.env.AWS_REGION || 'us-east-1';

if (!BUCKET) {
  console.error('ERROR: S3_BUCKET_NAME is not set in .env');
  process.exit(1);
}

// S3 client. On EC2 with an IAM role attached, no keys are needed here at all -
// the SDK automatically picks up credentials from the instance metadata service.
const s3 = new S3Client({ region: REGION });

app.use(cors());
app.use(express.json());

// --- Simple HTTP Basic Auth (protects the whole app) ---
const AUTH_USER = process.env.AUTH_USERNAME;
const AUTH_PASS = process.env.AUTH_PASSWORD;

if (!AUTH_USER || !AUTH_PASS) {
  console.error('ERROR: AUTH_USERNAME and AUTH_PASSWORD must be set in .env');
  process.exit(1);
}

app.use((req, res, next) => {
  if (req.path === '/api/health') return next(); // allow health checks through

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="File Storage"');
    return res.status(401).send('Authentication required');
  }

  const decoded = Buffer.from(header.split(' ')[1], 'base64').toString();
  const [user, pass] = decoded.split(':');

  if (user === AUTH_USER && pass === AUTH_PASS) return next();

  res.set('WWW-Authenticate', 'Basic realm="File Storage"');
  return res.status(401).send('Invalid credentials');
});

app.use(express.static(path.join(__dirname, 'public')));

// Files are held in memory briefly, then streamed to S3 (fine for small/medium files).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB cap

// --- Upload a file ---
app.post('/api/files', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const key = `${Date.now()}-${req.file.originalname}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );

    res.json({ message: 'Uploaded successfully', key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// --- List all files ---
app.get('/api/files', async (req, res) => {
  try {
    const data = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET }));
    const files = (data.Contents || [])
      .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified))
      .map((obj) => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
      }));
    res.json(files);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not list files' });
  }
});

// --- Get a temporary download link for a file ---
app.get('/api/files/:key/download', async (req, res) => {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: req.params.key });
    const url = await getSignedUrl(s3, command, { expiresIn: 300 }); // valid 5 minutes
    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not generate download link' });
  }
});

// --- Delete a file ---
app.delete('/api/files/:key', async (req, res) => {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: req.params.key }));
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
