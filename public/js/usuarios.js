const API_URL = ''; 
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
        const res = await fetch(`${API_URL}/users`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        if (!res.ok) throw new Error('Error cargando usuarios');
        const users = await res.json();

        tbody.innerHTML = '';
        users.forEach(user => {
            const roleBadge = user.role === 'admin' ? '<span class="badge bg-primary">Admin</span>' : '<span class="badge bg-secondary">Cajero</span>';
            const branchName = user.branch_name ? `<span class="text-dark"><i class="bi bi-shop me-1"></i>${user.branch_name}</span>` : '<span class="text-muted fst-italic">Sin asignar</span>';
            
            const row = `
                <tr>
                    <td class="ps-4">
                        <div class="fw-bold">${user.username}</div>
                        <div class="small text-muted">${user.email}</div>
                    </td>
                    <td>${roleBadge}</td>
                    <td>${branchName}</td>
                    <td>${new Date(user.created_at).toLocaleDateString()}</td>
                    <td class="text-end pe-4">
                        <button class="btn btn-sm btn-light text-primary me-1" onclick='openEditModal(${JSON.stringify(user)})'><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-light text-danger" onclick="deleteUser(${user.id})"><i class="bi bi-trash"></i></button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">${error.message}</td></tr>`;
    }
}

async function loadBranches() {
    const select = document.getElementById('branchId');
    try {
        const res = await fetch(`${API_URL}/branches`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const branches = await res.json();
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
        const url = isEdit ? `${API_URL}/users/${id}` : `${API_URL}/users`;
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify(data)
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.message);

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
        const res = await fetch(`${API_URL}/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message);
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