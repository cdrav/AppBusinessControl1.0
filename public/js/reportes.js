// Reportes Page JavaScript
let salesChart = null;
let distributionChart = null;
let clientsChart = null;
let hourlyChart = null;
const API_URL = ''; // Ruta relativa para producción

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
  initializeCharts();
  setDefaultDates();
  
  const startDateInput = document.getElementById('start-date');
  const endDateInput = document.getElementById('end-date');
  
  startDateInput.addEventListener('change', fetchAndDisplayStats);
  endDateInput.addEventListener('change', fetchAndDisplayStats);

  // Initial data load after setting dates
  fetchAndDisplayStats();
});

// Set default dates (last 30 days)
function setDefaultDates() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 29); // Last 30 days
  
  document.getElementById('start-date').value = startDate.toISOString().split('T')[0];
  document.getElementById('end-date').value = endDate.toISOString().split('T')[0];
}

// Initialize charts with empty data but with full options
function initializeCharts() {
  const salesCtx = document.getElementById('salesChart')?.getContext('2d');
  if (salesCtx) {
    salesChart = new Chart(salesCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Ventas',
          data: [],
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            padding: 12,
            callbacks: {
              label: function(context) {
                return 'Ventas: $' + (context.parsed.y || 0).toLocaleString();
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0, 0, 0, 0.05)' },
            ticks: {
              callback: function(value) {
                if (value >= 1000) return '$' + (value / 1000) + 'k';
                return '$' + value;
              }
            }
          }
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false }
      }
    });
  }

  const distCtx = document.getElementById('distributionChart')?.getContext('2d');
  if (distCtx) {
    distributionChart = new Chart(distCtx, {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: ['#2563eb', '#28a745', '#ffc107', '#dc3545', '#6c757d', '#17a2b8', '#fd7e14'],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { padding: 15 } },
          tooltip: {
            callbacks: {
              label: function(context) {
                const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                const value = context.parsed || 0;
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                return `${context.label}: $${value.toLocaleString()} (${percentage}%)`;
              }
            }
          }
        },
        cutout: '60%'
      }
    });
  }

  const clientsCtx = document.getElementById('clientsChart')?.getContext('2d');
  if (clientsCtx) {
    clientsChart = new Chart(clientsCtx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Total Comprado',
          data: [],
          backgroundColor: 'rgba(16, 185, 129, 0.2)', // Verde suave
          borderColor: '#10b981', // Verde fuerte
          borderWidth: 2,
          borderRadius: 5
        }]
      },
      options: {
        indexAxis: 'y', // Gráfico horizontal
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                return 'Total: $' + (context.parsed.x || 0).toLocaleString();
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(0, 0, 0, 0.05)' },
            ticks: {
              callback: function(value) { return '$' + value; }
            }
          },
          y: { grid: { display: false } }
        }
      }
    });
  }

  const hourlyCtx = document.getElementById('hourlyChart')?.getContext('2d');
  if (hourlyCtx) {
    hourlyChart = new Chart(hourlyCtx, {
      type: 'bar',
      data: {
        labels: Array.from({length: 24}, (_, i) => `${i}:00`), // 0:00 a 23:00
        datasets: [{
          label: 'Transacciones',
          data: [],
          backgroundColor: 'rgba(13, 202, 240, 0.5)', // Info color (Cyan)
          borderColor: '#0dcaf0',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
          x: { grid: { display: false } }
        }
      }
    });
  }
}

// Fetch data from backend and update UI
async function fetchAndDisplayStats() {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    if (!startDate || !endDate) return;

    const url = new URL(`${API_URL}/api/statistics`, window.location.origin);
    url.searchParams.append('startDate', startDate);
    url.searchParams.append('endDate', endDate);

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });

        if (response.status === 401 || response.status === 403) {
            window.location.href = 'login.html';
            return;
        }
        if (!response.ok) throw new Error('No se pudieron cargar las estadísticas.');

        const stats = await response.json();

        // Update stat cards
        animateValue('totalRevenue', 0, stats.totalRevenue, 1500, '$');
        animateValue('totalSales', 0, stats.totalSales, 1500);
        document.getElementById('totalClients').textContent = stats.newClients;
        document.getElementById('totalProducts').textContent = stats.totalProducts;

        // Update sales trend chart
        if (salesChart) {
            const trendLabels = stats.salesTrend.map(d => new Date(d.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }));
            const trendData = stats.salesTrend.map(d => parseFloat(d.total));
            salesChart.data.labels = trendLabels;
            salesChart.data.datasets[0].data = trendData;
            salesChart.update();
        }

        // Update category distribution chart
        if (distributionChart) {
            const categoryLabels = stats.categoryDistribution.map(d => d.category);
            const categoryData = stats.categoryDistribution.map(d => parseFloat(d.total));
            distributionChart.data.labels = categoryLabels;
            distributionChart.data.datasets[0].data = categoryData;
            distributionChart.update();
        }

        // Update top clients chart
        if (clientsChart) {
            const clientLabels = stats.topClients.map(c => c.name);
            const clientData = stats.topClients.map(c => parseFloat(c.total));
            clientsChart.data.labels = clientLabels;
            clientsChart.data.datasets[0].data = clientData;
            clientsChart.update();
        }

        // Update hourly chart
        if (hourlyChart && stats.salesByHour) {
            const hourlyData = new Array(24).fill(0);
            stats.salesByHour.forEach(item => {
                hourlyData[item.hour] = item.count;
            });
            hourlyChart.data.datasets[0].data = hourlyData;
            hourlyChart.update();
        }

    } catch (error) {
        console.error('Error loading stats:', error);
        alert('Error al cargar las estadísticas. Verifique la consola.');
    }
}

// Animate numeric values for stat cards
function animateValue(id, start, end, duration, prefix = '') {
  const element = document.getElementById(id);
  if (!element) return;
  
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const currentValue = Math.floor(progress * (end - start) + start);
    element.textContent = prefix + currentValue.toLocaleString('en-US');
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      // Ensure final value is exact, especially for currency
      element.textContent = prefix + parseFloat(end).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
  };
  window.requestAnimationFrame(step);
}

// Generate and download PDF report
window.generateReport = async function() {
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;
  const reportType = document.getElementById('report-type').value;

  if (!startDate || !endDate) {
    alert('Por favor, selecciona las fechas de inicio y fin.');
    return;
  }
  
  if (reportType !== 'sales') {
      alert('De momento, solo la descarga del Reporte de Ventas está implementada.');
      return;
  }

  const btn = document.querySelector('button[onclick="generateReport()"]');
  btn.disabled = true;
  btn.classList.add('loading');

  try {
    const url = new URL(`${API_URL}/report`, window.location.origin);
    url.searchParams.append('startDate', startDate);
    url.searchParams.append('endDate', endDate);
    url.searchParams.append('type', reportType);

    const response = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error del servidor: ${errorText}`);
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = downloadUrl;
    a.download = `reporte-${reportType}-${startDate}-a-${endDate}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(downloadUrl);
    a.remove();
    
    alert('Reporte PDF generado y descargado con éxito.');

  } catch (error) {
    console.error('Error generating report:', error);
    alert('Error al generar el reporte: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}
