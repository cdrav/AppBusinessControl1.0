const db = require('../config/db');

async function run() {
    process.stdout.write('Conectando a la base de datos...\n');
    try {
        const [cols] = await db.query("SHOW COLUMNS FROM credits LIKE 'payment_frequency'");
        if (cols.length > 0) {
            process.stdout.write('La columna payment_frequency YA EXISTE en credits. No se necesita cambio.\n');
        } else {
            await db.query(
                "ALTER TABLE credits ADD COLUMN payment_frequency ENUM('daily','weekly','biweekly','monthly') DEFAULT 'monthly' AFTER status"
            );
            process.stdout.write('OK: columna payment_frequency AGREGADA a credits.\n');
        }
    } catch (e) {
        process.stdout.write('Error: ' + e.message + '\n');
    }
    await db.end();
    process.exit(0);
}

run();
