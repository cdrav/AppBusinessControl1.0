const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
    const [c] = await db.query('SELECT * FROM clients ORDER BY name ASC');
    res.json(c);
});
router.post('/', authenticateToken, async (req, res) => {
    const { name, email, phone, address } = req.body;
    const [r] = await db.query('INSERT INTO clients (name, email, phone, address) VALUES (?, ?, ?, ?)', [name, email, phone, address]);
    res.status(201).json({ message: 'Cliente creado', clienteId: r.insertId });
});
router.put('/:id', authenticateToken, async (req, res) => {
    const { name, email, phone, address } = req.body;
    await db.query('UPDATE clients SET name=?, email=?, phone=?, address=? WHERE id=?', [name, email, phone, address, req.params.id]);
    res.json({ message: 'Cliente actualizado' });
});
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    await db.query('DELETE FROM clients WHERE id=?', [req.params.id]);
    res.json({ message: 'Cliente eliminado' });
});
router.get('/:id/sales', authenticateToken, async (req, res) => {
    const [sales] = await db.query(`SELECT s.id, s.sale_date, s.total_price, COUNT(sd.id) as item_count FROM sales s LEFT JOIN sale_details sd ON s.id = sd.sale_id WHERE s.client_id = ? GROUP BY s.id ORDER BY s.sale_date DESC`, [req.params.id]);
    res.json(sales);
});

module.exports = router;
