// Elements
const photoboothGrid = document.getElementById('photoboothGrid');
const startBtn = document.getElementById('startBtn');
const startBtnText = document.getElementById('startBtnText');
const startSpinner = document.getElementById('startSpinner');
const startOverlay = document.getElementById('startOverlay');

const video = document.getElementById('video');
const capturedPhoto = document.getElementById('capturedPhoto');
const countdownEl = document.getElementById('countdown');
const flashEl = document.getElementById('flash');
const shutterBtn = document.getElementById('shutterBtn');
const stopBtn = document.getElementById('stopBtn');
const mirrorBtn = document.getElementById('mirrorBtn');

const numSelect = document.getElementById('numSelect');
const thumbContainer = document.getElementById('thumbContainer');
const previewArea = document.getElementById('previewArea');
const downloadStripBtn = document.getElementById('downloadStripBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const clearBtn = document.getElementById('clearBtn');

// offscreen canvas
const offCanvas = document.createElement('canvas');

// State
let stream = null;
let currentFilter = 'none';
let isMirrored = false;
let inSequence = false;
let capturedData = []; // data URLs array

const DELAY_MS = 3000; // 3 seconds (countdown is 3s)

// Helpers
function updatePreviewVisibility() {
    // Preview auto-hide until capturedData.length >= 3
    if (capturedData.length >= 1) {
        photoboothGrid.classList.add('show-preview');
    } else {
        photoboothGrid.classList.remove('show-preview');
    }
}

function setActiveFilterButton(name) {
    currentFilter = name;
}
function applyFilterToVideo(name) {
    video.classList.remove(...[...video.classList].filter(c => c.startsWith('filter-')));
    video.classList.add('filter-' + name);
    currentFilter = name;
}

async function startCamera() {
    if (stream) return;
    startSpinner.style.display = 'inline-block';
    startBtnText.textContent = 'Starting…';
    startBtn.disabled = true;
    try {
        const media = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
        stream = media; video.srcObject = stream;
        await new Promise(r => {
            if (video.readyState >= 2) return r();
            video.onloadedmetadata = () => r();
        });
        startOverlay.style.display = 'none';
        stopBtn.style.display = 'inline-flex';
        mirrorBtn.style.display = 'inline-flex';
        if (isMirrored) video.classList.add('mirror'); else video.classList.remove('mirror');
        video.muted = true;
    } catch (err) {
        console.error('Camera error', err);
        alert('Unable to access camera. Please allow camera permission and try again.');
    } finally {
        startSpinner.style.display = 'none';
        startBtnText.textContent = 'Start Camera';
        startBtn.disabled = false;
    }
}

function stopCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    video.srcObject = null;
    startOverlay.style.display = 'flex';
    stopBtn.style.display = 'none';
    mirrorBtn.style.display = 'none';
    // keep preview intact
}

function flash() {
    flashEl.classList.add('show');
    setTimeout(() => flashEl.classList.remove('show'), 260);
}

function captureOnce() {
    if (!stream) return null;
    const vw = video.videoWidth || video.clientWidth || 1280;
    const vh = video.videoHeight || video.clientHeight || Math.round(vw * 9 / 16);
    offCanvas.width = vw; offCanvas.height = vh;
    const ctx = offCanvas.getContext('2d');
    const computed = getComputedStyle(video).filter || 'none';
    ctx.filter = computed;
    if (isMirrored) {
        ctx.save();
        ctx.translate(offCanvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height);
        ctx.restore();
    } else {
        ctx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height);
    }
    return offCanvas.toDataURL('image/png');
}

async function runCountdown() {
    countdownEl.classList.add('show');
    for (let i = 3; i > 0; i--) {
        countdownEl.textContent = i;
        countdownEl.classList.add('pulse');
        await new Promise(r => setTimeout(r, 620));
        countdownEl.classList.remove('pulse');
        await new Promise(r => setTimeout(r, 380));
    }
    countdownEl.classList.remove('show');
    await new Promise(r => setTimeout(r, 80));
}

async function createVerticalStripFromData(dataUrls) {
    if (!dataUrls || dataUrls.length === 0) return null;
    const imgs = await Promise.all(dataUrls.map(d => new Promise((res) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = d;
    })));
    const validImgs = imgs.filter(i => i !== null);
    if (validImgs.length === 0) return null;
    const widths = validImgs.map(i => i.width);
    const targetWidth = Math.max(...widths);
    const heights = validImgs.map(i => Math.round(i.height * (targetWidth / i.width)));
    const totalHeight = heights.reduce((a, b) => a + b, 0);
    const stripCanvas = document.createElement('canvas');
    stripCanvas.width = targetWidth;
    stripCanvas.height = totalHeight;
    const ctx = stripCanvas.getContext('2d');
    let y = 0;
    for (let idx = 0; idx < validImgs.length; idx++) {
        const img = validImgs[idx];
        const h = heights[idx];
        ctx.drawImage(img, 0, y, targetWidth, h);
        y += h;
    }
    return stripCanvas.toDataURL('image/png');
}

