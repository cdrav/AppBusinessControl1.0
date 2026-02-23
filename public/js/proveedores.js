const API_URL = ''; 

document.addEventListener('DOMContentLoaded', function() {
    loadSuppliers();
    document.getElementById('addSupplierForm').addEventListener('submit', handleAddSupplier);
});

async function loadSuppliers() {
    const tbody = document.getElementById('suppliersTableBody');
    const loading = document.getElementById('loadingState');
    const empty = document.getElementById('emptyState');

    try {
        const response = await fetch(`${API_URL}/suppliers`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });

        if (response.status === 401) { window.location.href = 'login.html'; return; }

        const suppliers = await response.json();
        loading.style.display = 'none';
        tbody.innerHTML = '';

        if (suppliers.length === 0) {
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        suppliers.forEach(s => {
            const row = `
                <tr>
                    <td class="ps-4">
                        <div class="fw-bold">${s.name}</div>
                        <small class="text-muted">${s.email || ''}</small>
                    </td>
                    <td>${s.contact_name || '-'}</td>
                    <td>${s.phone || '-'}</td>
                    <td class="text-end pe-4">
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteSupplier(${s.id})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });

    } catch (error) {
        console.error(error);
        loading.innerHTML = '<p class="text-danger">Error al cargar datos</p>';
    }
}

async function handleAddSupplier(e) {
    e.preventDefault();
    const btn = document.querySelector('.btn-submit');
    
    const data = {
        name: document.getElementById('name').value,
        contact_name: document.getElementById('contactName').value,
        phone: document.getElementById('phone').value,
        email: document.getElementById('email').value,
        address: document.getElementById('address').value
    };

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

    try {
        const response = await fetch(`${API_URL}/suppliers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error('Error al guardar');

        showToast('Proveedor agregado');
        document.getElementById('addSupplierForm').reset();
        loadSuppliers();

    } catch (error) {
        showToast('Error al guardar proveedor', true);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-plus-circle me-2"></i> Registrar';
    }
}

window.deleteSupplier = async function(id) {
    if (!confirm('¿Eliminar este proveedor?')) return;
    try {
        const response = await fetch(`${API_URL}/suppliers/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        if (!response.ok) {
            const data = await response.json();
            showToast(data.message || 'Error al eliminar', true);
            return;
        }
        loadSuppliers();
    } catch (error) {
        showToast('Error de conexión', true);
    }
}
