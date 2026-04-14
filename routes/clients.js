const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { requireFields, validateEmail, validateParamId } = require('../middleware/validate');
const { parsePagination, paginatedResponse } = require('../middleware/paginate');

router.get('/', authenticateToken, async (req, res) => {
    try {
        const { search } = req.query;
        let where = 'WHERE tenant_id = ? AND is_active = TRUE';
        let params = [req.user.tenant_id];

        if (search) {
            where += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term);
        }

        // Si se pasa ?page=, devolver formato paginado
        if (req.query.page) {
            const { page, limit, offset } = parsePagination(req.query);
            const [countResult] = await db.query(`SELECT COUNT(*) as total FROM clients ${where}`, params);
            const [c] = await db.query(`SELECT * FROM clients ${where} ORDER BY name ASC LIMIT ? OFFSET ?`, [...params, limit, offset]);
            return res.json(paginatedResponse(c, countResult[0].total, page, limit));
        }

        const [c] = await db.query(`SELECT * FROM clients ${where} ORDER BY name ASC`, params);
        res.json(c);
    } catch (error) {
        console.error('Error al obtener clientes:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
router.post('/', authenticateToken, requireFields('name'), validateEmail('email'), async (req, res) => {
    try {
        const { name, email, phone, address } = req.body;
        if (!name.trim()) {
            return res.status(400).json({ message: 'El nombre del cliente es obligatorio' });
        }
        const [r] = await db.query('INSERT INTO clients (tenant_id, name, email, phone, address) VALUES (?, ?, ?, ?, ?)', [req.user.tenant_id, name.trim(), email || null, phone || null, address || null]);
        res.status(201).json({ message: 'Cliente creado', clienteId: r.insertId });
    } catch (error) {
        console.error('Error al crear cliente:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
router.put('/:id', authenticateToken, validateParamId, requireFields('name'), validateEmail('email'), async (req, res) => {
    try {
        const { name, email, phone, address } = req.body;
        if (!name.trim()) {
            return res.status(400).json({ message: 'El nombre del cliente es obligatorio' });
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
        const [sales] = await db.query('SELECT COUNT(*) as count FROM sales WHERE client_id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
        if (sales[0].count > 0) {
            return res.status(400).json({ message: `No se puede eliminar: el cliente tiene ${sales[0].count} venta(s) asociada(s).` });
        }
        const [credits] = await db.query('SELECT COUNT(*) as count FROM credits WHERE client_id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
        if (credits[0].count > 0) {
            return res.status(400).json({ message: `No se puede eliminar: el cliente tiene ${credits[0].count} crédito(s) asociado(s).` });
        }
        await db.query('UPDATE clients SET is_active = FALSE WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
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
