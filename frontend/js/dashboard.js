let trendChart = null;
let audioAlarmEnabled = true;
let alertsPollingInterval = null;
let shownAlertIds = new Set();
let audioCtx = null;
let detectionInterval = null;
let videoStream = null;
let videoEl = null;
let canvasEl = null;
let ctx = null;
let isStreaming = false;
let lastDetections = [];
let eventCooldowns = {};
let currentCameraId = "";
let currentCameraName = "";
let cameras = [];

function updateHudClock() {
    const clockEl = document.getElementById("hud-timestamp");
    if (clockEl) {
        const now = new Date();
        clockEl.textContent = now.toLocaleDateString() + " " + now.toLocaleTimeString();
    }
}
setInterval(updateHudClock, 1000);

function playAlarmSound() {
    if (!audioAlarmEnabled) return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const now = audioCtx.currentTime;
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(880, now);
        gain1.gain.setValueAtTime(0.15, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.12);
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(1046.5, now + 0.15);
        gain2.gain.setValueAtTime(0.15, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.35);
    } catch (e) {
        console.warn("Web Audio blocked: ", e);
    }
}

function triggerFloatingToast(record) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast-alert";
    toast.innerHTML = `
        <div class="toast-alert-icon"><i data-lucide="alert-octagon" style="width:20px;height:20px;"></i></div>
        <div class="toast-alert-content">
            <h4>Safety Violation Warning</h4>
            <p><strong>${record.alert_type === "fall" ? "Fall" : "PPE Violation"}</strong> detected!</p>
        </div>
        <button class="toast-close-btn">&times;</button>`;
    container.appendChild(toast);
    lucide.createIcons();
    playAlarmSound();
    const player = document.getElementById("video-feed-player");
    if (player) { player.classList.add("alarm-active"); setTimeout(() => player.classList.remove("alarm-active"), 4000); }
    const closeBtn = toast.querySelector(".toast-close-btn");
    closeBtn.onclick = () => { toast.classList.add("toast-exit"); setTimeout(() => toast.remove(), 300); };
    setTimeout(() => { if (toast.parentNode) { toast.classList.add("toast-exit"); setTimeout(() => toast.remove(), 300); } }, 6000);
}

subscribeToNewViolations((newRecord) => {
    triggerFloatingToast(newRecord);
    loadAlertsTicker();
    loadDashboardStats();
    renderTrendsChart();
});

const audioBtn = document.getElementById("audio-alarm-btn");
if (audioBtn) {
    audioBtn.addEventListener("click", () => {
        audioAlarmEnabled = !audioAlarmEnabled;
        if (audioAlarmEnabled) {
            audioBtn.innerHTML = `<i data-lucide="volume-2"></i> <span>Alarm Sound: ON</span>`;
            audioBtn.classList.remove("btn-outline");
            audioBtn.classList.add("btn-primary");
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } else {
            audioBtn.innerHTML = `<i data-lucide="volume-x"></i> <span>Alarm Sound: OFF</span>`;
            audioBtn.classList.remove("btn-primary");
            audioBtn.classList.add("btn-outline");
        }
        lucide.createIcons();
    });
}

async function loadCameraDropdown() {
    const sel = document.getElementById("hud-camera-select");
    if (!sel) return;
    try {
        cameras = await fetchCameras();
        sel.innerHTML = `<option value="" style="background:#1f2a3f;color:#e5e7eb;">Browser Webcam</option>`;
        cameras.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c.id;
            opt.textContent = c.name;
            opt.style = "background:#1f2a3f;color:#e5e7eb;";
            sel.appendChild(opt);
        });
    } catch (e) {
        console.error("Load cameras error:", e);
    }
}

document.addEventListener("change", (e) => {
    if (e.target.id === "hud-camera-select") {
        if (isStreaming) {
            stopCamera();
        }
        currentCameraId = e.target.value;
        const selCam = cameras.find(c => c.id === currentCameraId);
        currentCameraName = selCam ? selCam.name : "";
    }
});

