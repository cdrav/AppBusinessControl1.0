// Lógica para la página de inventario
const API_URL = (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? CONFIG.API_URL : 'http://localhost:3000';
const INVENTORY_ENDPOINT = `${API_URL}/inventory`;

// Cargar inventario al inicio
document.addEventListener('DOMContentLoaded', function() {
  loadInventory();
});

// Función para cargar inventario
async function loadInventory() {
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  const grid = document.querySelector('#inventoryGrid');

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

    const products = await response.json();

    loadingState.style.display = 'none';
    grid.innerHTML = '';

    if (products.length === 0) {
      emptyState.style.display = 'block';
      grid.style.display = 'none';
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
        
        const totalProductValue = product.stock * product.price;
        
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
                
                <div class="row g-2 mb-4">
                  <div class="col-6">
                    <small class="text-muted d-block">Precio</small>
                    <span class="fw-bold">$${product.price.toFixed(2)}</span>
                  </div>
                  <div class="col-6">
                    <small class="text-muted d-block">Stock</small>
                    <span class="fw-bold">${product.stock} un.</span>
                  </div>
                </div>

                <div class="d-flex gap-2 pt-3 border-top">
                  <button class="btn btn-light flex-fill text-primary btn-sm" onclick="editProduct(${product.id})">
                    <i class="bi bi-pencil me-1"></i> Editar
                  </button>
                  <button class="btn btn-light flex-fill text-danger btn-sm" onclick="deleteProduct(${product.id})">
                    <i class="bi bi-trash me-1"></i> Eliminar
                  </button>
                </div>
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
  } catch (error) {
    console.error('Error:', error.message);
    loadingState.innerHTML = '<div class="alert alert-danger">Error al cargar el inventario. Intente nuevamente.</div>';
  }
}

async function deleteProduct(id) {
  if (!confirm('¿Estás seguro de eliminar este producto?')) return;

  try {
    const response = await fetch(`${INVENTORY_ENDPOINT}/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!response.ok) throw new Error('Error al eliminar el producto');
    loadInventory();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

function editProduct(id) {
  window.location.href = `editInventory.html?id=${id}`;
}