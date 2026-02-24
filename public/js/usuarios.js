const API_URL = ''; // Ruta relativa para producción

document.addEventListener('DOMContentLoaded', function() {
    loadUsers();

    document.getElementById('addUserForm').addEventListener('submit', handleAddUser);
});

async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    const loading = document.getElementById('loadingState');

    try {
        const response = await fetch(`${API_URL}/users`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });

        if (response.status === 401 || response.status === 403) {
            window.location.href = 'dashboard.html'; // Si no es admin, fuera
            return;
        }

        const users = await response.json();
        loading.style.display = 'none';
        tbody.innerHTML = '';

        users.forEach(user => {
            const date = new Date(user.created_at).toLocaleDateString();
            const roleBadge = user.role === 'admin' 
                ? '<span class="badge bg-primary">Administrador</span>' 
                : '<span class="badge bg-secondary">Cajero</span>';
            const branchName = user.branch_name || 'Sin asignar';
            
            const row = `
                <tr>
                    <td>
                        <div class="d-flex align-items-center">
                            <div class="rounded-circle bg-light text-primary d-flex align-items-center justify-content-center me-2 fw-bold" style="width: 35px; height: 35px;">
                                ${user.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div class="fw-bold">${user.username}</div>
                                <small class="text-muted">${user.email}</small>
                            </div>
                        </div>
                    </td>
                    <td>${roleBadge}</td>
                    <td><small class="text-muted"><i class="bi bi-shop me-1"></i>${branchName}</small></td>
                    <td>${date}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${user.id})" title="Eliminar usuario">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });

    } catch (error) {
        console.error('Error:', error);
        loading.innerHTML = '<p class="text-danger">Error al cargar usuarios</p>';
    }
}

async function handleAddUser(e) {
    e.preventDefault();
    const btn = document.querySelector('.btn-submit');
    const msg = document.getElementById('message');
    
    const data = {
        username: document.getElementById('username').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
        role: document.getElementById('role').value
    };

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Creando...';
    msg.innerHTML = '';

    try {
        const response = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) throw new Error(result.message);

        msg.innerHTML = '<div class="alert alert-success">Usuario creado correctamente</div>';
        document.getElementById('addUserForm').reset();
        loadUsers(); // Recargar tabla

    } catch (error) {
        msg.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Crear Usuario';
    }
}

window.deleteUser = async function(id) {
    if (!confirm('¿Estás seguro de eliminar este usuario? Esta acción no se puede deshacer.')) return;

    try {
        const response = await fetch(`${API_URL}/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });

        const result = await response.json();
        
        if (!response.ok) throw new Error(result.message);
        
        alert('Usuario eliminado');
        loadUsers();

    } catch (error) {
        alert(error.message);
    }
}