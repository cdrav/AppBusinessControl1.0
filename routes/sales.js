const express = require('express');
const router = express.Router();
const db = require('../config/db');
const PDFDocument = require('pdfkit');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { sendLowStockAlert } = require('../services/emailService');
const bcrypt = require('bcrypt');
const transporter = require('../config/mailer');
const fs = require('fs');
const path = require('path');

// Registrar Venta
router.post('/', authenticateToken, async (req, res) => {
    const { clientId, products, saleDate, couponCode, notes } = req.body;
    const branchId = req.user.branch_id;
    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();
        let total = 0, details = [], lowStock = [];

        for (const p of products) {
            const [rows] = await conn.query(`SELECT i.product_name, i.price, COALESCE(bs.stock, 0) as stock FROM inventory i LEFT JOIN branch_stocks bs ON i.id = bs.product_id AND bs.branch_id = ? WHERE i.id = ? FOR UPDATE`, [branchId, p.productId]);
            if (!rows.length || rows[0].stock < p.quantity) throw new Error(`Stock insuficiente: ${rows[0]?.product_name || 'Producto'}`);
            const subtotal = rows[0].price * p.quantity;
            total += subtotal;
            details.push({ ...p, subtotal });
        }

        let discount = 0;
        if (couponCode) {
            const [c] = await conn.query('SELECT * FROM coupons WHERE code=? AND active=1', [couponCode]);
            if (c.length) discount = c[0].discount_type === 'percent' ? total * (c[0].value/100) : parseFloat(c[0].value);
        }

        const [sale] = await conn.query('INSERT INTO sales (client_id, branch_id, total_price, discount, coupon_code, sale_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)', [clientId, branchId, Math.max(0, total - discount), discount, couponCode, saleDate, notes]);
        
        for (const d of details) {
            await conn.query('INSERT INTO sale_details (sale_id, product_id, quantity, subtotal) VALUES (?, ?, ?, ?)', [sale.insertId, d.productId, d.quantity, d.subtotal]);
            await conn.query('UPDATE branch_stocks SET stock = stock - ? WHERE product_id=? AND branch_id=?', [d.quantity, d.productId, branchId]);
            await conn.query('UPDATE inventory SET stock = stock - ? WHERE id=?', [d.quantity, d.productId]); // Sincronizar global
            const [stk] = await conn.query('SELECT stock, product_name FROM branch_stocks bs JOIN inventory i ON bs.product_id=i.id WHERE product_id=? AND branch_id=?', [d.productId, branchId]);
            if (stk[0].stock <= 10) lowStock.push({ name: stk[0].product_name, stock: stk[0].stock });
        }
        
        await conn.commit();
        if (lowStock.length) sendLowStockAlert(lowStock);
        res.status(201).json({ message: 'Venta registrada', saleId: sale.insertId });
    } catch (e) { if(conn) await conn.rollback(); res.status(500).json({ message: e.message }); } finally { if(conn) conn.release(); }
});

// Obtener Ventas
router.get('/', authenticateToken, async (req, res) => {
    const [rows] = await db.query(`SELECT s.id, c.name AS client_name, c.email as client_email, s.total_price, s.sale_date FROM sales s LEFT JOIN clients c ON s.client_id = c.id ORDER BY s.sale_date DESC`);
    res.json(rows);
});

