// Ventas Page JavaScript
const API_URL = ''; // Ruta relativa para producción
let allSales = [];

document.addEventListener('DOMContentLoaded', function() {
  loadSales();
  loadClientsForFilter();

  const emailForm = document.getElementById('emailTicketForm');
  if(emailForm) {
    emailForm.addEventListener('submit', handleSendEmail);
  }
});

async function loadSales() {
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  const table = document.getElementById('salesTable');
  
  try {
    const response = await fetch(`${API_URL}/sales`, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    
    if (response.status === 401 || response.status === 403) {
      window.location.href = 'login.html';
      return;
    }

    if (!response.ok) throw new Error('Error al cargar ventas');
    
    allSales = await response.json();
    
    loadingState.style.display = 'none';
    
    if (allSales.length === 0) {
      emptyState.style.display = 'block';
      table.style.display = 'none';
    } else {
      emptyState.style.display = 'none';
      table.style.display = 'table';
      renderSalesTable(allSales);
      updateStats(allSales);
    }
  } catch (error) {
    console.error('Error:', error);
    loadingState.innerHTML = '<div class="alert alert-danger">Error al cargar el historial de ventas.</div>';
  }
}

function renderSalesTable(sales) {
  const tbody = document.getElementById('salesTableBody');
  tbody.innerHTML = '';
  
  sales.forEach(sale => {
    const date = new Date(sale.sale_date).toLocaleDateString('es-ES', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    
    const row = `
      <tr class="fade-in">
        <td><span class="fw-bold">#${sale.id}</span></td>
        <td>
          <div class="d-flex align-items-center">
            <div class="rounded-circle bg-light text-primary d-flex align-items-center justify-content-center me-2" style="width: 32px; height: 32px; font-size: 0.8rem;">
              ${sale.client_name ? sale.client_name.charAt(0).toUpperCase() : '?'}
            </div>
            ${sale.client_name || 'General'}
          </div>
        </td>
        <td>
          <button class="btn btn-sm btn-outline-info" onclick="viewSaleDetails(${sale.id})">
            <i class="bi bi-list-ul me-1"></i> Ver detalles
          </button>
        </td>
        <td class="fw-bold text-success">$${parseFloat(sale.total_price).toFixed(2)}</td>
        <td class="text-muted small">${date}</td>
        <td><span class="badge bg-success bg-opacity-10 text-success rounded-pill">Completado</span></td>
        <td>
          <button class="btn btn-sm btn-light text-danger" onclick="processReturn(${sale.id})" title="Devolución">
            <i class="bi bi-arrow-counterclockwise"></i>
          </button>
          <button class="btn btn-sm btn-light text-primary" onclick="printTicket(${sale.id})" title="Imprimir">
            <i class="bi bi-printer"></i>
          </button>
          <button class="btn btn-sm btn-light text-info" onclick="openEmailModal(${sale.id}, '${sale.client_email || ''}')" title="Enviar por Correo">
            <i class="bi bi-envelope"></i>
          </button>
        </td>
      </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', row);
  });
}

function updateStats(sales) {
  const totalSales = sales.reduce((sum, sale) => sum + parseFloat(sale.total_price), 0);
  const totalOrders = sales.length;
  const avgSale = totalOrders > 0 ? totalSales / totalOrders : 0;
  
  // Ventas de hoy
  const today = new Date().toDateString();
  const todaySalesTotal = sales
    .filter(s => new Date(s.sale_date).toDateString() === today)
    .reduce((sum, s) => sum + parseFloat(s.total_price), 0);

  document.getElementById('totalSales').textContent = `$${totalSales.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  document.getElementById('totalOrders').textContent = totalOrders;
  document.getElementById('avgSale').textContent = `$${avgSale.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  document.getElementById('todaySales').textContent = `$${todaySalesTotal.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
}

async function loadClientsForFilter() {
  try {
    const response = await fetch(`${API_URL}/clients`, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    const clients = await response.json();
    const select = document.getElementById('filterClient');
    
    clients.forEach(client => {
      const option = document.createElement('option');
      option.value = client.name; 
      option.textContent = client.name;
      select.appendChild(option);
    });
  } catch (e) { console.error(e); }
}

window.applyFilters = function() {
  const dateInput = document.getElementById('filterDate').value;
  const clientInput = document.getElementById('filterClient').value.toLowerCase();
  
  const filtered = allSales.filter(sale => {
    const saleDate = new Date(sale.sale_date).toISOString().split('T')[0];
    const matchDate = dateInput ? saleDate === dateInput : true;
    const matchClient = clientInput ? sale.client_name.toLowerCase().includes(clientInput) : true;
    return matchDate && matchClient;
  });
  
  renderSalesTable(filtered);
}

window.printTicket = function(id) {
  const btn = document.querySelector(`button[onclick="printTicket(${id})"]`);
  const originalContent = btn.innerHTML;
  
  // Mostrar indicador de carga
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  btn.disabled = true;

  fetch(`${API_URL}/sales/${id}/ticket`, {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
  })
  .then(res => {
    if(res.ok) return res.blob();
    throw new Error('Error al generar ticket');
  })
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank'); // Abre el PDF en nueva pestaña
  })
  .catch(err => alert('No se pudo imprimir el ticket.'))
  .finally(() => {
    btn.innerHTML = originalContent;
    btn.disabled = false;
  });
}

window.processReturn = async function(saleId) {
    if (!confirm('¿Desea procesar una devolución completa para esta venta? Esto restaurará el stock de todos los productos.')) return;

    // Para esta versión simplificada, usamos la ruta de eliminación que ya restaura el stock
    // En una versión avanzada, usaríamos la ruta /return para devoluciones parciales
    try {
        const response = await fetch(`${API_URL}/sales/${saleId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });

        if (response.ok) {
            alert('Devolución procesada correctamente. El stock ha sido restaurado.');
            loadSales();
        } else {
            throw new Error('No se pudo procesar la devolución');
        }
    } catch (error) {
        alert(error.message);
    }
}

window.viewSaleDetails = async function(saleId) {
    const modal = new bootstrap.Modal(document.getElementById('saleDetailsModal'));
    const modalBody = document.getElementById('detailsModalBody');
    const modalTitle = document.getElementById('saleDetailsModalLabel');

    modalTitle.textContent = `Detalles de la Venta #${saleId}`;
    modalBody.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary"></div></div>';
    modal.show();

    try {
        const response = await fetch(`${API_URL}/sales/${saleId}/details`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });

        if (!response.ok) throw new Error('No se pudieron cargar los detalles.');

        const details = await response.json();

        if (details.length === 0) {
            modalBody.innerHTML = '<p class="text-muted text-center p-4">No hay productos detallados para esta venta.</p>';
            return;
        }

        let tableHtml = `
            <table class="table table-sm table-striped">
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th class="text-center">Cantidad</th>
                        <th class="text-end">Precio Unit.</th>
                        <th class="text-end">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
        `;
        let total = 0;
        details.forEach(item => {
            const unitPrice = parseFloat(item.unit_price) || 0;
            const subtotal = parseFloat(item.subtotal) || 0;
            total += subtotal;
            tableHtml += `
                <tr>
                    <td>${item.product_name || 'Producto no encontrado'}</td>
                    <td class="text-center">${item.quantity}</td>
                    <td class="text-end">$${unitPrice.toFixed(2)}</td>
                    <td class="text-end fw-bold">$${subtotal.toFixed(2)}</td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
            <div class="text-end mt-3 fs-5 fw-bold text-dark">Total Verificado: <span class="text-success">$${total.toFixed(2)}</span></div>
        `;

        modalBody.innerHTML = tableHtml;

    } catch (error) {
        modalBody.innerHTML = `<p class="text-danger text-center p-4">${error.message}</p>`;
    }
}

window.openEmailModal = function(saleId, clientEmail) {
    const modal = new bootstrap.Modal(document.getElementById('emailTicketModal'));
    document.getElementById('emailSaleId').textContent = `#${saleId}`;
    document.getElementById('hiddenSaleId').value = saleId;
    document.getElementById('recipientEmail').value = clientEmail;
    modal.show();
}

async function handleSendEmail(event) {
    event.preventDefault();
    const saleId = document.getElementById('hiddenSaleId').value;
    const email = document.getElementById('recipientEmail').value;
    const submitBtn = document.getElementById('sendEmailSubmitBtn');

    if (!email) {
        showToast('Por favor, introduce una dirección de correo.', true);
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Enviando...';

    try {
        const response = await fetch(`${API_URL}/sales/${saleId}/ticket/email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({ email: email })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message);
        const modal = bootstrap.Modal.getInstance(document.getElementById('emailTicketModal'));
        modal.hide();

    } catch (error) {
        showToast(error.message, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-send me-2"></i>Enviar Correo';
    }
}
