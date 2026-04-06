const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { ROLES } = require('../config/roles');

// Obtener todos los usuarios (solo admin)
router.get('/', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT u.id, u.username, u.email, u.role, u.created_at,
             b.name as branch_name
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.tenant_id = ?
      ORDER BY u.created_at DESC
    `, [req.user.tenant_id]);
    
    res.json(users);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Crear nuevo usuario (solo admin)
router.post('/', authenticateToken, authorizeRole([ROLES.ADMIN]), async (req, res) => {
  try {
    const { username, email, password, role = ROLES.CAJERO, branch_id } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }
    
    // Verificar si el usuario ya existe
    const [existingUser] = await db.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    
    if (existingUser.length > 0) {
      return res.status(409).json({ message: 'El usuario ya existe' });
    }
    
    // Hashear contraseña
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Insertar nuevo usuario
    const [result] = await db.query(
      'INSERT INTO users (tenant_id, username, email, password, role, branch_id) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.tenant_id, username, email, passwordHash, role, branch_id]
    );
    
    res.status(201).json({ 
      message: 'Usuario creado exitosamente',
      userId: result.insertId
    });
    
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Actualizar usuario (solo admin)
router.put('/:id', authenticateToken, authorizeRole([ROLES.ADMIN]), async (req, res) => {
  try {
    const { username, email, role, branch_id, password } = req.body;
    const userId = req.params.id;
    
    // Construir consulta dinámica
    let updateFields = [];
    let updateValues = [];
    
    if (username) {
      updateFields.push('username = ?');
      updateValues.push(username);
    }
    
    if (email) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    
    if (role) {
      updateFields.push('role = ?');
      updateValues.push(role);
    }
    
    if (branch_id !== undefined) {
      updateFields.push('branch_id = ?');
      updateValues.push(branch_id);
    }
    
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updateFields.push('password = ?');
      updateValues.push(passwordHash);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No hay campos para actualizar' });
    }
    
    updateValues.push(userId, req.user.tenant_id);
    
    const [result] = await db.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ? AND tenant_id = ?`,
      updateValues
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado o sin permisos' });
    }
    
    res.json({ message: 'Usuario actualizado exitosamente' });
    
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Eliminar usuario (solo admin)
router.delete('/:id', authenticateToken, authorizeRole([ROLES.ADMIN]), async (req, res) => {
  try {
    const userId = req.params.id;
    
    // No permitir eliminar al usuario actual
    if (parseInt(userId) === req.user.id) {
      return res.status(403).json({ message: 'No puedes eliminar tu propio usuario' });
    }
    
    const [result] = await db.query('DELETE FROM users WHERE id = ? AND tenant_id = ?', [userId, req.user.tenant_id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado o sin permisos' });
    }
    
    res.json({ message: 'Usuario eliminado exitosamente' });
    
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener usuarios por rol (solo admin)
router.get('/role/:role', authenticateToken, authorizeRole([ROLES.ADMIN]), async (req, res) => {
  try {
    const { role } = req.params;
    
    const [users] = await db.query(
      'SELECT id, username, email, role, created_at, b.name as branch_name FROM users u LEFT JOIN branches b ON u.branch_id = b.id WHERE u.role = ? AND u.tenant_id = ? ORDER BY u.created_at DESC',
      [role, req.user.tenant_id]
    );
    
    res.json(users);
    
  } catch (error) {
    console.error('Error al obtener usuarios por rol:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener cobradores (admin y cobrador pueden ver)
router.get('/cobradores', authenticateToken, async (req, res) => {
  try {
    const [cobradores] = await db.query(`
      SELECT u.id, u.username, u.email, u.created_at,
             b.name as branch_name,
             (SELECT COUNT(*) FROM credits WHERE collected_by = u.id AND tenant_id = u.tenant_id) as total_cobros,
             (SELECT COALESCE(SUM(remaining_balance), 0) FROM credits WHERE collected_by = u.id AND status != 'paid' AND tenant_id = u.tenant_id) as pending_amount
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.role = 'cobrador' AND u.tenant_id = ?
      ORDER BY u.created_at DESC
    `, [req.user.tenant_id]);
    
    res.json(cobradores);
    
  } catch (error) {
    console.error('Error al obtener cobradores:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

module.exports = router;
