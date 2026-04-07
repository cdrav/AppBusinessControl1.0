const transporter = require('../config/mailer');
const db = require('../config/db');
require('dotenv').config();

// Verificar configuración de email al cargar
const isEmailConfigured = () => {
    return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
};

async function sendLowStockAlert(products) {
    if (!isEmailConfigured() || products.length === 0) {
        console.log('📧 Email no configurado, saltando alerta de stock');
        return;
    }
    const productList = products.map(p => `<li><strong>${p.name}</strong>: Quedan ${p.stock} unidades</li>`).join('');
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: '⚠️ Alerta de Stock Bajo - Business Control',
        html: `<h3>Stock bajo detectado:</h3><ul>${productList}</ul><p>Reabastecer pronto.</p>`
    };
    try { 
        await transporter.sendMail(mailOptions); 
        console.log('📧 Alerta de stock enviada'); 
    } catch (error) { 
        console.error('❌ Error enviando alerta:', error.message);
        throw error;
    }
}

async function sendDailySummaryEmail(date, recipientEmail) {
    if (!date) throw new Error('Fecha requerida');
    if (!recipientEmail) throw new Error('Correo destinatario requerido');
    
    const startDate = new Date(date); startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date); endDate.setHours(23, 59, 59, 999);

    const [sales] = await db.query(
        `SELECT COALESCE(SUM(total_price), 0) as totalRevenue, COUNT(id) as totalSales FROM sales WHERE sale_date BETWEEN ? AND ?`,
        [startDate, endDate]
    );
    const summary = sales[0];
    const formattedDate = new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER || 'noreply@businesscontrol.com',
            to: recipientEmail,
            subject: `Cierre de Caja - ${formattedDate}`,
            html: `
                <h1>Resumen del Día - Business Control</h1>
                <p><strong>Fecha:</strong> ${formattedDate}</p>
                <hr>
                <p><strong>Ventas realizadas:</strong> ${summary.totalSales}</p>
                <p><strong>Ingresos totales:</strong> $${parseFloat(summary.totalRevenue).toFixed(2)}</p>
                <hr>
                <p style="color: #666; font-size: 12px;">Generado automáticamente por Business Control</p>
            `
        });
        return `Resumen enviado a ${recipientEmail}`;
    } catch (error) {
        console.error('❌ Error enviando email:', error.message);
        throw new Error(`Error al enviar correo: ${error.message}`);
    }
}

module.exports = { sendLowStockAlert, sendDailySummaryEmail, isEmailConfigured };
