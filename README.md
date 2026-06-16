# 🧹 Data Cleaning & Reporting Automation Dashboard

<div align="center">

![Python](https://img.shields.io/badge/Python-3.8%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.x-000000?style=for-the-badge&logo=flask&logoColor=white)
![openpyxl](https://img.shields.io/badge/openpyxl-3.1%2B-2A622A?style=for-the-badge&logo=microsoft-excel&logoColor=white)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![ApexCharts](https://img.shields.io/badge/ApexCharts-00B4D8?style=for-the-badge&logo=chart.js&logoColor=white)

**An interactive full-stack application that automates data cleaning and Excel reporting workflows.**  
Includes a gorgeous glassmorphic dark-theme control dashboard and programmatically styled multi-tab Excel reporting.

[📂 View Source](https://github.com/adarsh0718/data-cleaning-automation)

</div>

---

## 🎬 Overview

Data cleaning and formatting is one of the most time-consuming steps in data engineering and business analysis. This application automates the entire ingestion, standardization, and reporting process. Users can drop any dirty CSV or Excel sheet, let the pandas engine execute cleaning pipelines, inspect the complete log of changes on a timeline, and download a corporate-ready multi-tab Excel report workbook containing an Executive Audit Summary and the sanitized data.

---

## ✨ Features

### 🧼 Automated Data Cleaning Engine
- **Fuzzy & Exact Deduplication**: Identifies identical row copies and fuzzy text duplicates (whitespace variants) and drops them.
- **Null Value Imputations**: Imputes numeric missing values (with mean/median) and categorical missing fields (with mode or "Unknown").
- **Date Standardization**: Fuzzy-parses inconsistent formats (mixed strings like YYYY-MM-DD, DD/MM/YYYY, MM-DD-YYYY, and month names) to standard ISO `YYYY-MM-DD` strings.
- **Text Casing Normalization**: Trims padding whitespaces, fixes encoding characters, and standardizes casing (UPPERCASE, lowercase, Title Case) across categories and rep columns.
- **Outlier Capping**: Identifies statistical outliers using Interquartile Range (IQR) boundaries (1.5x, 2.0x, 3.0x thresholds) and caps them to upper/lower limits.
- **Relational Integrity Sync**: Re-computes calculations (e.g. Total Revenue = Price * Quantity) to ensure mathematical alignment after caps or null imputations.
- **Audit Logger**: Stores a structured record of every correction (Row Index, Column, Change type, description, original cell value, and corrected cell value).

### 📊 Excel Reporting Automation
Generates a highly polished, formatted multi-tab Excel spreadsheet (`.xlsx`) using `openpyxl`:
- **Tab 1: Executive Summary**:
  - Dark Slate header banner with the audit title.
  - KPI Callout Cards (Total Audited Rows, Duplicates Removed, Nulls Imputed, Outliers Capped) colored in Excel-native styling.
  - Detailed Pipeline Metrics grid detailing strategies.
  - Audit Log Timeline Preview showing the first 15 corrections.
  - Fully adjusted column widths, borders, and bold alignments.
- **Tab 2: Cleaned Database**:
  - Header rows styled in deep dark navy (`#0F172A`) with white text.
  - Transaction tables with cell border lines.
  - Column cell formatting: Currency formatting (`₹#,##0.00`) for prices and revenues, integer comma separation (`#,##0`) for quantities, and center alignments for dates/IDs.

### 🎨 Glassmorphic Control Frontend
- **Parameters Sidebar Panel**: Adjust imputation modes, outlier limits, and case casing configurations on the fly.
- **Corrections Timeline Logger**: Displays corrections dynamically on a vertical timeline.
- **Timeline Filters Toggle**: Filter corrections instantly by type (Duplicates, Nulls, Outliers, Formats).
- **Data Quality Gauge (ApexCharts)**: Donut visualizer showing the ratio of cleaning anomalies handled.
- **Data Grid Preview**: Side-by-side data preview comparing column details.

---

## 📂 Project Structure

```
data-cleaning-automation/
│
├── app.py                      # Flask Server (Endpoints: /api/clean, /api/upload, /api/download, /api/reset)
├── cleaning_engine.py          # Data Preprocessing, Deduplication, Imputations, openpyxl Styling
├── requirements.txt            # Python dependencies
├── .gitignore                  # Git ignore lists
│
├── data/
│   ├── dirty_dataset.csv       # Default demonstration dirty dataset
│   └── generate_dirty_data.py  # Script to programmatically generate dirty files
│
├── templates/
│   └── index.html              # Main dashboard frontend structure
│
└── static/
    ├── css/
    │   └── styles.css          # Premium glassmorphic styling
    └── js/
        ├── app.js              # State manager, dynamic timeline filters, API caller
        ├── charts.js           # ApexCharts configurations
        └── tables.js           # Comparative preview data table
```

---

## 🚀 Running Locally

### 1. Clone the repository
```bash
git clone https://github.com/adarsh0718/data-cleaning-automation.git
cd data-cleaning-automation
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Generate data
```bash
python data/generate_dirty_data.py
```

### 4. Start Flask server
```bash
python app.py
```
Open **[http://localhost:5002](http://localhost:5002)** in your browser!

---

## 👨‍💻 Author

**Adarsh Peddada**  
Electronics and Computer Engineering Student  
Passionate about Data Engineering, Machine Learning & Software Engineering.

[![GitHub](https://img.shields.io/badge/GitHub-adarsh0718-181717?style=flat-square&logo=github)](https://github.com/adarsh0718)
