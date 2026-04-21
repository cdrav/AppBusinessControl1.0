const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { BusinessError } = require('../middleware/validate');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { recordLog } = require('../services/auditService');
const { parsePagination, paginatedResponse } = require('../middleware/paginate');
const rateLimit = require('../middleware/rateLimit');

const paymentLimiter = rateLimit({ windowMs: 60000, max: 20, message: 'Demasiados pagos registrados. Espere un momento.' });

// Obtener todos los créditos (Admin)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, status } = req.query;
    let where = 'WHERE c.tenant_id = ?';
    let params = [req.user.tenant_id];

    if (status && status !== 'all') {
      where += ' AND c.status = ?';
      params.push(status);
    } else {
      where += " AND c.status != 'paid'";
    }

    if (search) {
      where += ' AND cl.name LIKE ?';
      params.push(`%${search}%`);
    }

    const baseFrom = `
      FROM credits c
      JOIN clients cl ON c.client_id = cl.id
      LEFT JOIN users u ON c.collected_by = u.id
      LEFT JOIN sales s ON c.sale_id = s.id
      LEFT JOIN branches b ON u.branch_id = b.id
      ${where}`;

    const selectFields = `c.*, cl.name as client_name, cl.email as client_email, cl.phone as client_phone,
             u.username as created_by_user,
             s.total_price as sale_total, s.sale_date,
             b.name as branch_name`;

    if (req.query.page) {
      const { page, limit, offset } = parsePagination(req.query);
      const [countResult] = await db.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
      const [credits] = await db.query(`SELECT ${selectFields} ${baseFrom} ORDER BY c.next_payment_date ASC, c.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
      return res.json(paginatedResponse(credits, countResult[0].total, page, limit));
    }

    const [credits] = await db.query(`SELECT ${selectFields} ${baseFrom} ORDER BY c.next_payment_date ASC, c.created_at DESC`, params);
    res.json(credits);
  } catch (error) {
    console.error('Error loading credits:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener ruta de cobro del día (Para Cobradores)
router.get('/today', authenticateToken, async (req, res) => {
    try {
        let query = `
            SELECT c.*, cl.name as client_name, cl.phone, cl.address, s.total_price as original_sale_total,
                   c.payment_frequency,
                   (SELECT MAX(payment_date) FROM credit_payments WHERE credit_id = c.id) as last_payment_date
            FROM credits c
            JOIN clients cl ON c.client_id = cl.id
            LEFT JOIN sales s ON c.sale_id = s.id
            WHERE c.tenant_id = ? AND c.status != 'paid' 
            AND (c.next_payment_date <= CURDATE() OR c.next_payment_date IS NULL)
        `;
        let params = [req.user.tenant_id];

        // Si el usuario es un cobrador, solo ve sus propios clientes asignados
        if (req.user.role === 'cobrador') {
            query += " AND c.collected_by = ?";
            params.push(req.user.id);
        }

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener hoja de cobro.' });
    }
});

// Obtener créditos por cliente específico
router.get('/client/:clientId', authenticateToken, async (req, res) => {
  try {
    const clientId = req.params.clientId;
    
    const [credits] = await db.query(`
      SELECT c.*, cl.name as client_name, cl.email as client_email,
             u.username as created_by_user,
             s.total_price as sale_total, s.sale_date,
             b.name as branch_name
      FROM credits c
      JOIN clients cl ON c.client_id = cl.id
      LEFT JOIN users u ON c.collected_by = u.id
      LEFT JOIN sales s ON c.sale_id = s.id
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE c.client_id = ? AND c.tenant_id = ? AND c.status != 'paid'
      ORDER BY c.next_payment_date ASC, c.created_at DESC
    `, [clientId, req.user.tenant_id]);
    
    res.json(credits);
  } catch (error) {
    console.error('Error loading credits by client:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener resumen de créditos del cobrador
router.get('/summary', authenticateToken, authorizeRole(['admin', 'cobrador']), async (req, res) => {
  try {
    // Admin ve todos los créditos, cobrador solo los suyos
    const isAdmin = req.user.role === 'admin';
    const whereClause = isAdmin 
      ? 'WHERE tenant_id = ?' 
      : 'WHERE collected_by = ? AND tenant_id = ?';
    const params = isAdmin 
      ? [req.user.tenant_id] 
      : [req.user.id, req.user.tenant_id];

    const [summary] = await db.query(`
      SELECT 
        COUNT(*) as total_credits,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_credits,
        COUNT(CASE WHEN status = 'partial' THEN 1 END) as partial_credits,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_credits,
        COALESCE(SUM(total_debt), 0) as total_debt,
        COALESCE(SUM(remaining_balance), 0) as total_pending,
        COALESCE(SUM(initial_payment), 0) as total_collected
      FROM credits
      ${whereClause}
    `, params);
    
    res.json(summary[0] || {});
  } catch (error) {
    console.error('Error loading credits summary:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Registrar pago/abono de crédito
router.post('/payment', authenticateToken, paymentLimiter, async (req, res) => {
    const { creditId, amount, notes, nextPaymentDate } = req.body;

    if (!creditId || !amount) {
        return res.status(400).json({ message: 'Campos requeridos: creditId, amount' });
    }
    if (isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: 'El monto debe ser un número positivo.' });
    }

    let conn;
  try {
        conn = await db.getConnection();
        await conn.beginTransaction();
    
    // Validar que el monto no sea mayor que el saldo restante
    const [credit] = await conn.query(
      'SELECT remaining_balance, payment_frequency FROM credits WHERE id = ? AND tenant_id = ?', 
      [creditId, req.user.tenant_id]
    );

    if (!credit.length) throw new BusinessError('Crédito no encontrado', 404);
    
    const currentBalance = parseFloat(credit[0].remaining_balance);
    const paymentAmount = parseFloat(amount);

    if (paymentAmount > currentBalance) throw new BusinessError('El pago excede el saldo restante');
    
    // Actualizar el crédito
    const newBalance = credit[0].remaining_balance - amount;
    const status = newBalance <= 0 ? 'paid' : 'active';
    
    // Auto-calcular próxima fecha según frecuencia si no se envió una fecha manual
    const freq = credit[0].payment_frequency || 'monthly';
    let calcNextDate = nextPaymentDate || null;
    if (!calcNextDate && newBalance > 0) {
        const now = new Date();
        if (freq === 'daily') now.setDate(now.getDate() + 1);
        else if (freq === 'weekly') now.setDate(now.getDate() + 7);
        else if (freq === 'biweekly') now.setDate(now.getDate() + 15);
        else now.setMonth(now.getMonth() + 1);
        calcNextDate = now.toISOString().split('T')[0];
    }
    
    await conn.query(`
      UPDATE credits 
      SET remaining_balance = ?, 
          status = ?,
          next_payment_date = CASE 
            WHEN ? <= 0 THEN NULL
            ELSE ?
          END
      WHERE id = ? AND tenant_id = ?
    `, [newBalance, status, newBalance, calcNextDate, creditId, req.user.tenant_id]);
    
    // Registrar el pago en historial
    const [pRes] = await conn.query(`
      INSERT INTO credit_payments (tenant_id, credit_id, amount, payment_date, notes, collector_id)
      VALUES (?, ?, ?, NOW(), ?, ?)
    `, [req.user.tenant_id, creditId, amount, notes, req.user.id]);

    // Obtener info para WhatsApp
    const [info] = await conn.query(`
        SELECT cl.name, cl.phone FROM clients cl 
        JOIN credits c ON c.client_id = cl.id 
        WHERE c.id = ?`, [creditId]);

    await conn.commit();
    
    const formatCurrency = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);
    const waMessage = `Hola ${info[0].name}, se registró tu abono de ${formatCurrency(amount)}. Tu nuevo saldo es ${formatCurrency(newBalance)}. Fecha: ${new Date().toLocaleDateString()}. ¡Gracias!`;
    const whatsappLink = `https://wa.me/${info[0].phone?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(waMessage)}`;

    res.json({ 
      message: 'Abono registrado correctamente',
      remainingBalance: newBalance,
      paymentId: pRes.insertId,
      whatsappLink: whatsappLink
    });
    
  } catch (error) {
    if (conn) await conn.rollback();
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || 'Error interno' });
  } finally {
    if (conn) conn.release();
  }
});

