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

describe('Clients Routes', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // GET /clients
  // ==========================================
  describe('GET /clients', () => {
    test('retorna lista de clientes', async () => {
      db.query.mockResolvedValueOnce([[
        { id: 1, name: 'Cliente A', email: 'a@test.com', phone: '123' },
        { id: 2, name: 'Cliente B', email: 'b@test.com', phone: '456' }
      ]]);

      const res = await request(app).get('/clients');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(res.body[0].name).toBe('Cliente A');
    });

    test('retorna lista vacía si no hay clientes', async () => {
      db.query.mockResolvedValueOnce([[]]);

      const res = await request(app).get('/clients');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('maneja error de BD', async () => {
      db.query.mockRejectedValueOnce(new Error('DB Error'));

      const res = await request(app).get('/clients');

      expect(res.status).toBe(500);
    });
  });

  // ==========================================
  // POST /clients
  // ==========================================
  describe('POST /clients', () => {
    test('crea cliente con datos válidos', async () => {
      db.query.mockResolvedValueOnce([{ insertId: 10 }]);

      const res = await request(app)
        .post('/clients')
        .send({ name: 'Nuevo Cliente', email: 'nuevo@test.com', phone: '3001234567' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Cliente creado');
      expect(res.body.clienteId).toBe(10);
    });

    test('crea cliente solo con nombre (campos opcionales)', async () => {
      db.query.mockResolvedValueOnce([{ insertId: 11 }]);

      const res = await request(app)
        .post('/clients')
        .send({ name: 'Solo Nombre' });

      expect(res.status).toBe(201);
    });

    test('rechaza si falta nombre', async () => {
      const res = await request(app)
        .post('/clients')
        .send({ email: 'sin@nombre.com' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('name');
    });

    test('rechaza nombre vacío', async () => {
      const res = await request(app)
        .post('/clients')
        .send({ name: '   ' });

      expect(res.status).toBe(400);
    });

    test('rechaza email inválido', async () => {
      const res = await request(app)
        .post('/clients')
        .send({ name: 'Test', email: 'no-es-email' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('email');
    });
  });

  // ==========================================
  // PUT /clients/:id
  // ==========================================
  describe('PUT /clients/:id', () => {
    test('actualiza cliente existente', async () => {
      db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .put('/clients/1')
        .send({ name: 'Nombre Actualizado', email: 'updated@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Cliente actualizado');
    });

    test('rechaza actualización sin nombre', async () => {
      const res = await request(app)
        .put('/clients/1')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(400);
    });

    test('rechaza email inválido en actualización', async () => {
      const res = await request(app)
        .put('/clients/1')
        .send({ name: 'Test', email: 'invalid' });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // GET /clients/:id
  // ==========================================
  describe('GET /clients/:id', () => {
    test('retorna cliente por ID', async () => {
      db.query.mockResolvedValueOnce([[{ id: 1, name: 'Cliente', email: 'c@test.com' }]]);

      const res = await request(app).get('/clients/1');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Cliente');
    });

    test('retorna 404 si no existe', async () => {
      db.query.mockResolvedValueOnce([[]]);

      const res = await request(app).get('/clients/999');

      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // DELETE /clients/:id
  // ==========================================
  describe('DELETE /clients/:id', () => {
    test('elimina cliente (admin)', async () => {
      db.query.mockResolvedValueOnce([[{ count: 0 }]]); // COUNT sales
      db.query.mockResolvedValueOnce([[{ count: 0 }]]); // COUNT credits
      db.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE

      const res = await request(app).delete('/clients/1');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Cliente eliminado');
    });
  });

  // ==========================================
  // GET /clients/:id/sales
  // ==========================================
  describe('GET /clients/:id/sales', () => {
    test('retorna ventas de un cliente', async () => {
      db.query.mockResolvedValueOnce([[
        { id: 1, sale_date: '2026-01-01', total_price: 50000, item_count: 3 }
      ]]);

      const res = await request(app).get('/clients/1/sales');

      expect(res.status).toBe(200);
      expect(res.body[0].total_price).toBe(50000);
    });
  });
});
