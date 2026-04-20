const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticateToken, getJwtSecret } = require('../middleware/auth');
const { ROLES } = require('../config/roles');

// Middleware: solo superadmin
function onlySuperAdmin(req, res, next) {
  if (req.user && req.user.role === ROLES.SUPERADMIN) {
    return next();
  }
  res.status(403).json({ message: 'Acceso restringido a superadmin.' });
}

// ============================================
// MÉTRICAS GLOBALES
// ============================================
router.get('/metrics', authenticateToken, onlySuperAdmin, async (req, res) => {
  try {
    const [[{ totalTenants }]] = await db.query('SELECT COUNT(*) as totalTenants FROM tenants');
    const [[{ activeTenants }]] = await db.query('SELECT COUNT(*) as activeTenants FROM tenants WHERE is_active = TRUE');
    const [[{ totalUsers }]] = await db.query('SELECT COUNT(*) as totalUsers FROM users WHERE role != ?', [ROLES.SUPERADMIN]);
    const [[{ totalSales }]] = await db.query('SELECT COUNT(*) as totalSales FROM sales');
    const [[{ totalRevenue }]] = await db.query('SELECT COALESCE(SUM(total_price), 0) as totalRevenue FROM sales');
    const [[{ salesToday }]] = await db.query('SELECT COUNT(*) as salesToday FROM sales WHERE DATE(sale_date) = CURDATE()');
    const [[{ revenueToday }]] = await db.query('SELECT COALESCE(SUM(total_price), 0) as revenueToday FROM sales WHERE DATE(sale_date) = CURDATE()');
    const [[{ totalProducts }]] = await db.query('SELECT COUNT(*) as totalProducts FROM inventory');
    const [[{ totalCredits }]] = await db.query("SELECT COUNT(*) as totalCredits FROM credits WHERE status IN ('active','partial')");
    const [[{ pendingDebt }]] = await db.query("SELECT COALESCE(SUM(remaining_balance), 0) as pendingDebt FROM credits WHERE status IN ('active','partial')");

    res.json({
      totalTenants,
      activeTenants,
      inactiveTenants: totalTenants - activeTenants,
      totalUsers,
      totalSales,
      totalRevenue: parseFloat(totalRevenue),
      salesToday,
      revenueToday: parseFloat(revenueToday),
      totalProducts,
      totalCredits,
      pendingDebt: parseFloat(pendingDebt)
    });
  } catch (error) {
    console.error('Error métricas globales:', error);
    res.status(500).json({ message: 'Error obteniendo métricas' });
  }
});

// ============================================
// GESTIÓN DE TENANTS
// ============================================

// Listar todos los tenants con stats
router.get('/tenants', authenticateToken, onlySuperAdmin, async (req, res) => {
  try {
    const [tenants] = await db.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.role != 'superadmin') as user_count,
        (SELECT COUNT(*) FROM sales s WHERE s.tenant_id = t.id) as sale_count,
        (SELECT COALESCE(SUM(s.total_price), 0) FROM sales s WHERE s.tenant_id = t.id) as total_revenue,
        (SELECT COUNT(*) FROM inventory i WHERE i.tenant_id = t.id) as product_count
      FROM tenants t
      ORDER BY t.created_at DESC
    `);
    res.json(tenants);
  } catch (error) {
    console.error('Error listando tenants:', error);
    res.status(500).json({ message: 'Error obteniendo tenants' });
  }
});

// Crear nuevo tenant
router.post('/tenants', authenticateToken, onlySuperAdmin, async (req, res) => {
  try {
    const { business_name, owner_name, email, phone, plan, notes } = req.body;
    if (!business_name) return res.status(400).json({ message: 'Nombre del negocio es requerido' });

    const [result] = await db.query(
      'INSERT INTO tenants (business_name, owner_name, email, phone, plan, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [business_name, owner_name || null, email || null, phone || null, plan || 'basic', notes || null]
    );

    // Crear branch y settings por defecto para el nuevo tenant
    await db.query("INSERT INTO branches (name, address, tenant_id) VALUES ('Sede Principal', 'Oficina Central', ?)", [result.insertId]);
    await db.query("INSERT INTO settings (tenant_id, company_name, ticket_format) VALUES (?, ?, 'A4')", [result.insertId, business_name]);

    res.status(201).json({ message: 'Negocio creado exitosamente', tenantId: result.insertId });
  } catch (error) {
    console.error('Error creando tenant:', error);
    res.status(500).json({ message: 'Error creando negocio' });
  }
});

// Actualizar tenant
router.put('/tenants/:id', authenticateToken, onlySuperAdmin, async (req, res) => {
  try {
    const { business_name, owner_name, email, phone, plan, notes } = req.body;
    const [result] = await db.query(
      'UPDATE tenants SET business_name = ?, owner_name = ?, email = ?, phone = ?, plan = ?, notes = ? WHERE id = ?',
      [business_name, owner_name || null, email || null, phone || null, plan || 'basic', notes || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Negocio no encontrado' });
    res.json({ message: 'Negocio actualizado' });
  } catch (error) {
    console.error('Error actualizando tenant:', error);
    res.status(500).json({ message: 'Error actualizando negocio' });
  }
});

// Habilitar/Deshabilitar tenant
router.put('/tenants/:id/toggle', authenticateToken, onlySuperAdmin, async (req, res) => {
  try {
    const [tenant] = await db.query('SELECT is_active FROM tenants WHERE id = ?', [req.params.id]);
    if (tenant.length === 0) return res.status(404).json({ message: 'Negocio no encontrado' });

    const newStatus = !tenant[0].is_active;
    await db.query('UPDATE tenants SET is_active = ? WHERE id = ?', [newStatus, req.params.id]);

    res.json({
      message: newStatus ? 'Negocio habilitado' : 'Negocio deshabilitado',
      is_active: newStatus
    });
  } catch (error) {
    console.error('Error toggle tenant:', error);
    res.status(500).json({ message: 'Error cambiando estado del negocio' });
  }
});

// ============================================
// USUARIOS POR TENANT (SOPORTE)
// ============================================
router.get('/tenants/:id/users', authenticateToken, onlySuperAdmin, async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT u.id, u.username, u.email, u.role, u.plain_password, u.is_login_enabled, u.created_at,
             b.name as branch_name
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.tenant_id = ? AND u.role != 'superadmin'
      ORDER BY u.created_at DESC
    `, [req.params.id]);
    res.json(users);
  } catch (error) {
    console.error('Error obteniendo usuarios del tenant:', error);
    res.status(500).json({ message: 'Error obteniendo usuarios' });
  }
});

