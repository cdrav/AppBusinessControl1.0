try {
  require('./config/roles');
  console.log('OK: config/roles');
  require('./middleware/auth');
  console.log('OK: middleware/auth');
  require('./routes/superadmin');
  console.log('OK: routes/superadmin');
  require('./db/migrate');
  console.log('OK: db/migrate');
  console.log('ALL MODULES LOADED SUCCESSFULLY');
} catch(e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}
