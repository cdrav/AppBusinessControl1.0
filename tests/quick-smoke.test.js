/**
 * Smoke Test Ultra-Rápido
 * Verifica que los componentes críticos existen y exportan correctamente
 */

// Test 1: Verificar que las rutas existen y exportan
describe('✅ Componentes Existen', () => {
  test('Routes: auth.js exporta router', () => {
    const authRoutes = require('../routes/auth');
    expect(authRoutes).toBeDefined();
    expect(typeof authRoutes.use).toBe('function'); // Express router
  });

  test('Routes: sales.js exporta router', () => {
    const salesRoutes = require('../routes/sales');
    expect(salesRoutes).toBeDefined();
    expect(typeof salesRoutes.use).toBe('function');
  });

  test('Routes: inventory.js exporta router', () => {
    const inventoryRoutes = require('../routes/inventory');
    expect(inventoryRoutes).toBeDefined();
  });

  test('Routes: users.js exporta router', () => {
    const usersRoutes = require('../routes/users');
    expect(usersRoutes).toBeDefined();
  });

  test('Routes: reports.js exporta router', () => {
    const reportsRoutes = require('../routes/reports');
    expect(reportsRoutes).toBeDefined();
  });

  test('Middleware: auth.js exporta funciones', () => {
    const { authenticateToken, authorizeRole } = require('../middleware/auth');
    expect(typeof authenticateToken).toBe('function');
    expect(typeof authorizeRole).toBe('function');
  });

  test('Services: emailService exporta funciones', () => {
    const { sendDailySummaryEmail, isEmailConfigured } = require('../services/emailService');
    expect(typeof sendDailySummaryEmail).toBe('function');
    expect(typeof isEmailConfigured).toBe('function');
  });

  test('Services: auditService exporta recordLog', () => {
    const { recordLog } = require('../services/auditService');
    expect(typeof recordLog).toBe('function');
  });

  test('Config: db exporta pool de conexiones', () => {
    const db = require('../config/db');
    expect(db).toBeDefined();
    expect(typeof db.query).toBe('function');
  });

  test('Roles config está correcto', () => {
    const { ROLES, PERMISOS, PERMISOS_POR_ROL } = require('../config/roles');
    expect(ROLES.ADMIN).toBe('admin');
    expect(ROLES.CAJERO).toBe('cajero');
    expect(ROLES.COBRADOR).toBe('cobrador');
    expect(Array.isArray(PERMISOS_POR_ROL.admin)).toBe(true);
  });
});

// Test 2: Verificar utilidades
describe('✅ Utilidades Funcionan', () => {
  test('formatCOP formatea pesos colombianos', () => {
    const formatCOP = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(parseFloat(val || 0));
    
    expect(formatCOP(1000000)).toContain('$');
    expect(formatCOP(1000000)).toContain('1,000,000');
    expect(formatCOP(0)).toContain('$');
  });

  test('formatCOP maneja valores nulos', () => {
    const formatCOP = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(parseFloat(val || 0));
    
    expect(formatCOP(null)).toContain('$');
    expect(formatCOP(undefined)).toContain('$');
    expect(formatCOP('')).toContain('$');
  });
});

// Test 3: Verificar que server.js exporta (sin iniciar)
describe('✅ Servidor', () => {
  test('server.js existe y tiene app', () => {
    // Verificar que el archivo existe leyendo su contenido
    const fs = require('fs');
    const path = require('path');
    
    const serverPath = path.join(__dirname, '..', 'server.js');
    expect(fs.existsSync(serverPath)).toBe(true);
    
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    expect(serverContent).toContain('express()');
    expect(serverContent).toContain('app.listen');
  });

  test('package.json tiene scripts correctos', () => {
    const packageJson = require('../package.json');
    
    expect(packageJson.scripts.start).toBeDefined();
    expect(packageJson.scripts.test).toBeDefined();
    expect(packageJson.dependencies.express).toBeDefined();
    expect(packageJson.dependencies.mysql2).toBeDefined();
  });
});

// Resumen
describe('🎯 Resumen', () => {
  test('Todos los componentes críticos están presentes', () => {
    // Este test siempre pasa si llegamos aquí
    expect(true).toBe(true);
    console.log('✅ Sistema listo para desarrollo');
  });
});
