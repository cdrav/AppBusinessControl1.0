/**
 * Script para verificar datos de ventas a crédito
 * Ejecutar: node check-credits.js
 */
const db = require('./config/db');

async function checkCredits() {
    try {
        console.log('🔍 Verificando ventas a crédito...\n');
        
        // Ver últimas 5 ventas a crédito
        const [sales] = await db.query(`
            SELECT s.id, s.total_price, s.is_credit, s.sale_date,
                   c.total_debt, c.remaining_balance, c.initial_payment
            FROM sales s
            LEFT JOIN credits c ON s.id = c.sale_id
            WHERE s.is_credit = 1
            ORDER BY s.id DESC
            LIMIT 5
        `);
        
        if (sales.length === 0) {
            console.log('❌ No hay ventas a crédito registradas');
            return;
        }
        
        console.log('📊 Últimas ventas a crédito:\n');
        console.log('ID  | Total      | Inicial   | Deuda     | Saldo     | Fecha');
        console.log('----|------------|-----------|-----------|-----------|-------------------');
        
        sales.forEach(sale => {
            const id = String(sale.id).padEnd(3);
            const total = formatMoney(sale.total_price);
            const initial = formatMoney(sale.initial_payment);
            const debt = formatMoney(sale.total_debt);
            const remaining = formatMoney(sale.remaining_balance);
            const date = new Date(sale.sale_date).toLocaleString('es-ES');
            
            console.log(`${id} | ${total} | ${initial} | ${debt} | ${remaining} | ${date}`);
            
            // Verificar si hay problema
            if (sale.initial_payment === 0 || sale.initial_payment === null) {
                console.log(`    ⚠️  ALERTA: Pago inicial es $0 o NULL`);
            }
            if (sale.total_debt === sale.remaining_balance) {
                const expectedDebt = sale.total_price - sale.initial_payment;
                if (expectedDebt !== sale.total_debt) {
                    console.log(`    ❌ ERROR: Deuda debería ser ${formatMoney(expectedDebt)} pero es ${formatMoney(sale.total_debt)}`);
                }
            }
        });
        
        console.log('\n✅ Verificación completada');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        process.exit(0);
    }
}

function formatMoney(amount) {
    if (amount === null || amount === undefined) return '$0         ';
    const val = parseFloat(amount);
    return '$' + val.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).padEnd(10);
}

checkCredits();
