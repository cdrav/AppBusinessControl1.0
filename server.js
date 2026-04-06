require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
// Asegúrate de que este archivo exista en services/emailService.js
const { sendDailySummaryEmail } = require('./services/emailService');

// Inicializar App
const app = express();

// Middleware mejorado para manejo de JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Importar Rutas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const inventoryRoutes = require('./routes/inventory');
const salesRoutes = require('./routes/sales');
const clientRoutes = require('./routes/clients');
const reportRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const expensesRoutes = require('./routes/expenses');
const creditRoutes = require('./routes/credits');
const auditRoutes = require('./routes/audit');

// Usar Rutas
app.use('/', authRoutes); // Login, Register
app.use('/users', userRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/sales', salesRoutes);
app.use('/clients', clientRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api', reportRoutes); // Dashboard, Backup
app.use('/api/expenses', expensesRoutes);
app.use('/api/audit', auditRoutes);
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

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Global error:', err);
  res.status(500).json({
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Contacte al administrador'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// Tarea Programada (Cierre de Caja Diario 8:00 PM)
cron.schedule('0 20 * * *', async () => {
    console.log('🕒 Ejecutando cierre de caja diario...');
    try {
        const msg = await sendDailySummaryEmail(new Date());
        console.log(`${msg}`);
    } catch (error) {
        console.error('Error en cierre de caja:', error);
    }
}, { scheduled: true, timezone: "America/Bogota" });

// Health check endpoint para Railway
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
});
