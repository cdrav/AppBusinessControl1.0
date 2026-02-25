const jwt = require('jsonwebtoken');
require('dotenv').config();

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Autenticación requerida.' });

  jwt.verify(token, process.env.JWT_SECRET || 'secreto_super_seguro', (err, user) => {
    if (err) return res.status(403).json({ message: 'Sesión no válida o expirada.' });
    req.user = user;
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

module.exports = { authenticateToken, authorizeRole };
