require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function createAdmin() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
  });

  const username = 'admin';
  const email = 'admin@business.com';
  const password = 'admin123'; // ESTA SERÁ TU CONTRASEÑA

  try {
    // 1. Verificar si ya existe
    const [rows] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      console.log('⚠️  El usuario administrador ya existe.');
      process.exit(0);
    }

    // 2. Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Insertar usuario
    await connection.execute(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, 'admin']
    );

    console.log(`✅ Usuario creado con éxito.\n📧 Email: ${email}\n🔑 Pass: ${password}`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    connection.end();
  }
}

createAdmin();