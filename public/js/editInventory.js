// Edit Inventory Page JavaScript
const API_URL = 'http://localhost:3000';
const params = new URLSearchParams(window.location.search);
const productId = params.get('id');

document.addEventListener('DOMContentLoaded', function() {
    if (!productId) {
        alert('ID de producto no especificado');
        window.location.href = 'inventarios.html';
        return;
    }

    loadProductData();

    document.getElementById('editProductForm').addEventListener('submit', handleEditProduct);
});

async function loadProductData() {
    try {
        const response = await fetch(`${API_URL}/inventory/${productId}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Error al cargar el producto');

        const product = await response.json();

        document.getElementById('productId').value = product.id;
        document.getElementById('productName').value = product.product_name;
        document.getElementById('productQuantity').value = product.stock;
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productCategory').value = product.category || '';
        document.getElementById('productDescription').value = product.description || '';

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('message').innerHTML = '<div class="alert alert-danger">No se pudo cargar la información del producto.</div>';
    }
}

async function handleEditProduct(event) {
    event.preventDefault();

    const submitBtn = document.querySelector('.btn-submit');
    const messageDiv = document.getElementById('message');
    
    const productData = {
        name: document.getElementById('productName').value,
        quantity: document.getElementById('productQuantity').value,
        price: document.getElementById('productPrice').value,
        category: document.getElementById('productCategory').value,
        description: document.getElementById('productDescription').value
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';
    messageDiv.innerHTML = '';

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

        messageDiv.innerHTML = '<div class="alert alert-success">¡Producto actualizado correctamente!</div>';
        setTimeout(() => window.location.href = 'inventarios.html', 1500);

    } catch (error) {
        messageDiv.innerHTML = `<div class="alert alert-danger">${error.message || 'Error al actualizar'}</div>`;
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-save me-2"></i> Guardar Cambios';
    }
}