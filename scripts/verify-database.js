const db = require('./config/db');

// Estructura esperada de la base de datos
const EXPECTED_TABLES = {
    users: [
        'id', 'username', 'email', 'password', 'role', 
        'branch_id', 'tenant_id', 'created_at'
    ],
    branches: [
        'id', 'name', 'address', 'phone', 'tenant_id', 'created_at'
    ],
    inventory: [
        'id', 'product_name', 'stock', 'price', 'cost', 
        'category', 'description', 'barcode', 'supplier_id',
        'tenant_id', 'created_at'
    ],
    branch_stocks: [
        'id', 'tenant_id', 'branch_id', 'product_id', 'stock'
    ],
    clients: [
        'id', 'name', 'email', 'phone', 'address', 
        'branch_id', 'tenant_id', 'created_at'
    ],
    sales: [
        'id', 'tenant_id', 'client_id', 'branch_id', 
        'total_price', 'discount', 'coupon_code', 'notes',
        'sale_date', 'is_credit', 'created_at'
    ],
    sale_details: [
        'id', 'tenant_id', 'sale_id', 'product_id', 
        'quantity', 'subtotal'
    ],
    suppliers: [
        'id', 'tenant_id', 'name', 'contact_name', 
        'phone', 'email', 'address', 'created_at'
    ],
    expenses: [
        'id', 'tenant_id', 'description', 'amount', 
        'category', 'supplier_id', 'branch_id', 
        'expense_date', 'created_at'
    ],
    settings: [
        'id', 'tenant_id', 'company_name', 'company_address',
        'company_phone', 'company_email', 'company_logo',
        'ticket_format', 'created_at'
    ],
    credits: [
        'id', 'tenant_id', 'sale_id', 'client_id', 
        'total_debt', 'remaining_balance', 'next_payment_date',
        'collected_by', 'created_at'
    ],
    coupons: [
        'id', 'tenant_id', 'code', 'discount_type', 
        'value', 'active', 'created_at'
    ],
    audit_logs: [
        'id', 'tenant_id', 'user_id', 'action', 
        'entity_type', 'entity_id', 'details', 
        'ip_address', 'created_at'
    ]
};

async function verifyDatabase() {
    console.log('🔍 VERIFICACIÓN COMPLETA DE BASE DE DATOS\n');
    console.log('='.repeat(60));
    
    let totalIssues = 0;
    let totalTables = 0;
    let totalColumns = 0;
    
    try {
        // Obtener todas las tablas
        const [allTables] = await db.query('SHOW TABLES');
        const tableNames = allTables.map(row => Object.values(row)[0]);
        
        console.log(`📋 Tablas encontradas: ${tableNames.length}\n`);
        
        // Verificar cada tabla esperada
        for (const [tableName, expectedColumns] of Object.entries(EXPECTED_TABLES)) {
            totalTables++;
            
            console.log(`🔍 Verificando tabla: ${tableName}`);
            
            if (!tableNames.includes(tableName)) {
                console.log(`   ❌ TABLA FALTANTE: ${tableName}`);
                totalIssues++;
                continue;
            }
            
            try {
                // Obtener estructura real de la tabla
                const [tableStructure] = await db.query(`DESCRIBE ${tableName}`);
                const actualColumns = tableStructure.map(col => col.Field);
                
                console.log(`   📊 Columnas esperadas: ${expectedColumns.length}`);
                console.log(`   📊 Columnas actuales: ${actualColumns.length}`);
                
                // Verificar columnas faltantes
                const missingColumns = expectedColumns.filter(col => !actualColumns.includes(col));
                const extraColumns = actualColumns.filter(col => !expectedColumns.includes(col));
                
                if (missingColumns.length > 0) {
                    console.log(`   ❌ Columnas faltantes: ${missingColumns.join(', ')}`);
                    totalIssues += missingColumns.length;
                }
                
                if (extraColumns.length > 0) {
                    console.log(`   ⚠️ Columnas extra: ${extraColumns.join(', ')}`);
                }
                
                if (missingColumns.length === 0) {
                    console.log(`   ✅ Estructura correcta`);
                }
                
                totalColumns += expectedColumns.length;
                
            } catch (error) {
                console.log(`   ❌ Error verificando estructura: ${error.message}`);
                totalIssues++;
            }
            
            console.log('');
        }
        
        // Verificar tablas no esperadas
        const unexpectedTables = tableNames.filter(name => !Object.keys(EXPECTED_TABLES).includes(name));
        if (unexpectedTables.length > 0) {
            console.log('⚠️ Tablas no esperadas:');
            unexpectedTables.forEach(table => console.log(`   • ${table}`));
            console.log('');
        }
        
        // Verificar datos iniciales
        console.log('🔍 Verificando datos iniciales...');
        
        try {
            const [userCount] = await db.query('SELECT COUNT(*) as count FROM users');
            console.log(`   👥 Usuarios: ${userCount[0].count}`);
            
            const [branchCount] = await db.query('SELECT COUNT(*) as count FROM branches');
            console.log(`   🏪 Sucursales: ${branchCount[0].count}`);
            
            const [productCount] = await db.query('SELECT COUNT(*) as count FROM inventory');
            console.log(`   📦 Productos: ${productCount[0].count}`);
            
            const [clientCount] = await db.query('SELECT COUNT(*) as count FROM clients');
            console.log(`   👤 Clientes: ${clientCount[0].count}`);
            
        } catch (error) {
            console.log(`   ❌ Error verificando datos: ${error.message}`);
            totalIssues++;
        }
        
    } catch (error) {
        console.error('❌ Error general:', error.message);
        totalIssues++;
    }
    
    // Resumen
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE VERIFICACIÓN');
    console.log('='.repeat(60));
    console.log(`📋 Tablas esperadas: ${totalTables}`);
    console.log(`📊 Columnas totales: ${totalColumns}`);
    console.log(`❌ Problemas encontrados: ${totalIssues}`);
    
    if (totalIssues === 0) {
        console.log('\n🎉 ¡Base de datos está completa y correcta!');
    } else {
        console.log(`\n⚠️ Se encontraron ${totalIssues} problemas que necesitan corrección.`);
        
        // Generar SQL para corregir problemas
        console.log('\n📝 SCRIPTS DE CORRECCIÓN:');
        await generateFixScripts();
    }
}

