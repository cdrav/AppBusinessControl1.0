const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { recordLog } = require('../services/auditService');
const { BusinessError } = require('../middleware/validate');

// Obtener inventario
router.get('/', authenticateToken, async (req, res) => {
    const { branch_id } = req.query;

    try {
        if (branch_id) {
            // Si se pide el inventario de una sede específica, se une con branch_stocks
            const [results] = await db.query(`
                SELECT 
                    i.id, i.product_name, i.price, i.cost, i.category, i.barcode, i.description, i.supplier_id,
                    s.name as supplier_name,
                    COALESCE(bs.stock, 0) as stock 
                FROM inventory i
                LEFT JOIN branch_stocks bs ON i.id = bs.product_id AND bs.branch_id = ? AND bs.tenant_id = ?
                LEFT JOIN suppliers s ON i.supplier_id = s.id
                WHERE i.tenant_id = ?
                ORDER BY i.product_name ASC
            `, [branch_id, req.user.tenant_id, req.user.tenant_id]);
            res.json(results);
        } else {
            // Inventario con stock de la sucursal del usuario (o stock global si no hay registro en branch_stocks)
            const userBranchId = req.user.branch_id || 1;
            const [results] = await db.query(`
                SELECT 
                    i.id, i.product_name, i.price, i.cost, i.category, i.barcode, i.description, i.supplier_id,
                    s.name as supplier_name,
                    COALESCE(bs.stock, i.stock, 0) as stock 
                FROM inventory i
                LEFT JOIN branch_stocks bs ON i.id = bs.product_id AND bs.branch_id = ? AND bs.tenant_id = ?
                LEFT JOIN suppliers s ON i.supplier_id = s.id
                WHERE i.tenant_id = ?
                ORDER BY i.product_name ASC
            `, [userBranchId, req.user.tenant_id, req.user.tenant_id]);
            res.json(results);
        }
    } catch (error) {
        console.error('Error al obtener inventario:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener el inventario.' });
    }
});

// Obtener inventario para la venta (stock de la sucursal del usuario)
router.get('/for-sale', authenticateToken, async (req, res) => {
    let branchId = req.user.branch_id;
    
    // Permitir a administradores consultar el stock de una sede específica para la venta
    if (req.user.role === 'admin' && req.query.branch_id) {
        branchId = req.query.branch_id;
    }

    // Fallback: Si el token es antiguo o no tiene branch_id, buscar en BD o usar default (1)
    if (!branchId) {
        try {
            const [u] = await db.query('SELECT branch_id FROM users WHERE id = ?', [req.user.id]);
            branchId = u[0]?.branch_id || 1; 
        } catch (e) { branchId = 1; }
    }
    try {
        const [products] = await db.query(`
            SELECT 
                i.id, i.product_name, i.price, i.barcode,
                COALESCE(bs.stock, i.stock, 0) as stock 
            FROM inventory i
            LEFT JOIN branch_stocks bs ON i.id = bs.product_id AND bs.branch_id = ? AND bs.tenant_id = ?
            WHERE i.tenant_id = ? AND (COALESCE(bs.stock, i.stock, 0) > 0 OR i.stock > 0)
            ORDER BY i.product_name ASC
        `, [branchId, req.user.tenant_id, req.user.tenant_id]);
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar inventario para la venta.' });
    }
});

// Buscar por código de barras
router.get('/barcode/:code', authenticateToken, async (req, res) => {
    const [results] = await db.query('SELECT * FROM inventory WHERE barcode = ? AND tenant_id = ?', [req.params.code, req.user.tenant_id]);
    if (results.length === 0) return res.status(404).json({ message: 'Producto no encontrado' });
    res.json(results[0]);
});

// Exportar CSV
router.get('/export', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const [results] = await db.query('SELECT * FROM inventory WHERE tenant_id = ? ORDER BY id ASC', [req.user.tenant_id]);
    let csv = 'ID,Codigo,Nombre,Stock,Precio,Costo,Categoria\n';
    results.forEach(row => { csv += `${row.id},"${row.barcode||''}", "${row.product_name}",${row.stock},${row.price},${row.cost||0},"${row.category||''}"\n`; });
    res.header('Content-Type', 'text/csv').attachment('inventario.csv').send(csv);
});

