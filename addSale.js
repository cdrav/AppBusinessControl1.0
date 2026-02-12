// Add Sale Page JavaScript
const API_URL = (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? CONFIG.API_URL : 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', function() {
  loadClients();
  loadProductsForSelect(); // Cargar productos para el primer select
  setupEventListeners();
  
  // Establecer fecha actual por defecto
  document.getElementById('saleDate').valueAsDate = new Date();
});

function setupEventListeners() {
  document.getElementById('addSaleForm').addEventListener('submit', handleFormSubmit);
  
  // Delegación de eventos para eliminar productos y recalcular
  document.getElementById('productsContainer').addEventListener('click', function(e) {
    if (e.target.closest('.remove-product')) {
      const item = e.target.closest('.product-item');
      if (document.querySelectorAll('.product-item').length > 1) {
        item.remove();
        calculateTotals();
      } else {
        showToast('Debe haber al menos un producto', true); // Usar showToast para consistencia
      }
    }
  });

  document.getElementById('productsContainer').addEventListener('input', function(e) {
    if (e.target.classList.contains('quantity-input') || e.target.classList.contains('product-select')) {
      calculateTotals();
    }
  });
  
  // Evento para cambio de producto (actualizar precio)
  document.getElementById('productsContainer').addEventListener('change', async function(e) {
    if (e.target.classList.contains('product-select')) {
      const select = e.target;
      const productId = select.value;
      const row = select.closest('.product-item');
      const priceSpan = row.querySelector('.product-price');
      
      if (productId) {
        try {
          // En un caso real, idealmente ya tendrías los precios cargados en memoria
          // para no hacer fetch por cada cambio, pero esto funciona.
          const response = await fetch(`${API_URL}/inventory/${productId}`, { // Asumiendo endpoint individual o filtrar de lista
             headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
          });
          // Simplificación: usaremos un atributo data-price en las opciones para evitar múltiples fetchs
          const option = select.options[select.selectedIndex];
          const price = option.dataset.price || 0;
          priceSpan.textContent = `$${parseFloat(price).toFixed(2)}`;
          priceSpan.dataset.value = price;
          calculateTotals();
        } catch (error) {
          console.error(error);
        }
      } else {
        priceSpan.textContent = '$0.00';
        priceSpan.dataset.value = 0;
        calculateTotals();
      }
    }
  });
}

async function loadClients() {
  try {
    const response = await fetch(`${API_URL}/clients`, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    const clients = await response.json();
    const select = document.getElementById('clientId');
    
    clients.forEach(client => {
      const option = document.createElement('option');
      option.value = client.id;
      option.textContent = client.name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading clients:', error);
    showNotification('Error al cargar clientes', 'error');
  }
}

async function loadProductsForSelect(container = document) {
  try {
    const response = await fetch(`${API_URL}/inventory`, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    const products = await response.json();
    
    // Actualizar todos los selects de productos que no tengan opciones (o el específico)
    const selects = container.querySelectorAll('.product-select');
    selects.forEach(select => {
      if (select.options.length <= 1) { // Solo tiene la opción por defecto
        products.forEach(product => {
          const option = document.createElement('option');
          option.value = product.id;
          option.textContent = `${product.product_name} (Stock: ${product.stock})`;
          option.dataset.price = product.price;
          select.appendChild(option);
        });
      }
    });
  } catch (error) {
    console.error('Error loading products:', error);
  }
}

window.addProductField = function() {
  const container = document.getElementById('productsContainer');
  const template = container.querySelector('.product-item').cloneNode(true);
  
  // Limpiar valores
  template.querySelector('.quantity-input').value = '';
  template.querySelector('.product-price').textContent = '$0.00';
  template.querySelector('.product-price').dataset.value = 0;
  template.querySelector('.product-select').value = '';
  
  container.appendChild(template);
}

function calculateTotals() {
  let subtotal = 0;
  const rows = document.querySelectorAll('.product-item');
  
  rows.forEach(row => {
    const quantity = parseFloat(row.querySelector('.quantity-input').value) || 0;
    const price = parseFloat(row.querySelector('.product-price').dataset.value) || 0;
    subtotal += quantity * price;
  });
  
  const tax = subtotal * 0.16; // Ejemplo IVA 16%
  const total = subtotal + tax;
  
  document.getElementById('subtotal').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('tax').textContent = `$${tax.toFixed(2)}`;
  document.getElementById('total').textContent = `$${total.toFixed(2)}`;
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const submitBtn = document.querySelector('.btn-submit');
  const clientId = document.getElementById('clientId').value;
  const saleDate = document.getElementById('saleDate').value;
  const productItems = document.querySelectorAll('.product-item');

  const products = [];
  for (const item of productItems) {
    const productId = item.querySelector('.product-select').value;
    const quantity = parseInt(item.querySelector('.quantity-input').value, 10);

    if (productId && quantity > 0) {
      products.push({ productId, quantity });
    }
  }

  if (!clientId || !saleDate || products.length === 0) {
    showToast('Por favor, completa cliente, fecha y al menos un producto.', true);
    return;
  }

  const saleData = {
    clientId,
    saleDate,
    products
  };

  submitBtn.classList.add('loading');
  submitBtn.disabled = true;

  try {
    const response = await fetch(`${API_URL}/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('token')
      },
      body: JSON.stringify(saleData)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Error al registrar la venta');
    }

    showToast('Venta registrada con éxito', false);
    setTimeout(() => {
      window.location.href = '/ventas.html';
    }, 1500);

  } catch (error) {
    console.error('Error al registrar la venta:', error);
    showToast(error.message, true);
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
}