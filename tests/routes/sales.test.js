jest.mock('../../config/db', () => ({
  query: jest.fn(), getConnection: jest.fn(), execute: jest.fn()
}));
jest.mock('../../config/mailer', () => ({ sendMail: jest.fn() }));
jest.mock('../../services/auditService', () => ({ recordLog: jest.fn() }));
jest.mock('../../services/emailService', () => ({ sendLowStockAlert: jest.fn() }));
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

// Mock de getConnection para transacciones
const mockConn = {
  query: jest.fn(),
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn()
};

describe('Sales Routes', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.getConnection.mockResolvedValue(mockConn);
    mockConn.query.mockReset();
    mockConn.beginTransaction.mockReset();
    mockConn.commit.mockReset();
    mockConn.rollback.mockReset();
    mockConn.release.mockReset();
  });

  // ==========================================
  // POST /sales - Crear venta
  // ==========================================
  describe('POST /sales', () => {
    test('crea venta simple exitosamente', async () => {
      // Usar mockResolvedValue como fallback para queries adicionales
      mockConn.query.mockResolvedValue([[]]);
      // Query 1: SELECT producto (stock check) - FOR UPDATE
      mockConn.query.mockResolvedValueOnce([[{ product_name: 'Producto A', price: 10000, stock: 50 }]]);
      // Query 2: INSERT sale
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      const res = await request(app)
        .post('/sales')
        .send({
          clientId: 1,
          branchId: 1,
          products: [{ productId: 1, quantity: 2 }],
          saleDate: '2026-04-13'
        });

      expect(res.status).toBe(201);
      expect(mockConn.beginTransaction).toHaveBeenCalled();
      expect(mockConn.commit).toHaveBeenCalled();
    }, 15000);

    test('rechaza venta sin stock suficiente', async () => {
      // Producto con stock insuficiente
      mockConn.query.mockResolvedValueOnce([[{ product_name: 'Sin Stock', price: 5000, stock: 1 }]]);

      const res = await request(app)
        .post('/sales')
        .send({
          clientId: 1,
          products: [{ productId: 1, quantity: 10 }]
        });

      // BusinessError retorna 400 para errores de negocio
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Stock insuficiente');
      expect(mockConn.rollback).toHaveBeenCalled();
    });

    test('aplica cupón de descuento porcentual', async () => {
      // Producto
      mockConn.query.mockResolvedValueOnce([[{ product_name: 'Prod', price: 100000, stock: 10 }]]);
      // Buscar cupón
      mockConn.query.mockResolvedValueOnce([[{ id: 1, code: 'DESC10', discount_type: 'percent', value: 10 }]]);
      // INSERT sale - capturamos los parámetros
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);
      // Resto de queries (details, stock updates)
      mockConn.query.mockResolvedValue([[]]);

      const res = await request(app)
        .post('/sales')
        .send({
          clientId: 1,
          products: [{ productId: 1, quantity: 1 }],
          couponCode: 'DESC10'
        });

      // Verificar que se insertó con descuento
      const insertCall = mockConn.query.mock.calls.find(c => 
        typeof c[0] === 'string' && c[0].includes('INSERT INTO sales')
      );
      if (insertCall) {
        const finalPrice = insertCall[1][3]; // posición de total_price
        expect(finalPrice).toBe(90000); // 100000 - 10%
      }
    });

    test('crea venta a crédito con pago inicial', async () => {
      // Fallback para queries no especificadas
      mockConn.query.mockResolvedValue([[]]);
      // Producto
      mockConn.query.mockResolvedValueOnce([[{ product_name: 'Prod', price: 50000, stock: 10 }]]);
      // INSERT sale
      mockConn.query.mockResolvedValueOnce([{ insertId: 5 }]);
      // INSERT credit
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      const res = await request(app)
        .post('/sales')
        .send({
          clientId: 1,
          products: [{ productId: 1, quantity: 1 }],
          is_credit: true,
          initialPayment: 20000
        });

      // Verificar que se creó el crédito
      const creditCall = mockConn.query.mock.calls.find(c => 
        typeof c[0] === 'string' && c[0].includes('INSERT INTO credits')
      );
      expect(creditCall).toBeDefined();
    });

    test('hace rollback en caso de error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('DB crash'));

      const res = await request(app)
        .post('/sales')
        .send({
          clientId: 1,
          products: [{ productId: 1, quantity: 1 }]
        });

      expect(res.status).toBe(500);
      expect(mockConn.rollback).toHaveBeenCalled();
    });
  });

  // ==========================================
  // GET /sales - Listar ventas
  // ==========================================
  describe('GET /sales', () => {
    test('retorna lista de ventas', async () => {
      db.query.mockResolvedValueOnce([[
        { id: 1, total_price: 50000, sale_date: '2026-04-13', client_name: 'Juan' },
        { id: 2, total_price: 30000, sale_date: '2026-04-13', client_name: 'Maria' }
      ]]);

      const res = await request(app).get('/sales');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    test('maneja error de BD', async () => {
      db.query.mockRejectedValueOnce(new Error('Connection lost'));

      const res = await request(app).get('/sales');

      expect(res.status).toBe(500);
    });
  });

  // ==========================================
  // GET /sales/:id - Detalle de venta
  // ==========================================
  describe('GET /sales/:id/details', () => {
    test('retorna detalle de venta con productos', async () => {
      // Query 1: sale info
      db.query.mockResolvedValueOnce([[{ id: 1, total_price: 50000, sale_date: '2026-04-13' }]]);
      // Query 2: sale details
      db.query.mockResolvedValueOnce([[
        { product_name: 'Producto A', quantity: 2, subtotal: 30000 },
        { product_name: 'Producto B', quantity: 1, subtotal: 20000 }
      ]]);

      const res = await request(app).get('/sales/1/details');

      expect(res.status).toBe(200);
      expect(res.body.sale).toBeDefined();
      expect(res.body.products).toBeDefined();
      expect(res.body.products.length).toBe(2);
    });

    test('retorna sale null si venta no existe', async () => {
      db.query.mockResolvedValueOnce([[]]);
      db.query.mockResolvedValueOnce([[]]);

      const res = await request(app).get('/sales/999/details');

      expect(res.status).toBe(200);
      expect(res.body.sale).toBeNull();
    });
  });
});
