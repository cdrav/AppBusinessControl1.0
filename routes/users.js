const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcrypt');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.get('/', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const [users] = await db.query(`SELECT u.id, u.username, u.email, u.role, u.created_at, b.name as branch_name FROM users u LEFT JOIN branches b ON u.branch_id = b.id ORDER BY u.created_at DESC`);
    res.json(users);
});

router.post('/', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { username, email, password, role, branch_id } = req.body;
    const [ex] = await db.query('SELECT id FROM users WHERE email=? OR username=?', [email, username]);
    if (ex.length) return res.status(409).json({ message: 'Usuario existe' });
    
    const hash = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO users (username, email, password, role, branch_id) VALUES (?, ?, ?, ?, ?)', [username, email, hash, role, branch_id || null]);
    res.status(201).json({ message: 'Usuario creado' });
});

router.put('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const { username, email, role, branch_id, password } = req.body;
    if (req.user.id == id && role !== 'admin') return res.status(400).json({ message: 'No puedes quitarte admin' });

    let q = 'UPDATE users SET username=?, email=?, role=?, branch_id=?';
    let p = [username, email, role, branch_id || null];
    if (password) { q += ', password=?'; p.push(await bcrypt.hash(password, 10)); }
    q += ' WHERE id=?'; p.push(id);
    
    await db.query(q, p);
    res.json({ message: 'Usuario actualizado' });
});

router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    if (req.user.id == req.params.id) return res.status(400).json({ message: 'No puedes eliminarte' });
    await db.query('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ message: 'Usuario eliminado' });
});

module.exports = router;
