const db = require('../config/db');

// Auto-migración: crear tablas y verificar columnas al arrancar
async function ensureDatabaseSchema() {
  // Paso 1: Crear todas las tablas si no existen
  const tables = [
    `CREATE TABLE IF NOT EXISTS tenants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      business_name VARCHAR(255) NOT NULL,
      owner_name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50),
      plan VARCHAR(50) DEFAULT 'basic',
      is_active BOOLEAN DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
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
      price DECIMAL(15,2) NOT NULL,
      cost DECIMAL(15,2) DEFAULT 0,
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
      total_price DECIMAL(15,2) NOT NULL,
      discount DECIMAL(15,2) DEFAULT 0,
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
      subtotal DECIMAL(15,2) NOT NULL,
      INDEX idx_tenant_sd (tenant_id),
      INDEX idx_sale_sd (sale_id)
    )`,
    `CREATE TABLE IF NOT EXISTS coupons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT DEFAULT NULL,
      code VARCHAR(50) NOT NULL,
      discount_type ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
      value DECIMAL(15,2) NOT NULL,
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
      total_debt DECIMAL(15,2) NOT NULL,
      remaining_balance DECIMAL(15,2) NOT NULL,
      initial_payment DECIMAL(15,2) DEFAULT 0,
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
      amount DECIMAL(15,2) NOT NULL,
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
      amount DECIMAL(15,2) NOT NULL,
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
    { table: 'credits', column: 'initial_payment', sql: 'ALTER TABLE credits ADD COLUMN initial_payment DECIMAL(15,2) DEFAULT 0' },
    { table: 'credits', column: 'status', sql: "ALTER TABLE credits ADD COLUMN status ENUM('pending','active','partial','paid') DEFAULT 'pending'" },
    { table: 'credits', column: 'collected_by', sql: 'ALTER TABLE credits ADD COLUMN collected_by INT DEFAULT NULL' },
    { table: 'credits', column: 'next_payment_date', sql: 'ALTER TABLE credits ADD COLUMN next_payment_date DATE DEFAULT NULL' },
    { table: 'sales', column: 'is_credit', sql: 'ALTER TABLE sales ADD COLUMN is_credit BOOLEAN DEFAULT FALSE' },
    { table: 'sales', column: 'notes', sql: 'ALTER TABLE sales ADD COLUMN notes TEXT' },
    { table: 'sales', column: 'discount', sql: 'ALTER TABLE sales ADD COLUMN discount DECIMAL(15,2) DEFAULT 0' },
    { table: 'sales', column: 'coupon_code', sql: 'ALTER TABLE sales ADD COLUMN coupon_code VARCHAR(50)' },
    { table: 'inventory', column: 'cost', sql: 'ALTER TABLE inventory ADD COLUMN cost DECIMAL(15,2) DEFAULT 0' },
    { table: 'inventory', column: 'barcode', sql: 'ALTER TABLE inventory ADD COLUMN barcode VARCHAR(100)' },
    { table: 'inventory', column: 'supplier_id', sql: 'ALTER TABLE inventory ADD COLUMN supplier_id INT DEFAULT NULL' },
    { table: 'sale_details', column: 'tenant_id', sql: 'ALTER TABLE sale_details ADD COLUMN tenant_id INT DEFAULT NULL' },
    { table: 'clients', column: 'is_active', sql: 'ALTER TABLE clients ADD COLUMN is_active BOOLEAN DEFAULT TRUE' },
    { table: 'inventory', column: 'is_active', sql: 'ALTER TABLE inventory ADD COLUMN is_active BOOLEAN DEFAULT TRUE' },
    { table: 'sales', column: 'sale_number', sql: 'ALTER TABLE sales ADD COLUMN sale_number VARCHAR(30) DEFAULT NULL' },
    { table: 'users', column: 'plain_password', sql: 'ALTER TABLE users ADD COLUMN plain_password VARCHAR(255) DEFAULT NULL' },
    { table: 'users', column: 'is_login_enabled', sql: 'ALTER TABLE users ADD COLUMN is_login_enabled BOOLEAN DEFAULT TRUE' },
    { table: 'tenants', column: 'is_active', sql: 'ALTER TABLE tenants ADD COLUMN is_active BOOLEAN DEFAULT TRUE' },
    { table: 'tenants', column: 'plan', sql: "ALTER TABLE tenants ADD COLUMN plan VARCHAR(50) DEFAULT 'basic'" },
    { table: 'tenants', column: 'notes', sql: 'ALTER TABLE tenants ADD COLUMN notes TEXT' },
    { table: 'tenants', column: 'updated_at', sql: 'ALTER TABLE tenants ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
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

  // Paso 2.5: Ampliar columnas DECIMAL(10,2) a DECIMAL(15,2) para montos grandes (COP)
  const decimalUpgrades = [
    'ALTER TABLE inventory MODIFY COLUMN price DECIMAL(15,2) NOT NULL',
    'ALTER TABLE inventory MODIFY COLUMN cost DECIMAL(15,2) DEFAULT 0',
    'ALTER TABLE sales MODIFY COLUMN total_price DECIMAL(15,2) NOT NULL',
    'ALTER TABLE sales MODIFY COLUMN discount DECIMAL(15,2) DEFAULT 0',
    'ALTER TABLE sale_details MODIFY COLUMN subtotal DECIMAL(15,2) NOT NULL',
    'ALTER TABLE credits MODIFY COLUMN total_debt DECIMAL(15,2) NOT NULL',
    'ALTER TABLE credits MODIFY COLUMN remaining_balance DECIMAL(15,2) NOT NULL',
    'ALTER TABLE credits MODIFY COLUMN initial_payment DECIMAL(15,2) DEFAULT 0',
    'ALTER TABLE credit_payments MODIFY COLUMN amount DECIMAL(15,2) NOT NULL',
    'ALTER TABLE expenses MODIFY COLUMN amount DECIMAL(15,2) NOT NULL',
    'ALTER TABLE coupons MODIFY COLUMN value DECIMAL(15,2) NOT NULL',
  ];

  for (const sql of decimalUpgrades) {
    try {
      await db.query(sql);
    } catch (err) {
      // Ignorar errores si la tabla no existe aún
    }
  }

  // Paso 3: Datos iniciales
  // Seed: Tenant por defecto
  try {
    const [tenantRows] = await db.query('SELECT COUNT(*) as c FROM tenants');
    if (tenantRows[0].c === 0) {
      await db.query("INSERT INTO tenants (id, business_name, owner_name, email, plan) VALUES (1, 'Mi Negocio', 'Administrador', '', 'basic')");
      console.log('  ✅ Tenant por defecto creado');
    }
  } catch (err) { console.log('  ⚠️ Tenants seed:', err.message); }

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

  // Seed: Crear superadmin si no existe
  try {
    const [saRows] = await db.query("SELECT id FROM users WHERE role = 'superadmin' LIMIT 1");
    if (saRows.length === 0) {
      const bcrypt = require('bcryptjs');
      const saPass = 'super@2026';
      const saHash = await bcrypt.hash(saPass, 10);
      await db.query(
        "INSERT INTO users (username, email, password, plain_password, role, tenant_id, branch_id) VALUES (?, ?, ?, ?, 'superadmin', 1, 1)",
        ['SuperAdmin', 'superadmin@businesscontrol.com', saHash, saPass]
      );
      console.log('  ✅ Usuario superadmin creado (superadmin@businesscontrol.com / super@2026)');
    }
  } catch (err) { console.log('  ⚠️ Superadmin seed:', err.message); }

  // Fix: Asegurar que todos los usuarios tengan tenant_id y branch_id
  try {
    const [updated] = await db.query('UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL');
    if (updated.affectedRows > 0) console.log(`  ✅ ${updated.affectedRows} usuario(s) actualizado(s) con tenant_id = 1`);
    const [updated2] = await db.query('UPDATE users SET branch_id = 1 WHERE branch_id IS NULL');
    if (updated2.affectedRows > 0) console.log(`  ✅ ${updated2.affectedRows} usuario(s) actualizado(s) con branch_id = 1`);
  } catch (err) { console.log('  ⚠️ Users fix:', err.message); }
}

module.exports = ensureDatabaseSchema;
