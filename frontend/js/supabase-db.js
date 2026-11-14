/**
 * PPE Compliance Detection System - Connected API Layer (FastAPI Proxy)
 */

const API_BASE_URL = window.location.origin.includes(":8000")
    ? window.location.origin
    : "http://localhost:8000";

// Centralized wrapper for calling backend FastAPI endpoints
async function apiFetch(endpoint, options = {}) {
    const session = getCurrentSession();
    const token = session ? session.access_token : null;

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP Error ${response.status}`);
    }
    return response.json();
}

function updateConnectionBadge() {
    const badge = document.getElementById("supabase-status-badge");
    const label = document.getElementById("supabase-status-label");
    if (badge && label) {
        badge.classList.add("connected");
        label.textContent = "API Server Connected";
    }
}
document.addEventListener("DOMContentLoaded", updateConnectionBadge);

// ----------------- PUBLIC API METHODS -----------------

function isUsingSupabase() {
    return true; // We are connecting to backend API which uses Supabase
}

// Polling for new violations (no WebSocket)
let violationPollingInterval = null;
let lastKnownViolationIds = new Set();

function startViolationPolling(callback, intervalMs = 10000) {
    if (violationPollingInterval) clearInterval(violationPollingInterval);

    violationPollingInterval = setInterval(async () => {
        try {
            const alerts = await fetchAlerts({ limit: 20 });
            const newAlerts = alerts.filter(a => !lastKnownViolationIds.has(a.id));
            if (newAlerts.length > 0) {
                newAlerts.forEach(alert => {
                    lastKnownViolationIds.add(alert.id);
                    if (callback) callback(alert);
                });
            }
        } catch (e) {
            console.error("Violation polling error:", e);
        }
    }, intervalMs);
}

function stopViolationPolling() {
    if (violationPollingInterval) {
        clearInterval(violationPollingInterval);
        violationPollingInterval = null;
    }
}

function subscribeToNewViolations(callback) {
    // Initialize with current alerts
    fetchAlerts({ limit: 20 }).then(alerts => {
        alerts.forEach(a => lastKnownViolationIds.add(a.id));
    }).catch(console.error);
    startViolationPolling(callback, 10000);
}

async function fetchCameras() {
    try {
        return await apiFetch("/cameras/active");
    } catch (e) {
        console.error("Fetch cameras error:", e);
        return [];
    }
}

async function fetchStats() {
    try {
        const data = await apiFetch("/stats");
        return {
            totalDetections: data.total || 0,
            totalViolations: (data.violation || 0) + (data.fall || 0),
            complianceRate: data.total > 0 ? Math.round((data.compliant / data.total) * 100) : 100,
            unresolvedViolations: (data.violation || 0) + (data.fall || 0),
            activeAlertsToday: data.today || 0,
            unresolvedToday: data.unresolved_today || 0
        };
    } catch (e) {
        console.error("Fetch stats error:", e);
        return { totalDetections: 0, totalViolations: 0, complianceRate: 100, unresolvedViolations: 0, activeAlertsToday: 0, unresolvedToday: 0 };
    }
}

async function fetchViolations({ type = "all", dateStart = "", dateEnd = "", sortBy = "created_at", sortOrder = "desc", page = 1, limit = 10, includeSnapshot = false } = {}) {
    try {
        let path = `/events?limit=200`;
        if (type !== "all") {
            if (type === "Compliant") path += "&event_type=compliant";
            else if (type === "Violations Only") path += "&event_type=violation";
            else if (type === "Fall-Detected") path += "&event_type=fall";
        }
        if (dateStart) path += `&date_start=${dateStart}`;
        if (dateEnd) path += `&date_end=${dateEnd}`;
        const events = await apiFetch(path);

        const alerts = await fetchAlerts({ limit: 200 });
        const alertMap = {};
        alerts.forEach(a => { alertMap[a.event_id] = a; });

        let mapped = events.map(e => {
            const alert = alertMap[e.id];
            const isCompliant = e.event_type === "compliant";
            const isFall = e.event_type === "fall";
            const isViolation = e.event_type === "violation";
            let status = "Compliant";
            if (!isCompliant) {
                status = (alert && alert.acknowledged) ? "Acknowledged" : "Active";
            }
            let label = e.label || (isCompliant ? "Compliant" : (isFall ? "Fall-Detected" : "PPE Violation"));
            if (isCompliant) label = "Compliant";
            return {
                id: e.id,
                created_at: e.detected_at || e.created_at || new Date().toISOString(),
                type: label,
                confidence: e.confidence || 0.92,
                status: status,
                is_compliant: isCompliant,
                snapshot: (includeSnapshot && isViolation) ? (e.snapshot || null) : null,
                camera_id: e.camera_id || null,
                camera_name: e.camera_name || null,
            };
        });

        if (sortBy === "created_at") {
            mapped.sort((a, b) => sortOrder === "desc" ? new Date(b.created_at) - new Date(a.created_at) : new Date(a.created_at) - new Date(b.created_at));
        }

        const startIndex = (page - 1) * limit;
        const paginatedData = mapped.slice(startIndex, startIndex + limit);

        return { data: paginatedData, totalCount: mapped.length };
    } catch (e) {
        console.error("Fetch violations error:", e);
        return { data: [], totalCount: 0 };
    }
}

async function addViolation(violationData) {
    try {
        const event_type = violationData.type === "Compliant" ? "compliant" : "violation";
        const response = await apiFetch("/events", {
            method: "POST",
            body: JSON.stringify({
                camera_id: null,
                event_type: event_type,
                snapshot: violationData.image_url ? violationData.image_url.replace(/^data:image\/[a-z]+;base64,/, "") : null,
                detections: (violationData.details?.items_found || []).map(item => ({
                    class_id: item.status === "violation" ? 10 : 11,
                    class_name: item.name,
                    confidence: item.confidence,
                    bbox: [0, 0, 100, 100],
                    is_violation: item.status === "violation"
                }))
            })
        });
        return {
            id: response.id,
            created_at: response.detected_at,
            ...violationData
        };
    } catch (error) {
        console.error("Add violation error:", error);
        return { id: Math.floor(Math.random() * 1000), ...violationData };
    }
}

async function updateViolationStatus(eventId, newStatus = "Acknowledged") {
    try {
        if (newStatus === "Acknowledged") {
            const alerts = await fetchAlerts({ limit: 50 });
            const alert = alerts.find(a => a.event_id === eventId);
            if (alert) {
                await acknowledgeAlert(alert.id);
            }
        }
        return { id: eventId, status: newStatus };
    } catch (e) {
        console.error("Update violation status error:", e);
        return { id: eventId, status: newStatus };
    }
}

// ----------------- ALERTS API METHODS -----------------

async function fetchAlerts({ limit = 50, acknowledged = null } = {}) {
    try {
        let path = `/alerts?limit=${limit}`;
        const alerts = await apiFetch(path);
        if (acknowledged !== null) {
            return alerts.filter(a => a.acknowledged === acknowledged);
        }
        return alerts;
    } catch (e) {
        console.error("Fetch alerts error:", e);
        return [];
    }
}

async function acknowledgeAlert(alertId) {
    try {
        const response = await apiFetch(`/alerts/${alertId}/ack`, { method: "PATCH" });
        return response;
    } catch (e) {
        console.error("Acknowledge alert error:", e);
        throw e;
    }
}

// ----------------- USER API METHODS -----------------

async function getUsers() {
    try {
        const me = await apiFetch("/auth/me");
        return [{ id: me.id, name: me.username, email: me.username, role: "Admin", status: "Active" }];
    } catch (e) {
        console.error("Get users error:", e);
        return [];
    }
}

// ----------------- ADVANCED REPORT STATISTICS METHODS -----------------

async function fetchReportingData() {
    try {
        const events = await apiFetch("/events?limit=500");
        const violationsByType = {};
        const violationsByCamera = {};

        events.forEach(e => {
            if (e.event_type === "compliant") return;
            const type = e.label || (e.event_type === "fall" ? "Fall" : "PPE Violation");
            violationsByType[type] = (violationsByType[type] || 0) + 1;
            const cam = e.camera_name || "Browser Webcam";
            violationsByCamera[cam] = (violationsByCamera[cam] || 0) + 1;
        });

        const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const dailyCounts = { compliant: Array(7).fill(0), violation: Array(7).fill(0), fall: Array(7).fill(0) };

        events.forEach(e => {
            const date = new Date(e.detected_at || e.created_at);
            const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
            if (e.event_type === "compliant") dailyCounts.compliant[dayIndex]++;
            else if (e.event_type === "violation") dailyCounts.violation[dayIndex]++;
            else if (e.event_type === "fall") dailyCounts.fall[dayIndex]++;
        });

        // Hourly trends (24h)
        const hourlyLabels = Array.from({length: 24}, (_, i) => `${i}:00`);
        const hourlyCounts = Array(24).fill(0);
        events.forEach(e => {
            const date = new Date(e.detected_at || e.created_at);
            const hour = date.getHours();
            if (hour >= 0 && hour < 24) hourlyCounts[hour]++;
        });

        // 30-day daily compliance trend
        const thirtyDayLabels = [];
        const thirtyDay = { compliant: [], violation: [], fall: [] };
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            thirtyDayLabels.push(dateStr.slice(5));
            thirtyDay.compliant.push(0);
            thirtyDay.violation.push(0);
            thirtyDay.fall.push(0);
        }
        events.forEach(e => {
            const dateStr = (e.detected_at || e.created_at || "").split('T')[0];
            const idx = thirtyDayLabels.indexOf(dateStr.slice(5));
            if (idx !== -1) {
                if (e.event_type === "compliant") thirtyDay.compliant[idx]++;
                else if (e.event_type === "violation") thirtyDay.violation[idx]++;
                else if (e.event_type === "fall") thirtyDay.fall[idx]++;
            }
        });

        return {
            types: {
                labels: Object.keys(violationsByType),
                counts: Object.values(violationsByType)
            },
            cameras: {
                labels: Object.keys(violationsByCamera),
                counts: Object.values(violationsByCamera)
            },
            trends: {
                labels: labels,
                helmet: dailyCounts.violation,
                vest: dailyCounts.violation,
                gloves: dailyCounts.violation,
                compliant: dailyCounts.compliant,
                violations: dailyCounts.violation,
                falls: dailyCounts.fall
            },
            hourly: {
                labels: hourlyLabels,
                counts: hourlyCounts
            },
            thirtyDay: {
                labels: thirtyDayLabels,
                compliant: thirtyDay.compliant,
                violation: thirtyDay.violation,
                fall: thirtyDay.fall
            }
        };
    } catch (e) {
        console.error("Fetch reporting data error:", e);
        return { types: { labels: [], counts: [] }, cameras: { labels: [], counts: [] }, trends: { labels: [], helmet: [], vest: [], gloves: [], compliant: [], violations: [], falls: [] }, hourly: { labels: [], counts: [] }, thirtyDay: { labels: [], compliant: [], violation: [], fall: [] } };
    }
}

async function fetchWeeklyTrends() {
    try {
        const events = await apiFetch("/events?limit=200");
        const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const compliant = Array(7).fill(0);
        const violations = Array(7).fill(0);

        events.forEach(e => {
            const date = new Date(e.detected_at || e.created_at);
            const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
            if (e.event_type === "compliant") {
                compliant[dayIndex]++;
            } else {
                violations[dayIndex]++;
            }
        });

        return { labels, compliant, violations };
    } catch (error) {
        console.error("Fetch weekly trends error:", error);
        return { labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], compliant: [], violations: [] };
    }
}

// ----------------- AUTHENTICATION API METHODS -----------------

async function signInUser(email, password) {
    const res = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
            username: email,
            password: password
        })
    });
    const session = {
        name: res.username,
        email: res.username,
        access_token: res.access_token,
    };
    localStorage.setItem("ppe_session", JSON.stringify(session));
    return res;
}

async function signOutUser() {
    stopViolationPolling();
    localStorage.removeItem("ppe_session");
}

function getCurrentSession() {
    try {
        const session = localStorage.getItem("ppe_session");
        return session ? JSON.parse(session) : null;
    } catch (e) {
        console.error("Error reading session:", e);
        return null;
    }
}

function setupSidebarProfile() {
    const session = getCurrentSession();
    if (!session) return;

    const avatarEl = document.getElementById("user-avatar");
    const nameEl = document.getElementById("user-display-name");
    const logoutBtn = document.getElementById("logout-btn");

    if (nameEl) nameEl.textContent = session.name || session.email;
    if (avatarEl) {
        const initials = (session.name || "??")
            .split(" ")
            .map(n => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
        avatarEl.textContent = initials || "??";
    }

    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            if (confirm("Are you sure you want to sign out of the system?")) {
                await signOutUser();
                window.location.href = "login.html";
            }
        };
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setupSidebarProfile();
});