const express = require('express');
const router = express.Router();
const db = require('../config/db');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');

// Estadísticas del Dashboard
router.get('/dashboard-stats', authenticateToken, async (req, res) => {
    try {
        const { period } = req.query;
        let dateCondition;
        let groupBy = "GROUP BY DATE(sale_date)";
        let selectDate = "DATE(sale_date) as date";
        
        // Definir condición de fecha según el filtro
        if (period === 'month') {
            // Mes actual: desde el día 1 del mes actual hasta hoy
            dateCondition = "sale_date >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')";
        } else if (period === 'year') {
            // Año actual: desde el 1 de Enero
            dateCondition = "sale_date >= DATE_FORMAT(NOW(), '%Y-01-01 00:00:00')";
            groupBy = "GROUP BY YEAR(sale_date), MONTH(sale_date)";
            selectDate = "DATE_FORMAT(sale_date, '%Y-%m-01') as date"; // Agrupa al primer día del mes
        } else if (/^\d{4}$/.test(period)) {
            // Año específico (ej. 2024, 2025)
            dateCondition = `YEAR(sale_date) = ${period}`;
            groupBy = "GROUP BY MONTH(sale_date)";
            selectDate = "DATE_FORMAT(sale_date, '%Y-%m-01') as date";
        } else {
            // Últimos 7 días (por defecto)
            dateCondition = "sale_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
        }

        // 1. Ingresos Totales (filtrado)
        const [revenue] = await db.query(`SELECT COALESCE(SUM(total_price), 0) as total FROM sales WHERE ${dateCondition}`);
        
        // 2. Total Ventas (filtrado)
        const [salesCount] = await db.query(`SELECT COUNT(*) as total FROM sales WHERE ${dateCondition}`);

        // 3. Tendencia de Ventas para el Gráfico (filtrado)
        const [salesTrend] = await db.query(`
            SELECT ${selectDate}, SUM(total_price) as total 
            FROM sales 
            WHERE ${dateCondition}
            ${groupBy}
            ORDER BY date ASC
        `);

        // 4. Productos Top (filtrado)
        const [topProducts] = await db.query(`
            SELECT i.product_name, SUM(sd.quantity) as totalSold
            FROM sale_details sd
            JOIN sales s ON sd.sale_id = s.id
            JOIN inventory i ON sd.product_id = i.id
            WHERE s.${dateCondition}
            GROUP BY i.id
            ORDER BY totalSold DESC
            LIMIT 5
        `);

        // Datos Globales (no dependen del filtro de fecha)
        const [clients] = await db.query('SELECT COUNT(*) as total FROM clients');
        const [products] = await db.query('SELECT COUNT(*) as total FROM inventory');
        const [lowStock] = await db.query('SELECT COUNT(*) as total FROM branch_stocks WHERE stock < 10');
        
        // Actividad Reciente (últimas 5 acciones globales)
        const [recentSales] = await db.query(`
            SELECT 'sale' as type, c.name as text, total_price as value, sale_date as date 
            FROM sales s LEFT JOIN clients c ON s.client_id = c.id 
            ORDER BY sale_date DESC LIMIT 5
        `);
        
        // Productos estancados (sin ventas en 30 días) - Global
        const [staleProducts] = await db.query(`
            SELECT i.id, i.product_name, MAX(s.sale_date) as last_sale_date
            FROM inventory i
            LEFT JOIN sale_details sd ON i.id = sd.product_id
            LEFT JOIN sales s ON sd.sale_id = s.id
            GROUP BY i.id
            HAVING last_sale_date < DATE_SUB(NOW(), INTERVAL 30 DAY) OR last_sale_date IS NULL
            LIMIT 5
        `);

        // Clientes inactivos (sin compras en 60 días) - Global
        const [inactiveClients] = await db.query(`
            SELECT c.name, c.email, c.phone, MAX(s.sale_date) as last_purchase
            FROM clients c
            JOIN sales s ON c.id = s.client_id
            GROUP BY c.id
            HAVING last_purchase < DATE_SUB(NOW(), INTERVAL 60 DAY)
            LIMIT 5
        `);

        res.json({
            totalRevenue: revenue[0].total,
            totalSales: salesCount[0].total,
            totalClients: clients[0].total,
            totalProducts: products[0].total,
            lowStockCount: lowStock[0].total,
            salesTrend,
            topProducts,
            recentActivity: recentSales,
            staleProducts,
            inactiveClients
        });

    } catch (error) {
        console.error('Error en dashboard-stats:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// Resumen Diario (para el modal de cierre de caja)
router.get('/daily-summary', authenticateToken, async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: 'Fecha requerida' });

    try {
        const [summary] = await db.query(`
            SELECT COALESCE(SUM(total_price), 0) as totalRevenue, COUNT(*) as totalSales
            FROM sales WHERE DATE(sale_date) = ?
        `, [date]);
        res.json(summary[0]);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener resumen diario' });
    }
});

// Generar Reportes Avanzados (Para reportes.html)
router.post('/generate', authenticateToken, async (req, res) => {
    const { startDate, endDate, type } = req.body;
    
    try {
        let dateFilter = "";
        const params = [];
        
        if (startDate && endDate) {
            dateFilter = "AND sale_date BETWEEN ? AND ?";
            params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        const reportData = {};

        // 1. Gráfico de Ventas (Línea de tiempo)
        if (['sales', 'complete', 'profits'].includes(type)) {
            const [sales] = await db.query(`
                SELECT DATE(sale_date) as date, SUM(total_price) as total, COUNT(*) as count 
                FROM sales 
                WHERE 1=1 ${dateFilter} 
                GROUP BY DATE(sale_date) 
                ORDER BY date ASC
            `, params);
            reportData.salesChart = sales;
        }

        // 2. Distribución por Categoría
        if (['inventory', 'sales', 'complete'].includes(type)) {
            const [categories] = await db.query(`
                SELECT i.category, SUM(sd.quantity) as quantity, SUM(sd.subtotal) as total
                FROM sale_details sd
                JOIN sales s ON sd.sale_id = s.id
                JOIN inventory i ON sd.product_id = i.id
                WHERE 1=1 ${dateFilter.replace('sale_date', 's.sale_date')}
                GROUP BY i.category
            `, params);
            reportData.categoryChart = categories;
        }

        // 3. Top Clientes
        if (['clients', 'complete'].includes(type)) {
            const [clients] = await db.query(`
                SELECT c.name, COUNT(s.id) as purchases, SUM(s.total_price) as total
                FROM sales s
                JOIN clients c ON s.client_id = c.id
                WHERE 1=1 ${dateFilter}
                GROUP BY c.id
                ORDER BY total DESC
                LIMIT 5
            `, params);
            reportData.clientsChart = clients;
        }

        // 4. Horas Pico
        if (['sales', 'complete'].includes(type)) {
            const [hours] = await db.query(`
                SELECT HOUR(sale_date) as hour, COUNT(*) as count
                FROM sales
                WHERE 1=1 ${dateFilter}
                GROUP BY HOUR(sale_date)
                ORDER BY hour ASC
            `, params);
            reportData.hourlyChart = hours;
        }
        
        // Totales para las tarjetas
        const [totals] = await db.query(`
            SELECT 
                COALESCE(SUM(total_price), 0) as revenue, 
                COUNT(*) as salesCount,
                COUNT(DISTINCT client_id) as activeClients
            FROM sales 
            WHERE 1=1 ${dateFilter}
        `, params);
        
        // Total de productos (stock actual, no depende de fechas de venta)
        const [products] = await db.query('SELECT SUM(stock) as total FROM inventory');
        
        reportData.totals = { ...totals[0], totalProducts: products[0].total };

        res.json(reportData);

    } catch (error) {
        console.error('Error generando reporte:', error);
        res.status(500).json({ message: 'Error generando reporte' });
    }
});

// Exportar Reporte PDF
router.get('/report-export', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate, type } = req.query;
        
        // Definir nombre del archivo según el tipo
        let filename = 'reporte.pdf';
        const dateStr = new Date().toISOString().split('T')[0];
        if (type === 'sales') filename = `reporte-ventas-${startDate}-a-${endDate}.pdf`;
        else if (type === 'profits') filename = `reporte-ganancias-${startDate}-a-${endDate}.pdf`;
        else if (type === 'low-stock') filename = `reporte-stock-bajo-${dateStr}.pdf`;
        else if (type === 'inventory') filename = `reporte-inventario-${dateStr}.pdf`;
        else if (type === 'clients') filename = `reporte-clientes-${dateStr}.pdf`;
        else if (type === 'complete') filename = `reporte-completo-${startDate}.pdf`;
        
        // 1. Obtener Configuración de la Empresa
        const [settings] = await db.query('SELECT * FROM settings WHERE id = 1');
        const config = settings[0] || { company_name: 'Business Control', company_address: '', company_phone: '', company_email: '' };

        // 2. Configurar Documento PDF
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        doc.pipe(res);

        // --- FUNCIONES AUXILIARES DE DISEÑO ---
        const formatCurrency = (amount) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
        
        const drawHeader = () => {
            doc.fillColor('#000'); // Asegurar color negro al inicio
            // Logo
            if (config.company_logo) {
                const logoPath = path.join(__dirname, '../public', config.company_logo);
                if (fs.existsSync(logoPath)) {
                    try {
                        doc.image(logoPath, 50, 45, { width: 60 });
                    } catch (e) { console.error("Error cargando logo", e); }
                }
            }

            // Información de la Empresa (Alineada a la derecha del logo o izquierda si no hay logo)
            const textX = config.company_logo ? 120 : 50;
            doc.fontSize(18).font('Helvetica-Bold').text(config.company_name, textX, 50);
            doc.fontSize(9).font('Helvetica').text(config.company_address, textX, 75);
            doc.text(`Tel: ${config.company_phone} | Email: ${config.company_email}`, textX, 88);
            
            // Título del Reporte (Centrado)
            doc.moveDown(3);
            let title = 'REPORTE DE NEGOCIO';
            if (type === 'sales') title = 'REPORTE DE VENTAS';
            if (type === 'profits') title = 'REPORTE DE GANANCIAS';
            if (type === 'inventory') title = 'INVENTARIO VALORIZADO';
            if (type === 'low-stock') title = 'ALERTA DE STOCK BAJO';
            if (type === 'clients') title = 'DIRECTORIO DE CLIENTES';
            if (type === 'complete') title = 'REPORTE GERENCIAL COMPLETO';
            
            doc.fontSize(14).font('Helvetica-Bold').text(title, { align: 'center' });
            if (startDate && endDate) {
                doc.fontSize(10).font('Helvetica').text(`Periodo: ${startDate} al ${endDate}`, { align: 'center' });
            } else {
                doc.fontSize(10).font('Helvetica').text(`Generado el: ${new Date().toLocaleDateString()}`, { align: 'center' });
            }
            
            // Línea separadora
            doc.moveDown(0.5);
            doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
            doc.moveDown(1.5);
        };

        drawHeader();

        // --- PREPARACIÓN DE DATOS ---
        let dateFilter = "";
        const params = [];
        if (startDate && endDate) {
            dateFilter = "AND sale_date BETWEEN ? AND ?";
            params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }
        
        // ==========================================
        // REPORTE DE VENTAS (Sales)
        // ==========================================
        if (type === 'sales') {
            const [totals] = await db.query(`
                SELECT 
                    COALESCE(SUM(total_price), 0) as revenue, 
                    COUNT(*) as salesCount,
                    AVG(total_price) as avgTicket,
                    COALESCE(SUM(discount), 0) as totalDiscount
                FROM sales WHERE 1=1 ${dateFilter}
            `, params);
            
            const startY = doc.y;
            doc.rect(50, startY, 495, 50).fill('#f8f9fa').stroke('#e9ecef');
            doc.fillColor('#000');
            
            doc.fontSize(10).font('Helvetica-Bold').text('INGRESOS TOTALES', 70, startY + 12);
            doc.fontSize(14).text(formatCurrency(totals[0].revenue), 70, startY + 28);
            
            doc.fontSize(10).font('Helvetica-Bold').text('TRANSACCIONES', 300, startY + 12);
            doc.fontSize(14).text(totals[0].salesCount, 300, startY + 28);
            
            doc.moveDown(4);
        }

        // ==========================================
        // DETALLE DE VENTAS (Folio por Folio)
        // Se incluye en 'sales' y ahora también en 'complete'
        // ==========================================
        if (type === 'sales') {
            // Listado detallado de ventas (Folio por Folio) - Restaurado del original
            const [salesList] = await db.query(`
                SELECT s.id, c.name AS client_name, s.total_price, s.sale_date
                FROM sales s LEFT JOIN clients c ON s.client_id = c.id
                WHERE 1=1 ${dateFilter} ORDER BY s.sale_date ASC
            `, params);

            if (salesList.length === 0) {
                doc.text('No hay ventas registradas en este período.');
            } else {
                // Función para dibujar encabezados de tabla de ventas
                const drawSalesTableHeader = (y) => {
                    doc.rect(50, y, 495, 20).fill('#4F46E5');
                    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
                    doc.text('FOLIO', 60, y + 6);
                    doc.text('FECHA', 120, y + 6);
                    doc.text('CLIENTE', 250, y + 6);
                    doc.text('TOTAL', 450, y + 6, { align: 'right', width: 80 });
                    doc.fillColor('#000'); // Resetear a negro
                };

                let tableTop = doc.y;
                drawSalesTableHeader(tableTop);
                let y = tableTop + 25;
                doc.fillColor('#000').font('Helvetica');

                salesList.forEach((sale, i) => {
                    if (y > 700) { 
                        doc.addPage(); drawHeader(); tableTop = doc.y; drawSalesTableHeader(tableTop); y = tableTop + 25; 
                    }
                    if (i % 2 === 0) doc.rect(50, y - 5, 495, 18).fill('#f9f9f9');
                    doc.fillColor('#000');
                    
                    const dateStr = new Date(sale.sale_date).toLocaleDateString('es-CO');
                    doc.text(`#${sale.id}`, 60, y);
                    doc.text(dateStr, 120, y);
                    doc.text((sale.client_name || 'General').substring(0, 25), 250, y);
                    doc.text(formatCurrency(sale.total_price), 450, y, { align: 'right', width: 80 });
                    y += 18;
                });
            }
        }

        // ==========================================
        // REPORTE DE GANANCIAS (Profits)
        // ==========================================
        if (type === 'profits') {
            const [details] = await db.query(`
                SELECT 
                    s.sale_date, i.product_name, sd.quantity, sd.subtotal as sale_price,
                    (IFNULL(i.cost, 0) * sd.quantity) as total_cost
                FROM sale_details sd
                JOIN sales s ON sd.sale_id = s.id
                LEFT JOIN inventory i ON sd.product_id = i.id
                WHERE 1=1 ${dateFilter.replace('sale_date', 's.sale_date')} 
                ORDER BY s.sale_date ASC
            `, params);

            const tableTop = doc.y;
            doc.rect(50, tableTop, 495, 20).fill('#10B981'); // Verde para ganancias
            doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
            doc.text('PRODUCTO', 55, tableTop + 6);
            doc.text('VENTA', 300, tableTop + 6, { width: 60, align: 'right' });
            doc.text('COSTO', 370, tableTop + 6, { width: 60, align: 'right' });
            doc.text('GANANCIA', 440, tableTop + 6, { width: 60, align: 'right' });

            let y = tableTop + 25;
            let totalRevenue = 0, totalCost = 0;
            doc.fillColor('#000').font('Helvetica');

            details.forEach((item, i) => {
                if (y > 700) { doc.addPage(); drawHeader(); y = 150; }
                if (i % 2 === 0) doc.rect(50, y - 5, 495, 18).fill('#f9f9f9');
                doc.fillColor('#000');

                const saleVal = parseFloat(item.sale_price);
                const costVal = parseFloat(item.total_cost || 0);
                const profitVal = saleVal - costVal;

                doc.text((item.product_name || 'Producto Borrado').substring(0, 35), 55, y);
                doc.text(formatCurrency(saleVal), 300, y, { width: 60, align: 'right' });
                doc.text(formatCurrency(costVal), 370, y, { width: 60, align: 'right' });
                
                doc.fillColor(profitVal < 0 ? 'red' : 'green'); // Color condicional
                doc.text(formatCurrency(profitVal), 440, y, { width: 60, align: 'right' });

                totalRevenue += saleVal;
                totalCost += costVal;
                y += 18;
            });

            doc.moveDown(2);
            doc.font('Helvetica-Bold').fillColor('#000');
            doc.text(`Total Ventas: ${formatCurrency(totalRevenue)}`, { align: 'right' });
            doc.text(`Total Costos: ${formatCurrency(totalCost)}`, { align: 'right' });
            doc.fontSize(12).text(`Ganancia Neta: ${formatCurrency(totalRevenue - totalCost)}`, { align: 'right' });
        }

        // ==========================================
        // REPORTE DE INVENTARIO VALORIZADO
        // ==========================================
        if (type === 'inventory') {
            const [products] = await db.query('SELECT * FROM inventory ORDER BY product_name ASC');
            
            const tableTop = doc.y;
            doc.rect(50, tableTop, 495, 20).fill('#F59E0B'); // Naranja
            doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
            doc.text('PRODUCTO', 55, tableTop + 6);
            doc.text('STOCK', 320, tableTop + 6, { width: 40, align: 'center' });
            doc.text('PRECIO', 370, tableTop + 6, { width: 70, align: 'right' });
            doc.text('VALOR TOTAL', 450, tableTop + 6, { width: 80, align: 'right' });

            let y = tableTop + 25;
            let totalValue = 0, totalItems = 0;
            doc.fillColor('#000').font('Helvetica');

            products.forEach((p, i) => {
                if (y > 700) { doc.addPage(); drawHeader(); y = 150; }
                if (i % 2 === 0) doc.rect(50, y - 5, 495, 18).fill('#f9f9f9');
                doc.fillColor('#000');

                const val = p.stock * p.price;
                totalValue += val;
                totalItems += p.stock;

                doc.text(p.product_name.substring(0, 40), 55, y);
                doc.text(p.stock, 320, y, { width: 40, align: 'center' });
                doc.text(formatCurrency(p.price), 370, y, { width: 70, align: 'right' });
                doc.text(formatCurrency(val), 450, y, { width: 80, align: 'right' });
                y += 18;
            });

            doc.moveDown(2);
            doc.font('Helvetica-Bold');
            doc.text(`Total Unidades: ${totalItems}`, { align: 'right' });
            doc.fontSize(12).text(`Valor del Inventario: ${formatCurrency(totalValue)}`, { align: 'right' });
        }

        // ==========================================
        // REPORTE DE STOCK BAJO
        // ==========================================
        if (type === 'low-stock') {
            const [products] = await db.query('SELECT * FROM inventory WHERE stock < 10 ORDER BY stock ASC');
            
            if (products.length === 0) {
                doc.fontSize(12).text('¡Excelente! No hay productos con stock crítico.', { align: 'center' });
            } else {
                const tableTop = doc.y;
                doc.rect(50, tableTop, 495, 20).fill('#EF4444'); // Rojo
                doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
                doc.text('PRODUCTO', 55, tableTop + 6);
                doc.text('STOCK ACTUAL', 400, tableTop + 6, { align: 'right' });

                let y = tableTop + 25;
                doc.fillColor('#000').font('Helvetica');

                products.forEach((p, i) => {
                    if (y > 700) { doc.addPage(); drawHeader(); y = 150; }
                    if (i % 2 === 0) doc.rect(50, y - 5, 495, 18).fill('#f9f9f9');
                    doc.fillColor('#000');
                    doc.text(p.product_name, 55, y);
                    doc.text(p.stock, 400, y, { align: 'right' });
                    y += 18;
                });
            }
        }

        // ==========================================
        // DIRECTORIO DE CLIENTES
        // ==========================================
        if (type === 'clients') {
            const [clients] = await db.query('SELECT * FROM clients ORDER BY name ASC');
            
            let y = doc.y;
            doc.font('Helvetica');
            
            clients.forEach((c, i) => {
                if (y > 680) { doc.addPage(); drawHeader(); y = 150; }
                
                // Tarjeta de cliente
                doc.rect(50, y, 495, 50).stroke('#e0e0e0');
                doc.font('Helvetica-Bold').fontSize(10).text(c.name, 60, y + 10);
                doc.font('Helvetica').fontSize(9).fillColor('#555');
                doc.text(`Tel: ${c.phone || 'N/A'}  |  Email: ${c.email || 'N/A'}`, 60, y + 25);
                doc.text(`Dirección: ${c.address || 'N/A'}`, 60, y + 38);
                
                doc.fillColor('#000');
                y += 60;
            });
        }

        // ==========================================
        // DESGLOSE DIARIO (Solo para tipo 'complete')
        // ==========================================
        if (type === 'complete') { // Lógica completamente nueva para el reporte gerencial
            // --- 1. RECOPILAR TODOS LOS DATOS ---
            const [totals] = await db.query(`SELECT COALESCE(SUM(total_price), 0) as revenue, COUNT(*) as salesCount, AVG(total_price) as avgTicket FROM sales WHERE 1=1 ${dateFilter}`, params);
            const [costs] = await db.query(`SELECT COALESCE(SUM(i.cost * sd.quantity), 0) as totalCost FROM sale_details sd JOIN sales s ON sd.sale_id = s.id JOIN inventory i ON sd.product_id = i.id WHERE 1=1 ${dateFilter.replace('sale_date', 's.sale_date')}`, params);
            const [items] = await db.query(`SELECT COALESCE(SUM(sd.quantity), 0) as totalItems FROM sale_details sd JOIN sales s ON sd.sale_id = s.id WHERE 1=1 ${dateFilter.replace('sale_date', 's.sale_date')}`, params);
            const [inventoryStats] = await db.query(`SELECT COUNT(*) as lowStockCount, SUM(stock * price) as totalValue FROM inventory`);
            const [topProducts] = await db.query(`SELECT i.product_name, SUM(sd.quantity) as totalSold, SUM(sd.subtotal) as totalRevenue FROM sale_details sd JOIN sales s ON sd.sale_id = s.id JOIN inventory i ON sd.product_id = i.id WHERE 1=1 ${dateFilter.replace('sale_date', 's.sale_date')} GROUP BY i.id ORDER BY totalSold DESC LIMIT 5`, params);
            const [topClients] = await db.query(`SELECT c.name, COUNT(s.id) as purchases, SUM(s.total_price) as total FROM sales s JOIN clients c ON s.client_id = c.id WHERE 1=1 ${dateFilter} GROUP BY c.id ORDER BY total DESC LIMIT 5`, params);
            const [salesByDay] = await db.query(`SELECT DATE(sale_date) as date, SUM(total_price) as total, COUNT(*) as count FROM sales WHERE 1=1 ${dateFilter} GROUP BY DATE(sale_date) ORDER BY date ASC`, params);

            // --- 2. DIBUJAR RESUMEN EJECUTIVO (PÁGINA 1) ---
            doc.fontSize(12).font('Helvetica-Bold').text('Resumen Ejecutivo del Periodo');
            doc.moveDown(0.5);

            const revenue = totals[0].revenue;
            const cogs = costs[0].totalCost;
            const grossProfit = revenue - cogs;
            const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

            // Caja de Rentabilidad
            let y = doc.y;
            doc.rect(50, y, 495, 60).fill('#f8f9fa').stroke('#e9ecef');
            doc.fillColor('#000');
            doc.fontSize(10).font('Helvetica-Bold').text('INGRESOS', 70, y + 10).text('COSTOS', 230, y + 10).text('GANANCIA BRUTA', 380, y + 10);
            doc.fontSize(14).font('Helvetica').text(formatCurrency(revenue), 70, y + 25).text(formatCurrency(cogs), 230, y + 25).text(formatCurrency(grossProfit), 380, y + 25);
            doc.fontSize(10).font('Helvetica-Bold').fillColor(margin < 0 ? 'red' : 'green').text(`${margin.toFixed(1)}% Margen`, 380, y + 45);
            y += 70;

            // Caja de Operaciones
            doc.rect(50, y, 495, 50).fill('#f8f9fa').stroke('#e9ecef');
            doc.fillColor('#000');
            doc.fontSize(10).font('Helvetica-Bold').text('TRANSACCIONES', 70, y + 10).text('TICKET PROMEDIO', 230, y + 10).text('UNIDADES VENDIDAS', 380, y + 10);
            doc.fontSize(14).font('Helvetica').text(totals[0].salesCount, 70, y + 25).text(formatCurrency(totals[0].avgTicket || 0), 230, y + 25).text(items[0].totalItems, 380, y + 25);
            y += 60;

            // Caja de Inventario (Snapshot)
            doc.rect(50, y, 495, 50).fill('#f8f9fa').stroke('#e9ecef');
            doc.fillColor('#000');
            doc.fontSize(10).font('Helvetica-Bold').text('VALOR INVENTARIO', 70, y + 10).text('PRODUCTOS CON STOCK BAJO', 300, y + 10);
            doc.fontSize(14).font('Helvetica').text(formatCurrency(inventoryStats[0].totalValue || 0), 70, y + 25).text(inventoryStats[0].lowStockCount, 300, y + 25);

            // --- 3. DIBUJAR DESGLOSES ---
            // Usar control manual de Y para evitar páginas en blanco por moveDown
            let currentY = y + 60; // Espacio después de la caja de inventario

            const checkAddPage = (neededHeight) => {
                if (currentY + neededHeight > doc.page.height - 50) {
                    doc.addPage();
                    drawHeader();
                    currentY = doc.y;
                }
            };

            // Tabla Top 5 Productos
            checkAddPage(120); // Verificar espacio para título + tabla pequeña
            doc.fontSize(12).font('Helvetica-Bold').text('Top 5 Productos Vendidos', 50, currentY);
            currentY += 20;

            doc.rect(50, currentY, 495, 20).fill('#f0f0f0');
            doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
            doc.text('Producto', 60, currentY + 6).text('Unidades', 350, currentY + 6, {width: 80, align: 'center'}).text('Ingreso', 440, currentY + 6, {width: 90, align: 'right'});
            currentY += 25;
            
            doc.font('Helvetica');
            topProducts.forEach(p => {
                doc.text(p.product_name.substring(0, 40), 60, currentY).text(p.totalSold, 350, currentY, {width: 80, align: 'center'}).text(formatCurrency(p.totalRevenue), 440, currentY, {width: 90, align: 'right'});
                currentY += 15;
            });
            
            currentY += 20; // Espacio entre tablas

            // Tabla Top 5 Clientes
            checkAddPage(120);
            doc.fontSize(12).font('Helvetica-Bold').text('Top 5 Clientes', 50, currentY);
            currentY += 20;

            doc.rect(50, currentY, 495, 20).fill('#f0f0f0');
            doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
            doc.text('Cliente', 60, currentY + 6).text('Compras', 350, currentY + 6, {width: 80, align: 'center'}).text('Total Gastado', 440, currentY + 6, {width: 90, align: 'right'});
            currentY += 25;
            
            doc.font('Helvetica');
            topClients.forEach(c => {
                doc.text(c.name.substring(0, 30), 60, currentY).text(c.purchases, 350, currentY, {width: 80, align: 'center'}).text(formatCurrency(c.total), 440, currentY, {width: 90, align: 'right'});
                currentY += 15;
            });
            
            currentY += 20;

            // Tabla Desglose Diario
            checkAddPage(60);
            doc.fontSize(12).font('Helvetica-Bold').text('Desglose de Ventas por Día', 50, currentY);
            currentY += 20;
            
            doc.rect(50, currentY, 495, 20).fill('#f0f0f0');
            doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
            doc.text('Fecha', 60, currentY + 6).text('Transacciones', 350, currentY + 6, {width: 80, align: 'center'}).text('Total Vendido', 440, currentY + 6, {width: 90, align: 'right'});
            currentY += 25;
            
            doc.font('Helvetica');
            salesByDay.forEach(s => {
                if (currentY > doc.page.height - 50) {
                    doc.addPage();
                    drawHeader();
                    currentY = doc.y;
                    
                    // Redibujar encabezado en nueva página
                    doc.rect(50, currentY, 495, 20).fill('#f0f0f0');
                    doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
                    doc.text('Fecha', 60, currentY + 6).text('Transacciones', 350, currentY + 6, {width: 80, align: 'center'}).text('Total Vendido', 440, currentY + 6, {width: 90, align: 'right'});
                    currentY += 25;
                    doc.font('Helvetica');
                }
                const dateStr = new Date(s.date).toLocaleDateString('es-CO', { timeZone: 'UTC' });
                doc.text(dateStr, 60, currentY).text(s.count, 350, currentY, {width: 80, align: 'center'}).text(formatCurrency(s.total), 440, currentY, {width: 90, align: 'right'});
                currentY += 15;
            });

            // Actualizar cursor final
            doc.y = currentY;
        }

        // --- PIE DE PÁGINA (Copyright y Paginación) ---
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).fillColor('#666666');
            
            // Línea separadora footer
            doc.moveTo(50, doc.page.height - 50).lineTo(545, doc.page.height - 50).strokeColor('#cccccc').stroke();
            
            doc.text(`Generado el ${new Date().toLocaleString('es-CO')}`, 50, doc.page.height - 40);
            doc.text(`Página ${i + 1} de ${range.count}`, 0, doc.page.height - 40, { align: 'center' });
            doc.text('© Business Control System', 0, doc.page.height - 40, { align: 'right' });
        }

        doc.end();

    } catch (error) {
        console.error(error);
        res.status(500).send('Error generando PDF');
    }
});

module.exports = router;