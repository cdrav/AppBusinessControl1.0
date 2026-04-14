// Mocks deben ir ANTES de los imports (Jest los hoista)
jest.mock('../../config/db', () => ({
  query: jest.fn(), getConnection: jest.fn(), execute: jest.fn()
}));
jest.mock('../../config/mailer', () => ({ sendMail: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 1, username: 'testuser', role: 'admin', branch_id: 1, tenant_id: 1 };
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

const request = require('supertest');
const createTestApp = require('../testServer');
const bcrypt = require('bcrypt');
const db = require('../../config/db');

describe('Auth Routes - Tests Completos', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // POST /register
  // ==========================================
  describe('POST /register', () => {
    test('registra usuario nuevo exitosamente', async () => {
      db.query.mockResolvedValueOnce([[]]); // email no existe
      db.query.mockResolvedValueOnce([[{ count: 5 }]]); // ya hay usuarios → rol cajero
      db.query.mockResolvedValueOnce([{ insertId: 6 }]); // insert OK

      const res = await request(app)
        .post('/register')
        .send({ username: 'nuevo', email: 'nuevo@test.com', password: 'pass123' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Cuenta creada exitosamente.');
    });

    test('primer usuario recibe rol admin', async () => {
      db.query.mockResolvedValueOnce([[]]); // email no existe
      db.query.mockResolvedValueOnce([[{ count: 0 }]]); // 0 usuarios → admin
      db.query.mockResolvedValueOnce([{ insertId: 1 }]);

      const res = await request(app)
        .post('/register')
        .send({ username: 'admin', email: 'admin@test.com', password: 'admin123' });

      expect(res.status).toBe(201);
      // Verificar que se llamó INSERT con rol 'admin'
      const insertCall = db.query.mock.calls[2];
      expect(insertCall[1]).toContain('admin');
    });

    test('rechaza si falta username', async () => {
      const res = await request(app)
        .post('/register')
        .send({ email: 'test@test.com', password: 'pass123' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Campos requeridos');
    });

    test('rechaza si falta email', async () => {
      const res = await request(app)
        .post('/register')
        .send({ username: 'user', password: 'pass123' });

      expect(res.status).toBe(400);
    });

    test('rechaza si falta password', async () => {
      const res = await request(app)
        .post('/register')
        .send({ username: 'user', email: 'test@test.com' });

      expect(res.status).toBe(400);
    });

    test('rechaza usuario duplicado', async () => {
      db.query.mockResolvedValueOnce([[{ id: 1 }]]); // ya existe

      const res = await request(app)
        .post('/register')
        .send({ username: 'existente', email: 'dup@test.com', password: 'pass123' });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Usuario ya existe.');
    });

    test('maneja error de BD gracefully', async () => {
      db.query.mockRejectedValueOnce(new Error('Connection lost'));

      const res = await request(app)
        .post('/register')
        .send({ username: 'user', email: 'test@test.com', password: 'pass123' });

      expect(res.status).toBe(500);
    });
  });

  // ==========================================
  // POST /login
  // ==========================================
  describe('POST /login', () => {
    test('login exitoso retorna token JWT', async () => {
      const hashed = await bcrypt.hash('password123', 10);
      db.query.mockResolvedValueOnce([[{
        id: 1, username: 'admin', email: 'admin@test.com',
        password: hashed, role: 'admin', branch_id: 1, tenant_id: 1
      }]]);

      const res = await request(app)
        .post('/login')
        .send({ email: 'admin@test.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.message).toBe('Bienvenido');
    });

    test('rechaza email inexistente', async () => {
      db.query.mockResolvedValueOnce([[]]); // no hay usuario

      const res = await request(app)
        .post('/login')
        .send({ email: 'noexiste@test.com', password: 'pass123' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Credenciales inválidas.');
    });

    test('rechaza password incorrecto', async () => {
      const hashed = await bcrypt.hash('correctpassword', 10);
      db.query.mockResolvedValueOnce([[{
        id: 1, username: 'user', email: 'user@test.com',
        password: hashed, role: 'cajero'
      }]]);

      const res = await request(app)
        .post('/login')
        .send({ email: 'user@test.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Credenciales inválidas.');
    });

    test('rechaza si falta email', async () => {
      const res = await request(app)
        .post('/login')
        .send({ password: 'pass123' });

      expect(res.status).toBe(400);
    });

    test('rechaza si falta password', async () => {
      const res = await request(app)
        .post('/login')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(400);
    });

    test('maneja error de BD sin crash', async () => {
      db.query.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await request(app)
        .post('/login')
        .send({ email: 'test@test.com', password: 'pass123' });

      expect(res.status).toBe(500);
    });
  });

  // ==========================================
  // POST /forgot-password
  // ==========================================
  describe('POST /forgot-password', () => {
    test('genera token para email existente', async () => {
      db.query.mockResolvedValueOnce([[{ id: 1, email: 'user@test.com', username: 'user' }]]);
      db.query.mockResolvedValueOnce([{ insertId: 1 }]); // insert token OK

      const res = await request(app)
        .post('/forgot-password')
        .send({ email: 'user@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.devToken).toBeDefined();
      expect(res.body.devToken.length).toBe(6); // 6 dígitos
    });

    test('no revela si email no existe (seguridad)', async () => {
      db.query.mockResolvedValueOnce([[]]); // email no encontrado

      const res = await request(app)
        .post('/forgot-password')
        .send({ email: 'noexiste@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Si el email existe');
      expect(res.body.devToken).toBeUndefined(); // no genera token
    });

    test('rechaza sin email', async () => {
      const res = await request(app)
        .post('/forgot-password')
        .send({});

      expect(res.status).toBe(400);
    });

    test('crea tabla password_resets si no existe', async () => {
      db.query.mockResolvedValueOnce([[{ id: 1, email: 'user@test.com', username: 'user' }]]);
      // Primer INSERT falla porque tabla no existe
      const tableError = new Error('Table does not exist');
      tableError.code = 'ER_NO_SUCH_TABLE';
      db.query.mockRejectedValueOnce(tableError);
      // CREATE TABLE
      db.query.mockResolvedValueOnce([]);
      // Segundo INSERT OK
      db.query.mockResolvedValueOnce([{ insertId: 1 }]);

      const res = await request(app)
        .post('/forgot-password')
        .send({ email: 'user@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.devToken).toBeDefined();
    });
  });

  // ==========================================
  // POST /reset-password
  // ==========================================
  describe('POST /reset-password', () => {
    test('resetea contraseña con token válido', async () => {
      db.query.mockResolvedValueOnce([[{ id: 1, email: 'user@test.com', token: '123456', used: false }]]);
      db.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE password
      db.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE token used

      const res = await request(app)
        .post('/reset-password')
        .send({ email: 'user@test.com', token: '123456', newPassword: 'newpass123' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('actualizada');
    });

    test('rechaza token inválido/expirado', async () => {
      db.query.mockResolvedValueOnce([[]]); // token no encontrado

      const res = await request(app)
        .post('/reset-password')
        .send({ email: 'user@test.com', token: '000000', newPassword: 'newpass123' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('inválido o expirado');
    });

    test('rechaza contraseña muy corta', async () => {
      const res = await request(app)
        .post('/reset-password')
        .send({ email: 'user@test.com', token: '123456', newPassword: '123' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('6 caracteres');
    });

    test('rechaza datos incompletos', async () => {
      const res = await request(app)
        .post('/reset-password')
        .send({ email: 'user@test.com' }); // falta token y password

      expect(res.status).toBe(400);
    });
  });
});
