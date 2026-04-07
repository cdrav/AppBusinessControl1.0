const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticateToken, getJwtSecret } = require('../middleware/auth');

// Rate limiting en memoria para login
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

function checkRateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.firstAttempt > WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return true;
  }
  record.count++;
  return record.count <= MAX_ATTEMPTS;
}

function resetRateLimit(ip) {
  loginAttempts.delete(ip);
}

// Limpiar registros expirados cada 30 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts) {
    if (now - record.firstAttempt > WINDOW_MS) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000);

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: 'Datos incompletos.' });

    const [usersFound] = await db.query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (usersFound.length > 0) return res.status(409).json({ message: 'Usuario ya existe.' });

    const [userCount] = await db.query('SELECT COUNT(*) as count FROM users');
    const role = userCount[0].count === 0 ? 'admin' : 'cajero';
    const passwordHash = await bcrypt.hash(password, 10);

    await db.query('INSERT INTO users (username, email, password, role, tenant_id, branch_id) VALUES (?, ?, ?, ?, 1, 1)', [username, email, passwordHash, role]);
    res.status(201).json({ message: 'Cuenta creada exitosamente.' });
  } catch (err) { res.status(500).json({ message: 'Error interno.' }); }
});

router.post('/login', async (req, res) => {
  try {
    const clientIp = req.ip || req.connection.remoteAddress;
    
    // Rate limiting
    if (!checkRateLimit(clientIp)) {
      const record = loginAttempts.get(clientIp);
      const waitMin = Math.ceil((WINDOW_MS - (Date.now() - record.firstAttempt)) / 60000);
      return res.status(429).json({ message: `Demasiados intentos. Intenta de nuevo en ${waitMin} minutos.` });
    }
    
    const { email, password } = req.body;
    
    // Validación básica
    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son requeridos.' });
    }
    
    // Verificar conexión a BD antes de consultar
    let rows;
    try {
      [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    } catch (dbError) {
      console.error('❌ Database error in login:', dbError.message);
      return res.status(500).json({ message: 'Error de conexión a la base de datos. Intente más tarde.' });
    }
    
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const user = rows[0];
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    // Login exitoso: resetear rate limit
    resetRateLimit(clientIp);

    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        branch_id: user.branch_id || 1,
        tenant_id: user.tenant_id || 1
      }, 
      getJwtSecret(), 
      { expiresIn: '8h' }
    );
    
    res.json({ message: 'Bienvenido', token });
  } catch (err) { 
    console.error('❌ Login error:', err.message);
    res.status(500).json({ message: 'Error interno del servidor.' }); 
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
