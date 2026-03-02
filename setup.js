require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function setup() {
  console.log('🔄 Iniciando configuración de la base de datos...');

  // --- DIAGNÓSTICO DE VARIABLES ---
  console.log('🔍 Verificando variables de entorno:');
  console.log(`   DB_HOST: ${process.env.DB_HOST || '❌ NO DEFINIDO (Usando localhost)'}`);
  console.log(`   DB_USER: ${process.env.DB_USER || '❌ NO DEFINIDO (Usando root)'}`);
  console.log(`   DB_NAME: ${process.env.DB_NAME || '❌ NO DEFINIDO (Usando business_control)'}`);

  let connection;
  try {
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306
    };

    // MEJORA: Si Railway nos da el nombre de la BD, nos conectamos directo a ella
    // Esto evita el error de "Access denied for user... to database" al intentar crearla
    if (process.env.DB_NAME) {
        dbConfig.database = process.env.DB_NAME;
        console.log(`🔌 Intentando conectar directamente a la base de datos: ${process.env.DB_NAME}`);
    }

    connection = await mysql.createConnection(dbConfig);
    console.log('✅ ¡Conexión exitosa al servidor MySQL!');

  } catch (error) {
    console.error('❌ Error CRÍTICO de conexión:');
    console.error('   Mensaje:', error.message);
    console.error('   Código:', error.code);
    if (error.code === 'ECONNREFUSED') {
        console.error('   👉 PISTA: La aplicación no encuentra la base de datos. Revisa las Variables en Railway.');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('   👉 PISTA: Usuario o contraseña incorrectos.');
    }
    process.exit(1); // Detener despliegue
  }

  try {
    // Solo intentamos crear la base de datos si NO estamos usando la de Railway
    if (!process.env.DB_NAME) {
        const dbName = 'business_control';
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await connection.changeUser({ database: dbName });
        console.log(`✅ Base de datos local '${dbName}' creada/seleccionada.`);
    }

    // 4. Crear Tablas
    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        branch_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        product_name VARCHAR(255) NOT NULL,
        stock INT NOT NULL DEFAULT 0,
        price DECIMAL(15, 2) NOT NULL,
        cost DECIMAL(15, 2) DEFAULT 0,
        category VARCHAR(100),
        description TEXT,
        barcode VARCHAR(50) UNIQUE,
        supplier_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT,
        branch_id INT,
        total_price DECIMAL(15, 2) NOT NULL,
        discount DECIMAL(15, 2) DEFAULT 0,
        coupon_code VARCHAR(50),
        notes TEXT,
        sale_date DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id)
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
    console.log('✅ Tablas creadas correctamente.');

    // --- DATOS INICIALES ---
    
    // 1. Configuración
    await connection.query(`INSERT IGNORE INTO settings (id, company_name) VALUES (1, 'Business Control')`);

    // 2. Sucursal Principal
    const [branches] = await connection.query('SELECT * FROM branches');
    let defaultBranchId = 1;
    if (branches.length === 0) {
        const [res] = await connection.query("INSERT INTO branches (name, address) VALUES ('Sede Principal', 'Oficina Central')");
        defaultBranchId = res.insertId;
        console.log("✅ Sede Principal creada.");
    } else {
        defaultBranchId = branches[0].id;
    }

    // 3. Usuario Admin
    const adminEmail = 'admin@business.com';
    const [users] = await connection.query('SELECT * FROM users WHERE email = ?', [adminEmail]);
    if (users.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await connection.query(
        'INSERT INTO users (username, email, password, role, branch_id) VALUES (?, ?, ?, ?, ?)',
        ['admin', adminEmail, hashedPassword, 'admin', defaultBranchId]
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
