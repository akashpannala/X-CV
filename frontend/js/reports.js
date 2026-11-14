let doughnutChart = null;
let dailyTrendChart = null;
let cameraChart = null;
let hourlyChart = null;
let thirtyDayChart = null;

function getKeyWithMaxValue(obj) {
    if (!obj || Object.keys(obj).length === 0) return "N/A";
    return Object.keys(obj).reduce((a, b) => obj[a] > obj[b] ? a : b);
}

async function initReports() {
    const data = await fetchReportingData();

    const totalViolationsCount = data.types.counts.reduce((a, b) => a + b, 0);
    const typeMap = {};
    data.types.labels.forEach((l, idx) => typeMap[l] = data.types.counts[idx]);

    document.getElementById("rep-total-violations").textContent = totalViolationsCount;
    document.getElementById("rep-top-type").textContent = getKeyWithMaxValue(typeMap);
    document.getElementById("rep-total-events").textContent = data.trends.compliant.reduce((a,b)=>a+b,0) + data.trends.violations.reduce((a,b)=>a+b,0) + data.trends.falls.reduce((a,b)=>a+b,0);

    if (typeof Chart === 'undefined') {
        document.querySelectorAll('.chart-container').forEach(el => {
            el.style.display = 'flex'; el.style.alignItems = 'center'; el.style.justifyContent = 'center';
            el.textContent = 'Chart library failed to load';
        });
        return;
    }

    const opts = (extra = {}) => ({
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#9ca3af', font: { family: "'Outfit', sans-serif" } } } },
        scales: {
            x: { grid: { color: 'rgba(46,59,78,0.3)' }, ticks: { color: '#9ca3af', font: { family: "'Outfit', sans-serif" } } },
            y: { beginAtZero: true, grid: { color: 'rgba(46,59,78,0.3)' }, ticks: { color: '#9ca3af', font: { family: "'Outfit', sans-serif" }, precision: 0 } }
        },
        ...extra
    });

    const colors = ['rgba(239,68,68,0.75)', 'rgba(245,158,11,0.75)', 'rgba(139,92,246,0.75)', 'rgba(236,72,153,0.75)', 'rgba(6,182,212,0.75)'];

    const ctx1 = document.getElementById("typeDistributionChart");
    if (ctx1) {
        if (doughnutChart) doughnutChart.destroy();
        doughnutChart = new Chart(ctx1, {
            type: 'doughnut',
            data: { labels: data.types.labels.length ? data.types.labels : ['None'], datasets: [{ data: data.types.counts.length ? data.types.counts : [1], backgroundColor: colors, borderColor: '#1f2a3f', borderWidth: 2 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#e5e7eb', font: { family: "'Outfit', sans-serif", size: 12 } } } } }
        });
    }

    const ctx2 = document.getElementById("dailyTrendChart");
    if (ctx2) {
        if (dailyTrendChart) dailyTrendChart.destroy();
        dailyTrendChart = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: data.trends.labels,
                datasets: [
                    { label: 'Compliant', data: data.trends.compliant, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#10b981' },
                    { label: 'Violations', data: data.trends.violations, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#ef4444' }
                ]
            },
            options: opts()
        });
    }

    const ctx3 = document.getElementById("cameraViolationsChart");
    if (ctx3) {
        if (cameraChart) cameraChart.destroy();
        cameraChart = new Chart(ctx3, {
            type: 'bar',
            data: {
                labels: data.cameras.labels.length ? data.cameras.labels : ['No Data'],
                datasets: [{ label: 'Events', data: data.cameras.counts.length ? data.cameras.counts : [0], backgroundColor: 'rgba(239,68,68,0.7)', borderColor: '#ef4444', borderWidth: 1, borderRadius: 4 }]
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: 'rgba(46,59,78,0.3)' }, ticks: { color: '#9ca3af', precision: 0 } }, y: { grid: { display: false }, ticks: { color: '#9ca3af' } } } }
        });
    }

    const ctx4 = document.getElementById("hourlyTrendChart");
    if (ctx4) {
        if (hourlyChart) hourlyChart.destroy();
        hourlyChart = new Chart(ctx4, {
            type: 'bar',
            data: {
                labels: data.hourly.labels.length ? data.hourly.labels : [''],
                datasets: [{ label: 'Events', data: data.hourly.counts.length ? data.hourly.counts : [0], backgroundColor: 'rgba(99,102,241,0.6)', borderColor: '#6366f1', borderWidth: 1, borderRadius: 2 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } }, y: { beginAtZero: true, grid: { color: 'rgba(46,59,78,0.3)' }, ticks: { color: '#9ca3af', precision: 0 } } } }
        });
    }

    const ctx5 = document.getElementById("thirtyDayChart");
    if (ctx5) {
        if (thirtyDayChart) thirtyDayChart.destroy();
        thirtyDayChart = new Chart(ctx5, {
            type: 'line',
            data: {
                labels: data.thirtyDay.labels,
                datasets: [
                    { label: 'Compliant', data: data.thirtyDay.compliant, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, tension: 0.3, fill: true, pointRadius: 2 },
                    { label: 'Violations', data: data.thirtyDay.violation, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, tension: 0.3, fill: true, pointRadius: 2 },
                    { label: 'Falls', data: data.thirtyDay.fall, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, tension: 0.3, fill: true, pointRadius: 2 }
                ]
            },
            options: opts({ plugins: { legend: { labels: { color: '#9ca3af', font: { family: "'Outfit', sans-serif", size: 10 } } } } })
        });
    }
}

document.getElementById("export-pdf-btn")?.addEventListener("click", () => window.print());

document.getElementById("export-data-btn")?.addEventListener("click", async () => {
    const data = await fetchReportingData();
    const rows = [["Metric", "Item", "Count"]];
    data.types.labels.forEach((l, idx) => rows.push(["Violation Type", `"${l}"`, data.types.counts[idx]]));
    data.cameras.labels.forEach((l, idx) => rows.push(["Camera", `"${l}"`, data.cameras.counts[idx]]));
    data.trends.labels.forEach((l, idx) => {
        rows.push(["Day - " + l, "Compliant", data.trends.compliant[idx]]);
        rows.push(["Day - " + l, "Violations", data.trends.violations[idx]]);
        rows.push(["Day - " + l, "Falls", data.trends.falls[idx]]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ppe_reports.csv";
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

document.addEventListener("DOMContentLoaded", initReports);
