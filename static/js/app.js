// Main App Orchestrator binding UI inputs, charts, tables, and API endpoints

import { initCharts, updateCharts } from './charts.js';
import { initTable } from './tables.js';

// Global state
let currentImputeNumeric = 'median';
let currentImputeCategorical = 'mode';
let currentTextCase = 'title';
let currentOutlierThreshold = 1.5;
let currentAuditLogs = [];
let currentLogFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize UI Controls and Chart templates
    initSliderListeners();
    initCharts();
    initUploadHandlers();
    initResetHandler();
    initExportHandler();
    initLogFilterListeners();

    // 2. Fetch Initial Cleaned data (loads default dirty_dataset.csv)
    fetchCleanedData();

    // 3. Form Submit Click
    const btnRun = document.querySelector('#btn-run-cleaning');
    if (btnRun) {
        btnRun.addEventListener('click', () => {
            currentImputeNumeric = document.querySelector('#impute-numeric').value;
            currentImputeCategorical = document.querySelector('#impute-categorical').value;
            currentTextCase = document.querySelector('#text-case').value;
            currentOutlierThreshold = parseFloat(document.querySelector('#outlier-threshold').value);
            
            fetchCleanedData();
        });
    }
});

/**
 * Binds outlier threshold slider to dynamically update label in UI
 */
function initSliderListeners() {
    const slider = document.querySelector('#outlier-threshold');
    const label = document.querySelector('#threshold-val');

    if (slider && label) {
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            label.textContent = val === 0 ? 'Disabled' : `${val}x`;
        });
    }
}

/**
 * Fetches cleaned data results from the API
 */
async function fetchCleanedData() {
    showLoading(true);
    try {
        const response = await fetch('/api/clean', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                impute_numeric: currentImputeNumeric,
                impute_categorical: currentImputeCategorical,
                text_case: currentTextCase,
                outlier_threshold: currentOutlierThreshold
            })
        });

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }

        renderDashboard(data);
    } catch (err) {
        console.error(err);
        alert(`Cleaning Automation Error: ${err.message}`);
    } finally {
        showLoading(false);
    }
}

/**
 * Renders KPIs, charts, audit log timelines, and datatable from response payload
 */
function renderDashboard(data) {
    // 1. Update KPI Cards
    const stats = data.stats || {};
    const rowsVal = document.querySelector('#kpi-val-rows');
    const dupsVal = document.querySelector('#kpi-val-duplicates');
    const nullsVal = document.querySelector('#kpi-val-nulls');
    const outliersVal = document.querySelector('#kpi-val-outliers');

    if (rowsVal) rowsVal.textContent = `${stats.rows_before} / ${stats.rows_after}`;
    if (dupsVal) dupsVal.textContent = stats.duplicates_removed.toLocaleString();
    if (nullsVal) nullsVal.textContent = stats.nulls_imputed.toLocaleString();
    if (outliersVal) outliersVal.textContent = stats.outliers_capped.toLocaleString();

    // 2. Render Charts (Donut)
    updateCharts(stats);

    // 3. Render Audit Log Timeline
    currentAuditLogs = data.audit_logs || [];
    renderAuditLogs();

    // 4. Render Table Preview
    initTable(data.cleaned_data || []);

    // 5. Update Dataset indicator pill in header
    const dbInfo = data.dataset_info || {};
    const pill = document.querySelector('#active-dataset-pill');
    const nameSpan = document.querySelector('#active-dataset-name');

    if (pill && nameSpan) {
        nameSpan.textContent = dbInfo.name || 'dirty_dataset.csv';
        pill.style.display = dbInfo.is_default ? 'none' : 'flex';
    }
}

/**
 * Renders the vertical corrections timeline based on the current active filter
 */