// Generar Recibo de Abono PDF (Optimizado para Térmicas Portátiles)
router.get('/receipt/:paymentId', authenticateToken, async (req, res) => {
    try {
        const [payment] = await db.query(`
            SELECT cp.*, cl.name as client_name, c.remaining_balance, u.username as collector_name, s.company_name
            FROM credit_payments cp
            JOIN credits c ON cp.credit_id = c.id
            JOIN clients cl ON c.client_id = cl.id
            JOIN users u ON cp.collector_id = u.id
            LEFT JOIN settings s ON s.tenant_id = cp.tenant_id
            WHERE cp.id = ? AND cp.tenant_id = ?
        `, [req.params.paymentId, req.user.tenant_id]);

        if (!payment.length) return res.status(404).send('Recibo no encontrado');

        const data = payment[0];
        const formatCurrency = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);

        // Altura dinámica para recibo térmico 80mm
        const receiptHeight = 200;
        const doc = new PDFDocument({ margin: 10, size: [226, receiptHeight] });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=recibo_abono_${data.id}.pdf`);
        doc.pipe(res);

        doc.fontSize(10).font('Helvetica-Bold').text(data.company_name || 'Business Control', { align: 'center' });
        doc.fontSize(8).font('Helvetica').text('COMPROBANTE DE ABONO', { align: 'center' });
        doc.moveDown(0.3);

        doc.fontSize(7);
        doc.text(`Recibo: #A-${data.id}`);
        doc.text(`Fecha: ${new Date(data.payment_date).toLocaleString('es-CO')}`);
        doc.text(`Cobrador: ${data.collector_name}`);
        doc.moveDown(0.2);
        doc.moveTo(10, doc.y).lineTo(216, doc.y).strokeColor('#aaa').stroke();
        doc.moveDown(0.2);

        doc.fontSize(8).text(`Cliente: ${data.client_name}`);
        doc.moveDown(0.3);
        doc.fontSize(12).font('Helvetica-Bold').text(`${formatCurrency(data.amount)}`, { align: 'center' });
        doc.moveDown(0.2);
        doc.fontSize(8).font('Helvetica').text(`Saldo Restante: ${formatCurrency(data.remaining_balance)}`, { align: 'right' });
        
        doc.moveDown(0.5);
        doc.fontSize(6).text('Conserve este recibo como soporte.', { align: 'center' });
        doc.end();

    } catch (error) {
        res.status(500).send('Error generando PDF');
    }
});

