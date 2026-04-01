const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.get('/', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        const [logs] = await db.query(`
            SELECT a.*, u.username 
            FROM audit_logs a 
            LEFT JOIN users u ON a.user_id = u.id 
            WHERE a.tenant_id = ? 
            ORDER BY a.created_at DESC 
            LIMIT 100
        `, [req.user.tenant_id]);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener registros de auditoría' });
    }
});

module.exports = router;