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
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// --- SECCIÓN DE CORS CORREGIDA PARA RENDER ---
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      'http://localhost:3000', 
      'http://127.0.0.1:3000', 
      'http://localhost:8080',
      'https://onrender.com' // Agregada la URL de Render
    ];

// Permitir Railway y Render automáticamente
const isAllowedProvider = (origin) => {
  return origin && (
    origin.includes('.railway.app') || 
    origin.includes('.onrender.com') || 
    origin.includes('localhost')
  );
};

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    
    if (isAllowedProvider(origin) || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.log(`❌ CORS bloqueado: ${origin}`);
    callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true
}));
// --------------------------------------------

app.use(sanitizeBody);

const publicPath = path.join(__dirname, 'public');
console.log(`📁 Serving static files from: ${publicPath}`);
app.use(express.static(publicPath));

// Debug endpoint (solo desarrollo)
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug/files', (req, res) => {
    const fs = require('fs');
    try {
      const files = fs.readdirSync(publicPath);
      res.json({ publicPath, rootFiles: files });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// Logging middleware (solo desarrollo)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Rutas
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

app.use('/', authRoutes);
app.use('/users', userRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/sales', salesRoutes);
app.use('/clients', clientRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api', reportRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/', reportRoutes);
app.use('/settings', settingsRoutes); 
app.use('/', settingsRoutes); 

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Global error:', err.message);
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    return res.status(404).send('Not found');
  }
  res.status(500).json({
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Contacte al administrador'
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

cron.schedule('0 20 * * *', async () => {
    console.log('🕒 Ejecutando cierre de caja diario...');
    try {
        await sendDailySummaryEmail(new Date());
    } catch (error) {
        console.error('Error en cierre de caja:', error);
    }
}, { scheduled: true, timezone: "America/Bogota" });

const ensureDatabaseSchema = require('./db/migrate');

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  try {
    await db.query('SELECT 1');
    console.log('✅ Conexión a base de datos verificada');
    await ensureDatabaseSchema();
    console.log('✅ Esquema de base de datos verificado');
  } catch (error) {
    console.error('❌ Error conectando a la base de datos:', error.message);
  }
});
