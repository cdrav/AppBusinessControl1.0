const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Obtener todos los gastos
router.get('/', authenticateToken, async (req, res) => {
    try {
        // Filtramos por tenant_id para asegurar aislamiento de datos
        const [expenses] = await db.query(`
            SELECT e.*, s.name as supplier_name, b.name as branch_name
            FROM expenses e
            LEFT JOIN suppliers s ON e.supplier_id = s.id
            LEFT JOIN branches b ON e.branch_id = b.id
            WHERE e.tenant_id = ?
            ORDER BY e.expense_date DESC
        `, [req.user.tenant_id]);
        res.json(expenses);
    } catch (error) {
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
    const { description, amount, category, supplier_id, branch_id, expense_date } = req.body;
    await db.query(
        'UPDATE expenses SET description=?, amount=?, category=?, supplier_id=?, branch_id=?, expense_date=? WHERE id=? AND tenant_id=?',
        [description, amount, category, supplier_id || null, branch_id || null, expense_date, req.params.id, req.user.tenant_id]
    );
    res.json({ message: 'Gasto actualizado correctamente.' });
});

// Eliminar un gasto
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    await db.query('DELETE FROM expenses WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);
    res.json({ message: 'Gasto eliminado.' });
});

module.exports = router;