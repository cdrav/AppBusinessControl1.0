/**
 * Business Control - Sistema de Gestión Empresarial
 * Desarrollado por Cristian David Ruiz
 * © 2026 Todos los derechos reservados
 * 
 * Este archivo es parte del sistema Business Control
 * y está protegido por derechos de autor
 */

import { apiFetch, API_URL } from './api.js';
let allSales = [];
let currentPage = 1;
let totalPages = 1;

document.addEventListener('DOMContentLoaded', function() {
  loadSales();
  loadClientsForFilter();

  const emailForm = document.getElementById('emailTicketForm');
  if(emailForm) {
    emailForm.addEventListener('submit', handleSendEmail);
  }

  const passwordConfirmForm = document.getElementById('passwordConfirmForm');
  if (passwordConfirmForm) {
    passwordConfirmForm.addEventListener('submit', handleConfirmDelete);
  }
});

async function loadSales(page = 1) {
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  const table = document.getElementById('salesTable');
  
  try {
    const response = await apiFetch(`/sales?page=${page}&limit=50`);
    if (!response) return;

    // Soportar respuesta paginada y array directo
    const sales = response.data || response;
    const pagination = response.pagination || null;
    
    allSales = sales;
    if (pagination) {
      currentPage = pagination.page;
      totalPages = pagination.pages;
    }
    
    loadingState.style.display = 'none';
    
    if (allSales.length === 0 && currentPage === 1) {
      emptyState.style.display = 'block';
      table.style.display = 'none';
    } else {
      emptyState.style.display = 'none';
      table.style.display = 'table';
      renderSalesTable(allSales);
      updateStats(allSales);
      if (pagination) renderPagination(pagination);
    }
  } catch (error) {
    console.error('Error:', error);
    loadingState.innerHTML = '<div class="alert alert-danger">Error al cargar el historial de ventas.</div>';
  }
}

function renderPagination(pagination) {
  let container = document.getElementById('salesPagination');
  if (!container) {
    container = document.createElement('div');
    container.id = 'salesPagination';
    container.className = 'pagination-container d-flex justify-content-between align-items-center mt-3 px-3 pb-3';
    const table = document.getElementById('salesTable');
    table.parentElement.appendChild(container);
  }

  const { page, pages, total } = pagination;
  if (pages <= 1) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <span class="text-muted small">${total} ventas en total</span>
    <nav>
      <ul class="pagination pagination-sm mb-0">
        <li class="page-item ${page <= 1 ? 'disabled' : ''}">
          <a class="page-link" href="#" data-page="${page - 1}">&laquo;</a>
        </li>
        ${Array.from({length: Math.min(pages, 5)}, (_, i) => {
          const start = Math.max(1, Math.min(page - 2, pages - 4));
          const p = start + i;
          return p <= pages ? `<li class="page-item ${p === page ? 'active' : ''}"><a class="page-link" href="#" data-page="${p}">${p}</a></li>` : '';
        }).join('')}
        <li class="page-item ${page >= pages ? 'disabled' : ''}">
          <a class="page-link" href="#" data-page="${page + 1}">&raquo;</a>
        </li>
      </ul>
    </nav>
  `;

  container.querySelectorAll('.page-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const p = parseInt(e.target.dataset.page);
      if (p >= 1 && p <= pages) loadSales(p);
    });
  });
}

function renderSalesTable(sales) {
  const tbody = document.getElementById('salesTableBody');
  tbody.innerHTML = '';
  const formatCOP = (amount) => amount.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  
  sales.forEach(sale => {
    const date = new Date(sale.sale_date).toLocaleDateString('es-ES', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    
    // Badge para crédito
    const statusBadge = sale.is_credit ? 
        '<span class="badge bg-warning text-dark rounded-pill">Crédito</span>' : 
        '<span class="badge bg-success bg-opacity-10 text-success rounded-pill">Completado</span>';
    
    // Mostrar información de crédito si aplica
    let creditInfo = '';
    if (sale.is_credit) {
      const totalPrice = parseFloat(sale.total_price) || 0;
      const initialPayment = parseFloat(sale.initial_payment) || 0;
      const remaining = parseFloat(sale.remaining_balance) || (totalPrice - initialPayment);
      const paid = initialPayment;
      creditInfo = `
        <div class="small mt-1">
          <span class="text-muted">Pago Inicial: <strong class="text-success">${formatCOP(paid)}</strong></span>
          <span class="text-muted ms-2">Saldo: <strong class="text-danger">${formatCOP(remaining)}</strong></span>
        </div>
      `;
    }

    const row = `
      <tr class="fade-in">
        <td><span class="fw-bold">${sale.sale_number || '#' + sale.id}</span></td>
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
        <td class="fw-bold text-success">${formatCOP(parseFloat(sale.total_price))}${creditInfo}</td>
        <td class="text-muted small">${date}</td>
        <td>${statusBadge}</td>
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

  const formatCOP = (amount) => amount.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

  document.getElementById('totalSales').textContent = formatCOP(totalSales);
  document.getElementById('totalOrders').textContent = totalOrders;
  document.getElementById('avgSale').textContent = formatCOP(avgSale);
  document.getElementById('todaySales').textContent = formatCOP(todaySalesTotal);
}

