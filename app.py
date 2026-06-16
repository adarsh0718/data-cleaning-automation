import os
from flask import Flask, request, jsonify, render_template, send_file
import pandas as pd
from cleaning_engine import clean_dataset, generate_excel_report

app = Flask(__name__, template_folder='templates', static_folder='static')

UPLOAD_FOLDER = 'data'
DEFAULT_DATA_PATH = os.path.join('data', 'dirty_dataset.csv')
ACTIVE_DATA_PATH_FILE = os.path.join('data', 'active_dataset_path.txt')

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Helper to get active dataset filepath
def get_active_filepath():
    if os.path.exists(ACTIVE_DATA_PATH_FILE):
        with open(ACTIVE_DATA_PATH_FILE, 'r') as f:
            path = f.read().strip()
            if os.path.exists(path):
                return path
    return DEFAULT_DATA_PATH

# Helper to set active dataset filepath
def set_active_filepath(path):
    with open(ACTIVE_DATA_PATH_FILE, 'w') as f:
        f.write(path)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/clean', methods=['GET', 'POST'])
def run_cleaning():
    try:
        if request.method == 'POST':
            params = request.get_json() or {}
        else:
            params = request.args or {}
            
        impute_numeric = params.get('impute_numeric', 'median')
        impute_categorical = params.get('impute_categorical', 'mode')
        text_case = params.get('text_case', 'title')
        outlier_threshold = float(params.get('outlier_threshold', 1.5))
        
        filepath = get_active_filepath()
        
        results = clean_dataset(
            filepath=filepath,
            impute_numeric=impute_numeric,
            impute_categorical=impute_categorical,
            text_case=text_case,
            outlier_threshold=outlier_threshold
        )
        
        is_default = (filepath == DEFAULT_DATA_PATH)
        results['dataset_info'] = {
            "name": os.path.basename(filepath),
            "is_default": is_default
        }
        
        return jsonify(results)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file in request"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
        
    if file:
        filename = file.filename.lower()
        if not (filename.endswith('.csv') or filename.endswith('.xlsx') or filename.endswith('.xls')):
            return jsonify({"error": "Unsupported file format. Please upload CSV or Excel."}), 400
            
        save_path = os.path.join(UPLOAD_FOLDER, 'uploaded_dataset.csv')
        
        try:
            if filename.endswith('.csv'):
                df = pd.read_csv(file)
            else:
                df = pd.read_excel(file)
                
            # Basic schema alignment: check if there's Transaction_ID, Date, etc., otherwise keep as is
            df.to_csv(save_path, index=False)
            set_active_filepath(save_path)
            
            # Immediately clean uploaded file and return preview
            impute_numeric = request.form.get('impute_numeric', 'median')
            impute_categorical = request.form.get('impute_categorical', 'mode')
            text_case = request.form.get('text_case', 'title')
            outlier_threshold = float(request.form.get('outlier_threshold', 1.5))
            
            results = clean_dataset(
                filepath=save_path,
                impute_numeric=impute_numeric,
                impute_categorical=impute_categorical,
                text_case=text_case,
                outlier_threshold=outlier_threshold
            )
            
            results['dataset_info'] = {
                "name": file.filename,
                "is_default": False
            }
            return jsonify(results)
        except Exception as e:
            return jsonify({"error": f"Failed to parse file: {str(e)}"}), 400

@app.route('/api/reset', methods=['POST'])
def reset_dataset():
    if os.path.exists(ACTIVE_DATA_PATH_FILE):
        try:
            os.remove(ACTIVE_DATA_PATH_FILE)
        except:
            pass
            
    try:
        results = clean_dataset(
            filepath=DEFAULT_DATA_PATH,
            impute_numeric='median',
            impute_categorical='mode',
            text_case='title',
            outlier_threshold=1.5
        )
        results['dataset_info'] = {
            "name": os.path.basename(DEFAULT_DATA_PATH),
            "is_default": True
        }
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/download', methods=['GET'])
def download_excel_report():
    try:
        impute_numeric = request.args.get('impute_numeric', 'median')
        impute_categorical = request.args.get('impute_categorical', 'mode')
        text_case = request.args.get('text_case', 'title')
        outlier_threshold = float(request.args.get('outlier_threshold', 1.5))
        
        filepath = get_active_filepath()
        
        # Re-run clean to get latest stats & logs
        results = clean_dataset(
            filepath=filepath,
            impute_numeric=impute_numeric,
            impute_categorical=impute_categorical,
            text_case=text_case,
            outlier_threshold=outlier_threshold
        )
        
        output_xlsx = os.path.join(UPLOAD_FOLDER, 'data_cleaning_audit_report.xlsx')
        generate_excel_report(
            cleaned_data_filepath=results['cleaned_file_path'],
            stats=results['stats'],
            audit_logs=results['audit_logs'],
            output_filepath=output_xlsx
        )
        
        return send_file(
            output_xlsx,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name='data_cleaning_audit_report.xlsx'
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5002, debug=True)
