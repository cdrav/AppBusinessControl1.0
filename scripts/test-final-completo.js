// Configuración
const BASE_URL = 'http://localhost:3000';

// Tests finales de endpoints críticos
const criticalTests = [
    { method: 'POST', endpoint: '/login', body: { email: 'admin@businesscontrol.com', password: 'admin123' }, description: 'Login' },
    { method: 'GET', endpoint: '/inventory', description: 'Listar inventario' },
    { method: 'POST', endpoint: '/inventory', body: { name: 'Producto Final Test', quantity: 5, price: 2500 }, description: 'Crear producto' },
    { method: 'GET', endpoint: '/suppliers', description: 'Listar proveedores' },
    { method: 'POST', endpoint: '/suppliers', body: { name: 'Proveedor Final', contact_name: 'Test Contact' }, description: 'Crear proveedor' },
    { method: 'GET', endpoint: '/clients', description: 'Listar clientes' },
    { method: 'POST', endpoint: '/clients', body: { name: 'Cliente Final', email: 'final@test.com' }, description: 'Crear cliente' },
    { method: 'GET', endpoint: '/sales', description: 'Listar ventas' },
    { method: 'POST', endpoint: '/sales', body: { clientId: 1, products: [{productId: 6, quantity: 1}], branchId: 1 }, description: 'Crear venta' },
    { method: 'GET', endpoint: '/api/dashboard-stats?period=7days', description: 'Estadísticas dashboard' },
    { method: 'GET', endpoint: '/api/branch-stats', description: 'Estadísticas sedes' },
    { method: 'GET', endpoint: '/api/expenses', description: 'Listar gastos' },
    { method: 'POST', endpoint: '/api/expenses', body: { amount: 200, description: 'Gasto Final', category: 'test', expense_date: '2026-04-06' }, description: 'Crear gasto' }
];

let authToken = null;

async function runCriticalTests() {
    console.log('🚀 EJECUTANDO TESTS CRÍTICOS FINALES...\n');
    
    let passedTests = 0;
    let totalTests = criticalTests.length;
    
    for (const test of criticalTests) {
        try {
            const url = `${BASE_URL}${test.endpoint}`;
            const options = {
                method: test.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(authToken && { 'Authorization': `Bearer ${authToken}` })
                }
            };
            
            if (test.body && (test.method === 'POST' || test.method === 'PUT')) {
                options.body = JSON.stringify(test.body);
            }
            
            console.log(`🧪 ${test.description}...`);
            const response = await fetch(url, options);
            const data = await response.text();
            
            if (response.status >= 200 && response.status < 300) {
                console.log(`✅ Status: ${response.status}`);
                passedTests++;
                
                // Extraer token del login
                if (test.endpoint === '/login' && response.status === 200) {
                    try {
                        const loginData = JSON.parse(data);
                        authToken = loginData.token;
                        console.log('🔐 Token obtenido para tests siguientes');
                    } catch (e) {
                        console.log('❌ Error extrayendo token');
                    }
                }
            } else {
                console.log(`❌ Status: ${response.status} - ${data.substring(0, 100)}`);
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
        console.log('---');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESULTADO FINAL DE TESTS CRÍTICOS');
    console.log('='.repeat(60));
    console.log(`✅ Tests exitosos: ${passedTests}/${totalTests}`);
    console.log(`📈 Tasa de éxito: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (passedTests === totalTests) {
        console.log('\n🎉 ¡APLICACIÓN 100% FUNCIONAL!');
        console.log('✅ Todos los endpoints críticos operativos');
        console.log('✅ Autenticación funcionando');
        console.log('✅ Operaciones CRUD funcionando');
        console.log('✅ Dashboard y estadísticas funcionando');
    } else {
        console.log(`\n⚠️ ${totalTests - passedTests} tests fallaron. Revisar endpoints específicos.`);
    }
}

// Ejutar tests finales
runCriticalTests().catch(console.error);
