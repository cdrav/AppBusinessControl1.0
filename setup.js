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
        price DECIMAL(15, 2) NOT NULL,
        category VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT,
        total_price DECIMAL(15, 2) NOT NULL,
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

    // 5.5. Migración: Agregar columna 'barcode' si no existe
    const [columns] = await connection.query("SHOW COLUMNS FROM inventory LIKE 'barcode'");
    if (columns.length === 0) {
      await connection.query("ALTER TABLE inventory ADD COLUMN barcode VARCHAR(50) UNIQUE AFTER id");
      console.log("✅ Columna 'barcode' agregada a la tabla inventory.");
    }

    // 5.6. Crear tabla de configuración
    await connection.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT PRIMARY KEY,
        company_name VARCHAR(255) DEFAULT 'Business Control',
        company_address VARCHAR(255) DEFAULT 'Calle Principal #123',
        company_phone VARCHAR(50) DEFAULT '555-0000',
        company_email VARCHAR(100) DEFAULT 'contacto@empresa.com'
      )
    `);
    // Insertar configuración por defecto si no existe (usamos INSERT IGNORE para MySQL)
    await connection.query(`INSERT IGNORE INTO settings (id, company_name) VALUES (1, 'Business Control')`);
    console.log('✅ Tabla de configuración verificada.');

    // 5.7. Migración: Agregar columna 'company_logo' si no existe
    const [settingsColumns] = await connection.query("SHOW COLUMNS FROM settings LIKE 'company_logo'");
    if (settingsColumns.length === 0) {
      await connection.query("ALTER TABLE settings ADD COLUMN company_logo VARCHAR(255) AFTER company_email");
      console.log("✅ Columna 'company_logo' agregada a la tabla settings.");
    }

    // 5.7.1. Migración: Agregar columna 'ticket_format' si no existe
    const [ticketFormatCols] = await connection.query("SHOW COLUMNS FROM settings LIKE 'ticket_format'");
    if (ticketFormatCols.length === 0) {
      await connection.query("ALTER TABLE settings ADD COLUMN ticket_format VARCHAR(20) DEFAULT 'A4' AFTER company_logo");
      console.log("✅ Columna 'ticket_format' agregada a la tabla settings.");
    }

    // 5.7.2. Migración: Agregar columna 'cost' a inventory
    const [costCols] = await connection.query("SHOW COLUMNS FROM inventory LIKE 'cost'");
    if (costCols.length === 0) {
      await connection.query("ALTER TABLE inventory ADD COLUMN cost DECIMAL(10, 2) DEFAULT 0 AFTER price");
      console.log("✅ Columna 'cost' agregada a la tabla inventory.");
    }

    // 5.8. Crear tabla de cupones
    await connection.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        discount_type ENUM('percent', 'fixed') NOT NULL,
        value DECIMAL(10, 2) NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        expiration_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 5.9. Migración: Agregar columnas de descuento a ventas
    await connection.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount DECIMAL(10, 2) DEFAULT 0 AFTER total_price");
    await connection.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50) AFTER discount");
    console.log("✅ Soporte para descuentos y cupones agregado.");

    // 5.10. Migración: Agregar columna 'notes' a ventas
    await connection.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS notes TEXT AFTER coupon_code");
    console.log("✅ Columna 'notes' agregada a la tabla sales.");

    // 5.11. Crear tabla de proveedores
    await connection.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact_name VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(100),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5.12. Migración: Agregar columna 'supplier_id' a inventory
    const [supplierCols] = await connection.query("SHOW COLUMNS FROM inventory LIKE 'supplier_id'");
    if (supplierCols.length === 0) {
      await connection.query("ALTER TABLE inventory ADD COLUMN supplier_id INT AFTER category");
      // Opcional: Agregar Foreign Key si deseas integridad estricta, o dejarlo flexible
      // await connection.query("ALTER TABLE inventory ADD CONSTRAINT fk_inventory_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL");
      console.log("✅ Columna 'supplier_id' agregada a la tabla inventory.");
    }

    // ==================================================================
    // 5.13. SOPORTE MULTI-SUCURSAL (NUEVO)
    // ==================================================================
    
    // A. Crear tabla de Sucursales
    await connection.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(255),
        phone VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // B. Crear Sede Principal por defecto si no existe ninguna
    const [branches] = await connection.query('SELECT * FROM branches');
    let defaultBranchId = 1;
    if (branches.length === 0) {
        const [res] = await connection.query("INSERT INTO branches (name, address) VALUES ('Sede Principal', 'Oficina Central')");
        defaultBranchId = res.insertId;
        console.log("✅ Sede Principal creada automáticamente.");
    } else {
        defaultBranchId = branches[0].id;
    }

    // C. Crear tabla de Stock por Sucursal (Relación Muchos a Muchos)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS branch_stocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        product_id INT NOT NULL,
        stock INT NOT NULL DEFAULT 0,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES inventory(id) ON DELETE CASCADE,
        UNIQUE KEY unique_stock (branch_id, product_id)
      )
    `);

    // D. Migración: Mover stock existente a la Sede Principal
    // Si la tabla branch_stocks está vacía, copiamos el stock actual de la tabla inventory
    const [stockCount] = await connection.query('SELECT COUNT(*) as count FROM branch_stocks');
    if (stockCount[0].count === 0) {
        console.log("🔄 Migrando inventario actual a la Sede Principal...");
        // Insertamos en la nueva tabla tomando los datos de la vieja
        await connection.query(`
            INSERT INTO branch_stocks (branch_id, product_id, stock)
            SELECT ?, id, stock FROM inventory WHERE stock > 0
        `, [defaultBranchId]);
        console.log("✅ Inventario migrado exitosamente.");
    }

    // E. Actualizar Usuarios para pertenecer a una sede
    const [userCols] = await connection.query("SHOW COLUMNS FROM users LIKE 'branch_id'");
    if (userCols.length === 0) {
        await connection.query("ALTER TABLE users ADD COLUMN branch_id INT DEFAULT ? AFTER role", [defaultBranchId]);
        await connection.query("ALTER TABLE users ADD CONSTRAINT fk_user_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL");
        console.log("✅ Usuarios vinculados a la Sede Principal.");
    }

    // F. Actualizar Ventas para saber dónde se hicieron
    const [saleCols] = await connection.query("SHOW COLUMNS FROM sales LIKE 'branch_id'");
    if (saleCols.length === 0) {
        await connection.query("ALTER TABLE sales ADD COLUMN branch_id INT DEFAULT ? AFTER client_id", [defaultBranchId]);
        await connection.query("ALTER TABLE sales ADD CONSTRAINT fk_sale_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL");
        console.log("✅ Historial de ventas vinculado a la Sede Principal.");
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

    // 7. Verificación y corrección de tipos de columna DECIMAL
    console.log('🔄 Verificando precisión de columnas de moneda...');
    const columnsToAlter = [
        { table: 'inventory', column: 'price', type: 'DECIMAL(15, 2) NOT NULL' },
        { table: 'inventory', column: 'cost', type: 'DECIMAL(15, 2) DEFAULT 0' },
        { table: 'sales', column: 'total_price', type: 'DECIMAL(15, 2) NOT NULL' },
        { table: 'sales', column: 'discount', type: 'DECIMAL(15, 2) DEFAULT 0' },
        { table: 'sale_details', column: 'subtotal', type: 'DECIMAL(15, 2) NOT NULL' }
    ];

    for (const col of columnsToAlter) {
        const [columnInfo] = await connection.query(`SHOW COLUMNS FROM \`${col.table}\` LIKE '${col.column}'`);
        // Comprueba si la columna existe y si su tipo no es el deseado
        if (columnInfo.length > 0 && columnInfo[0].Type !== 'decimal(15,2)') {
            await connection.query(`ALTER TABLE \`${col.table}\` MODIFY COLUMN \`${col.column}\` ${col.type}`);
            console.log(`✅ Columna '${col.column}' en tabla '${col.table}' actualizada a DECIMAL(15, 2).`);
        }
    }
    console.log('✅ Precisión de moneda verificada.');

    console.log('\n🎉 ¡Instalación completada con éxito!');
    console.log('Ahora puedes ejecutar: node server.js');

  } catch (error) {
    console.error('❌ Error durante la instalación:', error);
  } finally {
    if (connection) connection.end();
  }
}

setup();