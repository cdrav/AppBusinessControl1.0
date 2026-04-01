// Dashboard Logic
import { apiFetch } from './api.js';
import { getUserPayload, logout } from './auth.js';

let revenueChart; // Variable global para el gráfico
let topProductsChart; // Variable para el gráfico de productos top
let comparisonChart; // Variable para el gráfico de comparación
let cashVsCreditChart; // Variable para el nuevo gráfico

document.addEventListener('DOMContentLoaded', function() {
    updateDate();
    const urlParams = new URLSearchParams(window.location.search);
    const branchId = urlParams.get('branch_id');

    setupUserSession(branchId);
    // Solo cargar tarjetas de sedes si estamos en la vista global
    if (!branchId) loadBranchCards(); 
    loadDashboardStats('7days', branchId);
    loadTodaySales(branchId); // Agregar esta línea
    initRevenueChart();
    initTopProductsChart();
    initCashVsCreditChart();
    initComparisonChart();

    // Listener para el filtro de ingresos
    const revenueFilter = document.getElementById('revenueFilter');
    if (revenueFilter) {
        revenueFilter.addEventListener('change', function() {
            loadDashboardStats(this.value, branchId);
        });
    }

    // --- CIERRE DE CAJA MODAL ---
    const cashSummaryModal = document.getElementById('cashSummaryModal');
    if (cashSummaryModal) {
        cashSummaryModal.addEventListener('show.bs.modal', function () {
            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const today = `${year}-${month}-${day}`;
            document.getElementById('summaryDate').value = today;
            fetchDailySummary(today, branchId);
        });

        document.getElementById('summaryDate').addEventListener('change', function() {
            fetchDailySummary(this.value, branchId);
        });
    }
});

