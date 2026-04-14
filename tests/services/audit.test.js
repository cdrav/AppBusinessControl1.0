jest.mock('../../config/db', () => ({
  query: jest.fn(), getConnection: jest.fn(), execute: jest.fn()
}));

const db = require('../../config/db');
const { recordLog } = require('../../services/auditService');

describe('Audit Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('registra log de auditoría correctamente', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 1 }]);

    await recordLog({
      tenantId: 1,
      userId: 1,
      action: 'SALE_CREATED',
      entityType: 'sale',
      entityId: 5,
      details: { total: 50000 },
      ipAddress: '127.0.0.1'
    });

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO audit_logs');
    expect(params[2]).toBe('SALE_CREATED');
    expect(params[3]).toBe('sale');
    // details debe ser JSON stringified
    expect(params[5]).toBe('{"total":50000}');
  });

  test('no lanza error si falla el log (no bloquea flujo principal)', async () => {
    db.query.mockRejectedValueOnce(new Error('DB Error'));

    // No debe lanzar
    await expect(recordLog({
      tenantId: 1,
      userId: 1,
      action: 'TEST',
      entityType: 'test',
      entityId: 1,
      details: 'test',
      ipAddress: '127.0.0.1'
    })).resolves.not.toThrow();
  });

  test('maneja details como string', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 1 }]);

    await recordLog({
      tenantId: 1,
      userId: 1,
      action: 'LOGIN',
      entityType: 'user',
      entityId: 1,
      details: 'Login exitoso',
      ipAddress: '::1'
    });

    const params = db.query.mock.calls[0][1];
    expect(params[5]).toBe('Login exitoso');
  });
});