// ============================================
// IMPERSONAR TENANT
// ============================================
router.post('/impersonate/:tenantId', authenticateToken, onlySuperAdmin, async (req, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);

    // Verificar que el tenant existe
    const [tenant] = await db.query('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    if (tenant.length === 0) return res.status(404).json({ message: 'Negocio no encontrado' });

    // Buscar el admin del tenant para impersonar
    const [admins] = await db.query(
      'SELECT id, username, role, branch_id, tenant_id FROM users WHERE tenant_id = ? AND role = ? LIMIT 1',
      [tenantId, ROLES.ADMIN]
    );

    if (admins.length === 0) {
      return res.status(404).json({ message: 'No hay admin en este negocio. Cree un usuario admin primero.' });
    }

    const admin = admins[0];

    // Generar token de impersonación (tiene flag especial)
    const impersonateToken = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        branch_id: admin.branch_id || 1,
        tenant_id: tenantId,
        impersonatedBy: req.user.id,
        isImpersonation: true
      },
      getJwtSecret(),
      { expiresIn: '2h' }
    );

    res.json({
      message: `Impersonando a ${admin.username} en ${tenant[0].business_name}`,
      token: impersonateToken,
      tenant: tenant[0],
      admin: { id: admin.id, username: admin.username }
    });
  } catch (error) {
    console.error('Error impersonando:', error);
    res.status(500).json({ message: 'Error impersonando negocio' });
  }
});

// ============================================
// LOGS DE AUDITORÍA GLOBAL
// ============================================
router.get('/audit-logs', authenticateToken, onlySuperAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const tenantId = req.query.tenant_id;

    let query = `
      SELECT al.*, u.username, t.business_name as tenant_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN tenants t ON al.tenant_id = t.id
    `;
    const params = [];

    if (tenantId) {
      query += ' WHERE al.tenant_id = ?';
      params.push(tenantId);
    }

    query += ' ORDER BY al.created_at DESC LIMIT ?';
    params.push(limit);

    const [logs] = await db.query(query, params);
    res.json(logs);
  } catch (error) {
    console.error('Error obteniendo logs:', error);
    res.status(500).json({ message: 'Error obteniendo logs' });
  }
});

// ============================================
// ESTADÍSTICAS POR TENANT
// ============================================
router.get('/tenants/:id/stats', authenticateToken, onlySuperAdmin, async (req, res) => {
  try {
    const tid = req.params.id;
    const [[{ sales }]] = await db.query('SELECT COUNT(*) as sales FROM sales WHERE tenant_id = ?', [tid]);
    const [[{ revenue }]] = await db.query('SELECT COALESCE(SUM(total_price), 0) as revenue FROM sales WHERE tenant_id = ?', [tid]);
    const [[{ products }]] = await db.query('SELECT COUNT(*) as products FROM inventory WHERE tenant_id = ?', [tid]);
    const [[{ clients }]] = await db.query('SELECT COUNT(*) as clients FROM clients WHERE tenant_id = ?', [tid]);
    const [[{ users }]] = await db.query("SELECT COUNT(*) as users FROM users WHERE tenant_id = ? AND role != 'superadmin'", [tid]);
    const [[{ expenses }]] = await db.query('SELECT COALESCE(SUM(amount), 0) as expenses FROM expenses WHERE tenant_id = ?', [tid]);
    const [[{ activeCredits }]] = await db.query("SELECT COUNT(*) as activeCredits FROM credits WHERE tenant_id = ? AND status IN ('active','partial')", [tid]);

    res.json({
      sales, revenue: parseFloat(revenue), products, clients, users,
      expenses: parseFloat(expenses), activeCredits
    });
  } catch (error) {
    console.error('Error stats tenant:', error);
    res.status(500).json({ message: 'Error obteniendo estadísticas' });
  }
});

module.exports = router;