// Generar Ticket PDF
router.get('/:id/ticket', authenticateToken, async (req, res) => {
    const [settings] = await db.query('SELECT * FROM settings WHERE id = 1');
    const config = settings[0] || { company_name: 'Business Control', company_address: '', company_phone: '', company_email: '' };
    const [sale] = await db.query(`SELECT s.*, c.name as client_name, c.address as client_address, c.phone as client_phone, c.email as client_email FROM sales s LEFT JOIN clients c ON s.client_id=c.id WHERE s.id=?`, [req.params.id]);
    
    if (!sale.length) return res.status(404).send('Venta no encontrada');
    
    const [details] = await db.query(`SELECT i.product_name, sd.quantity, sd.subtotal, (sd.subtotal/sd.quantity) as unit_price FROM sale_details sd LEFT JOIN inventory i ON sd.product_id=i.id WHERE sd.sale_id=?`, [req.params.id]);

    const isThermal = config.ticket_format === '80mm';
    // Thermal width approx 226 points (80mm). Height auto-expands usually, but we set a large one.
    const doc = new PDFDocument(isThermal ? { margin: 10, size: [226, 1000] } : { margin: 50, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=ticket_${sale[0].id}.pdf`);
    doc.pipe(res);

    // --- ESTILOS Y FORMATO ---
    const formatCurrency = (amount) => `$${parseFloat(amount).toFixed(2)}`;
    const divider = () => {
        doc.moveDown(0.5);
        doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#aaaaaa').stroke();
        doc.moveDown(0.5);
    };

    if (isThermal) {
        // --- FORMATO TÉRMICO (80mm) ---
        if (config.company_logo) {
             const logoPath = path.join(__dirname, '../public', config.company_logo);
             if (fs.existsSync(logoPath)) {
                 doc.image(logoPath, { fit: [100, 50], align: 'center' });
                 doc.moveDown(0.5);
             }
        }
        doc.fontSize(10).font('Helvetica-Bold').text(config.company_name, { align: 'center' });
        doc.fontSize(7).font('Helvetica');
        if(config.company_address) doc.text(config.company_address, { align: 'center' });
        if(config.company_phone) doc.text(`Tel: ${config.company_phone}`, { align: 'center' });
        doc.moveDown();
        
        doc.fontSize(8).text(`Ticket: #${sale[0].id}`, { align: 'center' });
        doc.text(`Fecha: ${new Date(sale[0].sale_date).toLocaleString()}`, { align: 'center' });
        doc.moveDown();
        
        if (sale[0].client_name) {
            doc.text(`Cliente: ${sale[0].client_name}`, { align: 'left' });
        }
        divider();

        doc.fontSize(7).font('Helvetica-Bold');
        details.forEach(d => {
            doc.text(`${d.quantity} x ${d.product_name}`, { continued: true });
            doc.text(formatCurrency(d.subtotal), { align: 'right' });
        });
        
        divider();
        
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text(`TOTAL:`, { continued: true });
        doc.text(formatCurrency(sale[0].total_price), { align: 'right' });
        
        doc.moveDown();
        doc.fontSize(7).font('Helvetica').text('¡Gracias por su compra!', { align: 'center' });

    } else {
        // --- FORMATO A4 (Factura Formal) ---
        let headerX = 50;
        if (config.company_logo) {
             const logoPath = path.join(__dirname, '../public', config.company_logo);
             if (fs.existsSync(logoPath)) {
                 doc.image(logoPath, 50, 45, { width: 50 });
                 headerX = 110;
             }
        }

        doc.fontSize(20).font('Helvetica-Bold').text(config.company_name, headerX, 50);
        doc.fontSize(10).font('Helvetica');
        if(config.company_address) doc.text(config.company_address, headerX, 75);
        if(config.company_phone) doc.text(`Tel: ${config.company_phone}`, headerX, 90);
        if(config.company_email) doc.text(config.company_email, headerX, 105);

        doc.fontSize(12).font('Helvetica-Bold').text('RECIBO DE VENTA', 400, 50, { align: 'right' });
        doc.fontSize(10).font('Helvetica');
        doc.text(`N° Ticket: #${sale[0].id}`, 400, 70, { align: 'right' });
        doc.text(`Fecha: ${new Date(sale[0].sale_date).toLocaleDateString()}`, 400, 85, { align: 'right' });

        doc.moveDown(4);
        doc.rect(50, 140, 500, 25).fill('#f4f4f4').stroke('#e0e0e0');
        doc.fillColor('#000').fontSize(10).font('Helvetica-Bold').text('INFORMACIÓN DEL CLIENTE', 60, 148);
        doc.fontSize(10).font('Helvetica').text(`Cliente: ${sale[0].client_name || 'Consumidor Final'}`, 50, 175);
        
        const tableTop = 230;
        doc.rect(50, tableTop, 500, 20).fill('#4F46E5').stroke();
        doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
        doc.text('DESCRIPCIÓN', 60, tableTop + 5);
        doc.text('CANT.', 300, tableTop + 5, { width: 40, align: 'center' });
        doc.text('PRECIO', 350, tableTop + 5, { width: 70, align: 'right' });
        doc.text('SUBTOTAL', 430, tableTop + 5, { width: 110, align: 'right' });

        let y = tableTop + 25;
        doc.fillColor('#000').font('Helvetica');
        details.forEach((d, i) => {
            if (i % 2 === 1) doc.rect(50, y - 5, 500, 20).fill('#f9f9f9');
            doc.fillColor('#000').text(d.product_name, 60, y).text(d.quantity, 300, y, { width: 40, align: 'center' }).text(formatCurrency(d.unit_price), 350, y, { width: 70, align: 'right' }).text(formatCurrency(d.subtotal), 430, y, { width: 110, align: 'right' });
            y += 20;
        });
        doc.fontSize(12).font('Helvetica-Bold').text(`TOTAL: ${formatCurrency(sale[0].total_price)}`, 430, y + 10, { width: 110, align: 'right' });
    }

    doc.end();
});

// Enviar Ticket por Email
router.post('/:id/ticket/email', authenticateToken, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email requerido' });
    
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: `Ticket de Compra #${req.params.id}`,
            text: `Gracias por su compra. Adjunto encontrará su ticket de venta #${req.params.id}.`
        });
        res.json({ message: 'Ticket enviado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al enviar correo' });
    }
});

