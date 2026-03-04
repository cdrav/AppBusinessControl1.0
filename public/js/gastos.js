const API_URL = '';
let expenseModal;

document.addEventListener('DOMContentLoaded', () => {
    expenseModal = new bootstrap.Modal(document.getElementById('expenseModal'));
    loadExpenses();
    loadSuppliers();
    loadBranches();

    document.getElementById('expenseForm').addEventListener('submit', handleExpenseSubmit);
});

async function loadExpenses() {
    const tbody = document.getElementById('expensesTableBody');
    const loading = document.getElementById('loadingState');
    const empty = document.getElementById('emptyState');

    try {
        const res = await fetch(`${API_URL}/api/expenses`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        if (res.status === 401 || res.status === 403) {
            window.location.href = 'login.html';
            return;
        }
        if (!res.ok) throw new Error('Error cargando gastos');
        const expenses = await res.json();

        loading.style.display = 'none';
        tbody.innerHTML = '';

        if (expenses.length === 0) {
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        const formatCurrency = (amount) => parseFloat(amount || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

        expenses.forEach(expense => {
            const date = new Date(expense.expense_date);
            // Ajustar por zona horaria para que muestre la fecha correcta
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
        const suppliers = await res.json();
        suppliers.forEach(s => {
            select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
        });
    } catch (error) {
        console.error('Error cargando proveedores:', error);
    }
}

async function loadBranches() {
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
    // Set today's date by default
    document.getElementById('expenseDate').valueAsDate = new Date();
    expenseModal.show();
}

async function handleExpenseSubmit(e) {
    e.preventDefault();
    const btn = document.querySelector('#expenseForm .btn-submit');
    
    const data = {
        description: document.getElementById('expenseDescription').value,
        amount: document.getElementById('expenseAmount').value,
        category: document.getElementById('expenseCategory').value,
        supplier_id: document.getElementById('expenseSupplier').value || null,
        branch_id: document.getElementById('expenseBranch').value || null,
        expense_date: document.getElementById('expenseDate').value,
    };

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

    try {
        const res = await fetch(`${API_URL}/api/expenses`, {
            method: 'POST',
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
        btn.innerHTML = 'Guardar Gasto';
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