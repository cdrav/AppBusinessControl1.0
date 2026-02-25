const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { sendDailySummaryEmail } = require('../services/emailService');
const fs = require('fs');
const path = require('path');

// Dashboard Stats
router.get('/dashboard-stats', authenticateToken, async (req, res) => {
    const [sales] = await db.query(`SELECT COALESCE(SUM(total_price), 0) as totalRevenue, COUNT(id) as totalSales FROM sales`);
    const [clients] = await db.query(`SELECT COUNT(id) as totalClients FROM clients`);
    const [prods] = await db.query(`SELECT COUNT(id) as totalProducts, SUM(CASE WHEN stock < 10 THEN 1 ELSE 0 END) as lowStockCount FROM inventory`);
    const [trend] = await db.query(`SELECT DATE(sale_date) as date, SUM(total_price) as total FROM sales WHERE sale_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(sale_date) ORDER BY date ASC`);
    
    // Top products
    const [top] = await db.query(`SELECT i.product_name, SUM(sd.quantity) as totalSold FROM sale_details sd JOIN inventory i ON sd.product_id = i.id GROUP BY i.id ORDER BY totalSold DESC LIMIT 5`);

    // 6. Actividad Reciente (últimas 5 acciones) - RECUPERADO
    const [recentActivity] = await db.query(`
        (
            SELECT 'sale' as type, s.id, c.name as text, s.total_price as value, s.created_at as date
            FROM sales s
            JOIN clients c ON s.client_id = c.id
        )
        UNION ALL
        (
            SELECT 'client' as type, c.id, c.name as text, NULL as value, c.created_at as date
            FROM clients c
        )
        ORDER BY date DESC
        LIMIT 5
    `);

    // 7. Productos Lentos (sin ventas en 30 días) - RECUPERADO
    const [staleProducts] = await db.query(`
        SELECT i.id, i.product_name, MAX(s.sale_date) as last_sale_date
        FROM inventory i
        LEFT JOIN sale_details sd ON i.id = sd.product_id
        LEFT JOIN sales s ON sd.sale_id = s.id
        GROUP BY i.id
        HAVING last_sale_date < DATE_SUB(CURDATE(), INTERVAL 30 DAY) OR last_sale_date IS NULL
        ORDER BY last_sale_date ASC
        LIMIT 5
    `);

    // 8. Clientes Inactivos (Riesgo de Fuga - sin compras en 90 días) - RECUPERADO
    const [inactiveClients] = await db.query(`
        SELECT c.id, c.name, c.email, c.phone, MAX(s.sale_date) as last_purchase
        FROM clients c
        JOIN sales s ON c.id = s.client_id
        GROUP BY c.id
        HAVING last_purchase < DATE_SUB(CURDATE(), INTERVAL 90 DAY)
        ORDER BY last_purchase ASC
        LIMIT 5
    `);

    res.json({
        totalRevenue: sales[0].totalRevenue,
        totalSales: sales[0].totalSales,
        totalClients: clients[0].totalClients,
        totalProducts: prods[0].totalProducts,
        lowStockCount: prods[0].lowStockCount || 0,
        salesTrend: trend,
        topProducts: top,
        recentActivity,
        staleProducts,
        inactiveClients
    });
});

