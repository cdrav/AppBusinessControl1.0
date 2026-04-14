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

describe('Authentication Routes Tests', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /register', () => {
    test('should register a new user successfully', async () => {
      // Mock de consultas a la base de datos
      db.query.mockResolvedValueOnce([[]]); // No existe el usuario
      db.query.mockResolvedValueOnce([[{ count: 0 }]]); // No hay usuarios
      db.query.mockResolvedValueOnce([{ insertId: 1 }]); // Usuario creado

      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/register')
        .send(userData)
        .expect(201);

      expect(response.body.message).toBe('Cuenta creada exitosamente.');
    });

    test('should reject registration with missing data', async () => {
      const response = await request(app)
        .post('/register')
        .send({
          username: 'testuser',
          email: 'test@example.com'
          // missing password
        })
        .expect(400);

      expect(response.body.message).toContain('Campos requeridos');
    });

    test('should reject registration for existing user', async () => {
      db.query.mockResolvedValueOnce([[{ id: 1 }]]); // Usuario ya existe

      const userData = {
        username: 'existinguser',
        email: 'existing@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/register')
        .send(userData)
        .expect(409);

      expect(response.body.message).toBe('Usuario ya existe.');
    });
  });

  describe('POST /login', () => {
    test('should login with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      
      db.query.mockResolvedValueOnce([[
        {
          id: 1,
          username: 'testuser',
          email: 'test@example.com',
          password: hashedPassword,
          role: 'admin'
        }
      ]]);

      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/login')
        .send(loginData)
        .expect(200);

      expect(response.body.message).toBe('Bienvenido');
      expect(response.body.token).toBeDefined();
    });

    test('should reject login with invalid credentials', async () => {
      db.query.mockResolvedValueOnce([[]]); // Usuario no encontrado

      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/login')
        .send(loginData)
        .expect(401);

      expect(response.body.message).toBe('Credenciales inválidas.');
    });
  });
});
