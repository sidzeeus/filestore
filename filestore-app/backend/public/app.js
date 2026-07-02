const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const uploadQueue = document.getElementById('uploadQueue');
const fileList = document.getElementById('fileList');
const tableEl = document.querySelector('.file-table');
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const refreshBtn = document.getElementById('refreshBtn');
const fileCountEl = document.getElementById('fileCount');
const totalSizeEl = document.getElementById('totalSize');
const toastContainer = document.getElementById('toastContainer');
const confirmModal = document.getElementById('confirmModal');
const confirmModalText = document.getElementById('confirmModalText');
const confirmCancel = document.getElementById('confirmCancel');
const confirmOk = document.getElementById('confirmOk');

let pendingDeleteKey = null;

// ---------- Helpers ----------

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function displayName(key) {
  return key.replace(/^\d+-/, '');
}

function extOf(name) {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function iconFor(ext) {
  const docExt = ['doc', 'docx', 'pdf', 'txt', 'md'];
  const imgExt = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];
  const archExt = ['zip', 'rar', '7z', 'tar', 'gz'];
  const codeExt = ['js', 'ts', 'json', 'py', 'html', 'css', 'java', 'go', 'rb'];

  if (imgExt.includes(ext)) {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  if (archExt.includes(ext)) {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v18M9 7h2M13 11h-2M9 15h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  }
  if (codeExt.includes(ext)) {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18l-6-6 6-6M15 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  if (docExt.includes(ext)) {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  }
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
}

function showToast(message, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

// ---------- Loading files ----------

async function loadFiles() {
  loadingState.classList.add('is-active');
  tableEl.style.display = 'none';
  emptyState.hidden = true;

  try {
    const res = await fetch('/api/files');
    if (res.status === 401) {
      window.location.reload();
      return;
    }
    if (!res.ok) throw new Error('Failed to load files');
    const files = await res.json();

    fileCountEl.textContent = `${files.length} file${files.length === 1 ? '' : 's'}`;
    totalSizeEl.textContent = formatSize(files.reduce((sum, f) => sum + f.size, 0));

    if (files.length === 0) {
      emptyState.hidden = false;
      tableEl.style.display = 'none';
    } else {
      renderFiles(files);
      tableEl.style.display = 'table';
    }
  } catch (err) {
    showToast('Could not load files', 'error');
  } finally {
    loadingState.classList.remove('is-active');
  }
}

function renderFiles(files) {
  fileList.innerHTML = files.map((f) => {
    const name = displayName(f.key);
    const ext = extOf(name);
    return `
      <tr data-key="${encodeURIComponent(f.key)}">
        <td>
          <div class="file-name">
            <span class="file-name__icon">${iconFor(ext)}</span>
            <span class="file-name__text" title="${name}">${name}</span>
          </div>
        </td>
        <td class="file-meta">${formatSize(f.size)}</td>
        <td class="file-meta">${formatDate(f.lastModified)}</td>
        <td>
          <div class="row-actions">
            <button class="download-btn" title="Download" aria-label="Download ${name}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 16V4M12 16l-4-4M12 16l4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </button>
            <button class="delete-btn danger" title="Delete" aria-label="Delete ${name}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7h12z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  fileList.querySelectorAll('tr').forEach((row) => {
    const key = decodeURIComponent(row.dataset.key);
    row.querySelector('.download-btn').addEventListener('click', () => downloadFile(key));
    row.querySelector('.delete-btn').addEventListener('click', () => requestDelete(key));
  });
}

// ---------- Upload ----------

function uploadFile(file) {
  const item = document.createElement('div');
  item.className = 'upload-item';
  item.innerHTML = `
    <span class="upload-item__name">${file.name}</span>
    <div class="upload-item__track"><div class="upload-item__bar"></div></div>
    <span class="upload-item__status">0%</span>
  `;
  uploadQueue.appendChild(item);

  const bar = item.querySelector('.upload-item__bar');
  const status = item.querySelector('.upload-item__status');

  const formData = new FormData();
  formData.append('file', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/files');

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      bar.style.width = pct + '%';
      status.textContent = pct + '%';
    }
  });

  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      status.textContent = 'Done';
      bar.style.width = '100%';
      showToast(`${file.name} uploaded`, 'success');
      loadFiles();
      setTimeout(() => item.remove(), 1200);
    } else if (xhr.status === 401) {
      window.location.reload();
    } else {
      item.classList.add('is-error');
      status.textContent = 'Failed';
      showToast(`Failed to upload ${file.name}`, 'error');
    }
  };

  xhr.onerror = () => {
    item.classList.add('is-error');
    status.textContent = 'Failed';
    showToast(`Failed to upload ${file.name}`, 'error');
  };

  xhr.send(formData);
}

function handleFiles(fileListObj) {
  Array.from(fileListObj).forEach(uploadFile);
}

// ---------- Download / Delete ----------

async function downloadFile(key) {
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(key)}/download`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    window.open(data.url, '_blank');
  } catch {
    showToast('Could not generate download link', 'error');
  }
}

function requestDelete(key) {
  pendingDeleteKey = key;
  confirmModalText.textContent = `"${displayName(key)}" will be permanently deleted.`;
  confirmModal.classList.add('is-open');
}

confirmCancel.addEventListener('click', () => {
  confirmModal.classList.remove('is-open');
  pendingDeleteKey = null;
});

confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) {
    confirmModal.classList.remove('is-open');
    pendingDeleteKey = null;
  }
});

confirmOk.addEventListener('click', async () => {
  if (!pendingDeleteKey) return;
  const key = pendingDeleteKey;
  confirmModal.classList.remove('is-open');
  pendingDeleteKey = null;

  try {
    const res = await fetch(`/api/files/${encodeURIComponent(key)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    showToast('File deleted', 'success');
    loadFiles();
  } catch {
    showToast('Could not delete file', 'error');
  }
});

// ---------- Dropzone events ----------

dropzone.addEventListener('click', () => fileInput.click());
browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleFiles(fileInput.files);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
});

['dragleave', 'drop'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
  });
});

dropzone.addEventListener('drop', (e) => {
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

refreshBtn.addEventListener('click', () => {
  refreshBtn.classList.add('is-spinning');
  loadFiles().finally(() => setTimeout(() => refreshBtn.classList.remove('is-spinning'), 400));
});

// ---------- Init ----------

loadFiles();
