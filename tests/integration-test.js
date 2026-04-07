/**
 * Test Suite - AppBusinessControl1.0
 * Pruebas de integración para verificar el funcionamiento del sistema
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuración
const BASE_URL = 'http://localhost:3000';
let authToken = null;

// Colores para consola
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

// Logger
function log(type, message) {
    const color = colors[type] || colors.reset;
    console.log(`${color}${message}${colors.reset}`);
}

// Hacer petición HTTP
function makeRequest(endpoint, method = 'GET', body = null, customHeaders = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...customHeaders
            }
        };

        if (authToken) {
            options.headers['Authorization'] = `Bearer ${authToken}`;
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed, headers: res.headers });
                } catch {
                    resolve({ status: res.statusCode, data: data, headers: res.headers });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// ==================== TESTS ====================

async function testAuth() {
    log('blue', '\n📋 TEST 1: Autenticación');
    try {
        const response = await makeRequest('/login', 'POST', {
            email: 'admin@businesscontrol.com',
            password: 'admin123'
        });

        if (response.status === 200 && response.data.token) {
            authToken = response.data.token;
            log('green', '✅ Login exitoso - Token obtenido');
            return true;
        } else {
            log('red', `❌ Login falló - Status: ${response.status}`);
            log('yellow', `Respuesta: ${JSON.stringify(response.data)}`);
            return false;
        }
    } catch (error) {
        log('red', `❌ Error en login: ${error.message}`);
        return false;
    }
}

async function testRouteClosure() {
    log('blue', '\n📋 TEST 2: Cierre de Ruta (Cobros)');
    try {
        const response = await makeRequest('/api/credits/route-closure', 'POST');

        if (response.status === 200) {
            log('green', '✅ Cierre de ruta funciona correctamente');
            log('yellow', `   Resumen: ${JSON.stringify(response.data.summary)}`);
            return true;
        } else {
            log('red', `❌ Cierre de ruta falló - Status: ${response.status}`);
            log('yellow', `Error: ${JSON.stringify(response.data)}`);
            return false;
        }
    } catch (error) {
        log('red', `❌ Error en cierre de ruta: ${error.message}`);
        return false;
    }
}

async function testTodayCollections() {
    log('blue', '\n📋 TEST 3: Carga de Cobros del Día');
    try {
        const response = await makeRequest('/api/credits/today', 'GET');

        if (response.status === 200 && Array.isArray(response.data)) {
            log('green', `✅ Carga de cobros exitosa - ${response.data.length} cobros pendientes`);
            return true;
        } else {
            log('red', `❌ Carga de cobros falló - Status: ${response.status}`);
            return false;
        }
    } catch (error) {
        log('red', `❌ Error cargando cobros: ${error.message}`);
        return false;
    }
}

async function testReportPDF() {
    log('blue', '\n📋 TEST 4: Generación de PDF de Reportes');
    try {
        const today = new Date().toISOString().split('T')[0];
        const response = await makeRequest(`/api/report-export?type=sales&startDate=${today}&endDate=${today}`, 'GET');

        if (response.status === 200 && response.headers['content-type'] === 'application/pdf') {
            log('green', '✅ PDF de reporte generado correctamente');
            return true;
        } else {
            log('red', `❌ Generación de PDF falló - Status: ${response.status}`);
            log('yellow', `Content-Type: ${response.headers['content-type']}`);
            return false;
        }
    } catch (error) {
        log('red', `❌ Error generando PDF: ${error.message}`);
        return false;
    }
}

async function testSettings() {
    log('blue', '\n📋 TEST 5: Configuración de Impresión (Settings)');
    try {
        // Obtener configuración
        const getResponse = await makeRequest('/settings', 'GET');
        
        if (getResponse.status !== 200) {
            log('red', `❌ No se pudo obtener configuración - Status: ${getResponse.status}`);
            return false;
        }

        const settings = getResponse.data;
        log('green', `✅ Configuración obtenida - Formato: ${settings.ticket_format || 'No configurado'}`);

        // Verificar que tiene ticket_format
        if (!settings.ticket_format) {
            log('yellow', '⚠️ ticket_format no está configurado, usando valor por defecto A4');
        }

        return true;
    } catch (error) {
        log('red', `❌ Error en configuración: ${error.message}`);
        return false;
    }
}

async function testDashboardStats() {
    log('blue', '\n📋 TEST 6: Estadísticas del Dashboard');
    try {
        const response = await makeRequest('/api/dashboard-stats?period=today', 'GET');

        if (response.status === 200 && response.data) {
            log('green', '✅ Estadísticas del dashboard cargadas');
            log('yellow', `   Ventas hoy: ${response.data.totalSales || 0}`);
            log('yellow', `   Ingresos: $${response.data.totalRevenue || 0}`);
            return true;
        } else {
            log('red', `❌ Estadísticas fallaron - Status: ${response.status}`);
            return false;
        }
    } catch (error) {
        log('red', `❌ Error en dashboard stats: ${error.message}`);
        return false;
    }
}

async function testStaticFiles() {
    log('blue', '\n📋 TEST 7: Archivos Estáticos (Botones de Regreso)');
    const pages = [
        'cobros.html',
        'reportes.html',
        'configuracion.html',
        'clientes.html',
        'inventarios.html',
        'ventas.html'
    ];

    let passed = 0;
    for (const page of pages) {
        try {
            const response = await makeRequest(`/${page}`, 'GET');
            if (response.status === 200 && response.data.includes('dashboard.html')) {
                log('green', `✅ ${page} - Tiene botón de regreso`);
                passed++;
            } else if (response.status === 200) {
                log('yellow', `⚠️ ${page} - Carga pero no se detectó botón de regreso`);
                passed++;
            } else {
                log('red', `❌ ${page} - Status: ${response.status}`);
            }
        } catch (error) {
            log('red', `❌ ${page} - Error: ${error.message}`);
        }
    }

    return passed === pages.length;
}

// ==================== EJECUCIÓN ====================

async function runTests() {
    log('blue', '\n' + '='.repeat(50));
    log('blue', '🧪 INICIANDO TESTS - AppBusinessControl1.0');
    log('blue', '='.repeat(50));

    // Verificar que el servidor esté corriendo
    try {
        await makeRequest('/api/health', 'GET');
    } catch {
        log('red', '\n❌ El servidor no está corriendo en ' + BASE_URL);
        log('yellow', 'Por favor inicia el servidor con: npm start');
        process.exit(1);
    }

    const results = {
        auth: await testAuth(),
        routeClosure: await testRouteClosure(),
        todayCollections: await testTodayCollections(),
        reportPDF: await testReportPDF(),
        settings: await testSettings(),
        dashboardStats: await testDashboardStats(),
        staticFiles: await testStaticFiles()
    };

    // Resumen
    log('blue', '\n' + '='.repeat(50));
    log('blue', '📊 RESUMEN DE TESTS');
    log('blue', '='.repeat(50));

    const total = Object.keys(results).length;
    const passed = Object.values(results).filter(r => r).length;
    const failed = total - passed;

    for (const [test, result] of Object.entries(results)) {
        const status = result ? '✅ PASÓ' : '❌ FALLÓ';
        const color = result ? 'green' : 'red';
        log(color, ` ${status} - ${test}`);
    }

    log('blue', '\n' + '='.repeat(50));
    log('green', `✅ Pasaron: ${passed}/${total}`);
    if (failed > 0) log('red', `❌ Fallaron: ${failed}/${total}`);
    log('blue', '='.repeat(50));

    process.exit(failed > 0 ? 1 : 0);
}

// Ejecutar si se llama directamente
if (require.main === module) {
    runTests();
}

module.exports = { runTests };
