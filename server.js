require('dotenv').config();  
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');

// Crear la aplicación Express
const app = express();
app.use(express.json()); 

// *** CORRECCIÓN CRÍTICA: Servir archivos estáticos (HTML, CSS, JS) ***
// Esto permite que el navegador cargue tus archivos del frontend.
app.use(express.static('public'));
app.use(cors());

// Configurar la conexión a MySQL. Usaremos mysql2 para soporte de promesas y transacciones más limpias.
// Por favor, ejecuta: npm install mysql2
const mysql = require('mysql2/promise');

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,  
});

// La conexión con mysql2/promise se maneja de forma diferente, no se llama a .connect() al inicio.
// Las conexiones se gestionan por consulta. Para transacciones, crearemos una conexión específica.
console.log('Pool de conexión a la base de datos configurado.');


// Ruta de prueba
app.get('/', (req, res) => {
  res.send('Bienvenido a Business Control API');
});

// Ruta para /dashboard
app.get('/dashboard', authenticateToken, (req, res) => {
  res.json({ message: 'Bienvenido al Dashboard' });
});

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

// Ruta para iniciar sesión
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  const query = 'SELECT * FROM users WHERE email = ?';
  db.query(query, [email.toLowerCase()], (err, results) => {
    if (err) {
      console.error('Error al verificar usuario:', err);
      return res.status(500).json({ message: 'Error del servidor' });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: 'Correo electrónico o contraseña incorrectos' });
    }

    const user = results[0];
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        console.error('Error al verificar contraseña:', err);
        return res.status(500).json({ message: 'Error del servidor' });
      }

      if (!isMatch) {
        return res.status(401).json({ message: 'Correo electrónico o contraseña incorrectos' });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      res.status(200).json({ message: 'Inicio de sesión exitoso', token });
    });
  });
});

// ==================================================================
// RUTAS DE CLIENTES REFACTORIZADAS CON ASYNC/AWAIT
// ==================================================================

// Obtener todos los clientes
app.get('/clients', authenticateToken, async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM clients ORDER BY name ASC');
    res.status(200).json(results);
  } catch (error) {
    console.error('Error al obtener los clientes:', error);
    res.status(500).json({ message: 'Error del servidor al obtener clientes' });
  }
});

// Agregar un nuevo cliente
app.post('/clients', authenticateToken, async (req, res) => {
  const { name, email, phone, address } = req.body;
  if (!name || !email || !phone) {
    return res.status(400).json({ message: 'Nombre, email y teléfono son obligatorios' });
  }
  try {
    const [result] = await db.query('INSERT INTO clients (name, email, phone, address) VALUES (?, ?, ?, ?)', [name, email, phone, address]);
    res.status(201).json({ message: 'Cliente agregado con éxito', clienteId: result.insertId });
  } catch (error) {
    console.error('Error al agregar cliente:', error);
    res.status(500).json({ message: 'Error del servidor al agregar cliente' });
  }
});

// Obtener un cliente específico por ID
app.get('/clients/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const [results] = await db.query('SELECT id, name, email, phone, address FROM clients WHERE id = ?', [id]);
    if (results.length === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }
    res.status(200).json(results[0]);
  } catch (error) {
    console.error('Error al obtener el cliente:', error);
    res.status(500).json({ message: 'Error del servidor al obtener el cliente' });
  }
});

// *** CORRECCIÓN CRÍTICA: Ruta para actualizar un cliente (PUT) ***
app.put('/clients/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, address } = req.body;
  if (!name || !email || !phone) {
    return res.status(400).json({ message: 'Nombre, email y teléfono son obligatorios' });
  }
  try {
    await db.query('UPDATE clients SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?', [name, email, phone, address, id]);
    res.status(200).json({ message: 'Cliente actualizado con éxito' });
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    res.status(500).json({ message: 'Error del servidor al actualizar cliente' });
  }
});

// *** CORRECCIÓN CRÍTICA: Ruta para eliminar un cliente (DELETE) ***
app.delete('/clients/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query('DELETE FROM clients WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }
    res.status(200).json({ message: 'Cliente eliminado con éxito' });
  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    res.status(500).json({ message: 'Error del servidor al eliminar cliente' });
  }
});

// Middleware para verificar JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    return res.status(401).json({ message: 'Acceso no autorizado' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token inválido o expirado' });
    }

    req.user = user; // Almacena los datos del usuario en la solicitud
    next(); // Llama al siguiente middleware o controlador de ruta
  });
}

// Puerto del servidor Express
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});

// inventarios
// Obtener todos los productos
app.get('/inventory', authenticateToken, (req, res) => {
    const query = 'SELECT * FROM inventory'; // Asegúrate de que esta tabla exista
    db.query(query, (err, results) => {
      if (err) {
        console.error('Error al obtener el inventario:', err);
        return res.status(500).json({ message: 'Error del servidor' });
      }
      res.status(200).json(results);
    });
  });
  
  // Agregar un producto
  app.post('/inventory', authenticateToken, (req, res) => {
    const { name, quantity, price } = req.body;
  
    if (!name || !quantity || !price) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }
  
    
    const query = 'INSERT INTO inventory (product_name, stock, price) VALUES (?, ?, ?)';
    db.query(query, [name, quantity, price], (err, result) => {
      if (err) {
        console.error('Error al agregar producto:', err);
        return res.status(500).json({ message: 'Error del servidor' });
      }
      res.status(201).json({ message: 'Producto agregado con éxito', productId: result.insertId });
    });
  });
  
  // Editar un producto
  app.put('/inventory/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { name, quantity, price } = req.body;
  
    if (!name || !quantity || !price) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }
  
    
    const query = 'UPDATE inventory SET product_name = ?, stock = ?, price = ? WHERE id = ?';
    db.query(query, [name, quantity, price, id], (err) => {
      if (err) {
        console.error('Error al actualizar producto:', err);
        return res.status(500).json({ message: 'Error del servidor' });
      }
      res.status(200).json({ message: 'Producto actualizado con éxito' });
    });
  });
  
  // Eliminar un producto
  app.delete('/inventory/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
  
    const query = 'DELETE FROM inventory WHERE id = ?';
    db.query(query, [id], (err) => {
      if (err) {
        console.error('Error al eliminar producto:', err);
        return res.status(500).json({ message: 'Error del servidor' });
      }
      res.status(200).json({ message: 'Producto eliminado con éxito' });
    });
  });
  
