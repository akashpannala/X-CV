let historyCurrentPage = 1;
const historyLimit = 20;
const historySort = { by: "detected_at", order: "desc" };

const historyDateInput = document.getElementById("history-date");
const loadHistoryBtn = document.getElementById("load-history-btn");
const exportCsvBtn = document.getElementById("export-history-csv");
const historyTbody = document.getElementById("history-tbody");
const paginationInfo = document.getElementById("history-pagination-info");
const paginationControls = document.getElementById("history-pagination-controls");
const tableHeaders = document.querySelectorAll("#history-table th.sortable");

const histTotal = document.getElementById("hist-total");
const histViolations = document.getElementById("hist-violations");
const histFalls = document.getElementById("hist-falls");
const histCompliant = document.getElementById("hist-compliant");

async function loadHistory() {
    const date = historyDateInput.value;
    if (!date) return;

    historyTbody.innerHTML = spinnerRowHTML(6);

    const { data: events, totalCount } = await fetchViolations({
        type: "all", dateStart: date, dateEnd: date,
        sortBy: historySort.by, sortOrder: historySort.order,
        page: historyCurrentPage, limit: historyLimit
    });

    if (!events || events.length === 0) {
        historyTbody.innerHTML = emptyRowHTML(6, "calendar-x", "No records for this date");
        paginationInfo.textContent = "Showing 0 to 0 of 0 entries";
        paginationControls.innerHTML = "";
        lucide.createIcons();
        updateSummary({ total: 0, violations: 0, falls: 0, compliant: 0 });
        document.getElementById("history-summary").style.display = "none";
        return;
    }

    historyTbody.innerHTML = "";

    events.forEach(event => {
        const tr = document.createElement("tr");

        const timeCell = document.createElement("td");
        timeCell.textContent = fmtDateTime(event.created_at);
        timeCell.style.whiteSpace = "nowrap";

        const typeCell = document.createElement("td");
        typeCell.innerHTML = typeBadgeHTML(event.is_compliant ? "Compliant" : event.type);

        const camCell = document.createElement("td");
        camCell.textContent = event.camera_name || "Browser Webcam";
        camCell.style.fontSize = "0.85rem";
        camCell.style.color = "var(--text-muted)";

        const confCell = document.createElement("td");
        confCell.textContent = `${Math.round(event.confidence * 100)}%`;
        confCell.style.fontWeight = "600";

        const statusCell = document.createElement("td");
        statusCell.innerHTML = statusBadgeHTML(event.type === "Compliant" ? "Compliant" : event.status);

        const actionCell = document.createElement("td");
        if (event.type !== "Compliant" && event.status !== "Acknowledged") {
            const ackBtn = document.createElement("button");
            ackBtn.className = "btn btn-outline";
            ackBtn.style.padding = "0.3rem 0.6rem";
            ackBtn.style.fontSize = "0.75rem";
            ackBtn.innerHTML = `<i data-lucide="check" style="width: 12px; height: 12px;"></i> Acknowledge`;
            ackBtn.onclick = async () => {
                ackBtn.disabled = true;
                ackBtn.innerHTML = `<span class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:middle;"></span>`;
                await updateViolationStatus(event.id, "Acknowledged");
                loadHistory();
            };
            actionCell.appendChild(ackBtn);
        } else {
            actionCell.innerHTML = `<span style="color: var(--text-muted); font-size: 0.8rem;">—</span>`;
        }

        tr.appendChild(timeCell);
        tr.appendChild(typeCell);
        tr.appendChild(camCell);
        tr.appendChild(confCell);
        tr.appendChild(statusCell);
        tr.appendChild(actionCell);
        historyTbody.appendChild(tr);
    });

    const startEntry = (historyCurrentPage - 1) * historyLimit + 1;
    const endEntry = Math.min(historyCurrentPage * historyLimit, totalCount);
    paginationInfo.textContent = `Showing ${startEntry} to ${endEntry} of ${totalCount} entries`;
    renderPager(paginationControls, historyCurrentPage, totalCount, historyLimit, p => { historyCurrentPage = p; loadHistory(); });

    const counts = events.reduce((acc, e) => {
        if (e.is_compliant) acc.compliant++;
        else if (e.type === "Fall-Detected") acc.falls++;
        else acc.violations++;
        acc.total++;
        return acc;
    }, { total: 0, violations: 0, falls: 0, compliant: 0 });
    updateSummary(counts);
    document.getElementById("history-summary").style.display = "grid";
    lucide.createIcons();
}

function updateSummary(counts) {
    histTotal.textContent = counts.total;
    histViolations.textContent = counts.violations;
    histFalls.textContent = counts.falls;
    histCompliant.textContent = counts.compliant;
}

bindSort(tableHeaders, historySort, () => { historyCurrentPage = 1; loadHistory(); });

exportCsvBtn.addEventListener("click", async () => {
    const date = historyDateInput.value;
    if (!date) return;
    exportCsvBtn.disabled = true;
    const originalText = exportCsvBtn.innerHTML;
    exportCsvBtn.innerHTML = "Exporting...";
    try {
        const { data: allEvents } = await fetchViolations({ type: "all", dateStart: date, dateEnd: date, sortBy: historySort.by, sortOrder: historySort.order, page: 1, limit: 1000 });
        if (!allEvents || allEvents.length === 0) { alert("No records found."); return; }
        downloadCsv(`ppe_history_${date}.csv`,
            ["Event ID", "Timestamp", "Event Type", "Camera", "Confidence", "Status"],
            allEvents.map(row => [row.id, new Date(row.created_at).toISOString(), `"${row.type}"`, row.camera_name || "Browser Webcam", `${Math.round(row.confidence * 100)}%`, row.status]));
    } catch (e) { console.error("Export failed:", e); alert("Export failed: " + e.message); }
    finally { exportCsvBtn.disabled = false; exportCsvBtn.innerHTML = originalText; }
});

document.addEventListener("DOMContentLoaded", async () => {
    lucide.createIcons();
    const today = new Date().toISOString().split('T')[0];
    historyDateInput.value = today;
    loadHistoryBtn.onclick = () => { historyCurrentPage = 1; loadHistory(); };
    loadHistory();
});
