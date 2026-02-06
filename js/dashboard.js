// Dashboard Page JavaScript
// Initialize page
document.addEventListener('DOMContentLoaded', function() {
  loadStats();
  animateCounters();
});

// Load statistics
async function loadStats() {
  try {
    // Simular datos realistas para mejor visualización
    const stats = {
      totalRevenue: 2857500,
      totalSales: 1247,
      totalClients: 384,
      totalProducts: 156
    };

    // Actualizar tarjetas de estadísticas con animación
    animateValue('totalRevenue', 0, stats.totalRevenue, 2000, '$');
    animateValue('totalSales', 0, stats.totalSales, 2000);
    animateValue('totalClients', 0, stats.totalClients, 2000);
    animateValue('totalProducts', 0, stats.totalProducts, 2000);

  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Animate numeric values
function animateValue(id, start, end, duration, prefix = '') {
  const element = document.getElementById(id);
  const range = end - start;
  const increment = range / (duration / 16);
  let current = start;
  
  const timer = setInterval(() => {
    current += increment;
    if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
      current = end;
      clearInterval(timer);
    }
    element.textContent = prefix + Math.floor(current).toLocaleString();
  }, 16);
}

// Animate counters
function animateCounters() {
  const counters = document.querySelectorAll('.dashboard-card .card-text');
  counters.forEach(counter => {
    const target = parseInt(counter.getAttribute('data-counter'));
    animateCounter(counter, 0, target, 2000);
  });
}

// Animate single counter
function animateCounter(element, start, end, duration) {
  const range = end - start;
  const increment = range / (duration / 16);
  let current = start;
  
  const timer = setInterval(() => {
    current += increment;
    if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
      current = end;
      clearInterval(timer);
    }
    element.textContent = Math.floor(current).toLocaleString();
  }, 16);
}
