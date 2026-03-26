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
        const { period, branch_id } = req.query;
        let whereClauses = [];
        let queryParams = [];

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
            ${salesWhereClause.replace('branch_id', 's.branch_id').replace('sale_date', 's.sale_date')}
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
            ${groupBy.replace('sale_date', 'expense_date')}
            ORDER BY date ASC
        `, queryParams);


        // 5. Datos de tarjetas (dependen de si hay filtro de sede o no)
        let clients, products, lowStock;

        if (branch_id) {
            // Datos específicos de la sede
            [clients] = await db.query(`SELECT COUNT(DISTINCT client_id) as total FROM sales WHERE branch_id = ?`, [branch_id]);
            [products] = await db.query('SELECT SUM(stock) as total FROM branch_stocks WHERE branch_id = ?', [branch_id]);
            [lowStock] = await db.query('SELECT COUNT(*) as total FROM branch_stocks WHERE stock < 5 AND branch_id = ?', [branch_id]);
        } else {
            // Datos globales
            [clients] = await db.query('SELECT COUNT(*) as total FROM clients');
            [products] = await db.query('SELECT SUM(stock) as total FROM inventory');
            [lowStock] = await db.query('SELECT COUNT(*) as total FROM inventory WHERE stock < 5');
        }
        
        // Actividad Reciente (últimas 5 acciones globales)
        let recentActivityWhere = [];
        let recentActivityParams = [];
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
            topDelinquentClients // Clientes con mayor deuda pendiente
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
        const [summary] = await db.query(`SELECT COALESCE(SUM(total_price), 0) as totalRevenue, COUNT(*) as totalSales FROM sales ${whereClause}`, params);
        const [dailyExpenses] = await db.query(`SELECT COALESCE(SUM(amount), 0) as totalExpenses FROM expenses ${expenseWhereClause}`, expenseParams);
        
        res.json({ ...summary[0], ...dailyExpenses[0] });
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

        // Función centralizada para controlar saltos de página
        const checkAddPage = (currentY, neededHeight) => {
            if (currentY + neededHeight > 730) { // Margen de seguridad antes del footer
                doc.addPage(); // Esto disparará el evento 'pageAdded' que dibuja el header principal
                return doc.y; // Retorna la nueva posición Y después del header principal
            }
            return currentY;
        };
        
        const generateFooter = (docInstance) => {
            const pageNumber = docInstance.bufferedPageRange().start + docInstance.bufferedPageRange().count -1;
            const totalPages = docInstance.bufferedPageRange().count;

            docInstance.fontSize(8).fillColor('#666666');
            
            // Línea separadora footer
            docInstance.moveTo(50, docInstance.page.height - 50).lineTo(545, docInstance.page.height - 50).strokeColor('#cccccc').stroke();
            
            docInstance.text(`Generado el ${new Date().toLocaleString('es-CO')}`, 50, docInstance.page.height - 40);
            docInstance.text(`Página ${pageNumber + 1} de ${totalPages}`, 0, docInstance.page.height - 40, { align: 'center' });
            docInstance.text('© Business Control System', 0, docInstance.page.height - 40, { align: 'right' });
        };

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

        // --- LÓGICA DE PAGINACIÓN POR EVENTOS (LA CORRECTA) ---
        doc.on('pageAdded', () => {
            drawHeader();
        });

        // Dibujar el encabezado en la primera página
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
                // Encabezado de tabla Ventas
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
                    const dateStr = new Date(sale.sale_date).toLocaleDateString('es-CO');
                    const clientStr = (sale.client_name || 'General').substring(0, 25);
                    const totalStr = formatCurrency(sale.total_price);
                    
                    // Calcular altura dinámica
                    const rowHeight = Math.max(doc.heightOfString(clientStr, { width: 190 }), 18);

                    const newY = checkAddPage(y, rowHeight + 5);
                    if (newY !== y) {
                        y = newY;
                        drawSalesTableHeader(y);
                        y += 25;
                    }

                    if (i % 2 === 0) doc.rect(50, y - 5, 495, rowHeight + 5).fill('#f9f9f9');
                    doc.fillColor('#000').font('Helvetica');
                    
                    doc.text(`#${sale.id}`, 60, y);
                    doc.text(dateStr, 120, y);
                    doc.text(clientStr, 250, y, { width: 190 });
                    doc.text(totalStr, 450, y, { align: 'right', width: 80 });
                    y += rowHeight + 5;
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
            
            // NUEVO: Obtener gastos del periodo
            const [expensesList] = await db.query(`
                SELECT description, amount, expense_date 
                FROM expenses 
                WHERE 1=1 ${dateFilter.replace('sale_date', 'expense_date')}
                ORDER BY expense_date ASC
            `, params);

            const drawProfitsHeader = (posY) => {
                doc.rect(50, posY, 495, 20).fill('#10B981'); // Verde
                doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
                doc.text('PRODUCTO', 55, posY + 6);
                doc.text('VENTA', 300, posY + 6, { width: 60, align: 'right' });
                doc.text('COSTO', 370, posY + 6, { width: 60, align: 'right' });
                doc.text('GANANCIA', 440, posY + 6, { width: 60, align: 'right' });
            };

            let y = doc.y;
            drawProfitsHeader(y);
            y += 25;

            let totalRevenue = 0, totalCost = 0;

            details.forEach((item, i) => {
                const productStr = (item.product_name || 'Producto Borrado').substring(0, 35);
                const rowHeight = Math.max(doc.heightOfString(productStr, { width: 240 }), 18);

                const newY = checkAddPage(y, rowHeight + 5);
                if (newY !== y) {
                    y = newY;
                    drawProfitsHeader(y);
                    y += 25;
                }

                if (i % 2 === 0) doc.rect(50, y - 5, 495, rowHeight + 5).fill('#f9f9f9');
                doc.fillColor('#000').font('Helvetica');

                const saleVal = parseFloat(item.sale_price);
                const costVal = parseFloat(item.total_cost || 0);
                const profitVal = saleVal - costVal;

                doc.text(productStr, 55, y, { width: 240 });
                doc.text(formatCurrency(saleVal), 300, y, { width: 60, align: 'right' });
                doc.text(formatCurrency(costVal), 370, y, { width: 60, align: 'right' });
                
                doc.fillColor(profitVal < 0 ? 'red' : 'green'); // Color condicional
                doc.text(formatCurrency(profitVal), 440, y, { width: 60, align: 'right' });

                totalRevenue += saleVal;
                totalCost += costVal;
                y += rowHeight + 5;
            });
            
            // NUEVO: Sección de Gastos en el PDF
            let totalExpenses = 0;
            if (expensesList.length > 0) {
                y = checkAddPage(y, 60);
                y += 20;
                doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text('GASTOS OPERATIVOS', 50, y);
                y += 20;

                const drawExpensesHeader = (posY) => {
                    doc.rect(50, posY, 495, 20).fill('#EF4444'); // Rojo para gastos
                    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
                    doc.text('DESCRIPCIÓN', 55, posY + 6);
                    doc.text('FECHA', 350, posY + 6);
                    doc.text('MONTO', 450, posY + 6, { width: 80, align: 'right' });
                };
                drawExpensesHeader(y);
                
                y += 25;
                
                expensesList.forEach((exp) => {
                    const descStr = exp.description.substring(0, 50);
                    const rowHeight = Math.max(doc.heightOfString(descStr, { width: 290 }), 18);

                    const newY = checkAddPage(y, rowHeight + 5);
                    if (newY !== y) {
                        y = newY;
                        drawExpensesHeader(y);
                        y += 25;
                    }
                    
                    doc.fillColor('#000').font('Helvetica');
                    doc.text(descStr, 55, y, { width: 290 });
                    doc.text(new Date(exp.expense_date).toLocaleDateString('es-CO'), 350, y);
                    doc.text(formatCurrency(exp.amount), 450, y, { width: 80, align: 'right' });
                    totalExpenses += parseFloat(exp.amount);
                    y += rowHeight + 5;
                });
            }

            y = checkAddPage(y, 80);
            y += 20;

            doc.font('Helvetica-Bold').fillColor('#000');
            doc.text(`Total Ventas: ${formatCurrency(totalRevenue)}`, 50, y, { align: 'right' });
            y += 15;
            doc.text(`Costo de Mercancía: -${formatCurrency(totalCost)}`, 50, y, { align: 'right' });
            y += 15;
            doc.text(`Gastos Operativos: -${formatCurrency(totalExpenses)}`, 50, y, { align: 'right' });
            y += 20;
            
            const netProfit = totalRevenue - totalCost - totalExpenses;
            doc.fontSize(14).fillColor(netProfit >= 0 ? 'green' : 'red').text(`Utilidad Neta Real: ${formatCurrency(netProfit)}`, 50, y, { align: 'right' });
        }

        // ==========================================
        // REPORTE DE INVENTARIO VALORIZADO
        // ==========================================
        if (type === 'inventory') {
            const [products] = await db.query('SELECT * FROM inventory ORDER BY product_name ASC');
            
            const drawInventoryHeader = (posY) => {
                doc.rect(50, posY, 495, 20).fill('#F59E0B'); // Naranja
                doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
                doc.text('PRODUCTO', 55, posY + 6);
                doc.text('STOCK', 320, posY + 6, { width: 40, align: 'center' });
                doc.text('PRECIO', 370, posY + 6, { width: 70, align: 'right' });
                doc.text('VALOR TOTAL', 450, posY + 6, { width: 80, align: 'right' });
            };

            let y = doc.y;
            drawInventoryHeader(y);
            y += 25;

            let totalValue = 0, totalItems = 0;

            products.forEach((p, i) => {
                const nameStr = p.product_name.substring(0, 40);
                const rowHeight = Math.max(doc.heightOfString(nameStr, { width: 260 }), 18);

                const newY = checkAddPage(y, rowHeight + 5);
                if (newY !== y) {
                    y = newY;
                    drawInventoryHeader(y);
                    y += 25;
                }

                if (i % 2 === 0) doc.rect(50, y - 5, 495, rowHeight + 5).fill('#f9f9f9');
                doc.fillColor('#000').font('Helvetica');

                const val = p.stock * p.price;
                totalValue += val;
                totalItems += p.stock;

                doc.text(nameStr, 55, y, { width: 260 });
                doc.text(p.stock, 320, y, { width: 40, align: 'center' });
                doc.text(formatCurrency(p.price), 370, y, { width: 70, align: 'right' });
                doc.text(formatCurrency(val), 450, y, { width: 80, align: 'right' });
                y += rowHeight + 5;
            });

            // Totales manuales
            y = checkAddPage(y, 50);
            y += 20;

            doc.font('Helvetica-Bold');
            doc.text(`Total Unidades: ${totalItems}`, 50, y, { align: 'right' });
            y += 15;
            doc.fontSize(12).text(`Valor del Inventario: ${formatCurrency(totalValue)}`, 50, y, { align: 'right' });
        }

        // ==========================================
        // REPORTE DE STOCK BAJO
        // ==========================================
        if (type === 'low-stock') {
            const [products] = await db.query('SELECT * FROM inventory WHERE stock < 5 ORDER BY stock ASC');
            
            if (products.length === 0) {
                doc.fontSize(12).text('¡Excelente! No hay productos con stock crítico.', { align: 'center' });
            } else {
                const drawLowStockHeader = (posY) => {
                    doc.rect(50, posY, 495, 20).fill('#EF4444'); // Rojo
                    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
                    doc.text('PRODUCTO', 55, posY + 6);
                    doc.text('STOCK ACTUAL', 400, posY + 6, { align: 'right' });
                };

                let y = doc.y;
                drawLowStockHeader(y);
                y += 25;

                products.forEach((p, i) => {
                    const nameStr = p.product_name;
                    const rowHeight = Math.max(doc.heightOfString(nameStr, { width: 340 }), 18);

                    const newY = checkAddPage(y, rowHeight + 5);
                    if (newY !== y) {
                        y = newY;
                        drawLowStockHeader(y);
                        y += 25;
                    }

                    if (i % 2 === 0) doc.rect(50, y - 5, 495, rowHeight + 5).fill('#f9f9f9');
                    doc.fillColor('#000').font('Helvetica');
                    doc.text(nameStr, 55, y, { width: 340 });
                    doc.text(p.stock.toString(), 400, y, { align: 'right' });
                    y += rowHeight + 5;
                });
            }
        }

        // ==========================================
        // DIRECTORIO DE CLIENTES
        // ==========================================
        if (type === 'clients') {
            const [clients] = await db.query('SELECT * FROM clients ORDER BY name ASC');
            
            let y = doc.y;
            
            clients.forEach((c, i) => {
                const newY = checkAddPage(y, 60);
                if (newY !== y) y = newY;
                
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
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('INGRESOS', 70, y + 10, { width: 150 });
            doc.text('COSTOS', 230, y + 10, { width: 140 });
            doc.text('GANANCIA BRUTA', 380, y + 10, { width: 150 });
            doc.fontSize(14).font('Helvetica');
            doc.text(formatCurrency(revenue), 70, y + 25, { width: 150 });
            doc.text(formatCurrency(cogs), 230, y + 25, { width: 140 });
            doc.text(formatCurrency(grossProfit), 380, y + 25, { width: 150 });
            doc.fontSize(10).font('Helvetica-Bold').fillColor(margin < 0 ? 'red' : 'green');
            doc.text(`${margin.toFixed(1)}% Margen`, 380, y + 45, { width: 150 });
            y += 70;

            // Caja de Operaciones
            doc.rect(50, y, 495, 50).fill('#f8f9fa').stroke('#e9ecef');
            doc.fillColor('#000');
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('TRANSACCIONES', 70, y + 10, { width: 150 });
            doc.text('TICKET PROMEDIO', 230, y + 10, { width: 140 });
            doc.text('UNIDADES VENDIDAS', 380, y + 10, { width: 150 });
            doc.fontSize(14).font('Helvetica');
            doc.text(String(totals[0].salesCount), 70, y + 25, { width: 150 });
            doc.text(formatCurrency(totals[0].avgTicket || 0), 230, y + 25, { width: 140 });
            doc.text(String(items[0].totalItems), 380, y + 25, { width: 150 });
            y += 60;

            // Caja de Inventario (Snapshot)
            doc.rect(50, y, 495, 50).fill('#f8f9fa').stroke('#e9ecef');
            doc.fillColor('#000');
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('VALOR INVENTARIO', 70, y + 10, { width: 200 });
            doc.text('PRODUCTOS CON STOCK BAJO', 300, y + 10, { width: 200 });
            doc.fontSize(14).font('Helvetica');
            doc.text(formatCurrency(inventoryStats[0].totalValue || 0), 70, y + 25, { width: 200 });
            doc.text(String(inventoryStats[0].lowStockCount), 300, y + 25, { width: 200 });

            // --- 3. DIBUJAR DESGLOSES ---
            // Usar control manual de Y para evitar páginas en blanco por moveDown
            let currentY = y + 60; // Espacio después de la caja de inventario

            // La función checkAddPage ya está definida arriba y es accesible aquí

            // Tabla Top 5 Productos
            currentY = checkAddPage(currentY, 120); // Verificar espacio para título + tabla pequeña
            doc.fontSize(12).font('Helvetica-Bold').text('Top 5 Productos Vendidos', 50, currentY);
            currentY += 20;

            doc.rect(50, currentY, 495, 20).fill('#f0f0f0');
            doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
            doc.text('Producto', 60, currentY + 6, { width: 280 });
            doc.text('Unidades', 350, currentY + 6, {width: 80, align: 'center'});
            doc.text('Ingreso', 440, currentY + 6, {width: 90, align: 'right'});
            currentY += 25;
            
            doc.font('Helvetica');
            topProducts.forEach((p, i) => {
                const productText = p.product_name.substring(0, 40);
                const soldText = String(p.totalSold);
                const revenueText = formatCurrency(p.totalRevenue);
                const rowHeight = Math.max(doc.heightOfString(productText, { width: 290 }), doc.heightOfString(soldText, { width: 80 }), doc.heightOfString(revenueText, { width: 90 }));

                const newY = checkAddPage(currentY, rowHeight + 5);
                if (newY !== currentY) {
                    currentY = newY;
                    doc.rect(50, currentY, 495, 20).fill('#f0f0f0');
                    doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
                    doc.text('Producto', 60, currentY + 6, { width: 280 });
                    doc.text('Unidades', 350, currentY + 6, {width: 80, align: 'center'});
                    doc.text('Ingreso', 440, currentY + 6, {width: 90, align: 'right'});
                    currentY += 25;
                    doc.font('Helvetica').fillColor('#000'); // Restablecer fuente
                }

                doc.font('Helvetica').fillColor('#000');
                doc.text(productText, 60, currentY, { width: 290 });
                doc.text(soldText, 350, currentY, {width: 80, align: 'center'});
                doc.text(revenueText, 440, currentY, {width: 90, align: 'right'});
                currentY += rowHeight + 5;
            });
            
            currentY += 20; // Espacio entre tablas

            // Tabla Top 5 Clientes
            currentY = checkAddPage(currentY, 120);
            doc.fontSize(12).font('Helvetica-Bold').text('Top 5 Clientes', 50, currentY);
            currentY += 20;

            doc.rect(50, currentY, 495, 20).fill('#f0f0f0');
            doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
            doc.text('Cliente', 60, currentY + 6, { width: 280 });
            doc.text('Compras', 350, currentY + 6, {width: 80, align: 'center'});
            doc.text('Total Gastado', 440, currentY + 6, {width: 90, align: 'right'});
            currentY += 25;
            
            doc.font('Helvetica');
            topClients.forEach((c, i) => {
                const clientText = c.name.substring(0, 30);
                const purchasesText = String(c.purchases);
                const totalText = formatCurrency(c.total);
                const rowHeight = Math.max(doc.heightOfString(clientText, { width: 290 }), doc.heightOfString(purchasesText, { width: 80 }), doc.heightOfString(totalText, { width: 90 }));

                const newY = checkAddPage(currentY, rowHeight + 5);
                if (newY !== currentY) {
                    currentY = newY;
                    doc.rect(50, currentY, 495, 20).fill('#f0f0f0');
                    doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
                    doc.text('Cliente', 60, currentY + 6, { width: 280 });
                    doc.text('Compras', 350, currentY + 6, {width: 80, align: 'center'});
                    doc.text('Total Gastado', 440, currentY + 6, {width: 90, align: 'right'});
                    currentY += 25;
                    doc.font('Helvetica').fillColor('#000'); // Restablecer fuente
                }
                doc.font('Helvetica').fillColor('#000');
                doc.text(clientText, 60, currentY, { width: 290 });
                doc.text(purchasesText, 350, currentY, {width: 80, align: 'center'});
                doc.text(totalText, 440, currentY, {width: 90, align: 'right'});
                currentY += rowHeight + 5;
            });
            
            currentY += 20;

            // Tabla Desglose Diario
            currentY = checkAddPage(currentY, 60);
            doc.fontSize(12).font('Helvetica-Bold').text('Desglose de Ventas por Día', 50, currentY);
            currentY += 20;
            
            doc.rect(50, currentY, 495, 20).fill('#f0f0f0');
            doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
            doc.text('Fecha', 60, currentY + 6, { width: 280 });
            doc.text('Transacciones', 350, currentY + 6, {width: 80, align: 'center'});
            doc.text('Total Vendido', 440, currentY + 6, {width: 90, align: 'right'});
            currentY += 25;
            
            doc.font('Helvetica');
            salesByDay.forEach((s, i) => {
                const dateStr = new Date(s.date).toLocaleDateString('es-CO', { timeZone: 'UTC' });
                const countText = String(s.count);
                const totalText = formatCurrency(s.total);
                const rowHeight = Math.max(doc.heightOfString(dateStr, { width: 290 }), doc.heightOfString(countText, { width: 80 }), doc.heightOfString(totalText, { width: 90 }));

                const newY = checkAddPage(currentY, rowHeight + 5);
                if (newY !== currentY) {
                    currentY = newY;
                    doc.rect(50, currentY, 495, 20).fill('#f0f0f0');
                    doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
                    doc.text('Fecha', 60, currentY + 6, { width: 280 });
                    doc.text('Transacciones', 350, currentY + 6, {width: 80, align: 'center'});
                    doc.text('Total Vendido', 440, currentY + 6, {width: 90, align: 'right'});
                    currentY += 25;
                    doc.font('Helvetica').fillColor('#000'); // Restablecer fuente
                }
                doc.text(dateStr, 60, currentY, { width: 290 });
                doc.text(String(s.count), 350, currentY, {width: 80, align: 'center'});
                doc.text(formatCurrency(s.total), 440, currentY, {width: 90, align: 'right'});
                currentY += rowHeight + 5;
            });

            // --- 4. INVENTARIO DISPONIBLE (NUEVO) ---
            const [fullInventory] = await db.query('SELECT product_name, stock, price FROM inventory ORDER BY product_name ASC');
            
            currentY = checkAddPage(currentY, 90);
            doc.fontSize(12).font('Helvetica-Bold').text('Inventario Disponible', 50, currentY);
            currentY += 20;

            doc.rect(50, currentY, 495, 20).fill('#f0f0f0');
            doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
            doc.text('Producto', 60, currentY + 6, { width: 280 });
            doc.text('Precio', 350, currentY + 6, {width: 80, align: 'right'});
            doc.text('Stock', 440, currentY + 6, {width: 90, align: 'center'});
            currentY += 25;

            doc.font('Helvetica');
            fullInventory.forEach((p, i) => {
                const productText = p.product_name.substring(0, 50);
                const priceText = formatCurrency(p.price);
                const stockText = String(p.stock);
                const rowHeight = Math.max(doc.heightOfString(productText, { width: 290 }), doc.heightOfString(priceText, { width: 80 }), doc.heightOfString(stockText, { width: 90 }));
                
                const newY = checkAddPage(currentY, rowHeight + 5);
                if (newY !== currentY) {
                    currentY = newY;
                    doc.rect(50, currentY, 495, 20).fill('#f0f0f0');
                    doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
                    doc.text('Producto', 60, currentY + 6, { width: 280 });
                    doc.text('Precio', 350, currentY + 6, {width: 80, align: 'right'});
                    doc.text('Stock', 440, currentY + 6, {width: 90, align: 'center'});
                    currentY += 25;
                    doc.font('Helvetica').fillColor('#000'); // Restablecer fuente
                }
                
                doc.font('Helvetica').fillColor('#000'); // <--- CORRECCIÓN: Restablecer fuente
                doc.text(productText, 60, currentY, { width: 290 });
                doc.text(priceText, 350, currentY, {width: 80, align: 'right'});
                doc.text(stockText, 440, currentY, {width: 90, align: 'center'});
                currentY += rowHeight + 5;
            });
        }

        // --- PIE DE PÁGINA (Copyright y Paginación) ---
        // El listener se encarga de los headers, ahora el footer al final
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            // Re-usamos la función generateFooter para consistencia
            generateFooter(doc);
        }

        doc.end();

    } catch (error) {
        console.error(error);
        res.status(500).send('Error generando PDF');
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

module.exports = router;