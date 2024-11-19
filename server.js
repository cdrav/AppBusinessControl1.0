require('dotenv').config();
const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const cors = require('cors');

// Crear la aplicación Express
const app = express();
app.use(bodyParser.json());
app.use(cors());

// Configurar la conexión a MySQL
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// Conectar a la base de datos
db.connect((err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err);
    return;
  }
  console.log('Conexión exitosa a la base de datos');
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('Bienvenido a Business Control API');
});

// Puerto del servidor
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});

const bcrypt = require('bcrypt');

// Ruta para registrar un nuevo usuario
app.post('/register', (req, res) => {
  const { username, email, password } = req.body;

  // Validación básica
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  // Verificar si el usuario ya existe
  const checkUserQuery = 'SELECT * FROM users WHERE email = ? OR username = ?';
  db.query(checkUserQuery, [email, username], (err, results) => {
    if (err) {
      console.error('Error al verificar usuario:', err);
      return res.status(500).json({ message: 'Error del servidor' });
    }

    if (results.length > 0) {
      return res.status(409).json({ message: 'El usuario o correo ya existe' });
    }

    // Cifrar la contraseña
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error('Error al cifrar la contraseña:', err);
        return res.status(500).json({ message: 'Error del servidor' });
      }

      // Insertar el nuevo usuario en la base de datos
      const insertUserQuery = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
      db.query(insertUserQuery, [username, email, hashedPassword], (err, result) => {
        if (err) {
          console.error('Error al registrar usuario:', err);
          return res.status(500).json({ message: 'Error del servidor' });
        }

        res.status(201).json({ message: 'Usuario registrado con éxito' });
      });
    });
  });
});
