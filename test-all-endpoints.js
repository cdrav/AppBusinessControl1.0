// Configuración
const BASE_URL = 'http://localhost:3000';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImJyYW5jaF9pZCI6MSwidGVuYW50X2lkIjoxLCJpYXQiOjE3NzU0ODc1NjUsImV4cCI6MTc3NTUxNjM2NX0.PH_jbXoVt-0_Hztu1WvkgMK6oNgoqDAuT-Y2dLbxduU';

// Tests de endpoints
const tests = [
    {
        name: '🔐 Autenticación',
        tests: [
            { method: 'POST', endpoint: '/login', body: { email: 'admin@businesscontrol.com', password: 'admin123' }, description: 'Login válido' },
            { method: 'POST', endpoint: '/login', body: { email: 'invalid@test.com', password: 'wrong' }, description: 'Login inválido' },
        ]
    },
    {
        name: '📦 Inventario',
        tests: [
            { method: 'GET', endpoint: '/inventory', description: 'Listar inventario' },
            { method: 'GET', endpoint: '/inventory/1', description: 'Obtener producto específico' },
            { method: 'POST', endpoint: '/inventory', body: { name: 'Test Product', quantity: 10, price: 1000 }, description: 'Crear producto' },
        ]
    },
    {
        name: '👥 Clientes',
        tests: [
            { method: 'GET', endpoint: '/clients', description: 'Listar clientes' },
            { method: 'POST', endpoint: '/clients', body: { name: 'Test Client', email: 'test@client.com', phone: '123456789' }, description: 'Crear cliente' },
        ]
    },
    {
        name: '💰 Ventas',
        tests: [
            { method: 'GET', endpoint: '/sales', description: 'Listar ventas' },
            { method: 'POST', endpoint: '/sales', body: { client_id: 1, total: 1000, payment_method: 'cash' }, description: 'Crear venta' },
        ]
    },
    {
        name: '🏪 Proveedores',
        tests: [
            { method: 'GET', endpoint: '/suppliers', description: 'Listar proveedores' },
            { method: 'POST', endpoint: '/suppliers', body: { name: 'Test Supplier', contact_name: 'Test Contact' }, description: 'Crear proveedor' },
        ]
    },
    {
        name: '📊 Dashboard',
        tests: [
            { method: 'GET', endpoint: '/api/dashboard-stats?period=7days', description: 'Estadísticas dashboard' },
            { method: 'GET', endpoint: '/api/branch-stats', description: 'Estadísticas sedes' },
        ]
    },
    {
        name: '⚙️ Configuración',
        tests: [
            { method: 'GET', endpoint: '/settings', description: 'Obtener configuración' },
            { method: 'GET', endpoint: '/settings/branches', description: 'Listar sedes' },
        ]
    },
    {
        name: '🧾 Usuarios',
        tests: [
            { method: 'GET', endpoint: '/users', description: 'Listar usuarios' },
            { method: 'GET', endpoint: '/users/1', description: 'Obtener usuario específico' },
        ]
    },
    {
        name: '💸 Gastos',
        tests: [
            { method: 'GET', endpoint: '/api/expenses', description: 'Listar gastos' },
            { method: 'POST', endpoint: '/api/expenses', body: { amount: 100, description: 'Test Expense', category: 'office' }, description: 'Crear gasto' },
        ]
    },
    {
        name: '📈 Reportes',
        tests: [
            { method: 'GET', endpoint: '/api/reports/sales?period=30days', description: 'Reporte de ventas' },
            { method: 'GET', endpoint: '/api/statistics', description: 'Estadísticas generales' },
        ]
    }
];

async function runTest(test, category) {
    const url = `${BASE_URL}${test.endpoint}`;
    const options = {
        method: test.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TEST_TOKEN}`
        }
    };

    if (test.body && (test.method === 'POST' || test.method === 'PUT')) {
        options.body = JSON.stringify(test.body);
    }

    try {
        console.log(`🧪 ${category} - ${test.description}`);
        const response = await fetch(url, options);
        const status = response.status;
        const data = await response.text();
        
        let statusIcon = status >= 200 && status < 300 ? '✅' : '❌';
        console.log(`${statusIcon} Status: ${status}`);
        
        if (status >= 200 && status < 300) {
            console.log(`✅ Response: ${data.substring(0, 100)}${data.length > 100 ? '...' : ''}`);
        } else {
            console.log(`❌ Error: ${data}`);
        }
        console.log('---');
        
        return { success: status >= 200 && status < 300, status, data: data.substring(0, 200) };
    } catch (error) {
        console.log(`❌ ${category} - ${test.description}: Error de conexión - ${error.message}`);
        console.log('---');
        return { success: false, error: error.message };
    }
}

async function runAllTests() {
    console.log('🚀 Iniciando pruebas completas de la API...\n');
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    for (const category of tests) {
        console.log(`\n📋 ${category.name}\n${'='.repeat(50)}`);
        
        for (const test of category.tests) {
            totalTests++;
            const result = await runTest(test, category.name);
            if (result.success) {
                passedTests++;
            } else {
                failedTests++;
            }
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE PRUEBAS');
    console.log('='.repeat(60));
    console.log(`Total de pruebas: ${totalTests}`);
    console.log(`✅ Pruebas exitosas: ${passedTests}`);
    console.log(`❌ Pruebas fallidas: ${failedTests}`);
    console.log(`📈 Tasa de éxito: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests > 0) {
        console.log('\n⚠️ Se detectaron problemas. Revisar los endpoints fallidos.');
    } else {
        console.log('\n🎉 Todas las pruebas pasaron exitosamente.');
    }
}

// Ejutar pruebas
runAllTests().catch(console.error);
