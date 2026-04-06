const db = require('./config/db');

async function fixCriticalIssues() {
    console.log('🛠️ CORRECIÓN AUTOMÁTICA DE PROBLEMAS CRÍTICOS\n');
    console.log('='.repeat(60));
    
    let fixesApplied = 0;
    
    try {
        // PROBLEMA 1: Verificar y crear tablas faltantes
        console.log('🔍 PROBLEMA 1: Tablas faltantes');
        const [existingTables] = await db.query('SHOW TABLES');
        const tableNames = existingTables.map(row => Object.values(row)[0]);
        
        // Tablas críticas que deben existir
        const criticalTables = [
            'users', 'branches', 'inventory', 'branch_stocks', 
            'clients', 'sales', 'sale_details', 'suppliers', 
            'expenses', 'settings', 'audit_logs'
        ];
        
        for (const tableName of criticalTables) {
            if (!tableNames.includes(tableName)) {
                console.log(`   📝 Creando tabla: ${tableName}`);
                await createTable(tableName);
                fixesApplied++;
            } else {
                console.log(`   ✅ Tabla existe: ${tableName}`);
            }
        }
        
        // PROBLEMA 2: Verificar columnas faltantes
        console.log('\n🔍 PROBLEMA 2: Columnas faltantes');
        for (const tableName of criticalTables) {
            if (tableNames.includes(tableName)) {
                const missingColumns = await checkMissingColumns(tableName);
                if (missingColumns.length > 0) {
                    console.log(`   📝 Agregando columnas a ${tableName}: ${missingColumns.join(', ')}`);
                    await addMissingColumns(tableName, missingColumns);
                    fixesApplied++;
                } else {
                    console.log(`   ✅ Columnas correctas en: ${tableName}`);
                }
            }
        }
        
        // PROBLEMA 3: Verificar datos iniciales
        console.log('\n🔍 PROBLEMA 3: Datos iniciales');
        await ensureInitialData();
        
        // PROBLEMA 4: Verificar índices
        console.log('\n🔍 PROBLEMA 4: Índices de rendimiento');
        await ensureIndexes();
        
    } catch (error) {
        console.error('❌ Error durante corrección:', error.message);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE CORRECCIONES');
    console.log('='.repeat(60));
    console.log(`🛠️ Correcciones aplicadas: ${fixesApplied}`);
    
    if (fixesApplied > 0) {
        console.log('🎉 ¡Problemas críticos corregidos!');
    } else {
        console.log('✅ No se encontraron problemas críticos');
    }
}

async function createTable(tableName) {
    const tableDefinitions = {
        users: `
            CREATE TABLE users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'cajero',
                branch_id INT DEFAULT NULL,
                tenant_id INT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_tenant_users (tenant_id),
                INDEX idx_branch_users (branch_id),
                FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
            )
        `,
        branches: `
            CREATE TABLE branches (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                address TEXT,
                phone VARCHAR(50),
                tenant_id INT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_tenant_branches (tenant_id)
            )
        `,
        inventory: `
            CREATE TABLE inventory (
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
                INDEX idx_barcode_inventory (barcode),
                FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
            )
        `,
        branch_stocks: `
            CREATE TABLE branch_stocks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT DEFAULT NULL,
                branch_id INT DEFAULT NULL,
                product_id INT DEFAULT NULL,
                stock INT NOT NULL DEFAULT 0,
                UNIQUE KEY unique_branch_product (branch_id, product_id, tenant_id),
                INDEX idx_tenant_branch_stocks (tenant_id),
                FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES inventory(id) ON DELETE CASCADE
            )
        `,
        clients: `
            CREATE TABLE clients (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50),
                address TEXT,
                branch_id INT DEFAULT NULL,
                tenant_id INT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_tenant_clients (tenant_id),
                INDEX idx_branch_clients (branch_id),
                FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
            )
        `,
        sales: `
            CREATE TABLE sales (
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
                INDEX idx_client_sales (client_id),
                INDEX idx_branch_sales (branch_id),
                INDEX idx_sale_date (sale_date),
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
                FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
            )
        `,
        sale_details: `
            CREATE TABLE sale_details (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT DEFAULT NULL,
                sale_id INT DEFAULT NULL,
                product_id INT DEFAULT NULL,
                quantity INT NOT NULL,
                subtotal DECIMAL(10,2) NOT NULL,
                INDEX idx_tenant_sale_details (tenant_id),
                INDEX idx_sale_details (sale_id),
                FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES inventory(id) ON DELETE CASCADE
            )
        `,
        suppliers: `
            CREATE TABLE suppliers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT DEFAULT NULL,
                name VARCHAR(255) NOT NULL,
                contact_name VARCHAR(255),
                phone VARCHAR(50),
                email VARCHAR(255),
                address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_tenant_suppliers (tenant_id)
            )
        `,
        expenses: `
            CREATE TABLE expenses (
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
                INDEX idx_expense_date (expense_date),
                FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
                FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
            )
        `,
        settings: `
            CREATE TABLE settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT DEFAULT NULL UNIQUE,
                company_name VARCHAR(255),
                company_address TEXT,
                company_phone VARCHAR(50),
                company_email VARCHAR(255),
                company_logo VARCHAR(255),
                ticket_format VARCHAR(20) DEFAULT 'A4',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_tenant_settings (tenant_id)
            )
        `,
        audit_logs: `
            CREATE TABLE audit_logs (
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
                INDEX idx_user_audit (user_id),
                INDEX idx_entity_audit (entity_type, entity_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
        `
    };
    
    if (tableDefinitions[tableName]) {
        await db.query(tableDefinitions[tableName]);
    }
}

async function checkMissingColumns(tableName) {
    const [tableStructure] = await db.query(`DESCRIBE ${tableName}`);
    const existingColumns = tableStructure.map(col => col.Field);
    
    const expectedColumns = {
        users: ['id', 'username', 'email', 'password', 'role', 'branch_id', 'tenant_id', 'created_at'],
        branches: ['id', 'name', 'address', 'phone', 'tenant_id', 'created_at'],
        inventory: ['id', 'product_name', 'stock', 'price', 'cost', 'category', 'description', 'barcode', 'supplier_id', 'tenant_id', 'created_at'],
        branch_stocks: ['id', 'tenant_id', 'branch_id', 'product_id', 'stock'],
        clients: ['id', 'name', 'email', 'phone', 'address', 'branch_id', 'tenant_id', 'created_at'],
        sales: ['id', 'tenant_id', 'client_id', 'branch_id', 'total_price', 'discount', 'coupon_code', 'notes', 'sale_date', 'is_credit', 'created_at'],
        sale_details: ['id', 'tenant_id', 'sale_id', 'product_id', 'quantity', 'subtotal'],
        suppliers: ['id', 'tenant_id', 'name', 'contact_name', 'phone', 'email', 'address', 'created_at'],
        expenses: ['id', 'tenant_id', 'description', 'amount', 'category', 'supplier_id', 'branch_id', 'expense_date', 'created_at'],
        settings: ['id', 'tenant_id', 'company_name', 'company_address', 'company_phone', 'company_email', 'company_logo', 'ticket_format', 'created_at'],
        audit_logs: ['id', 'tenant_id', 'user_id', 'action', 'entity_type', 'entity_id', 'details', 'ip_address', 'created_at']
    };
    
    return (expectedColumns[tableName] || []).filter(col => !existingColumns.includes(col));
}

async function addMissingColumns(tableName, missingColumns) {
    const columnDefinitions = {
        tenant_id: 'INT DEFAULT NULL',
        branch_id: 'INT DEFAULT NULL',
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        is_credit: 'BOOLEAN DEFAULT FALSE',
        sale_date: 'DATETIME NOT NULL',
        total_price: 'DECIMAL(10,2) NOT NULL',
        discount: 'DECIMAL(10,2) DEFAULT 0',
        role: "VARCHAR(50) DEFAULT 'cajero'",
        stock: 'INT NOT NULL DEFAULT 0',
        price: 'DECIMAL(10,2) NOT NULL',
        cost: 'DECIMAL(10,2) DEFAULT 0',
        product_name: 'VARCHAR(255) NOT NULL',
        client_id: 'INT DEFAULT NULL',
        product_id: 'INT DEFAULT NULL',
        quantity: 'INT NOT NULL',
        subtotal: 'DECIMAL(10,2) NOT NULL',
        supplier_id: 'INT DEFAULT NULL',
        amount: 'DECIMAL(10,2) NOT NULL',
        description: 'TEXT',
        category: 'VARCHAR(100)',
        barcode: 'VARCHAR(100)',
        expense_date: 'DATE NOT NULL',
        company_name: 'VARCHAR(255)',
        company_address: 'TEXT',
        company_phone: 'VARCHAR(50)',
        company_email: 'VARCHAR(255)',
        company_logo: 'VARCHAR(255)',
        ticket_format: "VARCHAR(20) DEFAULT 'A4'",
        action: 'VARCHAR(100) NOT NULL',
        entity_type: 'VARCHAR(50) NOT NULL',
        entity_id: 'INT DEFAULT NULL',
        details: 'TEXT',
        ip_address: 'VARCHAR(45)',
        user_id: 'INT DEFAULT NULL'
    };
    
    for (const column of missingColumns) {
        const definition = columnDefinitions[column] || 'VARCHAR(255)';
        await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${column} ${definition}`);
    }
}

async function ensureInitialData() {
    // Verificar si existe usuario admin
    const [adminUsers] = await db.query('SELECT COUNT(*) as count FROM users WHERE role = "admin"');
    
    if (adminUsers[0].count === 0) {
        console.log('   👤 Creando usuario admin por defecto');
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
        await db.query(`
            INSERT INTO users (username, email, password, role, tenant_id) 
            VALUES ('admin', 'admin@businesscontrol.com', ?, 'admin', 1)
        `, [hashedPassword]);
        
        console.log('   ✅ Usuario admin creado');
    } else {
        console.log('   ✅ Usuario admin ya existe');
    }
    
    // Verificar si existe sucursal principal
    const [branches] = await db.query('SELECT COUNT(*) as count FROM branches');
    
    if (branches[0].count === 0) {
        console.log('   🏪 Creando sucursal principal por defecto');
        await db.query(`
            INSERT INTO branches (name, address, tenant_id) 
            VALUES ('Sede Principal', 'Oficina Central', 1)
        `);
        
        console.log('   ✅ Sucursal principal creada');
    } else {
        console.log('   ✅ Sucursal principal ya existe');
    }
}

async function ensureIndexes() {
    console.log('   📊 Verificando índices críticos...');
    
    const criticalIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)',
        'CREATE INDEX IF NOT EXISTS idx_sales_tenant ON sales(tenant_id)',
        'CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON inventory(tenant_id)',
        'CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id)',
        'CREATE INDEX IF NOT EXISTS idx_branch_stocks_tenant ON branch_stocks(tenant_id)',
        'CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date)',
        'CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory(barcode)'
    ];
    
    for (const indexSql of criticalIndexes) {
        try {
            await db.query(indexSql);
        } catch (error) {
            // Ignorar errores de índices existentes
            if (!error.message.includes('already exists')) {
                console.log(`   ⚠️ Error creando índice: ${error.message}`);
            }
        }
    }
    
    console.log('   ✅ Índices verificados');
}

// Ejutar correcciones
fixCriticalIssues().catch(console.error);
