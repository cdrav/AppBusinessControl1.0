// Reportes Page JavaScript
const API_URL = (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? CONFIG.API_URL : 'http://localhost:3000';
let salesChart = null;
let distributionChart = null;

document.addEventListener('DOMContentLoaded', function() {
  // Establecer fechas por defecto (último mes)
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  
  document.getElementById('end-date').valueAsDate = end;
  document.getElementById('start-date').valueAsDate = start;
  
  initCharts();
  loadDashboardStats(); // Reutilizamos lógica similar al dashboard
});

function initCharts() {
  // Configuración inicial de gráficos vacíos o con datos de ejemplo
  const ctxSales = document.getElementById('salesChart').getContext('2d');
  salesChart = new Chart(ctxSales, {
    type: 'line',
    data: {
      labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'],
      datasets: [{
        label: 'Ventas ($)',
        data: [0, 0, 0, 0],
        borderColor: '#4f46e5',
        tension: 0.4,
        fill: true,
        backgroundColor: 'rgba(79, 70, 229, 0.1)'
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  const ctxDist = document.getElementById('distributionChart').getContext('2d');
  distributionChart = new Chart(ctxDist, {
    type: 'doughnut',
    data: {
      labels: ['Electrónicos', 'Ropa', 'Hogar', 'Otros'],
      datasets: [{
        data: [30, 20, 15, 35],
        backgroundColor: ['#4f46e5', '#059669', '#f59e0b', '#6b7280']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

window.generateReport = async function() {
  const btn = document.querySelector('button[onclick="generateReport()"]');
  const originalText = btn.innerHTML;
  
  // Loading state
  btn.innerHTML = '<div class="loading-spinner"></div> Generando...';
  btn.disabled = true;

  try {
    // Simulación de petición al backend
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Actualizar gráficos con datos aleatorios para demostración
    updateChartsWithRandomData();
    
    showNotification('Reporte generado exitosamente', 'success');
    
    // Mostrar vista previa
    document.getElementById('reportPreview').style.display = 'block';
    document.getElementById('reportPreview').scrollIntoView({ behavior: 'smooth' });
    
  } catch (error) {
    console.error(error);
    showNotification('Error al generar el reporte', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function updateChartsWithRandomData() {
  // Actualizar gráfico de ventas
  const newData = Array.from({length: 4}, () => Math.floor(Math.random() * 5000) + 1000);
  salesChart.data.datasets[0].data = newData;
  salesChart.update();
  
  // Actualizar estadísticas
  const total = newData.reduce((a, b) => a + b, 0);
  document.getElementById('totalRevenue').textContent = `$${total.toLocaleString()}`;
  document.getElementById('totalSales').textContent = Math.floor(total / 150); // Estimado
}

async function loadDashboardStats() {
  // Aquí iría la lógica real para obtener los contadores iniciales
  // Por ahora simulamos
  document.getElementById('totalRevenue').textContent = '$0';
  document.getElementById('totalSales').textContent = '0';
  document.getElementById('totalClients').textContent = '0';
  document.getElementById('totalProducts').textContent = '0';
}

function showNotification(msg, type) {
    if(window.showNotification) window.showNotification(msg, type);
    else alert(msg);
}