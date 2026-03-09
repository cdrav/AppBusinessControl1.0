const { sendLowStockAlert, sendDailySummaryEmail } = require('../../services/emailService');
const transporter = require('../../config/mailer');
const db = require('../../config/db');

// Mock de las dependencias
jest.mock('../../config/mailer');
jest.mock('../../config/db');

describe('Email Service Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock de variables de entorno
    process.env.EMAIL_USER = 'test@example.com';
  });

  describe('sendLowStockAlert', () => {
    test('should send low stock alert email', async () => {
      const mockProducts = [
        { name: 'Product 1', stock: 2 },
        { name: 'Product 2', stock: 5 }
      ];

      transporter.sendMail.mockResolvedValueOnce({ messageId: 'test-message-id' });

      await sendLowStockAlert(mockProducts);

      expect(transporter.sendMail).toHaveBeenCalledWith({
        from: 'test@example.com',
        to: 'test@example.com',
        subject: '⚠️ Alerta de Stock Bajo - Business Control',
        html: expect.stringContaining('Stock bajo detectado')
      });
    });

    test('should not send email if no products provided', async () => {
      await sendLowStockAlert([]);

      expect(transporter.sendMail).not.toHaveBeenCalled();
    });

    test('should not send email if EMAIL_USER not configured', async () => {
      delete process.env.EMAIL_USER;
      
      await sendLowStockAlert([{ name: 'Product', stock: 1 }]);

      expect(transporter.sendMail).not.toHaveBeenCalled();
    });

    test('should handle email sending errors', async () => {
      const mockProducts = [{ name: 'Product', stock: 1 }];
      
      transporter.sendMail.mockRejectedValueOnce(new Error('Email error'));

      // No debería lanzar error, solo manejarlo
      await expect(sendLowStockAlert(mockProducts)).resolves.toBeUndefined();
    });
  });

  describe('sendDailySummaryEmail', () => {
    test('should send daily summary email', async () => {
      const mockSalesData = [{
        totalRevenue: 1500.00,
        totalSales: 25
      }];

      db.query.mockResolvedValueOnce([mockSalesData]);
      transporter.sendMail.mockResolvedValueOnce({ messageId: 'test-message-id' });

      const result = await sendDailySummaryEmail(new Date());

      expect(result).toContain('Resumen enviado');
      expect(transporter.sendMail).toHaveBeenCalledWith({
        from: 'test@example.com',
        to: 'test@example.com',
        subject: expect.stringContaining('Cierre de Caja'),
        html: expect.stringContaining('Resumen del Día')
      });
    });

    test('should throw error if date not provided', async () => {
      await expect(sendDailySummaryEmail()).rejects.toThrow('Configuración de correo incompleta');
    });

    test('should throw error if EMAIL_USER not configured', async () => {
      delete process.env.EMAIL_USER;
      
      await expect(sendDailySummaryEmail(new Date())).rejects.toThrow('Configuración de correo incompleta');
    });
  });
});
