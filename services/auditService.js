const db = require('../config/db');

async function recordLog({ tenantId, userId, action, entityType, entityId, details, ipAddress }) {
    try {
        await db.query(
            'INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [tenantId, userId, action, entityType, entityId, typeof details === 'object' ? JSON.stringify(details) : details, ipAddress]
        );
    } catch (error) {
        // No bloqueamos el flujo principal si falla el log, pero lo registramos en consola
        console.error('Failed to record audit log:', error);
    }
}

module.exports = { recordLog };