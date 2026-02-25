const API_URL = ''; // Ruta relativa para producción

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('changePasswordForm').addEventListener('submit', handleChangePassword);
    loadUserProfile(); // Cargar datos del usuario al cargar la página
});

function loadUserProfile() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            document.getElementById('profileUsername').textContent = payload.username;
            document.getElementById('profileRole').textContent = payload.role.charAt(0).toUpperCase() + payload.role.slice(1);
        } catch (e) {
            console.error('Error decodificando el token para perfil:', e);
        }
    }
}

async function handleChangePassword(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    const msg = document.getElementById('message');
    const btn = document.querySelector('.btn-submit');

    if (newPassword !== confirmNewPassword) {
        msg.innerHTML = '<div class="alert alert-danger">Las nuevas contraseñas no coinciden.</div>';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Actualizando...';
    msg.innerHTML = '';

    try {
        const response = await fetch(`${API_URL}/profile/change-password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        msg.innerHTML = '<div class="alert alert-success">¡Contraseña actualizada con éxito!</div>';
        document.getElementById('changePasswordForm').reset();

    } catch (error) {
        msg.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-shield-lock me-2"></i> Actualizar Contraseña';
    }
}

function togglePassword(fieldId) {
    const input = document.getElementById(fieldId);
    const icon = input.nextElementSibling.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('bi-eye', 'bi-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('bi-eye-slash', 'bi-eye');
    }
}