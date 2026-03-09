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
      db.query.mockResolvedValueOnce([{ count: 0 }]); // No hay usuarios
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

      db.query.mockResolvedValueOnce([mockInventory]);

      const response = await request(app)
        .get('/inventory')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should reject access without token', async () => {
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

      db.query.mockResolvedValueOnce([mockProduct]);

      const response = await request(app)
        .get(`/inventory/${productId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.product_name).toBe('Test Integration Product');
      expect(response.body.price).toBe(99.99);
    });

    test('should update the product', async () => {
      // Mock de actualización
      db.query.mockResolvedValueOnce([]);
      db.query.mockResolvedValueOnce([{ total: 10 }]);
      db.query.mockResolvedValueOnce([]);
      db.query.mockResolvedValueOnce([]);

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
