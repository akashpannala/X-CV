let historyCurrentPage = 1;
const historyLimit = 20;
let historySortBy = "detected_at";
let historySortOrder = "desc";

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

function formatFullDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

async function loadHistory() {
    const date = historyDateInput.value;
    if (!date) return;

    historyTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem;"><div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><span class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></span><span>Loading...</span></div></td></tr>`;

    const { data: events, totalCount } = await fetchViolations({
        type: "all", dateStart: date, dateEnd: date,
        sortBy: historySortBy, sortOrder: historySortOrder,
        page: historyCurrentPage, limit: historyLimit
    });

    if (!events || events.length === 0) {
        historyTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 4rem;"><div style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem;"><i data-lucide="calendar-x" style="width: 40px; height: 40px; color: var(--text-muted);"></i><span style="font-weight: 500; font-size: 1rem;">No records for this date</span></div></td></tr>`;
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
        timeCell.textContent = formatFullDateTime(event.created_at);
        timeCell.style.whiteSpace = "nowrap";

        const typeCell = document.createElement("td");
        let badgeClass = "status-violation";
        let iconName = "alert-octagon";
        if (event.type === "Compliant") {
            badgeClass = "status-compliant";
            iconName = "shield-check";
        } else if (event.type === "Fall-Detected") {
            iconName = "user-minus";
        }
        const eventTypeDisplay = event.is_compliant ? "Compliant" : event.type;
        typeCell.innerHTML = `<span class="status-badge ${badgeClass}"><i data-lucide="${iconName}" style="width: 14px; height: 14px;"></i> ${eventTypeDisplay}</span>`;

        const camCell = document.createElement("td");
        camCell.textContent = event.camera_name || "Browser Webcam";
        camCell.style.fontSize = "0.85rem";
        camCell.style.color = "var(--text-muted)";

        const confCell = document.createElement("td");
        confCell.textContent = `${Math.round(event.confidence * 100)}%`;
        confCell.style.fontWeight = "600";

        const statusCell = document.createElement("td");
        if (event.type === "Compliant") {
            statusCell.innerHTML = `<span class="status-badge status-compliant" style="opacity: 0.7;"><i data-lucide="check" style="width: 12px; height: 12px;"></i> OK</span>`;
        } else if (event.status === "Acknowledged") {
            statusCell.innerHTML = `<span class="status-badge status-compliant"><i data-lucide="check-circle" style="width: 12px; height: 12px;"></i> Acknowledged</span>`;
        } else {
            statusCell.innerHTML = `<span class="status-badge status-violation"><i data-lucide="x-circle" style="width: 12px; height: 12px;"></i> Active</span>`;
        }

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
    renderHistoryPagination(totalCount);

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

function renderHistoryPagination(totalCount) {
    paginationControls.innerHTML = "";
    const totalPages = Math.ceil(totalCount / historyLimit);
    if (totalPages <= 1) return;

    const prevBtn = document.createElement("button");
    prevBtn.className = "pagination-btn";
    prevBtn.innerHTML = `<i data-lucide="chevron-left" style="width: 14px; height: 14px; display: block;"></i>`;
    prevBtn.disabled = historyCurrentPage === 1;
    prevBtn.onclick = () => { if (historyCurrentPage > 1) { historyCurrentPage--; loadHistory(); } };
    paginationControls.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= historyCurrentPage - 1 && i <= historyCurrentPage + 1)) {
            const pageBtn = document.createElement("button");
            pageBtn.className = `pagination-btn ${historyCurrentPage === i ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.onclick = () => { if (historyCurrentPage !== i) { historyCurrentPage = i; loadHistory(); } };
            paginationControls.appendChild(pageBtn);
        } else if (i === historyCurrentPage - 2 || i === historyCurrentPage + 2) {
            const dots = document.createElement("span");
            dots.textContent = "...";
            dots.style.padding = "0.25rem 0.5rem";
            dots.style.color = "var(--text-muted)";
            paginationControls.appendChild(dots);
        }
    }

    const nextBtn = document.createElement("button");
    nextBtn.className = "pagination-btn";
    nextBtn.innerHTML = `<i data-lucide="chevron-right" style="width: 14px; height: 14px; display: block;"></i>`;
    nextBtn.disabled = historyCurrentPage === totalPages;
    nextBtn.onclick = () => { if (historyCurrentPage < totalPages) { historyCurrentPage++; loadHistory(); } };
    paginationControls.appendChild(nextBtn);
    lucide.createIcons();
}

tableHeaders.forEach(th => {
    th.addEventListener("click", () => {
        const column = th.getAttribute("data-column");
        tableHeaders.forEach(h => { if (h !== th) h.classList.remove("sort-asc", "sort-desc"); });
        if (historySortBy === column) {
            historySortOrder = historySortOrder === "asc" ? "desc" : "asc";
            th.classList.toggle("sort-asc", historySortOrder === "asc");
            th.classList.toggle("sort-desc", historySortOrder === "desc");
        } else {
            historySortBy = column;
            historySortOrder = "desc";
            th.classList.add("sort-desc");
            th.classList.remove("sort-asc");
        }
        historyCurrentPage = 1;
        loadHistory();
    });
});

exportCsvBtn.addEventListener("click", async () => {
    const date = historyDateInput.value;
    if (!date) return;
    exportCsvBtn.disabled = true;
    const originalText = exportCsvBtn.innerHTML;
    exportCsvBtn.innerHTML = "Exporting...";
    try {
        const { data: allEvents } = await fetchViolations({ type: "all", dateStart: date, dateEnd: date, sortBy: historySortBy, sortOrder: historySortOrder, page: 1, limit: 1000 });
        if (!allEvents || allEvents.length === 0) { alert("No records found."); return; }
        const csvHeaders = ["Event ID", "Timestamp", "Event Type", "Camera", "Confidence", "Status"];
        const csvRows = [csvHeaders.join(",")];
        allEvents.forEach(row => {
            csvRows.push([row.id, new Date(row.created_at).toISOString(), `"${row.type}"`, row.camera_name || "Browser Webcam", `${Math.round(row.confidence * 100)}%`, row.status].join(","));
        });
        const csvContent = csvRows.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `ppe_history_${date}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
