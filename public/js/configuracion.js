const API_URL = ''; // Ruta relativa para producción

document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    document.getElementById('configForm').addEventListener('submit', saveSettings);
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

    } catch (error) {
        console.error('Error:', error);
    }
}

async function saveSettings(e) {
    e.preventDefault();
    const btn = document.querySelector('.btn-submit');
    const msg = document.getElementById('message');
    
    const data = {
        company_name: document.getElementById('companyName').value,
        company_address: document.getElementById('companyAddress').value,
        company_phone: document.getElementById('companyPhone').value,
        company_email: document.getElementById('companyEmail').value
    };

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
    msg.innerHTML = '';

    try {
        const response = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error('Error al guardar');
        
        msg.innerHTML = '<div class="alert alert-success">Configuración actualizada correctamente</div>';
    } catch (error) {
        msg.innerHTML = '<div class="alert alert-danger">Error al guardar cambios</div>';
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