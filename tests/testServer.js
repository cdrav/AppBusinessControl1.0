const express = require('express');

// Crear una función que retorna una app Express sin iniciar el servidor
function createTestApp() {
  const app = express();
  
  // Middleware básico
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Importar rutas
  const authRoutes = require('../routes/auth');
  const userRoutes = require('../routes/users');
  const inventoryRoutes = require('../routes/inventory');
  const salesRoutes = require('../routes/sales');
  const clientRoutes = require('../routes/clients');
  const reportRoutes = require('../routes/reports');
  const settingsRoutes = require('../routes/settings');
  const expensesRoutes = require('../routes/expenses');

  // Usar rutas
  app.use('/', authRoutes);
  app.use('/users', userRoutes);
  app.use('/inventory', inventoryRoutes);
  app.use('/sales', salesRoutes);
  app.use('/clients', clientRoutes);
  app.use('/api', reportRoutes);
  app.use('/api/expenses', expensesRoutes);
  app.use('/', reportRoutes);
  app.use('/settings', settingsRoutes);
  app.use('/', settingsRoutes);

  // Manejo de errores
  app.use((err, req, res, next) => {
    console.error('Test server error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  });

  return app;
}

module.exports = createTestApp;
