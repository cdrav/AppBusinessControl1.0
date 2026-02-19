// Dashboard Logic
const API_URL = ''; // Ruta relativa para producción
let revenueChart; // Variable global para el gráfico
let topProductsChart; // Variable para el gráfico de productos top

document.addEventListener('DOMContentLoaded', function() {
    updateDate();
    setupUserSession();
    loadDashboardStats();
    initRevenueChart();
    initTopProductsChart();

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
        const response = await fetch(`${API_URL}/api/dashboard-stats`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });

        if (!response.ok) {
            // Si el token es inválido, el servidor envía 401/403, redirigir al login
            if (response.status === 401 || response.status === 403) {
                window.location.href = 'login.html';
            }
            throw new Error('No se pudieron cargar las estadísticas.');
        }
        
        const stats = await response.json();
        
        document.getElementById('totalRevenue').textContent = `$${parseFloat(stats.totalRevenue).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        document.getElementById('totalSales').textContent = stats.totalSales;
        document.getElementById('totalClients').textContent = stats.totalClients;
        document.getElementById('totalProducts').textContent = stats.totalProducts;

        // Alerta de stock bajo (si existe la función showToast en utils.js)
        if (parseInt(stats.lowStockCount) > 0 && typeof showToast === 'function') {
            showToast(`⚠️ Atención: Tienes ${stats.lowStockCount} productos con stock bajo.`, true);
        }

        // Actualizar gráfico con datos reales
        updateRevenueChart(stats.salesTrend);

        // Actualizar gráfico de productos top
        updateTopProductsChart(stats.topProducts);

        // Actualizar lista de actividad reciente
        updateRecentActivity(stats.recentActivity);

    } catch (error) {
        console.error('Error cargando estadísticas del dashboard:', error);
    }
}

function initRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // Se llenarán dinámicamente
            datasets: [{
                label: 'Ingresos ($)',
                data: [], // Se llenarán dinámicamente
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

function initTopProductsChart() {
    const ctx = document.getElementById('topProductsChart');
    if (!ctx) return;

    topProductsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [], // Nombres de productos
            datasets: [{
                label: 'Unidades Vendidas',
                data: [], // Cantidades vendidas
                backgroundColor: [
                    'rgba(37, 99, 235, 0.6)',
                    'rgba(16, 185, 129, 0.6)',
                    'rgba(245, 158, 11, 0.6)',
                    'rgba(239, 68, 68, 0.6)',
                    'rgba(100, 116, 139, 0.6)'
                ],
                borderColor: [
                    '#2563eb',
                    '#10b981',
                    '#f59e0b',
                    '#ef4444',
                    '#64748b'
                ],
                borderWidth: 2,
                borderRadius: 5
            }]
        },
        options: {
            indexAxis: 'y', // Gráfico de barras horizontal
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        borderDash: [5, 5],
                        color: '#E2E8F0'
                    },
                    ticks: {
                        precision: 0 // No mostrar decimales en el eje X
                    }
                },
                y: { grid: { display: false } }
            }
        }
    });
}

function updateRevenueChart(trendData) {
    // Comprobación defensiva: si no hay gráfico o los datos no son un array, no hacer nada.
    if (!revenueChart || !Array.isArray(trendData)) {
        return;
    }

    // Generar últimos 7 días para asegurar que aparezcan días con 0 ventas
    const labels = [];
    const data = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        // Nombre del día en español (ej: "lun", "mar")
        const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' });
        
        labels.push(dayName.charAt(0).toUpperCase() + dayName.slice(1));
        
        // Buscar si hay ventas para este día en los datos del servidor
        const dayData = trendData.find(item => {
            const itemDate = new Date(item.date).toISOString().split('T')[0];
            return itemDate === dateStr;
        });
        
        data.push(dayData ? parseFloat(dayData.total) : 0);
    }

    revenueChart.data.labels = labels;
    revenueChart.data.datasets[0].data = data;
    revenueChart.update();
}

function updateTopProductsChart(productsData) {
    if (!topProductsChart || !Array.isArray(productsData)) {
        return;
    }

    const labels = productsData.map(p => p.product_name);
    const data = productsData.map(p => p.totalSold);

    topProductsChart.data.labels = labels;
    topProductsChart.data.datasets[0].data = data;
    topProductsChart.update();
}

function updateRecentActivity(activities) {
    const container = document.getElementById('recentActivityList');
    if (!container) return;

    if (!Array.isArray(activities) || activities.length === 0) {
        container.innerHTML = '<p class="text-muted small text-center mt-3">No hay actividad reciente.</p>';
        return;
    }

    container.innerHTML = ''; // Limpiar contenido estático o anterior

    activities.forEach(activity => {
        let iconHtml, title, subtitle, value, iconClass;

        const timeAgo = formatTimeAgo(new Date(activity.date));

        switch (activity.type) {
            case 'sale':
                iconClass = 'bg-success text-success';
                iconHtml = '<i class="bi bi-cart-check fs-5"></i>';
                title = 'Nueva Venta';
                subtitle = `Cliente: ${activity.text}`;
                value = `+$${parseFloat(activity.value).toFixed(2)}`;
                break;
            case 'client':
                iconClass = 'bg-primary text-primary';
                iconHtml = '<i class="bi bi-person-plus fs-5"></i>';
                title = 'Nuevo Cliente';
                subtitle = activity.text;
                value = '-';
                break;
            default:
                // Placeholder para futuras actividades
                iconClass = 'bg-secondary text-secondary';
                iconHtml = '<i class="bi bi-bell fs-5"></i>';
                title = 'Actividad';
                subtitle = activity.text;
                value = '';
        }

        const itemHtml = `
            <div class="d-flex align-items-center mb-3 pb-3 border-bottom border-light">
                <div class="rounded-circle ${iconClass} bg-opacity-10 p-3 me-3 d-flex align-items-center justify-content-center" style="width: 48px; height: 48px;">
                    ${iconHtml}
                </div>
                <div class="flex-grow-1">
                    <h6 class="mb-0 fw-bold">${title}</h6>
                    <small class="text-muted">${subtitle}</small>
                </div>
                <div class="text-end">
                    <span class="d-block fw-bold text-dark">${value}</span>
                    <small class="text-muted" style="font-size: 0.75rem;">${timeAgo}</small>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', itemHtml);
    });
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Ahora mismo';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days} día(s)`;
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
        const url = new URL(`${API_URL}/api/daily-summary`, window.location.origin);
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
    // Estilos optimizados para impresoras térmicas (ancho estrecho, fuente monoespaciada, alto contraste)
    printWindow.document.write(`
        <style>
            body { 
                padding: 10px; 
                font-family: 'Courier New', monospace; 
                width: 300px; 
                margin: 0 auto; 
                color: #000;
            }
            .print-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 15px; }
            h1 { font-size: 1.2rem; margin: 0; text-transform: uppercase; }
            h5 { font-size: 0.9rem; margin: 5px 0; font-weight: normal; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 1rem; }
            .label { font-weight: bold; }
            .footer { text-align: center; margin-top: 20px; font-size: 0.8rem; border-top: 1px dashed #000; padding-top: 10px; }
        </style>
    `);
    printWindow.document.write('</head><body>');
    printWindow.document.write('<div class="print-header">');
    printWindow.document.write('<h1>Resumen de Caja</h1>');
    printWindow.document.write(`<h5>Fecha: ${new Date(date).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</h5>`);
    printWindow.document.write('</div>');
    
    // Extraer datos del HTML actual para formatearlos mejor
    const revenue = document.querySelector('#summaryContent h3:first-of-type')?.textContent || '$0.00';
    const transactions = document.querySelector('#summaryContent h3:last-of-type')?.textContent || '0';

    printWindow.document.write(`
        <div class="summary-row">
            <span class="label">Ingresos Totales:</span>
            <span>${revenue}</span>
        </div>
        <div class="summary-row">
            <span class="label">Transacciones:</span>
            <span>${transactions}</span>
        </div>
        <div class="footer">
            <p>Reporte generado automáticamente<br>Business Control</p>
        </div>
    `);
    
    printWindow.document.write('</body></html>');

    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}