// Crear producto
router.post('/', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { name, quantity, price, cost, category, supplier_id, description, barcode } = req.body;
    const [result] = await db.query('INSERT INTO inventory (tenant_id, product_name, stock, price, cost, category, supplier_id, description, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [req.user.tenant_id, name, quantity, price, cost||0, category, supplier_id || null, description, barcode || null]);
    const branchId = req.user.branch_id || 1;
    await db.query('INSERT INTO branch_stocks (tenant_id, branch_id, product_id, stock) VALUES (?, ?, ?, ?)', [req.user.tenant_id, branchId, result.insertId, quantity]);
    
    await recordLog({
        tenantId: req.user.tenant_id,
        userId: req.user.id,
        action: 'PRODUCT_CREATED',
        entityType: 'product',
        entityId: result.insertId,
        details: { name, quantity, price },
        ipAddress: req.ip
    });

    res.status(201).json({ message: 'Producto agregado', productId: result.insertId });
});

// Editar producto (Sincronizado)
router.put('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const { name, quantity, price, cost, category, supplier_id, description, barcode } = req.body;
    const branchId = req.user.branch_id || 1;

    if (isNaN(parseInt(quantity))) return res.status(400).json({ message: 'Cantidad inválida' });
    
    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();
        const [updateRes] = await conn.query('UPDATE inventory SET product_name=?, price=?, cost=?, category=?, supplier_id=?, description=?, barcode=? WHERE id=? AND tenant_id=?', [name, price, cost||0, category, supplier_id || null, description, barcode || null, id, req.user.tenant_id]);
        
        if (updateRes.affectedRows === 0) throw new BusinessError('Producto no encontrado o sin permisos', 404);
        
        const [rows] = await conn.query('SELECT COALESCE(SUM(stock), 0) as total FROM branch_stocks WHERE product_id = ?', [id]);
        const diff = parseInt(quantity) - parseInt(rows[0].total);
        if (diff !== 0) await conn.query('INSERT INTO branch_stocks (tenant_id, branch_id, product_id, stock) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE stock = stock + ?', [req.user.tenant_id, branchId, id, diff, diff]);
        
        await conn.query('UPDATE inventory SET stock = (SELECT COALESCE(SUM(stock), 0) FROM branch_stocks WHERE product_id = ? AND tenant_id = ?) WHERE id = ? AND tenant_id = ?', [id, req.user.tenant_id, id, req.user.tenant_id]);
        await conn.commit();

        await recordLog({
            tenantId: req.user.tenant_id,
            userId: req.user.id,
            action: 'PRODUCT_UPDATED',
            entityType: 'product',
            entityId: id,
            details: { name, quantity, price },
            ipAddress: req.ip
        });

        res.json({ message: 'Producto actualizado' });
    } catch (e) {
        if(conn) await conn.rollback();
        const status = e.statusCode || 500;
        res.status(status).json({ message: e.message || 'Error actualizando' });
    } finally { if(conn) conn.release(); }
});

// Eliminar producto
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    await db.query('DELETE FROM inventory WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);

    await recordLog({
        tenantId: req.user.tenant_id,
        userId: req.user.id,
        action: 'PRODUCT_DELETED',
        entityType: 'product',
        entityId: req.params.id,
        ipAddress: req.ip
    });

    res.json({ message: 'Producto eliminado' });
});

// Obtener un producto
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const [r] = await db.query('SELECT * FROM inventory WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);
        r.length ? res.json(r[0]) : res.status(404).json({message: 'No encontrado'});
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener producto' });
    }
});

// Stock por sucursal
router.get('/:id/stocks', authenticateToken, async (req, res) => {
    const [stocks] = await db.query(`SELECT b.id as branch_id, b.name as branch_name, COALESCE(bs.stock, 0) as stock FROM branches b LEFT JOIN branch_stocks bs ON b.id = bs.branch_id AND bs.product_id = ? ORDER BY b.id ASC`, [req.params.id]);
    res.json(stocks);
});

