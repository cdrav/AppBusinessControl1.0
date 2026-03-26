require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function setup() {
  console.log('🔄 Iniciando configuración de la base de datos...');

  let connection;
  try {
    // 1. Conectar al servidor MySQL SIN especificar una base de datos
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306
    };
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión inicial al servidor MySQL exitosa.');

  } catch (error) {
    console.error('❌ Error CRÍTICO de conexión:');
    console.error('   Mensaje:', error.message);
    console.error('   Código:', error.code);
    
    if (error.code === 'ECONNREFUSED') {
        console.error('   👉 PISTA: La aplicación no encuentra la base de datos. Revisa las Variables en Railway.');
    } else if (error.code === 'ETIMEDOUT') {
        console.error('   👉 PISTA: Tiempo de espera agotado. Verifica que el DB_HOST sea correcto (usa el dominio privado) y que la base de datos esté activa.');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('   👉 PISTA: Usuario o contraseña incorrectos.');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
        console.error('   👉 PISTA: La base de datos especificada no existe.');
    }
    
    process.exit(1); // Detener el despliegue si falla la conexión
  }

  try {
    // 2. Asegurarse de que la base de datos exista y seleccionarla
    const dbName = process.env.DB_NAME || 'business_control';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await connection.changeUser({ database: dbName });
    console.log(`✅ Base de datos '${dbName}' creada/seleccionada.`);

    // --- REPARACIÓN AVANZADA DE TABLAS ---
    // En lugar de borrar la BD, borramos todas las tablas para evitar errores de 'rmdir'.
    console.log(`🧹 Forzando limpieza de todas las tablas en '${dbName}'...`);
    await connection.query(`SET FOREIGN_KEY_CHECKS = 0;`);
    const [tablesToDrop] = await connection.query(`SHOW TABLES;`);
    for (const tableRow of tablesToDrop) {
        const tableName = Object.values(tableRow)[0];
        await connection.query(`DROP TABLE IF EXISTS \`${tableName}\`;`);
    }
    await connection.query(`SET FOREIGN_KEY_CHECKS = 1;`);
    console.log('✅ Todas las tablas existentes han sido eliminadas para una recreación limpia.');

    // 3. --- CREACIÓN DE TABLAS ---
    const tables = [
      `CREATE TABLE IF NOT EXISTS tenants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        plan_type ENUM('basic', 'pro', 'enterprise') DEFAULT 'basic',
        status ENUM('active', 'suspended', 'trial') DEFAULT 'trial',
        db_prefix VARCHAR(50) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        username VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        branch_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS clients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        product_name VARCHAR(255) NOT NULL,
        stock INT NOT NULL DEFAULT 0,
        price DECIMAL(15, 2) NOT NULL,
        cost DECIMAL(15, 2) DEFAULT 0,
        category VARCHAR(100),
        description TEXT,
        barcode VARCHAR(50) UNIQUE,
        supplier_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        client_id INT,
        branch_id INT,
        total_price DECIMAL(15, 2) NOT NULL,
        discount DECIMAL(15, 2) DEFAULT 0,
        coupon_code VARCHAR(50),
        notes TEXT,
        sale_date DATETIME NOT NULL,
        is_credit BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS credits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        sale_id INT,
        client_id INT,
        total_debt DECIMAL(15, 2) NOT NULL,
        remaining_balance DECIMAL(15, 2) NOT NULL,
        status ENUM('active', 'paid', 'default') DEFAULT 'active',
        next_payment_date DATE,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS credit_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        credit_id INT,
        collector_id INT,
        amount DECIMAL(15, 2) NOT NULL,
        payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        payment_method VARCHAR(50) DEFAULT 'cash',
        notes TEXT,
        FOREIGN KEY (credit_id) REFERENCES credits(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS sale_details (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_id INT,
        product_id INT,
        quantity INT NOT NULL,
        subtotal DECIMAL(15, 2) NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (product_id) REFERENCES inventory(id)
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        id INT PRIMARY KEY,
        tenant_id INT,
        company_name VARCHAR(255) DEFAULT 'Business Control',
        company_address VARCHAR(255) DEFAULT 'Calle Principal #123',
        company_phone VARCHAR(50) DEFAULT '555-0000',
        company_email VARCHAR(100) DEFAULT 'contacto@empresa.com',
        company_logo VARCHAR(255),
        ticket_format VARCHAR(20) DEFAULT 'A4'
      )`,
      `CREATE TABLE IF NOT EXISTS coupons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        discount_type ENUM('percent', 'fixed') NOT NULL,
        value DECIMAL(10, 2) NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        expiration_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact_name VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(100),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS branches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(255),
        phone VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS branch_stocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        product_id INT NOT NULL,
        stock INT NOT NULL DEFAULT 0,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES inventory(id) ON DELETE CASCADE,
        UNIQUE KEY unique_stock (branch_id, product_id)
      )`,
      `CREATE TABLE IF NOT EXISTS expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        description VARCHAR(255) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        category VARCHAR(100),
        supplier_id INT,
        branch_id INT,
        expense_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
      )`,
      `CREATE TABLE IF NOT EXISTS inventory_transfers (
        id INT AUTO_INCREMENT PRIMARY KEY, 
        product_id INT, 
        from_branch_id INT, 
        to_branch_id INT, 
        quantity INT, 
        user_id INT, 
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const sql of tables) {
      await connection.query(sql);
    }
    console.log('✅ Todas las tablas fueron creadas/verificadas correctamente.');

    // --- DATOS INICIALES ---
    
    // 1. Configuración
    await connection.query(`INSERT IGNORE INTO settings (id, company_name) VALUES (1, 'Business Control')`);

    // 2. Tenant Inicial (Demo/Admin)
    const [tenants] = await connection.query('SELECT * FROM tenants');
    let defaultTenantId = 1;
    if (tenants.length === 0) {
        const [res] = await connection.query("INSERT INTO tenants (name, plan_type, status) VALUES ('Empresa Default', 'enterprise', 'active')");
        defaultTenantId = res.insertId;
        console.log("✅ Tenant inicial creado.");
    } else {
        defaultTenantId = tenants[0].id;
    }

    // 3. Sucursal Principal vinculada al Tenant
    const [branches] = await connection.query('SELECT * FROM branches');
    let defaultBranchId = 1;
    if (branches.length === 0) {
        const [res] = await connection.query("INSERT INTO branches (name, address) VALUES ('Sede Principal', 'Oficina Central')");
        defaultBranchId = res.insertId;
    } else {
        defaultBranchId = branches[0].id;
    }

    // 4. Usuario Admin vinculado al Tenant
    const adminEmail = 'admin@business.com';
    const [users] = await connection.query('SELECT * FROM users WHERE email = ?', [adminEmail]);
    if (users.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await connection.query(
        'INSERT INTO users (tenant_id, username, email, password, role, branch_id) VALUES (?, ?, ?, ?, ?, ?)',
        [defaultTenantId, 'admin', adminEmail, hashedPassword, 'admin', defaultBranchId]
      );
      console.log('✅ Usuario Admin creado (admin@business.com / admin123)');
    }

    console.log('\n🎉 ¡Instalación completada con éxito!');

  } catch (error) {
    console.error('❌ Error durante la configuración de tablas:', error);
    process.exit(1);
  } finally {
    if (connection) connection.end();
  }
}

setup();