// Estadísticas avanzadas
router.get('/statistics', authenticateToken, async (req, res) => {
    const { startDate, endDate } = req.query;

    // Ajustar fechas como cadenas para evitar desfases de zona horaria
    const startOfDay = `${startDate} 00:00:00`;
    const endOfDay = `${endDate} 23:59:59`;

    // 1. Estadísticas principales (cards)
    const [sales] = await db.query(`SELECT COALESCE(SUM(total_price), 0) as totalRevenue, COUNT(id) as totalSales FROM sales WHERE sale_date BETWEEN ? AND ?`, [startOfDay, endOfDay]);
    
    const [clientStats] = await db.query(`SELECT COUNT(id) as newClients FROM clients WHERE created_at BETWEEN ? AND ?`, [startOfDay, endOfDay]);

    const [inventoryStats] = await db.query(`SELECT COALESCE(SUM(stock), 0) as totalProducts FROM inventory`);

    // 2. Tendencia de ventas
    const [trend] = await db.query(`SELECT DATE(sale_date) as date, SUM(total_price) as total FROM sales WHERE sale_date BETWEEN ? AND ? GROUP BY DATE(sale_date) ORDER BY date ASC`, [startOfDay, endOfDay]);
    
    // 3. Distribución por categoría (para gráfico de dona)
    const [categoryDistribution] = await db.query(
        `SELECT 
            COALESCE(i.category, 'Sin Categoría') as category, 
            SUM(sd.subtotal) as total 
         FROM sale_details sd
         JOIN inventory i ON sd.product_id = i.id
         JOIN sales s ON sd.sale_id = s.id
         WHERE s.sale_date BETWEEN ? AND ?
         GROUP BY i.category
         ORDER BY total DESC`,
        [startOfDay, endOfDay]
    );

    // 4. Top 5 Clientes (para gráfico de barras)
    const [topClients] = await db.query(
        `SELECT 
            c.name, 
            SUM(s.total_price) as total 
         FROM sales s
         JOIN clients c ON s.client_id = c.id
         WHERE s.sale_date BETWEEN ? AND ?
         GROUP BY c.id
         ORDER BY total DESC
         LIMIT 5`,
        [startOfDay, endOfDay]
    );

    // 5. Ventas por hora (Horas Pico)
    const [salesByHour] = await db.query(
        `SELECT HOUR(sale_date) as hour, COUNT(id) as count 
         FROM sales 
         WHERE sale_date BETWEEN ? AND ?
         GROUP BY HOUR(sale_date)
         ORDER BY hour ASC`,
        [startOfDay, endOfDay]
    );

    res.json({
        totalRevenue: sales[0].totalRevenue,
        totalSales: sales[0].totalSales,
        newClients: clientStats[0].newClients,
        totalProducts: inventoryStats[0].totalProducts,
        salesTrend: trend,
        categoryDistribution,
        topClients,
        salesByHour
    });
});

// ==================================================================
// RUTA PARA RESUMEN DIARIO (CIERRE DE CAJA) - RECUPERADO
// ==================================================================
router.get('/daily-summary', authenticateToken, async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ message: 'Se requiere una fecha.' });
    }

    const startOfDay = `${date} 00:00:00`;
    const endOfDay = `${date} 23:59:59`;

    try {
        const [sales] = await db.query(
            `SELECT COALESCE(SUM(total_price), 0) as totalRevenue, COUNT(id) as totalSales FROM sales WHERE sale_date BETWEEN ? AND ?`,
            [startOfDay, endOfDay]
        );

        res.status(200).json({
            date: date,
            totalRevenue: sales[0].totalRevenue,
            totalSales: sales[0].totalSales
        });
    } catch (error) {
        console.error('Error al obtener el resumen diario:', error);
        res.status(500).json({ message: 'Error del servidor al obtener el resumen.' });
    }
});

// Enviar resumen diario por correo (ruta manual) - RECUPERADO
router.post('/daily-summary/email', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        const message = await sendDailySummaryEmail(req.body.date);
        res.json({ message });
    } catch (error) {
        console.error('Error enviando correo de resumen manual:', error);
        res.status(500).json({ message: error.message || 'Error al enviar el correo.' });
    }
});

