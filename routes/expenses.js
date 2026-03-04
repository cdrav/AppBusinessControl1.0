const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Obtener todos los gastos
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [expenses] = await db.query(`
            SELECT e.*, s.name as supplier_name, b.name as branch_name
            FROM expenses e
            LEFT JOIN suppliers s ON e.supplier_id = s.id
            LEFT JOIN branches b ON e.branch_id = b.id
            ORDER BY e.expense_date DESC
        `);
        res.json(expenses);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener gastos.' });
    }
});

// Registrar un nuevo gasto
router.post('/', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { description, amount, category, supplier_id, branch_id, expense_date } = req.body;

    if (!description || !amount || !expense_date) {
        return res.status(400).json({ message: 'Descripción, monto y fecha son requeridos.' });
    }

    try {
        await db.query(
            'INSERT INTO expenses (description, amount, category, supplier_id, branch_id, expense_date) VALUES (?, ?, ?, ?, ?, ?)',
            [description, amount, category, supplier_id || null, branch_id || null, expense_date]
        );
        res.status(201).json({ message: 'Gasto registrado con éxito.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al registrar el gasto.' });
    }
});

// Eliminar un gasto
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    await db.query('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    res.json({ message: 'Gasto eliminado.' });
});

module.exports = router;