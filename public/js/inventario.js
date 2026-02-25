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
  injectStockModal(); // Crear el modal dinámicamente
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
    const formatCurrency = (amount) => parseFloat(amount || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

    products.forEach((product, index) => {
      const stockLevel = product.stock < 10 ? 'low' : product.stock < 50 ? 'medium' : 'high';
      const stockBadge = `stock-${stockLevel}`;
      const stockText = product.stock < 10 ? 'Bajo' : product.stock < 50 ? 'Medio' : 'Alto';
      
      // Generar botones solo si es admin
      let actionButtons = '';
      // Escapar comillas dobles y simples para evitar errores en el HTML
      const safeName = product.product_name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
      if (userRole === 'admin') {
        actionButtons = `
          <button class="btn btn-outline-primary w-100 mb-2 btn-sm" onclick="manageStock(${product.id}, '${safeName}')">
            <i class="bi bi-shop me-1"></i> Gestionar Stock por Sede
          </button>
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
                <div class="col-4">
                  <small class="text-muted d-block">Precio</small>
                  <span class="fw-bold">${formatCurrency(product.price || 0)}</span>
                </div>
                <div class="col-4">
                  <small class="text-muted d-block">Costo</small>
                  <span class="fw-bold text-secondary">${formatCurrency(product.cost || 0)}</span>
                </div>
                <div class="col-4">
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
    document.getElementById('totalValue').textContent = formatCurrency(totalValue || 0);
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

window.syncGlobalInventory = async function() {
    if (!confirm('¿Deseas recalcular el inventario global basándote en las sucursales? Esto corregirá discrepancias numéricas.')) return;
    
    try {
        const res = await fetch(`${API_URL}/inventory/sync-global`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message);
            loadInventory();
        } else {
            showToast(data.message, true);
        }
    } catch (e) {
        showToast('Error de conexión', true);
    }
}

// ==========================================
// GESTIÓN DE STOCK POR SEDE
// ==========================================

function injectStockModal() {
    if (document.getElementById('stockModal')) return;

    const modalHtml = `
    <div class="modal fade" id="stockModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow">
          <div class="modal-header bg-light">
            <h5 class="modal-title fw-bold" id="stockModalLabel">Gestión de Stock</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p class="mb-3 text-muted">Producto: <strong id="stockModalProductName" class="text-dark"></strong></p>
            <h6 class="fw-bold text-primary mb-3"><i class="bi bi-arrow-left-right me-2"></i>Transferir Mercancía</h6>
            <p class="small text-muted mb-3">Mueve unidades de una sede a otra manteniendo el inventario global constante.</p>
            <div class="p-3 bg-light rounded mb-4 border">
                <form id="transferForm">
                    <div class="row g-2 align-items-end">
                        <div class="col-4">
                            <label class="small text-muted">Origen</label>
                            <select id="transferFrom" class="form-select form-select-sm"></select>
                        </div>
                        <div class="col-4">
                            <label class="small text-muted">Destino</label>
                            <select id="transferTo" class="form-select form-select-sm"></select>
                        </div>
                        <div class="col-4">
                            <label class="small text-muted">Cantidad</label>
                            <input type="number" id="transferQty" class="form-control form-select-sm" min="1" placeholder="0">
                        </div>
                        <div class="col-12 mt-2">
                            <button type="submit" class="btn btn-primary btn-sm w-100">Confirmar Transferencia</button>
                        </div>
                    </div>
                </form>
            </div>

            <h6 class="fw-bold text-dark mb-2">Stock Actual por Sede</h6>
            <p class="small text-muted mb-2">Usa el lápiz <strong>solo</strong> para correcciones de conteo (pérdidas, robos o sobrantes).</p>
            <div id="stockModalBody" class="d-flex flex-column gap-2">
                <div class="text-center py-3"><div class="spinner-border text-primary"></div></div>
            </div>

            <h6 class="fw-bold text-dark mt-4 mb-2">Historial de Transferencias</h6>
            <div class="table-responsive" style="max-height: 150px; overflow-y: auto;">
                <table class="table table-sm table-bordered mb-0" style="font-size: 0.85rem;">
                    <thead class="table-light">
                        <tr>
                            <th>Fecha</th>
                            <th>Detalle</th>
                            <th>Usuario</th>
                        </tr>
                    </thead>
                    <tbody id="transferHistoryBody"></tbody>
                </table>
            </div>
          </div>
          <div class="modal-footer border-0">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.manageStock = async function(productId, productName) {
    const modalEl = document.getElementById('stockModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    document.getElementById('stockModalProductName').textContent = productName;
    const body = document.getElementById('stockModalBody');
    const selectFrom = document.getElementById('transferFrom');
    const selectTo = document.getElementById('transferTo');
    const historyBody = document.getElementById('transferHistoryBody');
    
    // Guardar ID de producto actual para el formulario
    document.getElementById('transferForm').dataset.productId = productId;
    
    body.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary"></div></div>';
    modal.show();

    try {
        // Cargar Stocks y Historial en paralelo
        const [stockRes, historyRes] = await Promise.all([
            fetch(`${API_URL}/inventory/${productId}/stocks`, { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } }),
            fetch(`${API_URL}/inventory/${productId}/transfers`, { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } })
        ]);

        const stocks = await stockRes.json();
        const history = await historyRes.json();

        // Llenar selects y tabla
        body.innerHTML = '';
        selectFrom.innerHTML = '';
        selectTo.innerHTML = '';

        stocks.forEach(branch => {
            // Llenar selects de transferencia
            const option = `<option value="${branch.branch_id}">${branch.branch_name} (${branch.stock})</option>`;
            selectFrom.innerHTML += option;
            selectTo.innerHTML += option;

            // Llenar lista visual
            const row = `
                <div class="d-flex align-items-center justify-content-between p-3 border rounded bg-white">
                    <div>
                        <div class="fw-bold">${branch.branch_name}</div>
                        <small class="text-muted">Disponible: <strong class="text-dark">${parseFloat(branch.stock)}</strong></small>
                    </div>
                    <div>
                         <!-- Botón discreto para ajuste manual (solo si es necesario) -->
                         <button class="btn btn-sm btn-outline-secondary" onclick="toggleEdit(${branch.branch_id})" title="Ajuste Manual (Pérdidas/Inventario)">
                            <i class="bi bi-pencil"></i>
                         </button>
                         <div id="edit-box-${branch.branch_id}" style="display:none;" class="mt-2 d-flex gap-1">
                            <input type="number" class="form-control form-control-sm" value="${branch.stock}" id="stock-input-${branch.branch_id}" style="width: 70px;">
                            <button class="btn btn-sm btn-success" onclick="updateBranchStock(${productId}, ${branch.branch_id})"><i class="bi bi-check"></i></button>
                         </div>
                    </div>
                </div>
            `;
            body.insertAdjacentHTML('beforeend', row);
        });
        
        // Seleccionar Sede Principal como origen por defecto si existe
        if (selectFrom.options.length > 0) selectFrom.selectedIndex = 0;
        // Seleccionar la segunda sede como destino por defecto
        if (selectTo.options.length > 1) selectTo.selectedIndex = 1;

        // Llenar Historial
        historyBody.innerHTML = '';
        if (history.length === 0) {
            historyBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Sin movimientos recientes</td></tr>';
        } else {
            history.forEach(h => {
                const date = new Date(h.created_at).toLocaleDateString() + ' ' + new Date(h.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const row = `
                    <tr>
                        <td>${date}</td>
                        <td><span class="fw-bold text-primary">${h.quantity} un.</span> de ${h.from_branch} a ${h.to_branch}</td>
                        <td>${h.user_name}</td>
                    </tr>
                `;
                historyBody.insertAdjacentHTML('beforeend', row);
            });
        }

        // Manejar evento de transferencia
        document.getElementById('transferForm').onsubmit = async (e) => {
            e.preventDefault();
            const fromId = selectFrom.value;
            const toId = selectTo.value;
            const qty = document.getElementById('transferQty').value;
            
            if(fromId === toId) {
                showToast('El origen y destino no pueden ser iguales.', true);
                return;
            }

            try {
                const res = await fetch(`${API_URL}/inventory/transfer`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + localStorage.getItem('token')
                    },
                    body: JSON.stringify({ productId, fromBranchId: fromId, toBranchId: toId, quantity: qty })
                });
                
                const data = await res.json();
                if(res.ok) {
                    showToast('Transferencia realizada con éxito');
                    document.getElementById('transferQty').value = ''; // Limpiar campo cantidad
                    manageStock(productId, productName); // Recargar modal
                    loadInventory(); // Actualizar fondo
                } else {
                    showToast(data.message, true);
                }
            } catch(err) { showToast('Error de conexión', true); }
        };

    } catch (error) {
        body.innerHTML = '<p class="text-danger text-center">Error al cargar información de stock.</p>';
    }
}

window.toggleEdit = function(branchId) {
    const box = document.getElementById(`edit-box-${branchId}`);
    box.style.display = box.style.display === 'none' ? 'flex' : 'none';
}

window.updateBranchStock = async function(productId, branchId) {
    const input = document.getElementById(`stock-input-${branchId}`);
    const newStock = parseInt(input.value);

    if (isNaN(newStock) || newStock < 0) {
        showToast('Por favor ingresa una cantidad válida.', true);
        return;
    }

    // Confirmación de seguridad para evitar errores conceptuales
    const confirmMsg = "⚠️ ¿Estás seguro de realizar un AJUSTE MANUAL?\n\n" +
                       "Esta acción modificará el Inventario Global (creará o eliminará unidades del sistema).\n" +
                       "Si lo que deseas es mover mercancía entre sedes, usa la opción de 'Transferir' arriba.\n\n" +
                       "¿Continuar con el ajuste?";
    
    if (!confirm(confirmMsg)) return;

    try {
        const response = await fetch(`${API_URL}/inventory/stock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({ productId, branchId, newStock })
        });

        if (response.ok) {
            // Mostrar feedback visual temporal
            showToast('Stock ajustado correctamente');
            manageStock(productId, document.getElementById('stockModalProductName').textContent);
            loadInventory();
        } else {
            showToast('Error al actualizar stock.', true);
        }
    } catch (error) {
        showToast('Error de conexión.', true);
    }
}