// Variables globales
import { apiFetch } from './api.js';
let products = [];
let clients = [];
let currentCoupon = null; // Almacenar cupón activo

// Cargar datos al iniciar
document.addEventListener('DOMContentLoaded', function() {
  injectSuccessModal();
  loadClients();
  loadProducts();
  setTodayDate();
  setupBarcodeScanner();
  
  // Listener para cálculo de cambio
  const amountPaidInput = document.getElementById('amountPaid');
  if(amountPaidInput) amountPaidInput.addEventListener('input', calculateChange);

  // Enfocar el campo de código de barras de forma segura al cargar la página
  const scannerInput = document.getElementById('barcodeScannerInput');
  if (scannerInput) setTimeout(() => scannerInput.focus(), 150);
});

// Inyectar el modal de éxito en el DOM para no modificar el HTML
function injectSuccessModal() {
    if (document.getElementById('saleSuccessModal')) return;

    const modalHtml = `
    <div class="modal fade" id="saleSuccessModal" tabindex="-1" aria-labelledby="saleSuccessModalLabel" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg" style="border-radius: 1rem;">
          <div class="modal-body text-center p-4 p-lg-5">
            <div class="mb-4">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-success">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/>
                </svg>
            </div>
            <h3 class="modal-title fw-bold" id="saleSuccessModalLabel">¡Venta Exitosa!</h3>
            <p class="text-muted mt-2">La venta ha sido registrada correctamente.</p>
            
            <div class="bg-light p-3 rounded mt-4">
                <div class="d-flex justify-content-between align-items-center">
                    <span class="text-muted">Total Pagado:</span>
                    <span class="fw-bold fs-5" id="modalTotalPaid"></span>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-2">
                    <span class="text-muted">Cambio a devolver:</span>
                    <span class="fw-bold fs-5 text-primary" id="modalChange"></span>
                </div>
            </div>

            <div class="d-grid gap-2 mt-4">
                <button type="button" class="btn btn-primary" onclick="window.location.href='ventas.html'">Ver Historial de Ventas</button>
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" onclick="resetSaleForm()">Registrar Nueva Venta</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Función para resetear el formulario desde el modal
window.resetSaleForm = function() {
    document.getElementById('addSaleForm').reset();
    setTodayDate();
    currentCoupon = null; // Limpiar cupón
    document.getElementById('couponMessage').innerHTML = '';
    
    // Resetear la primera fila de producto y eliminar las adicionales
    const productsContainer = document.getElementById('productsContainer');
    while (productsContainer.children.length > 1) {
        productsContainer.removeChild(productsContainer.lastChild);
    }
    const firstItem = productsContainer.querySelector('.product-item');
    if (firstItem) {
        firstItem.querySelector('.product-select').value = '';
        firstItem.querySelector('.quantity-input').value = '';
    }
    
    updateSummary();

    // Re-enfocar el scanner
    const scannerInput = document.getElementById('barcodeScannerInput');
    if (scannerInput) scannerInput.focus();
}

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
        const response = await apiFetch(`/inventory/barcode/${barcode}`);
        if (!response) {
            if (response.status === 404) {
                scanMessage.innerHTML = `<span class="text-danger fw-bold">Producto no encontrado.</span>`;
            } else {
                throw new Error('Error del servidor');
            }
            return;
        }

        const product = response;
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
    const data = await apiFetch('/clients');
    if (data) {
      clients = data;
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
  const urlParams = new URLSearchParams(window.location.search);
  const branchId = urlParams.get('branch_id');
  const endpoint = branchId ? `${API_URL}/inventory/for-sale?branch_id=${branchId}` : `${API_URL}/inventory/for-sale`;
  try {
    const data = await apiFetch(endpoint);
    if (data) {
      products = data;
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
        const data = await apiFetch(`/coupons/validate/${code}`);
        if (data) {
            currentCoupon = data;
            msgDiv.innerHTML = `<span class="text-success"><i class="bi bi-check-circle"></i> Cupón aplicado: ${currentCoupon.discount_type === 'percent' ? currentCoupon.value + '%' : '$' + currentCoupon.value}</span>`;
            updateSummary();
        } else {
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

// Event listener para checkbox de crédito
document.addEventListener('DOMContentLoaded', function() {
  // ... código existente ...
  
  // Agregar listener para mostrar/ocultar detalles de crédito
  const isCreditCheckbox = document.getElementById('isCredit');
  const creditDetails = document.getElementById('creditDetails');
  
  if (isCreditCheckbox && creditDetails) {
    isCreditCheckbox.addEventListener('change', function() {
      creditDetails.style.display = this.checked ? 'block' : 'none';
    });
  }
});

// Manejar envío del formulario
document.getElementById('addSaleForm').addEventListener('submit', async function(event) {
  event.preventDefault();
  
  const submitBtn = document.querySelector('.btn-submit');
  
  // Validar productos
  const saleProducts = [];
  let errorMessage = '';
  
  document.querySelectorAll('.product-item').forEach(item => {
    const productId = item.querySelector('.product-select').value;
    const quantity = parseInt(item.querySelector('.quantity-input').value);
    
    if (productId && quantity) {
      const product = products.find(p => p.id == productId);
      if (product && quantity <= product.stock) {
        saleProducts.push({ productId, quantity });
      } else {
        errorMessage = 'Stock insuficiente para uno de los productos';
      }
    }
  });
  
  if (errorMessage || saleProducts.length === 0) {
    showToast(errorMessage || 'Debes agregar al menos un producto', true);
    return;
  }

  // Validar Monto Recibido (Obligatorio)
  const total = parseFloat(document.getElementById('total').dataset.value) || 0;
  const amountPaid = parseFloat(document.getElementById('amountPaid').value);

  if (isNaN(amountPaid) || amountPaid < total) {
      showToast('El monto recibido es obligatorio y debe cubrir el total.', true);
      document.getElementById('amountPaid').focus();
      return;
  }
  
  const urlParams = new URLSearchParams(window.location.search);
  const branchId = urlParams.get('branch_id');

  const saleData = {
    clientId: document.getElementById('clientId').value,
    products: saleProducts,
    saleDate: document.getElementById('saleDate').value,
    couponCode: currentCoupon ? currentCoupon.code : null,
    notes: document.getElementById('saleNotes').value,
    is_credit: document.getElementById('isCredit')?.checked || false,
    initialPayment: document.getElementById('initialPayment')?.value || null,
    branchId: branchId // Enviar la sede si existe en la URL (solo funcionará si es admin en el backend)
  };
  
  // Mostrar loading
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  
  try {
    const data = await apiFetch('/sales', {
      method: 'POST',
      body: JSON.stringify(saleData),
    });
    
    if (data) {
      const formatCurrency = (amount) => parseFloat(amount || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
      const change = Math.max(0, amountPaid - total);
      
      // Ahora podemos llamar al modal directamente y con seguridad.
      document.getElementById('modalTotalPaid').textContent = formatCurrency(total);
      document.getElementById('modalChange').textContent = formatCurrency(change);
      
      const successModalEl = document.getElementById('saleSuccessModal');
      const successModal = bootstrap.Modal.getOrCreateInstance(successModalEl);
      successModal.show();

    } else {
      throw new Error(data.message || 'Error al registrar la venta');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast(error.message, true);
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
});