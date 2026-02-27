// Add Inventory Page JavaScript
const API_URL = ''; // Ruta relativa para producción

document.addEventListener('DOMContentLoaded', function() {
    // Efecto de entrada para los inputs
    loadSuppliers();

    // Enfocar el campo de código de barras de forma segura
    const barcodeInput = document.getElementById('productBarcode');
    if (barcodeInput) setTimeout(() => barcodeInput.focus(), 150);

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
    
    const barcode = document.getElementById('productBarcode').value.trim();
    const name = document.getElementById('productName').value;
    const quantity = document.getElementById('productQuantity').value;
    const price = document.getElementById('productPrice').value;
    const cost = document.getElementById('productCost').value;
    const category = document.getElementById('productCategory').value;
    const supplierId = document.getElementById('productSupplier').value;
    const description = document.getElementById('productDescription').value;

    // Validación básica
    if (!name || !quantity || !price) {
      showToast('Por favor completa todos los campos obligatorios', true);
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
        body: JSON.stringify({ name, quantity, price, cost, category, supplier_id: supplierId, description, barcode }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al agregar el producto');
      }

      showToast('¡Producto agregado con éxito!');
      document.getElementById('addProductForm').reset();
      
      setTimeout(() => window.location.href = 'inventarios.html', 1500);
      
    } catch (error) {
      console.error('Error:', error.message);
      showToast(error.message, true);
    } finally {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    }
}