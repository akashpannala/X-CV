// Shared table helpers for logs/history pages.
// ponytail: page-specific row markup stays in callers; only identical logic lives here.
function fmtDateTime(ds) {
    return new Date(ds).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

function typeBadgeHTML(type) {
    const cls = type === "Compliant" ? "status-compliant" : "status-violation";
    const icon = type === "Compliant" ? "shield-check" : type === "Fall-Detected" ? "user-minus" : "alert-octagon";
    return `<span class="status-badge ${cls}"><i data-lucide="${icon}" style="width: 14px; height: 14px;"></i> ${type}</span>`;
}

function statusBadgeHTML(status) {
    if (status === "Acknowledged")
        return `<span class="status-badge status-compliant"><i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> Acknowledged</span>`;
    if (status === "Compliant")
        return `<span class="status-badge status-compliant" style="opacity: 0.7;"><i data-lucide="check" style="width: 12px; height: 12px;"></i> OK</span>`;
    return `<span class="status-badge status-violation"><i data-lucide="x-circle" style="width: 14px; height: 14px;"></i> Active</span>`;
}

function spinnerRowHTML(cols) {
    return `<tr><td colspan="${cols}" style="text-align: center; color: var(--text-muted); padding: 3rem;"><div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><span class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></span><span>Loading...</span></div></td></tr>`;
}

function emptyRowHTML(cols, icon, msg) {
    return `<tr><td colspan="${cols}" style="text-align: center; color: var(--text-muted); padding: 4rem;"><div style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem;"><i data-lucide="${icon}" style="width: 40px; height: 40px; color: var(--text-muted);"></i><span style="font-weight: 500; font-size: 1rem;">${msg}</span></div></td></tr>`;
}

function renderPager(el, page, totalCount, limit, go) {
    el.innerHTML = "";
    const totalPages = Math.ceil(totalCount / limit);
    if (totalPages <= 1) return;
    const navBtn = (icon, disabled, onclick) => {
        const b = document.createElement("button");
        b.className = "pagination-btn";
        b.innerHTML = `<i data-lucide="${icon}" style="width: 14px; height: 14px; display: block;"></i>`;
        b.disabled = disabled;
        b.onclick = onclick;
        el.appendChild(b);
    };
    navBtn("chevron-left", page === 1, () => { if (page > 1) go(page - 1); });
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
            const b = document.createElement("button");
            b.className = `pagination-btn ${page === i ? 'active' : ''}`;
            b.textContent = i;
            b.onclick = () => { if (page !== i) go(i); };
            el.appendChild(b);
        } else if (i === page - 2 || i === page + 2) {
            const dots = document.createElement("span");
            dots.textContent = "...";
            dots.style.padding = "0.25rem 0.5rem";
            dots.style.color = "var(--text-muted)";
            el.appendChild(dots);
        }
    }
    navBtn("chevron-right", page === totalPages, () => { if (page < totalPages) go(page + 1); });
    lucide.createIcons();
}

function bindSort(headers, state, onChange) {
    headers.forEach(th => th.addEventListener("click", () => {
        const column = th.getAttribute("data-column");
        headers.forEach(h => { if (h !== th) h.classList.remove("sort-asc", "sort-desc"); });
        if (state.by === column) {
            state.order = state.order === "asc" ? "desc" : "asc";
        } else {
            state.by = column;
            state.order = "desc";
        }
        th.classList.toggle("sort-asc", state.order === "asc");
        th.classList.toggle("sort-desc", state.order === "desc");
        onChange();
    }));
}

function downloadCsv(filename, headerRow, rows) {
    const csv = [headerRow.join(","), ...rows.map(r => r.join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
