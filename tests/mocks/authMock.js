// Mock para middleware de autenticación
const createMockAuthMiddleware = (user = { id: 1, username: 'testuser', role: 'admin', branch_id: 1 }) => {
  return {
    authenticateToken: (req, res, next) => {
      req.user = user;
      next();
    },
    authorizeRole: (allowedRoles = ['admin', 'cajero']) => {
      return (req, res, next) => {
        if (allowedRoles.includes(req.user?.role)) {
          next();
        } else {
          res.status(403).json({ message: 'No tienes permisos suficientes.' });
        }
      };
    }
  };
};

module.exports = { createMockAuthMiddleware };
