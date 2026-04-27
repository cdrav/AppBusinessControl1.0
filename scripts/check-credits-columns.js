const db = require('../config/db');
db.query('SHOW COLUMNS FROM credits')
  .then(([rows]) => {
    console.log('Columnas de credits:');
    rows.forEach(r => console.log('  -', r.Field, r.Type));
    return db.end();
  })
  .catch(e => {
    console.error('Error:', e.message);
    return db.end();
  });
