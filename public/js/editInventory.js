// Edit Inventory Page JavaScript
const API_URL = ''; // Ruta relativa para producción
const params = new URLSearchParams(window.location.search);
const productId = params.get('id');

document.addEventListener('DOMContentLoaded', async function() {
    if (!productId) {
        showToast('ID de producto no especificado', true);
        window.location.href = 'inventarios.html';
        return;
    }

    await loadSuppliers(); // Cargar proveedores antes de los datos del producto
    loadProductData();

    document.getElementById('editProductForm').addEventListener('submit', handleEditProduct);
});

async function loadSuppliers() {
    try {
        const response = await fetch(`${API_URL}/suppliers`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const suppliers = await response.json();
        const select = document.getElementById('productSupplier');
        if (select) {
            suppliers.forEach(s => {
                select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
            });
        }
    } catch (e) { console.error('Error cargando proveedores', e); }
}

async function loadProductData() {
    try {
        const response = await fetch(`${API_URL}/inventory/${productId}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Error al cargar el producto');

        const product = await response.json();

        document.getElementById('productId').value = product.id;
        document.getElementById('productBarcode').value = product.barcode || '';
        document.getElementById('productName').value = product.product_name;
        document.getElementById('productQuantity').value = product.stock;
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productCost').value = product.cost || 0;
        document.getElementById('productCategory').value = product.category || '';
        document.getElementById('productSupplier').value = product.supplier_id || '';
        document.getElementById('productDescription').value = product.description || '';

    } catch (error) {
        console.error('Error:', error);
        showToast('No se pudo cargar la información del producto.', true);
    }
}

async function handleEditProduct(event) {
    event.preventDefault();

    const submitBtn = document.querySelector('.btn-submit');
    
    const productData = {
        barcode: document.getElementById('productBarcode').value.trim(),
        name: document.getElementById('productName').value,
        quantity: document.getElementById('productQuantity').value,
        price: document.getElementById('productPrice').value,
        cost: document.getElementById('productCost').value,
        category: document.getElementById('productCategory').value,
        supplier_id: document.getElementById('productSupplier').value,
        description: document.getElementById('productDescription').value
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';

    try {
        const response = await fetch(`${API_URL}/inventory/${productId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('token')}`,
            },
            body: JSON.stringify(productData),
        });

        if (!response.ok) throw new Error('Error al actualizar el producto');

        showToast('¡Producto actualizado correctamente!');
        setTimeout(() => window.location.href = 'inventarios.html', 1500);

    } catch (error) {
        showToast(error.message || 'Error al actualizar', true);
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-save me-2"></i> Guardar Cambios';
    }
}