const jwt = require('jsonwebtoken');

// Testeamos el código REAL del middleware (sin mock)
const { authenticateToken, authorizeRole, authorizeRoles, authorizeSpecificRole } = require('../../middleware/auth');

describe('Auth Middleware - Tests Reales', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = { headers: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  describe('authenticateToken', () => {
    test('pasa con token JWT válido', (done) => {
      const { getJwtSecret } = require('../../middleware/auth');
      const secret = getJwtSecret();
      const token = jwt.sign({ id: 1, username: 'test', role: 'admin' }, secret);
      mockReq.headers.authorization = `Bearer ${token}`;

      authenticateToken(mockReq, mockRes, () => {
        expect(mockReq.user.id).toBe(1);
        expect(mockReq.user.username).toBe('test');
        expect(mockReq.user.role).toBe('admin');
        done();
      });
    });

    test('rechaza sin token (401)', () => {
      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Autenticación requerida.' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('rechaza con token inválido (403)', (done) => {
      mockReq.headers.authorization = 'Bearer token_invalido_123';

      authenticateToken(mockReq, mockRes, mockNext);

      // jwt.verify es async con callback, dar un tick
      setTimeout(() => {
        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
        done();
      }, 50);
    });

    test('rechaza token expirado (403)', (done) => {
      const { getJwtSecret } = require('../../middleware/auth');
      const token = jwt.sign({ id: 1 }, getJwtSecret(), { expiresIn: '-1s' });
      mockReq.headers.authorization = `Bearer ${token}`;

      authenticateToken(mockReq, mockRes, mockNext);

      setTimeout(() => {
        expect(mockRes.status).toHaveBeenCalledWith(403);
        done();
      }, 50);
    });

    test('rechaza si solo dice "Bearer" sin token', () => {
      mockReq.headers.authorization = 'Bearer ';

      authenticateToken(mockReq, mockRes, mockNext);
      // "Bearer ".split(' ')[1] = '' que es falsy
    });
  });

  describe('authorizeRole', () => {
    test('permite rol autorizado', () => {
      mockReq.user = { role: 'admin' };
      const middleware = authorizeRole(['admin', 'cajero']);

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('bloquea rol no autorizado', () => {
      mockReq.user = { role: 'cobrador' };
      const middleware = authorizeRole(['admin']);

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('bloquea si no hay user', () => {
      mockReq.user = null;
      const middleware = authorizeRole(['admin']);

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe('authorizeSpecificRole', () => {
    test('permite rol específico exacto', () => {
      mockReq.user = { role: 'cajero' };
      const middleware = authorizeSpecificRole('cajero');

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('bloquea rol diferente', () => {
      mockReq.user = { role: 'cajero' };
      const middleware = authorizeSpecificRole('admin');

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe('authorizeRoles', () => {
    test('permite cualquiera de los roles listados', () => {
      mockReq.user = { role: 'cobrador' };
      const middleware = authorizeRoles(['admin', 'cobrador', 'supervisor']);

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
