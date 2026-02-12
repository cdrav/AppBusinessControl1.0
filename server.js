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
app.use(express.static(__dirname));
app.use(cors());

// Configurar la conexión a MySQL. Usaremos mysql2 para soporte de promesas y transacciones más limpias.
// Por favor, ejecuta: npm install mysql2
const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,  
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

console.log('Pool de conexiones a la base de datos configurado.');


// Ruta de prueba
app.get('/', (req, res) => {
  // Con la nueva estructura, esto servirá `public/index.html` automáticamente.
  // Eliminamos esta respuesta para que express.static sirva el index.html
  res.sendFile(__dirname + '/index.html');
});

// Ruta para /dashboard
app.get('/dashboard', authenticateToken, (req, res) => {
  // Esta ruta debería servir el archivo HTML o ser usada para obtener datos del dashboard.
  // Dado que tienes `dashboard.html`, devolvemos JSON solo si es una petición de API explícita
  res.json({ message: 'Bienvenido al Dashboard' });
});

// Ruta para registrar un nuevo usuario
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  try {
    const [existingUsers] = await db.query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);

    if (existingUsers.length > 0) {
      return res.status(409).json({ message: 'El usuario o correo ya existe' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword]);

    res.status(201).json({ message: 'Usuario registrado con éxito' });
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// Ruta para iniciar sesión
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  try {
    const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);

    if (results.length === 0) {
      return res.status(401).json({ message: 'Correo electrónico o contraseña incorrectos' });
    }

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Correo electrónico o contraseña incorrectos' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({ message: 'Inicio de sesión exitoso', token });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
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

// ==================================================================
// RUTAS DE INVENTARIO REFACTORIZADAS CON ASYNC/AWAIT
// ==================================================================

// Obtener todos los productos
app.get('/inventory', authenticateToken, async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM inventory ORDER BY product_name ASC');
    res.status(200).json(results);
  } catch (error) {
    console.error('Error al obtener el inventario:', error);
    res.status(500).json({ message: 'Error del servidor al obtener el inventario' });
  }
});
  
  // Agregar un producto
  app.post('/inventory', authenticateToken, async (req, res) => {
    const { name, quantity, price, category, description } = req.body;
  
    if (!name || !quantity || !price) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }
  
    try {
      // Asumimos que la tabla `inventory` tiene las columnas `category` y `description`.
      const query = 'INSERT INTO inventory (product_name, stock, price, category, description) VALUES (?, ?, ?, ?, ?)';
      const [result] = await db.query(query, [name, quantity, price, category || null, description || null]);
      res.status(201).json({ message: 'Producto agregado con éxito', productId: result.insertId });
    } catch (error) {
      console.error('Error al agregar producto:', error);
      res.status(500).json({ message: 'Error del servidor al agregar producto' });
    }
  });
  
  // Editar un producto
  app.put('/inventory/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, quantity, price, category, description } = req.body;
  
    if (!name || !quantity || !price) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }
  
    try {
      const query = 'UPDATE inventory SET product_name = ?, stock = ?, price = ?, category = ?, description = ? WHERE id = ?';
      const [result] = await db.query(query, [name, quantity, price, category, description, id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Producto no encontrado' });
      }
      res.status(200).json({ message: 'Producto actualizado con éxito' });
    } catch (error) {
      console.error('Error al actualizar producto:', error);
      res.status(500).json({ message: 'Error del servidor al actualizar producto' });
    }
  });
  
  // Eliminar un producto
  app.delete('/inventory/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
  
    try {
      const [result] = await db.query('DELETE FROM inventory WHERE id = ?', [id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Producto no encontrado' });
      }
      res.status(200).json({ message: 'Producto eliminado con éxito' });
    } catch (error) {
      console.error('Error al eliminar producto:', error);
      res.status(500).json({ message: 'Error del servidor al eliminar producto' });
    }
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

  } catch (error) {
    // 5. Si algo falló, revertir todos los cambios
    if (connection) await connection.rollback();
    console.error('Error en la transacción de venta:', error);
    // Enviamos el mensaje de error específico al cliente
    res.status(500).json({ message: error.message || 'Error del servidor al procesar la venta.' });
  } finally {
    // 6. Liberar la conexión en cualquier caso
    if (connection) connection.release();
  }
});



// Ruta para obtener todas las ventas
app.get('/sales', authenticateToken, async (req, res) => {
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
  try {
    const [results] = await db.query(query);
    res.status(200).json(results);
  } catch (error) {
    console.error('Error al obtener las ventas:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// Ruta para generar el reporte en PDF
app.get('/report', authenticateToken, async (req, res) => {
  const doc = new PDFDocument({ margin: 50 });

  try {
    const query = `
      SELECT s.id, c.name AS client_name, s.total_price, s.sale_date
      FROM sales s
      JOIN clients c ON s.client_id = c.id
      ORDER BY s.sale_date DESC
    `;
    const [sales] = await db.query(query);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-ventas.pdf');

    doc.pipe(res);

    // Contenido del PDF
    doc.fontSize(18).text('Reporte de Ventas', { align: 'center' });
    doc.moveDown();

    if (sales.length === 0) {
      doc.fontSize(12).text('No hay ventas registradas para generar un reporte.');
    } else {
      sales.forEach(sale => {
        const saleDate = new Date(sale.sale_date).toLocaleDateString('es-GT');
        doc.fontSize(12).text(`ID Venta: ${sale.id}`, { continued: true });
        doc.fontSize(12).text(` - Fecha: ${saleDate}`, { align: 'right' });
        doc.text(`Cliente: ${sale.client_name}`);
        doc.text(`Total: Q${sale.total_price.toFixed(2)}`);
        doc.moveDown();
      });
    }

    doc.end();
  } catch (error) {
    console.error('Error al generar el reporte:', error);
    // Si ocurre un error, no podemos enviar un JSON porque las cabeceras pueden estar ya enviadas.
    // Lo mejor es terminar el stream y registrar el error.
    res.status(500).end('Error al generar el reporte en PDF.');
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

    req.user = user;
    next();
  });
}

// Puerto del servidor Express
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
