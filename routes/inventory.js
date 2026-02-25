const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Obtener inventario
router.get('/', authenticateToken, async (req, res) => {
    const [results] = await db.query(`SELECT i.*, s.name as supplier_name FROM inventory i LEFT JOIN suppliers s ON i.supplier_id = s.id ORDER BY i.product_name ASC`);
    res.json(results);
});

// Obtener inventario para la venta (stock de la sucursal del usuario)
router.get('/for-sale', authenticateToken, async (req, res) => {
    let branchId = req.user.branch_id;
    
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
                COALESCE(bs.stock, 0) as stock 
            FROM inventory i
            LEFT JOIN branch_stocks bs ON i.id = bs.product_id AND bs.branch_id = ?
            ORDER BY i.product_name ASC
        `, [branchId]);
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar inventario para la venta.' });
    }
});

// Buscar por código de barras
router.get('/barcode/:code', authenticateToken, async (req, res) => {
    const [results] = await db.query('SELECT * FROM inventory WHERE barcode = ?', [req.params.code]);
    if (results.length === 0) return res.status(404).json({ message: 'Producto no encontrado' });
    res.json(results[0]);
});

// Exportar CSV
router.get('/export', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const [results] = await db.query('SELECT * FROM inventory ORDER BY id ASC');
    let csv = 'ID,Codigo,Nombre,Stock,Precio,Costo,Categoria\n';
    results.forEach(row => { csv += `${row.id},"${row.barcode||''}", "${row.product_name}",${row.stock},${row.price},${row.cost||0},"${row.category||''}"\n`; });
    res.header('Content-Type', 'text/csv').attachment('inventario.csv').send(csv);
});

// Crear producto
router.post('/', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { name, quantity, price, cost, category, supplier_id, description, barcode } = req.body;
    const [result] = await db.query('INSERT INTO inventory (product_name, stock, price, cost, category, supplier_id, description, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [name, quantity, price, cost||0, category, supplier_id || null, description, barcode || null]);
    const branchId = req.user.branch_id || 1;
    await db.query('INSERT INTO branch_stocks (branch_id, product_id, stock) VALUES (?, ?, ?)', [branchId, result.insertId, quantity]);
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
        await conn.query('UPDATE inventory SET product_name=?, price=?, cost=?, category=?, supplier_id=?, description=?, barcode=? WHERE id=?', [name, price, cost||0, category, supplier_id || null, description, barcode || null, id]);
        
        const [rows] = await conn.query('SELECT COALESCE(SUM(stock), 0) as total FROM branch_stocks WHERE product_id = ?', [id]);
        const diff = parseInt(quantity) - parseInt(rows[0].total);
        if (diff !== 0) await conn.query('INSERT INTO branch_stocks (branch_id, product_id, stock) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stock = stock + ?', [branchId, id, diff, diff]);
        
        await conn.query('UPDATE inventory SET stock = (SELECT COALESCE(SUM(stock), 0) FROM branch_stocks WHERE product_id = ?) WHERE id = ?', [id, id]);
        await conn.commit();
        res.json({ message: 'Producto actualizado' });
    } catch (e) { if(conn) await conn.rollback(); res.status(500).json({message: 'Error actualizando'}); } finally { if(conn) conn.release(); }
});

// Eliminar producto
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    await db.query('DELETE FROM inventory WHERE id = ?', [req.params.id]);
    res.json({ message: 'Producto eliminado' });
});

// Obtener un producto
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const [r] = await db.query('SELECT * FROM inventory WHERE id = ?', [req.params.id]);
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
                WHERE product_id = i.id
            )
        `);
        res.json({ message: 'Inventario global sincronizado con sucursales.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al sincronizar inventario.' });
    }
});

// Ajuste manual de stock
router.post('/stock', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { productId, branchId, newStock } = req.body;
    await db.query(`INSERT INTO branch_stocks (branch_id, product_id, stock) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stock = ?`, [branchId, productId, newStock, newStock]);
    await db.query(`UPDATE inventory i SET stock = (SELECT SUM(stock) FROM branch_stocks WHERE product_id = i.id) WHERE i.id = ?`, [productId]);
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
        const [src] = await conn.query('SELECT stock FROM branch_stocks WHERE product_id=? AND branch_id=? FOR UPDATE', [productId, fromBranchId]);
        if (!src.length || src[0].stock < qty) throw new Error('Stock insuficiente');

        await conn.query('UPDATE branch_stocks SET stock = stock - ? WHERE product_id=? AND branch_id=?', [qty, productId, fromBranchId]);
        await conn.query('INSERT INTO branch_stocks (branch_id, product_id, stock) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stock = stock + ?', [toBranchId, productId, qty, qty]);
        
        await conn.query(`CREATE TABLE IF NOT EXISTS inventory_transfers (id INT AUTO_INCREMENT PRIMARY KEY, product_id INT, from_branch_id INT, to_branch_id INT, quantity INT, user_id INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        await conn.query('INSERT INTO inventory_transfers (product_id, from_branch_id, to_branch_id, quantity, user_id) VALUES (?, ?, ?, ?, ?)', [productId, fromBranchId, toBranchId, qty, req.user.id]);
        
        await conn.commit();
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
