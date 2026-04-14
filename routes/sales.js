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
const { recordLog } = require('../services/auditService');
const { BusinessError } = require('../middleware/validate');

// Registrar Venta
router.post('/', authenticateToken, async (req, res) => {
    let { clientId, products, saleDate, couponCode, notes, branchId, initialPayment } = req.body;
    // Aceptar ambos formatos: is_credit (frontend) e isCredit (camelCase)
    let isCredit = req.body.is_credit || req.body.isCredit || false;
    
    console.log(`[DEBUG POST /sales] isCredit: ${isCredit}, initialPayment: ${initialPayment}`);
    
    // Lógica de Sede:
    // Si NO es admin, forzamos la sede asignada al usuario (seguridad).
    if (req.user.role !== 'admin') {
        branchId = req.user.branch_id;
    }
    // Si ES admin y no envió sede, usa la suya o la principal por defecto.
    if (!branchId) branchId = req.user.branch_id || 1;

    // Agregar hora actual a la fecha para que los reportes por hora funcionen correctamente
    if (saleDate && saleDate.length === 10) { // Si es formato YYYY-MM-DD
        const now = new Date();
        const time = now.toTimeString().split(' ')[0]; // Obtiene HH:MM:SS local
        saleDate = `${saleDate} ${time}`;
    }

    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();
        let total = 0, details = [], lowStock = [];

        for (const p of products) {
            const [rows] = await conn.query(`SELECT i.product_name, i.price, COALESCE(bs.stock, i.stock, 0) as stock FROM inventory i LEFT JOIN branch_stocks bs ON i.id = bs.product_id AND bs.branch_id = ? AND bs.tenant_id = ? WHERE i.id = ? AND i.tenant_id = ? FOR UPDATE`, [branchId, req.user.tenant_id, p.productId, req.user.tenant_id]);
            if (!rows.length || rows[0].stock < p.quantity) throw new BusinessError(`Stock insuficiente: ${rows[0]?.product_name || 'Producto'}`);
            
            if (rows[0].price <= 0) throw new BusinessError(`El producto ${rows[0].product_name} tiene un precio inválido ($${rows[0].price}).`);

            const subtotal = rows[0].price * p.quantity;
            total += subtotal;
            details.push({ ...p, subtotal });
        }

        let discount = 0;
        if (couponCode) {
            const [c] = await conn.query('SELECT * FROM coupons WHERE code=? AND tenant_id=? AND active=1', [couponCode, req.user.tenant_id]);
            if (c.length) discount = c[0].discount_type === 'percent' ? total * (c[0].value/100) : parseFloat(c[0].value);
        }

        const finalPrice = Math.max(0, total - discount);
        console.log(`[DEBUG] total: ${total}, discount: ${discount}, finalPrice: ${finalPrice}`);
        console.log(`[DEBUG] Inserting sale with finalPrice type: ${typeof finalPrice}, value: ${finalPrice}`);
        const [sale] = await conn.query('INSERT INTO sales (tenant_id, client_id, branch_id, total_price, discount, coupon_code, sale_date, notes, is_credit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())', [req.user.tenant_id, clientId, branchId, finalPrice, discount, couponCode, saleDate || new Date(), notes, isCredit || false]);
        
        if (isCredit) {
            const payment = parseFloat(initialPayment) || 0;
            const remainingBalance = Math.max(0, finalPrice - payment);
            console.log(`[DEBUG] Credit sale - finalPrice: ${finalPrice}, payment: ${payment}, remainingBalance: ${remainingBalance}`);
            await conn.query('INSERT INTO credits (tenant_id, sale_id, client_id, total_debt, remaining_balance, initial_payment, next_payment_date, collected_by) VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL 1 MONTH), ?)', 
            [req.user.tenant_id, sale.insertId, clientId, finalPrice, remainingBalance, payment, req.user.id]);
        }

        for (const d of details) {
            await conn.query('INSERT INTO sale_details (tenant_id, sale_id, product_id, quantity, subtotal) VALUES (?, ?, ?, ?, ?)', [req.user.tenant_id, sale.insertId, d.productId, d.quantity, d.subtotal]);
            
            // Verificar si existe registro en branch_stocks
            const [existing] = await conn.query('SELECT stock FROM branch_stocks WHERE product_id=? AND branch_id=? AND tenant_id=?', [d.productId, branchId, req.user.tenant_id]);
            
            if (existing.length > 0) {
                // Actualizar stock existente
                await conn.query('UPDATE branch_stocks SET stock = stock - ? WHERE product_id=? AND branch_id=? AND tenant_id=?', [d.quantity, d.productId, branchId, req.user.tenant_id]);
            } else {
                // Crear nuevo registro con stock de inventory menos cantidad vendida
                const [invRows] = await conn.query('SELECT stock FROM inventory WHERE id=? AND tenant_id=?', [d.productId, req.user.tenant_id]);
                const initialStock = invRows.length > 0 ? invRows[0].stock : 0;
                await conn.query('INSERT INTO branch_stocks (tenant_id, branch_id, product_id, stock) VALUES (?, ?, ?, ?)', [req.user.tenant_id, branchId, d.productId, initialStock - d.quantity]);
            }
            
            // Recalcular el stock global para mantener la consistencia
            await conn.query('UPDATE inventory SET stock = (SELECT COALESCE(SUM(bs_stock), 0) FROM (SELECT stock as bs_stock FROM branch_stocks WHERE product_id = ? AND tenant_id = ?) as bs_sum) WHERE id = ? AND tenant_id = ?', [d.productId, req.user.tenant_id, d.productId, req.user.tenant_id]);
            const [stk] = await conn.query('SELECT bs.stock, i.product_name FROM branch_stocks bs JOIN inventory i ON bs.product_id=i.id WHERE bs.product_id=? AND bs.branch_id=? AND bs.tenant_id=?', [d.productId, branchId, req.user.tenant_id]);
            if (stk.length > 0 && stk[0].stock < 5) lowStock.push({ name: stk[0].product_name, stock: stk[0].stock });
        }
        
        await conn.commit();
        if (lowStock.length) sendLowStockAlert(lowStock);

        await recordLog({
            tenantId: req.user.tenant_id,
            userId: req.user.id,
            action: 'SALE_CREATED',
            entityType: 'sale',
            entityId: sale.insertId,
            details: { clientId, total: finalPrice, isCredit: isCredit || false },
            ipAddress: req.ip
        });

        res.status(201).json({ message: 'Venta registrada', saleId: sale.insertId });
    } catch (e) {
        if(conn) await conn.rollback();
        const status = e.statusCode || 500;
        res.status(status).json({ message: e.message });
    } finally { if(conn) conn.release(); }
});