// Detalles de venta
router.get('/:id/details', authenticateToken, async (req, res) => {
    const [details] = await db.query(`SELECT i.product_name, sd.quantity, sd.subtotal, i.price as unit_price FROM sale_details sd LEFT JOIN inventory i ON sd.product_id=i.id WHERE sd.sale_id=?`, [req.params.id]);
    res.json(details);
});

// Eliminar Venta (Admin)
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { password } = req.body;
    const [u] = await db.query('SELECT password FROM users WHERE id=?', [req.user.id]);
    if (!await bcrypt.compare(password, u[0].password)) return res.status(403).json({ message: 'Contraseña incorrecta' });

    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();
        
        // Obtener la sucursal original de la venta para restaurar el stock allí
        const [sale] = await conn.query('SELECT branch_id FROM sales WHERE id=?', [req.params.id]);
        const branchId = sale[0]?.branch_id;

        const [details] = await conn.query('SELECT product_id, quantity FROM sale_details WHERE sale_id=?', [req.params.id]);
        for (const d of details) {
            await conn.query('UPDATE inventory SET stock = stock + ? WHERE id=?', [d.quantity, d.product_id]);
            if (branchId) await conn.query('UPDATE branch_stocks SET stock = stock + ? WHERE product_id=? AND branch_id=?', [d.quantity, d.product_id, branchId]);
        }
        await conn.query('DELETE FROM sale_details WHERE sale_id=?', [req.params.id]);
        await conn.query('DELETE FROM sales WHERE id=?', [req.params.id]);
        await conn.commit();
        res.json({ message: 'Venta eliminada' });
    } catch (e) { if(conn) await conn.rollback(); res.status(500).json({ message: 'Error eliminando' }); } finally { if(conn) conn.release(); }
});

// Procesar devolución de productos - RECUPERADO
router.post('/:id/return', authenticateToken, authorizeRole(['admin', 'cajero']), async (req, res) => {
    const { id } = req.params;
    const { items } = req.body; // Array de { productId, quantity }

    if (!items || items.length === 0) return res.status(400).json({ message: 'No se seleccionaron productos para devolver' });

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Obtener la sucursal de la venta
        const [sale] = await connection.query('SELECT branch_id FROM sales WHERE id=?', [id]);
        const branchId = sale[0]?.branch_id;

        for (const item of items) {
            // 1. Verificar que el producto estaba en la venta
            const [details] = await connection.query('SELECT quantity FROM sale_details WHERE sale_id = ? AND product_id = ?', [id, item.productId]);
            
            if (details.length > 0) {
                // 2. Restaurar stock (Global y Sucursal)
                await connection.query('UPDATE inventory SET stock = stock + ? WHERE id = ?', [item.quantity, item.productId]);
                if (branchId) await connection.query('UPDATE branch_stocks SET stock = stock + ? WHERE product_id=? AND branch_id=?', [item.quantity, item.productId, branchId]);
                
                // 3. Registrar la devolución (Actualizando notas de la venta)
                await connection.query('UPDATE sales SET notes = CONCAT(IFNULL(notes, ""), " [Devolución: Prod ID ", ?, " Cant ", ?, "]") WHERE id = ?', [item.productId, item.quantity, id]);
            }
        }

        await connection.commit();
        res.json({ message: 'Devolución procesada y stock restaurado' });
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ message: 'Error al procesar devolución' });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
