const transporter = require('../config/mailer');
const db = require('../config/db');
require('dotenv').config();

async function sendLowStockAlert(products) {
    if (!process.env.EMAIL_USER || products.length === 0) return;
    const productList = products.map(p => `<li><strong>${p.name}</strong>: Quedan ${p.stock} unidades</li>`).join('');
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: '⚠️ Alerta de Stock Bajo - Business Control',
        html: `<h3>Stock bajo detectado:</h3><ul>${productList}</ul><p>Reabastecer pronto.</p>`
    };
    try { await transporter.sendMail(mailOptions); console.log('📧 Alerta de stock enviada'); } 
    catch (error) { console.error('❌ Error enviando alerta:', error); }
}

async function sendDailySummaryEmail(date) {
    if (!date || !process.env.EMAIL_USER) throw new Error('Configuración de correo incompleta.');
    const startDate = new Date(date); startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date); endDate.setHours(23, 59, 59, 999);

    const [sales] = await db.query(
        `SELECT COALESCE(SUM(total_price), 0) as totalRevenue, COUNT(id) as totalSales FROM sales WHERE sale_date BETWEEN ? AND ?`,
        [startDate, endDate]
    );
    const summary = sales[0];
    const formattedDate = new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: `Cierre de Caja - ${formattedDate}`,
        html: `<h1>Resumen del Día</h1><p>Ventas: <strong>${summary.totalSales}</strong></p><p>Ingresos: <strong>$${parseFloat(summary.totalRevenue).toFixed(2)}</strong></p>`
    });
    return `Resumen enviado a ${process.env.EMAIL_USER}`;
}

module.exports = { sendLowStockAlert, sendDailySummaryEmail };
