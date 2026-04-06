import { apiFetch, API_URL } from './api.js';

const cobrosList = document.getElementById('cobrosList');
const loader = document.getElementById('loader');
const paymentModal = new bootstrap.Modal(document.getElementById('paymentModal'));
const paymentForm = document.getElementById('paymentForm');

document.addEventListener('DOMContentLoaded', () => {
    loadTodayCollections();
    loadMyProgress();

    // Escuchar el evento del botón de cierre (debe tener id="closeRouteBtn" en el HTML)
    const closeRouteBtn = document.getElementById('closeRouteBtn');
    if (closeRouteBtn) {
        closeRouteBtn.addEventListener('click', window.closeRoute);
    }
});

async function loadTodayCollections() {
    try {
        const data = await apiFetch('/api/credits/today');
        if (data) {
            renderCollections(data);
        }
    } catch (error) {
        showToast(error.message, true);
    } finally {
        loader.style.display = 'none';
    }
}

async function loadMyProgress() {
    try {
        const payments = await apiFetch('/api/credits/my-collections-today');
        if (!payments) return;

        const totalCollected = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const count = payments.length;

        // Inyectar o actualizar una barra de progreso si existe en el HTML
        const statsContainer = document.getElementById('collectorStats');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="alert alert-info border-0 shadow-sm d-flex justify-content-between align-items-center mb-4">
                    <div><i class="bi bi-graph-up-arrow me-2"></i><strong>Progreso de hoy:</strong> ${count} cobros realizados</div>
                    <div class="fs-5 fw-bold text-dark">${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(totalCollected)}</div>
                </div>
            `;
        }
    } catch (e) {
        console.error('Error cargando progreso:', e);
    }
}

function renderCollections(credits) {
    cobrosList.innerHTML = '';
    
    if (credits.length === 0) {
        cobrosList.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-check2-circle text-success display-1"></i>
                <p class="mt-3 fs-5 text-muted">¡Día completado! No hay cobros pendientes para hoy.</p>
            </div>`;
        return;
    }

    const formatCurrency = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);

    credits.forEach(item => {
        const card = document.createElement('div');
        card.className = 'col-md-6 col-lg-4';
        card.innerHTML = `
            <div class="card client-card shadow-sm h-100">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="fw-bold mb-0">${item.client_name}</h5>
                        <span class="badge bg-danger bg-opacity-10 text-danger">Pendiente</span>
                    </div>
                    <p class="small text-muted mb-3"><i class="bi bi-geo-alt me-1"></i>${item.address || 'Sin dirección'}</p>
                    
                    <div class="bg-light p-3 rounded-3 mb-3">
                        <div class="d-flex justify-content-between small text-muted mb-1">
                            <span>Saldo Pendiente:</span>
                            <span class="fw-bold text-dark">${formatCurrency(item.remaining_balance)}</span>
                        </div>
                        <div class="d-flex justify-content-between">
                            <span class="small text-muted">Venta Original:</span>
                            <span class="small">${formatCurrency(item.original_sale_total)}</span>
                        </div>
                    </div>

                    <div class="d-grid gap-2">
                        <button class="btn btn-primary" onclick="window.openPaymentModal(${item.id}, '${item.client_name}', ${item.remaining_balance})">
                            <i class="bi bi-cash-stack me-2"></i>Cobrar Ahora
                        </button>
                        <a href="tel:${item.phone}" class="btn btn-outline-secondary btn-sm">
                            <i class="bi bi-telephone me-2"></i>Llamar Cliente
                        </a>
                    </div>
                </div>
            </div>
        `;
        cobrosList.appendChild(card);
    });
}

// Exponer al objeto window para el onclick del HTML
window.openPaymentModal = (id, name, balance) => {
    document.getElementById('modalCreditId').value = id;
    document.getElementById('modalClientName').textContent = name;
    document.getElementById('payAmount').value = '';
    document.getElementById('payAmount').max = balance;
    // Sugerir próxima fecha en 1 mes por defecto
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    document.getElementById('nextDate').value = nextMonth.toISOString().split('T')[0];
    paymentModal.show();
};

paymentForm.onsubmit = async (e) => {
    e.preventDefault();
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

        paymentModal.hide();
        
        Swal.fire({
            title: '¡Cobro Registrado!',
            text: `Nuevo saldo: $${result.remainingBalance}`,
            icon: 'success',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-whatsapp"></i> WhatsApp',
            cancelButtonText: '<i class="bi bi-printer"></i> Imprimir',
            confirmButtonColor: '#25D366',
            cancelButtonColor: '#0d6efd'
        }).then((choice) => {
            if (choice.isConfirmed && result.whatsappLink) window.open(result.whatsappLink, '_blank');
            else if (choice.dismiss === Swal.DismissReason.cancel) window.open(`${API_URL}/api/credits/receipt/${result.paymentId}`, '_blank');
            loadTodayCollections();
            loadMyProgress();
        });

    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
};

window.closeRoute = async () => {
    const result = await Swal.fire({
        title: '¿Cerrar ruta del día?',
        text: "Se generará un resumen de tu recaudo total de hoy y se notificará al administrador.",
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
                const formatCurrency = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);
                
                await Swal.fire({
                    title: '¡Ruta Cerrada con Éxito!',
                    html: `
                        <div class="text-center mt-3">
                            <p class="mb-1"><strong>Cobros realizados:</strong> ${data.summary.collections_count}</p>
                            <p class="fs-4 fw-bold text-success">${formatCurrency(data.summary.total_collected)}</p>
                            <hr>
                            <p class="small text-muted">Esta acción ha quedado registrada en la auditoría del sistema para revisión del administrador.</p>
                        </div>
                    `,
                    icon: 'success'
                });
            }
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }
};