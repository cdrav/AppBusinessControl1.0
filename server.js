require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const cron = require('node-cron');
const { sendDailySummaryEmail } = require('./services/emailService');
const db = require('./config/db');
const { sanitizeBody } = require('./middleware/sanitize');

const app = express();

// Middleware de JSON con manejo de errores
app.use((req, res, next) => {
  express.json({ limit: '10mb' })(req, res, (err) => {
    if (err) {
      console.error('❌ Error parseando JSON:', err.message);
      return res.status(400).json({ message: 'JSON inválido', error: err.message });
    }
    next();
  });
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Seguridad: Headers HTTP
app.use(helmet({
  contentSecurityPolicy: false, // Desactivar CSP para permitir CDNs de Bootstrap/SweetAlert
  crossOriginEmbedderPolicy: false
}));

// CORS restringido
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8080'];

// Siempre permitir orígenes de Railway (*.railway.app)
const isRailwayOrigin = (origin) => {
  return origin && (origin.includes('.railway.app') || origin.includes('railway'));
};

app.use(cors({
  origin: function(origin, callback) {
    // Permitir peticiones sin origin (mismo servidor, Postman, curl)
    if (!origin) return callback(null, true);
    
    // Permitir orígenes de Railway automáticamente
    if (isRailwayOrigin(origin)) return callback(null, true);
    
    // Permitir orígenes configurados
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.log(`❌ CORS bloqueado: ${origin}`);
    callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true
}));

// Sanitización global de inputs
app.use(sanitizeBody);

// Servir archivos estáticos - Asegurar path correcto para Railway
const publicPath = path.join(__dirname, 'public');
console.log(`📁 Serving static files from: ${publicPath}`);
app.use(express.static(publicPath));

// Debug endpoint para verificar archivos (solo en desarrollo)
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug/files', (req, res) => {
    const fs = require('fs');
    try {
      const files = fs.readdirSync(publicPath);
      const jsFiles = fs.readdirSync(path.join(publicPath, 'js'));
      res.json({
        publicPath,
        rootFiles: files,
        jsFiles: jsFiles,
        __dirname: __dirname
      });
    } catch (err) {
      res.status(500).json({ error: err.message, publicPath, __dirname });
    }
  });
}

// Logging middleware (solo en desarrollo)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

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
const superadminRoutes = require('./routes/superadmin');

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
app.use('/api/superadmin', superadminRoutes);
// Montar reportRoutes también en la raíz para soportar /report y /statistics
app.use('/', reportRoutes);

// Configuración y Sucursales
app.use('/settings', settingsRoutes); 
// También en la raíz para que funcionen /branches y /suppliers como espera el frontend
app.use('/', settingsRoutes); 

// Ruta Base (Servir el frontend)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint para Railway (ANTES del 404 handler)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Global error handler - SOLO para errores no manejados
app.use((err, req, res, next) => {
  console.error('❌ Global error:', err.message);
  // No devolver 500 para archivos estáticos
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    return res.status(404).send('Not found');
  }
  res.status(500).json({
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Contacte al administrador'
  });
});

// 404 handler (SIEMPRE al final)
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

// Auto-migración de BD (extraído a db/migrate.js)
const ensureDatabaseSchema = require('./db/migrate');

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
  
  // Verificar conexión a BD al iniciar
  try {
    await db.query('SELECT 1');
    console.log('✅ Conexión a base de datos verificada');
    // Ejecutar auto-migración
    await ensureDatabaseSchema();
    console.log('✅ Esquema de base de datos verificado');
  } catch (error) {
    console.error('❌ Error conectando a la base de datos:', error.message);
  }
});
