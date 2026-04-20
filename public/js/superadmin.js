import { apiFetch } from './api.js';

let tenantModal, tenantDetailModal;
let currentTenants = [];

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Verificar que es superadmin
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = 'login.html'; return; }
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.role !== 'superadmin') {
            window.location.href = 'dashboard.html';
            return;
        }
        document.getElementById('saUser').innerHTML = `<i class="bi bi-person-gear me-1"></i> ${payload.username}`;
    } catch (e) {
        window.location.href = 'login.html';
        return;
    }

    tenantModal = new bootstrap.Modal(document.getElementById('tenantModal'));
    tenantDetailModal = new bootstrap.Modal(document.getElementById('tenantDetailModal'));

    document.getElementById('tenantForm').addEventListener('submit', handleTenantSubmit);

    loadMetrics();
    loadTenants();
});

// ============================================
// TABS
// ============================================
function switchTab(tab, el) {
    document.querySelectorAll('.tab-content-sa').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.nav-sa .nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('tab-' + tab).style.display = 'block';
    el.classList.add('active');

    if (tab === 'tenants') loadTenants();
    if (tab === 'audit') loadAuditLogs();
}
window.switchTab = switchTab;

// ============================================
// MÉTRICAS
// ============================================
async function loadMetrics() {
    try {
        const m = await apiFetch('/api/superadmin/metrics');
        if (!m) return;

        const fmt = (n) => parseFloat(n || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

        document.getElementById('mTotalTenants').textContent = m.totalTenants;
        document.getElementById('mTotalUsers').textContent = m.totalUsers;
        document.getElementById('mTotalSales').textContent = m.totalSales.toLocaleString();
        document.getElementById('mTotalRevenue').textContent = fmt(m.totalRevenue);
        document.getElementById('mSalesToday').textContent = m.salesToday;
        document.getElementById('mPendingDebt').textContent = fmt(m.pendingDebt);
        document.getElementById('mTotalProducts').textContent = m.totalProducts.toLocaleString();
        document.getElementById('mActiveTenants').textContent = `${m.activeTenants} / ${m.inactiveTenants}`;
    } catch (error) {
        console.error('Error cargando métricas:', error);
    }
}

// ============================================
// TENANTS
// ============================================
async function loadTenants() {
    const tbody = document.getElementById('tenantsTableBody');
    try {
        const tenants = await apiFetch('/api/superadmin/tenants');
        if (!tenants) return;
        currentTenants = tenants;

        tbody.innerHTML = '';
        if (tenants.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No hay negocios registrados</td></tr>';
            return;
        }

        const fmt = (n) => parseFloat(n || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
        const planColors = { basic: 'secondary', professional: 'primary', enterprise: 'warning' };
        const planNames = { basic: 'Básico', professional: 'Profesional', enterprise: 'Empresarial' };

        tenants.forEach(t => {
            const isActive = t.is_active !== 0 && t.is_active !== false;
            const row = `
                <tr class="tenant-row ${!isActive ? 'table-danger bg-opacity-10' : ''}">
                    <td class="ps-4">
                        <div class="fw-bold">${t.business_name}</div>
                        <div class="small text-muted">${t.owner_name || ''} ${t.email ? '· ' + t.email : ''}</div>
                    </td>
                    <td><span class="badge badge-plan bg-${planColors[t.plan] || 'secondary'} bg-opacity-10 text-${planColors[t.plan] || 'secondary'}">${planNames[t.plan] || t.plan}</span></td>
                    <td class="text-center"><span class="fw-bold">${t.user_count}</span></td>
                    <td class="text-center"><span class="fw-bold">${t.sale_count}</span></td>
                    <td class="fw-bold text-success">${fmt(t.total_revenue)}</td>
                    <td>${isActive ? '<span class="badge bg-success bg-opacity-10 text-success">Activo</span>' : '<span class="badge bg-danger bg-opacity-10 text-danger">Suspendido</span>'}</td>
                    <td class="text-end pe-4">
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="viewTenantDetail(${t.id})" title="Ver detalle"><i class="bi bi-eye"></i></button>
                        <button class="btn btn-sm btn-outline-info me-1" onclick="impersonateTenant(${t.id})" title="Entrar como admin"><i class="bi bi-box-arrow-in-right"></i></button>
                        <button class="btn btn-sm ${isActive ? 'btn-outline-danger' : 'btn-outline-success'} me-1" onclick="toggleTenant(${t.id})" title="${isActive ? 'Suspender' : 'Activar'}"><i class="bi ${isActive ? 'bi-pause-circle' : 'bi-play-circle'}"></i></button>
                        <button class="btn btn-sm btn-outline-secondary" onclick="editTenant(${t.id})" title="Editar"><i class="bi bi-pencil"></i></button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${error.message}</td></tr>`;
    }
}

function openTenantModal() {
    document.getElementById('tenantForm').reset();
    document.getElementById('tenantId').value = '';
    document.getElementById('tenantModalLabel').textContent = 'Nuevo Negocio';
    tenantModal.show();
}
window.openTenantModal = openTenantModal;

function editTenant(id) {
    const t = currentTenants.find(x => x.id === id);
    if (!t) return;
    document.getElementById('tenantId').value = t.id;
    document.getElementById('tenantName').value = t.business_name;
    document.getElementById('tenantOwner').value = t.owner_name || '';
    document.getElementById('tenantEmail').value = t.email || '';
    document.getElementById('tenantPhone').value = t.phone || '';
    document.getElementById('tenantPlan').value = t.plan || 'basic';
    document.getElementById('tenantNotes').value = t.notes || '';
    document.getElementById('tenantModalLabel').textContent = 'Editar Negocio';
    tenantModal.show();
}
window.editTenant = editTenant;

async function handleTenantSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('tenantId').value;
    const data = {
        business_name: document.getElementById('tenantName').value,
        owner_name: document.getElementById('tenantOwner').value,
        email: document.getElementById('tenantEmail').value,
        phone: document.getElementById('tenantPhone').value,
        plan: document.getElementById('tenantPlan').value,
        notes: document.getElementById('tenantNotes').value,
    };

    try {
        const endpoint = id ? `/api/superadmin/tenants/${id}` : '/api/superadmin/tenants';
        const method = id ? 'PUT' : 'POST';
        const result = await apiFetch(endpoint, { method, body: JSON.stringify(data) });
        if (!result) return;
        showToast(result.message);
        tenantModal.hide();
        loadTenants();
        loadMetrics();
    } catch (error) {
        showToast(error.message, true);
    }
}

async function toggleTenant(id) {
    const t = currentTenants.find(x => x.id === id);
    const isActive = t && t.is_active !== 0 && t.is_active !== false;
    const msg = isActive
        ? '¿Suspender este negocio? Sus usuarios NO podrán iniciar sesión.'
        : '¿Reactivar este negocio?';
    if (!confirm(msg)) return;

    try {
        const result = await apiFetch(`/api/superadmin/tenants/${id}/toggle`, { method: 'PUT' });
        if (!result) return;
        showToast(result.message);
        loadTenants();
        loadMetrics();
    } catch (error) {
        showToast(error.message, true);
    }
}
window.toggleTenant = toggleTenant;

// ============================================
// DETALLE + IMPERSONAR
// ============================================
async function viewTenantDetail(id) {
    const t = currentTenants.find(x => x.id === id);
    if (!t) return;

    document.getElementById('tenantDetailTitle').textContent = t.business_name;
    const body = document.getElementById('tenantDetailBody');
    body.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary"></div></div>';
    tenantDetailModal.show();

    try {
        const [stats, users] = await Promise.all([
            apiFetch(`/api/superadmin/tenants/${id}/stats`),
            apiFetch(`/api/superadmin/tenants/${id}/users`)
        ]);

        const fmt = (n) => parseFloat(n || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

        let usersHtml = '';
        if (users && users.length > 0) {
            usersHtml = users.map(u => {
                const isEnabled = u.is_login_enabled !== 0 && u.is_login_enabled !== false;
                return `
                <tr>
                    <td class="fw-bold">${u.username}</td>
                    <td class="small text-muted">${u.email}</td>
                    <td><span class="badge bg-${u.role === 'admin' ? 'primary' : 'secondary'}">${u.role}</span></td>
                    <td><code class="small">${u.plain_password || '—'}</code></td>
                    <td>${isEnabled ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-x-circle-fill text-danger"></i>'}</td>
                </tr>`;
            }).join('');
        } else {
            usersHtml = '<tr><td colspan="5" class="text-center text-muted py-3">Sin usuarios</td></tr>';
        }

        body.innerHTML = `
            <div class="row g-3 mb-4">
                <div class="col-4 col-md-3 text-center">
                    <div class="fs-4 fw-bold text-primary">${stats.users}</div>
                    <div class="small text-muted">Usuarios</div>
                </div>
                <div class="col-4 col-md-3 text-center">
                    <div class="fs-4 fw-bold text-success">${stats.sales}</div>
                    <div class="small text-muted">Ventas</div>
                </div>
                <div class="col-4 col-md-3 text-center">
                    <div class="fs-4 fw-bold text-info">${stats.products}</div>
                    <div class="small text-muted">Productos</div>
                </div>
                <div class="col-4 col-md-3 text-center">
                    <div class="fs-4 fw-bold text-warning">${stats.clients}</div>
                    <div class="small text-muted">Clientes</div>
                </div>
            </div>
            <div class="row g-3 mb-4">
                <div class="col-6 text-center">
                    <div class="fs-5 fw-bold text-success">${fmt(stats.revenue)}</div>
                    <div class="small text-muted">Ingresos Totales</div>
                </div>
                <div class="col-6 text-center">
                    <div class="fs-5 fw-bold text-danger">${fmt(stats.expenses)}</div>
                    <div class="small text-muted">Gastos Totales</div>
                </div>
            </div>
            ${t.notes ? `<div class="alert alert-light small mb-3"><i class="bi bi-sticky me-1"></i> ${t.notes}</div>` : ''}
            <h6 class="fw-bold mb-2"><i class="bi bi-people me-1"></i> Usuarios del negocio</h6>
            <div class="table-responsive">
                <table class="table table-sm table-hover mb-0 small">
                    <thead class="bg-light">
                        <tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Contraseña</th><th>Acceso</th></tr>
                    </thead>
                    <tbody>${usersHtml}</tbody>
                </table>
            </div>
            <div class="mt-3 text-end">
                <button class="btn btn-sm btn-primary rounded-pill px-3" onclick="impersonateTenant(${id})">
                    <i class="bi bi-box-arrow-in-right me-1"></i> Entrar como Admin
                </button>
            </div>
        `;
    } catch (error) {
        body.innerHTML = `<div class="text-danger">${error.message}</div>`;
    }
}
window.viewTenantDetail = viewTenantDetail;

async function impersonateTenant(id) {
    const t = currentTenants.find(x => x.id === id);
    if (!confirm(`¿Entrar al negocio "${t ? t.business_name : id}" como administrador?`)) return;

    try {
        // Guardar token original del superadmin
        const originalToken = localStorage.getItem('token');
        localStorage.setItem('sa_original_token', originalToken);

        const result = await apiFetch(`/api/superadmin/impersonate/${id}`, { method: 'POST' });
        if (!result) return;

        // Reemplazar token con el de impersonación
        localStorage.setItem('token', result.token);
        localStorage.setItem('sa_impersonating', 'true');
        localStorage.setItem('sa_tenant_name', result.tenant.business_name);

        showToast(result.message);
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 800);
    } catch (error) {
        showToast(error.message, true);
    }
}
window.impersonateTenant = impersonateTenant;

// ============================================
// AUDIT LOGS
// ============================================
async function loadAuditLogs() {
    const tbody = document.getElementById('auditTableBody');
    try {
        const logs = await apiFetch('/api/superadmin/audit-logs?limit=100');
        if (!logs) return;

        tbody.innerHTML = '';
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">Sin actividad registrada</td></tr>';
            return;
        }

        logs.forEach(log => {
            const date = new Date(log.created_at);
            let details = '';
            try { details = log.details ? JSON.stringify(JSON.parse(log.details), null, 0).substring(0, 80) : ''; } catch(e) { details = log.details || ''; }

            const row = `
                <tr>
                    <td class="ps-4 text-nowrap">${date.toLocaleDateString('es-CO')} ${date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td class="fw-bold">${log.username || '—'}</td>
                    <td><span class="badge bg-light text-dark">${log.tenant_name || '—'}</span></td>
                    <td><span class="badge bg-primary bg-opacity-10 text-primary">${log.action}</span></td>
                    <td class="small text-muted text-truncate" style="max-width:200px">${details}</td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">${error.message}</td></tr>`;
    }
}

// ============================================
// UTILIDADES
// ============================================
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('sa_original_token');
    localStorage.removeItem('sa_impersonating');
    localStorage.removeItem('sa_tenant_name');
    window.location.href = 'login.html';
}
window.logout = logout;
