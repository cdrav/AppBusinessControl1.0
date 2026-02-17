// Dashboard Logic
const API_URL = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', function() {
    updateDate();
    setupUserSession();
    loadDashboardStats();
    initRevenueChart();

    // --- CIERRE DE CAJA MODAL ---
    const cashSummaryModal = document.getElementById('cashSummaryModal');
    if (cashSummaryModal) {
        cashSummaryModal.addEventListener('show.bs.modal', function () {
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('summaryDate').value = today;
            fetchDailySummary(today);
        });

        document.getElementById('summaryDate').addEventListener('change', function() {
            fetchDailySummary(this.value);
        });
    }
});

function setupUserSession() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html'; // Si no hay token, no debería estar aquí
        return;
    }

    // Decodificar el token para obtener la información del usuario
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        document.getElementById('usernameDisplay').textContent = payload.username;
        document.getElementById('userRoleDisplay').textContent = payload.role.charAt(0).toUpperCase() + payload.role.slice(1);
        document.getElementById('userInitialDisplay').textContent = payload.username.charAt(0).toUpperCase();

        // Ocultar elementos de administrador si no es admin
        if (payload.role !== 'admin') {
            const adminElements = document.querySelectorAll('.admin-only');
            adminElements.forEach(el => {
                el.style.display = 'none'; // Ocultar visualmente
            });
        }
    } catch (e) {
        console.error('Error decodificando el token:', e);
        localStorage.removeItem('token');
        window.location.href = 'login.html';
        return;
    }

    // Funcionalidad de Cerrar Sesión
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', function() {
            localStorage.removeItem('token');
            // Opcional: mostrar un mensaje de "Cerrando sesión..."
            window.location.href = 'login.html';
        });
    }
}

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

async function fetchDailySummary(date) {
    const summaryContent = document.getElementById('summaryContent');
    summaryContent.innerHTML = `
        <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Cargando...</span>
        </div>`;

    if (!date) {
        summaryContent.innerHTML = '<p class="text-danger">Por favor, seleccione una fecha.</p>';
        return;
    }

    try {
        const url = new URL(`${API_URL}/api/daily-summary`);
        url.searchParams.append('date', date);

        const response = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'No se pudo cargar el resumen.');
        }

        const summary = await response.json();

        summaryContent.innerHTML = `
            <div class="row g-0">
                <div class="col-6 text-center border-end">
                    <h3 class="mb-1 fw-bold">$${parseFloat(summary.totalRevenue).toLocaleString('en-US', {minimumFractionDigits: 2})}</h3>
                    <p class="text-muted mb-0 small">Ingresos Totales</p>
                </div>
                <div class="col-6 text-center">
                    <h3 class="mb-1 fw-bold">${summary.totalSales}</h3>
                    <p class="text-muted mb-0 small">Transacciones</p>
                </div>
            </div>
        `;

    } catch (error) {
        console.error('Error fetching daily summary:', error);
        summaryContent.innerHTML = `<p class="text-danger m-0">${error.message}</p>`;
    }
}

function printDailySummary() {
    const date = document.getElementById('summaryDate').value;
    const summaryData = document.getElementById('summaryContent').innerHTML;
    const printWindow = window.open('', 'PRINT', 'height=600,width=800');

    printWindow.document.write('<html><head><title>Resumen de Caja</title>');
    printWindow.document.write('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">');
    printWindow.document.write('<style>body { padding: 2rem; font-family: sans-serif; } .print-header { text-align: center; margin-bottom: 2.5rem; border-bottom: 1px solid #dee2e6; padding-bottom: 1rem; } h1 { font-size: 1.8rem; } .row { align-items: center; justify-content: center; }</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write('<div class="print-header">');
    printWindow.document.write('<h1>Resumen de Caja</h1>');
    printWindow.document.write(`<h5>Fecha: ${new Date(date).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</h5>`);
    printWindow.document.write('</div>');
    printWindow.document.write(summaryData);
    printWindow.document.write('</body></html>');

    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}