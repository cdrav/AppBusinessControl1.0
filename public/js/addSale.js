// Variables globales
let products = [];
let clients = [];

// Cargar datos al iniciar
document.addEventListener('DOMContentLoaded', function() {
  loadClients();
  loadProducts();
  setTodayDate();
});

// Establecer fecha actual
function setTodayDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('saleDate').value = today;
}

// Cargar clientes
async function loadClients() {
  try {
    const response = await fetch('http://localhost:3000/clients', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (response.ok) {
      clients = await response.json();
      const select = document.getElementById('clientId');
      clients.forEach(client => {
        select.innerHTML += `<option value="${client.id}">${client.name}</option>`;
      });
    }
  } catch (error) {
    console.error('Error al cargar clientes:', error);
  }
}

// Cargar productos
async function loadProducts() {
  try {
    const response = await fetch('http://localhost:3000/inventory', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (response.ok) {
      products = await response.json();
      updateProductSelects();
    }
  } catch (error) {
    console.error('Error al cargar productos:', error);
  }
}

// Llenar un select específico con opciones de productos
function populateProductSelect(selectElement) {
  const currentValue = selectElement.value;
  // Guardamos la opción por defecto
  selectElement.innerHTML = '<option value="">Selecciona un producto</option>';
  
  if (products.length > 0) {
    products.forEach(product => {
      const option = document.createElement('option');
      option.value = product.id;
      option.dataset.price = product.price;
      option.dataset.stock = product.stock;
      option.textContent = `${product.product_name} (Stock: ${product.stock})`;
      selectElement.appendChild(option);
    });
  }
  selectElement.value = currentValue;
}

// Actualizar todos los selects (solo se llama al cargar productos inicialmente)
function updateProductSelects() {
  document.querySelectorAll('.product-select').forEach(select => {
    populateProductSelect(select);
  });
}

// Agregar campo de producto
function addProductField() {
  const container = document.getElementById('productsContainer');
  const productCount = container.children.length;
  
  const productItem = document.createElement('div');
  productItem.className = 'product-item';
  productItem.innerHTML = `
    <div class="product-info">
      <select class="form-control product-select" required style="width: 250px;">
        <option value="">Selecciona un producto</option>
      </select>
    </div>
    <div class="d-flex align-items-center gap-3">
      <input type="number" class="form-control quantity-input" placeholder="Cantidad" min="1" required style="width: 100px;">
      <span class="product-price">$0.00</span>
      <button type="button" class="btn btn-danger btn-sm remove-product">
        <i class="bi bi-trash"></i>
      </button>
    </div>
  `;
  
  container.appendChild(productItem);
  
  // Llenar solo el nuevo select, no recargar todos
  populateProductSelect(productItem.querySelector('.product-select'));
  
  // Agregar event listeners
  productItem.querySelector('.product-select').addEventListener('change', updateSummary);
  productItem.querySelector('.quantity-input').addEventListener('input', (e) => {
    validateStock(e.target);
    updateSummary();
  });
  productItem.querySelector('.remove-product').addEventListener('click', function() {
    productItem.remove();
    updateSummary();
  });
}

// Validar stock en tiempo real
function validateStock(inputElement) {
  const row = inputElement.closest('.product-item');
  const select = row.querySelector('.product-select');
  const selectedOption = select.options[select.selectedIndex];
  
  if (selectedOption && selectedOption.value) {
    const stock = parseInt(selectedOption.dataset.stock || 0);
    const quantity = parseInt(inputElement.value || 0);
    
    if (quantity > stock) {
      inputElement.classList.add('is-invalid'); // Clase de Bootstrap para error
      // Opcional: mostrar mensaje visual
    } else {
      inputElement.classList.remove('is-invalid');
    }
  }
}

// Actualizar resumen
function updateSummary() {
  let subtotal = 0;
  
  document.querySelectorAll('.product-item').forEach(item => {
    const select = item.querySelector('.product-select');
    const quantity = parseInt(item.querySelector('.quantity-input').value) || 0;
    const price = parseFloat(select.options[select.selectedIndex]?.dataset.price) || 0;
    const total = price * quantity;
    
    item.querySelector('.product-price').textContent = `$${total.toFixed(2)}`;
    subtotal += total;
  });
  
  const tax = subtotal * 0.16;
  const total = subtotal + tax;
  
  document.getElementById('subtotal').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('tax').textContent = `$${tax.toFixed(2)}`;
  document.getElementById('total').textContent = `$${total.toFixed(2)}`;
}

// Event listeners para el primer producto
document.querySelector('.product-select').addEventListener('change', updateSummary);
document.querySelector('.quantity-input').addEventListener('input', (e) => {
  validateStock(e.target);
  updateSummary();
});
document.querySelector('.remove-product').addEventListener('click', function() {
  if (document.querySelectorAll('.product-item').length > 1) {
    this.closest('.product-item').remove();
    updateSummary();
  }
});

// Manejar envío del formulario
document.getElementById('addSaleForm').addEventListener('submit', async function(event) {
  event.preventDefault();
  
  const submitBtn = document.querySelector('.btn-submit');
  const messageDiv = document.getElementById('message');
  
  // Validar productos
  const saleProducts = [];
  let hasError = false;
  
  document.querySelectorAll('.product-item').forEach(item => {
    const productId = item.querySelector('.product-select').value;
    const quantity = parseInt(item.querySelector('.quantity-input').value);
    
    if (productId && quantity) {
      const product = products.find(p => p.id == productId);
      if (product && quantity <= product.stock) {
        saleProducts.push({ productId, quantity });
      } else {
        hasError = true;
        messageDiv.innerHTML = '<div class="alert alert-danger">Stock insuficiente para uno de los productos</div>';
      }
    }
  });
  
  if (hasError || saleProducts.length === 0) {
    if (!hasError) {
      messageDiv.innerHTML = '<div class="alert alert-danger">Debes agregar al menos un producto</div>';
    }
    return;
  }
  
  const saleData = {
    clientId: document.getElementById('clientId').value,
    products: saleProducts,
    saleDate: document.getElementById('saleDate').value
  };
  
  // Mostrar loading
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  messageDiv.innerHTML = '';
  
  try {
    const response = await fetch('http://localhost:3000/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(saleData),
    });
    
    const data = await response.json();
    
    if (response.ok) {
      messageDiv.innerHTML = '<div class="alert alert-success">¡Venta registrada con éxito!</div>';
      document.getElementById('addSaleForm').reset();
      setTodayDate();
      
      // Resetear productos
      document.getElementById('productsContainer').innerHTML = `
        <div class="product-item">
          <div class="product-info">
            <select class="form-control product-select" required style="width: 250px;">
              <option value="">Selecciona un producto</option>
            </select>
          </div>
          <div class="d-flex align-items-center gap-3">
            <input type="number" class="form-control quantity-input" placeholder="Cantidad" min="1" required style="width: 100px;">
            <span class="product-price">$0.00</span>
            <button type="button" class="btn btn-danger btn-sm remove-product">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      `;
      
      updateProductSelects();
      updateSummary();
      
      // Re-agregar event listeners
      document.querySelector('.product-select').addEventListener('change', updateSummary);
      document.querySelector('.quantity-input').addEventListener('input', updateSummary);
      document.querySelector('.remove-product').addEventListener('click', function() {
        if (document.querySelectorAll('.product-item').length > 1) {
          this.closest('.product-item').remove();
          updateSummary();
        }
      });
      
      setTimeout(() => {
        window.location.href = 'ventas.html';
      }, 2000);
    } else {
      throw new Error(data.message || 'Error al registrar la venta');
    }
  } catch (error) {
    console.error('Error:', error);
    messageDiv.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
});