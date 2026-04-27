const db = require('../config/db');

async function main() {
    const results = [];
    try {
        const [cols] = await db.query("SHOW COLUMNS FROM credits LIKE 'payment_frequency'");
        if (cols.length > 0) {
            results.push('payment_frequency YA EXISTE');
        } else {
            await db.query(
                "ALTER TABLE credits ADD COLUMN payment_frequency ENUM('daily','weekly','biweekly','monthly') DEFAULT 'monthly' AFTER status"
            );
            results.push('payment_frequency AGREGADA');
        }
    } catch (e) {
        results.push('ERROR: ' + e.message);
    }
    
    require('fs').writeFileSync('scripts/migration-result.txt', results.join('\n'));
    await db.end();
    process.exit(0);
}

main();