function refreshThumbs() {
    thumbContainer.innerHTML = '';
    capturedData.forEach((d, idx) => {
        const box = document.createElement('div');
        box.className = 'thumb-box';
        const img = document.createElement('img');
        img.src = d;
        img.className = 'thumb';
        if (isMirrored) img.classList.add('mirror'); else img.classList.remove('mirror');
        box.appendChild(img);
        const lbl = document.createElement('div');
        lbl.className = 'small-meta';
        lbl.style.width = '100%';
        lbl.style.textAlign = 'center';
        lbl.textContent = `Photo #${idx + 1}`;
        const actions = document.createElement('div');
        actions.style.display = 'flex'; actions.style.gap = '8px'; actions.style.marginTop = '6px';
        const dl = document.createElement('button');
        dl.className = 'btn btn-ghost btn-round btn-sm'; dl.innerHTML = '<i class="fa-solid fa-download"></i>';
        dl.title = 'Download this photo';
        dl.onclick = () => triggerDownload(d, `photo-${idx + 1}.png`);
        const del = document.createElement('button');
        del.className = 'btn btn-ghost btn-round btn-sm text-danger'; del.innerHTML = '<i class="fa-solid fa-trash"></i>';
        del.title = 'Remove this photo';
        del.onclick = () => {
            capturedData.splice(idx, 1);
            refreshThumbs();
            toggleActions();
            updatePreviewVisibility();
        };
        actions.appendChild(dl); actions.appendChild(del);
        box.appendChild(lbl);
        box.appendChild(actions);
        thumbContainer.appendChild(box);
    });
    toggleActions();
}

function toggleActions() {
    const has = capturedData.length > 0;
    downloadStripBtn.disabled = !has;
    downloadAllBtn.disabled = !has;
    clearBtn.disabled = !has;
}

function triggerDownload(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function captureSequence(n) {
    if (inSequence || !stream) return;
    inSequence = true;
    capturedData = [];
    refreshThumbs();
    updatePreviewVisibility();

    for (let i = 0; i < n; i++) {
        await runCountdown();
        flash();
        const data = captureOnce();
        if (data) {
            capturedData.push(data);
            refreshThumbs();
        }
        // no extra wait: countdown itself is 3s
    }

    // After sequence done, ensure preview visibility update
    updatePreviewVisibility();
    // Optionally create strip to show top or allow download; we'll keep thumbnails updated
    inSequence = false;
}

// UI events
startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);
mirrorBtn.addEventListener('click', () => {
    isMirrored = !isMirrored;
    if (isMirrored) video.classList.add('mirror'); else video.classList.remove('mirror');
    refreshThumbs();
});

shutterBtn.addEventListener('click', async () => {
    if (!stream) {
        await startCamera();
        return;
    }
    if (inSequence) return;
    const n = Math.max(1, Math.min(12, parseInt(numSelect.value || '3', 10)));
    shutterBtn.style.pointerEvents = 'none';
    shutterBtn.style.opacity = '0.85';
    await captureSequence(n);
    shutterBtn.style.pointerEvents = 'auto';
    shutterBtn.style.opacity = '1';
});

// keyboard shortcuts
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        if (document.activeElement && /input|textarea|select/i.test(document.activeElement.tagName)) return;
        e.preventDefault();
        shutterBtn.click();
    }
    if (e.key === 's' || e.key === 'S') {
        if (!stream) startCamera(); else stopCamera();
    }
    if (e.key === 'm' || e.key === 'M') {
        mirrorBtn.click();
    }
});

// downloads and clear handlers
downloadAllBtn.addEventListener('click', () => {
    capturedData.forEach((d, idx) => triggerDownload(d, `photo-${idx + 1}.png`));
});
downloadStripBtn.addEventListener('click', async () => {
    const s = await createVerticalStripFromData(capturedData);
    if (s) triggerDownload(s, `photostrip-${Date.now()}.png`);
});
clearBtn.addEventListener('click', () => {
    capturedData = [];
    thumbContainer.innerHTML = '';
    toggleActions();
    updatePreviewVisibility();
});

// cleanup
window.addEventListener('beforeunload', () => { if (stream) stream.getTracks().forEach(t => t.stop()); });

// initial
updatePreviewVisibility();
toggleActions();