require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
// Asegúrate de que este archivo exista en services/emailService.js
const { sendDailySummaryEmail } = require('./services/emailService');

// Inicializar App
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Importar Rutas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const inventoryRoutes = require('./routes/inventory');
const salesRoutes = require('./routes/sales');
const clientRoutes = require('./routes/clients');
const reportRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');

// Usar Rutas
app.use('/', authRoutes); // Login, Register
app.use('/users', userRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/sales', salesRoutes);
app.use('/clients', clientRoutes);
app.use('/api', reportRoutes); // Dashboard, Backup
// Montar reportRoutes también en la raíz para soportar /report y /statistics
app.use('/', reportRoutes);

// Configuración y Sucursales
// Montamos settingsRoutes en /settings para la configuración general
app.use('/settings', settingsRoutes); 
// Y también en la raíz para que funcionen /branches y /suppliers como espera el frontend actual
app.use('/', settingsRoutes); 

// Ruta Base (Servir el frontend)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Tarea Programada (Cierre de Caja Diario 8:00 PM)
cron.schedule('0 20 * * *', async () => {
    console.log('🕒 Ejecutando cierre de caja diario...');
    try {
        const msg = await sendDailySummaryEmail(new Date());
        console.log(`✅ ${msg}`);
    } catch (error) {
        console.error('❌ Error en cierre de caja:', error);
    }
}, { scheduled: true, timezone: "America/Bogota" });

// Iniciar Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor modular iniciado en puerto ${PORT}`);
});
