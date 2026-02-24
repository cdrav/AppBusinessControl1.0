const API_URL = ''; // Ruta relativa para producción
let restoreFile = null;
let restoreKey = null;

document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    loadBranches();
    document.getElementById('configForm')?.addEventListener('submit', saveSettings);
    document.getElementById('addBranchForm')?.addEventListener('submit', handleAddBranch);

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

    const backupBtn = document.getElementById('backupBtn');
    if (backupBtn) {
        backupBtn.addEventListener('click', downloadBackup);
    }

    const restoreForm = document.getElementById('restoreForm');
    if (restoreForm) {
        restoreForm.addEventListener('submit', handleRestore);
    }

    // Lógica para el modal de confirmación
    const confirmInput = document.getElementById('confirmInput');
    const btnConfirmAction = document.getElementById('btnConfirmRestoreAction');
    
    if (confirmInput && btnConfirmAction) {
        confirmInput.addEventListener('input', function() {
            btnConfirmAction.disabled = this.value !== 'CONFIRMAR';
        });

        btnConfirmAction.addEventListener('click', function() {
            bootstrap.Modal.getInstance(document.getElementById('confirmRestoreModal')).hide();
            executeRestore();
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

async function loadBranches() {
    const tbody = document.getElementById('branchesTableBody');
    if (!tbody) return;

    try {
        const response = await fetch(`${API_URL}/branches`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const branches = await response.json();
        
        tbody.innerHTML = branches.map(b => `
            <tr>
                <td class="fw-bold">${b.name} ${b.id === 1 ? '<span class="badge bg-info text-dark ms-1">Principal</span>' : ''}</td>
                <td>${b.address || '-'}</td>
                <td>${b.phone || '-'}</td>
                <td class="text-end">
                    ${b.id !== 1 ? `
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteBranch(${b.id})">
                        <i class="bi bi-trash"></i>
                    </button>` : ''}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error cargando sucursales:', error);
    }
}

async function handleAddBranch(e) {
    e.preventDefault();
    const name = document.getElementById('branchName').value;
    const address = document.getElementById('branchAddress').value;
    const phone = document.getElementById('branchPhone').value;

    try {
        const response = await fetch(`${API_URL}/branches`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({ name, address, phone })
        });

        if (response.ok) {
            showToast('Sucursal creada correctamente');
            document.getElementById('addBranchForm').reset();
            loadBranches();
        } else {
            showToast('Error al crear sucursal', true);
        }
    } catch (error) {
        showToast('Error de conexión', true);
    }
}

window.deleteBranch = async function(id) {
    if (!confirm('¿Eliminar esta sucursal?')) return;
    try {
        const response = await fetch(`${API_URL}/branches/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        if (response.ok) {
            showToast('Sucursal eliminada');
            loadBranches();
        } else {
            const data = await response.json();
            showToast(data.message || 'Error al eliminar', true);
        }
    } catch (error) {
        showToast('Error de conexión', true);
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

async function handleRestore(e) {
    e.preventDefault();

    const fileInput = document.getElementById('backupFile');
    restoreFile = fileInput.files[0];
    restoreKey = document.getElementById('supportKey').value;

    if (!restoreFile) {
        showToast('Por favor, selecciona un archivo .sql para restaurar.', true);
        return;
    }

    if (!restoreKey) {
        showToast('Debes ingresar la Clave de Soporte para continuar.', true);
        return;
    }

    // Abrir modal de confirmación en lugar de prompt
    const confirmModal = new bootstrap.Modal(document.getElementById('confirmRestoreModal'));
    document.getElementById('confirmInput').value = '';
    document.getElementById('btnConfirmRestoreAction').disabled = true;
    confirmModal.show();
}

function executeRestore() {
    const btn = document.getElementById('restoreBtn');
    const progressContainer = document.getElementById('restoreProgressContainer');
    const progressBar = document.getElementById('restoreProgressBar');
    const statusText = document.getElementById('restoreStatusText');

    const formData = new FormData();
    formData.append('backupFile', restoreFile);
    formData.append('supportKey', restoreKey);

    // UI: Mostrar barra de progreso y bloquear botón
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando...';
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    progressBar.classList.remove('bg-success', 'bg-danger');
    statusText.className = 'text-muted d-block mt-1 text-center';
    statusText.textContent = 'Subiendo archivo de respaldo...';

    // Usamos XMLHttpRequest para tener eventos de progreso de subida
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/restore`, true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + localStorage.getItem('token'));

    // Evento de progreso
    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percentComplete + '%';
            progressBar.textContent = percentComplete + '%';
            
            if (percentComplete === 100) {
                statusText.textContent = 'Archivo subido. Restaurando base de datos (esto puede tardar)...';
                progressBar.classList.add('progress-bar-animated'); // Animar mientras el servidor procesa
            }
        }
    };

    xhr.onload = function() {
        if (xhr.status === 200) {
            const result = JSON.parse(xhr.responseText);
            progressBar.classList.remove('progress-bar-animated');
            progressBar.classList.add('bg-success');
            statusText.textContent = '¡Restauración completada con éxito!';
            statusText.className = 'text-success fw-bold d-block mt-1 text-center';
            
            const successModal = new bootstrap.Modal(document.getElementById('restoreSuccessModal'));
            successModal.show();
        } else {
            let message = 'Error desconocido';
            try { message = JSON.parse(xhr.responseText).message; } catch(e) {}
            
            progressBar.classList.add('bg-danger');
            statusText.textContent = 'Error: ' + message;
            statusText.className = 'text-danger fw-bold d-block mt-1 text-center';
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-upload me-2"></i> Restaurar Base de Datos';
        }
    };

    xhr.onerror = function() {
        progressBar.classList.add('bg-danger');
        statusText.textContent = 'Error de conexión con el servidor.';
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-upload me-2"></i> Restaurar Base de Datos';
    };

    xhr.send(formData);
}

window.finishRestore = function() {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}