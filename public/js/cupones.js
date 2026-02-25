const API_URL = ''; // Ruta relativa para producción

document.addEventListener('DOMContentLoaded', function() {
    loadCoupons();
    document.getElementById('addCouponForm').addEventListener('submit', handleAddCoupon);
});

async function loadCoupons() {
    const tbody = document.getElementById('couponsTableBody');
    const loading = document.getElementById('loadingState');
    const empty = document.getElementById('emptyState');

    try {
        const response = await fetch(`${API_URL}/coupons`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });

        if (response.status === 401 || response.status === 403) {
            window.location.href = 'dashboard.html';
            return;
        }

        const coupons = await response.json();
        loading.style.display = 'none';
        tbody.innerHTML = '';

        if (coupons.length === 0) {
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        coupons.forEach(coupon => {
            const isPercent = coupon.discount_type === 'percent';
            const valueDisplay = isPercent ? `${coupon.value}%` : parseFloat(coupon.value).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
            
            let expirationDisplay = 'Nunca';
            let statusBadge = '<span class="badge bg-success">Activo</span>';
            
            if (coupon.expiration_date) {
                const expDate = new Date(coupon.expiration_date);
                expirationDisplay = expDate.toLocaleDateString();
                
                // Verificar si expiró (comparando fechas sin hora)
                const today = new Date();
                today.setHours(0,0,0,0);
                // Ajustar zona horaria para comparación justa
                const expDateLocal = new Date(expDate.getTime() + expDate.getTimezoneOffset() * 60000);
                
                if (expDateLocal < today) {
                    statusBadge = '<span class="badge bg-secondary">Expirado</span>';
                }
            }

            const row = `
                <tr>
                    <td><span class="fw-bold font-monospace">${coupon.code}</span></td>
                    <td>${valueDisplay}</td>
                    <td>${expirationDisplay}</td>
                    <td>${statusBadge}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteCoupon(${coupon.id})" title="Eliminar">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });

    } catch (error) {
        console.error('Error:', error);
        loading.innerHTML = '<p class="text-danger">Error al cargar datos</p>';
    }
}

async function handleAddCoupon(e) {
    e.preventDefault();
    const btn = document.querySelector('.btn-submit');
    const msg = document.getElementById('message');
    
    const data = {
        code: document.getElementById('code').value,
        discount_type: document.getElementById('discountType').value,
        value: document.getElementById('value').value,
        expiration_date: document.getElementById('expirationDate').value || null
    };

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Creando...';
    msg.innerHTML = '';

    try {
        const response = await fetch(`${API_URL}/coupons`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error('Error al crear cupón');

        msg.innerHTML = '<div class="alert alert-success">Cupón creado correctamente</div>';
        document.getElementById('addCouponForm').reset();
        loadCoupons();

    } catch (error) {
        msg.innerHTML = '<div class="alert alert-danger">No se pudo crear el cupón. Verifica si el código ya existe.</div>';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Crear Cupón';
    }
}

window.deleteCoupon = async function(id) {
    if (!confirm('¿Estás seguro de eliminar este cupón?')) return;

    try {
        const response = await fetch(`${API_URL}/coupons/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });

        if (!response.ok) throw new Error('Error al eliminar');
        
        loadCoupons();

    } catch (error) {
        alert('No se pudo eliminar el cupón');
    }
}