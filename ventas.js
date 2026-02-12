// Ventas Page JavaScript
const API_URL = (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? CONFIG.API_URL : 'http://localhost:3000';
let allSales = [];

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(loadSales, 500); // Pequeño delay para ver la animación de carga
});

// Función para cargar ventas
async function loadSales() {
  try {
    const response = await fetch(`${API_URL}/sales`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!response.ok) throw new Error('Error al cargar las ventas');

    const sales = await response.json();
    allSales = sales;
    
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const salesTable = document.getElementById('salesTable');

    loadingState.style.display = 'none';

    if (sales.length === 0) {
      emptyState.style.display = 'block';
    } else {
      salesTable.style.display = 'table';
      renderSalesTable(sales);
      updateStats(sales);
    }
  } catch (error) {
    console.error('Error al cargar ventas:', error);
    document.getElementById('loadingState').innerHTML = 
      '<div class="alert alert-danger">Error al cargar las ventas. Intente nuevamente.</div>';
  }
}

function renderSalesTable(sales) {
  const tbody = document.getElementById('salesTableBody');
  tbody.innerHTML = '';

  sales.forEach((sale, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>#${sale.id || index + 1}</strong></td>
      <td>
        <div class="client-info">
          <div class="client-avatar">${sale.client_name ? sale.client_name.charAt(0).toUpperCase() : 'C'}</div>
          <div>
            <strong>${sale.client_name || 'Cliente'}</strong>
            <br>
            <small class="text-muted">${sale.client_email || ''}</small>
          </div>
        </div>
      </td>
      <td>
        <div class="product-info">
          <div class="product-icon"><i class="bi bi-box-seam"></i></div>
          <div>
            <strong>${sale.product_name || 'Varios Productos'}</strong>
            <br>
            <small class="text-muted">Cantidad: ${sale.quantity || '-'}</small>
          </div>
        </div>
      </td>
      <td><span class="price-tag">$${(sale.total_price || sale.total || 0).toFixed(2)}</span></td>
      <td>
        <div>
          <strong>${formatDate(sale.sale_date)}</strong>
          <br>
          <small class="text-muted">${formatTime(sale.sale_date)}</small>
        </div>
      </td>
      <td><span class="sale-badge sale-completed">Completada</span></td>
      <td>
        <div class="action-buttons">
          <button class="btn-action btn-edit" onclick="viewSale(${sale.id || index})"><i class="bi bi-eye"></i> Ver</button>
          <button class="btn-action btn-delete" onclick="deleteSale(${sale.id || index})"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function updateStats(sales) {
  const totalSales = sales.reduce((sum, sale) => sum + (sale.total_price || sale.total || 0), 0);
  const avgSale = sales.length > 0 ? totalSales / sales.length : 0;
  const today = new Date().toISOString().split('T')[0];
  const todaySales = sales
    .filter(sale => sale.sale_date && sale.sale_date.startsWith(today))
    .reduce((sum, sale) => sum + (sale.total_price || sale.total || 0), 0);

  document.getElementById('totalSales').textContent = `$${totalSales.toFixed(2)}`;
  document.getElementById('totalOrders').textContent = sales.length;
  document.getElementById('avgSale').textContent = `$${avgSale.toFixed(2)}`;
  document.getElementById('todaySales').textContent = `$${todaySales.toFixed(2)}`;
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

window.viewSale = function(id) {
  if(window.showNotification) showNotification(`Ver detalles de venta #${id}`, 'info');
  else alert(`Detalles venta #${id}`);
}

window.deleteSale = async function(id) {
  if (!confirm('¿Estás seguro de eliminar esta venta?')) return;
  try {
    const response = await fetch(`${API_URL}/sales/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (response.ok) {
      if(window.showNotification) showNotification('Venta eliminada con éxito', 'success');
      loadSales();
    } else throw new Error('Error al eliminar la venta');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

window.applyFilters = function() {
  const dateFilter = document.getElementById('filterDate').value;
  let filteredSales = allSales;
  if (dateFilter) {
    filteredSales = filteredSales.filter(sale => sale.sale_date && sale.sale_date.startsWith(dateFilter));
  }
  renderSalesTable(filteredSales);
  updateStats(filteredSales);
}