#!/usr/bin/env node

const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.test' });

async function setupTestDatabase() {
  console.log('🔄 Configurando base de datos de testing...');
  
  let connection;
  try {
    // Conectar sin especificar base de datos
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306
    });

    // Crear y usar base de datos de testing
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
    await connection.changeUser({ database: process.env.DB_NAME });
    
    console.log(`✅ Base de datos '${process.env.DB_NAME}' lista para testing`);

    // Limpiar tablas antes de los tests
    const tables = [
      'sale_details', 'sales', 'branch_stocks', 'inventory', 
      'clients', 'users', 'branches'
    ];
    
    for (const table of tables) {
      await connection.query(`DELETE FROM ${table}`);
    }
    
    // Insertar datos básicos
    await connection.query(`
      INSERT INTO branches (id, name, address) VALUES 
      (1, 'Sucursal Principal', 'Dirección Test')
    `);
    
    console.log('🧹 Base de datos limpiada y con datos iniciales');
    
  } catch (error) {
    console.error('❌ Error configurando base de datos de testing:', error);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  setupTestDatabase();
}

module.exports = setupTestDatabase;
