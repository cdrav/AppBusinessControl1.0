/**
 * Business Control - Setup Completo de Base de Datos
 * Crea todas las tablas necesarias si no existen y verifica columnas faltantes.
 * Ejecutar: node setup-database.js
 */
const db = require('./config/db');
const bcrypt = require('bcrypt');

const TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS branches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
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

// Columnas que podrían faltar en tablas ya existentes
const ALTER_COLUMNS = [
  { table: 'inventory', column: 'cost', sql: 'ALTER TABLE inventory ADD COLUMN cost DECIMAL(10,2) DEFAULT 0' },
  { table: 'inventory', column: 'barcode', sql: 'ALTER TABLE inventory ADD COLUMN barcode VARCHAR(100)' },
  { table: 'inventory', column: 'supplier_id', sql: 'ALTER TABLE inventory ADD COLUMN supplier_id INT DEFAULT NULL' },
  { table: 'sales', column: 'discount', sql: 'ALTER TABLE sales ADD COLUMN discount DECIMAL(10,2) DEFAULT 0' },
  { table: 'sales', column: 'coupon_code', sql: 'ALTER TABLE sales ADD COLUMN coupon_code VARCHAR(50)' },
  { table: 'sales', column: 'notes', sql: 'ALTER TABLE sales ADD COLUMN notes TEXT' },
  { table: 'sales', column: 'is_credit', sql: 'ALTER TABLE sales ADD COLUMN is_credit BOOLEAN DEFAULT FALSE' },
  { table: 'sale_details', column: 'tenant_id', sql: 'ALTER TABLE sale_details ADD COLUMN tenant_id INT DEFAULT NULL' },
  { table: 'credits', column: 'status', sql: "ALTER TABLE credits ADD COLUMN status ENUM('pending','active','partial','paid') DEFAULT 'pending'" },
  { table: 'credits', column: 'initial_payment', sql: 'ALTER TABLE credits ADD COLUMN initial_payment DECIMAL(10,2) DEFAULT 0' },
  { table: 'credits', column: 'collected_by', sql: 'ALTER TABLE credits ADD COLUMN collected_by INT DEFAULT NULL' },
  { table: 'credits', column: 'next_payment_date', sql: 'ALTER TABLE credits ADD COLUMN next_payment_date DATE DEFAULT NULL' },
  { table: 'credits', column: 'created_at', sql: 'ALTER TABLE credits ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
];

async function run() {
  console.log('🚀 SETUP COMPLETO DE BASE DE DATOS - Business Control\n');
  console.log('='.repeat(60));

  let created = 0, altered = 0, errors = 0;

  // Paso 1: Crear tablas
  console.log('\n📋 Paso 1: Creando tablas...\n');
  for (const sql of TABLES_SQL) {
    const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
    const name = match ? match[1] : '?';
    try {
      await db.query(sql);
      console.log('  ✅ ' + name);
      created++;
    } catch (err) {
      console.log('  ❌ ' + name + ': ' + err.message);
      errors++;
    }
  }

  // Paso 2: Verificar columnas faltantes
  console.log('\n📋 Paso 2: Verificando columnas faltantes...\n');
  for (const alt of ALTER_COLUMNS) {
    try {
      const [cols] = await db.query('SHOW COLUMNS FROM ' + alt.table + " LIKE '" + alt.column + "'");
      if (cols.length === 0) {
        await db.query(alt.sql);
        console.log('  ✅ Agregada ' + alt.table + '.' + alt.column);
        altered++;
      } else {
        console.log('  ⏭️  ' + alt.table + '.' + alt.column + ' ya existe');
      }
    } catch (err) {
      console.log('  ❌ ' + alt.table + '.' + alt.column + ': ' + err.message);
      errors++;
    }
  }

  // Paso 3: Datos iniciales
  console.log('\n📋 Paso 3: Verificando datos iniciales...\n');

  try {
    const [branchRows] = await db.query('SELECT COUNT(*) as c FROM branches');
    if (branchRows[0].c === 0) {
      await db.query("INSERT INTO branches (name, address, tenant_id) VALUES ('Sede Principal', 'Oficina Central', 1)");
      console.log('  ✅ Sucursal principal creada');
    } else {
      console.log('  ⏭️  ' + branchRows[0].c + ' sucursal(es) ya existen');
    }
  } catch (err) { console.log('  ❌ Branches: ' + err.message); errors++; }

  try {
    const [setRows] = await db.query('SELECT COUNT(*) as c FROM settings');
    if (setRows[0].c === 0) {
      await db.query("INSERT INTO settings (tenant_id, company_name, ticket_format) VALUES (1, 'Business Control', 'A4')");
      console.log('  ✅ Configuración por defecto creada');
    } else {
      console.log('  ⏭️  Configuración ya existe');
    }
  } catch (err) { console.log('  ❌ Settings: ' + err.message); errors++; }

  try {
    const [adminRows] = await db.query("SELECT COUNT(*) as c FROM users WHERE role = 'admin'");
    if (adminRows[0].c === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await db.query("INSERT INTO users (username, email, password, role, branch_id, tenant_id) VALUES ('admin', 'admin@businesscontrol.com', ?, 'admin', 1, 1)", [hash]);
      console.log('  ✅ Usuario admin creado (admin@businesscontrol.com / admin123)');
    } else {
      console.log('  ⏭️  ' + adminRows[0].c + ' admin(s) ya existen');
    }
  } catch (err) { console.log('  ❌ Admin: ' + err.message); errors++; }

  // Resumen
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN');
  console.log('  Tablas verificadas/creadas: ' + created);
  console.log('  Columnas agregadas: ' + altered);
  console.log('  Errores: ' + errors);
  if (errors === 0) {
    console.log('\n🎉 ¡Base de datos lista! No hay errores.');
  } else {
    console.log('\n⚠️ Hubo ' + errors + ' error(es). Revisa los mensajes arriba.');
  }

  process.exit(0);
}

run().catch(function(err) { console.error('❌ Error fatal:', err); process.exit(1); });
