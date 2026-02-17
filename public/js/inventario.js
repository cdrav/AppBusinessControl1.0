// Lógica para la página de inventario
const API_URL = ''; // Ruta relativa para producción
const INVENTORY_ENDPOINT = `${API_URL}/inventory`;
let allProducts = [];
let userRole = 'cajero'; // Valor por defecto seguro

// Cargar inventario al inicio
document.addEventListener('DOMContentLoaded', function() {
  setupUserSession();
  loadInventory();
  setupEventListeners();
});

function setupUserSession() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userRole = payload.role;

        // Ocultar elementos exclusivos de admin (como el botón Agregar)
        if (userRole !== 'admin') {
            const adminElements = document.querySelectorAll('.admin-only');
            adminElements.forEach(el => {
                el.style.display = 'none';
            });
        }
    } catch (e) {
        console.error('Error decodificando el token:', e);
    }
}

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', filterInventory);
  }
}

// Función para cargar inventario
async function loadInventory() {
  const loadingState = document.getElementById('loadingState');

  try {
    const response = await fetch(INVENTORY_ENDPOINT, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });

    if (response.status === 401 || response.status === 403) {
      window.location.href = 'login.html';
      return;
    }

    if (!response.ok) {
      throw new Error('Error al cargar el inventario');
    }

    allProducts = await response.json();

    loadingState.style.display = 'none';
    renderInventory(allProducts);
    
  } catch (error) {
    console.error('Error:', error.message);
    loadingState.innerHTML = '<div class="alert alert-danger">Error al cargar el inventario. Intente nuevamente.</div>';
  }
}

function renderInventory(products) {
  const grid = document.querySelector('#inventoryGrid');
  const emptyState = document.getElementById('emptyState');
  
  grid.innerHTML = '';

  if (products.length === 0) {
    emptyState.style.display = 'block';
    grid.style.display = 'none';
    // Si la búsqueda no arroja resultados, actualizamos el mensaje del emptyState
    if (allProducts.length > 0) {
        emptyState.innerHTML = `<div class="alert-custom"><i class="bi bi-search"></i> No se encontraron productos que coincidan con la búsqueda.</div>`;
    }
  } else {
    emptyState.style.display = 'none';
    grid.style.display = 'flex';
    
    let totalProducts = 0;
    let totalStock = 0;
    let lowStockCount = 0;
    let totalValue = 0;

    products.forEach((product, index) => {
      const stockLevel = product.stock < 10 ? 'low' : product.stock < 50 ? 'medium' : 'high';
      const stockBadge = `stock-${stockLevel}`;
      const stockText = product.stock < 10 ? 'Bajo' : product.stock < 50 ? 'Medio' : 'Alto';
      
      // Generar botones solo si es admin
      let actionButtons = '';
      if (userRole === 'admin') {
        actionButtons = `
          <div class="d-flex gap-2 pt-3 border-top">
            <button class="btn btn-light flex-fill text-primary btn-sm" onclick="editProduct(${product.id})">
              <i class="bi bi-pencil me-1"></i> Editar
            </button>
            <button class="btn btn-light flex-fill text-danger btn-sm" onclick="deleteProduct(${product.id})">
              <i class="bi bi-trash me-1"></i> Eliminar
            </button>
          </div>
        `;
      }

      const totalProductValue = product.stock * product.price;
      const barcodeHtml = product.barcode ? `<div class="mb-2"><span class="badge bg-light text-dark border"><i class="bi bi-upc-scan me-1"></i>${product.barcode}</span></div>` : '';
      
      const cardHtml = `
        <div class="col-md-6 col-lg-4 fade-in">
          <div class="card h-100 border-0 shadow-sm" style="border-radius: 15px;">
            <div class="card-body p-4">
              <div class="d-flex justify-content-between align-items-start mb-3">
                <div class="d-flex align-items-center">
                  <div class="rounded-circle bg-light p-2 me-3 text-primary">
                    <i class="bi bi-box-seam fs-4"></i>
                  </div>
                  <div>
                    <h5 class="card-title mb-0 fw-bold">${product.product_name}</h5>
                    <small class="text-muted">ID: #${product.id || index + 1}</small>
                  </div>
                </div>
                <span class="stock-badge ${stockBadge}">${stockText}</span>
              </div>
              ${barcodeHtml}
              
              <div class="row g-2 mb-4">
                <div class="col-6">
                  <small class="text-muted d-block">Precio</small>
                  <span class="fw-bold">$${parseFloat(product.price).toFixed(2)}</span>
                </div>
                <div class="col-6">
                  <small class="text-muted d-block">Stock</small>
                  <span class="fw-bold">${product.stock} un.</span>
                </div>
              </div>
              ${actionButtons}
            </div>
          </div>
        </div>
      `;
      grid.insertAdjacentHTML('beforeend', cardHtml);

      totalProducts++;
      totalStock += product.stock;
      if (product.stock < 10) lowStockCount++;
      totalValue += totalProductValue;
    });

    document.getElementById('totalProducts').textContent = totalProducts;
    document.getElementById('totalStock').textContent = totalStock;
    document.getElementById('lowStock').textContent = lowStockCount;
    document.getElementById('totalValue').textContent = `$${totalValue.toFixed(2)}`;
  }
}

function filterInventory() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  
  const filteredProducts = allProducts.filter(product => 
    product.product_name.toLowerCase().includes(searchTerm) ||
    (product.barcode && product.barcode.toLowerCase().includes(searchTerm)) ||
    (product.category && product.category.toLowerCase().includes(searchTerm)) ||
    (product.description && product.description.toLowerCase().includes(searchTerm))
  );
  
  renderInventory(filteredProducts);
}

async function deleteProduct(id) {
  if (!confirm('¿Estás seguro de eliminar este producto?')) return;

  try {
    const response = await fetch(`${INVENTORY_ENDPOINT}/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!response.ok) throw new Error('Error al eliminar el producto');
    loadInventory(); // Recargar todo desde el servidor para asegurar consistencia
  } catch (error) {
    console.error('Error:', error.message);
  }
}

function editProduct(id) {
  window.location.href = `editInventory.html?id=${id}`;
}

async function exportInventory() {
  try {
    const response = await fetch(`${API_URL}/inventory/export`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });

    if (!response.ok) throw new Error('Error al exportar');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventario_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (error) {
    alert('No se pudo descargar el archivo: ' + error.message);
  }
}