function setupUserSession(branchId) {
    const payload = getUserPayload();
    if (!payload) {
        window.location.href = 'login.html';
        return;
    }

    try {
        document.getElementById('usernameDisplay').textContent = payload.username;
        document.getElementById('userRoleDisplay').textContent = payload.role.charAt(0).toUpperCase() + payload.role.slice(1);
        document.getElementById('userInitialDisplay').textContent = payload.username.charAt(0).toUpperCase();
        
        // Mostrar elementos con transición suave para evitar parpadeo
        document.getElementById('userInfoContainer').style.opacity = '1';
        document.getElementById('userInitialDisplay').style.opacity = '1';

        // Ocultar elementos de administrador si no es admin
        if (payload.role !== 'admin') {
            const adminElements = document.querySelectorAll('.admin-only');
            adminElements.forEach(el => {
                el.style.display = 'none'; // Ocultar visualmente
            });

            // Si es un cajero, tiene una sede asignada y no está ya en la vista de esa sede, redirigir.
            if (payload.branch_id && !branchId) {
                window.location.href = `dashboard.html?branch_id=${payload.branch_id}`;
                return; // Detener la ejecución para que la redirección ocurra
            }

            // Si es un COBRADOR, redirigir directamente a la gestión de cobros
            if (payload.role === 'cobrador') {
                window.location.href = 'cobros.html';
                return;
            }
        }

        // Si estamos en una vista de sede, cambiar el título y mostrar un botón para volver
        if (branchId) {
            const pageTitle = document.querySelector('.welcome-card h2');
            const pageSubtitle = document.querySelector('.welcome-card p');
            
            apiFetch('/api/branch-stats')
                .then(branches => {
                    if (!branches) return;
                    const currentBranch = branches.find(b => b.id == branchId);
                    if (currentBranch) {
                        if(pageTitle) pageTitle.textContent = `Dashboard: ${currentBranch.name}`;
                        if(pageSubtitle) pageSubtitle.innerHTML = `Resumen de actividad para esta sede. <a href="/dashboard.html" class="btn btn-sm btn-light ms-3 admin-only">Ver Dashboard Global</a>`;
                        
                        // Ocultar el botón de volver si no es admin
                        if (payload.role !== 'admin') {
                            const backButton = pageSubtitle.querySelector('.admin-only');
                            if (backButton) backButton.style.display = 'none';
                        } else {
                            // Si es admin, actualizar el enlace de "Nueva Venta" para que apunte a esta sede
                            const addSaleLink = document.querySelector('a[href="addSale.html"]');
                            if (addSaleLink) {
                                addSaleLink.href = `addSale.html?branch_id=${branchId}`;
                            }

                            // Sugerencia: Actualizar también el enlace de "Inventario"
                            const inventoryLink = document.querySelector('a[href="inventarios.html"]');
                            if (inventoryLink) {
                                inventoryLink.href = `inventarios.html?branch_id=${branchId}`;
                            }

                            // Ocultar el módulo de gestión de sedes, ya que no tiene sentido dentro de una sede.
                            const sedesModuleLink = document.querySelector('a[href="sedes.html"]');
                            if (sedesModuleLink) {
                                sedesModuleLink.closest('.col-6').style.display = 'none';
                            }
                        }
                    } else {
                        if(pageTitle) pageTitle.textContent = `Dashboard de Sede`;
                        if(pageSubtitle) pageSubtitle.innerHTML = `Resumen de actividad para esta sede.`;
                    }
                })
                .catch(() => { // Fallback en caso de error
                    if(pageTitle) pageTitle.textContent = `Dashboard de Sede`;
                    if(pageSubtitle) pageSubtitle.innerHTML = `Resumen de actividad para esta sede.`;
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
        // Usar la función centralizada de logout para limpiar sesión correctamente
        logoutButton.onclick = (e) => {
            e.preventDefault();
            logout();
        };
    }
}

function updateDate() {
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const today = new Date();
        dateElement.textContent = today.toLocaleDateString('es-ES', options);
        dateElement.style.opacity = '1';
    }
}

async function loadTodaySales(branchId = null) {
    try {
        const endpoint = branchId ? 
            `/api/dashboard-stats?period=today&branch_id=${branchId}` : 
            '/api/dashboard-stats?period=today';
        
        const data = await apiFetch(endpoint);
        if (!data) return;

        // Actualizar los elementos específicos de la tarjeta de ventas hoy
        const salesCount = document.getElementById('todaySalesCount');
        const salesAmount = document.getElementById('todaySalesAmount');
        
        const formatCOP = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(parseFloat(val || 0));

        if (salesCount) salesCount.textContent = data.totalSales || 0;
        if (salesAmount) salesAmount.textContent = formatCOP(data.totalRevenue);
        
    } catch (error) {
        console.error('Error loading today sales:', error);
    }
}

async function loadBranchCards() {
    // Buscamos el contenedor. Asegúrate de haber agregado <div id="branchCardsContainer" class="row mb-4"></div> en tu HTML
    const container = document.getElementById('branchCardsContainer');
    if (!container) return; 

    const payload = getUserPayload();
    if (!payload) return;
    
    try {
        if (payload.role !== 'admin') {
            container.style.display = 'none';
            return;
        }

        const branches = await apiFetch('/api/branch-stats');
        if (!branches) return;

        // Si solo hay una sede (la principal) o ninguna, no mostramos este panel de acceso rápido
        if (branches.length <= 1) {
            container.style.display = 'none';
            return;
        }

        container.innerHTML = ''; // Limpiar
        container.style.display = 'flex'; // Mostrar

        // Título de la sección
        const titleHtml = `<div class="col-12 mb-2"><h5 class="text-muted fw-bold"><i class="bi bi-shop-window me-2"></i>Accesos Rápidos a Sedes</h5></div>`;
        container.insertAdjacentHTML('beforeend', titleHtml);

        branches.forEach(branch => {
            const card = createBranchCard(branch);
            container.insertAdjacentHTML('beforeend', card);
        });

    } catch (error) {
        console.error('Error cargando tarjetas de sedes:', error);
        container.style.display = 'none';
    }
}

function createBranchCard(branch) {
    const formatCurrency = (amount) => parseFloat(amount || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

    return `
        <div class="col-md-6 col-xl-3 mb-3">
            <a href="dashboard.html?branch_id=${branch.id}" class="card h-100 shadow-sm text-decoration-none border-0 card-hover-effect" style="transition: transform 0.2s;">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h6 class="fw-bold text-primary mb-0 text-truncate">${branch.name}</h6>
                        <span class="badge bg-light text-dark border">${branch.totalStock} un.</span>
                    </div>
                    <p class="text-muted small mb-2 text-truncate"><i class="bi bi-geo-alt me-1"></i>${branch.address || 'Sin dirección'}</p>
                    <div class="mt-2 pt-2 border-top d-flex justify-content-between align-items-center">
                        <small class="text-muted">Ventas</small>
                        <span class="fw-bold text-success">${formatCurrency(branch.totalRevenue)}</span>
                    </div>
                </div>
            </a>
        </div>
    `;
}

async function loadDashboardStats(period = '7days', branchId = null) {
    try {
        let url = `/api/dashboard-stats?period=${period}`;
        if (branchId) {
            url += `&branch_id=${branchId}`;
        }

        const stats = await apiFetch(url);
        if (!stats) return;

        const formatCOP = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(parseFloat(val || 0));

        document.getElementById('totalRevenue').textContent = formatCOP(stats.totalRevenue);
        document.getElementById('totalExpenses').textContent = formatCOP(stats.totalExpenses);
        
        // Mostrar Cartera Pendiente (Dinero en la calle)
        const carteraEl = document.getElementById('totalCredits');
        if (carteraEl) {
            carteraEl.textContent = formatCOP(stats.totalCredits);
            carteraEl.parentElement.querySelector('.card-title').textContent = "Cartera Pendiente";
        }

        document.getElementById('totalSales').textContent = stats.totalSales;
        document.getElementById('totalClients').textContent = stats.totalClients;

        // Actualizar la alerta de stock bajo dedicada
        const lowStockAlert = document.getElementById('lowStockAlert');
        const lowStockCountSpan = document.getElementById('lowStockCount');
        if (lowStockAlert && lowStockCountSpan) {
            const count = parseInt(stats.lowStockCount);
            if (count > 0) {
                lowStockCountSpan.textContent = count;
                // Usamos 'flex' porque en el HTML usamos d-flex para alinear ícono y texto
                lowStockAlert.style.display = 'flex'; 
            } else {
                lowStockAlert.style.display = 'none';
            }
        }

        // Actualizar gráfico con datos reales
        updateRevenueChart(stats.salesTrend, period);

        // Actualizar gráfico de comparación
        updateComparisonChart(stats.salesTrend, stats.expensesTrend, period);

        // Actualizar gráfico de productos top
        updateTopProductsChart(stats.topProducts);

        // Actualizar gráfico de Efectivo vs Crédito
        if (cashVsCreditChart) {
            cashVsCreditChart.data.datasets[0].data = [parseFloat(stats.cashRevenue), parseFloat(stats.creditRevenue)];
            cashVsCreditChart.update();
        }

        // Actualizar lista de actividad reciente
        updateRecentActivity(stats.recentActivity); 

        // Actualizar monitoreo de cobradores
        updateCollectorMonitoring(stats.collectorPerformance);

        // Las siguientes tarjetas solo tienen sentido en la vista global
        if (!branchId) {
            updateStaleProducts(stats.staleProducts);
            updateInactiveClients(stats.inactiveClients);
        } else {
            // Ocultar estas tarjetas si estamos en una vista de sede
            const staleCard = document.getElementById('staleProductsCard');
            const inactiveCard = document.getElementById('inactiveClientsCard');
            const delinquentCard = document.getElementById('topDelinquentClientsCard'); // New card
            if (delinquentCard) delinquentCard.style.display = 'block';
            if (staleCard) staleCard.style.display = 'none';
            if (inactiveCard) inactiveCard.style.display = 'none';
            if (delinquentCard) delinquentCard.style.display = 'none'; // Hide if in branch view
        }

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
                borderColor: '#2563EB', // Nuevo Primary Blue
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 3,
                tension: 0.4, // Curva suave
                fill: true,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#2563EB',
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
                    bodyFont: { size: 13 },
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) label += new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(context.parsed.y);
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { borderDash: [5, 5], color: '#E2E8F0' },
                    ticks: { 
                        color: '#64748B',
                        callback: function(value) {
                            return value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
                        }
                    }
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
                    'rgba(37, 99, 235, 0.7)', // Primary
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

function updateCollectorMonitoring(performance) {
    const tableBody = document.getElementById('collectorMonitoringTableBody'); // Para la tabla de desktop
    const mobileListContainer = document.getElementById('collectorMonitoringListMobile'); // Para las tarjetas de móvil
    const card = document.getElementById('collectorMonitoringCard');
    if (!tableBody || !mobileListContainer || !card) return;

    if (!performance || performance.length === 0) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';
    tableBody.innerHTML = '';
    mobileListContainer.innerHTML = '';
    const formatCOP = (val) => parseFloat(val || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    performance.forEach(item => {
        const statusBadge = item.closed_at 
            ? `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-lock-fill me-1"></i>Cerró ${new Date(item.closed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>`
            : `<span class="badge bg-warning-subtle text-warning border border-warning-subtle"><i class="bi bi-bicycle me-1"></i>En Ruta</span>`;

        // Render para la tabla de desktop
        const tableRow = `
            <tr>
                <td class="fw-bold text-dark">${item.collector_name}</td>
                <td class="text-center"><span class="small text-muted">${item.collections_count} abonos</span></td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-end text-primary fw-bold">${formatCOP(item.amount_collected)}</td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', tableRow);

        // Render para la lista de tarjetas en móvil
        const mobileCard = `
            <div class="col-12">
                <div class="card shadow-sm border-0 h-100">
                    <div class="card-body d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-0 fw-bold text-dark">${item.collector_name}</h6>
                            <small class="text-muted">${item.collections_count} abonos</small>
                        </div>
                        <div class="text-end">
                            ${statusBadge}
                            <h5 class="mb-0 fw-bold text-primary">${formatCOP(item.amount_collected)}</h5>
                        </div>
                    </div>
                </div>
            </div>
        `;
        mobileListContainer.insertAdjacentHTML('beforeend', mobileCard);
    });
}

function initComparisonChart() {
    const ctx = document.getElementById('comparisonChart');
    if (!ctx) return;

    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [], // Se llenarán dinámicamente
            datasets: [
                {
                    label: 'Ingresos',
                    data: [],
                    backgroundColor: 'rgba(37, 99, 235, 0.6)', // Primary
                    borderColor: '#2563EB',
                    borderWidth: 2,
                    borderRadius: 5
                },
                {
                    label: 'Gastos',
                    data: [],
                    backgroundColor: 'rgba(239, 68, 68, 0.6)', // Danger
                    borderColor: '#EF4444',
                    borderWidth: 2,
                    borderRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) label += new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(context.parsed.y);
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            if (value >= 1000000) return (value / 1000000) + 'M';
                            if (value >= 1000) return (value / 1000) + 'k';
                            return value;
                        }
                    }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function initCashVsCreditChart() {
    const ctx = document.getElementById('cashVsCreditChart');
    if (!ctx) return;

    cashVsCreditChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Efectivo', 'Crédito'],
            datasets: [{
                data: [0, 0],
                backgroundColor: ['#10B981', '#F59E0B'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed || 0;
                            return context.label + ': ' + new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
                        }
                    }
                }
            },
            cutout: '70%'
        }
    });
}

function updateCashVsCreditChart(cash, credit) {
    if (!cashVsCreditChart) return;
    cashVsCreditChart.data.datasets[0].data = [parseFloat(cash), parseFloat(credit)];
    cashVsCreditChart.update();
}

function updateComparisonChart(salesData, expensesData, period = '7days') {
    if (!comparisonChart || !Array.isArray(salesData) || !Array.isArray(expensesData)) {
        return;
    }

    const processData = (trendData) => {
        return new Map(trendData.map(item => {
            const d = new Date(item.date);
            const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return [dateKey, parseFloat(item.total)];
        }));
    };
    
    const salesMap = processData(salesData);
    const expensesMap = processData(expensesData);

    const labels = [];
    const income = [];
    const expenses = [];
    const today = new Date();

    if (period === '7days') {
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' });
            labels.push(dayName.charAt(0).toUpperCase() + dayName.slice(1));
            income.push(salesMap.get(dateStr) || 0);
            expenses.push(expensesMap.get(dateStr) || 0);
        }
    }

    comparisonChart.data.labels = labels;
    comparisonChart.data.datasets[0].data = income;
    comparisonChart.data.datasets[1].data = expenses;
    comparisonChart.update();
}

function updateRevenueChart(trendData, period = '7days') {
    // Comprobación defensiva: si no hay gráfico o los datos no son un array, no hacer nada.
    if (!revenueChart || !Array.isArray(trendData)) {
        return;
    }

    // Generar últimos 7 días para asegurar que aparezcan días con 0 ventas
    const labels = [];
    const data = [];
    const today = new Date();

    if (period === 'year' || /^\d{4}$/.test(period)) {
        // Lógica para mostrar los 12 meses del año
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        
        for (let i = 0; i < 12; i++) {
            labels.push(monthNames[i]);

            // Buscar datos para este mes
            const monthData = trendData.find(item => {
                // El backend devuelve fecha tipo "2023-05-01" o objeto Date
                const d = new Date(item.date);
                // Ajuste simple: extraemos el mes directamente del string si es posible, o del objeto fecha
                // Nota: getMonth() es base 0 (Enero = 0)
                // Si viene como string YYYY-MM-DD, podemos parsearlo seguro:
                const dateStr = item.date instanceof Date ? item.date.toISOString() : String(item.date);
                const itemMonth = new Date(dateStr).getMonth(); 
                // Verificamos coincidencia de mes (y año si fuera multi-año, pero aquí filtramos por este año)
                return itemMonth === i;
            });

            data.push(monthData ? parseFloat(monthData.total) : 0);
        }
    } else if (period === 'month') {
        // Lógica para mostrar todo el mes actual
        const year = today.getFullYear();
        const month = today.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            labels.push(day); // Eje X: 1, 2, 3...

            // Buscar si hay ventas en este día específico
            const dayData = trendData.find(item => {
                const itemDate = new Date(item.date);
                const iYear = itemDate.getFullYear();
                const iMonth = String(itemDate.getMonth() + 1).padStart(2, '0');
                const iDay = String(itemDate.getDate()).padStart(2, '0');
                return `${iYear}-${iMonth}-${iDay}` === dateStr;
            });

            data.push(dayData ? parseFloat(dayData.total) : 0);
        }
    } else {
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        
        // Usar fecha local (YYYY-MM-DD) para evitar desfases de zona horaria
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        // Nombre del día en español (ej: "lun", "mar")
        const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' });
        
        labels.push(dayName.charAt(0).toUpperCase() + dayName.slice(1));
        
        // Buscar si hay ventas para este día en los datos del servidor
        const dayData = trendData.find(item => {
            // Convertir fecha del servidor a local YYYY-MM-DD
            const itemDate = new Date(item.date);
            const iYear = itemDate.getFullYear();
            const iMonth = String(itemDate.getMonth() + 1).padStart(2, '0');
            const iDay = String(itemDate.getDate()).padStart(2, '0');
            const itemDateStr = `${iYear}-${iMonth}-${iDay}`;
            return itemDateStr === dateStr;
        });
        
        data.push(dayData ? parseFloat(dayData.total) : 0);
    }
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
                value = `+${parseFloat(activity.value).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

function updateStaleProducts(products) {
    const card = document.getElementById('staleProductsCard');
    const list = document.getElementById('staleProductsList');
    const topProductsCard = document.getElementById('topProductsCard');

    if (!card || !list || !topProductsCard) return;

    if (!products || products.length === 0) {
        card.style.display = 'none';
        topProductsCard.classList.remove('col-lg-7');
        topProductsCard.classList.add('col-lg-12');
        return;
    }

    // Si hay productos, mostrar la tarjeta y ajustar columnas
    card.style.display = 'block';
    topProductsCard.classList.remove('col-lg-12');
    topProductsCard.classList.add('col-lg-7');
    list.innerHTML = '';

    products.forEach(product => {
        let subtitle;
        if (product.last_sale_date) {
            const daysAgo = Math.floor((new Date() - new Date(product.last_sale_date)) / (1000 * 60 * 60 * 24));
            subtitle = `Última venta hace ${daysAgo} días`;
        } else {
            subtitle = 'Nunca se ha vendido';
        }

        const itemHtml = `
            <div class="d-flex align-items-center mb-3 pb-3 border-bottom border-light">
                <div class="rounded-circle bg-danger bg-opacity-10 p-3 me-3 d-flex align-items-center justify-content-center" style="width: 48px; height: 48px;">
                    <i class="bi bi-box-seam fs-5 text-danger"></i>
                </div>
                <div class="flex-grow-1">
                    <h6 class="mb-0 fw-bold">${product.product_name}</h6>
                    <small class="text-muted">${subtitle}</small>
                </div>
                <a href="editInventory.html?id=${product.id}" class="btn btn-sm btn-light" title="Editar Producto">
                    <i class="bi bi-pencil"></i>
                </a>
            </div>
        `;
        list.insertAdjacentHTML('beforeend', itemHtml);
    });
}

function updateInactiveClients(clients) {
    const card = document.getElementById('inactiveClientsCard');
    const list = document.getElementById('inactiveClientsList');

    if (!card || !list) return;

    if (!clients || clients.length === 0) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';
    list.innerHTML = '';

    clients.forEach(client => {
        const lastPurchase = new Date(client.last_purchase).toLocaleDateString();
        const daysAgo = Math.floor((new Date() - new Date(client.last_purchase)) / (1000 * 60 * 60 * 24));
        
        const row = `
            <tr>
                <td>
                    <div class="fw-bold">${client.name}</div>
                </td>
                <td>
                    <div class="small"><i class="bi bi-envelope me-1"></i>${client.email || '-'}</div>
                    <div class="small"><i class="bi bi-telephone me-1"></i>${client.phone || '-'}</div>
                </td>
                <td>
                    <span class="badge bg-warning text-dark">${daysAgo} días</span>
                    <div class="small text-muted">${lastPurchase}</div>
                </td>
                <td class="text-end">
                    <a href="mailto:${client.email}" class="btn btn-sm btn-outline-primary" title="Enviar Correo">
                        <i class="bi bi-envelope"></i>
                    </a>
                    <a href="https://wa.me/${client.phone ? client.phone.replace(/[^0-9]/g, '') : ''}" target="_blank" class="btn btn-sm btn-outline-success" title="Contactar por WhatsApp">
                        <i class="bi bi-whatsapp"></i>
                    </a>
                </td>
            </tr>
        `;
        list.insertAdjacentHTML('beforeend', row);
    });
}

function updateTopDelinquentClients(clients) {
    const card = document.getElementById('topDelinquentClientsCard');
    const list = document.getElementById('topDelinquentClientsList');

    if (!card || !list) return;

    if (!clients || clients.length === 0) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';
    list.innerHTML = '';

    const formatCurrency = (amount) => parseFloat(amount || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

    clients.forEach(client => {
        const row = `
            <tr>
                <td>
                    <div class="fw-bold">${client.client_name}</div>
                </td>
                <td>
                    <div class="small"><i class="bi bi-envelope me-1"></i>${client.email || '-'}</div>
                    <div class="small"><i class="bi bi-telephone me-1"></i>${client.phone || '-'}</div>
                </td>
                <td>
                    <span class="badge bg-danger text-white">${formatCurrency(client.total_debt)}</span>
                </td>
                <td class="text-end">
                    <a href="mailto:${client.email}" class="btn btn-sm btn-outline-primary" title="Enviar Correo">
                        <i class="bi bi-envelope"></i>
                    </a>
                    <a href="https://wa.me/${client.phone ? client.phone.replace(/[^0-9]/g, '') : ''}" target="_blank" class="btn btn-sm btn-outline-success" title="Contactar por WhatsApp">
                        <i class="bi bi-whatsapp"></i>
                    </a>
                    <a href="clientes.html?id=${client.client_id}" class="btn btn-sm btn-outline-info" title="Ver Historial">
                        <i class="bi bi-clock-history"></i>
                    </a>
                </td>
            </tr>
        `;
        list.insertAdjacentHTML('beforeend', row);
    });
}


// ... existing code ...

        // Actualizar lista de clientes morosos
        if (!branchId) { // Solo si no estamos en la vista de una sede específica
            updateTopDelinquentClients(stats.topDelinquentClients);
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

async function fetchDailySummary(date, branchId = null) {
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
        let endpoint = `/api/daily-summary?date=${date}`;
        if (branchId) {
            endpoint += `&branch_id=${branchId}`;
        }

        const summary = await apiFetch(endpoint);
        if (!summary) return;

        summaryContent.innerHTML = `
            <div class="row g-3">
                <div class="col-6 text-center border-end">
                    <h4 class="mb-1 fw-bold text-success">${parseFloat(summary.totalRevenue).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</h4>
                    <p class="text-muted mb-0 small">Ingresos Totales</p>
                </div>
                <div class="col-6 text-center">
                    <h4 class="mb-1 fw-bold">${summary.totalSales}</h4>
                    <p class="text-muted mb-0 small">Transacciones</p>
                </div>
                <div class="col-12 text-center pt-3 border-top">
                     <h4 class="mb-1 fw-bold text-danger">${parseFloat(summary.totalExpenses).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</h4>
                     <p class="text-muted mb-0 small">Gastos del Día</p>
                </div>
                <div class="col-12 text-center pt-3 border-top bg-light rounded-bottom">
                     <h4 class="mb-1 fw-bold text-primary">${parseFloat(summary.totalRevenue - summary.totalExpenses).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</h4>
                     <p class="text-muted mb-0 small">Efectivo Esperado en Caja</p>
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
    const revenue = document.querySelector('#summaryContent h3:first-of-type')?.textContent || '$0';
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
            <p>Reporte generado automáticamente<br>&copy; ${new Date().getFullYear()} Business Control - Desarrollado por Cristian David Ruiz. Todos los derechos reservados.</p>
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

async function sendSummaryByEmail() {
    const emailBtn = document.getElementById('sendEmailBtn');
    const date = document.getElementById('summaryDate').value;

    if (!date) {
        alert('Por favor, seleccione una fecha.');
        return;
    }

    // Disable button and show loading state
    emailBtn.disabled = true;
    emailBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Enviando...';

    try {
        const result = await apiFetch('/api/daily-summary/email', {
            method: 'POST',
            body: JSON.stringify({ date: date })
        });
        if (!result) return;

        // Usamos alert para notificar, ya que no tenemos un sistema de "toasts" global
        showToast(result.message);

    } catch (error) {
        console.error('Error sending summary email:', error);
        showToast(error.message, true);

    } finally {
        // Re-enable button
        emailBtn.disabled = false;
        emailBtn.innerHTML = '<i class="bi bi-envelope me-1"></i> Enviar por Correo';
    }
}
