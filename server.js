require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
// Asegúrate de que este archivo exista en services/emailService.js
const { sendDailySummaryEmail } = require('./services/emailService');

// Función de setup de base de datos
const setupDatabase = async () => {
  try {
    console.log('🚀 Verificando base de datos...');
    
    const mysql = require('mysql2/promise');
    
    // Conectar sin especificar base de datos primero
    const db = await mysql.createConnection({
      host: process.env.DB_HOST || 'yamabiko.proxy.rlwy.net',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 15388,
      ssl: { rejectUnauthorized: false }
    });
    
    // Crear base de datos si no existe
    await db.execute(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'railway'}\``);
    console.log('✅ Base de datos verificada');
    await db.end();
    
    // Conectar con la base de datos
    const dbWithSchema = await mysql.createConnection({
      host: process.env.DB_HOST || 'yamabiko.proxy.rlwy.net',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'railway',
      port: process.env.DB_PORT || 15388,
      ssl: { rejectUnauthorized: false }
    });
    
    // Verificar si existe la tabla users
    const [tables] = await dbWithSchema.execute("SHOW TABLES LIKE 'users'");
    
    if (tables.length === 0) {
      console.log('📋 Creando tablas...');
      
      // Crear usuario admin por defecto
      const bcrypt = require('bcrypt');
      const adminPassword = await bcrypt.hash('admin123', 10);
      
      await dbWithSchema.execute(`
        CREATE TABLE users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'cajero',
          branch_id INT DEFAULT NULL,
          tenant_id INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await dbWithSchema.execute(`
        CREATE TABLE clients (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          phone VARCHAR(50),
          address TEXT,
          branch_id INT DEFAULT NULL,
          tenant_id INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await dbWithSchema.execute(`
        CREATE TABLE inventory (
          id INT AUTO_INCREMENT PRIMARY KEY,
          product_name VARCHAR(255) NOT NULL,
          stock INT NOT NULL DEFAULT 0,
          price DECIMAL(10, 2) NOT NULL,
          category VARCHAR(100),
          description TEXT,
          branch_id INT DEFAULT NULL,
          tenant_id INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await dbWithSchema.execute(`
        CREATE TABLE sales (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT,
          total_price DECIMAL(10, 2) NOT NULL,
          sale_date DATETIME NOT NULL,
          branch_id INT DEFAULT NULL,
          tenant_id INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(id)
        )
      `);
      
      await dbWithSchema.execute(`
        CREATE TABLE sale_details (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sale_id INT,
          product_id INT,
          quantity INT NOT NULL,
          subtotal DECIMAL(10, 2) NOT NULL,
          FOREIGN KEY (sale_id) REFERENCES sales(id),
          FOREIGN KEY (product_id) REFERENCES inventory(id)
        )
      `);
      
      // Crear usuario admin
      await dbWithSchema.execute(
        'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
        ['admin', 'admin@businesscontrol.com', adminPassword, 'admin']
      );
      
      console.log('✅ Tablas y usuario admin creados');
    } else {
      console.log('✅ Las tablas ya existen');
    }
    
    await dbWithSchema.end();
    console.log('🎉 Base de datos lista');
    
  } catch (error) {
    console.error('❌ Error en setup:', error.message);
  }
};

// Ejecutar setup antes de iniciar el servidor
setupDatabase().then(() => {
  // Inicializar App después del setup
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
});
