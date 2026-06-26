// Pyodide WebAssembly Handler for Data-Cleaning-Automation
// Intercepts Flask API calls and routes them to an in-browser Python runtime

const originalFetch = window.fetch;
let pyodideInstance = null;
let pyodideReadyPromise = null;

// Initialize Pyodide runtime and load dependencies
async function initPyodide() {
    console.log("[Pyodide] Initializing WebAssembly Python environment...");
    
    // Load Pyodide
    let pyodide = await loadPyodide();
    
    // Load Pandas, Numpy, and Micropip
    console.log("[Pyodide] Loading Python packages (pandas, numpy)...");
    await pyodide.loadPackage(['pandas', 'numpy', 'micropip']);
    
    // Install openpyxl via micropip
    console.log("[Pyodide] Installing openpyxl for Excel generation...");
    const micropip = pyodide.pyimport("micropip");
    await micropip.install("openpyxl");
    
    // Setup Virtual File System structure
    pyodide.FS.mkdir('data');
    
    // Download and write the data cleaning engine
    console.log("[Pyodide] Fetching cleaning_engine.py...");
    let engineRes = await originalFetch('cleaning_engine.py');
    let engineCode = await engineRes.text();
    pyodide.FS.writeFile('cleaning_engine.py', engineCode);
    
    // Download and write the default dirty dataset
    console.log("[Pyodide] Fetching default dirty_dataset.csv...");
    let dirtyRes = await originalFetch('data/dirty_dataset.csv');
    let dirtyData = await dirtyRes.text();
    pyodide.FS.writeFile('data/dirty_dataset.csv', dirtyData);
    
    console.log("[Pyodide] Runtime environment is fully ready.");
    pyodideInstance = pyodide;
    return pyodide;
}

// Start loading Pyodide immediately
pyodideReadyPromise = initPyodide();

// Intercept window.fetch to mock backend API endpoints
window.fetch = async function(url, options) {
    const urlStr = typeof url === 'string' ? url : url.url;
    
    // Match API routes
    if (urlStr.includes('/api/clean')) {
        console.log("[Pyodide Intercept] POST /api/clean");
        const pyodide = await pyodideReadyPromise;
        const body = JSON.parse(options.body);
        
        const result = await runCleaningInPyodide(
            pyodide,
            body.impute_numeric || 'median',
            body.impute_categorical || 'mode',
            body.text_case || 'title',
            body.outlier_threshold !== undefined ? body.outlier_threshold : 1.5
        );
        
        return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
        
    } else if (urlStr.includes('/api/upload')) {
        console.log("[Pyodide Intercept] POST /api/upload");
        const pyodide = await pyodideReadyPromise;
        
        // Handle multipart form data manually in JS
        const formData = options.body; // FormData object
        const file = formData.get('file');
        const fileContent = await file.text();
        const filename = file.name;
        
        // Write the uploaded file to Pyodide
        pyodide.FS.writeFile('data/uploaded_dataset.csv', fileContent);
        pyodide.FS.writeFile('data/active_dataset_path.txt', 'data/uploaded_dataset.csv');
        
        // Extract cleaning params from FormData if present, else default
        const imputeNumeric = formData.get('impute_numeric') || 'median';
        const imputeCategorical = formData.get('impute_categorical') || 'mode';
        const textCase = formData.get('text_case') || 'title';
        const outlierThreshold = parseFloat(formData.get('outlier_threshold') || '1.5');
        
        const result = await runCleaningInPyodide(
            pyodide,
            imputeNumeric,
            imputeCategorical,
            textCase,
            outlierThreshold
        );
        
        result.dataset_info = {
            name: filename,
            is_default: false
        };
        
        return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
        
    } else if (urlStr.includes('/api/reset')) {
        console.log("[Pyodide Intercept] POST /api/reset");
        const pyodide = await pyodideReadyPromise;
        
        // Remove active dataset path file to reset to default
        try {
            if (pyodide.FS.analyzePath('data/active_dataset_path.txt').exists) {
                pyodide.FS.unlink('data/active_dataset_path.txt');
            }
        } catch(e) {}
        
        const result = await runCleaningInPyodide(pyodide, 'median', 'mode', 'title', 1.5);
        result.dataset_info = {
            name: 'dirty_dataset.csv',
            is_default: true
        };
        
        return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
        
    } else if (urlStr.includes('/api/download')) {
        console.log("[Pyodide Intercept] GET /api/download");
        const pyodide = await pyodideReadyPromise;
        
        // Extract query params from URL
        const parsedUrl = new URL(urlStr, window.location.origin);
        const imputeNumeric = parsedUrl.searchParams.get('impute_numeric') || 'median';
        const imputeCategorical = parsedUrl.searchParams.get('impute_categorical') || 'mode';
        const textCase = parsedUrl.searchParams.get('text_case') || 'title';
        const outlierThreshold = parseFloat(parsedUrl.searchParams.get('outlier_threshold') || '1.5');
        
        const xlsxBytes = await generateExcelReportInPyodide(
            pyodide,
            imputeNumeric,
            imputeCategorical,
            textCase,
            outlierThreshold
        );
        
        return new Response(xlsxBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename="data_cleaning_audit_report.xlsx"'
            }
        });
    }
    
    // For anything else, fall back to the original fetch
    return originalFetch(url, options);
};

// Runner helper for clean_dataset
async function runCleaningInPyodide(pyodide, imputeNumeric, imputeCategorical, textCase, outlierThreshold) {
    const pyCode = `
import json
import os
from cleaning_engine import clean_dataset

def get_active_filepath():
    if os.path.exists('data/active_dataset_path.txt'):
        with open('data/active_dataset_path.txt', 'r') as f:
            path = f.read().strip()
            if os.path.exists(path):
                return path
    return 'data/dirty_dataset.csv'

filepath = get_active_filepath()
res = clean_dataset(
    filepath=filepath,
    impute_numeric='${imputeNumeric}',
    impute_categorical='${imputeCategorical}',
    text_case='${textCase}',
    outlier_threshold=${outlierThreshold}
)
# Serialize results
json.dumps({
    "stats": res["stats"],
    "audit_logs": res["audit_logs"],
    "cleaned_data": res["cleaned_data"],
    "original_data_preview": res["original_data_preview"]
})
`;
    const resultStr = await pyodide.runPythonAsync(pyCode);
    return JSON.parse(resultStr);
}

// Runner helper for generate_excel_report
async function generateExcelReportInPyodide(pyodide, imputeNumeric, imputeCategorical, textCase, outlierThreshold) {
    const pyCode = `
import os
from cleaning_engine import clean_dataset, generate_excel_report

def get_active_filepath():
    if os.path.exists('data/active_dataset_path.txt'):
        with open('data/active_dataset_path.txt', 'r') as f:
            path = f.read().strip()
            if os.path.exists(path):
                return path
    return 'data/dirty_dataset.csv'

filepath = get_active_filepath()
res = clean_dataset(
    filepath=filepath,
    impute_numeric='${imputeNumeric}',
    impute_categorical='${imputeCategorical}',
    text_case='${textCase}',
    outlier_threshold=${outlierThreshold}
)

output_xlsx = 'data/data_cleaning_audit_report.xlsx'
generate_excel_report(
    cleaned_data_filepath=res['cleaned_file_path'],
    stats=res['stats'],
    audit_logs=res['audit_logs'],
    output_filepath=output_xlsx
)
`;
    await pyodide.runPythonAsync(pyCode);
    const fileBytes = pyodide.FS.readFile('data/data_cleaning_audit_report.xlsx');
    return fileBytes;
}
