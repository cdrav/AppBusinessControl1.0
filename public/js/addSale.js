// Variables globales
const API_URL = ''; // Ruta relativa para producción
let products = [];
let clients = [];
let currentCoupon = null; // Almacenar cupón activo

// Cargar datos al iniciar
document.addEventListener('DOMContentLoaded', function() {
  loadClients();
  loadProducts();
  setTodayDate();
  setupBarcodeScanner();
  
  // Listener para cálculo de cambio
  document.getElementById('amountPaid').addEventListener('input', calculateChange);
});

// Establecer fecha actual
function setTodayDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  document.getElementById('saleDate').value = today;
}

function setupBarcodeScanner() {
    const scannerInput = document.getElementById('barcodeScannerInput');
    if (scannerInput) {
        // Usamos 'change' porque los scanners suelen simular un Enter al final.
        scannerInput.addEventListener('change', handleBarcodeScan); 
    }
}

async function handleBarcodeScan() {
    const barcode = this.value.trim();
    const scanMessage = document.getElementById('scanMessage');
    if (!barcode) return;

    scanMessage.innerHTML = `<span class="text-muted">Buscando...</span>`;

    try {
        const response = await fetch(`${API_URL}/inventory/barcode/${barcode}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) {
            if (response.status === 404) {
                scanMessage.innerHTML = `<span class="text-danger fw-bold">Producto no encontrado.</span>`;
            } else {
                throw new Error('Error del servidor');
            }
            return;
        }

        const product = await response.json();
        scanMessage.innerHTML = `<span class="text-success fw-bold">Agregado: ${product.product_name}</span>`;
        addProductToSale(product);

    } catch (error) {
        console.error('Error al escanear:', error);
        scanMessage.innerHTML = `<span class="text-danger fw-bold">Error al buscar producto.</span>`;
    } finally {
        // Limpiar y re-enfocar para el siguiente escaneo
        this.value = ''; 
        this.focus(); 
    }
}

// Cargar clientes
async function loadClients() {
  try {
    const response = await fetch(`${API_URL}/clients`, {
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
    const response = await fetch(`${API_URL}/inventory/for-sale`, {
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
      <input type="number" class="form-control quantity-input" placeholder="Cantidad" min="1" required style="width: 130px;">
      <span class="product-price">$0</span>
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

function addProductToSale(product) {
    const container = document.getElementById('productsContainer');
    let productExists = false;

    // 1. Revisa si el producto ya está en la lista y, si es así, incrementa la cantidad.
    container.querySelectorAll('.product-item').forEach(item => {
        if (productExists) return; // Optimización para no seguir buscando
        const select = item.querySelector('.product-select');
        if (select.value == product.id) {
            const quantityInput = item.querySelector('.quantity-input');
            const currentQuantity = parseInt(quantityInput.value) || 0;
            quantityInput.value = currentQuantity + 1;
            productExists = true;
        }
    });

    if (productExists) {
        updateSummary();
        return; // Termina la función si ya se actualizó un producto existente.
    }

    // 2. Si no existe, busca la primera fila vacía para usarla.
    let emptyRowUsed = false;
    container.querySelectorAll('.product-item').forEach(item => {
        if (emptyRowUsed) return;
        const select = item.querySelector('.product-select');
        if (!select.value) { // Si el select no tiene valor, la fila está vacía.
            select.value = product.id;
            const quantityInput = item.querySelector('.quantity-input');
            quantityInput.value = 1;
            emptyRowUsed = true;
        }
    });

    // 3. Si no se encontró una fila vacía, crea una nueva.
    if (!emptyRowUsed) {
        addProductField(); // Crea y añade una nueva fila de producto.
        const newRow = container.lastElementChild;
        const select = newRow.querySelector('.product-select');
        const quantityInput = newRow.querySelector('.quantity-input');
        
        select.value = product.id;
        quantityInput.value = 1;
    }

    updateSummary(); // Finalmente, actualiza el resumen total.
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

// Aplicar cupón
window.applyCoupon = async function() {
    const code = document.getElementById('couponCode').value.trim().toUpperCase();
    const msgDiv = document.getElementById('couponMessage');
    
    if (!code) return;

    try {
        const response = await fetch(`${API_URL}/coupons/validate/${code}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });

        if (response.ok) {
            currentCoupon = await response.json();
            msgDiv.innerHTML = `<span class="text-success"><i class="bi bi-check-circle"></i> Cupón aplicado: ${currentCoupon.discount_type === 'percent' ? currentCoupon.value + '%' : '$' + currentCoupon.value}</span>`;
            updateSummary();
        } else {
            currentCoupon = null;
            const err = await response.json();
            msgDiv.innerHTML = `<span class="text-danger">${err.message}</span>`;
            updateSummary();
        }
    } catch (error) {
        console.error(error);
        msgDiv.innerHTML = `<span class="text-danger">Error al validar</span>`;
    }
}

// Actualizar resumen
function updateSummary() {
  let subtotal = 0;
  const formatCurrency = (amount) => parseFloat(amount || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  
  document.querySelectorAll('.product-item').forEach(item => {
    const select = item.querySelector('.product-select');
    const quantity = parseInt(item.querySelector('.quantity-input').value) || 0;
    const price = parseFloat(select.options[select.selectedIndex]?.dataset.price) || 0;
    const total = price * quantity;
    
    item.querySelector('.product-price').textContent = formatCurrency(total);
    subtotal += total;
  });
  
  // Calcular descuento
  let discount = 0;
  if (currentCoupon) {
      if (currentCoupon.discount_type === 'percent') {
          discount = subtotal * (currentCoupon.value / 100);
      } else {
          discount = parseFloat(currentCoupon.value);
      }
      // Mostrar fila de descuento
      document.getElementById('discountRow').style.display = 'flex';
      document.getElementById('discountValue').textContent = `-${formatCurrency(discount)}`;
  } else {
      document.getElementById('discountRow').style.display = 'none';
  }

  const tax = 0; // Impuesto eliminado (0%)
  const total = Math.max(0, (subtotal - discount) + tax);
  
  document.getElementById('subtotal').textContent = formatCurrency(subtotal);
  document.getElementById('tax').textContent = formatCurrency(tax);
  const totalEl = document.getElementById('total');
  totalEl.textContent = formatCurrency(total);
  totalEl.dataset.value = total; // Guardamos el valor crudo para cálculos
  
  // Recalcular cambio si cambia el total
  calculateChange();
}

function calculateChange() {
    const total = parseFloat(document.getElementById('total').dataset.value) || 0;
    const paid = parseFloat(document.getElementById('amountPaid').value) || 0;
    
    const change = Math.max(0, paid - total);
    document.getElementById('changeAmount').textContent = change.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
    saleDate: document.getElementById('saleDate').value,
    couponCode: currentCoupon ? currentCoupon.code : null,
    notes: document.getElementById('saleNotes').value
  };
  
  // Mostrar loading
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  messageDiv.innerHTML = '';
  
  try {
    const response = await fetch(`${API_URL}/sales`, {
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
            <input type="number" class="form-control quantity-input" placeholder="Cantidad" min="1" required style="width: 130px;">
            <span class="product-price">$0</span>
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