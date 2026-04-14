const fs = require('fs');
const mysql = require('mysql2/promise');

async function setupRailwayDatabase() {
  try {
    console.log('🚀 Configurando base de datos para Railway...');
    
    // Conectar sin especificar base de datos primero
    const db = await mysql.createConnection({
      host: process.env.DB_HOST || 'yamabiko.proxy.rlwy.net',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 15388,
      ssl: { rejectUnauthorized: false }
    });
    
    console.log('✅ Conectado a Railway MySQL (sin BD)');
    
    // Crear base de datos si no existe
    await db.execute(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'railway'}\``);
    console.log('✅ Base de datos creada o verificada');
    
    // Cerrar conexión inicial
    await db.end();
    
    // Conectar ahora con la base de datos
    const dbWithSchema = await mysql.createConnection({
      host: process.env.DB_HOST || 'yamabiko.proxy.rlwy.net',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'railway',
      port: process.env.DB_PORT || 15388,
      ssl: { rejectUnauthorized: false }
    });
    
    console.log('✅ Conectado a la base de datos');
    
    // Verificar si existe la tabla users
    const [tables] = await dbWithSchema.execute("SHOW TABLES LIKE 'users'");
    
    if (tables.length === 0) {
      console.log('📋 Creando tablas...');
      
      // Crear tablas necesarias
      const createUsersSQL = `
        CREATE TABLE users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'cajero',
          branch_id INT DEFAULT NULL,
          tenant_id INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      const createClientsSQL = `
        CREATE TABLE clients (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          phone VARCHAR(50),
          address TEXT,
          branch_id INT DEFAULT NULL,
          tenant_id INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      const createInventorySQL = `
        CREATE TABLE inventory (
          id INT AUTO_INCREMENT PRIMARY KEY,
          product_name VARCHAR(255) NOT NULL,
          stock INT NOT NULL DEFAULT 0,
          price DECIMAL(10, 2) NOT NULL,
          category VARCHAR(100),
          description TEXT,
          branch_id INT DEFAULT NULL,
          tenant_id INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      const createSalesSQL = `
        CREATE TABLE sales (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT,
          total_price DECIMAL(10, 2) NOT NULL,
          sale_date DATETIME NOT NULL,
          branch_id INT DEFAULT NULL,
          tenant_id INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(id)
        )
      `;
      
      const createSaleDetailsSQL = `
        CREATE TABLE sale_details (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sale_id INT,
          product_id INT,
          quantity INT NOT NULL,
          subtotal DECIMAL(10, 2) NOT NULL,
          FOREIGN KEY (sale_id) REFERENCES sales(id),
          FOREIGN KEY (product_id) REFERENCES inventory(id)
        )
      `;
      
      await dbWithSchema.execute(createUsersSQL);
      await dbWithSchema.execute(createClientsSQL);
      await dbWithSchema.execute(createInventorySQL);
      await dbWithSchema.execute(createSalesSQL);
      await dbWithSchema.execute(createSaleDetailsSQL);
      
      console.log('✅ Tablas creadas exitosamente');
      
      // Crear usuario admin por defecto
      const bcrypt = require('bcrypt');
      const adminPassword = await bcrypt.hash('admin123', 10);
      
      await dbWithSchema.execute(
        'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
        ['admin', 'admin@businesscontrol.com', adminPassword, 'admin']
      );
      
      console.log('✅ Usuario admin creado: admin@businesscontrol.com / admin123');
      
    } else {
      console.log('✅ Las tablas ya existen');
    }
    
    await dbWithSchema.end();
    console.log('🎉 Base de datos lista para Railway');
    
  } catch (error) {
    console.error('❌ Error configurando Railway DB:', error.message);
    // No hacer exit(1) para que el servidor pueda continuar
  }
}

// Ejecutar solo si este archivo se corre directamente
if (require.main === module) {
  setupRailwayDatabase();
}

module.exports = setupRailwayDatabase;
