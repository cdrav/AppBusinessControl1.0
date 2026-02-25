// Add Inventory Page JavaScript
const API_URL = ''; // Ruta relativa para producción

document.addEventListener('DOMContentLoaded', function() {
    // Cargar proveedores
    loadSuppliers();

    // Efecto de entrada para los inputs
    document.querySelectorAll('.form-control').forEach((input, index) => {
      input.style.animationDelay = `${index * 0.1}s`;
      input.classList.add('fade-in');
    });

    // Calcular valor total automáticamente
    document.getElementById('productQuantity').addEventListener('input', calculateTotal);
    document.getElementById('productPrice').addEventListener('input', calculateTotal);

    // Manejar el envío del formulario
    document.getElementById('addProductForm').addEventListener('submit', handleAddProduct);
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

function calculateTotal() {
    const quantity = parseFloat(document.getElementById('productQuantity').value) || 0;
    const price = parseFloat(document.getElementById('productPrice').value) || 0;
    const total = quantity * price;
    // Podrías mostrar este total en la UI si lo deseas
}

async function handleAddProduct(event) {
    event.preventDefault();

    const submitBtn = document.querySelector('.btn-submit');
    const messageDiv = document.getElementById('message');
    
    // Uso seguro de elementos (evita el error null)
    const barcodeInput = document.getElementById('productBarcode');
    const barcode = barcodeInput ? barcodeInput.value.trim() : '';
    
    const name = document.getElementById('productName').value;
    const quantity = document.getElementById('productQuantity').value;
    const price = document.getElementById('productPrice').value;
    const cost = document.getElementById('productCost') ? document.getElementById('productCost').value : 0; // Nuevo campo
    const category = document.getElementById('productCategory').value;
    const supplierId = document.getElementById('productSupplier').value;
    const description = document.getElementById('productDescription').value;

    // Validación básica
    if (!name || !quantity || !price) {
      messageDiv.innerHTML = '<div class="alert alert-danger">Por favor completa todos los campos obligatorios</div>';
      return;
    }

    // Mostrar loading state
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    messageDiv.innerHTML = '';

    try {
      const response = await fetch(`${API_URL}/inventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ 
            name, 
            quantity, 
            price, 
            cost, 
            category, 
            supplier_id: supplierId, 
            description, 
            barcode 
        }),
      });

      if (!response.ok) {
        // Leemos el mensaje de error específico del servidor
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al agregar el producto');
      }

      messageDiv.innerHTML = '<div class="alert alert-success">¡Producto agregado con éxito!</div>';
      document.getElementById('addProductForm').reset();
      
      setTimeout(() => window.location.href = 'inventarios.html', 1500);
      
    } catch (error) {
      console.error('Error:', error.message);
      // Mostramos el mensaje de error específico
      messageDiv.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
    } finally {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    }
}