// Listar Ventas con Paginación
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 50, client_id } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = 'WHERE s.tenant_id = ?';
        let countParams = [req.user.tenant_id];
        let dataParams = [req.user.tenant_id];
        
        if (client_id) {
            whereClause += ' AND s.client_id = ?';
            countParams.push(client_id);
            dataParams.push(client_id);
        }
        
        // Solo aplicar paginación si se solicita explícitamente con ?page=
        if (req.query.page) {
            // Query con paginación
            const [countResult] = await db.query(`SELECT COUNT(*) as total FROM sales s ${whereClause}`, countParams);
            const total = countResult[0].total;
            
            dataParams.push(parseInt(limit), parseInt(offset));
            const [rows] = await db.query(`
                SELECT s.*, c.name as client_name 
                FROM sales s 
                LEFT JOIN clients c ON s.client_id = c.id 
                ${whereClause}
                ORDER BY s.sale_date DESC 
                LIMIT ? OFFSET ?
            `, dataParams);
            
            res.json({ 
                data: rows, 
                pagination: { 
                    page: parseInt(page), 
                    limit: parseInt(limit), 
                    total, 
                    pages: Math.ceil(total / limit) 
                } 
            });
        } else {
            // Sin paginación - retornar array directo (compatible con tests y frontend existente)
            const [rows] = await db.query(`
                SELECT s.*, c.name as client_name 
                FROM sales s 
                LEFT JOIN clients c ON s.client_id = c.id 
                ${whereClause}
                ORDER BY s.sale_date DESC 
                LIMIT 1000
            `, dataParams);
            
            res.json(rows);
        }
    } catch (error) {
        console.error('Error al listar ventas:', error);
        res.status(500).json({ message: 'Error al listar ventas' });
    }
});

