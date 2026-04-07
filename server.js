require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const cron = require('node-cron');
const { sendDailySummaryEmail } = require('./services/emailService');
const db = require('./config/db');
const { sanitizeBody } = require('./middleware/sanitize');

const app = express();

// Middleware de JSON con manejo de errores
app.use((req, res, next) => {
  express.json({ limit: '10mb' })(req, res, (err) => {
    if (err) {
      console.error('❌ Error parseando JSON:', err.message);
      return res.status(400).json({ message: 'JSON inválido', error: err.message });
    }
    next();
  });
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Seguridad: Headers HTTP
app.use(helmet({
  contentSecurityPolicy: false, // Desactivar CSP para permitir CDNs de Bootstrap/SweetAlert
  crossOriginEmbedderPolicy: false
}));

// CORS restringido
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8080'];

// Siempre permitir orígenes de Railway (*.railway.app)
const isRailwayOrigin = (origin) => {
  return origin && (origin.includes('.railway.app') || origin.includes('railway'));
};

app.use(cors({
  origin: function(origin, callback) {
    // Permitir peticiones sin origin (mismo servidor, Postman, curl)
    if (!origin) return callback(null, true);
    
    // Permitir orígenes de Railway automáticamente
    if (isRailwayOrigin(origin)) return callback(null, true);
    
    // Permitir orígenes configurados
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.log(`❌ CORS bloqueado: ${origin}`);
    callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true
}));

// Sanitización global de inputs
app.use(sanitizeBody);

// Servir archivos estáticos - Asegurar path correcto para Railway
const publicPath = path.join(__dirname, 'public');
console.log(`📁 Serving static files from: ${publicPath}`);
app.use(express.static(publicPath));

// Debug endpoint para verificar archivos (solo en desarrollo)
app.get('/debug/files', (req, res) => {
  const fs = require('fs');
  try {
    const files = fs.readdirSync(publicPath);
    const jsFiles = fs.readdirSync(path.join(publicPath, 'js'));
    res.json({
      publicPath,
      rootFiles: files,
      jsFiles: jsFiles,
      __dirname: __dirname
    });
  } catch (err) {
    res.status(500).json({ error: err.message, publicPath, __dirname });
  }
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Importar Rutas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const inventoryRoutes = require('./routes/inventory');
const salesRoutes = require('./routes/sales');
const clientRoutes = require('./routes/clients');
const reportRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const expensesRoutes = require('./routes/expenses');
const creditRoutes = require('./routes/credits');
const auditRoutes = require('./routes/audit');

// Usar Rutas
app.use('/', authRoutes); // Login, Register
app.use('/users', userRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/sales', salesRoutes);
app.use('/clients', clientRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api', reportRoutes); // Dashboard, Backup
app.use('/api/expenses', expensesRoutes);
app.use('/api/audit', auditRoutes);
// Montar reportRoutes también en la raíz para soportar /report y /statistics
app.use('/', reportRoutes);

// Configuración y Sucursales
app.use('/settings', settingsRoutes); 
// También en la raíz para que funcionen /branches y /suppliers como espera el frontend
app.use('/', settingsRoutes); 

// Ruta Base (Servir el frontend)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint para Railway (ANTES del 404 handler)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Global error handler - SOLO para errores no manejados
app.use((err, req, res, next) => {
  console.error('❌ Global error:', err.message);
  // No devolver 500 para archivos estáticos
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    return res.status(404).send('Not found');
  }
  res.status(500).json({
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Contacte al administrador'
  });
});

// 404 handler (SIEMPRE al final)
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// Tarea Programada (Cierre de Caja Diario 8:00 PM)
cron.schedule('0 20 * * *', async () => {
    console.log('🕒 Ejecutando cierre de caja diario...');
    try {
        const msg = await sendDailySummaryEmail(new Date());
        console.log(`${msg}`);
    } catch (error) {
        console.error('Error en cierre de caja:', error);
    }
}, { scheduled: true, timezone: "America/Bogota" });

// Auto-migración: crear tablas y verificar columnas al arrancar
async function ensureDatabaseSchema() {
  // Paso 1: Crear todas las tablas si no existen
  const tables = [
    `CREATE TABLE IF NOT EXISTS branches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      address TEXT,
      phone VARCHAR(50),
      is_active BOOLEAN DEFAULT TRUE,
      tenant_id INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant_branches (tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'cajero',
      branch_id INT DEFAULT NULL,
      tenant_id INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant_users (tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS suppliers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT DEFAULT NULL,
      name VARCHAR(255) NOT NULL,
      contact_name VARCHAR(255),
      phone VARCHAR(50),
      email VARCHAR(255),
      address TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant_suppliers (tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS inventory (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_name VARCHAR(255) NOT NULL,
      stock INT NOT NULL DEFAULT 0,
      price DECIMAL(10,2) NOT NULL,
      cost DECIMAL(10,2) DEFAULT 0,
      category VARCHAR(100),
      description TEXT,
      barcode VARCHAR(100),
      supplier_id INT DEFAULT NULL,
      tenant_id INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant_inventory (tenant_id),
      INDEX idx_barcode (barcode)
    )`,
    `CREATE TABLE IF NOT EXISTS branch_stocks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT DEFAULT NULL,
      branch_id INT DEFAULT NULL,
      product_id INT DEFAULT NULL,
      stock INT NOT NULL DEFAULT 0,
      UNIQUE KEY unique_branch_product (branch_id, product_id, tenant_id),
      INDEX idx_tenant_bs (tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      address TEXT,
      branch_id INT DEFAULT NULL,
      tenant_id INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant_clients (tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS sales (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT DEFAULT NULL,
      client_id INT DEFAULT NULL,
      branch_id INT DEFAULT NULL,
      total_price DECIMAL(10,2) NOT NULL,
      discount DECIMAL(10,2) DEFAULT 0,
      coupon_code VARCHAR(50),
      notes TEXT,
      sale_date DATETIME NOT NULL,
      is_credit BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant_sales (tenant_id),
      INDEX idx_sale_date (sale_date),
      INDEX idx_client_sales (client_id)
    )`,
    `CREATE TABLE IF NOT EXISTS sale_details (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT DEFAULT NULL,
      sale_id INT DEFAULT NULL,
      product_id INT DEFAULT NULL,
      quantity INT NOT NULL,
      subtotal DECIMAL(10,2) NOT NULL,
      INDEX idx_tenant_sd (tenant_id),
      INDEX idx_sale_sd (sale_id)
    )`,
    `CREATE TABLE IF NOT EXISTS coupons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT DEFAULT NULL,
      code VARCHAR(50) NOT NULL,
      discount_type ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
      value DECIMAL(10,2) NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      expiration_date DATE DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant_coupons (tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS credits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT DEFAULT NULL,
      sale_id INT DEFAULT NULL,
      client_id INT DEFAULT NULL,
      total_debt DECIMAL(10,2) NOT NULL,
      remaining_balance DECIMAL(10,2) NOT NULL,
      initial_payment DECIMAL(10,2) DEFAULT 0,
      status ENUM('pending','active','partial','paid') DEFAULT 'pending',
      next_payment_date DATE DEFAULT NULL,
      collected_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant_credits (tenant_id),
      INDEX idx_client_credits (client_id),
      INDEX idx_status (status)
    )`,
    `CREATE TABLE IF NOT EXISTS credit_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT DEFAULT NULL,
      credit_id INT DEFAULT NULL,
      amount DECIMAL(10,2) NOT NULL,
      payment_date DATETIME NOT NULL,
      notes TEXT,
      collector_id INT DEFAULT NULL,
      collected_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant_cp (tenant_id),
      INDEX idx_credit_cp (credit_id)
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT DEFAULT NULL,
      description TEXT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      category VARCHAR(100),
      supplier_id INT DEFAULT NULL,
      branch_id INT DEFAULT NULL,
      expense_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant_expenses (tenant_id),
      INDEX idx_expense_date (expense_date)
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT DEFAULT NULL UNIQUE,
      company_name VARCHAR(255),
      company_address TEXT,
      company_phone VARCHAR(50),
      company_email VARCHAR(255),
      company_logo VARCHAR(255),
      ticket_format VARCHAR(20) DEFAULT 'A4',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT DEFAULT NULL,
      user_id INT DEFAULT NULL,
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id INT DEFAULT NULL,
      details TEXT,
      ip_address VARCHAR(45),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant_audit (tenant_id),
      INDEX idx_created_audit (created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_transfers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT DEFAULT NULL,
      product_id INT DEFAULT NULL,
      from_branch_id INT DEFAULT NULL,
      to_branch_id INT DEFAULT NULL,
      quantity INT NOT NULL,
      user_id INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant_transfers (tenant_id)
    )`
  ];

  console.log('  📋 Verificando tablas...');
  for (const sql of tables) {
    try {
      await db.query(sql);
    } catch (err) {
      const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      console.log(`  ❌ Tabla ${match ? match[1] : '?'}: ${err.message}`);
    }
  }
  console.log('  ✅ Tablas verificadas');

  // Paso 2: Verificar columnas faltantes
  const alterations = [
    { table: 'branches', column: 'is_active', sql: 'ALTER TABLE branches ADD COLUMN is_active BOOLEAN DEFAULT TRUE' },
    { table: 'credits', column: 'initial_payment', sql: 'ALTER TABLE credits ADD COLUMN initial_payment DECIMAL(10,2) DEFAULT 0' },
    { table: 'credits', column: 'status', sql: "ALTER TABLE credits ADD COLUMN status ENUM('pending','active','partial','paid') DEFAULT 'pending'" },
    { table: 'credits', column: 'collected_by', sql: 'ALTER TABLE credits ADD COLUMN collected_by INT DEFAULT NULL' },
    { table: 'credits', column: 'next_payment_date', sql: 'ALTER TABLE credits ADD COLUMN next_payment_date DATE DEFAULT NULL' },
    { table: 'sales', column: 'is_credit', sql: 'ALTER TABLE sales ADD COLUMN is_credit BOOLEAN DEFAULT FALSE' },
    { table: 'sales', column: 'notes', sql: 'ALTER TABLE sales ADD COLUMN notes TEXT' },
    { table: 'sales', column: 'discount', sql: 'ALTER TABLE sales ADD COLUMN discount DECIMAL(10,2) DEFAULT 0' },
    { table: 'sales', column: 'coupon_code', sql: 'ALTER TABLE sales ADD COLUMN coupon_code VARCHAR(50)' },
    { table: 'inventory', column: 'cost', sql: 'ALTER TABLE inventory ADD COLUMN cost DECIMAL(10,2) DEFAULT 0' },
    { table: 'inventory', column: 'barcode', sql: 'ALTER TABLE inventory ADD COLUMN barcode VARCHAR(100)' },
    { table: 'inventory', column: 'supplier_id', sql: 'ALTER TABLE inventory ADD COLUMN supplier_id INT DEFAULT NULL' },
    { table: 'sale_details', column: 'tenant_id', sql: 'ALTER TABLE sale_details ADD COLUMN tenant_id INT DEFAULT NULL' },
  ];

  for (const alt of alterations) {
    try {
      const [cols] = await db.query(`SHOW COLUMNS FROM ${alt.table} LIKE '${alt.column}'`);
      if (cols.length === 0) {
        await db.query(alt.sql);
        console.log(`  ✅ Columna agregada: ${alt.table}.${alt.column}`);
      }
    } catch (err) {
      console.log(`  ⚠️ ${alt.table}.${alt.column}: ${err.message}`);
    }
  }

  // Paso 3: Datos iniciales
  try {
    const [branchRows] = await db.query('SELECT COUNT(*) as c FROM branches');
    if (branchRows[0].c === 0) {
      await db.query("INSERT INTO branches (name, address, tenant_id) VALUES ('Sede Principal', 'Oficina Central', 1)");
      console.log('  ✅ Sucursal principal creada');
    }
  } catch (err) { console.log('  ⚠️ Branches seed:', err.message); }

  try {
    const [setRows] = await db.query('SELECT COUNT(*) as c FROM settings');
    if (setRows[0].c === 0) {
      await db.query("INSERT INTO settings (tenant_id, company_name, ticket_format) VALUES (1, 'Business Control', 'A4')");
      console.log('  ✅ Configuración por defecto creada');
    }
  } catch (err) { console.log('  ⚠️ Settings seed:', err.message); }

  // Fix: Asegurar que todos los usuarios tengan tenant_id y branch_id
  try {
    const [updated] = await db.query('UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL');
    if (updated.affectedRows > 0) console.log(`  ✅ ${updated.affectedRows} usuario(s) actualizado(s) con tenant_id = 1`);
    const [updated2] = await db.query('UPDATE users SET branch_id = 1 WHERE branch_id IS NULL');
    if (updated2.affectedRows > 0) console.log(`  ✅ ${updated2.affectedRows} usuario(s) actualizado(s) con branch_id = 1`);
  } catch (err) { console.log('  ⚠️ Users fix:', err.message); }
}

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
  
  // Verificar conexión a BD al iniciar
  try {
    await db.query('SELECT 1');
    console.log('✅ Conexión a base de datos verificada');
    // Ejecutar auto-migración
    await ensureDatabaseSchema();
    console.log('✅ Esquema de base de datos verificado');
  } catch (error) {
    console.error('❌ Error conectando a la base de datos:', error.message);
  }
});