// Nuevo: Obtener resumen de lo cobrado hoy por el usuario logueado
router.get('/my-collections-today', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT cp.*, cl.name as client_name, c.remaining_balance as new_balance
            FROM credit_payments cp
            JOIN credits c ON cp.credit_id = c.id
            JOIN clients cl ON c.client_id = cl.id
            WHERE cp.collector_id = ? AND cp.tenant_id = ? AND DATE(cp.payment_date) = CURDATE()
            ORDER BY cp.payment_date DESC
        `, [req.user.id, req.user.tenant_id]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar resumen de cobros.' });
    }
});

// Registrar cierre de ruta (Para Cobradores)
router.post('/route-closure', authenticateToken, async (req, res) => {
    try {
        const [stats] = await db.query(`
            SELECT 
                COUNT(id) as collections_count,
                COALESCE(SUM(amount), 0) as total_collected
            FROM credit_payments 
            WHERE collector_id = ? AND tenant_id = ? AND DATE(payment_date) = CURDATE()
        `, [req.user.id, req.user.tenant_id]);

        await recordLog({
            tenantId: req.user.tenant_id,
            userId: req.user.id,
            action: 'ROUTE_CLOSURE',
            entityType: 'collector_route',
            details: stats[0],
            ipAddress: req.ip
        });

        res.json({ 
            message: 'Cierre de ruta registrado exitosamente',
            summary: stats[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al procesar el cierre de ruta.' });
    }
});

// Asignar cobrador a un crédito (Admin)
router.put('/:creditId/assign', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const { collectorId } = req.body;
    const creditId = req.params.creditId;

    const [result] = await db.query(
      'UPDATE credits SET collected_by = ? WHERE id = ? AND tenant_id = ?',
      [collectorId || null, creditId, req.user.tenant_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Crédito no encontrado' });
    }

    res.json({ message: 'Cobrador asignado correctamente' });
  } catch (error) {
    console.error('Error assigning collector:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener detalles de un crédito específico
router.get('/:creditId', authenticateToken, async (req, res) => {
  try {
    const creditId = req.params.creditId;
    
    const [credit] = await db.query(`
      SELECT c.*, cl.name as client_name, cl.email as client_email, cl.phone as client_phone,
             u.username as created_by_user,
             s.total_price as sale_total, s.sale_date,
             b.name as branch_name
      FROM credits c
      JOIN clients cl ON c.client_id = cl.id
      LEFT JOIN users u ON c.collected_by = u.id
      LEFT JOIN sales s ON c.sale_id = s.id
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE c.id = ? AND c.tenant_id = ?
    `, [creditId, req.user.tenant_id]);
    
    // Obtener historial de pagos
    const [payments] = await db.query(`
      SELECT cp.*, u.username as collected_by_username
      FROM credit_payments cp
      LEFT JOIN users u ON cp.collector_id = u.id
      WHERE cp.credit_id = ? AND cp.tenant_id = ?
      ORDER BY cp.payment_date DESC
    `, [creditId, req.user.tenant_id]);
    
    if (credit.length === 0) {
      return res.status(404).json({ message: 'Crédito no encontrado' });
    }
    
    res.json({
      credit: credit[0],
      payments: payments
    });
    
  } catch (error) {
    console.error('Error loading credit details:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

module.exports = router;
