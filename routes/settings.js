const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/images/uploads')),
  filename: (req, file, cb) => cb(null, 'logo-' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// Configuración General
router.get('/', authenticateToken, async (req, res) => {
    const [rows] = await db.query('SELECT * FROM settings WHERE id = 1');
    res.json(rows[0] || {});
});

router.put('/', authenticateToken, authorizeRole(['admin']), upload.single('company_logo'), async (req, res) => {
    const { company_name, company_address, company_phone, company_email, ticket_format } = req.body;
    let q = 'UPDATE settings SET company_name=?, company_address=?, company_phone=?, company_email=?, ticket_format=?';
    let p = [company_name, company_address, company_phone, company_email, ticket_format || 'A4'];
    if (req.file) { q += ', company_logo=?'; p.push(`images/uploads/${req.file.filename}`); }
    q += ' WHERE id=1';
    await db.query(q, p);
    res.json({ message: 'Configuración guardada' });
});

// Sucursales
router.get('/branches', authenticateToken, async (req, res) => {
    const [b] = await db.query('SELECT * FROM branches ORDER BY id ASC');
    res.json(b);
});
router.post('/branches', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    await db.query('INSERT INTO branches (name, address, phone) VALUES (?, ?, ?)', [req.body.name, req.body.address, req.body.phone]);
    res.status(201).json({ message: 'Sucursal creada' });
});
router.delete('/branches/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    if (req.params.id == 1) return res.status(400).json({ message: 'No se puede borrar la Principal' });
    try { await db.query('DELETE FROM branches WHERE id=?', [req.params.id]); res.json({ message: 'Eliminada' }); }
    catch { res.status(500).json({ message: 'Error: Tiene datos asociados' }); }
});

// Proveedores
router.get('/suppliers', authenticateToken, async (req, res) => {
    const [s] = await db.query('SELECT * FROM suppliers ORDER BY name ASC');
    res.json(s);
});
router.post('/suppliers', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    await db.query('INSERT INTO suppliers (name, contact_name, phone, email, address) VALUES (?, ?, ?, ?, ?)', [req.body.name, req.body.contact_name, req.body.phone, req.body.email, req.body.address]);
    res.status(201).json({ message: 'Proveedor creado' });
});
router.delete('/suppliers/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try { await db.query('DELETE FROM suppliers WHERE id=?', [req.params.id]); res.json({ message: 'Eliminado' }); }
    catch { res.status(400).json({ message: 'Tiene productos asociados' }); }
});

// Cupones
router.get('/coupons', authenticateToken, async (req, res) => {
    const [c] = await db.query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json(c);
});
router.post('/coupons', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { code, discount_type, value, expiration_date } = req.body;
    await db.query('INSERT INTO coupons (code, discount_type, value, expiration_date) VALUES (?, ?, ?, ?)', [code, discount_type, value, expiration_date || null]);
    res.status(201).json({ message: 'Cupón creado' });
});
router.delete('/coupons/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    await db.query('DELETE FROM coupons WHERE id=?', [req.params.id]);
    res.json({ message: 'Cupón eliminado' });
});
router.get('/coupons/validate/:code', authenticateToken, async (req, res) => {
    const [c] = await db.query('SELECT * FROM coupons WHERE code = ? AND active = 1', [req.params.code]);
    if (c.length === 0) return res.status(404).json({ message: 'Cupón inválido' });
    if (c[0].expiration_date && new Date(c[0].expiration_date) < new Date()) return res.status(400).json({ message: 'Cupón expirado' });
    res.json(c[0]);
});

module.exports = router;
