let currentPage = 1;
const limit = 10;
const sort = { by: "created_at", order: "desc" };

const filterType = document.getElementById("filter-type");
const filterDateStart = document.getElementById("filter-date-start");
const filterDateEnd = document.getElementById("filter-date-end");
const clearFiltersBtn = document.getElementById("clear-filters-btn");
const exportCsvBtn = document.getElementById("export-csv-btn");
const logsTbody = document.getElementById("logs-tbody");
const paginationInfo = document.getElementById("pagination-info");
const paginationControls = document.getElementById("pagination-controls");
const tableHeaders = document.querySelectorAll("#violations-log-table th.sortable");

async function loadEvents() {
    logsTbody.innerHTML = spinnerRowHTML(6);

    const { data: logs, totalCount } = await fetchViolations({
        type: filterType.value, dateStart: filterDateStart.value, dateEnd: filterDateEnd.value,
        sortBy: sort.by, sortOrder: sort.order, page: currentPage, limit, includeSnapshot: true,
    });

    if (!logs || logs.length === 0) {
        logsTbody.innerHTML = emptyRowHTML(6, "folder-open", "No matching events found");
        paginationInfo.textContent = "Showing 0 to 0 of 0 entries";
        paginationControls.innerHTML = "";
        lucide.createIcons();
        return;
    }

    logsTbody.innerHTML = "";

    logs.forEach(log => {
        const tr = document.createElement("tr");
        const dateCell = document.createElement("td");
        dateCell.textContent = fmtDateTime(log.created_at);
        dateCell.style.whiteSpace = "nowrap";

        const typeCell = document.createElement("td");
        typeCell.innerHTML = typeBadgeHTML(log.type);

        const camCell = document.createElement("td");
        camCell.textContent = log.camera_name || "Browser Webcam";
        camCell.style.fontSize = "0.85rem";
        camCell.style.color = "var(--text-muted)";

        const confCell = document.createElement("td");
        confCell.textContent = `${Math.round(log.confidence * 100)}%`;
        confCell.style.fontWeight = "600";

        const statusCell = document.createElement("td");
        statusCell.innerHTML = statusBadgeHTML(log.type === "Compliant" ? "Compliant" : log.status);

        const actionCell = document.createElement("td");
        const actionsDiv = document.createElement("div");
        actionsDiv.style.cssText = "display:flex;gap:0.4rem;align-items:center;";

        if (log.snapshot) {
            const viewBtn = document.createElement("button");
            viewBtn.className = "btn btn-outline";
            viewBtn.style.padding = "0.3rem 0.5rem";
            viewBtn.style.fontSize = "0.75rem";
            viewBtn.innerHTML = `<i data-lucide="image" style="width: 12px; height: 12px;"></i> Photo`;
            viewBtn.onclick = () => {
                const overlay = document.createElement("div");
                overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:10000;cursor:zoom-out;";
                overlay.innerHTML = `<img src="data:image/jpeg;base64,${log.snapshot}" style="max-width:90%;max-height:90%;object-fit:contain;border-radius:8px;">`;
                overlay.onclick = () => overlay.remove();
                document.body.appendChild(overlay);
            };
            actionsDiv.appendChild(viewBtn);
        }

        if (log.type !== "Compliant" && log.status !== "Acknowledged") {
            const ackBtn = document.createElement("button");
            ackBtn.className = "btn btn-outline";
            ackBtn.style.padding = "0.3rem 0.5rem";
            ackBtn.style.fontSize = "0.75rem";
            ackBtn.innerHTML = `<i data-lucide="check" style="width: 12px; height: 12px;"></i> Ack`;
            ackBtn.onclick = async () => {
                ackBtn.disabled = true;
                ackBtn.textContent = "...";
                try {
                    await updateViolationStatus(log.id, "Acknowledged");
                    loadEvents();
                } catch (e) {
                    ackBtn.disabled = false;
                    ackBtn.innerHTML = `<i data-lucide="check" style="width: 12px; height: 12px;"></i> Ack`;
                }
            };
            actionsDiv.appendChild(ackBtn);
        } else if (log.type !== "Compliant") {
            const doneSpan = document.createElement("span");
            doneSpan.style.cssText = "color:var(--text-muted);font-size:0.75rem;";
            doneSpan.textContent = "Done";
            actionsDiv.appendChild(doneSpan);
        }

        if (actionsDiv.children.length === 0) {
            actionCell.innerHTML = `<span style="color: var(--text-muted); font-size: 0.8rem;">—</span>`;
        } else {
            actionCell.appendChild(actionsDiv);
        }

        tr.appendChild(dateCell);
        tr.appendChild(typeCell);
        tr.appendChild(camCell);
        tr.appendChild(confCell);
        tr.appendChild(statusCell);
        tr.appendChild(actionCell);
        logsTbody.appendChild(tr);
    });

    const startEntry = (currentPage - 1) * limit + 1;
    const endEntry = Math.min(currentPage * limit, totalCount);
    paginationInfo.textContent = `Showing ${startEntry} to ${endEntry} of ${totalCount} entries`;
    renderPager(paginationControls, currentPage, totalCount, limit, p => { currentPage = p; loadEvents(); });
    lucide.createIcons();
}

bindSort(tableHeaders, sort, () => { currentPage = 1; loadEvents(); });

[filterType, filterDateStart, filterDateEnd].forEach(el => {
    if (el) el.addEventListener("change", () => { currentPage = 1; loadEvents(); });
});

clearFiltersBtn.addEventListener("click", () => {
    filterType.value = "Violations Only";
    if (filterDateStart) filterDateStart.value = "";
    if (filterDateEnd) filterDateEnd.value = "";
    currentPage = 1;
    loadEvents();
});

exportCsvBtn.addEventListener("click", async () => {
    exportCsvBtn.disabled = true;
    const originalText = exportCsvBtn.innerHTML;
    exportCsvBtn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px; margin-right: 0.5rem; display: inline-block; vertical-align: middle;"></span> Exporting...`;

    const { data: allLogs } = await fetchViolations({
        type: filterType.value, dateStart: filterDateStart.value, dateEnd: filterDateEnd.value,
        sortBy: sort.by, sortOrder: sort.order, page: 1, limit: 1000,
    });

    if (!allLogs || allLogs.length === 0) {
        alert("No records found.");
    } else {
        downloadCsv(`ppe_events_${new Date().toISOString().slice(0, 10)}.csv`,
            ["Log ID", "Timestamp", "Event Type", "Camera", "Confidence", "Status"],
            allLogs.map(row => [row.id, new Date(row.created_at).toISOString(), `"${row.type}"`, row.camera_name || "Browser Webcam", `${Math.round(row.confidence * 100)}%`, row.status]));
    }
    exportCsvBtn.disabled = false;
    exportCsvBtn.innerHTML = originalText;
});

document.addEventListener("DOMContentLoaded", loadEvents);
onAck(() => loadEvents());
