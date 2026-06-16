// Data table manager for rendering cleaned datasets

let tableState = {
    currentPage: 1,
    pageSize: 10,
    sortColumn: 'Transaction_ID',
    sortOrder: 'asc',
    searchQuery: ''
};

let rawTableData = [];

/**
 * Initializes datatable entries
 */
export function initTable(data) {
    rawTableData = data || [];
    tableState.currentPage = 1;
    
    initTableListeners();
    renderTable();
}

/**
 * Registers events for searching and pagination
 */
function initTableListeners() {
    const searchInput = document.querySelector('#table-search-input');
    const btnPrev = document.querySelector('#btn-prev-page');
    const btnNext = document.querySelector('#btn-next-page');
    
    // Search input
    if (searchInput) {
        const newSearch = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearch, searchInput);
        
        let debounceTimer = null;
        newSearch.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                tableState.searchQuery = e.target.value.toLowerCase().trim();
                tableState.currentPage = 1;
                renderTable();
            }, 200);
        });
    }

    // Pagination
    if (btnPrev) {
        const newPrev = btnPrev.cloneNode(true);
        btnPrev.parentNode.replaceChild(newPrev, btnPrev);
        newPrev.addEventListener('click', () => {
            if (tableState.currentPage > 1) {
                tableState.currentPage--;
                renderTable();
            }
        });
    }

    if (btnNext) {
        const newNext = btnNext.cloneNode(true);
        btnNext.parentNode.replaceChild(newNext, btnNext);
        newNext.addEventListener('click', () => {
            const processed = getProcessedData();
            const maxPage = Math.ceil(processed.length / tableState.pageSize);
            if (tableState.currentPage < maxPage) {
                tableState.currentPage++;
                renderTable();
            }
        });
    }

    // Header Sort Clicks
    document.querySelectorAll('#records-table th').forEach(th => {
        const newTh = th.cloneNode(true);
        th.parentNode.replaceChild(newTh, th);
        
        newTh.addEventListener('click', () => {
            const col = newTh.dataset.column;
            if (!col) return;
            
            if (tableState.sortColumn === col) {
                tableState.sortOrder = tableState.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                tableState.sortColumn = col;
                tableState.sortOrder = 'asc';
            }
            
            // Adjust arrows
            document.querySelectorAll('#records-table th').forEach(header => {
                header.classList.remove('sort-asc', 'sort-desc');
            });
            newTh.classList.add(tableState.sortOrder === 'asc' ? 'sort-asc' : 'sort-desc');
            
            renderTable();
        });
    });
}

/**
 * Filter, sort, and slice list items
 */
function getProcessedData() {
    let result = [...rawTableData];

    // Filter
    if (tableState.searchQuery !== '') {
        result = result.filter(item => {
            const idStr = String(item.Transaction_ID || '').toLowerCase();
            const repStr = String(item.Sales_Rep || '').toLowerCase();
            const catStr = String(item.Category || '').toLowerCase();
            const prodStr = String(item.Product || '').toLowerCase();
            const dateStr = String(item.Date || '').toLowerCase();
            
            return idStr.includes(tableState.searchQuery) ||
                   repStr.includes(tableState.searchQuery) ||
                   catStr.includes(tableState.searchQuery) ||
                   prodStr.includes(tableState.searchQuery) ||
                   dateStr.includes(tableState.searchQuery);
        });
    }

    // Sort
    const col = tableState.sortColumn;
    const isAsc = tableState.sortOrder === 'asc' ? 1 : -1;

    result.sort((a, b) => {
        let valA = a[col];
        let valB = b[col];
        
        if (valA === undefined || valA === null) valA = '';
        if (valB === undefined || valB === null) valB = '';
        
        if (col === 'Date') {
            return (new Date(valA) - new Date(valB)) * isAsc;
        }
        
        if (typeof valA === 'string') {
            return valA.localeCompare(valB) * isAsc;
        }

        return (valA - valB) * isAsc;
    });

    return result;
}

/**
 * Re-renders rows
 */
function renderTable() {
    const tableBody = document.querySelector('#table-body');
    const tableInfo = document.querySelector('#table-info');
    const btnPrev = document.querySelector('#btn-prev-page');
    const btnNext = document.querySelector('#btn-next-page');

    if (!tableBody) return;
    tableBody.innerHTML = '';

    const processed = getProcessedData();
    const totalCount = processed.length;
    
    // Pagination slicing
    const startIndex = (tableState.currentPage - 1) * tableState.pageSize;
    const endIndex = Math.min(startIndex + tableState.pageSize, totalCount);
    const pageData = processed.slice(startIndex, endIndex);

    // Update labels
    if (tableInfo) {
        if (totalCount === 0) {
            tableInfo.textContent = "Showing 0 of 0 entries";
        } else {
            tableInfo.textContent = `Showing ${startIndex + 1} to ${endIndex} of ${totalCount} entries`;
        }
    }

    if (btnPrev) btnPrev.disabled = tableState.currentPage === 1;
    if (btnNext) btnNext.disabled = endIndex >= totalCount || totalCount === 0;

    if (pageData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching data records found.</td></tr>`;
        return;
    }

    pageData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Formatted cells
        const idVal = row.Transaction_ID || 'N/A';
        const dateVal = row.Date || 'NULL';
        const repVal = row.Sales_Rep || 'NULL';
        const catVal = row.Category || 'NULL';
        const prodVal = row.Product || 'NULL';
        const qtyVal = row.Quantity !== null && row.Quantity !== undefined ? row.Quantity : 'NULL';
        
        const priceVal = row.Unit_Price_INR !== null && row.Unit_Price_INR !== undefined 
            ? `₹${row.Unit_Price_INR.toLocaleString('en-IN')}` 
            : 'NULL';
            
        const revVal = row.Total_Revenue_INR !== null && row.Total_Revenue_INR !== undefined 
            ? `₹${row.Total_Revenue_INR.toLocaleString('en-IN')}` 
            : 'NULL';
            
        tr.innerHTML = `
            <td>${idVal}</td>
            <td style="color: ${dateVal === 'NULL' ? 'var(--accent-rose)' : 'var(--text-secondary)'}">${dateVal}</td>
            <td style="color: ${repVal === 'NULL' ? 'var(--accent-rose)' : 'var(--text-secondary)'}">${repVal}</td>
            <td style="color: ${catVal === 'NULL' ? 'var(--accent-rose)' : 'var(--text-secondary)'}">${catVal}</td>
            <td style="color: ${prodVal === 'NULL' ? 'var(--accent-rose)' : 'var(--text-secondary)'}">${prodVal}</td>
            <td style="text-align: right; color: ${qtyVal === 'NULL' ? 'var(--accent-rose)' : 'var(--text-primary)'}">${qtyVal}</td>
            <td style="text-align: right; color: ${priceVal === 'NULL' ? 'var(--accent-rose)' : 'var(--text-primary)'}">${priceVal}</td>
            <td style="text-align: right; font-weight: 500; color: ${revVal === 'NULL' ? 'var(--accent-rose)' : 'var(--accent-emerald)'}">${revVal}</td>
        `;
        tableBody.appendChild(tr);
    });
}
