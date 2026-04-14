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
const db = require('../../config/db');

describe('API Integration Tests', () => {
  let app;
  let authToken;
  let testUserId;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Flow', () => {
    test('should register and login successfully', async () => {
      // Mock de registro
      db.query.mockResolvedValueOnce([[]]); // No existe el usuario
      db.query.mockResolvedValueOnce([[{ count: 0 }]]); // No hay usuarios
      db.query.mockResolvedValueOnce([{ insertId: 1 }]); // Usuario creado

      const registerResponse = await request(app)
        .post('/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(201);

      expect(registerResponse.body.message).toBe('Cuenta creada exitosamente.');

      // Mock de login
      const hashedPassword = require('bcrypt').hashSync('password123', 10);
      db.query.mockResolvedValueOnce([[
        {
          id: 1,
          username: 'testuser',
          email: 'test@example.com',
          password: hashedPassword,
          role: 'admin'
        }
      ]]);

      const loginResponse = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      authToken = loginResponse.body.token;
      testUserId = 1;

      expect(authToken).toBeDefined();
      expect(typeof authToken).toBe('string');
    });

    test('should access protected routes with valid token', async () => {
      const mockInventory = [
        {
          id: 1,
          product_name: 'Test Product',
          stock: 10,
          price: 99.99,
          category: 'Test Category'
        }
      ];

      db.query.mockResolvedValueOnce([mockInventory]); // inventory lista

      const response = await request(app)
        .get('/inventory')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    // Auth está mockeado, no podemos testear rechazo sin token aquí
    test.skip('should reject access without token', async () => {
      await request(app)
        .get('/inventory')
        .expect(401);
    });
  });

  describe('Inventory Management Flow', () => {
    let productId;

    test('should create a new product', async () => {
      // Mock de inserción de producto
      db.query.mockResolvedValueOnce([{ insertId: 1 }]);
      // Mock de inserción en branch_stocks
      db.query.mockResolvedValueOnce([]);

      const newProduct = {
        name: 'Test Integration Product',
        quantity: 10,
        price: 99.99,
        category: 'Test Category'
      };

      const response = await request(app)
        .post('/inventory')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newProduct)
        .expect(201);

      productId = response.body.productId;
      expect(productId).toBeDefined();
    });

    test('should get the created product', async () => {
      const mockProduct = {
        id: productId,
        product_name: 'Test Integration Product',
        price: 99.99
      };

      db.query.mockResolvedValueOnce([[mockProduct]]); // mysql2: [[rows]]

      const response = await request(app)
        .get(`/inventory/${productId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.product_name).toBe('Test Integration Product');
      expect(response.body.price).toBe(99.99);
    });

    test('should update the product', async () => {
      // PUT usa transacción con getConnection
      const mockConn = {
        query: jest.fn(),
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn()
      };
      db.getConnection.mockResolvedValueOnce(mockConn);
      // UPDATE inventory
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // SELECT SUM(stock) from branch_stocks
      mockConn.query.mockResolvedValueOnce([[{ total: 15 }]]);
      // INSERT/UPDATE branch_stocks (diff = 0 si total==quantity, skip)
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // UPDATE inventory SET stock
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const updateData = {
        name: 'Updated Product Name',
        quantity: 15,
        price: 149.99
      };

      const response = await request(app)
        .put(`/inventory/${productId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.message).toBe('Producto actualizado');
    });

    test('should delete the product', async () => {
      // Mock de eliminación
      db.query.mockResolvedValueOnce([]);

      const response = await request(app)
        .delete(`/inventory/${productId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBe('Producto eliminado');
    });
  });
});
