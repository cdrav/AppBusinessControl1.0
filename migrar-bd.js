const db = require('./config/db');

async function migrateDatabase() {
  try {
    console.log('🔄 Iniciando migración de base de datos...');
    
    // Verificar si existe la columna is_credit en sales
    const [isCreditColumn] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'sales' 
      AND COLUMN_NAME = 'is_credit'
    `);
    
    if (isCreditColumn.length === 0) {
      console.log('➕ Agregando columna is_credit...');
      await db.query('ALTER TABLE sales ADD COLUMN is_credit BOOLEAN DEFAULT FALSE');
    } else {
      console.log('✅ Columna is_credit ya existe');
    }
    
    // Verificar y agregar otras columnas faltantes
    const columnsToAdd = [
      { name: 'discount', sql: 'ALTER TABLE sales ADD COLUMN discount DECIMAL(15, 2) DEFAULT 0' },
      { name: 'coupon_code', sql: 'ALTER TABLE sales ADD COLUMN coupon_code VARCHAR(50)' },
      { name: 'notes', sql: 'ALTER TABLE sales ADD COLUMN notes TEXT' },
      { name: 'branch_id', sql: 'ALTER TABLE sales ADD COLUMN branch_id INT' }
    ];
    
    for (const column of columnsToAdd) {
      const [exists] = await db.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'sales' 
        AND COLUMN_NAME = ?
      `, [column.name]);
      
      if (exists.length === 0) {
        console.log(`➕ Agregando columna ${column.name}...`);
        await db.query(column.sql);
      } else {
        console.log(`✅ Columna ${column.name} ya existe`);
      }
    }
    
    // Crear tabla credits si no existe
    console.log('➕ Verificando tabla credits...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS credits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_id INT,
        client_id INT,
        total_debt DECIMAL(15, 2) NOT NULL,
        remaining_balance DECIMAL(15, 2) NOT NULL,
        initial_payment DECIMAL(15, 2) DEFAULT 0,
        next_payment_date DATE,
        status ENUM('pending', 'partial', 'paid') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (client_id) REFERENCES clients(id)
      )
    `);
    
    // Crear tabla coupons si no existe
    console.log('➕ Verificando tabla coupons...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        discount_type ENUM('percent', 'fixed') DEFAULT 'percent',
        value DECIMAL(15, 2) NOT NULL,
        min_amount DECIMAL(15, 2) DEFAULT 0,
        max_uses INT DEFAULT 1,
        used_count INT DEFAULT 0,
        valid_from DATE,
        valid_until DATE,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Crear tabla branch_stocks si no existe
    console.log('➕ Verificando tabla branch_stocks...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS branch_stocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        product_id INT NOT NULL,
        stock INT NOT NULL DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_branch_product (branch_id, product_id),
        FOREIGN KEY (product_id) REFERENCES inventory(id) ON DELETE CASCADE
      )
    `);
    
    console.log('✅ Migración completada exitosamente');
    console.log('\n📊 Estructura actual de la tabla sales:');
    
    // Mostrar estructura actual
    const [salesColumns] = await db.query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'sales'
      ORDER BY ORDINAL_POSITION
    `);
    
    salesColumns.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
    });
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  }
}

migrateDatabase();
