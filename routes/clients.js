const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { isValidEmail } = require('../middleware/sanitize');

router.get('/', authenticateToken, async (req, res) => {
    try {
        const [c] = await db.query('SELECT * FROM clients WHERE tenant_id = ? ORDER BY name ASC', [req.user.tenant_id]);
        res.json(c);
    } catch (error) {
        console.error('Error al obtener clientes:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, email, phone, address } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'El nombre del cliente es obligatorio' });
        }
        if (email && !isValidEmail(email)) {
            return res.status(400).json({ message: 'Formato de email inválido' });
        }
        const [r] = await db.query('INSERT INTO clients (tenant_id, name, email, phone, address) VALUES (?, ?, ?, ?, ?)', [req.user.tenant_id, name.trim(), email || null, phone || null, address || null]);
        res.status(201).json({ message: 'Cliente creado', clienteId: r.insertId });
    } catch (error) {
        console.error('Error al crear cliente:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { name, email, phone, address } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'El nombre del cliente es obligatorio' });
        }
        if (email && !isValidEmail(email)) {
            return res.status(400).json({ message: 'Formato de email inválido' });
        }
        await db.query('UPDATE clients SET name=?, email=?, phone=?, address=? WHERE id=? AND tenant_id=?', [name.trim(), email || null, phone || null, address || null, req.params.id, req.user.tenant_id]);
        res.json({ message: 'Cliente actualizado' });
    } catch (error) {
        console.error('Error al actualizar cliente:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        await db.query('DELETE FROM clients WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
        res.json({ message: 'Cliente eliminado' });
    } catch (error) {
        console.error('Error al eliminar cliente:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const [c] = await db.query('SELECT * FROM clients WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);
        if (c.length === 0) return res.status(404).json({ message: 'Cliente no encontrado' });
        res.json(c[0]);
    } catch (error) {
        console.error('Error al obtener cliente:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

router.get('/:id/sales', authenticateToken, async (req, res) => {
    try {
        const [sales] = await db.query(`SELECT s.id, s.sale_date, s.total_price, COUNT(sd.id) as item_count FROM sales s LEFT JOIN sale_details sd ON s.id = sd.sale_id WHERE s.client_id = ? AND s.tenant_id = ? GROUP BY s.id ORDER BY s.sale_date DESC`, [req.params.id, req.user.tenant_id]);
        res.json(sales);
    } catch (error) {
        console.error('Error al obtener ventas del cliente:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

module.exports = router;
