require('dotenv').config();
const mysql = require('mysql2/promise');

// Configuración para Railway con soporte SSL
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'business_control',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true,
  // SSL para conexiones externas (Railway)
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

const db = mysql.createPool(dbConfig);

console.log('✅ Pool de conexiones a la base de datos configurado.');
console.log(`🔗 Conectando a: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);

module.exports = db;
