// Pure JavaScript Data Cleaning Engine
// Replaces Pyodide/WebAssembly — runs instantly in-browser with no downloads
// Implements: CSV parsing, deduplication, null imputation, text normalization, outlier capping

// ─── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSV(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
    if (lines.length < 2) return [];

    // Handle quoted fields
    function splitCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"' && !inQuotes) { inQuotes = true; continue; }
            if (ch === '"' && inQuotes) { inQuotes = false; continue; }
            if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
            current += ch;
        }
        result.push(current.trim());
        return result;
    }

    const headers = splitCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const vals = splitCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => { row[h.trim()] = vals[idx] !== undefined ? vals[idx] : ''; });
        rows.push(row);
    }
    return rows;
}

// ─── Statistics Helpers ─────────────────────────────────────────────────────────

function median(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function mode(arr) {
    if (!arr.length) return '';
    const freq = {};
    arr.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
}

function stdDev(arr, avg) {
    if (arr.length < 2) return 0;
    const m = avg !== undefined ? avg : mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function iqr(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    return { q1, q3, iqr: q3 - q1 };
}

// ─── Column Type Detection ──────────────────────────────────────────────────────

function detectColumnTypes(rows, headers) {
    const types = {};
    headers.forEach(col => {
        const vals = rows.map(r => r[col]).filter(v => v !== '' && v !== null && v !== undefined && v !== 'None' && v !== 'nan');
        const numericVals = vals.filter(v => !isNaN(parseFloat(v)) && isFinite(v));
        types[col] = numericVals.length / Math.max(vals.length, 1) > 0.6 ? 'numeric' : 'categorical';
    });
    return types;
}

// ─── Text Case Normalization ────────────────────────────────────────────────────

function applyTextCase(str, textCase) {
    if (textCase === 'title') return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    if (textCase === 'upper') return str.toUpperCase();
    if (textCase === 'lower') return str.toLowerCase();
    return str;
}

// ─── Date Normalization ─────────────────────────────────────────────────────────

function normalizeDate(val) {
    if (!val || val.trim() === '') return null;
    const v = val.trim();

    // Already ISO: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    // YYYY/MM/DD
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(v)) return v.replace(/\//g, '-');
    // DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) { const [d,m,y] = v.split('/'); return `${y}-${m}-${d}`; }
    // DD-MM-YYYY
    if (/^\d{2}-\d{2}-\d{4}$/.test(v)) { const [d,m,y] = v.split('-'); return `${y}-${m}-${d}`; }
    // Month Day, Year  e.g. "January 13, 2025"
    const longDate = new Date(v);
    if (!isNaN(longDate)) {
        const y = longDate.getFullYear();
        const m = String(longDate.getMonth() + 1).padStart(2, '0');
        const d = String(longDate.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return v;
}

// ─── Core Cleaning Engine ───────────────────────────────────────────────────────

function cleanDataset(rawRows, opts) {
    const { imputeNumeric, imputeCategorical, textCase, outlierThreshold } = opts;
    const auditLogs = [];
    let rowIndex = 0;

    // Deep clone
    let rows = rawRows.map(r => ({ ...r }));
    const headers = Object.keys(rows[0] || {});
    const colTypes = detectColumnTypes(rows, headers);

    // ── 1. REMOVE EXACT DUPLICATES ──────────────────────────────────────────────
    const seen = new Set();
    const beforeDedupe = rows.length;
    rows = rows.filter((row, idx) => {
        const key = JSON.stringify(row);
        if (seen.has(key)) {
            auditLogs.push({ type: 'DUPLICATE_REMOVED', row: idx + 2, column: 'ALL', message: `Exact duplicate row detected and removed`, original: 'Duplicate', cleaned: 'Dropped' });
            return false;
        }
        seen.add(key);
        return true;
    });
    const duplicatesRemoved = beforeDedupe - rows.length;

    // ── 2. BUILD COLUMN STATS FOR IMPUTATION ────────────────────────────────────
    const colStats = {};
    headers.forEach(col => {
        if (colTypes[col] === 'numeric') {
            const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
            colStats[col] = { median: median(vals), mean: mean(vals), vals };
        } else {
            const vals = rows.map(r => r[col]).filter(v => v && v !== 'None' && v !== 'nan' && v.trim() !== '');
            colStats[col] = { mode: mode(vals) };
        }
    });

    // ── 3. NULL / MISSING VALUE IMPUTATION ──────────────────────────────────────
    let nullsImputed = 0;
    const rowsToDrop = new Set();

    rows.forEach((row, idx) => {
        headers.forEach(col => {
            const raw = row[col];
            const isEmpty = raw === '' || raw === null || raw === undefined || raw === 'None' || raw === 'nan';

            if (!isEmpty) return;

            if (colTypes[col] === 'numeric') {
                if (imputeNumeric === 'drop') {
                    rowsToDrop.add(idx);
                    return;
                }
                const fillVal = imputeNumeric === 'mean' ? colStats[col].mean : colStats[col].median;
                auditLogs.push({ type: 'NULL_IMPUTED', row: idx + 2, column: col, message: `Missing numeric value filled using ${imputeNumeric}`, original: null, cleaned: fillVal.toFixed(2) });
                row[col] = fillVal.toFixed(2);
                nullsImputed++;
            } else {
                if (imputeCategorical === 'drop') {
                    rowsToDrop.add(idx);
                    return;
                }
                const fillVal = imputeCategorical === 'unknown' ? 'Unknown' : (colStats[col].mode || 'Unknown');
                auditLogs.push({ type: 'NULL_IMPUTED', row: idx + 2, column: col, message: `Missing categorical value filled with ${imputeCategorical === 'unknown' ? '"Unknown"' : 'mode'}`, original: null, cleaned: fillVal });
                row[col] = fillVal;
                nullsImputed++;
            }
        });
    });

    if (rowsToDrop.size > 0) {
        rows = rows.filter((_, idx) => !rowsToDrop.has(idx));
        auditLogs.push({ type: 'NULL_ROW_DROPPED', row: 'Multiple', column: 'ALL', message: `${rowsToDrop.size} rows with missing values dropped`, original: `${rowsToDrop.size} rows`, cleaned: 'Dropped' });
    }

    // ── 4. TEXT WHITESPACE + CASE NORMALIZATION ─────────────────────────────────
    rows.forEach((row, idx) => {
        headers.forEach(col => {
            if (colTypes[col] === 'categorical') {
                const orig = row[col];
                if (!orig || orig === 'Unknown') return;
                const trimmed = orig.trim();
                const cased = textCase !== 'none' ? applyTextCase(trimmed, textCase) : trimmed;
                if (cased !== orig) {
                    auditLogs.push({ type: 'TEXT_NORMALIZED', row: idx + 2, column: col, message: `Whitespace/case corrected (${textCase})`, original: orig, cleaned: cased });
                    row[col] = cased;
                }
            }
        });
    });

    // ── 5. DATE COLUMN NORMALIZATION ────────────────────────────────────────────
    const dateColumns = headers.filter(col => col.toLowerCase().includes('date') || col.toLowerCase().includes('time'));
    dateColumns.forEach(col => {
        rows.forEach((row, idx) => {
            const orig = row[col];
            const normalized = normalizeDate(orig);
            if (normalized && normalized !== orig) {
                auditLogs.push({ type: 'DATE_NORMALIZED', row: idx + 2, column: col, message: `Date standardized to ISO format YYYY-MM-DD`, original: orig, cleaned: normalized });
                row[col] = normalized;
            }
        });
    });

    // ── 6. OUTLIER CAPPING (IQR) ────────────────────────────────────────────────
    let outliersCapped = 0;
    if (outlierThreshold > 0) {
        headers.forEach(col => {
            if (colTypes[col] !== 'numeric') return;
            const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
            if (vals.length < 4) return;
            const { q1, q3, iqr: iqrVal } = iqr(vals);
            const lower = q1 - outlierThreshold * iqrVal;
            const upper = q3 + outlierThreshold * iqrVal;

            rows.forEach((row, idx) => {
                const v = parseFloat(row[col]);
                if (isNaN(v)) return;
                if (v < lower) {
                    auditLogs.push({ type: 'OUTLIER_CAPPED', row: idx + 2, column: col, message: `Low outlier capped at IQR lower fence (${outlierThreshold}x)`, original: v.toString(), cleaned: lower.toFixed(2) });
                    row[col] = lower.toFixed(2);
                    outliersCapped++;
                } else if (v > upper) {
                    auditLogs.push({ type: 'OUTLIER_CAPPED', row: idx + 2, column: col, message: `High outlier capped at IQR upper fence (${outlierThreshold}x)`, original: v.toString(), cleaned: upper.toFixed(2) });
                    row[col] = upper.toFixed(2);
                    outliersCapped++;
                }
            });
        });
    }

    // ── 7. COMPUTE QUALITY SCORE ────────────────────────────────────────────────
    const totalCells = rawRows.length * headers.length;
    const issuesFound = duplicatesRemoved + nullsImputed + outliersCapped;
    const qualityScore = Math.max(0, Math.round(100 - (issuesFound / Math.max(totalCells, 1)) * 100));

    return {
        stats: {
            rows_before: rawRows.length,
            rows_after: rows.length,
            duplicates_removed: duplicatesRemoved,
            nulls_imputed: nullsImputed,
            outliers_capped: outliersCapped,
            quality_score: qualityScore,
            columns: headers.length
        },
        audit_logs: auditLogs,
        cleaned_data: rows,
        original_data_preview: rawRows.slice(0, 10)
    };
}

// ─── Default Dataset (embedded so no fetch needed on first load) ────────────────

const DEFAULT_CSV = `Transaction_ID,Date,Sales_Rep,Category,Product,Quantity,Unit_Price_INR,Total_Revenue_INR
10000,"January 13, 2025",Deepa,Office Supplies,Metal Organizer,8.0,1200.0,9600.0
10001,01-05-2025,Ravi,electronics,None,4.0,3500.0,14000.0
10002,08/04/2025,Arun  ,  Furniture  ,None,5000.0,32000.0,160000000.0
10003,25/05/2025,  Ravi,Furniture,Standing Desk,5.0,24000.0,120000.0
10004,11-05-2025,Deepa,electronics,Smart Phone X,,45000.0,
10005,28/04/2025,  Ravi,electronics,Laptop Pro,10.0,85000.0,850000.0
10006,2025-01-18,kiran,Furniture,None,7.0,32000.0,224000.0
10007,"January 29, 2025",Arun  ,electronics,Smart Phone X,7.0,999999.0,6999993.0
10008,03-03-2025,Deepa,electronics,Laptop Pro,6.0,,
10009,2025-05-13,PRIYA,electronics,Laptop Pro,4.0,,
10010,"April 28, 2025",Arun  ,OFFICE SUPPLIES,Whiteboard 4x3,3.0,4500.0,13500.0
10011,2025-04-23,kiran,Electronics,Wireless Buds,8.0,3500.0,28000.0
10012,2025/02/06,PRIYA,,Wireless Buds,10.0,3500.0,35000.0
10013,2025/05/01,,Furniture,Standing Desk,3.0,24000.0,72000.0
10014,2025-03-08,Deepa,Furniture,Ergonomic Chair,2.0,18000.0,36000.0
10015,2025-04-14,kiran,Office Supplies,Sticky Notes,20.0,150.0,3000.0
10016,2025-01-22,  Ravi,electronics,Wireless Buds,12.0,3500.0,42000.0
10017,09/02/2025,PRIYA,Office Supplies,Whiteboard 4x3,4.0,4500.0,18000.0
10018,2025-05-18,Deepa,Electronics,Smart Phone X,3.0,45000.0,135000.0
10019,2025-03-12,Arun  ,electronics,Laptop Pro,2.0,85000.0,170000.0
10020,25/01/2025,kiran,Furniture,None,1.0,32000.0,32000.0
10021,2025-04-28,  Ravi,Office Supplies,Metal Organizer,15.0,1200.0,18000.0
10022,2025-02-14,PRIYA,Electronics,Smart Phone X,5.0,45000.0,225000.0
10023,2025-05-05,Deepa,Furniture,Ergonomic Chair,3.0,18000.0,54000.0
10024,2025-01-30,kiran,electronics,Wireless Buds,6.0,3500.0,21000.0
10025,2025-03-22,Arun  ,Office Supplies,Sticky Notes,30.0,150.0,4500.0
10026,2025-04-10,  Ravi,Electronics,Laptop Pro,1.0,85000.0,85000.0
10027,2025-02-20,PRIYA,Furniture,Standing Desk,2.0,24000.0,48000.0
10028,2025-05-25,Deepa,electronics,Metal Organizer,10.0,1200.0,12000.0
10029,2025-03-15,kiran,Office Supplies,Whiteboard 4x3,5.0,4500.0,22500.0
10001,01-05-2025,Ravi,electronics,None,4.0,3500.0,14000.0`;

// ─── State ──────────────────────────────────────────────────────────────────────

let activeCSVText = DEFAULT_CSV;
let activeDatasetName = 'dirty_dataset.csv';
let isDefaultDataset = true;

// ─── API Intercept Layer ────────────────────────────────────────────────────────

const _originalFetch = window.fetch.bind(window);

window.fetch = async function(url, options = {}) {
    const urlStr = typeof url === 'string' ? url : (url && url.url ? url.url : String(url));

    // ── POST /api/clean ──────────────────────────────────────────────────────────
    if (urlStr.includes('/api/clean')) {
        const body = options.body ? JSON.parse(options.body) : {};
        const result = runCleaning(body);
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // ── POST /api/upload ─────────────────────────────────────────────────────────
    if (urlStr.includes('/api/upload')) {
        const formData = options.body;
        const file = formData.get('file');
        activeCSVText = await file.text();
        activeDatasetName = file.name;
        isDefaultDataset = false;

        const body = {
            impute_numeric: formData.get('impute_numeric') || 'median',
            impute_categorical: formData.get('impute_categorical') || 'mode',
            text_case: formData.get('text_case') || 'title',
            outlier_threshold: parseFloat(formData.get('outlier_threshold') || '1.5')
        };
        const result = runCleaning(body);
        result.dataset_info = { name: activeDatasetName, is_default: false };
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // ── POST /api/reset ──────────────────────────────────────────────────────────
    if (urlStr.includes('/api/reset')) {
        activeCSVText = DEFAULT_CSV;
        activeDatasetName = 'dirty_dataset.csv';
        isDefaultDataset = true;
        const result = runCleaning({ impute_numeric: 'median', impute_categorical: 'mode', text_case: 'title', outlier_threshold: 1.5 });
        result.dataset_info = { name: 'dirty_dataset.csv', is_default: true };
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // ── GET /api/download ────────────────────────────────────────────────────────
    if (urlStr.includes('/api/download')) {
        const params = new URL(urlStr, window.location.origin).searchParams;
        const body = {
            impute_numeric: params.get('impute_numeric') || 'median',
            impute_categorical: params.get('impute_categorical') || 'mode',
            text_case: params.get('text_case') || 'title',
            outlier_threshold: parseFloat(params.get('outlier_threshold') || '1.5')
        };
        const result = runCleaning(body);
        const csvContent = generateCSVExport(result.cleaned_data);

        // Download CSV (Excel XLSX needs a library — CSV opens fine in Excel)
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'data_cleaning_audit_report.csv';
        link.click();

        // Return a dummy response so the caller doesn't error
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return _originalFetch(url, options);
};

// ─── Helper: run cleaning against active CSV ────────────────────────────────────

function runCleaning(body) {
    const { impute_numeric = 'median', impute_categorical = 'mode', text_case = 'title', outlier_threshold = 1.5 } = body;
    const rawRows = parseCSV(activeCSVText);
    const result = cleanDataset(rawRows, {
        imputeNumeric: impute_numeric,
        imputeCategorical: impute_categorical,
        textCase: text_case,
        outlierThreshold: parseFloat(outlier_threshold)
    });
    result.dataset_info = { name: activeDatasetName, is_default: isDefaultDataset };
    return result;
}

// ─── Helper: export CSV string ──────────────────────────────────────────────────

function generateCSVExport(rows) {
    if (!rows || !rows.length) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];
    rows.forEach(row => {
        lines.push(headers.map(h => {
            const v = row[h] === null || row[h] === undefined ? '' : String(row[h]);
            return v.includes(',') ? `"${v}"` : v;
        }).join(','));
    });
    return lines.join('\n');
}
