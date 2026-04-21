const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Obtener todos los gastos (con filtros opcionales)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate, category, branch_id } = req.query;
        let whereClauses = ['e.tenant_id = ?'];
        let params = [req.user.tenant_id];

        if (startDate) {
            whereClauses.push('e.expense_date >= ?');
            params.push(`${startDate} 00:00:00`);
        }
        if (endDate) {
            whereClauses.push('e.expense_date <= ?');
            params.push(`${endDate} 23:59:59`);
        }
        if (category) {
            whereClauses.push('e.category = ?');
            params.push(category);
        }
        if (branch_id) {
            whereClauses.push('e.branch_id = ?');
            params.push(branch_id);
        }

        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const [expenses] = await db.query(`
            SELECT e.*, s.name as supplier_name, b.name as branch_name
            FROM expenses e
            LEFT JOIN suppliers s ON e.supplier_id = s.id
            LEFT JOIN branches b ON e.branch_id = b.id
            ${whereClause}
            ORDER BY e.expense_date DESC
        `, params);

        // Calcular resumen
        const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        const categories = {};
        expenses.forEach(e => {
            const cat = e.category || 'Sin categoría';
            categories[cat] = (categories[cat] || 0) + parseFloat(e.amount || 0);
        });

        res.json({ expenses, summary: { total, count: expenses.length, categories } });
    } catch (error) {
        console.error('Error al obtener gastos:', error);
        res.status(500).json({ message: 'Error al obtener gastos.' });
    }
});

// Registrar un nuevo gasto
router.post('/', authenticateToken, async (req, res) => {
    const { description, amount, category, supplier_id, expense_date } = req.body;
    let { branch_id } = req.body;

    if (!description || !amount || !expense_date) {
        return res.status(400).json({ message: 'Descripción, monto y fecha son requeridos.' });
    }

    if (isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ message: 'El monto debe ser un número positivo.' });
    }

    // Si el usuario NO es admin, forzamos que el gasto sea de su sucursal
    if (req.user.role !== 'admin') {
        branch_id = req.user.branch_id;
    }

    try {
        await db.query(
            'INSERT INTO expenses (tenant_id, description, amount, category, supplier_id, branch_id, expense_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.user.tenant_id, description, amount, category, supplier_id || null, branch_id || null, expense_date]
        );
        res.status(201).json({ message: 'Gasto registrado con éxito.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al registrar el gasto.' });
    }
});

// Actualizar un gasto existente
router.put('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        const { description, amount, category, supplier_id, branch_id, expense_date } = req.body;
        await db.query(
            'UPDATE expenses SET description=?, amount=?, category=?, supplier_id=?, branch_id=?, expense_date=? WHERE id=? AND tenant_id=?',
            [description, amount, category, supplier_id || null, branch_id || null, expense_date, req.params.id, req.user.tenant_id]
        );
        res.json({ message: 'Gasto actualizado correctamente.' });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar gasto.' });
    }
});

// Eliminar un gasto
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        await db.query('DELETE FROM expenses WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);
        res.json({ message: 'Gasto eliminado.' });
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar gasto.' });
    }
});

module.exports = router;