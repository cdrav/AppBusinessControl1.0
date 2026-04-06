const fs = require('fs');
const mysql = require('mysql2/promise');

async function setupDatabase() {
  try {
    console.log('🔧 Configurando base de datos...');
    
    // Conectar sin especificar base de datos
    const db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: ''
    });
    
    // Crear base de datos si no existe
    await db.execute('CREATE DATABASE IF NOT EXISTS business_control');
    console.log('✅ Base de datos creada');
    
    // Usar la base de datos
    await db.execute('USE business_control');
    
    // Leer y ejecutar el archivo SQL
    const sql = fs.readFileSync('database.sql', 'utf8');
    const statements = sql.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        await db.execute(statement);
      }
    }
    
    console.log('✅ Tablas creadas exitosamente');
    await db.end();
    
  } catch (error) {
    console.error('❌ Error configurando la base de datos:', error.message);
    process.exit(1);
  }
}

setupDatabase();