window.startCamera = async function() {
    if (isStreaming) return;
    videoEl = document.getElementById("live-video");
    canvasEl = document.getElementById("annotation-canvas");
    const player = document.getElementById("video-feed-player");
    if (!videoEl || !canvasEl || !player) return;
    ctx = canvasEl.getContext("2d");
    isStreaming = true;

    const hudLive = document.getElementById("hud-live-label");
    if (hudLive) hudLive.textContent = "LIVE";
    document.getElementById("btn-start-cam").style.display = "none";
    document.getElementById("btn-stop-cam").style.display = "inline-flex";
    const hint = document.getElementById("cam-hint");
    if (hint) hint.style.display = "none";

    if (currentCameraId) {
        try {
            await apiFetch(`/cameras/${currentCameraId}/start`, { method: "POST" });
        } catch (e) {
            console.error("Start camera stream failed:", e);
        }
        startIPCameraLoop();
    } else {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Camera requires a secure context (HTTPS or localhost).\nOn Chromium browsers, use http://localhost:8000 instead of the IP address.");
            isStreaming = false;
            return;
        }
        navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
            .then(function(stream) {
                videoStream = stream;
                videoEl.srcObject = stream;
                videoEl.play();
                startDetectionLoop();
            })
            .catch(function(err) {
                console.error("Camera access denied:", err);
                alert("Camera access is required for detection. Please allow camera permissions.");
                isStreaming = false;
            });
    }
}

function startDetectionLoop() {
    if (detectionInterval) clearInterval(detectionInterval);
    detectionInterval = setInterval(async () => {
        if (!isStreaming || !videoEl || !videoEl.videoWidth) return;
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = videoEl.videoWidth || 640;
        tempCanvas.height = videoEl.videoHeight || 480;
        const tempCtx = tempCanvas.getContext("2d");
        tempCtx.drawImage(videoEl, 0, 0);
        tempCanvas.toBlob(async function(blob) {
            try {
                const formData = new FormData();
                formData.append("file", blob, "frame.jpg");
                const session = getCurrentSession();
                const token = session?.access_token;
                const headers = {};
                if (token) headers["Authorization"] = `Bearer ${token}`;
                const response = await fetch(`${API_BASE_URL}/detect`, { method: "POST", headers, body: formData });
                if (!response.ok) return;
                const data = await response.json();
                lastDetections = data.detections || [];
                const img = new Image();
                img.onload = function() {
                    if (!ctx || !canvasEl) return;
                    canvasEl.width = img.width;
                    canvasEl.height = img.height;
                    ctx.drawImage(img, 0, 0);
                };
                img.src = "data:image/jpeg;base64," + data.annotated_image;
                const now = Date.now();
                const lastEvent = eventCooldowns[data.event_type] || 0;
                if (now - lastEvent > 30000) {
                    eventCooldowns[data.event_type] = now;
                    await storeDetectionEvent(data);
                }
            } catch (e) {}
        }, "image/jpeg", 0.8);
    }, 1500);
}

function startIPCameraLoop() {
    if (detectionInterval) clearInterval(detectionInterval);
    detectionInterval = setInterval(async () => {
        if (!isStreaming) return;
        try {
            const session = getCurrentSession();
            const token = session?.access_token;
            const headers = {};
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const response = await fetch(`${API_BASE_URL}/detect?camera_id=${currentCameraId}`, { method: "POST", headers, body: null });
            if (!response.ok) return;
            const data = await response.json();
            lastDetections = data.detections || [];
            if (data.annotated_image && ctx && canvasEl) {
                const img = new Image();
                img.onload = function() {
                    canvasEl.width = img.width;
                    canvasEl.height = img.height;
                    ctx.drawImage(img, 0, 0);
                };
                img.src = "data:image/jpeg;base64," + data.annotated_image;
            }
            const now = Date.now();
            const lastEvent = eventCooldowns[data.event_type] || 0;
            if (now - lastEvent > 30000) {
                eventCooldowns[data.event_type] = now;
                data.camera_id = currentCameraId;
                data.camera_name = currentCameraName;
                await storeDetectionEvent(data);
            }
        } catch (e) {}
    }, 1500);
}

