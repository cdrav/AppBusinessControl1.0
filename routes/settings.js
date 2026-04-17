const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/images/uploads')),
  filename: (req, file, cb) => cb(null, 'logo-' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// Configuración General
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM settings WHERE tenant_id = ?', [req.user.tenant_id]);
        res.json(rows[0] || {});
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener configuración.' });
    }
});

router.put('/', authenticateToken, authorizeRole(['admin']), upload.single('company_logo'), async (req, res) => {
    try {
        const { company_name, company_address, company_phone, company_email, ticket_format } = req.body;
        let q = 'UPDATE settings SET company_name=?, company_address=?, company_phone=?, company_email=?, ticket_format=?';
        let p = [company_name, company_address, company_phone, company_email, ticket_format || 'A4'];
        if (req.file) { q += ', company_logo=?'; p.push(`images/uploads/${req.file.filename}`); }
        q += ' WHERE tenant_id=?';
        p.push(req.user.tenant_id);
        await db.query(q, p);
        res.json({ message: 'Configuración guardada' });
    } catch (error) {
        res.status(500).json({ message: 'Error al guardar configuración.' });
    }
});

// Sucursales
router.get('/branches', authenticateToken, async (req, res) => {
    try {
        const [b] = await db.query('SELECT * FROM branches WHERE tenant_id = ? ORDER BY id ASC', [req.user.tenant_id]);
        res.json(b);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener sucursales.' });
    }
});
router.post('/branches', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        await db.query('INSERT INTO branches (tenant_id, name, address, phone) VALUES (?, ?, ?, ?)', [req.user.tenant_id, req.body.name, req.body.address, req.body.phone]);
        res.status(201).json({ message: 'Sucursal creada' });
    } catch (error) {
        res.status(500).json({ message: 'Error al crear sucursal.' });
    }
});
router.delete('/branches/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try { await db.query('DELETE FROM branches WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]); res.json({ message: 'Eliminada' }); }
    catch { res.status(500).json({ message: 'Error: Tiene datos asociados' }); }
});

// Proveedores
router.get('/suppliers', authenticateToken, async (req, res) => {
    try {
        const [s] = await db.query('SELECT * FROM suppliers WHERE tenant_id = ? ORDER BY name ASC', [req.user.tenant_id]);
        res.json(s);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener proveedores.' });
    }
});
router.post('/suppliers', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        await db.query('INSERT INTO suppliers (tenant_id, name, contact_name, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)', [req.user.tenant_id, req.body.name, req.body.contact_name, req.body.phone, req.body.email, req.body.address]);
        res.status(201).json({ message: 'Proveedor creado' });
    } catch (error) {
        res.status(500).json({ message: 'Error al crear proveedor.' });
    }
});
router.delete('/suppliers/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try { await db.query('DELETE FROM suppliers WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]); res.json({ message: 'Eliminado' }); }
    catch { res.status(400).json({ message: 'Tiene productos asociados' }); }
});

// Cupones
router.get('/coupons', authenticateToken, async (req, res) => {
    try {
        const [c] = await db.query('SELECT * FROM coupons WHERE tenant_id = ? ORDER BY created_at DESC', [req.user.tenant_id]);
        res.json(c);
    } catch (error) {
        console.error('Error al obtener cupones:', error.message);
        res.status(500).json({ message: 'Error al obtener cupones' });
    }
});
router.post('/coupons', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        const { code, discount_type, value, expiration_date } = req.body;
        await db.query('INSERT INTO coupons (tenant_id, code, discount_type, value, expiration_date) VALUES (?, ?, ?, ?, ?)', [req.user.tenant_id, code, discount_type, value, expiration_date || null]);
        res.status(201).json({ message: 'Cupón creado' });
    } catch (error) {
        res.status(500).json({ message: 'Error al crear cupón.' });
    }
});
router.delete('/coupons/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        await db.query('DELETE FROM coupons WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
        res.json({ message: 'Cupón eliminado' });
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar cupón.' });
    }
});
router.get('/coupons/validate/:code', authenticateToken, async (req, res) => {
    try {
        const [c] = await db.query('SELECT * FROM coupons WHERE code = ? AND tenant_id = ? AND active = 1', [req.params.code, req.user.tenant_id]);
        if (c.length === 0) return res.status(404).json({ message: 'Cupón inválido' });
        if (c[0].expiration_date && new Date(c[0].expiration_date) < new Date()) return res.status(400).json({ message: 'Cupón expirado' });
        res.json(c[0]);
    } catch (error) {
        res.status(500).json({ message: 'Error al validar cupón.' });
    }
});

// Purgar Datos (Limpieza de Base de Datos)
router.post('/purge-data', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { password, type } = req.body;
    
    // Verificar contraseña de admin
    const [u] = await db.query('SELECT password FROM users WHERE id=?', [req.user.id]);
    if (!await bcrypt.compare(password, u[0].password)) return res.status(403).json({ message: 'Contraseña incorrecta' });

    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();
        
        if (type === 'sales') {
            await conn.query('SET FOREIGN_KEY_CHECKS = 0');
            await conn.query('TRUNCATE TABLE sale_details');
            await conn.query('TRUNCATE TABLE sales');
            await conn.query('TRUNCATE TABLE inventory_transfers');
            await conn.query('SET FOREIGN_KEY_CHECKS = 1');
        }
        
        await conn.commit();
        res.json({ message: 'Historial de ventas y movimientos eliminado correctamente.' });
    } catch (e) { if(conn) await conn.rollback(); res.status(500).json({ message: 'Error al purgar datos: ' + e.message }); } finally { if(conn) conn.release(); }
});

module.exports = router;
