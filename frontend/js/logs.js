let currentPage = 1;
const limit = 10;
let sortBy = "created_at";
let sortOrder = "desc";

const filterType = document.getElementById("filter-type");
const filterDateStart = document.getElementById("filter-date-start");
const filterDateEnd = document.getElementById("filter-date-end");
const clearFiltersBtn = document.getElementById("clear-filters-btn");
const exportCsvBtn = document.getElementById("export-csv-btn");
const logsTbody = document.getElementById("logs-tbody");
const paginationInfo = document.getElementById("pagination-info");
const paginationControls = document.getElementById("pagination-controls");
const tableHeaders = document.querySelectorAll("#violations-log-table th.sortable");

function formatFullDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

async function loadEvents() {
    logsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem;"><div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><span class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></span><span>Loading...</span></div></td></tr>`;

    const type = filterType.value;
    const dateStart = filterDateStart.value;
    const dateEnd = filterDateEnd.value;

    const { data: logs, totalCount } = await fetchViolations({ type, dateStart, dateEnd, sortBy, sortOrder, page: currentPage, limit, includeSnapshot: true });

    if (!logs || logs.length === 0) {
        logsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 4rem;"><div style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem;"><i data-lucide="folder-open" style="width: 40px; height: 40px; color: var(--text-muted);"></i><span style="font-weight: 500; font-size: 1rem;">No matching events found</span></div></td></tr>`;
        paginationInfo.textContent = "Showing 0 to 0 of 0 entries";
        paginationControls.innerHTML = "";
        lucide.createIcons();
        return;
    }

    logsTbody.innerHTML = "";

    logs.forEach(log => {
        const tr = document.createElement("tr");
        const dateCell = document.createElement("td");
        dateCell.textContent = formatFullDateTime(log.created_at);
        dateCell.style.whiteSpace = "nowrap";

        const typeCell = document.createElement("td");
        let badgeClass = "status-violation";
        let iconName = "alert-octagon";
        let label = log.type;
        if (log.type === "Compliant") {
            badgeClass = "status-compliant";
            iconName = "shield-check";
        } else if (log.type === "Fall-Detected") {
            iconName = "user-minus";
        }
        typeCell.innerHTML = `<span class="status-badge ${badgeClass}"><i data-lucide="${iconName}" style="width: 14px; height: 14px;"></i> ${label}</span>`;

        const camCell = document.createElement("td");
        camCell.textContent = log.camera_name || "Browser Webcam";
        camCell.style.fontSize = "0.85rem";
        camCell.style.color = "var(--text-muted)";

        const confCell = document.createElement("td");
        confCell.textContent = `${Math.round(log.confidence * 100)}%`;
        confCell.style.fontWeight = "600";

        const statusCell = document.createElement("td");
        if (log.type === "Compliant") {
            statusCell.innerHTML = `<span class="status-badge status-compliant" style="opacity: 0.7;"><i data-lucide="check" style="width: 12px; height: 12px;"></i> OK</span>`;
        } else if (log.status === "Unresolved" || log.status === "Active") {
            statusCell.innerHTML = `<span class="status-badge status-violation"><i data-lucide="x-circle" style="width: 14px; height: 14px;"></i> Active</span>`;
        } else {
            statusCell.innerHTML = `<span class="status-badge status-compliant"><i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> Acknowledged</span>`;
        }

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

        if (log.type !== "Compliant" && (log.status === "Unresolved" || log.status === "Active")) {
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
    renderPagination(totalCount);
    lucide.createIcons();
}

function renderPagination(totalCount) {
    paginationControls.innerHTML = "";
    const totalPages = Math.ceil(totalCount / limit);
    if (totalPages <= 1) return;

    const prevBtn = document.createElement("button");
    prevBtn.className = "pagination-btn";
    prevBtn.innerHTML = `<i data-lucide="chevron-left" style="width: 14px; height: 14px; display: block;"></i>`;
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => { if (currentPage > 1) { currentPage--; loadEvents(); } };
    paginationControls.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            const pageBtn = document.createElement("button");
            pageBtn.className = `pagination-btn ${currentPage === i ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.onclick = () => { if (currentPage !== i) { currentPage = i; loadEvents(); } };
            paginationControls.appendChild(pageBtn);
        } else if (i === currentPage - 2 || i === currentPage + 2) {
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
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => { if (currentPage < totalPages) { currentPage++; loadEvents(); } };
    paginationControls.appendChild(nextBtn);
    lucide.createIcons();
}

tableHeaders.forEach(th => {
    th.addEventListener("click", () => {
        const column = th.getAttribute("data-column");
        tableHeaders.forEach(h => { if (h !== th) h.classList.remove("sort-asc", "sort-desc"); });
        if (sortBy === column) {
            sortOrder = sortOrder === "asc" ? "desc" : "asc";
            th.classList.toggle("sort-asc", sortOrder === "asc");
            th.classList.toggle("sort-desc", sortOrder === "desc");
        } else {
            sortBy = column;
            sortOrder = "desc";
            th.classList.add("sort-desc");
            th.classList.remove("sort-asc");
        }
        currentPage = 1;
        loadEvents();
    });
});

[filterType, filterDateStart, filterDateEnd].forEach(el => {
    if (el) el.addEventListener("change", () => { currentPage = 1; loadEvents(); });
});

clearFiltersBtn.addEventListener("click", () => {
    filterType.value = "all";
    if (filterDateStart) filterDateStart.value = "";
    if (filterDateEnd) filterDateEnd.value = "";
    currentPage = 1;
    loadEvents();
});

exportCsvBtn.addEventListener("click", async () => {
    exportCsvBtn.disabled = true;
    const originalText = exportCsvBtn.innerHTML;
    exportCsvBtn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px; margin-right: 0.5rem; display: inline-block; vertical-align: middle;"></span> Exporting...`;

    const type = filterType.value;
    const dateStart = filterDateStart.value;
    const dateEnd = filterDateEnd.value;

    const { data: allLogs } = await fetchViolations({ type, dateStart, dateEnd, sortBy, sortOrder, page: 1, limit: 1000 });

    if (!allLogs || allLogs.length === 0) {
        alert("No records found.");
        exportCsvBtn.disabled = false;
        exportCsvBtn.innerHTML = originalText;
        return;
    }

    const csvHeaders = ["Log ID", "Timestamp", "Event Type", "Camera", "Confidence", "Status"];
    const csvRows = [csvHeaders.join(",")];
    allLogs.forEach(row => {
        csvRows.push([row.id, new Date(row.created_at).toISOString(), `"${row.type}"`, row.camera_name || "Browser Webcam", `${Math.round(row.confidence * 100)}%`, row.status].join(","));
    });
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ppe_events_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    exportCsvBtn.disabled = false;
    exportCsvBtn.innerHTML = originalText;
});

document.addEventListener("DOMContentLoaded", loadEvents);
