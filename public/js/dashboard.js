// Dashboard Logic
const API_URL = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', function() {
    updateDate();
    loadDashboardStats();
    initRevenueChart();
});

function updateDate() {
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const today = new Date();
        dateElement.textContent = today.toLocaleDateString('es-ES', options);
    }
}

async function loadDashboardStats() {
    try {
        // Cargar ventas para calcular totales
        const salesResponse = await fetch(`${API_URL}/sales`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        
        if (salesResponse.ok) {
            const sales = await salesResponse.json();
            
            // Calcular Ingresos Totales
            const totalRevenue = sales.reduce((sum, sale) => sum + (parseFloat(sale.total_price) || 0), 0);
            document.getElementById('totalRevenue').textContent = `$${totalRevenue.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            
            // Calcular Ventas Totales
            document.getElementById('totalSales').textContent = sales.length;
        }

        // Cargar Clientes
        const clientsResponse = await fetch(`${API_URL}/clients`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        if (clientsResponse.ok) {
            const clients = await clientsResponse.json();
            document.getElementById('totalClients').textContent = clients.length;
        }

        // Cargar Productos
        const productsResponse = await fetch(`${API_URL}/inventory`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        if (productsResponse.ok) {
            const products = await productsResponse.json();
            document.getElementById('totalProducts').textContent = products.length;
        }

    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

function initRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    // Datos simulados para el gráfico (para impacto visual inmediato)
    // En una versión futura, esto se conectaría a los datos reales de ventas por día
    const labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const data = [1200, 1900, 3000, 500, 2000, 3500, 4200];

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ingresos ($)',
                data: data,
                borderColor: '#4F46E5', // var(--primary)
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                borderWidth: 3,
                tension: 0.4, // Curva suave
                fill: true,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#4F46E5',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1E293B',
                    padding: 12,
                    titleFont: { size: 13 },
                    bodyFont: { size: 13 }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { borderDash: [5, 5], color: '#E2E8F0' },
                    ticks: { color: '#64748B' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748B' }
                }
            }
        }
    });
}