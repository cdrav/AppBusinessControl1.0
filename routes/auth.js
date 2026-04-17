const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticateToken, getJwtSecret } = require('../middleware/auth');
const { requireFields, validateEmail, validateMinLength } = require('../middleware/validate');

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

router.post('/register', requireFields('username', 'email', 'password'), validateEmail('email'), async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const [usersFound] = await db.query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (usersFound.length > 0) return res.status(409).json({ message: 'Usuario ya existe.' });

    const [userCount] = await db.query('SELECT COUNT(*) as count FROM users');
    const role = userCount[0].count === 0 ? 'admin' : 'cajero';
    const passwordHash = await bcrypt.hash(password, 10);

    await db.query('INSERT INTO users (username, email, password, plain_password, role, tenant_id, branch_id) VALUES (?, ?, ?, ?, ?, 1, 1)', [username, email, passwordHash, password, role]);
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

    // Verificar si el acceso está habilitado
    if (user.is_login_enabled === 0 || user.is_login_enabled === false) {
      return res.status(403).json({ message: 'Tu acceso ha sido deshabilitado. Contacta al administrador.' });
    }
    
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

// Refresh token silencioso
router.post('/refresh-token', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, username, role, branch_id, tenant_id FROM users WHERE id = ?', [req.user.id]);
        if (rows.length === 0) return res.status(401).json({ message: 'Usuario no encontrado.' });

        const user = rows[0];
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, branch_id: user.branch_id || 1, tenant_id: user.tenant_id || 1 },
            getJwtSecret(),
            { expiresIn: '8h' }
        );
        res.json({ token });
    } catch (error) {
        console.error('Error refreshing token:', error);
        res.status(500).json({ message: 'Error renovando sesión.' });
    }
});

router.put('/profile/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Contraseña actual y nueva son requeridas.' });
        if (newPassword.length < 6) return res.status(400).json({ message: 'Mínimo 6 caracteres.' });
        
        const [userData] = await db.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
        if (!userData.length) return res.status(404).json({ message: 'Usuario no encontrado.' });
        const isMatch = await bcrypt.compare(currentPassword, userData[0].password);
        if (!isMatch) return res.status(401).json({ message: 'Contraseña actual incorrecta.' });

        const encrypted = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password = ?, plain_password = ? WHERE id = ?', [encrypted, newPassword, req.user.id]);
        res.json({ message: 'Contraseña actualizada.' });
    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        res.status(500).json({ message: 'Error al cambiar contraseña.' });
    }
});

// ========================================
// PASSWORD RECOVERY ENDPOINTS
// ========================================

// Generar token de recuperación
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email requerido.' });

        // Verificar que el usuario existe
        const [users] = await db.query('SELECT id, email, username FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            // Por seguridad, no revelar si el email existe o no
            return res.json({ message: 'Si el email existe, recibirás instrucciones.' });
        }

        const user = users[0];

        // Generar token único (6 dígitos para desarrollo, JWT para producción)
        const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
        const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

        // Guardar token en tabla password_resets (o crear tabla si no existe)
        try {
            await db.query(
                'INSERT INTO password_resets (email, token, expires_at, created_at) VALUES (?, ?, ?, NOW())',
                [email, resetToken, tokenExpiry]
            );
        } catch (tableError) {
            // Si la tabla no existe, intentar crearla
            if (tableError.code === 'ER_NO_SUCH_TABLE') {
                await db.query(`CREATE TABLE IF NOT EXISTS password_resets (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    email VARCHAR(255) NOT NULL,
                    token VARCHAR(255) NOT NULL,
                    expires_at DATETIME NOT NULL,
                    used BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_email (email),
                    INDEX idx_token (token)
                )`);
                await db.query(
                    'INSERT INTO password_resets (email, token, expires_at, created_at) VALUES (?, ?, ?, NOW())',
                    [email, resetToken, tokenExpiry]
                );
            } else {
                throw tableError;
            }
        }

        // En desarrollo, mostrar token en consola
        if (process.env.NODE_ENV !== 'production') {
            console.log(`\n🔐 PASSWORD RESET TOKEN para ${email}: ${resetToken}\n`);
        }

        // TODO: En producción, enviar email aquí
        // await sendResetEmail(email, resetToken, user.username);

        const response = { message: 'Si el email existe, recibirás instrucciones.' };
        if (process.env.NODE_ENV !== 'production') response.devToken = resetToken;
        res.json(response);

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Error procesando solicitud.' });
    }
});

// Verificar token válido
router.get('/verify-reset-token', async (req, res) => {
    try {
        const { email, token } = req.query;
        if (!email || !token) return res.status(400).json({ message: 'Datos incompletos.' });

        const [records] = await db.query(
            'SELECT * FROM password_resets WHERE email = ? AND token = ? AND used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
            [email, token]
        );

        if (records.length === 0) {
            return res.status(400).json({ message: 'Token inválido o expirado.' });
        }

        res.json({ valid: true, email });

    } catch (error) {
        console.error('Verify token error:', error);
        res.status(500).json({ message: 'Error verificando token.' });
    }
});

// Resetear contraseña con token
router.post('/reset-password', async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;
        if (!email || !token || !newPassword) {
            return res.status(400).json({ message: 'Datos incompletos.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
        }

        // Verificar token
        const [records] = await db.query(
            'SELECT * FROM password_resets WHERE email = ? AND token = ? AND used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
            [email, token]
        );

        if (records.length === 0) {
            return res.status(400).json({ message: 'Token inválido o expirado.' });
        }

        // Actualizar contraseña
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password = ?, plain_password = ? WHERE email = ?', [passwordHash, newPassword, email]);

        // Marcar token como usado
        await db.query('UPDATE password_resets SET used = TRUE WHERE id = ?', [records[0].id]);

        res.json({ message: 'Contraseña actualizada exitosamente.' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Error actualizando contraseña.' });
    }
});

module.exports = router;