function renderAuditLogs() {
    const listContainer = document.querySelector('#audit-log-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    // Filter logs
    let filteredLogs = [...currentAuditLogs];
    if (currentLogFilter !== 'all') {
        filteredLogs = filteredLogs.filter(log => {
            const type = log.type.toLowerCase();
            if (currentLogFilter === 'duplicate') return type.includes('duplicate');
            if (currentLogFilter === 'null') return type.includes('null') || type.includes('impute');
            if (currentLogFilter === 'outlier') return type.includes('outlier');
            if (currentLogFilter === 'text') return type.includes('text') || type.includes('date') || type.includes('whitespace') || type.includes('format');
            return true;
        });
    }

    if (filteredLogs.length === 0) {
        listContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem; width: 100%;">No correction logs match this category.</p>';
        return;
    }

    // Render entries
    filteredLogs.forEach(log => {
        const item = document.createElement('div');
        
        // Match specific class prefix for bullets
        const type = log.type.toLowerCase();
        let classPrefix = 'log-text';
        if (type.includes('duplicate')) classPrefix = 'log-duplicate';
        else if (type.includes('null') || type.includes('impute')) classPrefix = 'log-null';
        else if (type.includes('outlier')) classPrefix = 'log-outlier';
        else if (type.includes('date')) classPrefix = 'log-date';
        
        item.className = `audit-log-item ${classPrefix}`;
        
        // Format values
        const origVal = log.original === null || log.original === 'nan' ? 'NULL' : log.original;
        const cleanVal = log.cleaned === null || log.cleaned === 'nan' ? 'NULL' : log.cleaned;
        
        item.innerHTML = `
            <div class="log-item-header">
                <span class="log-item-tag">${log.type}</span>
                <span class="log-item-meta">Row: ${log.row} · Col: ${log.column}</span>
            </div>
            <div class="log-item-body">${log.message}</div>
            <div class="log-item-diff">
                <span class="log-diff-orig">${origVal}</span>
                <span class="log-diff-arrow">&rarr;</span>
                <span class="log-diff-clean">${cleanVal}</span>
            </div>
        `;
        listContainer.appendChild(item);
    });
}

/**
 * Timeline category toggles listeners
 */
function initLogFilterListeners() {
    document.querySelectorAll('#log-toggles .log-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#log-toggles .log-toggle').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            currentLogFilter = e.target.dataset.filter;
            renderAuditLogs();
        });
    });
}

/**
 * Sets up file upload drag-and-drop or browsing handlers
 */
function initUploadHandlers() {
    const dropZone = document.querySelector('#drop-zone');
    const fileInput = document.querySelector('#file-input');

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });
}

/**
 * Uploads a custom file and executes cleaning
 */
async function handleFileUpload(file) {
    showLoading(true);
    
    currentImputeNumeric = document.querySelector('#impute-numeric').value;
    currentImputeCategorical = document.querySelector('#impute-categorical').value;
    currentTextCase = document.querySelector('#text-case').value;
    currentOutlierThreshold = parseFloat(document.querySelector('#outlier-threshold').value);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('impute_numeric', currentImputeNumeric);
    formData.append('impute_categorical', currentImputeCategorical);
    formData.append('text_case', currentTextCase);
    formData.append('outlier_threshold', currentOutlierThreshold);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }

        renderDashboard(data);
        alert(`🎉 Successfully uploaded and cleaned: ${file.name}`);
    } catch (err) {
        console.error(err);
        alert(`File Upload Error: ${err.message}`);
    } finally {
        showLoading(false);
    }
}

/**
 * Reset dataset back to default dirty dataset
 */
function initResetHandler() {
    const btnReset = document.querySelector('#btn-reset-dataset');
    if (!btnReset) return;

    btnReset.addEventListener('click', async () => {
        showLoading(true);
        try {
            const response = await fetch('/api/reset', { method: 'POST' });
            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }
            // Reset local controllers
            document.querySelector('#impute-numeric').value = 'median';
            document.querySelector('#impute-categorical').value = 'mode';
            document.querySelector('#text-case').value = 'title';
            document.querySelector('#outlier-threshold').value = 1.5;
            document.querySelector('#threshold-val').textContent = '1.5x';
            
            renderDashboard(data);
        } catch (err) {
            console.error(err);
            alert(`Reset Error: ${err.message}`);
        } finally {
            showLoading(false);
        }
    });
}

/**
 * Downloads the styled Excel audit report workbook
 */
function initExportHandler() {
    const btnExport = document.querySelector('#btn-download-report');
    if (!btnExport) return;

    btnExport.addEventListener('click', () => {
        currentImputeNumeric = document.querySelector('#impute-numeric').value;
        currentImputeCategorical = document.querySelector('#impute-categorical').value;
        currentTextCase = document.querySelector('#text-case').value;
        currentOutlierThreshold = parseFloat(document.querySelector('#outlier-threshold').value);

        const url = `/api/download?impute_numeric=${currentImputeNumeric}&impute_categorical=${currentImputeCategorical}&text_case=${currentTextCase}&outlier_threshold=${currentOutlierThreshold}`;
        window.location.href = url;
    });
}

/**
 * Toggle display on spinner screen
 */
function showLoading(show) {
    const overlay = document.querySelector('#loading-overlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
}
