import { apiFetch } from './api.js';
let userModal;

document.addEventListener('DOMContentLoaded', () => {
    userModal = new bootstrap.Modal(document.getElementById('userModal'));
    loadUsers();
    loadBranches();

    document.getElementById('userForm').addEventListener('submit', handleUserSubmit);
});

async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    try {
        const users = await apiFetch('/users');
        if (!users) return;

        tbody.innerHTML = '';
        users.forEach(user => {
            let roleBadge = '<span class="badge bg-secondary">Cajero</span>';
            if (user.role === 'admin') {
                roleBadge = '<span class="badge bg-primary">Admin</span>';
            } else if (user.role === 'cobrador') {
                roleBadge = '<span class="badge bg-warning text-dark">Cobrador</span>';
            } else if (user.role === 'supervisor') {
                roleBadge = '<span class="badge bg-info text-dark">Supervisor</span>';
            }
            
            const branchName = user.branch_name ? `<span class="text-dark"><i class="bi bi-shop me-1"></i>${user.branch_name}</span>` : '<span class="text-muted fst-italic">Sin asignar</span>';

            const isEnabled = user.is_login_enabled !== 0 && user.is_login_enabled !== false;
            const accessBadge = isEnabled
                ? '<span class="badge bg-success bg-opacity-10 text-success">Activo</span>'
                : '<span class="badge bg-danger bg-opacity-10 text-danger">Bloqueado</span>';
            const toggleBtn = `<button class="btn btn-sm ${isEnabled ? 'btn-outline-danger' : 'btn-outline-success'}" onclick="toggleAccess(${user.id})" title="${isEnabled ? 'Bloquear acceso' : 'Habilitar acceso'}"><i class="bi ${isEnabled ? 'bi-lock' : 'bi-unlock'}"></i></button>`;

            const passwordDisplay = user.plain_password
                ? `<span class="pwd-hidden" id="pwd-${user.id}">********</span>
                   <button class="btn btn-sm btn-link p-0 ms-1" onclick="togglePwd(${user.id}, '${user.plain_password.replace(/'/g, "\\'")}')" title="Ver/Ocultar"><i class="bi bi-eye-fill text-muted"></i></button>`
                : '<span class="text-muted fst-italic small">No disponible</span>';

            const row = `
                <tr class="${!isEnabled ? 'table-danger bg-opacity-10' : ''}">
                    <td class="ps-4">
                        <div class="fw-bold">${user.username}</div>
                        <div class="small text-muted">${user.email}</div>
                    </td>
                    <td>${roleBadge}</td>
                    <td>${branchName}</td>
                    <td>${passwordDisplay}</td>
                    <td>${accessBadge}</td>
                    <td class="small text-muted">${new Date(user.created_at).toLocaleDateString()}</td>
                    <td class="text-end pe-4">
                        ${user.role !== 'admin' ? toggleBtn : ''}
                        <button class="btn btn-sm btn-light text-primary ms-1" onclick='openEditModal(${JSON.stringify(user)})'><i class="bi bi-pencil"></i></button>
                        ${user.role !== 'admin' ? `<button class="btn btn-sm btn-light text-danger ms-1" onclick="deleteUser(${user.id})"><i class="bi bi-trash"></i></button>` : ''}
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${error.message}</td></tr>`;
    }
}

async function loadBranches() {
    const select = document.getElementById('branchId');
    try {
        const branches = await apiFetch('/branches');
        if (!branches) return;
        
        select.innerHTML = '<option value="">-- Seleccionar Sede --</option>';
        branches.forEach(b => {
            select.innerHTML += `<option value="${b.id}">${b.name}</option>`;
        });
    } catch (error) {
        select.innerHTML = '<option value="">Error cargando sedes</option>';
    }
}

function openUserModal() {
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('userModalLabel').textContent = 'Nuevo Usuario';
    document.getElementById('password').required = true;
    document.getElementById('passwordHelp').textContent = 'Requerido para nuevos usuarios.';
    userModal.show();
}

// Hacer funciones accesibles globalmente
window.openUserModal = openUserModal;
window.openEditModal = openEditModal;
window.deleteUser = deleteUser;
window.togglePasswordVisibility = togglePasswordVisibility;
window.toggleAccess = toggleAccess;
window.togglePwd = togglePwd;

function openEditModal(user) {
    document.getElementById('userId').value = user.id;
    document.getElementById('username').value = user.username;
    document.getElementById('email').value = user.email;
    document.getElementById('role').value = user.role;
    document.getElementById('branchId').value = user.branch_id || ''; // Handle null branch
    
    document.getElementById('userModalLabel').textContent = 'Editar Usuario';
    document.getElementById('password').required = false;
    document.getElementById('password').value = '';
    document.getElementById('passwordHelp').textContent = 'Dejar en blanco para mantener la actual.';
    
    userModal.show();
}

async function handleUserSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('userId').value;
    const isEdit = !!id;
    
    const data = {
        username: document.getElementById('username').value,
        email: document.getElementById('email').value,
        role: document.getElementById('role').value,
        branch_id: document.getElementById('branchId').value || null,
        password: document.getElementById('password').value
    };

    if (isEdit && !data.password) delete data.password;

    try {
        const endpoint = isEdit ? `/users/${id}` : `/users`;
        const method = isEdit ? 'PUT' : 'POST';

        const result = await apiFetch(endpoint, {
            method: method,
            body: JSON.stringify(data)
        });
        if (!result) return;

        showToast(result.message);
        userModal.hide();
        loadUsers();
    } catch (error) {
        showToast(error.message, true);
    }
}

async function deleteUser(id) {
    if (!confirm('¿Estás seguro de eliminar este usuario?')) return;
    try {
        const result = await apiFetch(`/users/${id}`, {
            method: 'DELETE'
        });
        if (!result) return;
        
        showToast(result.message);
        loadUsers();
    } catch (error) {
        showToast(error.message, true);
    }
}

function togglePasswordVisibility() {
    const input = document.getElementById('password');
    input.type = input.type === 'password' ? 'text' : 'password';
}

async function toggleAccess(userId) {
    const action = confirm('¿Cambiar el estado de acceso de este usuario?');
    if (!action) return;
    try {
        const result = await apiFetch(`/users/${userId}/toggle-access`, { method: 'PUT' });
        if (!result) return;
        showToast(result.message);
        loadUsers();
    } catch (error) {
        showToast(error.message, true);
    }
}

function togglePwd(userId, pwd) {
    const span = document.getElementById(`pwd-${userId}`);
    if (!span) return;
    if (span.textContent === '********') {
        span.textContent = pwd;
        span.classList.remove('pwd-hidden');
        span.classList.add('text-danger', 'fw-bold');
    } else {
        span.textContent = '********';
        span.classList.add('pwd-hidden');
        span.classList.remove('text-danger', 'fw-bold');
    }
}