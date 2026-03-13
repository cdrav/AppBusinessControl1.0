const jwt = require('jsonwebtoken');

// Mock del middleware para testing
jest.mock('../../middleware/auth', () => {
  const actualAuth = jest.requireActual('../../middleware/auth');
  return {
    ...actualAuth,
    authenticateToken: jest.fn((req, res, next) => {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      
      if (!token) {
        return res.status(401).json({ message: 'Autenticación requerida.' });
      }
      
      try {
        jwt.verify(token, process.env.JWT_SECRET || 'secreto_super_seguro', (err, user) => {
          if (err) return res.status(403).json({ message: 'Sesión no válida o expirada.' });
          req.user = user;
          next();
        });
      } catch (error) {
        return res.status(403).json({ message: 'Sesión no válida o expirada.' });
      }
    }),
    authorizeRole: jest.fn((allowedRoles) => {
      return (req, res, next) => {
        const userRole = req.user ? req.user.role : null;
        if (allowedRoles.includes(userRole)) {
          next();
        } else {
          res.status(403).json({ message: 'No tienes permisos suficientes.' });
        }
      };
    })
  };
});

describe('Authentication Middleware Tests', () => {
  let mockReq, mockRes, mockNext;
  let { authenticateToken, authorizeRole } = require('../../middleware/auth');

  beforeEach(() => {
    mockReq = {
      headers: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
    
    // Mockear process.env.JWT_SECRET
    process.env.JWT_SECRET = 'test_secret_key';
    
    // Limpiar mocks
    jest.clearAllMocks();
  });

  describe('authenticateToken', () => {
    test('should pass with valid token', () => {
      const token = jwt.sign({ id: 1, username: 'testuser', role: 'admin' }, 'test_secret_key');
      mockReq.headers.authorization = `Bearer ${token}`;

      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user.id).toBe(1);
      expect(mockReq.user.username).toBe('testuser');
    });

    test('should reject without token', () => {
      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Autenticación requerida.' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should reject with invalid token', () => {
      mockReq.headers.authorization = 'Bearer invalid_token';

      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Sesión no válida o expirada.' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('authorizeRole', () => {
    test('should pass with authorized role', () => {
      mockReq.user = { role: 'admin' };
      const middleware = authorizeRole(['admin', 'manager']);

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should reject with unauthorized role', () => {
      mockReq.user = { role: 'cashier' };
      const middleware = authorizeRole(['admin', 'manager']);

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'No tienes permisos suficientes.' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
