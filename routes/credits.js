const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Obtener ruta de cobro del día (Para Cobradores)
router.get('/today', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT c.*, cl.name as client_name, cl.phone, cl.address, s.total_price as original_sale_total
            FROM credits c
            JOIN clients cl ON c.client_id = cl.id
            LEFT JOIN sales s ON c.sale_id = s.id
            WHERE c.tenant_id = ? AND c.status = 'active' 
            AND (c.next_payment_date <= CURDATE() OR c.next_payment_date IS NULL)
        `, [req.user.tenant_id]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener hoja de cobro.' });
    }
});

// Registrar un Abono
router.post('/payment', authenticateToken, async (req, res) => {
    const { creditId, amount, notes, paymentMethod, nextPaymentDate } = req.body;
    
    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        // 1. Registrar el pago
        const [payment] = await conn.query(
            'INSERT INTO credit_payments (tenant_id, credit_id, collector_id, amount, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.tenant_id, creditId, req.user.id, amount, paymentMethod || 'cash', notes]
        );

        // 2. Actualizar el saldo del crédito
        await conn.query(
            'UPDATE credits SET remaining_balance = remaining_balance - ?, next_payment_date = ?, status = IF(remaining_balance <= 0, "paid", "active") WHERE id = ?',
            [amount, nextPaymentDate, creditId]
        );

        // 3. Obtener info para el mensaje de WhatsApp
        const [info] = await conn.query(`
            SELECT cl.name, cl.phone, c.remaining_balance 
            FROM credits c 
            JOIN clients cl ON c.client_id = cl.id 
            WHERE c.id = ?`, [creditId]);

        await conn.commit();

        const whatsappLink = `https://wa.me/${info[0].phone?.replace(/[^0-9]/g, '')}?text=` + 
            encodeURIComponent(`Hola ${info[0].name}, se ha registrado tu abono de $${amount}. Tu saldo restante es: $${info[0].remaining_balance}. ¡Gracias!`);

        res.status(201).json({ 
            message: 'Abono registrado correctamente', 
            paymentId: payment.insertId,
            whatsappLink: whatsappLink,
            remainingBalance: info[0].remaining_balance
        });
    } catch (error) {
        if (conn) await conn.rollback();
        res.status(500).json({ message: 'Error al procesar el abono.' });
    } finally {
        if (conn) conn.release();
    }
});

// Monitoreo para el Administrador
router.get('/admin/monitoring', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        const [stats] = await db.query(`
            SELECT 
                u.username as collector_name,
                COUNT(cp.id) as total_collections,
                SUM(cp.amount) as total_collected
            FROM credit_payments cp
            JOIN users u ON cp.collector_id = u.id
            WHERE cp.tenant_id = ? AND DATE(cp.payment_date) = CURDATE()
            GROUP BY cp.collector_id
        `, [req.user.tenant_id]);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ message: 'Error en monitoreo.' });
    }
});

// Aplicar Intereses por Mora (Proceso masivo)
router.post('/admin/apply-interests', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { percentage } = req.body; // Ej: 0.05 para 5%
    try {
        // Aumenta el saldo de los créditos vencidos que no han sido pagados
        const [result] = await db.query(`
            UPDATE credits 
            SET remaining_balance = remaining_balance * (1 + ?),
                notes = CONCAT(IFNULL(notes, ''), ' [Interés mora aplicado ', CURDATE(), ']')
            WHERE tenant_id = ? 
            AND status = 'active' 
            AND next_payment_date < CURDATE()
        `, [percentage || 0.02, req.user.tenant_id]);
        
        res.json({ message: `Intereses aplicados a ${result.affectedRows} créditos vencidos.` });
    } catch (error) {
        res.status(500).json({ message: 'Error al aplicar intereses.' });
    }
});

// Generar Recibo de Abono PDF (Optimizado para Impresoras Térmicas Portátiles)
router.get('/receipt/:paymentId', authenticateToken, async (req, res) => {
    try {
        const [payment] = await db.query(`
            SELECT cp.*, cl.name as client_name, c.remaining_balance, u.username as collector_name, s.company_name, s.company_phone
            FROM credit_payments cp
            JOIN credits c ON cp.credit_id = c.id
            JOIN clients cl ON c.client_id = cl.id
            JOIN users u ON cp.collector_id = u.id
            CROSS JOIN settings s ON s.id = 1
            WHERE cp.id = ? AND cp.tenant_id = ?
        `, [req.params.paymentId, req.user.tenant_id]);

        if (!payment.length) return res.status(404).send('Recibo no encontrado');

        const data = payment[0];
        const doc = new PDFDocument({ margin: 10, size: [226, 400] }); // Formato 80mm
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=abono_${data.id}.pdf`);
        doc.pipe(res);

        const formatCurrency = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);

        // Encabezado
        doc.fontSize(10).font('Helvetica-Bold').text(data.company_name, { align: 'center' });
        doc.fontSize(8).font('Helvetica').text('COMPROBANTE DE ABONO', { align: 'center' });
        doc.moveDown();

        doc.text(`Recibo: #A-${data.id}`);
        doc.text(`Fecha: ${new Date(data.payment_date).toLocaleString()}`);
        doc.text(`Cobrador: ${data.collector_name}`);
        doc.moveDown(0.5);
        doc.moveTo(10, doc.y).lineTo(216, doc.y).stroke();
        doc.moveDown(0.5);

        doc.fontSize(9).text(`Cliente: ${data.client_name}`);
        doc.moveDown();
        
        doc.fontSize(12).font('Helvetica-Bold').text(`MONTO: ${formatCurrency(data.amount)}`, { align: 'center' });
        doc.moveDown();
        
        doc.fontSize(9).font('Helvetica').text(`Saldo Restante: ${formatCurrency(data.remaining_balance)}`, { align: 'right' });
        
        if(data.notes) {
            doc.moveDown();
            doc.fontSize(7).text(`Nota: ${data.notes}`);
        }

        doc.moveDown(2);
        doc.fontSize(7).text('Conserve este recibo como soporte de su pago.', { align: 'center' });
        doc.text(`Powered by Business Control`, { align: 'center' });

        doc.end();
    } catch (error) {
        console.error(error);
        res.status(500).send('Error generando PDF');
    }
});

module.exports = router;