async function storeDetectionEvent(detectResult) {
    try {
        const session = getCurrentSession();
        if (!session) return;
        const body = {
            event_type: detectResult.event_type,
            snapshot: detectResult.annotated_image,
            camera_id: detectResult.camera_id || currentCameraId || null,
            camera_name: detectResult.camera_name || currentCameraName || null,
            detections: (detectResult.detections || []).map(d => ({
                class_id: d.class_id,
                class_name: d.class_name,
                confidence: d.confidence,
                bbox: d.bbox,
                is_violation: d.is_violation,
            })),
        };
        await fetch(`${API_BASE_URL}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
            body: JSON.stringify(body),
        });
    } catch (e) {
        console.error("Failed to store event:", e);
    }
}

window.stopCamera = function() {
    isStreaming = false;
    if (detectionInterval) { clearInterval(detectionInterval); detectionInterval = null; }
    if (currentCameraId) {
        apiFetch(`/cameras/${currentCameraId}/stop`, { method: "POST" }).catch(() => {});
    }
    if (videoEl && videoEl.srcObject) {
        videoEl.srcObject.getTracks().forEach(t => t.stop());
        videoEl.srcObject = null;
    }
    videoStream = null;
    if (ctx && canvasEl) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    const hudLive = document.getElementById("hud-live-label");
    if (hudLive) hudLive.textContent = "OFF";
    document.getElementById("btn-start-cam").style.display = "inline-flex";
    document.getElementById("btn-stop-cam").style.display = "none";
}

async function initDashboard() {
    await loadCameraDropdown();
    try { await loadDashboardStats(); } catch (e) { console.error("Stats fail:", e); }
    try { await loadAlertsTicker(); } catch (e) { console.error("Alerts fail:", e); }
    try { await renderTrendsChart(); } catch (e) { console.error("Chart fail:", e); }
    startAlertsPolling();
}

async function loadDashboardStats() {
    try {
        const stats = await fetchStats();
        document.getElementById("val-compliance").textContent = stats.complianceRate + "%";
        document.getElementById("val-unresolved").textContent = stats.unresolvedToday;
        document.getElementById("val-today-alerts").textContent = stats.activeAlertsToday;
    } catch (e) { console.error("loadDashboardStats error:", e); }
}

async function loadAlertsTicker() {
    const container = document.getElementById("alerts-ticker");
    if (!container) return;
    try {
        const alerts = await fetchAlerts({ limit: 20 });
        if (!alerts || alerts.length === 0) {
            container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:3rem;">No active violations. System monitoring.</div>`;
            return;
        }
        container.innerHTML = "";
        alerts.forEach(a => {
            const item = document.createElement("div");
            item.className = "alert-item";
            const isUnack = !a.acknowledged;
            item.innerHTML = `
                <div class="alert-icon ${a.alert_type === 'fall' ? 'alert-icon-fall' : 'alert-icon-violation'}">
                    <i data-lucide="${a.alert_type === 'fall' ? 'user-minus' : 'alert-triangle'}" style="width:16px;height:16px;"></i>
                </div>
                <div class="alert-content">
                    <strong>${a.alert_type === 'fall' ? 'Fall Detected' : 'PPE Violation'}</strong>
                    <span>${a.message || ''}</span>
                </div>
                ${isUnack ? `<button class="alert-ack-btn" data-id="${a.id}"><i data-lucide="check" style="width:14px;height:14px;"></i></button>` : `<span class="alert-ack-badge">Acknowledged</span>`}`;
            container.appendChild(item);
        });
        lucide.createIcons();
        container.querySelectorAll(".alert-ack-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                try { await acknowledgeAlert(btn.dataset.id); await loadAlertsTicker(); await loadDashboardStats(); }
                catch (e) { console.error("Ack failed:", e); }
            });
        });
    } catch (e) { console.error("loadAlertsTicker error:", e); }
}

async function renderTrendsChart() {
    const canvas = document.getElementById("complianceTrendsChart");
    if (!canvas) return;
    try {
        const data = await fetchWeeklyTrends();
        if (trendChart) trendChart.destroy();
        trendChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [
                    { label: 'Compliant', data: data.compliant, backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 4 },
                    { label: 'Violations', data: data.violations, backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#9ca3af' } } },
                scales: { x: { grid: { color: 'rgba(46,59,78,0.3)' }, ticks: { color: '#9ca3af' } }, y: { grid: { color: 'rgba(46,59,78,0.3)' }, ticks: { color: '#9ca3af', precision: 0 } } }
            }
        });
    } catch (e) { console.error("renderTrendsChart error:", e); }
}

function startAlertsPolling() {
    if (alertsPollingInterval) clearInterval(alertsPollingInterval);
    alertsPollingInterval = setInterval(() => loadAlertsTicker(), 10000);
}

function stopAlertsPolling() {
    if (alertsPollingInterval) { clearInterval(alertsPollingInterval); alertsPollingInterval = null; }
}

window.addEventListener("beforeunload", () => { stopAlertsPolling(); stopViolationPolling(); stopCamera(); });
document.addEventListener("DOMContentLoaded", () => initDashboard());
