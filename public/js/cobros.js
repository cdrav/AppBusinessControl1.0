import { API_URL } from '../config.js';

const cobrosList = document.getElementById('cobrosList');
const loader = document.getElementById('loader');
const paymentModal = new bootstrap.Modal(document.getElementById('paymentModal'));
const paymentForm = document.getElementById('paymentForm');

document.addEventListener('DOMContentLoaded', () => {
    loadTodayCollections();
});

async function loadTodayCollections() {
    try {
        const response = await fetch(`${API_URL}/api/credits/today`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        
        if (!response.ok) throw new Error('Error al cargar la ruta de cobro');
        
        const data = await response.json();
        renderCollections(data);
    } catch (error) {
        showToast(error.message, true);
    } finally {
        loader.style.display = 'none';
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
        const response = await fetch(`${API_URL}/api/credits/payment`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

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
            if (choice.isConfirmed) window.open(result.whatsappLink, '_blank');
            else if (choice.dismiss === Swal.DismissReason.cancel) window.open(`${API_URL}/api/credits/receipt/${result.paymentId}`, '_blank');
            loadTodayCollections();
        });

    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
};