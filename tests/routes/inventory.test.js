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

describe('Inventory Routes Tests', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /inventory', () => {
    test('should get inventory list with authentication', async () => {
      const mockInventory = [
        {
          id: 1,
          product_name: 'Test Product',
          stock: 10,
          price: 99.99,
          category: 'Test Category'
        }
      ];

      db.query.mockResolvedValueOnce([mockInventory]);

      const response = await request(app)
        .get('/inventory')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0].product_name).toBe('Test Product');
    });

    test('should handle database errors', async () => {
      db.query.mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app)
        .get('/inventory')
        .expect(500);

      expect(response.body.message).toContain('Error interno');
    });
  });

  describe('POST /inventory', () => {
    test('should create a new product with authentication', async () => {
      // Mock de inserción de producto
      db.query.mockResolvedValueOnce([{ insertId: 1 }]);
      // Mock de inserción en branch_stocks
      db.query.mockResolvedValueOnce([]);

      const newProduct = {
        name: 'New Product',
        quantity: 15,
        price: 149.99,
        cost: 100,
        category: 'Electronics',
        description: 'Test product'
      };

      const response = await request(app)
        .post('/inventory')
        .send(newProduct)
        .expect(201);

      expect(response.body.message).toBe('Producto agregado');
      expect(response.body.productId).toBe(1);
    });
  });

  describe('GET /inventory/barcode/:code', () => {
    test('should get product by barcode with authentication', async () => {
      const mockProduct = {
        id: 1,
        product_name: 'Test Product',
        barcode: '123456789',
        price: 99.99
      };

      db.query.mockResolvedValueOnce([[mockProduct]]); // mysql2: [[rows], fields]

      const response = await request(app)
        .get('/inventory/barcode/123456789')
        .expect(200);

      expect(response.body.product_name).toBe('Test Product');
      expect(response.body.barcode).toBe('123456789');
    });

    test('should return 404 for non-existent barcode', async () => {
      db.query.mockResolvedValueOnce([[]]); // mysql2: resultado vacío

      const response = await request(app)
        .get('/inventory/barcode/999999999')
        .expect(404);

      expect(response.body.message).toBe('Producto no encontrado');
    });
  });
});
