document.addEventListener('DOMContentLoaded', function() {
    setupUserSession();
    loadBranches();
});

function setupUserSession() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.role !== 'admin') {
            window.location.href = 'dashboard.html'; // Solo admins pueden ver esta página
        }
    } catch (e) {
        window.location.href = 'login.html';
    }
}

async function loadBranches() {
    const grid = document.getElementById('branchesGrid');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const token = localStorage.getItem('token');

    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const response = await fetch('/api/branch-stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) window.location.href = 'login.html';
            throw new Error('No se pudieron cargar las estadísticas de las sedes.');
        }

        const branches = await response.json();
        loadingState.style.display = 'none';

        if (branches.length === 0) {
            emptyState.style.display = 'block';
            return;
        }

        grid.innerHTML = ''; // Limpiar el estado de carga
        branches.forEach(branch => {
            const cardHtml = createBranchCard(branch);
            grid.insertAdjacentHTML('beforeend', cardHtml);
        });

    } catch (error) {
        console.error('Error:', error);
        loadingState.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
    }
}

function createBranchCard(branch) {
    const formatCurrency = (amount) => parseFloat(amount || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

    return `
        <div class="col-md-6 col-lg-4">
            <div class="card h-100 shadow-sm border-light card-hover-effect">
                <div class="card-body d-flex flex-column">
                    <div class="mb-3">
                        <h5 class="card-title fw-bold text-primary">${branch.name}</h5>
                        <p class="card-subtitle mb-2 text-muted small"><i class="bi bi-geo-alt-fill me-1"></i>${branch.address || 'Sin dirección'}</p>
                    </div>
                    
                    <div class="row g-2 text-center mb-4">
                        <div class="col-6">
                            <div class="p-2 bg-light rounded">
                                <small class="text-muted d-block">Ingresos</small>
                                <span class="fw-bold">${formatCurrency(branch.totalRevenue)}</span>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="p-2 bg-light rounded">
                                <small class="text-muted d-block">Unidades en Stock</small>
                                <span class="fw-bold">${branch.totalStock}</span>
                            </div>
                        </div>
                    </div>

                    <div class="mt-auto">
                        <a href="dashboard.html?branch_id=${branch.id}" class="btn btn-outline-primary w-100">Ver Dashboard de Sede</a>
                    </div>
                </div>
            </div>
        </div>
    `;
}