async function loadClientsForFilter() {
  try {
    const clients = await apiFetch('/clients');
    if (!clients) return;

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

  fetch(`/sales/${id}/ticket`, {
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

window.processReturn = function(saleId) {
    const modal = new bootstrap.Modal(document.getElementById('passwordConfirmModal'));
    document.getElementById('saleIdToDelete').value = saleId;
    document.getElementById('passwordConfirmModalLabel').textContent = `Confirmar Devolución Venta #${saleId}`;
    modal.show();
}

async function handleConfirmDelete(event) {
    event.preventDefault();
    
    const saleId = document.getElementById('saleIdToDelete').value;
    const password = document.getElementById('adminPassword').value;
    const submitBtn = document.getElementById('confirmDeleteBtn');

    if (!password) {
        showToast('Debes ingresar tu contraseña.', true);
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Verificando...';

    try {
        const response = await fetch(`${API_URL}/sales/${saleId}`, {
            method: 'DELETE',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token') 
            },
            body: JSON.stringify({ password: password }) // Enviando contraseña en el body
        });

        const result = await response.json();

        if (!response.ok) throw new Error(result.message);

        showToast(result.message);
        bootstrap.Modal.getInstance(document.getElementById('passwordConfirmModal')).hide();
        document.getElementById('passwordConfirmForm').reset();
        loadSales(); // Recargar la lista de ventas

    } catch (error) {
        showToast(error.message, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Confirmar Devolución';
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

        const data = await response.json();
        const sale = data.sale;
        const details = data.products;

        const formatCOP = (amount) => amount.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
        
        // Formatear fecha
        const saleDate = sale ? new Date(sale.sale_date).toLocaleDateString('es-ES', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : 'N/A';

        let html = `
            <div class="mb-3 pb-2 border-bottom">
                <div class="d-flex justify-content-between align-items-center">
                    <span class="text-muted">Fecha de Venta:</span>
                    <span class="fw-bold">${saleDate}</span>
                </div>
                ${sale && sale.is_credit ? `
                <div class="mt-2 p-2 bg-warning bg-opacity-10 rounded">
                    <div class="d-flex justify-content-between">
                        <span class="text-muted">Total Venta:</span>
                        <span class="fw-bold">${formatCOP(sale.total_price)}</span>
                    </div>
                    <div class="d-flex justify-content-between mt-1">
                        <span class="text-muted">Pago Inicial:</span>
                        <span class="fw-bold text-success">${formatCOP(sale.initial_payment || 0)}</span>
                    </div>
                    <div class="d-flex justify-content-between mt-1 pt-1 border-top">
                        <span class="fw-bold">Saldo por Pagar:</span>
                        <span class="fw-bold text-danger">${formatCOP(sale.remaining_balance || 0)}</span>
                    </div>
                </div>
                ` : ''}
            </div>
        `;

        if (details.length === 0) {
            html += '<p class="text-muted text-center p-4">No hay productos detallados para esta venta.</p>';
            modalBody.innerHTML = html;
            return;
        }

        html += `
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
            html += `
                <tr>
                    <td>${item.product_name || 'Producto no encontrado'}</td>
                    <td class="text-center">${item.quantity}</td>
                    <td class="text-end">${formatCOP(unitPrice)}</td>
                    <td class="text-end fw-bold">${formatCOP(subtotal)}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
            <div class="text-end mt-3 fs-5 fw-bold text-dark">Total: <span class="text-success">${formatCOP(total)}</span></div>
        `;

        modalBody.innerHTML = html;

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