// ==================================================================
// RUTA DE VENTAS REFACTORIZADA CON TRANSACCIONES
// ==================================================================
app.post('/sales', authenticateToken, async (req, res) => {
  const { clientId, products, saleDate } = req.body;

  if (!clientId || !products || !Array.isArray(products) || products.length === 0 || !saleDate) {
    return res.status(400).json({ message: 'Datos de venta inválidos. Se requiere cliente, fecha y un arreglo de productos.' });
  }

  // Usaremos una conexión del pool para la transacción
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    let totalSalePrice = 0;
    const productDetails = [];

    // 1. Validar stock y calcular totales (usando FOR...OF para usar await dentro)
    for (const product of products) {
      const { productId, quantity } = product;
      if (!productId || !quantity || quantity <= 0) {
        throw new Error('Cada producto debe tener un ID y una cantidad válida.');
      }

      const [rows] = await connection.query('SELECT product_name, stock, price FROM inventory WHERE id = ? FOR UPDATE', [productId]);
      if (rows.length === 0) {
        throw new Error(`Producto con ID ${productId} no encontrado.`);
      }

      const item = rows[0];
      if (item.stock < quantity) {
        throw new Error(`Stock insuficiente para el producto: ${item.product_name}. Disponible: ${item.stock}`);
      }

      const subtotal = item.price * quantity;
      totalSalePrice += subtotal;
      productDetails.push({ productId, quantity, subtotal });
    }

    // 2. Insertar la venta principal
    const [saleResult] = await connection.query(
      'INSERT INTO sales (client_id, total_price, sale_date) VALUES (?, ?, ?)',
      [clientId, totalSalePrice, saleDate]
    );
    const saleId = saleResult.insertId;

    // 3. Insertar detalles de la venta y actualizar stock
    for (const detail of productDetails) {
      // Insertar detalle
      await connection.query(
        'INSERT INTO sale_details (sale_id, product_id, quantity, subtotal) VALUES (?, ?, ?, ?)',
        [saleId, detail.productId, detail.quantity, detail.subtotal]
      );

      // Actualizar stock
      await connection.query(
        'UPDATE inventory SET stock = stock - ? WHERE id = ?',
        [detail.quantity, detail.productId]
      );
    }

    // 4. Si todo fue bien, confirmar la transacción
    await connection.commit();

    res.status(201).json({ message: 'Venta registrada con éxito', saleId });

  } catch (error) { {
    // 5. Si algo falló, revertir todos los cambios
    if (connection) await connection.rollback();
    console.error('Error en la transacción de venta:', error);
    // Enviamos el mensaje de error específico al cliente
    res.status(500).json({ message: error.message || 'Error del servidor al procesar la venta.' });
  }
  } finally {
    // 6. Liberar la conexión en cualquier caso
    if (connection) connection.release();
  }
});



// Ruta para obtener todas las ventas
app.get('/sales', authenticateToken, (req, res) => {
  const query = `
    SELECT 
      s.id, 
      c.name AS client_name, 
      s.total_price, 
      s.sale_date
    FROM sales s
    JOIN clients c ON s.client_id = c.id
    ORDER BY s.sale_date DESC
  `;
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error al obtener las ventas:', err);
      return res.status(500).json({ message: 'Error del servidor' });
    }
    res.status(200).json(results);
  });
});

// Ruta para generar el reporte en PDF
app.get('/report', authenticateToken, (req, res) => {
    // Crear un nuevo documento PDF
    const doc = new PDFDocument();
    
    // Configurar la respuesta para enviar el PDF al cliente
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=report.pdf');
    
    // Pipe el documento PDF directamente al cliente
    doc.pipe(res);
    
    // Agregar contenido al PDF
    doc.fontSize(18).text('Reporte de Ventas', { align: 'center' });
    doc.moveDown();
    
    // Aquí puedes obtener los datos de la base de datos, por ejemplo, ventas
    const query = `
      SELECT s.id, c.name AS client_name, s.total_price, s.sale_date
      FROM sales s
      JOIN clients c ON s.client_id = c.id
      ORDER BY s.sale_date DESC
    `;

    db.query(query, (err, results) => {
      if (err) {
        console.error('Error al obtener los datos del reporte:', err);
        return res.status(500).json({ message: 'Error al generar el reporte' });
      }
      
      // Agregar cada venta al PDF
      results.forEach(sale => {
        doc.fontSize(12).text(`ID de Venta: ${sale.id}`);
        doc.text(`Cliente: ${sale.client_name}`);
        doc.text(`Fecha de Venta: ${sale.sale_date}`);
        doc.text(`Total: Q${sale.total_price.toFixed(2)}`);
        doc.moveDown();
      });
      
      // Finalizar el documento PDF
      doc.end();
    });
  });
  
