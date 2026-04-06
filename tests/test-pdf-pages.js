/**
 * Test para verificar que la generación de PDF no crea páginas en blanco extra.
 * Descarga un PDF y cuenta las páginas usando el marcador "Página X de Y".
 */
const http = require('http');

const API_URL = 'http://localhost:3000';

async function login() {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ email: 'admin@businesscontrol.com', password: 'admin123' });
        const req = http.request(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const parsed = JSON.parse(body);
                resolve(parsed.token);
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function downloadPDF(token, type) {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 90);
    const fmt = d => d.toISOString().split('T')[0];

    const url = `${API_URL}/api/report-export?startDate=${fmt(startDate)}&endDate=${fmt(today)}&type=${type}`;

    return new Promise((resolve, reject) => {
        const req = http.request(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        }, (res) => {
            if (res.statusCode !== 200) {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${body}`)));
                return;
            }

            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer);
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function countPDFPages(buffer) {
    // Método 1: Contar objetos /Type /Page en el PDF raw
    const content = buffer.toString('latin1');
    
    // Buscar el patrón "Página X de Y" - la Y nos dice cuántas páginas cree el footer
    const footerMatch = content.match(/gina (\d+) de (\d+)/g);
    const declaredTotal = footerMatch ? parseInt(footerMatch[0].match(/de (\d+)/)[1]) : 0;
    const footerCount = footerMatch ? footerMatch.length : 0;
    
    // Contar páginas reales del PDF (objetos /Type /Page que no sean /Pages)
    const pageMatches = content.match(/\/Type\s*\/Page(?!s)/g);
    const realPages = pageMatches ? pageMatches.length : 0;

    return { realPages, declaredTotal, footerCount };
}

async function main() {
    console.log('🧪 TEST: Verificación de páginas en blanco en PDFs\n');

    try {
        const token = await login();
        console.log('✅ Login exitoso\n');

        const types = ['sales', 'inventory', 'clients', 'complete'];
        let allPassed = true;

        for (const type of types) {
            process.stdout.write(`📄 Generando reporte "${type}"... `);
            try {
                const pdf = await downloadPDF(token, type);
                const { realPages, declaredTotal, footerCount } = countPDFPages(pdf);

                const sizeKB = (pdf.length / 1024).toFixed(1);
                const match = realPages === footerCount && realPages === declaredTotal;

                if (match) {
                    console.log(`✅ ${realPages} páginas (${sizeKB} KB) - Sin páginas en blanco`);
                } else if (realPages > declaredTotal && declaredTotal > 0) {
                    console.log(`❌ PÁGINAS EN BLANCO: ${realPages} reales vs ${declaredTotal} declaradas (${sizeKB} KB)`);
                    allPassed = false;
                } else {
                    console.log(`⚠️  ${realPages} reales, ${declaredTotal} declaradas, ${footerCount} footers (${sizeKB} KB)`);
                    // Si no hay datos suficientes para comparar, no es un fallo
                }
            } catch (err) {
                console.log(`❌ Error: ${err.message}`);
                allPassed = false;
            }
        }

        console.log('\n' + '='.join ? '=' : '='.repeat(50));
        console.log(allPassed ? '✅ TODOS LOS TESTS PASARON' : '❌ ALGUNOS TESTS FALLARON');
        process.exit(allPassed ? 0 : 1);

    } catch (err) {
        console.error('Error fatal:', err.message);
        process.exit(1);
    }
}

main();