// Generar Ticket PDF
router.get('/:id/ticket', authenticateToken, async (req, res) => {
  try {
    const [settings] = await db.query('SELECT * FROM settings WHERE tenant_id = ?', [req.user.tenant_id]);
    const config = settings[0] || { company_name: 'Business Control', company_address: '', company_phone: '', company_email: '' };
    const [sale] = await db.query(`SELECT s.*, c.name as client_name, c.address as client_address, c.phone as client_phone, c.email as client_email FROM sales s LEFT JOIN clients c ON s.client_id=c.id WHERE s.id=? AND s.tenant_id=?`, [req.params.id, req.user.tenant_id]);
    
    if (!sale.length) return res.status(404).send('Venta no encontrada');
    
    const [details] = await db.query(`SELECT i.product_name, sd.quantity, sd.subtotal, (sd.subtotal/sd.quantity) as unit_price FROM sale_details sd LEFT JOIN inventory i ON sd.product_id=i.id WHERE sd.sale_id=? AND sd.tenant_id=?`, [req.params.id, req.user.tenant_id]);

    const isThermal = config.ticket_format === '80mm';
    
    // --- ESTILOS Y FORMATO ---
    const formatCurrency = (amount) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

    if (isThermal) {
        // Calcular altura dinámica: base + líneas de productos
        const baseHeight = 220; // header + footer + total + márgenes
        const lineHeight = 14;
        const productLines = details.length;
        const clientLine = sale[0].client_name ? 12 : 0;
        const addressLines = (config.company_address ? 10 : 0) + (config.company_phone ? 10 : 0);
        const calculatedHeight = baseHeight + (productLines * lineHeight) + clientLine + addressLines;
        
        const doc = new PDFDocument({ margin: 10, size: [226, calculatedHeight] });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=ticket_${sale[0].id}.pdf`);
        doc.pipe(res);

        const divider = () => {
            doc.moveDown(0.3);
            doc.moveTo(10, doc.y).lineTo(216, doc.y).strokeColor('#aaaaaa').stroke();
            doc.moveDown(0.3);
        };

        // --- FORMATO TÉRMICO (80mm) ---
        if (config.company_logo) {
             const logoPath = path.join(__dirname, '../public', config.company_logo);
             if (fs.existsSync(logoPath)) {
                 try {
                     doc.image(logoPath, { fit: [100, 50], align: 'center' });
                     doc.moveDown(0.3);
                 } catch (error) {
                     console.error('Error al cargar el logo en ticket térmico:', error.message);
                 }
             }
        }
        doc.fontSize(10).font('Helvetica-Bold').text(config.company_name, { align: 'center' });
        doc.fontSize(7).font('Helvetica');
        if(config.company_address) doc.text(config.company_address, { align: 'center' });
        if(config.company_phone) doc.text(`Tel: ${config.company_phone}`, { align: 'center' });
        doc.moveDown(0.5);
        
        doc.fontSize(8).text(`Ticket: #${sale[0].id}`, { align: 'center' });
        doc.text(`Fecha: ${new Date(sale[0].sale_date).toLocaleString()}`, { align: 'center' });
        doc.moveDown(0.3);
        
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
        
        doc.moveDown(0.5);
        doc.fontSize(7).font('Helvetica').text('¡Gracias por su compra!', { align: 'center' });
        doc.fontSize(6).text(`© ${new Date().getFullYear()} Business Control`, { align: 'center' });
        doc.end();

    } else {
        // --- FORMATO A4 (Factura Formal) ---
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=ticket_${sale[0].id}.pdf`);
        doc.pipe(res);

        let headerX = 50;
        if (config.company_logo) {
            const logoPath = path.join(__dirname, '../public', config.company_logo);
            if (fs.existsSync(logoPath)) {
                try {
                    doc.image(logoPath, 50, 45, { width: 50 });
                    headerX = 110;
                } catch (error) {
                    console.error('Error al cargar el logo en ticket A4:', error.message);
                }
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
        
        const checkAddPage = (currentY) => {
            if (currentY > 750) {
                doc.addPage();
                return 50;
            }
            return currentY;
        };

        doc.fillColor('#000').font('Helvetica');
        details.forEach((d, i) => {
            y = checkAddPage(y);
            if (i % 2 === 1) doc.rect(50, y - 5, 500, 20).fill('#f9f9f9');
            doc.fillColor('#000').text(d.product_name, 60, y).text(d.quantity, 300, y, { width: 40, align: 'center' }).text(formatCurrency(d.unit_price), 350, y, { width: 70, align: 'right' }).text(formatCurrency(d.subtotal), 430, y, { width: 110, align: 'right' });
            y += 20;
        });
        
        y = checkAddPage(y + 20);
        doc.fontSize(12).font('Helvetica-Bold').text(`TOTAL: ${formatCurrency(sale[0].total_price)}`, 430, y, { width: 110, align: 'right' });
        
        doc.moveDown(2);
        doc.fontSize(8).font('Helvetica').text(`© ${new Date().getFullYear()} Business Control - Desarrollado por Cristian David Ruiz. Todos los derechos reservados.`, { align: 'center' });
        doc.end();
    }
  } catch (error) {
    console.error('Error generando ticket PDF:', error);
    res.status(500).json({ message: 'Error al generar el ticket' });
  }
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
    try {
        const [saleInfo] = await db.query(`
            SELECT s.sale_date, s.total_price, s.is_credit, s.discount, 
                   cr.initial_payment, cr.remaining_balance, cr.total_debt
            FROM sales s
            LEFT JOIN credits cr ON s.id = cr.sale_id
            WHERE s.id = ? AND s.tenant_id = ?
        `, [req.params.id, req.user.tenant_id]);
        
        const [details] = await db.query(`
            SELECT i.product_name, sd.quantity, sd.subtotal, i.price as unit_price 
            FROM sale_details sd 
            LEFT JOIN inventory i ON sd.product_id=i.id 
            WHERE sd.sale_id=? AND sd.tenant_id=?
        `, [req.params.id, req.user.tenant_id]);
        
        res.json({
            sale: saleInfo[0] || null,
            products: details
        });
    } catch (error) {
        console.error('Error al obtener detalles de venta:', error.message);
        res.status(500).json({ message: 'Error al obtener detalles de venta' });
    }
});

// Eliminar Venta (Admin)
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ message: 'Contraseña requerida para eliminar ventas.' });
    const [u] = await db.query('SELECT password FROM users WHERE id=?', [req.user.id]);
    if (!u.length || !await bcrypt.compare(password, u[0].password)) return res.status(403).json({ message: 'Contraseña incorrecta' });

    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();
        
        // Obtener la sucursal original de la venta para restaurar el stock allí
        const [sale] = await conn.query('SELECT branch_id FROM sales WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
        const branchId = sale[0]?.branch_id;

        const [details] = await conn.query('SELECT product_id, quantity FROM sale_details WHERE sale_id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
        for (const d of details) {
            // Restaurar stock en la sucursal
            if (branchId) await conn.query('UPDATE branch_stocks SET stock = stock + ? WHERE product_id=? AND branch_id=? AND tenant_id=?', [d.quantity, d.product_id, branchId, req.user.tenant_id]);
            // Recalcular el stock global
            await conn.query('UPDATE inventory SET stock = (SELECT COALESCE(SUM(stock), 0) FROM branch_stocks WHERE product_id = ? AND tenant_id = ?) WHERE id = ? AND tenant_id = ?', [d.product_id, req.user.tenant_id, d.product_id, req.user.tenant_id]);
        }
        await conn.query('DELETE FROM sale_details WHERE sale_id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
        await conn.query('DELETE FROM sales WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
        await conn.commit();

        await recordLog({
            tenantId: req.user.tenant_id,
            userId: req.user.id,
            action: 'SALE_DELETED',
            entityType: 'sale',
            entityId: req.params.id,
            details: { saleId: req.params.id },
            ipAddress: req.ip
        });

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
        const [sale] = await connection.query('SELECT branch_id FROM sales WHERE id=? AND tenant_id=?', [id, req.user.tenant_id]);
        const branchId = sale[0]?.branch_id;

        for (const item of items) {
            // 1. Verificar que el producto estaba en la venta
            const [details] = await connection.query('SELECT quantity FROM sale_details WHERE sale_id = ? AND product_id = ? AND tenant_id = ?', [id, item.productId, req.user.tenant_id]);
            
            if (details.length > 0) {
                // 2. Restaurar stock (Global y Sucursal)
                if (branchId) await connection.query('UPDATE branch_stocks SET stock = stock + ? WHERE product_id=? AND branch_id=? AND tenant_id=?', [item.quantity, item.productId, branchId, req.user.tenant_id]);
                // Recalcular stock global
                await connection.query('UPDATE inventory SET stock = (SELECT COALESCE(SUM(stock), 0) FROM branch_stocks WHERE product_id = ? AND tenant_id = ?) WHERE id = ? AND tenant_id = ?', [item.productId, req.user.tenant_id, item.productId, req.user.tenant_id]);
                
                // 3. Registrar la devolución (Actualizando notas de la venta)
                await connection.query('UPDATE sales SET notes = CONCAT(IFNULL(notes, ""), " [Devolución: Prod ID ", ?, " Cant ", ?, "]") WHERE id = ?', [item.productId, item.quantity, id]);
            }
        }

        await connection.commit();

        await recordLog({
            tenantId: req.user.tenant_id,
            userId: req.user.id,
            action: 'SALE_RETURN',
            entityType: 'sale',
            entityId: id,
            details: { items },
            ipAddress: req.ip
        });

        res.json({ message: 'Devolución procesada y stock restaurado' });
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ message: 'Error al procesar devolución' });
    } finally {
        if (connection) connection.release();
    }
});

// Fix inflated prices (admin only - requires password)
router.post('/api/fix-prices', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ message: 'Contraseña requerida' });
    
    // Verify admin password
    const [u] = await db.query('SELECT password FROM users WHERE id=?', [req.user.id]);
    if (!u.length || !await bcrypt.compare(password, u[0].password)) {
        return res.status(403).json({ message: 'Contraseña incorrecta' });
    }
    
    try {
        // Fix prices that are too high (divided by 1000)
        const [inventoryResult] = await db.query(
            'UPDATE inventory SET price = price / 1000, cost = cost / 1000 WHERE price > 1000000'
        );
        
        // Also fix sale_details subtotals that might be affected
        const [detailsResult] = await db.query(
            'UPDATE sale_details SET subtotal = subtotal / 1000 WHERE subtotal > 1000000'
        );
        
        // Fix sales total_price
        const [salesResult] = await db.query(
            'UPDATE sales SET total_price = total_price / 1000 WHERE total_price > 1000000'
        );
        
        res.json({
            message: 'Precios corregidos exitosamente',
            inventoryUpdated: inventoryResult.affectedRows,
            salesUpdated: salesResult.affectedRows,
            detailsUpdated: detailsResult.affectedRows
        });
    } catch (error) {
        console.error('Error corrigiendo precios:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
