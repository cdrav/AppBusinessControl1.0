const express = require('express');
const router = express.Router();
const db = require('../config/db');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { sendDailySummaryEmail, isEmailConfigured } = require('../services/emailService');

// Estadísticas del Dashboard
router.get('/dashboard-stats', authenticateToken, async (req, res) => {
    try {
        const { period, branch_id } = req.query;
        let whereClauses = [];
        let queryParams = [req.user.tenant_id];

        whereClauses.push("tenant_id = ?");

        // --- Construcción de filtros ---
        let groupBy = "GROUP BY DATE(sale_date)";
        let selectDate = "DATE(sale_date) as date";
        
        if (period === 'month') {
            whereClauses.push("sale_date >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')");
        } else if (period === 'year') {
            whereClauses.push("sale_date >= DATE_FORMAT(NOW(), '%Y-01-01 00:00:00')");
            groupBy = "GROUP BY YEAR(sale_date), MONTH(sale_date)";
            selectDate = "DATE_FORMAT(sale_date, '%Y-%m-01') as date";
        } else if (/^\d{4}$/.test(period)) {
            whereClauses.push(`YEAR(sale_date) = ?`);
            queryParams.push(period);
            groupBy = "GROUP BY MONTH(sale_date)";
            selectDate = "DATE_FORMAT(sale_date, '%Y-%m-01') as date";
        } else {
            whereClauses.push("sale_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
        }

        if (branch_id) {
            whereClauses.push("branch_id = ?");
            queryParams.push(branch_id);
        }

        const salesWhereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // 1. Ingresos Totales (filtrado)
        const [revenue] = await db.query(`SELECT COALESCE(SUM(total_price), 0) as total FROM sales ${salesWhereClause}`, queryParams);
        
        // 1.1 Desglose Efectivo vs Crédito
        const cashWhere = salesWhereClause ? `${salesWhereClause} AND is_credit = 0` : "WHERE is_credit = 0";
        const creditWhereSales = salesWhereClause ? `${salesWhereClause} AND is_credit = 1` : "WHERE is_credit = 1";
        
        const [cashRevenue] = await db.query(`SELECT COALESCE(SUM(total_price), 0) as total FROM sales ${cashWhere}`, queryParams);
        const [creditRevenue] = await db.query(`SELECT COALESCE(SUM(total_price), 0) as total FROM sales ${creditWhereSales}`, queryParams);
        
        // 2. Total Ventas (filtrado)
        const [salesCount] = await db.query(`SELECT COUNT(*) as total FROM sales ${salesWhereClause}`, queryParams);

        // 3. Tendencia de Ventas para el Gráfico (filtrado)
        const [salesTrend] = await db.query(`
            SELECT ${selectDate}, SUM(total_price) as total 
            FROM sales 
            ${salesWhereClause}
            ${groupBy}
            ORDER BY date ASC
        `, queryParams);

        // 4. Productos Top (filtrado)
        const [topProducts] = await db.query(`
            SELECT i.product_name, SUM(sd.quantity) as totalSold
            FROM sale_details sd
            JOIN sales s ON sd.sale_id = s.id
            JOIN inventory i ON sd.product_id = i.id
            ${salesWhereClause.replace(/tenant_id/g, 's.tenant_id').replace(/branch_id/g, 's.branch_id').replace(/sale_date/g, 's.sale_date')}
            GROUP BY i.id
            ORDER BY totalSold DESC
            LIMIT 5
        `, queryParams);

        // NUEVO: Obtener gastos totales y su tendencia para el periodo
        const expensesWhereClauses = whereClauses.map(c => c.replace('sale_date', 'expense_date'));
        const expensesWhereClause = expensesWhereClauses.length > 0 ? `WHERE ${expensesWhereClauses.join(' AND ')}` : '';
        
        const [expenses] = await db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses ${expensesWhereClause}`, queryParams);

        // NUEVO: Cartera Pendiente (Total de deudas activas)
        let creditsWhere = "WHERE tenant_id = ? AND status = 'active'";
        let creditsParams = [req.user.tenant_id];
        if (branch_id) {
            creditsWhere += " AND sale_id IN (SELECT id FROM sales WHERE branch_id = ?)";
            creditsParams.push(branch_id);
        }
        const [credits] = await db.query(`SELECT COALESCE(SUM(remaining_balance), 0) as totalDebt FROM credits ${creditsWhere}`, creditsParams);

        const [expensesTrend] = await db.query(`
            SELECT ${selectDate.replace('sale_date', 'expense_date')}, SUM(amount) as total 
            FROM expenses 
            ${expensesWhereClause}
            ${groupBy.replaceAll('sale_date', 'expense_date')}
            ORDER BY date ASC
        `, queryParams);


        // 5. Datos de tarjetas (dependen de si hay filtro de sede o no)
        let clients, products, lowStock;

        if (branch_id) {
            // Datos específicos de la sede
            [clients] = await db.query(`SELECT COUNT(DISTINCT client_id) as total FROM sales WHERE branch_id = ? AND tenant_id = ?`, [branch_id, req.user.tenant_id]);
            [products] = await db.query('SELECT SUM(stock) as total FROM branch_stocks WHERE branch_id = ? AND tenant_id = ?', [branch_id, req.user.tenant_id]);
            [lowStock] = await db.query('SELECT COUNT(*) as total FROM branch_stocks WHERE stock < 5 AND branch_id = ? AND tenant_id = ?', [branch_id, req.user.tenant_id]);
        } else {
            // Datos globales
            [clients] = await db.query('SELECT COUNT(*) as total FROM clients WHERE tenant_id = ?', [req.user.tenant_id]);
            [products] = await db.query('SELECT SUM(stock) as total FROM inventory WHERE tenant_id = ?', [req.user.tenant_id]);
            [lowStock] = await db.query('SELECT COUNT(*) as total FROM inventory WHERE stock < 5 AND tenant_id = ?', [req.user.tenant_id]);
        }
        
        // Actividad Reciente (últimas 5 acciones globales)
        let recentActivityWhere = ["s.tenant_id = ?"];
        let recentActivityParams = [req.user.tenant_id];
        if (branch_id) {
            recentActivityWhere.push("s.branch_id = ?");
            recentActivityParams.push(branch_id);
        }
        const [recentSales] = await db.query(`
            SELECT 'sale' as type, c.name as text, total_price as value, sale_date as date 
            FROM sales s LEFT JOIN clients c ON s.client_id = c.id 
            ${recentActivityWhere.length > 0 ? `WHERE ${recentActivityWhere.join(' AND ')}` : ''}
            ORDER BY sale_date DESC LIMIT 5
        `, recentActivityParams);
        
        // Productos estancados (sin ventas en 30 días) - Global
        const [staleProducts] = await db.query(`
            SELECT i.id, i.product_name, MAX(s.sale_date) as last_sale_date
            FROM inventory i
            LEFT JOIN sale_details sd ON i.id = sd.product_id AND sd.tenant_id = i.tenant_id
            LEFT JOIN sales s ON sd.sale_id = s.id
            WHERE i.tenant_id = ?
            GROUP BY i.id, i.product_name
            HAVING last_sale_date < DATE_SUB(NOW(), INTERVAL 30 DAY) OR last_sale_date IS NULL
            LIMIT 5
        `, [req.user.tenant_id]);

        // Clientes inactivos (sin compras en 60 días) - Global
        const [inactiveClients] = await db.query(`
            SELECT c.name, c.email, c.phone, MAX(s.sale_date) as last_purchase
            FROM clients c
            JOIN sales s ON c.id = s.client_id
            WHERE c.tenant_id = ?
            GROUP BY c.id, c.name, c.email, c.phone
            HAVING last_purchase < DATE_SUB(NOW(), INTERVAL 60 DAY)
            LIMIT 5
        `, [req.user.tenant_id]);
        
        // NUEVO: Top Clientes Morosos (con saldo pendiente)
        const [topDelinquentClients] = await db.query(`
            SELECT 
                cl.id as client_id,
                cl.name as client_name,
                cl.email,
                cl.phone,
                SUM(c.remaining_balance) as total_debt
            FROM credits c
            JOIN clients cl ON c.client_id = cl.id
            WHERE c.tenant_id = ? AND c.status = 'active'
            GROUP BY cl.id, cl.name, cl.email, cl.phone
            ORDER BY total_debt DESC
            LIMIT 5
        `, [req.user.tenant_id]);

        // NUEVO: Rendimiento de Cobradores (Hoy)
        const [collectorPerformance] = await db.query(`
            SELECT 
                u.username as collector_name,
                COUNT(cp.id) as collections_count,
                COALESCE(SUM(cp.amount), 0) as amount_collected,
                (SELECT MAX(created_at) FROM audit_logs WHERE user_id = u.id AND action = 'ROUTE_CLOSURE' AND DATE(created_at) = CURDATE()) as closed_at
            FROM users u
            LEFT JOIN credit_payments cp ON cp.collector_id = u.id AND DATE(cp.payment_date) = CURDATE()
            WHERE u.tenant_id = ? AND u.role = 'cobrador'
            GROUP BY u.id
            ORDER BY amount_collected DESC
        `, [req.user.tenant_id]);

        res.json({
            totalRevenue: revenue[0].total,
            cashRevenue: cashRevenue[0].total,
            creditRevenue: creditRevenue[0].total,
            totalExpenses: expenses[0].total,
            totalCredits: credits[0].totalDebt, // Enviamos el total de cartera
            totalSales: salesCount[0].total,
            totalClients: clients[0].total,
            totalProducts: products[0].total,
            lowStockCount: lowStock[0].total,
            salesTrend,
            expensesTrend,
            topProducts,
            recentActivity: recentSales,
            staleProducts, // Productos sin ventas en 30 días
            inactiveClients, // Clientes sin compras en 60 días
            topDelinquentClients, // Clientes con mayor deuda pendiente
            collectorPerformance // Datos de monitoreo de cobradores
        });

    } catch (error) {
        console.error('Error en dashboard-stats:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// Resumen Diario (para el modal de cierre de caja)
router.get('/daily-summary', authenticateToken, async (req, res) => {
    const { date, branch_id } = req.query;
    if (!date) return res.status(400).json({ message: 'Fecha requerida' });

    let targetBranchId = branch_id;

    // Seguridad: Si no es admin, forzar su propia sede
    if (req.user.role !== 'admin') {
        targetBranchId = req.user.branch_id;
    }

    let whereClause = "WHERE DATE(sale_date) = ?";
    let expenseWhereClause = "WHERE DATE(expense_date) = ?";
    const params = [date];
    const expenseParams = [date];

    if (targetBranchId) {
        whereClause += " AND branch_id = ?";
        expenseWhereClause += " AND branch_id = ?";
        params.push(targetBranchId);
        expenseParams.push(targetBranchId);
    }

    try {
        // Total ventas (todas)
        const [summary] = await db.query(`SELECT COALESCE(SUM(total_price), 0) as totalRevenue, COUNT(*) as totalSales FROM sales ${whereClause}`, params);
        
        // Ventas de contado (is_credit = 0)
        const [cashSales] = await db.query(`SELECT COALESCE(SUM(total_price), 0) as totalCash FROM sales ${whereClause} AND is_credit = 0`, params);
        
        // Ventas a crédito (is_credit = 1)
        const [creditSales] = await db.query(`SELECT COALESCE(SUM(total_price), 0) as totalCredit FROM sales ${whereClause} AND is_credit = 1`, params);
        
        // Gastos
        const [dailyExpenses] = await db.query(`SELECT COALESCE(SUM(amount), 0) as totalExpenses FROM expenses ${expenseWhereClause}`, expenseParams);
        
        // Calcular efectivo neto: Ventas contado - Gastos
        const netCash = parseFloat(cashSales[0].totalCash || 0) - parseFloat(dailyExpenses[0].totalExpenses || 0);
        
        res.json({ 
            totalRevenue: summary[0].totalRevenue,
            totalSales: summary[0].totalSales,
            totalCash: cashSales[0].totalCash,
            totalCredit: creditSales[0].totalCredit,
            totalExpenses: dailyExpenses[0].totalExpenses,
            netCash: netCash
        });
    } catch (error) {
        console.error('Error en daily-summary:', error);
        res.status(500).json({ message: 'Error al obtener resumen diario' });
    }
});

// Generar Reportes Avanzados (Para reportes.html)
router.post('/generate', authenticateToken, async (req, res) => {
    const { startDate, endDate, type } = req.body;
    
    try {
        let dateFilter = "";
        const params = [req.user.tenant_id];
        
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
                WHERE tenant_id = ? ${dateFilter} 
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
                WHERE i.tenant_id = ? ${dateFilter.replace('sale_date', 's.sale_date')}
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
                WHERE s.tenant_id = ? ${dateFilter}
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
                WHERE tenant_id = ? ${dateFilter}
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
            WHERE tenant_id = ? ${dateFilter}
        `, params);
        
        // Total de productos (stock actual, no depende de fechas de venta)
        const [products] = await db.query('SELECT SUM(stock) as total FROM inventory WHERE tenant_id = ?', [req.user.tenant_id]);
        
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
        const [settings] = await db.query('SELECT * FROM settings WHERE tenant_id = ?', [req.user.tenant_id]);
        const config = settings[0] || { company_name: 'Business Control', company_address: '', company_phone: '', company_email: '' };

        // 2. Obtener datos según tipo de reporte
        const params = [req.user.tenant_id];
        let dateFilter = '';
        if (startDate && endDate) {
            dateFilter = 'AND sale_date BETWEEN ? AND ?';
            params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        let salesData = [], expensesData = [], inventoryData = [], clientsData = [];

        if (['sales', 'profits', 'complete'].includes(type)) {
            const [rows] = await db.query(`
                SELECT s.id, s.sale_date, s.total_price, s.is_credit, c.name as client_name
                FROM sales s LEFT JOIN clients c ON s.client_id = c.id
                WHERE s.tenant_id = ? ${dateFilter}
                ORDER BY s.sale_date DESC
            `, params);
            salesData = rows;
        }

        if (['profits', 'complete'].includes(type)) {
            const expParams = [req.user.tenant_id];
            let expDateFilter = '';
            if (startDate && endDate) {
                expDateFilter = 'AND expense_date BETWEEN ? AND ?';
                expParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
            }
            const [rows] = await db.query(`
                SELECT description, amount, category, expense_date
                FROM expenses WHERE tenant_id = ? ${expDateFilter}
                ORDER BY expense_date DESC
            `, expParams);
            expensesData = rows;
        }

        if (['inventory', 'complete'].includes(type)) {
            const [rows] = await db.query(`
                SELECT product_name, stock, price, cost, category
                FROM inventory WHERE tenant_id = ? ORDER BY product_name ASC
            `, [req.user.tenant_id]);
            inventoryData = rows;
        }

        if (['clients', 'complete'].includes(type)) {
            const cliParams = startDate && endDate
                ? [`${startDate} 00:00:00`, `${endDate} 23:59:59`, req.user.tenant_id]
                : [req.user.tenant_id];
            const cliDateJoin = startDate && endDate ? 'AND s.sale_date BETWEEN ? AND ?' : '';
            const [rows] = await db.query(`
                SELECT c.name, c.email, c.phone,
                       COUNT(s.id) as total_purchases,
                       COALESCE(SUM(s.total_price), 0) as total_spent
                FROM clients c
                LEFT JOIN sales s ON c.id = s.client_id ${cliDateJoin}
                WHERE c.tenant_id = ?
                GROUP BY c.id ORDER BY total_spent DESC
            `, cliParams);
            clientsData = rows;
        }

        // 3. Configurar Documento PDF
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        doc.pipe(res);

        // --- FUNCIONES AUXILIARES ---
        const formatCurrency = (amount) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);

        let title = 'Reporte General';
        if (type === 'sales') title = 'Reporte de Ventas';
        else if (type === 'profits') title = 'Reporte de Ganancias';
        else if (type === 'inventory') title = 'Reporte de Inventario';
        else if (type === 'clients') title = 'Reporte de Clientes';
        else if (type === 'complete') title = 'Reporte Completo';
        const period = startDate && endDate ? `${startDate}  al  ${endDate}` : 'Todos los registros';

        const drawHeader = () => {
            doc.fillColor('#000');
            if (config.company_logo) {
                const logoPath = path.join(__dirname, '../public', config.company_logo);
                if (fs.existsSync(logoPath)) {
                    try { doc.image(logoPath, 50, 45, { width: 60 }); } catch (e) { /* logo no válido */ }
                }
            }
            const textX = config.company_logo ? 120 : 50;
            doc.fontSize(18).font('Helvetica-Bold').text(config.company_name, textX, 50, { lineBreak: false });
            doc.fontSize(9).font('Helvetica').text(config.company_address || '', textX, 75, { lineBreak: false });
            doc.fontSize(9).text(`Tel: ${config.company_phone || 'N/A'} | Email: ${config.company_email || 'N/A'}`, textX, 88, { lineBreak: false });
            doc.y = 115;
            doc.fontSize(14).font('Helvetica-Bold').text(title, 50, doc.y, { align: 'center', width: 495, lineBreak: false });
            doc.y += 20;
            doc.fontSize(9).font('Helvetica').fillColor('#666').text(`Período: ${period}`, 50, doc.y, { align: 'center', width: 495, lineBreak: false });
            doc.fillColor('#000');
            doc.y += 15;
            doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
            doc.y += 15;
        };

        const generateFooter = (docRef, currentPage, totalPages) => {
            docRef.fontSize(8).fillColor('#666666');
            docRef.moveTo(50, docRef.page.height - 50).lineTo(545, docRef.page.height - 50).strokeColor('#cccccc').stroke();
            docRef.text(`Generado el ${new Date().toLocaleString('es-CO')}`, 50, docRef.page.height - 40, { lineBreak: false });
            docRef.text(`Página ${currentPage} de ${totalPages}`, 0, docRef.page.height - 40, { align: 'center', width: 595, lineBreak: false });
            docRef.text(' Business Control System', 0, docRef.page.height - 40, { align: 'right', width: 545, lineBreak: false });
        };

        const PAGE_BOTTOM = 750;

        const checkAddPage = (neededHeight) => {
            if (doc.y + neededHeight > PAGE_BOTTOM) {
                doc.addPage();
                drawHeader();
                return true;
            }
            return false;
        };

        // Función para dibujar encabezado de tabla
        const drawTableHeader = (columns) => {
            const y = doc.y;
            doc.rect(50, y, 495, 20).fill('#f0f4f8');
            doc.fillColor('#333').fontSize(8).font('Helvetica-Bold');
            columns.forEach(col => {
                doc.text(col.label, col.x + 5, y + 5, { lineBreak: false, width: col.width || 80 });
            });
            doc.y = y + 25;
            doc.font('Helvetica').fontSize(8).fillColor('#000');
        };

        // Dibujar header en la primera página
        drawHeader();

        // ============================================================
        // SECCIÓN DE VENTAS
        // ============================================================
        if (['sales', 'profits', 'complete'].includes(type) && salesData.length > 0) {
            checkAddPage(80);
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#2563eb').text('Detalle de Ventas', 50, doc.y, { lineBreak: false });
            doc.fillColor('#000');
            doc.y += 18;

            const totalSalesAmount = salesData.reduce((sum, s) => sum + parseFloat(s.total_price || 0), 0);
            doc.fontSize(9).font('Helvetica').text(`Total: ${salesData.length} ventas  |  Monto: ${formatCurrency(totalSalesAmount)}`, 50, doc.y, { lineBreak: false });
            doc.y += 18;

            const sCols = [
                { label: 'ID', x: 50, width: 40 },
                { label: 'Fecha', x: 100, width: 80 },
                { label: 'Cliente', x: 200, width: 160 },
                { label: 'Monto', x: 380, width: 80 },
                { label: 'Tipo', x: 470, width: 70 }
            ];
            drawTableHeader(sCols);

            for (let idx = 0; idx < salesData.length; idx++) {
                const sale = salesData[idx];
                if (checkAddPage(22)) { drawTableHeader(sCols); }
                const rowY = doc.y;
                if (idx % 2 === 0) { doc.rect(50, rowY, 495, 18).fill('#fafbfc'); doc.fillColor('#000'); }
                const d = new Date(sale.sale_date).toLocaleDateString('es-CO');
                doc.text(`#${sale.id}`, 55, rowY + 4, { lineBreak: false });
                doc.text(d, 105, rowY + 4, { lineBreak: false });
                doc.text((sale.client_name || 'Sin cliente').substring(0, 28), 205, rowY + 4, { lineBreak: false });
                doc.text(formatCurrency(sale.total_price), 385, rowY + 4, { lineBreak: false });
                doc.text(sale.is_credit ? 'Crédito' : 'Contado', 475, rowY + 4, { lineBreak: false });
                doc.y = rowY + 20;
            }
            doc.y += 10;
        }

        // ============================================================
        // SECCIÓN DE GASTOS
        // ============================================================
        if (['profits', 'complete'].includes(type) && expensesData.length > 0) {
            checkAddPage(80);
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#dc3545').text('Detalle de Gastos', 50, doc.y, { lineBreak: false });
            doc.fillColor('#000');
            doc.y += 18;

            const totalExpAmount = expensesData.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
            doc.fontSize(9).font('Helvetica').text(`Total: ${expensesData.length} gastos  |  Monto: ${formatCurrency(totalExpAmount)}`, 50, doc.y, { lineBreak: false });
            doc.y += 18;

            const eCols = [
                { label: 'Descripción', x: 50, width: 180 },
                { label: 'Monto', x: 250, width: 80 },
                { label: 'Categoría', x: 340, width: 100 },
                { label: 'Fecha', x: 450, width: 90 }
            ];
            drawTableHeader(eCols);

            for (let idx = 0; idx < expensesData.length; idx++) {
                const exp = expensesData[idx];
                if (checkAddPage(22)) { drawTableHeader(eCols); }
                const rowY = doc.y;
                if (idx % 2 === 0) { doc.rect(50, rowY, 495, 18).fill('#fafbfc'); doc.fillColor('#000'); }
                const d = exp.expense_date ? new Date(exp.expense_date).toLocaleDateString('es-CO') : 'N/A';
                doc.text((exp.description || '').substring(0, 30), 55, rowY + 4, { lineBreak: false });
                doc.text(formatCurrency(exp.amount), 255, rowY + 4, { lineBreak: false });
                doc.text((exp.category || 'N/A').substring(0, 15), 345, rowY + 4, { lineBreak: false });
                doc.text(d, 455, rowY + 4, { lineBreak: false });
                doc.y = rowY + 20;
            }

            // Resumen de ganancias
            if (type === 'profits' || type === 'complete') {
                doc.y += 10;
                checkAddPage(70);
                const totalSales = salesData.reduce((sum, s) => sum + parseFloat(s.total_price || 0), 0);
                doc.rect(50, doc.y, 495, 55).fill('#f8f9fa').stroke('#dee2e6');
                const boxY = doc.y;
                doc.fillColor('#000').fontSize(10).font('Helvetica-Bold');
                doc.text(`Ingresos por ventas: ${formatCurrency(totalSales)}`, 65, boxY + 8, { lineBreak: false });
                doc.fillColor('#dc3545').text(`Gastos totales: ${formatCurrency(totalExpAmount)}`, 65, boxY + 22, { lineBreak: false });
                const profit = totalSales - totalExpAmount;
                doc.fillColor(profit >= 0 ? '#28a745' : '#dc3545').fontSize(11);
                doc.text(`Ganancia Neta: ${formatCurrency(profit)}`, 65, boxY + 38, { lineBreak: false });
                doc.fillColor('#000');
                doc.y = boxY + 65;
            }
            doc.y += 10;
        }

        // ============================================================
        // SECCIÓN DE INVENTARIO
        // ============================================================
        if (['inventory', 'complete'].includes(type) && inventoryData.length > 0) {
            checkAddPage(80);
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#28a745').text('Inventario', 50, doc.y, { lineBreak: false });
            doc.fillColor('#000');
            doc.y += 18;

            const totalValue = inventoryData.reduce((sum, p) => sum + (parseFloat(p.price || 0) * (p.stock || 0)), 0);
            const totalItems = inventoryData.reduce((sum, p) => sum + (p.stock || 0), 0);
            doc.fontSize(9).font('Helvetica').text(`Productos: ${inventoryData.length}  |  Unidades: ${totalItems}  |  Valor: ${formatCurrency(totalValue)}`, 50, doc.y, { lineBreak: false });
            doc.y += 18;

            const iCols = [
                { label: 'Producto', x: 50, width: 150 },
                { label: 'Categoría', x: 210, width: 90 },
                { label: 'Stock', x: 310, width: 50 },
                { label: 'Precio', x: 370, width: 75 },
                { label: 'Valor Total', x: 455, width: 85 }
            ];
            drawTableHeader(iCols);

            for (let idx = 0; idx < inventoryData.length; idx++) {
                const p = inventoryData[idx];
                if (checkAddPage(22)) { drawTableHeader(iCols); }
                const rowY = doc.y;
                if (idx % 2 === 0) { doc.rect(50, rowY, 495, 18).fill('#fafbfc'); doc.fillColor('#000'); }
                if (p.stock <= 5) { doc.fillColor('#dc3545'); }
                doc.text((p.product_name || '').substring(0, 22), 55, rowY + 4, { lineBreak: false });
                doc.text((p.category || 'N/A').substring(0, 14), 215, rowY + 4, { lineBreak: false });
                doc.text(String(p.stock || 0), 315, rowY + 4, { lineBreak: false });
                doc.text(formatCurrency(p.price), 375, rowY + 4, { lineBreak: false });
                doc.text(formatCurrency((p.price || 0) * (p.stock || 0)), 460, rowY + 4, { lineBreak: false });
                doc.fillColor('#000');
                doc.y = rowY + 20;
            }
            doc.y += 10;
        }

        // ============================================================
        // SECCIÓN DE CLIENTES
        // ============================================================
        if (['clients', 'complete'].includes(type) && clientsData.length > 0) {
            checkAddPage(80);
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffc107').text('Clientes', 50, doc.y, { lineBreak: false });
            doc.fillColor('#000');
            doc.y += 18;

            doc.fontSize(9).font('Helvetica').text(`Total de clientes: ${clientsData.length}`, 50, doc.y, { lineBreak: false });
            doc.y += 18;

            const cCols = [
                { label: 'Nombre', x: 50, width: 120 },
                { label: 'Email', x: 175, width: 130 },
                { label: 'Teléfono', x: 315, width: 85 },
                { label: 'Compras', x: 410, width: 45 },
                { label: 'Total Gastado', x: 460, width: 80 }
            ];
            drawTableHeader(cCols);

            for (let idx = 0; idx < clientsData.length; idx++) {
                const c = clientsData[idx];
                if (checkAddPage(22)) { drawTableHeader(cCols); }
                const rowY = doc.y;
                if (idx % 2 === 0) { doc.rect(50, rowY, 495, 18).fill('#fafbfc'); doc.fillColor('#000'); }
                doc.text((c.name || '').substring(0, 18), 55, rowY + 4, { lineBreak: false });
                doc.text((c.email || 'N/A').substring(0, 22), 180, rowY + 4, { lineBreak: false });
                doc.text((c.phone || 'N/A').substring(0, 13), 320, rowY + 4, { lineBreak: false });
                doc.text(String(c.total_purchases || 0), 415, rowY + 4, { lineBreak: false });
                doc.text(formatCurrency(c.total_spent), 465, rowY + 4, { lineBreak: false });
                doc.y = rowY + 20;
            }
            doc.y += 10;
        }

        // ============================================================
        // FOOTER
        // ============================================================
        const range = doc.bufferedPageRange();
        const totalPages = range.count;
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            generateFooter(doc, i + 1, totalPages);
        }

        doc.end();

    } catch (error) {
        console.error('Error generando reporte PDF:', error);
        if (!res.headersSent) {
            res.status(500).send('Error generando PDF');
        }
    }
});