async function generateFixScripts() {
    console.log('\n🛠️ SCRIPTS SQL PARA CORREGIR PROBLEMAS:');
    
    try {
        // Verificar tablas faltantes
        const [allTables] = await db.query('SHOW TABLES');
        const tableNames = allTables.map(row => Object.values(row)[0]);
        
        for (const [tableName, expectedColumns] of Object.entries(EXPECTED_TABLES)) {
            if (!tableNames.includes(tableName)) {
                console.log(`\n-- Crear tabla ${tableName}`);
                console.log(`CREATE TABLE ${tableName} (`);
                
                const columnDefs = {
                    id: 'INT AUTO_INCREMENT PRIMARY KEY',
                    tenant_id: 'INT DEFAULT NULL',
                    name: 'VARCHAR(255) NOT NULL',
                    email: 'VARCHAR(255) NOT NULL',
                    phone: 'VARCHAR(50)',
                    address: 'TEXT',
                    username: 'VARCHAR(255) NOT NULL',
                    password: 'VARCHAR(255) NOT NULL',
                    role: 'VARCHAR(50) DEFAULT "cajero"',
                    branch_id: 'INT DEFAULT NULL',
                    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
                    // Columnas específicas de cada tabla
                    product_name: 'VARCHAR(255) NOT NULL',
                    stock: 'INT NOT NULL DEFAULT 0',
                    price: 'DECIMAL(10, 2) NOT NULL',
                    cost: 'DECIMAL(10, 2) DEFAULT 0',
                    category: 'VARCHAR(100)',
                    description: 'TEXT',
                    barcode: 'VARCHAR(100)',
                    supplier_id: 'INT DEFAULT NULL',
                    product_id: 'INT DEFAULT NULL',
                    quantity: 'INT NOT NULL',
                    subtotal: 'DECIMAL(10, 2) NOT NULL',
                    client_id: 'INT DEFAULT NULL',
                    total_price: 'DECIMAL(10, 2) NOT NULL',
                    discount: 'DECIMAL(10, 2) DEFAULT 0',
                    coupon_code: 'VARCHAR(50)',
                    notes: 'TEXT',
                    sale_date: 'DATETIME NOT NULL',
                    is_credit: 'BOOLEAN DEFAULT FALSE',
                    sale_id: 'INT DEFAULT NULL',
                    contact_name: 'VARCHAR(255)',
                    amount: 'DECIMAL(10, 2) NOT NULL',
                    expense_date: 'DATE',
                    company_name: 'VARCHAR(255)',
                    company_address: 'TEXT',
                    company_phone: 'VARCHAR(50)',
                    company_email: 'VARCHAR(255)',
                    company_logo: 'VARCHAR(255)',
                    ticket_format: 'VARCHAR(20) DEFAULT "A4"',
                    total_debt: 'DECIMAL(10, 2) NOT NULL',
                    remaining_balance: 'DECIMAL(10, 2) NOT NULL',
                    next_payment_date: 'DATE',
                    collected_by: 'INT DEFAULT NULL',
                    code: 'VARCHAR(50) NOT NULL',
                    discount_type: 'ENUM("percent", "fixed") NOT NULL',
                    value: 'DECIMAL(10, 2) NOT NULL',
                    active: 'BOOLEAN DEFAULT TRUE',
                    user_id: 'INT DEFAULT NULL',
                    action: 'VARCHAR(100) NOT NULL',
                    entity_type: 'VARCHAR(50) NOT NULL',
                    entity_id: 'INT DEFAULT NULL',
                    details: 'TEXT',
                    ip_address: 'VARCHAR(45)'
                };
                
                const columnSql = expectedColumns.map(col => `  ${col} ${columnDefs[col] || 'VARCHAR(255)'}`).join(',\n');
                console.log(columnSql);
                console.log(');');
            }
        }
        
    } catch (error) {
        console.log('❌ Error generando scripts:', error.message);
    }
}

// Ejutar verificación
verifyDatabase().catch(console.error);
