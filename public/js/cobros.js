import { apiFetch, API_URL } from './api.js';
import { initAuth } from './auth-unified.js';

const formatCOP = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);

let todayCredits = [];
let allCredits = [];
let todayPayments = [];
let userRole = '';
let cobradores = [];

document.addEventListener('DOMContentLoaded', () => {
    initAuth('Panel de Cobros', async (payload) => {
        userRole = payload.role;
        await Promise.all([
            loadTodayCollections(),
            loadMyProgress(),
        ]);

        // Admin: precargar lista de cobradores
        if (userRole === 'admin') loadCobradores();
        
        // Cargar todos los créditos cuando se cambia a esa tab
        document.getElementById('tab-todos')?.addEventListener('shown.bs.tab', () => {
            if (allCredits.length === 0) loadAllCredits();
        });

        // Cargar historial cuando se cambia a esa tab
        document.getElementById('tab-historial')?.addEventListener('shown.bs.tab', loadMyProgress);

        // Búsqueda en ruta
        document.getElementById('searchRoute')?.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            const filtered = todayCredits.filter(c => 
                c.client_name.toLowerCase().includes(q) || 
                (c.address || '').toLowerCase().includes(q)
            );
            renderCollections(filtered);
        });

        // Búsqueda en todos los créditos
        document.getElementById('searchAllCredits')?.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            const filtered = allCredits.filter(c => c.client_name.toLowerCase().includes(q));
            renderAllCredits(filtered);
        });

        // Botón cerrar ruta
        document.getElementById('closeRouteBtn')?.addEventListener('click', closeRoute);
    });
});

// ==================== CARGAR DATOS ====================