// Sincronizar stock global con la suma de sucursales (Herramienta de reparación)
router.post('/sync-global', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        await db.query(`
            UPDATE inventory i
            SET stock = (
                SELECT COALESCE(SUM(stock), 0)
                FROM branch_stocks
                WHERE product_id = i.id AND tenant_id = i.tenant_id
            )
            WHERE i.tenant_id = ?
        `, [req.user.tenant_id]);

        await recordLog({
            tenantId: req.user.tenant_id,
            userId: req.user.id,
            action: 'INVENTORY_SYNC',
            entityType: 'inventory',
            ipAddress: req.ip
        });

        res.json({ message: 'Inventario global sincronizado con sucursales.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al sincronizar inventario.' });
    }
});

// Ajuste manual de stock
router.post('/stock', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { productId, branchId, newStock } = req.body;
    
    // Validar pertenencia del producto
    const [p] = await db.query('SELECT id FROM inventory WHERE id = ? AND tenant_id = ?', [productId, req.user.tenant_id]);
    if (!p.length) return res.status(403).json({ message: 'Producto no pertenece a su empresa' });

    await db.query(`INSERT INTO branch_stocks (tenant_id, branch_id, product_id, stock) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE stock = ?`, [req.user.tenant_id, branchId, productId, newStock, newStock]);
    await db.query(`UPDATE inventory i SET stock = (SELECT SUM(stock) FROM branch_stocks WHERE product_id = i.id AND tenant_id = i.tenant_id) WHERE i.id = ? AND i.tenant_id = ?`, [productId, req.user.tenant_id]);

    await recordLog({
        tenantId: req.user.tenant_id,
        userId: req.user.id,
        action: 'STOCK_ADJUSTMENT',
        entityType: 'product',
        entityId: productId,
        details: { branchId, newStock },
        ipAddress: req.ip
    });

    res.json({ message: 'Stock actualizado' });
});

// Transferencia
router.post('/transfer', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { productId, fromBranchId, toBranchId, quantity } = req.body;
    const qty = parseInt(quantity);
    if (fromBranchId == toBranchId) return res.status(400).json({ message: 'Origen y destino iguales.' });

    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();
        const [src] = await conn.query('SELECT stock FROM branch_stocks WHERE product_id=? AND branch_id=? AND tenant_id=? FOR UPDATE', [productId, fromBranchId, req.user.tenant_id]);
        if (!src.length || src[0].stock < qty) throw new Error('Stock insuficiente');

        await conn.query('UPDATE branch_stocks SET stock = stock - ? WHERE product_id=? AND branch_id=? AND tenant_id=?', [qty, productId, fromBranchId, req.user.tenant_id]);
        await conn.query('INSERT INTO branch_stocks (tenant_id, branch_id, product_id, stock) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE stock = stock + ?', [req.user.tenant_id, toBranchId, productId, qty, qty]);
        
        await conn.query('INSERT INTO inventory_transfers (tenant_id, product_id, from_branch_id, to_branch_id, quantity, user_id) VALUES (?, ?, ?, ?, ?, ?)', [req.user.tenant_id, productId, fromBranchId, toBranchId, qty, req.user.id]);
        
        await conn.commit();

        await recordLog({
            tenantId: req.user.tenant_id,
            userId: req.user.id,
            action: 'STOCK_TRANSFER',
            entityType: 'product',
            entityId: productId,
            details: { fromBranchId, toBranchId, quantity: qty },
            ipAddress: req.ip
        });

        res.json({ message: 'Transferencia exitosa' });
    } catch (e) { if(conn) await conn.rollback(); res.status(400).json({ message: e.message }); } finally { if(conn) conn.release(); }
});

// Historial Transferencias
router.get('/:id/transfers', authenticateToken, async (req, res) => {
    const [exists] = await db.query("SHOW TABLES LIKE 'inventory_transfers'");
    if (!exists.length) return res.json([]);
    const [rows] = await db.query(`SELECT t.*, b1.name as from_branch, b2.name as to_branch, u.username as user_name FROM inventory_transfers t LEFT JOIN branches b1 ON t.from_branch_id=b1.id LEFT JOIN branches b2 ON t.to_branch_id=b2.id LEFT JOIN users u ON t.user_id=u.id WHERE t.product_id=? ORDER BY t.created_at DESC LIMIT 10`, [req.params.id]);
    res.json(rows);
});

module.exports = router;
