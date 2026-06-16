// Charts module managing ApexCharts instances for the Data Cleaning dashboard

let qualityDonutChart = null;

/**
 * Initializes empty chart templates
 */
export function initCharts() {
    const donutOptions = getDonutChartOptions([0, 0, 0, 0], ["Duplicates Cleared", "Missing Values Imputed", "Outliers Capped", "Formatting Fixes"]);
    qualityDonutChart = new ApexCharts(document.querySelector("#chart-quality-donut"), donutOptions);
    qualityDonutChart.render();
}

/**
 * Updates quality donut chart with statistics
 * @param {Object} stats - response stats from /api/clean
 */
export function updateCharts(stats) {
    const duplicates = stats.duplicates_removed || 0;
    const nulls = stats.nulls_imputed || 0;
    const outliers = stats.outliers_capped || 0;
    const formats = (stats.dates_standardized || 0) + (stats.text_standardized || 0);

    const seriesData = [duplicates, nulls, outliers, formats];
    const labels = ["Duplicates Cleared", "Missing Values Imputed", "Outliers Capped", "Formatting Fixes"];

    // If no changes were made, show 100% clean data indicator
    const totalFixes = duplicates + nulls + outliers + formats;
    if (totalFixes === 0) {
        qualityDonutChart.updateOptions(getDonutChartOptions([1], ["Fully Clean Dataset"]));
    } else {
        qualityDonutChart.updateOptions(getDonutChartOptions(seriesData, labels));
    }
}

/* ==========================================
   ApexCharts Config Generators
   ========================================== */

function getDonutChartOptions(series, labels) {
    const colors = series.length === 1 
        ? ['#10b981'] // Green for 100% clean
        : ['#f43f5e', '#f59e0b', '#10b981', '#22d3ee']; // Rose, Amber, Emerald, Cyan

    return {
        chart: {
            type: 'donut',
            height: 320,
            background: 'transparent',
            foreColor: '#94a3b8',
            toolbar: { show: false }
        },
        theme: { mode: 'dark' },
        colors: colors,
        series: series,
        labels: labels,
        plotOptions: {
            pie: {
                donut: {
                    size: '70%',
                    background: 'transparent',
                    labels: {
                        show: true,
                        name: { show: true, fontSize: '14px', color: '#94a3b8' },
                        value: { 
                            show: true, 
                            fontSize: '20px', 
                            fontWeight: '700',
                            color: '#f8fafc',
                            formatter: function (val) {
                                return parseInt(val).toLocaleString();
                            }
                        },
                        total: {
                            show: true,
                            label: 'Total Corrections',
                            color: '#94a3b8',
                            formatter: function (w) {
                                const sum = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                                // If 100% clean, label differently
                                if (w.globals.labels.includes("Fully Clean Dataset")) {
                                    return "100%";
                                }
                                return sum;
                            }
                        }
                    }
                }
            }
        },
        dataLabels: { enabled: false },
        legend: {
            position: 'bottom',
            horizontalAlign: 'center',
            fontSize: '11px',
            markers: { radius: 12 }
        },
        stroke: { show: false },
        grid: { padding: { bottom: 10 } }
    };
}
