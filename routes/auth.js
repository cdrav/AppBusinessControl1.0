const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: 'Datos incompletos.' });

    const [usersFound] = await db.query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (usersFound.length > 0) return res.status(409).json({ message: 'Usuario ya existe.' });

    const [userCount] = await db.query('SELECT COUNT(*) as count FROM users');
    const role = userCount[0].count === 0 ? 'admin' : 'cajero';
    const passwordHash = await bcrypt.hash(password, 10);

    await db.query('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)', [username, email, passwordHash, role]);
    res.status(201).json({ message: 'Cuenta creada exitosamente.' });
  } catch (err) { res.status(500).json({ message: 'Error interno.' }); }
});

router.post('/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt:', { body: req.body });
    
    const { email, password } = req.body;
    
    // Validación básica
    if (!email || !password) {
      console.log('❌ Missing credentials');
      return res.status(400).json({ message: 'Email y contraseña son requeridos.' });
    }
    
    console.log('🔍 Searching user:', email);
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    
    if (rows.length === 0) {
      console.log('❌ User not found:', email);
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const user = rows[0];
    console.log('👤 User found:', { id: user.id, username: user.username });
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        branch_id: user.branch_id || null,
        tenant_id: user.tenant_id || null
      }, 
      process.env.JWT_SECRET || 'secreto_super_seguro', 
      { expiresIn: '8h' }
    );
    
    console.log('✅ Login successful:', email);
    res.json({ message: 'Bienvenido', token });
  } catch (err) { 
    console.error('❌ Login error:', err);
    res.status(500).json({ message: 'Error interno del servidor.', error: err.message }); 
  }
});

router.put('/profile/change-password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (newPassword.length < 6) return res.status(400).json({ message: 'Mínimo 6 caracteres.' });
    
    const [userData] = await db.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    const isMatch = await bcrypt.compare(currentPassword, userData[0].password);
    if (!isMatch) return res.status(401).json({ message: 'Contraseña actual incorrecta.' });

    const encrypted = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [encrypted, req.user.id]);
    res.json({ message: 'Contraseña actualizada.' });
});

module.exports = router;
