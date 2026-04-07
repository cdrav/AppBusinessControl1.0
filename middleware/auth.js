const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('⚠️  ADVERTENCIA: JWT_SECRET no está definido en .env. Usando clave por defecto (NO USAR EN PRODUCCIÓN)');
}
const SECRET_KEY = JWT_SECRET || 'dev_secret_change_in_production_' + Date.now();

function getJwtSecret() {
  return SECRET_KEY;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Autenticación requerida.' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ message: 'Sesión no válida o expirada.' });
    req.user = user;
    req.userRole = user.role;
    next();
  });
}

function authorizeRole(allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user ? req.user.role : null;
    if (allowedRoles.includes(userRole)) {
      next();
    } else {
      res.status(403).json({ message: 'No tienes permisos suficientes.' });
    }
  };
}

function authorizeSpecificRole(requiredRole) {
  return (req, res, next) => {
    const userRole = req.user ? req.user.role : null;
    
    if (userRole === requiredRole) {
      req.userRole = requiredRole;
      next();
    } else {
      res.status(403).json({ message: 'No tienes permisos suficientes.' });
    }
  };
}

function authorizeRoles(allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user ? req.user.role : null;
    
    if (allowedRoles.includes(userRole)) {
      req.userRole = userRole;
      next();
    } else {
      res.status(403).json({ message: 'No tienes permisos suficientes.' });
    }
  };
}

module.exports = { 
  authenticateToken, 
  authorizeRole, 
  authorizeSpecificRole,
  authorizeRoles,
  getJwtSecret
};
