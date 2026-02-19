const API_URL = ''; // Ruta relativa para producción

document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    document.getElementById('configForm').addEventListener('submit', saveSettings);

    // Previsualización inmediata del logo al seleccionar archivo
    const logoInput = document.getElementById('companyLogo');
    if (logoInput) {
        logoInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) { document.getElementById('logoPreview').src = e.target.result; };
                reader.readAsDataURL(file);
            }
        });
    }
});

async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}/settings`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        
        if (response.status === 401 || response.status === 403) {
            window.location.href = 'dashboard.html';
            return;
        }

        const settings = await response.json();
        
        document.getElementById('companyName').value = settings.company_name || '';
        document.getElementById('companyAddress').value = settings.company_address || '';
        document.getElementById('companyPhone').value = settings.company_phone || '';
        document.getElementById('companyEmail').value = settings.company_email || '';
        document.getElementById('ticketFormat').value = settings.ticket_format || 'A4';

        // Mostrar previsualización del logo
        const logoPreview = document.getElementById('logoPreview');
        if (settings.company_logo) {
            // Añadimos un timestamp para evitar problemas de caché del navegador
            logoPreview.src = `${settings.company_logo}?t=${new Date().getTime()}`;
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

async function saveSettings(e) {
    e.preventDefault();
    const btn = document.querySelector('.btn-submit');
    const msg = document.getElementById('message');
    
    // Usamos FormData para poder enviar archivos y texto juntos
    const formData = new FormData();
    formData.append('company_name', document.getElementById('companyName').value);
    formData.append('company_address', document.getElementById('companyAddress').value);
    formData.append('company_phone', document.getElementById('companyPhone').value);
    formData.append('company_email', document.getElementById('companyEmail').value);
    formData.append('ticket_format', document.getElementById('ticketFormat').value);

    const logoInput = document.getElementById('companyLogo');
    if (logoInput.files[0]) {
        formData.append('company_logo', logoInput.files[0]);
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
    msg.innerHTML = '';

    try {
        const response = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: {
                // NO establecer 'Content-Type', el navegador lo hace automáticamente para FormData
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: formData
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Error al guardar');
        
        msg.innerHTML = `<div class="alert alert-success">${result.message}</div>`;
        loadSettings(); // Recargar para mostrar el nuevo logo
    } catch (error) {
        msg.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-save me-2"></i> Guardar Cambios';
    }
}

async function downloadBackup() {
    try {
        const response = await fetch(`${API_URL}/api/backup`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        
        if (!response.ok) throw new Error('Error al descargar backup');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-${new Date().toISOString().split('T')[0]}.sql`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}