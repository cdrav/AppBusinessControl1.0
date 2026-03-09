const db = require('../config/db');

describe('Database Connection Tests', () => {
  test('should have db module imported correctly', () => {
    expect(db).toBeDefined();
    expect(db.query).toBeDefined();
  });

  test('should mock database query successfully', async () => {
    // Mock de respuesta
    const mockResult = [{ test_value: 1 }];
    db.query.mockResolvedValueOnce([mockResult]);

    const [rows] = await db.query('SELECT 1 as test_value');
    expect(db.query).toHaveBeenCalledWith('SELECT 1 as test_value');
    expect(rows).toEqual(mockResult);
  });

  test('should handle database query errors', async () => {
    const mockError = new Error('Database connection failed');
    db.query.mockRejectedValueOnce(mockError);

    await expect(db.query('SELECT * FROM non_existent_table')).rejects.toThrow('Database connection failed');
  });
});
