const jwt = require('jsonwebtoken');
const { authenticateToken, authorizeRole } = require('../../middleware/auth');

describe('Authentication Middleware Tests', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      headers: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  describe('authenticateToken', () => {
    test('should pass with valid token', () => {
      const token = jwt.sign({ id: 1, username: 'test', role: 'admin' }, 'test_secret_key');
      mockReq.headers.authorization = `Bearer ${token}`;

      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user.id).toBe(1);
      expect(mockReq.user.username).toBe('test');
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