// NUEVO ENDPOINT PARA ESTADÍSTICAS DE SEDES
router.get('/branch-stats', authenticateToken, async (req, res) => {
    // Solo para administradores
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado' });
    }

    try {
        // 1. Obtener todas las sedes activas
        const [branches] = await db.query('SELECT id, name, address FROM branches WHERE is_active = true ORDER BY id ASC');

        // 2. Obtener ventas agregadas por sede
        const [salesStats] = await db.query(`
            SELECT 
                branch_id, 
                COALESCE(SUM(total_price), 0) as totalRevenue, 
                COUNT(id) as totalSales 
            FROM sales 
            WHERE branch_id IS NOT NULL
            GROUP BY branch_id
        `);

        // 3. Obtener inventario agregado por sede
        const [inventoryStats] = await db.query(`
            SELECT 
                branch_id, 
                COALESCE(SUM(stock), 0) as totalStock,
                COUNT(product_id) as uniqueProducts
            FROM branch_stocks
            GROUP BY branch_id
        `);

        // 4. Combinar los datos en un solo objeto por sede
        const combinedStats = branches.map(branch => {
            const sale = salesStats.find(s => s.branch_id === branch.id) || { totalRevenue: 0, totalSales: 0 };
            const inventory = inventoryStats.find(i => i.branch_id === branch.id) || { totalStock: 0, uniqueProducts: 0 };
            return { ...branch, ...sale, ...inventory };
        });

        res.json(combinedStats);
    } catch (error) {
        console.error('Error en /api/branch-stats:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener estadísticas de sedes' });
    }
});

// Enviar resumen diario por correo
router.post('/send-daily-summary', authenticateToken, async (req, res) => {
    try {
        const { date } = req.body;
        if (!date) {
            return res.status(400).json({ message: 'Fecha requerida' });
        }

        // Obtener email de la empresa desde settings
        const [settings] = await db.query('SELECT company_email FROM settings WHERE tenant_id = ?', [req.user.tenant_id]);
        const recipientEmail = settings[0]?.company_email;
        
        if (!recipientEmail) {
            return res.status(400).json({ 
                message: 'No hay correo configurado. Configure el correo de la empresa en Configuración > Datos de la Empresa.' 
            });
        }

        const result = await sendDailySummaryEmail(date, recipientEmail);
        res.json({ message: result });
    } catch (error) {
        console.error('Error enviando resumen por correo:', error);
        res.status(500).json({ message: error.message || 'Error al enviar el correo' });
    }
});

module.exports = router;