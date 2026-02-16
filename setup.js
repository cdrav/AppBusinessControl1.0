require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function setup() {
  console.log('🔄 Iniciando configuración de la base de datos...');

  // 1. Conectar a MySQL sin especificar base de datos (para poder crearla)
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306
    });
  } catch (error) {
    console.error('❌ Error de conexión: No se pudo conectar a MySQL.');
    console.error('   Asegúrate de que XAMPP esté encendido y MySQL en verde.');
    return;
  }

  try {
    // 2. Crear Base de Datos
    const dbName = process.env.DB_NAME || 'business_control';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`✅ Base de datos '${dbName}' creada o verificada.`);

    // 3. Usar la base de datos
    await connection.changeUser({ database: dbName });

    // 4. Crear Tablas
    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
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
        price DECIMAL(10, 2) NOT NULL,
        category VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT,
        total_price DECIMAL(10, 2) NOT NULL,
        sale_date DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id)
      )`,
      `CREATE TABLE IF NOT EXISTS sale_details (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_id INT,
        product_id INT,
        quantity INT NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (product_id) REFERENCES inventory(id)
      )`
    ];

    for (const sql of tables) {
      await connection.query(sql);
    }
    console.log('✅ Tablas creadas correctamente.');

    // 5. Insertar Productos de Prueba (Si está vacío)
    const [products] = await connection.query('SELECT count(*) as count FROM inventory');
    if (products[0].count === 0) {
      const seedProducts = [
        ['Laptop HP Pavilion 15"', 10, 750.00, 'electronics', 'Laptop ideal para oficina, Core i5, 8GB RAM'],
        ['Mouse Inalámbrico Logitech', 50, 25.50, 'electronics', 'Mouse ergonómico con batería de larga duración'],
        ['Teclado Mecánico RGB', 30, 45.00, 'electronics', 'Teclado gamer con switches azules'],
        ['Monitor Samsung 24" FHD', 20, 180.00, 'electronics', 'Monitor LED Full HD con HDMI y VGA'],
        ['Silla Ergonómica Ejecutiva', 15, 120.00, 'furniture', 'Silla de oficina con soporte lumbar ajustable'],
        ['Escritorio de Vidrio', 10, 200.00, 'furniture', 'Escritorio moderno en L para oficina'],
        ['Paquete de Hojas Bond A4', 100, 5.00, 'stationery', 'Resma de 500 hojas ultra blancas'],
        ['Bolígrafos Bic (Caja)', 200, 3.50, 'stationery', 'Caja de 12 bolígrafos tinta negra'],
        ['Disco Duro Externo 1TB', 25, 60.00, 'electronics', 'Almacenamiento portátil USB 3.0'],
        ['Impresora Multifuncional Epson', 8, 250.00, 'electronics', 'Impresora de tanque de tinta continua']
      ];
      
      await connection.query(
        'INSERT INTO inventory (product_name, stock, price, category, description) VALUES ?',
        [seedProducts]
      );
      console.log('✅ Productos de prueba insertados.');
    }

    // 6. Crear Usuario Admin (Si no existe)
    const adminEmail = 'admin@business.com';
    const [users] = await connection.query('SELECT * FROM users WHERE email = ?', [adminEmail]);
    
    if (users.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await connection.query(
        'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
        ['admin', adminEmail, hashedPassword, 'admin']
      );
      console.log('✅ Usuario Administrador creado:\n   📧 Email: admin@business.com\n   🔑 Pass:  admin123');
    } else {
      console.log('ℹ️ El usuario administrador ya existe (admin@business.com).');
    }

    console.log('\n🎉 ¡Instalación completada con éxito!');
    console.log('Ahora puedes ejecutar: node server.js');

  } catch (error) {
    console.error('❌ Error durante la instalación:', error);
  } finally {
    if (connection) connection.end();
  }
}

setup();