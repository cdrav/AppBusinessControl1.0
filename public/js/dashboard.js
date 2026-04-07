/**
 * Business Control - Sistema de Gestión Empresarial
 * Desarrollado por Cristian David Ruiz
 * © 2026 Todos los derechos reservados
 * 
 * Este archivo es parte del sistema Business Control
 * y está protegido por derechos de autor
 */

import { apiFetch } from './api.js';
import { initAuth, getUserPayload } from './auth-unified.js';

let revenueChart; // Variable global para el gráfico
let topProductsChart; // Variable global para el gráfico de productos top
let comparisonChart; // Variable global para el gráfico de comparación
let cashVsCreditChart; // Variable global para el nuevo gráfico

document.addEventListener('DOMContentLoaded', function() {
    updateDate();
    const urlParams = new URLSearchParams(window.location.search);
    const branchId = urlParams.get('branch_id');

    // Inicializar autenticación unificada
    initAuth('Dashboard', function(payload) {
        // Si es cobrador, redirigir a su panel de cobros
        if (payload.role === 'cobrador') {
            window.location.href = 'cobros.html';
            return;
        }
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
});

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
    // Buscar el contenedor. Asegúrate de haber agregado <div id="branchCardsContainer" class="row mb-4"></div> en tu HTML
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
        const titleHtml = `<div class="col-12 mb-3"><h5 class="text-muted fw-bold"><i class="bi bi-shop-window me-2"></i>Accesos Rápidos a Sedes</h5></div>`;
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

        // Actualizar tarjetas de estadísticas (con verificación de existencia)
        const totalRevenueEl = document.getElementById('totalRevenue');
        const totalSalesEl = document.getElementById('totalSales');
        const totalClientsEl = document.getElementById('totalClients');
        const totalCreditsEl = document.getElementById('totalCredits');
        const totalExpensesEl = document.getElementById('totalExpenses');
        const lowStockCountEl = document.getElementById('lowStockCount');
        const todaySalesCountEl = document.getElementById('todaySalesCount');
        const todaySalesAmountEl = document.getElementById('todaySalesAmount');

        if (totalRevenueEl) totalRevenueEl.textContent = formatCOP(stats.totalRevenue);
        if (totalSalesEl) totalSalesEl.textContent = stats.totalSales || 0;
        if (totalClientsEl) totalClientsEl.textContent = stats.totalClients || 0;
        if (totalCreditsEl) totalCreditsEl.textContent = formatCOP(stats.totalCredits);
        if (totalExpensesEl) totalExpensesEl.textContent = formatCOP(stats.totalExpenses);
        if (lowStockCountEl) lowStockCountEl.textContent = stats.lowStockCount || 0;
        if (todaySalesCountEl) todaySalesCountEl.textContent = stats.todaySalesCount || stats.totalSales || 0;
        if (todaySalesAmountEl) todaySalesAmountEl.textContent = formatCOP(stats.todaySalesAmount || stats.totalRevenue);

    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

function initRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Ingresos Diarios',
                data: [],
                borderColor: '#2563EB',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
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
            labels: [],
            datasets: [{
                label: 'Productos Más Vendidos',
                data: [],
                backgroundColor: '#10B981'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
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
            labels: ['Ventas de Contado', 'Ventas de Crédito'],
            datasets: [{
                data: [0, 0],
                backgroundColor: ['#2563EB', '#F59E0B']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

function initComparisonChart() {
    const ctx = document.getElementById('comparisonChart');
    if (!ctx) return;

    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio'],
            datasets: [{
                label: 'Este Año',
                data: [0, 0, 0, 0, 0, 0],
                backgroundColor: '#2563EB'
            }, {
                label: 'Año Anterior',
                data: [0, 0, 0, 0, 0, 0],
                backgroundColor: '#94A3B8'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Funciones accesibles desde onclick en dashboard.html
window.applyOverdueInterests = async function() {
    if (!confirm('¿Aplicar intereses a créditos vencidos? Esta acción no se puede deshacer.')) return;
    try {
        const data = await apiFetch('/api/credits/apply-interests', { method: 'POST' });
        if (data) showToast('Intereses aplicados correctamente');
    } catch (error) {
        console.error('Error aplicando intereses:', error);
        showToast('Error al aplicar intereses', true);
    }
};

window.printDailySummary = function() {
    const content = document.getElementById('summaryModalBody');
    if (!content) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>Resumen Diario</title>');
    printWindow.document.write('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">');
    printWindow.document.write('</head><body class="p-4">');
    printWindow.document.write('<h2 class="mb-4">Resumen Diario - Business Control</h2>');
    printWindow.document.write(content.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
};

window.sendSummaryByEmail = async function() {
    const btn = document.getElementById('sendEmailBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Enviando...'; }
    try {
        const date = document.getElementById('summaryDate')?.value || new Date().toISOString().split('T')[0];
        const data = await apiFetch('/api/send-daily-summary', { method: 'POST', body: JSON.stringify({ date }) });
        if (data) showToast('Resumen enviado por correo');
    } catch (error) {
        console.error('Error enviando resumen:', error);
        showToast('Error al enviar el resumen por correo', true);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-envelope me-1"></i> Enviar por Correo'; }
    }
};

async function fetchDailySummary(date, branchId = null) {
    console.log('[fetchDailySummary] Cargando datos para fecha:', date);
    
    // Mostrar spinner, ocultar datos
    const summaryContent = document.getElementById('summaryContent');
    const summaryData = document.getElementById('summaryData');
    
    if (summaryContent) summaryContent.classList.remove('d-none');
    if (summaryData) summaryData.classList.add('d-none');
    
    try {
        let url = `/api/daily-summary?date=${date}`;
        if (branchId) {
            url += `&branch_id=${branchId}`;
        }

        const data = await apiFetch(url);
        console.log('[fetchDailySummary] Datos recibidos:', data);
        
        if (!data) {
            throw new Error('No se recibieron datos del servidor');
        }

        const formatCOP = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(parseFloat(val || 0));

        // Actualizar valores
        const summaryDateEl = document.getElementById('summaryDate');
        const totalCashEl = document.getElementById('totalCash');
        const totalCreditEl = document.getElementById('totalCredit');
        const totalExpensesEl = document.getElementById('totalExpenses');
        const netCashEl = document.getElementById('netCash');
        
        if (summaryDateEl) summaryDateEl.value = date;
        if (totalCashEl) totalCashEl.textContent = formatCOP(data.totalCash || 0);
        if (totalCreditEl) totalCreditEl.textContent = formatCOP(data.totalCredit || 0);
        if (totalExpensesEl) totalExpensesEl.textContent = formatCOP(data.totalExpenses || 0);
        if (netCashEl) netCashEl.textContent = formatCOP(data.netCash || 0);

        // Ocultar spinner, mostrar datos
        if (summaryContent) summaryContent.classList.add('d-none');
        if (summaryData) summaryData.classList.remove('d-none');

    } catch (error) {
        console.error('[fetchDailySummary] Error:', error);
        if (summaryContent) {
            summaryContent.innerHTML = `<div class="alert alert-danger">Error al cargar el resumen: ${error.message}</div>`;
        }
    }
}