async function loadTodayCollections() {
    const loader = document.getElementById('loader');
    try {
        const data = await apiFetch('/api/credits/today');
        if (data) {
            todayCredits = data;
            renderCollections(data);
            updateStats();
        }
    } catch (error) {
        showToast(error.message, true);
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

async function loadMyProgress() {
    try {
        const payments = await apiFetch('/api/credits/my-collections-today');
        if (!payments) return;
        todayPayments = payments;
        updateStats();
        renderHistory(payments);
    } catch (e) {
        console.error('Error cargando progreso:', e);
    }
}

async function loadAllCredits() {
    const container = document.getElementById('allCreditsList');
    try {
        const data = await apiFetch('/api/credits');
        if (data) {
            allCredits = data;
            renderAllCredits(data);
        }
    } catch (error) {
        container.innerHTML = `<div class="col-12 text-center text-danger py-4">${error.message}</div>`;
    }
}

async function loadCobradores() {
    try {
        const data = await apiFetch('/users/cobradores');
        if (data) cobradores = data;
    } catch (e) {
        console.error('Error cargando cobradores:', e);
    }
}

// ==================== ACTUALIZAR ESTADÍSTICAS ====================

function updateStats() {
    const totalCollected = todayPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const collectionsCount = todayPayments.length;
    const pending = todayCredits.length;
    const today = new Date().toISOString().split('T')[0];
    const overdue = todayCredits.filter(c => {
        if (!c.next_payment_date) return true;
        return c.next_payment_date.split('T')[0] < today;
    }).length;

    document.getElementById('statPending').textContent = pending;
    document.getElementById('statCollectedToday').textContent = formatCOP(totalCollected);
    document.getElementById('statCollectionsCount').textContent = collectionsCount;
    document.getElementById('statOverdue').textContent = overdue;
}

// ==================== RENDERIZAR RUTA ====================

function renderCollections(credits) {
    const cobrosList = document.getElementById('cobrosList');
    cobrosList.innerHTML = '';
    
    if (credits.length === 0) {
        cobrosList.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-check2-circle text-success" style="font-size:4rem;"></i>
                <p class="mt-3 fs-5 text-muted">No hay cobros pendientes para hoy.</p>
            </div>`;
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    credits.forEach(item => {
        const nextDate = item.next_payment_date ? item.next_payment_date.split('T')[0] : null;
        const isOverdue = !nextDate || nextDate < today;
        const isToday = nextDate === today;
        const cardClass = isOverdue ? 'overdue' : (isToday ? 'today' : '');
        const badge = isOverdue 
            ? '<span class="badge bg-danger rounded-pill">Vencido</span>'
            : (isToday ? '<span class="badge bg-warning text-dark rounded-pill">Hoy</span>' : '<span class="badge bg-info bg-opacity-10 text-info rounded-pill">Programado</span>');

        const lastPayment = item.last_payment_date 
            ? `<small class="text-muted"><i class="bi bi-clock me-1"></i>Último pago: ${new Date(item.last_payment_date).toLocaleDateString('es-CO')}</small>`
            : '<small class="text-muted fst-italic">Sin pagos previos</small>';

        const safeName = (item.client_name || '').replace(/'/g, "\\'");
        const card = document.createElement('div');
        card.className = 'col-md-6 col-lg-4';
        card.innerHTML = `
            <div class="card client-card ${cardClass} shadow-sm h-100">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div class="d-flex align-items-center">
                            <div class="rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center me-2" style="width:36px;height:36px;font-size:0.9rem;">
                                ${(item.client_name || '?').charAt(0).toUpperCase()}
                            </div>
                            <h6 class="fw-bold mb-0">${item.client_name}</h6>
                        </div>
                        ${badge}
                    </div>
                    <p class="small text-muted mb-2"><i class="bi bi-geo-alt me-1"></i>${item.address || 'Sin dirección'}</p>
                    ${lastPayment}
                    
                    <div class="bg-light p-3 rounded-3 my-3">
                        <div class="d-flex justify-content-between small mb-1">
                            <span class="text-muted">Saldo Pendiente:</span>
                            <span class="fw-bold text-danger">${formatCOP(item.remaining_balance)}</span>
                        </div>
                        <div class="d-flex justify-content-between small">
                            <span class="text-muted">Venta Original:</span>
                            <span>${formatCOP(item.original_sale_total || item.total_debt)}</span>
                        </div>
                    </div>

                    <div class="d-grid gap-2">
                        <button class="btn btn-primary btn-sm" onclick="window.openPaymentModal(${item.id}, '${safeName}', ${item.remaining_balance})">
                            <i class="bi bi-cash-stack me-1"></i>Cobrar
                        </button>
                        <div class="d-flex gap-2">
                            <button class="btn btn-outline-info btn-sm flex-fill" onclick="window.viewCreditDetail(${item.id})">
                                <i class="bi bi-eye me-1"></i>Detalle
                            </button>
                            ${item.phone ? `<a href="tel:${item.phone}" class="btn btn-outline-secondary btn-sm flex-fill"><i class="bi bi-telephone me-1"></i>Llamar</a>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
        cobrosList.appendChild(card);
    });
}

// ==================== RENDERIZAR HISTORIAL ====================

function renderHistory(payments) {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    if (payments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4"><i class="bi bi-inbox me-2"></i>No hay cobros registrados hoy</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    payments.forEach(p => {
        const time = new Date(p.payment_date).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        tbody.innerHTML += `
            <tr>
                <td class="ps-4"><strong>${p.client_name}</strong></td>
                <td class="text-success fw-bold">${formatCOP(p.amount)}</td>
                <td>${formatCOP(p.new_balance)}</td>
                <td class="text-muted">${time}</td>
                <td class="text-end pe-4">
                    <a href="${API_URL}/api/credits/receipt/${p.id}" target="_blank" class="btn btn-sm btn-outline-primary" title="Imprimir recibo">
                        <i class="bi bi-printer"></i>
                    </a>
                </td>
            </tr>
        `;
    });
}

// ==================== RENDERIZAR TODOS LOS CRÉDITOS ====================

function renderAllCredits(credits) {
    const container = document.getElementById('allCreditsList');
    container.innerHTML = '';

    if (credits.length === 0) {
        container.innerHTML = `<div class="col-12 text-center text-muted py-4">No hay créditos activos</div>`;
        return;
    }

    credits.forEach(item => {
        const progress = item.total_debt > 0 ? Math.round(((item.total_debt - item.remaining_balance) / item.total_debt) * 100) : 0;
        const safeName = (item.client_name || '').replace(/'/g, "\\'");
        const collectorName = item.created_by_user || 'Sin asignar';

        // Select de cobrador (solo admin)
        let assignHtml = '';
        if (userRole === 'admin') {
            const options = cobradores.map(c => 
                `<option value="${c.id}" ${c.id === item.collected_by ? 'selected' : ''}>${c.username}</option>`
            ).join('');
            assignHtml = `
                <div class="mt-2">
                    <label class="form-label small text-muted mb-1">Cobrador asignado:</label>
                    <select class="form-select form-select-sm" onchange="window.assignCollector(${item.id}, this.value)">
                        <option value="">Sin asignar</option>
                        ${options}
                    </select>
                </div>
            `;
        } else {
            assignHtml = `<small class="text-muted d-block mt-2"><i class="bi bi-person-badge me-1"></i>${collectorName}</small>`;
        }

        const card = document.createElement('div');
        card.className = 'col-md-6 col-lg-4';
        card.innerHTML = `
            <div class="card shadow-sm h-100 border-0 rounded-4">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="fw-bold mb-0">${item.client_name}</h6>
                        <span class="badge bg-${item.status === 'partial' ? 'warning text-dark' : (item.status === 'active' ? 'primary' : 'secondary')} rounded-pill">${item.status}</span>
                    </div>
                    <div class="progress mb-2" style="height:6px;">
                        <div class="progress-bar bg-success" style="width:${progress}%"></div>
                    </div>
                    <div class="d-flex justify-content-between small text-muted mb-3">
                        <span>Pagado: ${progress}%</span>
                        <span>Saldo: ${formatCOP(item.remaining_balance)}</span>
                    </div>
                    ${assignHtml}
                    <div class="d-flex gap-2 mt-2">
                        <button class="btn btn-primary btn-sm flex-fill" onclick="window.openPaymentModal(${item.id}, '${safeName}', ${item.remaining_balance})">
                            <i class="bi bi-cash-stack me-1"></i>Cobrar
                        </button>
                        <button class="btn btn-outline-info btn-sm" onclick="window.viewCreditDetail(${item.id})">
                            <i class="bi bi-eye"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// ==================== MODAL DE PAGO ====================

window.openPaymentModal = (id, name, balance) => {
    const paymentModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('paymentModal'));
    document.getElementById('modalCreditId').value = id;
    document.getElementById('modalClientName').textContent = name;
    document.getElementById('modalBalance').textContent = formatCOP(balance);
    document.getElementById('payAmount').value = '';
    document.getElementById('payAmount').max = balance;
    document.getElementById('payNotes').value = '';
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    document.getElementById('nextDate').value = nextMonth.toISOString().split('T')[0];
    paymentModal.show();
};

document.getElementById('paymentForm').onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Procesando...';

    const formData = {
        creditId: document.getElementById('modalCreditId').value,
        amount: document.getElementById('payAmount').value,
        nextPaymentDate: document.getElementById('nextDate').value,
        notes: document.getElementById('payNotes').value
    };

    try {
        const result = await apiFetch('/api/credits/payment', {
            method: 'POST',
            body: JSON.stringify(formData)
        });

        if (!result) return;

        bootstrap.Modal.getInstance(document.getElementById('paymentModal'))?.hide();
        
        Swal.fire({
            title: '¡Cobro Registrado!',
            html: `<p class="mb-1">Nuevo saldo: <strong class="text-primary">${formatCOP(result.remainingBalance)}</strong></p>`,
            icon: 'success',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonText: '<i class="bi bi-whatsapp"></i> WhatsApp',
            denyButtonText: '<i class="bi bi-printer"></i> Recibo',
            cancelButtonText: 'Cerrar',
            confirmButtonColor: '#25D366',
            denyButtonColor: '#0d6efd'
        }).then((choice) => {
            if (choice.isConfirmed && result.whatsappLink) {
                window.open(result.whatsappLink, '_blank');
            } else if (choice.isDenied) {
                window.open(`${API_URL}/api/credits/receipt/${result.paymentId}`, '_blank');
            }
        });

        // Recargar datos
        await Promise.all([loadTodayCollections(), loadMyProgress()]);
        if (allCredits.length > 0) loadAllCredits();

    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-check-circle me-2"></i>Confirmar Abono';
    }
};

// ==================== VER DETALLE DE CRÉDITO ====================

window.viewCreditDetail = async (creditId) => {
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('creditDetailModal'));
    const body = document.getElementById('creditDetailBody');
    body.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';
    modal.show();

    try {
        const data = await apiFetch(`/api/credits/${creditId}`);
        if (!data || !data.credit) {
            body.innerHTML = '<p class="text-danger text-center">No se encontraron datos</p>';
            return;
        }

        const c = data.credit;
        const payments = data.payments || [];
        const progress = c.total_debt > 0 ? Math.round(((c.total_debt - c.remaining_balance) / c.total_debt) * 100) : 0;

        let paymentsHtml = '';
        if (payments.length > 0) {
            paymentsHtml = payments.map(p => `
                <div class="payment-history-item mb-3">
                    <div class="d-flex justify-content-between">
                        <strong class="text-success">${formatCOP(p.amount)}</strong>
                        <small class="text-muted">${new Date(p.payment_date).toLocaleString('es-CO')}</small>
                    </div>
                    ${p.notes ? `<small class="text-muted">${p.notes}</small>` : ''}
                    ${p.collected_by_username ? `<small class="text-muted d-block">Cobrador: ${p.collected_by_username}</small>` : ''}
                </div>
            `).join('');
        } else {
            paymentsHtml = '<p class="text-muted text-center small">Sin pagos registrados</p>';
        }

        body.innerHTML = `
            <div class="row g-4">
                <div class="col-md-6">
                    <h6 class="fw-bold mb-3">Información del Crédito</h6>
                    <div class="bg-light p-3 rounded-3">
                        <div class="d-flex justify-content-between mb-2">
                            <span class="text-muted">Cliente:</span>
                            <strong>${c.client_name}</strong>
                        </div>
                        <div class="d-flex justify-content-between mb-2">
                            <span class="text-muted">Deuda Original:</span>
                            <strong>${formatCOP(c.total_debt)}</strong>
                        </div>
                        <div class="d-flex justify-content-between mb-2">
                            <span class="text-muted">Pago Inicial:</span>
                            <strong class="text-success">${formatCOP(c.initial_payment || 0)}</strong>
                        </div>
                        <div class="d-flex justify-content-between mb-2">
                            <span class="text-muted">Saldo Restante:</span>
                            <strong class="text-danger">${formatCOP(c.remaining_balance)}</strong>
                        </div>
                        <div class="d-flex justify-content-between mb-2">
                            <span class="text-muted">Estado:</span>
                            <span class="badge bg-${c.status === 'paid' ? 'success' : (c.status === 'partial' ? 'warning text-dark' : 'primary')}">${c.status}</span>
                        </div>
                        <div class="d-flex justify-content-between">
                            <span class="text-muted">Próximo pago:</span>
                            <span>${c.next_payment_date ? new Date(c.next_payment_date).toLocaleDateString('es-CO') : 'No definido'}</span>
                        </div>
                    </div>
                    <div class="mt-3">
                        <div class="d-flex justify-content-between small mb-1">
                            <span>Progreso de pago</span>
                            <span class="fw-bold">${progress}%</span>
                        </div>
                        <div class="progress" style="height:10px;">
                            <div class="progress-bar bg-success" style="width:${progress}%"></div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <h6 class="fw-bold mb-3">Historial de Pagos</h6>
                    <div style="max-height:300px;overflow-y:auto;">
                        ${paymentsHtml}
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        body.innerHTML = `<p class="text-danger text-center">${error.message}</p>`;
    }
};

// ==================== ASIGNAR COBRADOR (ADMIN) ====================

window.assignCollector = async (creditId, collectorId) => {
    try {
        const result = await apiFetch(`/api/credits/${creditId}/assign`, {
            method: 'PUT',
            body: JSON.stringify({ collectorId: collectorId || null })
        });
        if (result) {
            showToast(result.message);
        }
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
        loadAllCredits(); // revertir visualmente
    }
};

// ==================== CERRAR RUTA ====================

async function closeRoute() {
    const result = await Swal.fire({
        title: '¿Cerrar ruta del día?',
        text: 'Se generará un resumen de tu recaudo total de hoy.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, cerrar ruta',
        cancelButtonText: 'Continuar cobrando',
        confirmButtonColor: '#d33'
    });

    if (result.isConfirmed) {
        try {
            const data = await apiFetch('/api/credits/route-closure', { method: 'POST' });
            if (data) {
                await Swal.fire({
                    title: '¡Ruta Cerrada!',
                    html: `
                        <div class="text-center mt-3">
                            <p class="mb-1"><strong>Cobros realizados:</strong> ${data.summary.collections_count}</p>
                            <p class="fs-4 fw-bold text-success">${formatCOP(data.summary.total_collected)}</p>
                            <hr>
                            <p class="small text-muted">Registrado en auditoría del sistema.</p>
                        </div>
                    `,
                    icon: 'success'
                });
            }
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }
}