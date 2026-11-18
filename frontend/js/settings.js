let editingCameraId = null;

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

async function loadCameras() {
    const tbody = document.getElementById("cameras-tbody");
    try {
        const cams = await fetchCameras();
        if (!cams || cams.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 3rem;">No cameras configured. Click "Add Camera" to add one.</td></tr>`;
            return;
        }
        tbody.innerHTML = "";
        for (const cam of cams) {
            const active = cam.active;
            const tr = document.createElement("tr");
            const name = escapeHtml(cam.name);
            const url = escapeHtml(cam.url);
            tr.innerHTML = `
                <td><strong>${name}</strong></td>
                <td style="font-size: 0.85rem; color: var(--text-muted); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${url}</td>
                <td><span class="status-badge ${active ? 'status-compliant' : 'status-violation'}">${active ? 'Active' : 'Inactive'}</span></td>
                <td>
                    <button class="btn btn-outline cam-start-btn" data-id="${cam.id}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;${active ? ' display: none;' : ''}">
                        <i data-lucide="play" style="width: 12px; height: 12px;"></i> Start
                    </button>
                    <button class="btn btn-outline cam-stop-btn" data-id="${cam.id}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;${active ? '' : ' display: none;'}">
                        <i data-lucide="square" style="width: 12px; height: 12px;"></i> Stop
                    </button>
                    <button class="btn btn-outline cam-edit-btn" data-id="${cam.id}" data-name="${name}" data-url="${url}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">
                        <i data-lucide="edit" style="width: 12px; height: 12px;"></i> Edit
                    </button>
                    <button class="btn btn-outline cam-delete-btn" data-id="${cam.id}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; color: var(--color-violation);">
                        <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i> Delete
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        }
        lucide.createIcons();

        tbody.querySelectorAll(".cam-start-btn").forEach(btn => {
            btn.onclick = async () => {
                btn.disabled = true;
                btn.innerHTML = `<span class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:middle;"></span>`;
                try {
                    await apiFetch(`/cameras/${btn.dataset.id}/start`, { method: "POST" });
                    loadCameras();
                } catch (e) {
                    alert("Failed to start camera stream.\nCheck that the URL is correct and the camera is reachable.\n\nTip: IP Webcam uses http://, not https://\nExample: http://192.168.1.100:8080/video");
                    loadCameras();
                }
            };
        });
        tbody.querySelectorAll(".cam-stop-btn").forEach(btn => {
            btn.onclick = async () => {
                try {
                    await apiFetch(`/cameras/${btn.dataset.id}/stop`, { method: "POST" });
                    loadCameras();
                } catch (e) { console.error("Stop failed:", e); }
            };
        });
        tbody.querySelectorAll(".cam-edit-btn").forEach(btn => {
            btn.onclick = () => openModal(btn.dataset.id, btn.dataset.name, btn.dataset.url);
        });
        tbody.querySelectorAll(".cam-delete-btn").forEach(btn => {
            btn.onclick = async () => {
                if (!confirm("Delete this camera?")) return;
                try {
                    await apiFetch(`/cameras/${btn.dataset.id}`, { method: "DELETE" });
                    loadCameras();
                } catch (e) { console.error("Delete failed:", e); }
            };
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--color-violation); padding: 3rem;">Failed to load cameras: ${escapeHtml(e.message)}</td></tr>`;
    }
}

function openModal(id = null, name = "", url = "") {
    editingCameraId = id;
    document.getElementById("camera-modal-title").textContent = id ? "Edit Camera" : "Add Camera";
    document.getElementById("cam-name").value = name;
    document.getElementById("cam-url").value = url;
    document.getElementById("camera-modal").style.display = "flex";
}

function closeModal() {
    document.getElementById("camera-modal").style.display = "none";
    editingCameraId = null;
}

document.getElementById("add-camera-btn").onclick = () => openModal();
document.getElementById("camera-modal-close").onclick = closeModal;
document.getElementById("camera-modal-cancel").onclick = closeModal;

document.getElementById("camera-modal-save").onclick = async () => {
    const name = document.getElementById("cam-name").value.trim();
    const url = document.getElementById("cam-url").value.trim();
    if (!name || !url) {
        alert("Name and URL are required.");
        return;
    }
    try {
        if (editingCameraId) {
            await apiFetch(`/cameras/${editingCameraId}`, {
                method: "PUT",
                body: JSON.stringify({ name, url }),
            });
        } else {
            await apiFetch("/cameras", {
                method: "POST",
                body: JSON.stringify({ name, url }),
            });
        }
        closeModal();
        loadCameras();
    } catch (e) {
        alert("Failed to save camera: " + e.message);
    }
};

document.addEventListener("DOMContentLoaded", () => {
    loadCameras();
});