// Reporte PDF
router.get('/report', authenticateToken, async (req, res) => {
    const { startDate, endDate, type } = req.query;
    
    const [settings] = await db.query('SELECT * FROM settings WHERE id = 1');
    const config = settings[0] || { company_name: 'Business Control' };

    const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte_${type || 'general'}_${Date.now()}.pdf`);
    doc.pipe(res);

    // Helper para moneda
    const formatCurrency = (amount) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

    // Logo
    if (config.company_logo) {
        const logoPath = path.join(__dirname, '../public', config.company_logo);
        if (fs.existsSync(logoPath)) {
            try {
                doc.image(logoPath, 50, 30, { width: 50 });
            } catch (error) {
                console.error('Error al cargar el logo en el reporte:', error.message);
            }
        }
    }

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text(config.company_name, { align: 'center' });
    
    // Título dinámico según el tipo
    let reportTitle = 'Reporte General';
    if (type === 'sales') reportTitle = 'Reporte de Ventas';    
    else if (type === 'inventory') reportTitle = 'Reporte de Inventario (Valorizado al Costo)';
    else if (type === 'clients') reportTitle = 'Directorio de Clientes';
    else if (type === 'profits') reportTitle = 'Reporte de Ganancias y Costos';
    else if (type === 'complete') reportTitle = 'Reporte Ejecutivo Completo';

    doc.fontSize(12).text(reportTitle, { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Generado el: ${new Date().toLocaleString()}`, { align: 'center' });
    
    if (startDate && endDate && (type === 'sales' || type === 'profits')) {
        doc.text(`Período: ${startDate} al ${endDate}`, { align: 'center' });
    }

    doc.fontSize(8).text(`© ${new Date().getFullYear()} Business Control - Desarrollado por Cristian David Ruiz. Todos los derechos reservados.`, { align: 'center' });
    doc.moveDown(2);

    // --- LÓGICA POR TIPO DE REPORTE ---
    
    if (type === 'inventory') {
        const [products] = await db.query('SELECT * FROM inventory ORDER BY product_name ASC');        
        
        const tableTop = doc.y;
        const colX = [30, 230, 330, 410, 490];
        
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text('PRODUCTO', colX[0], tableTop);
        doc.text('CATEGORÍA', colX[1], tableTop);
        doc.text('STOCK', colX[2], tableTop);
        doc.text('COSTO UNIT.', colX[3], tableTop);
        doc.text('VALOR COSTO', colX[4], tableTop);
        doc.moveTo(30, tableTop + 15).lineTo(565, tableTop + 15).stroke();

        let y = tableTop + 25;
        let totalCostValue = 0;
        doc.font('Helvetica').fontSize(9);

        products.forEach(p => {
            if (y > 750) { doc.addPage(); y = 50; }
            const cost = p.cost || 0;
            const totalCost = p.stock * cost;
            totalCostValue += totalCost;
            doc.text(p.product_name.substring(0, 35), colX[0], y);
            doc.text(p.category || '-', colX[1], y);
            doc.text(p.stock.toString(), colX[2], y);
            doc.text(formatCurrency(cost), colX[3], y);
            doc.text(formatCurrency(totalCost), colX[4], y);
            y += 15;
        });
        doc.moveDown();
        doc.font('Helvetica-Bold').text(`VALOR TOTAL DEL INVENTARIO (AL COSTO): ${formatCurrency(totalCostValue)}`, { align: 'right' });

    } else if (type === 'clients') {
        const [clients] = await db.query('SELECT * FROM clients ORDER BY name ASC');
        
        const tableTop = doc.y;
        const colX = [30, 180, 350, 450];
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text('NOMBRE', colX[0], tableTop);
        doc.text('EMAIL', colX[1], tableTop);
        doc.text('TELÉFONO', colX[2], tableTop);
        doc.moveTo(30, tableTop + 15).lineTo(565, tableTop + 15).stroke();

        let y = tableTop + 25;
        doc.font('Helvetica').fontSize(9);
        clients.forEach(c => {
            if (y > 750) { doc.addPage(); y = 50; }
            doc.text(c.name, colX[0], y);
            doc.text(c.email || '-', colX[1], y);
            doc.text(c.phone || '-', colX[2], y);
            y += 15;
        });

    } else if (type === 'profits') {
        let query = `
            SELECT s.sale_date, i.product_name, sd.quantity, sd.subtotal, (COALESCE(i.cost, 0) * sd.quantity) as total_cost
            FROM sale_details sd
            JOIN sales s ON sd.sale_id = s.id
            LEFT JOIN inventory i ON sd.product_id = i.id
        `;
        const params = [];
        if (startDate && endDate) {
            query += ` WHERE s.sale_date BETWEEN ? AND ?`;
            params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }
        query += ` ORDER BY s.sale_date DESC`;
        const [rows] = await db.query(query, params);

        const tableTop = doc.y;
        const colX = [30, 100, 280, 340, 410, 490];
        doc.font('Helvetica-Bold').fontSize(8);
        doc.text('FECHA', colX[0], tableTop);
        doc.text('PRODUCTO', colX[1], tableTop);
        doc.text('CANT', colX[2], tableTop);
        doc.text('VENTA', colX[3], tableTop);
        doc.text('COSTO', colX[4], tableTop);
        doc.text('GANANCIA', colX[5], tableTop);
        doc.moveTo(30, tableTop + 15).lineTo(565, tableTop + 15).stroke();

        let y = tableTop + 25;
        let totalProfit = 0;
        doc.font('Helvetica').fontSize(8);
        rows.forEach(r => {
            if (y > 750) { doc.addPage(); y = 50; }
            const profit = r.subtotal - r.total_cost;
            totalProfit += profit;
            doc.text(new Date(r.sale_date).toLocaleDateString(), colX[0], y);
            doc.text((r.product_name || 'Eliminado').substring(0, 30), colX[1], y);
            doc.text(r.quantity.toString(), colX[2], y);
            doc.text(formatCurrency(r.subtotal), colX[3], y);
            doc.text(formatCurrency(r.total_cost), colX[4], y);
            doc.fillColor(profit >= 0 ? 'black' : 'red').text(formatCurrency(profit), colX[5], y, { width: 80, align: 'right' }).fillColor('black');
            y += 15;
        });
        doc.moveDown();
        doc.font('Helvetica-Bold').fontSize(10).text(`GANANCIA NETA: ${formatCurrency(totalProfit)}`, { align: 'right' });

    } else if (type === 'complete') {
        // --- REPORTE EJECUTIVO COMPLETO ---
        
        // 1. Resumen Financiero
        let salesQuery = `SELECT COALESCE(SUM(total_price), 0) as totalRevenue, COUNT(id) as totalSales FROM sales`;
        let profitQuery = `
            SELECT SUM(sd.subtotal - (COALESCE(i.cost, 0) * sd.quantity)) as totalProfit 
            FROM sale_details sd 
            JOIN sales s ON sd.sale_id = s.id 
            LEFT JOIN inventory i ON sd.product_id = i.id
        `;
        
        const params = [];
        if (startDate && endDate) {
            const dateFilter = ` WHERE s.sale_date BETWEEN ? AND ?`;
            salesQuery += ` WHERE sale_date BETWEEN ? AND ?`;
            profitQuery += dateFilter;
            params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        const [salesStats] = await db.query(salesQuery, params);
        const [profitStats] = await db.query(profitQuery, params);
        
        doc.font('Helvetica-Bold').fontSize(14).text('1. Resumen Financiero', { underline: true });
        doc.moveDown(0.5);
        
        doc.fontSize(10).font('Helvetica');
        doc.text(`Ventas Totales: ${formatCurrency(salesStats[0].totalRevenue)}`);
        doc.text(`Número de Transacciones: ${salesStats[0].totalSales}`);
        doc.text(`Ganancia Estimada: ${formatCurrency(profitStats[0].totalProfit || 0)}`);
        doc.moveDown(2);

        // 2. Top Productos
        let topProdQuery = `
            SELECT i.product_name, SUM(sd.quantity) as qty, SUM(sd.subtotal) as total
            FROM sale_details sd
            JOIN sales s ON sd.sale_id = s.id
            JOIN inventory i ON sd.product_id = i.id
        `;
        if (startDate && endDate) topProdQuery += ` WHERE s.sale_date BETWEEN ? AND ?`;
        topProdQuery += ` GROUP BY i.id ORDER BY qty DESC LIMIT 5`;
        
        const [topProducts] = await db.query(topProdQuery, params);

        doc.font('Helvetica-Bold').fontSize(14).text('2. Productos Más Vendidos', { underline: true });
        doc.moveDown(0.5);
        
        if (topProducts.length > 0) {
            const tableTop = doc.y;
            doc.fontSize(9).text('PRODUCTO', 30, tableTop);
            doc.text('CANTIDAD', 300, tableTop);
            doc.text('TOTAL VENDIDO', 400, tableTop);
            doc.moveTo(30, tableTop + 15).lineTo(500, tableTop + 15).stroke();
            
            let y = tableTop + 25;
            doc.font('Helvetica');
            topProducts.forEach(p => {
                doc.text(p.product_name, 30, y);
                doc.text(p.qty.toString(), 300, y);
                doc.text(formatCurrency(p.total), 400, y);
                y += 15;
            });
        } else {
            doc.font('Helvetica').fontSize(10).text('No hay datos de ventas en este período.');
        }
        doc.moveDown(2);

        // 3. Resumen de Inventario (Solo si no hay filtro de fecha, o como estado actual)
        const [invStats] = await db.query(`SELECT COUNT(*) as count, SUM(stock * price) as value FROM inventory`);
        const [lowStock] = await db.query(`SELECT COUNT(*) as count FROM inventory WHERE stock < 10`);

        doc.font('Helvetica-Bold').fontSize(14).text('3. Estado Actual del Inventario', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Total Productos Únicos: ${invStats[0].count}`);
        doc.text(`Valor del Inventario: ${formatCurrency(invStats[0].value || 0)}`);
        doc.fillColor(lowStock[0].count > 0 ? 'red' : 'black').text(`Productos con Stock Bajo: ${lowStock[0].count}`);
        doc.fillColor('black');

    } else {
        // REPORTE DE VENTAS (DEFAULT)
        let query = `SELECT s.id, s.sale_date, c.name as client_name, s.total_price, b.name as branch_name FROM sales s LEFT JOIN clients c ON s.client_id = c.id LEFT JOIN branches b ON s.branch_id = b.id`;
        const params = [];
        if (startDate && endDate) { query += ` WHERE s.sale_date BETWEEN ? AND ?`; params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`); }
        query += ` ORDER BY s.sale_date DESC`;
        const [sales] = await db.query(query, params);

        const tableTop = doc.y;
        const colX = [30, 80, 180, 350, 480];
        doc.rect(30, tableTop, 535, 20).fill('#eeeeee').stroke('#cccccc');
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(9);
        doc.text('ID', colX[0] + 5, tableTop + 6);
        doc.text('FECHA', colX[1], tableTop + 6);
        doc.text('CLIENTE', colX[2], tableTop + 6);
        doc.text('SUCURSAL', colX[3], tableTop + 6);
        doc.text('TOTAL', colX[4], tableTop + 6, { width: 80, align: 'right' });

        let y = tableTop + 25;
        let totalAmount = 0;
        doc.font('Helvetica').fontSize(9);
        sales.forEach(s => {
            if (y > 750) { doc.addPage(); y = 50; }
            doc.text(`#${s.id}`, colX[0] + 5, y).text(new Date(s.sale_date).toLocaleDateString(), colX[1], y).text(s.client_name || 'Consumidor Final', colX[2], y, { width: 160, ellipsis: true }).text(s.branch_name || 'Principal', colX[3], y, { width: 120, ellipsis: true }).text(formatCurrency(s.total_price), colX[4], y, { width: 80, align: 'right' });
            totalAmount += parseFloat(s.total_price);
            y += 15;
            doc.moveTo(30, y - 5).lineTo(565, y - 5).strokeColor('#f0f0f0').stroke();
        });
        y += 10;
        doc.moveTo(30, y).lineTo(565, y).strokeColor('#000').stroke();
        doc.font('Helvetica-Bold').fontSize(11).text(`TOTAL VENTAS: ${formatCurrency(totalAmount)}`, 300, y + 10, { align: 'right', width: 260 });
    }

    doc.end();
});

