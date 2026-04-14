/**
 * Helper para configurar mocks comunes en tests de rutas.
 * Usar ANTES de require() en cada test file:
 * 
 *   require('../helpers/mockSetup').setupMocks();
 *   const db = require('../../config/db');
 *   const createTestApp = require('../testServer');
 */

function setupMocks() {
  // Mock DB
  jest.mock('../../config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
    execute: jest.fn()
  }));

  // Mock mailer
  jest.mock('../../config/mailer', () => ({
    sendMail: jest.fn()
  }));

  // Mock auth middleware - simula usuario admin autenticado
  jest.mock('../../middleware/auth', () => ({
    authenticateToken: (req, res, next) => {
      req.user = { id: 1, username: 'testuser', role: 'admin', branch_id: 1, tenant_id: 1 };
      req.userRole = 'admin';
      next();
    },
    authorizeRole: (roles) => (req, res, next) => {
      if (roles.includes(req.user?.role)) next();
      else res.status(403).json({ message: 'No tienes permisos suficientes.' });
    },
    authorizeRoles: (roles) => (req, res, next) => {
      if (roles.includes(req.user?.role)) next();
      else res.status(403).json({ message: 'No tienes permisos suficientes.' });
    },
    authorizeSpecificRole: (role) => (req, res, next) => {
      if (req.user?.role === role) next();
      else res.status(403).json({ message: 'No tienes permisos suficientes.' });
    },
    getJwtSecret: () => 'test_secret_key'
  }));
}

module.exports = { setupMocks };
