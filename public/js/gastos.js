const API_URL = '';
let expenseModal;
let currentExpenses = [];
let userRole = 'cajero';

document.addEventListener('DOMContentLoaded', () => {
    expenseModal = new bootstrap.Modal(document.getElementById('expenseModal'));
    checkUserRole();
    setDefaultDates();
    loadExpenses();
    loadSuppliers();
    loadBranches();

    document.getElementById('expenseForm').addEventListener('submit', handleExpenseSubmit);
});

function checkUserRole() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            userRole = payload.role;
            
            if (userRole !== 'admin') {
                const branchContainer = document.getElementById('expenseBranch').closest('.col-md-6') || document.getElementById('expenseBranch').parentElement;
                if (branchContainer) branchContainer.style.display = 'none';
            }
        } catch (e) { console.error(e); }
    }
}

async function loadExpenses() {
    const tbody = document.getElementById('expensesTableBody');
    const loading = document.getElementById('loadingState');
    const empty = document.getElementById('emptyState');

    try {
        const params = new URLSearchParams();
        const startDate = document.getElementById('filterStartDate');
        const endDate = document.getElementById('filterEndDate');
        const category = document.getElementById('filterCategory');
        if (startDate && startDate.value) params.append('startDate', startDate.value);
        if (endDate && endDate.value) params.append('endDate', endDate.value);
        if (category && category.value) params.append('category', category.value);

        const url = `${API_URL}/api/expenses${params.toString() ? '?' + params.toString() : ''}`;
        const res = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        if (res.status === 401 || res.status === 403) {
            window.location.href = 'login.html';
            return;
        }
        if (!res.ok) throw new Error('Error cargando gastos');
        const data = await res.json();
        currentExpenses = data.expenses || data;
        const summary = data.summary || null;

        updateSummary(summary);
        populateCategoryFilter(currentExpenses);

        loading.style.display = 'none';
        tbody.innerHTML = '';

        if (currentExpenses.length === 0) {
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        const formatCurrency = (amount) => parseFloat(amount || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

        currentExpenses.forEach(expense => {
            const date = new Date(expense.expense_date);
            const userTimezoneOffset = date.getTimezoneOffset() * 60000;
            const localDate = new Date(date.getTime() + userTimezoneOffset);

            const row = `
                <tr>
                    <td><span class="fw-bold">${expense.description}</span></td>
                    <td class="text-danger fw-bold">${formatCurrency(expense.amount)}</td>
                    <td><span class="badge bg-light text-dark">${expense.category || '-'}</span></td>
                    <td>${expense.supplier_name || '-'}</td>
                    <td>${expense.branch_name || 'General'}</td>
                    <td>${localDate.toLocaleDateString('es-CO')}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-light text-primary me-1" onclick="editExpense(${expense.id})"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-light text-danger" onclick="deleteExpense(${expense.id})"><i class="bi bi-trash"></i></button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });
    } catch (error) {
        loading.style.display = 'none';
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${error.message}</td></tr>`;
    }
}

async function loadSuppliers() {
    const select = document.getElementById('expenseSupplier');
    try {
        const res = await fetch(`${API_URL}/suppliers`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        if (!res.ok) throw new Error('Error cargando proveedores');
        const suppliers = await res.json();
        suppliers.forEach(s => {
            select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
        });
    } catch (error) {
        console.error('Error cargando proveedores:', error);
    }
}

async function loadBranches() {
    if (userRole !== 'admin') return;

    const select = document.getElementById('expenseBranch');
    try {
        const res = await fetch(`${API_URL}/branches`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const branches = await res.json();
        branches.forEach(b => {
            select.innerHTML += `<option value="${b.id}">${b.name}</option>`;
        });
    } catch (error) {
        console.error('Error cargando sedes:', error);
    }
}

function openExpenseModal() {
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseId').value = '';
    document.getElementById('expenseModalLabel').textContent = 'Registrar Nuevo Gasto';
    document.getElementById('expenseDate').valueAsDate = new Date();
    expenseModal.show();
}

function editExpense(id) {
    const expense = currentExpenses.find(e => e.id === id);
    if (!expense) return;

    document.getElementById('expenseId').value = expense.id;
    document.getElementById('expenseDescription').value = expense.description;
    document.getElementById('expenseAmount').value = expense.amount;
    document.getElementById('expenseCategory').value = expense.category;
    document.getElementById('expenseSupplier').value = expense.supplier_id || '';
    document.getElementById('expenseBranch').value = expense.branch_id || '';
    
    const date = new Date(expense.expense_date);
    document.getElementById('expenseDate').value = date.toISOString().split('T')[0];

    document.getElementById('expenseModalLabel').textContent = 'Editar Gasto';
    expenseModal.show();
}

async function handleExpenseSubmit(e) {
    e.preventDefault();
    const btn = document.querySelector('#expenseForm .btn-submit');
    
    const id = document.getElementById('expenseId').value;
    const data = {
        description: document.getElementById('expenseDescription').value,
        amount: document.getElementById('expenseAmount').value,
        category: document.getElementById('expenseCategory').value,
        supplier_id: document.getElementById('expenseSupplier').value || null,
        branch_id: document.getElementById('expenseBranch').value || null,
        expense_date: document.getElementById('expenseDate').value,
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/api/expenses/${id}` : `${API_URL}/api/expenses`;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

    try {
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
        expenseModal.hide();
        loadExpenses();
    } catch (error) {
        showToast(error.message, true);
    } finally {
        btn.disabled = false;
        btn.innerHTML = id ? 'Actualizar Gasto' : 'Guardar Gasto';
    }
}

async function deleteExpense(id) {
    if (!confirm('¿Estás seguro de eliminar este gasto? Esta acción no se puede deshacer.')) return;
    try {
        const res = await fetch(`${API_URL}/api/expenses/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message);
        showToast(result.message);
        loadExpenses();
    } catch (error) {
        showToast(error.message, true);
    }
}

function setDefaultDates() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const startEl = document.getElementById('filterStartDate');
    const endEl = document.getElementById('filterEndDate');
    if (startEl) startEl.value = `${y}-${m}-01`;
    if (endEl) endEl.value = `${y}-${m}-${d}`;
}

function updateSummary(summary) {
    const formatCurrency = (amount) => parseFloat(amount || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const totalEl = document.getElementById('summaryTotal');
    const countEl = document.getElementById('summaryCount');
    const catEl = document.getElementById('summaryCategories');

    if (!summary) return;
    if (totalEl) totalEl.textContent = formatCurrency(summary.total);
    if (countEl) countEl.textContent = summary.count || 0;
    if (catEl && summary.categories) {
        const entries = Object.entries(summary.categories).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) {
            catEl.innerHTML = '<span class="text-muted">Sin datos</span>';
        } else {
            catEl.innerHTML = entries.map(([cat, amount]) =>
                `<span class="badge bg-danger bg-opacity-10 text-danger me-1 mb-1">${cat}: ${formatCurrency(amount)}</span>`
            ).join('');
        }
    }
}

let categoriesPopulated = false;
function populateCategoryFilter(expenses) {
    if (categoriesPopulated) return;
    const select = document.getElementById('filterCategory');
    if (!select) return;
    const categories = [...new Set(expenses.map(e => e.category).filter(Boolean))];
    categories.sort().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        select.appendChild(opt);
    });
    categoriesPopulated = true;
}

function applyFilters() {
    loadExpenses();
}

function clearFilters() {
    setDefaultDates();
    const cat = document.getElementById('filterCategory');
    if (cat) cat.value = '';
    loadExpenses();
}