// Backup
router.get('/backup', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const [tables] = await db.query('SHOW TABLES');
    let dump = `SET FOREIGN_KEY_CHECKS=0;\n\n`;
    for (const row of tables) {
        const tbl = Object.values(row)[0];
        const [create] = await db.query(`SHOW CREATE TABLE \`${tbl}\``);
        dump += `DROP TABLE IF EXISTS \`${tbl}\`;\n${create[0]['Create Table']};\n\n`;
        const [data] = await db.query(`SELECT * FROM \`${tbl}\``);
        if (data.length) {
            const vals = data.map(r => `(${Object.values(r).map(v => v === null ? 'NULL' : (typeof v === 'number' ? v : `'${String(v).replace(/'/g, "\\'")}'`)).join(', ')})`).join(',\n');
            dump += `INSERT INTO \`${tbl}\` VALUES ${vals};\n\n`;
        }
    }
    dump += `SET FOREIGN_KEY_CHECKS=1;\n`;
    res.header('Content-Type', 'application/sql').attachment(`backup-${Date.now()}.sql`).send(dump);
});

// Restore
const memoryUpload = multer({ storage: multer.memoryStorage() });
router.post('/restore', authenticateToken, authorizeRole(['admin']), memoryUpload.single('backupFile'), async (req, res) => {
    if (req.body.supportKey !== (process.env.SUPPORT_KEY || 'soporte123')) return res.status(403).json({ message: 'Clave incorrecta' });
    if (!req.file) return res.status(400).json({ message: 'Falta archivo' });
    try { await db.query(req.file.buffer.toString('utf8')); res.json({ message: 'Restauración completa' }); }
    catch (e) { res.status(500).json({ message: 'Error en restauración' }); }
});

module.exports = router;
