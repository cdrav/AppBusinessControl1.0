import { apiFetch } from './api.js';
import { protectRoute } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
    protectRoute();
    loadAuditLogs();
    document.getElementById('refreshLogs').addEventListener('click', loadAuditLogs);
});

async function loadAuditLogs() {
    const tbody = document.getElementById('auditTableBody');
    const mobileList = document.getElementById('auditLogListMobile'); // Nuevo elemento para móvil
    
    try {
        const logs = await apiFetch('/api/audit');
        if (!logs) return;

        tbody.innerHTML = '';
        mobileList.innerHTML = ''; // Limpiar lista móvil también
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">No se encontraron registros de auditoría.</td></tr>';
            mobileList.innerHTML = '<div class="text-center py-4 text-muted">No se encontraron registros de auditoría.</div>';
            return;
        }

        logs.forEach(log => {
            const date = new Date(log.created_at).toLocaleString('es-CO');
            
            let actionBadge = `<span class="badge bg-secondary">${log.action}</span>`;
            if (log.action.includes('CREATED')) actionBadge = `<span class="badge bg-success">${log.action}</span>`;
            if (log.action.includes('UPDATED') || log.action.includes('ADJUSTMENT')) actionBadge = `<span class="badge bg-warning text-dark">${log.action}</span>`;
            if (log.action.includes('DELETED') || log.action.includes('RETURN') || log.action.includes('CLOSURE')) actionBadge = `<span class="badge bg-danger">${log.action}</span>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="ps-4 small">${date}</td>
                <td><div class="fw-bold">${log.username || 'Sistema'}</div></td>
                <td>${actionBadge}</td>
                <td><span class="text-muted small text-uppercase">${log.entity_type || '-'} #${log.entity_id || ''}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-info view-details-btn">
                        <i class="bi bi-eye"></i> Ver
                    </button>
                </td>
                <td><code class="small">${log.ip_address || 'N/A'}</code></td>
            `;
            
            tr.querySelector('.view-details-btn').addEventListener('click', () => showAuditDetails(log.details));
            tbody.appendChild(tr);

            // Render para la lista de tarjetas en móvil
            const mobileItem = document.createElement('div');
            mobileItem.className = 'list-group-item list-group-item-action py-3';
            mobileItem.innerHTML = `
                <div class="d-flex w-100 justify-content-between">
                    <h6 class="mb-1 fw-bold">${log.username || 'Sistema'}</h6>
                    <small class="text-muted">${date}</small>
                </div>
                <p class="mb-1">${actionBadge} <span class="text-muted small text-uppercase">${log.entity_type || '-'} #${log.entity_id || ''}</span></p>
                <div class="d-flex w-100 justify-content-between align-items-center">
                    <small class="text-muted">IP: <code class="small">${log.ip_address || 'N/A'}</code></small>
                    <button class="btn btn-sm btn-outline-info view-details-btn-mobile">
                        <i class="bi bi-eye"></i> Detalles
                    </button>
                </div>
            `;
            mobileItem.querySelector('.view-details-btn-mobile').addEventListener('click', () => showAuditDetails(log.details));
            mobileList.appendChild(mobileItem);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">Error: ${error.message}</td></tr>`;
        mobileList.innerHTML = `<div class="text-center py-4 text-danger">Error: ${error.message}</div>`;
    }
}

function showAuditDetails(details) {
    const modal = new bootstrap.Modal(document.getElementById('detailsModal'));
    const pre = document.getElementById('jsonDetails');
    try {
        const parsed = typeof details === 'string' ? JSON.parse(details) : details;
        pre.textContent = JSON.stringify(parsed, null, 4);
    } catch (e) {
        pre.textContent = details || 'Sin detalles adicionales.';
    }
    modal.show();
}