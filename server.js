require('dotenv').config();  
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const multer = require('multer');

// Configuración de Multer para subir imágenes
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'public/images/uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, 'logo-' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Configuración de Nodemailer
const transporter = nodemailer.createTransport({
  service: 'hotmail', // Actualizado para coincidir con el correo @hotmail.com del .env
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Función para enviar alerta de stock bajo
async function sendLowStockAlert(products) {
    if (!process.env.EMAIL_USER || products.length === 0) return;

    const productList = products.map(p => `<li><strong>${p.name}</strong>: Quedan ${p.stock} unidades</li>`).join('');
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER, // Se envía al mismo admin (o cambia esto por otro correo)
        subject: '⚠️ Alerta de Stock Bajo - Business Control',
        html: `<h3>Los siguientes productos tienen stock bajo:</h3><ul>${productList}</ul><p>Por favor, reabastece el inventario pronto.</p>`
    };

    try { await transporter.sendMail(mailOptions); console.log('📧 Correo de alerta enviado'); } 
    catch (error) { console.error('❌ Error enviando correo:', error); }
}

// Crear la aplicación Express
const app = express();
app.use(express.json()); 

// *** CORRECCIÓN CRÍTICA: Servir archivos estáticos (HTML, CSS, JS) ***
// Servimos solo la carpeta 'public' para proteger el código fuente del backend.
app.use(express.static(path.join(__dirname, 'public')));
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
  // Servir explícitamente el index.html desde la carpeta public
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para /dashboard
app.get('/dashboard', authenticateToken, (req, res) => {
  // Esta ruta debería servir el archivo HTML o ser usada para obtener datos del dashboard.
  // Dado que tienes `dashboard.html`, devolvemos JSON solo si es una petición de API explícita
  res.json({ message: 'Bienvenido al Dashboard' });
});

// Ruta para registrar un nuevo usuario
app.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validación simple
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Faltan datos requeridos para el registro.' });
    }

    // Verificar duplicados
    const [usersFound] = await db.query('SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1', [email, username]);
    
    if (usersFound.length > 0) {
      return res.status(409).json({ message: 'Este usuario o correo ya está en uso.' });
    }

    // Asignar rol: el primer usuario es 'admin', los demás 'cajero'
    const [userCount] = await db.query('SELECT COUNT(*) as count FROM users');
    const role = userCount[0].count === 0 ? 'admin' : 'cajero';

    const passwordHash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, role]
    );

    res.status(201).json({ message: 'Cuenta creada exitosamente.' });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para iniciar sesión
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Credenciales incompletas.' });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email.toLowerCase()]);

    if (rows.length === 0) return res.status(401).json({ message: 'Credenciales inválidas.' });

    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) return res.status(401).json({ message: 'Credenciales inválidas.' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });

    res.json({ message: 'Bienvenido de nuevo', token });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ message: 'Error interno.' });
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

// Obtener historial de compras de un cliente
app.get('/clients/:id/sales', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const [results] = await db.query(`
      SELECT s.id, s.sale_date, s.total_price, 
             (SELECT COUNT(*) FROM sale_details sd WHERE sd.sale_id = s.id) as item_count
      FROM sales s
      WHERE s.client_id = ?
      ORDER BY s.sale_date DESC
    `, [id]);
    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener historial' });
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
app.delete('/clients/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
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

// Exportar inventario a CSV (MOVIDO AQUÍ PARA EVITAR CONFLICTO CON :id)
app.get('/inventory/export', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM inventory ORDER BY id ASC');
    
    // Cabeceras del CSV
    let csv = 'ID,Codigo Barras,Nombre,Stock,Precio,Categoria,Descripcion\n';
    
    // Filas
    results.forEach(row => {
      csv += `${row.id},"${(row.barcode || '').replace(/"/g, '""')}","${(row.product_name || '').replace(/"/g, '""')}",${row.stock},${row.price},"${(row.category || '').replace(/"/g, '""')}","${(row.description || '').replace(/"/g, '""')}"\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment('inventario.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error al exportar inventario:', error);
    res.status(500).send('Error al generar el archivo');
  }
});

// Obtener un producto específico por ID (Para edición)
app.get('/inventory/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const [results] = await db.query('SELECT * FROM inventory WHERE id = ?', [id]);
    if (results.length === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    res.status(200).json(results[0]);
  } catch (error) {
    console.error('Error al obtener el producto:', error);
    res.status(500).json({ message: 'Error del servidor al obtener el producto' });
  }
});
  
  // Obtener un producto por código de barras
  app.get('/inventory/barcode/:barcode', authenticateToken, async (req, res) => {
    const { barcode } = req.params;
    try {
      const [results] = await db.query('SELECT * FROM inventory WHERE barcode = ?', [barcode]);
      if (results.length === 0) {
        return res.status(404).json({ message: 'Producto no encontrado' });
      }
      res.status(200).json(results[0]);
    } catch (error) {
      console.error('Error al buscar producto por código de barras:', error);
      res.status(500).json({ message: 'Error del servidor' });
    }
  });

  // Agregar un producto
  app.post('/inventory', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { name, quantity, price, category, description, barcode } = req.body;
  
    if (!name || !quantity || !price) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }
  
    try {
      // Incluimos barcode en la inserción
      const query = 'INSERT INTO inventory (product_name, stock, price, category, description, barcode) VALUES (?, ?, ?, ?, ?, ?)';
      const [result] = await db.query(query, [name, quantity, price, category || null, description || null, barcode || null]);
      res.status(201).json({ message: 'Producto agregado con éxito', productId: result.insertId });
    } catch (error) {
      console.error('Error al agregar producto:', error);
      res.status(500).json({ message: 'Error del servidor al agregar producto' });
    }
  });
  
  // Editar un producto
  app.put('/inventory/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const { name, quantity, price, category, description, barcode } = req.body;
  
    if (!name || !quantity || !price) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }
  
    try {
      const query = 'UPDATE inventory SET product_name = ?, stock = ?, price = ?, category = ?, description = ?, barcode = ? WHERE id = ?';
      const [result] = await db.query(query, [name, quantity, price, category, description, barcode || null, id]);
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
  app.delete('/inventory/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
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
  const { clientId, products, saleDate, couponCode, notes } = req.body;

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
    const lowStockItems = []; // Lista para alertas

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

    // 1.5 Calcular Descuento (Si hay cupón)
    let discountAmount = 0;
    if (couponCode) {
        const [coupons] = await connection.query('SELECT * FROM coupons WHERE code = ? AND active = TRUE', [couponCode]);
        if (coupons.length > 0) {
            const coupon = coupons[0];
            // Validar fecha de expiración
            if (!coupon.expiration_date || new Date(coupon.expiration_date) >= new Date()) {
                if (coupon.discount_type === 'percent') {
                    discountAmount = totalSalePrice * (coupon.value / 100);
                } else {
                    discountAmount = parseFloat(coupon.value);
                }
            }
        }
    }
    const finalTotal = Math.max(0, totalSalePrice - discountAmount);

    // 2. Insertar la venta principal
    const [saleResult] = await connection.query(
      'INSERT INTO sales (client_id, total_price, discount, coupon_code, sale_date, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [clientId, finalTotal, discountAmount, couponCode || null, saleDate, notes || null]
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

      // Verificar si el stock bajó del umbral (ej. 10 unidades)
      const [stockRows] = await connection.query('SELECT product_name, stock FROM inventory WHERE id = ?', [detail.productId]);
      if (stockRows.length > 0 && stockRows[0].stock <= 10) {
          lowStockItems.push({ name: stockRows[0].product_name, stock: stockRows[0].stock });
      }
    }

    // 4. Si todo fue bien, confirmar la transacción
    await connection.commit();

    // 5. Enviar alerta de correo (fuera de la transacción para no bloquear)
    if (lowStockItems.length > 0) {
        sendLowStockAlert(lowStockItems);
    }

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

// Validar cupón (Endpoint para el frontend)
app.get('/coupons/validate/:code', authenticateToken, async (req, res) => {
  const { code } = req.params;
  try {
    const [rows] = await db.query('SELECT * FROM coupons WHERE code = ? AND active = TRUE', [code]);
    if (rows.length === 0) return res.status(404).json({ message: 'Cupón no válido' });
    
    const coupon = rows[0];
    if (coupon.expiration_date && new Date(coupon.expiration_date) < new Date()) {
        return res.status(400).json({ message: 'El cupón ha expirado' });
    }
    
    res.json(coupon);
  } catch (error) {
    res.status(500).json({ message: 'Error al validar cupón' });
  }
});

// Crear cupón (Solo Admin)
app.post('/coupons', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { code, discount_type, value, expiration_date } = req.body;
    try {
        await db.query(
            'INSERT INTO coupons (code, discount_type, value, expiration_date) VALUES (?, ?, ?, ?)',
            [code.toUpperCase(), discount_type, value, expiration_date]
        );
        res.status(201).json({ message: 'Cupón creado' });
    } catch (error) {
        res.status(500).json({ message: 'Error al crear cupón' });
    }
});

// Obtener todos los cupones (Solo Admin)
app.get('/coupons', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const [coupons] = await db.query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json(coupons);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener cupones' });
  }
});

// Eliminar cupón (Solo Admin)
app.delete('/coupons/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM coupons WHERE id = ?', [id]);
    res.json({ message: 'Cupón eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar cupón' });
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

// Ruta para eliminar una venta y restaurar el stock
app.delete('/sales/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 1. Obtener los detalles de la venta para saber qué productos devolver al stock
    const [details] = await connection.query('SELECT product_id, quantity FROM sale_details WHERE sale_id = ?', [id]);
    
    if (details.length === 0) {
        // Verificar si la venta existe (podría ser una venta antigua sin detalles o error)
        const [sale] = await connection.query('SELECT id FROM sales WHERE id = ?', [id]);
        if (sale.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Venta no encontrada' });
        }
    }

    // 2. Restaurar stock de cada producto
    for (const item of details) {
        await connection.query('UPDATE inventory SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
    }

    // 3. Eliminar la venta (la base de datos debería eliminar los detalles automáticamente si hay ON DELETE CASCADE, pero lo hacemos manual por seguridad)
    await connection.query('DELETE FROM sale_details WHERE sale_id = ?', [id]);
    await connection.query('DELETE FROM sales WHERE id = ?', [id]);

    await connection.commit();
    res.status(200).json({ message: 'Venta eliminada y stock restaurado correctamente' });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error al eliminar venta:', error);
    res.status(500).json({ message: 'Error al eliminar la venta' });
  } finally {
    if (connection) connection.release();
  }
});

// Procesar devolución de productos
app.post('/sales/:id/return', authenticateToken, authorizeRole(['admin', 'cajero']), async (req, res) => {
    const { id } = req.params;
    const { items } = req.body; // Array de { productId, quantity }

    if (!items || items.length === 0) return res.status(400).json({ message: 'No se seleccionaron productos para devolver' });

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        for (const item of items) {
            // 1. Verificar que el producto estaba en la venta
            const [details] = await connection.query('SELECT quantity FROM sale_details WHERE sale_id = ? AND product_id = ?', [id, item.productId]);
            
            if (details.length > 0) {
                // 2. Restaurar stock
                await connection.query('UPDATE inventory SET stock = stock + ? WHERE id = ?', [item.quantity, item.productId]);
                
                // 3. Registrar la devolución (Podrías crear una tabla 'returns' para historial, aquí simplificamos actualizando la venta o notas)
                await connection.query('UPDATE sales SET notes = CONCAT(IFNULL(notes, ""), " [Devolución: Prod ID ", ?, " Cant ", ?, "]") WHERE id = ?', [item.productId, item.quantity, id]);
            }
        }

        await connection.commit();
        res.json({ message: 'Devolución procesada y stock restaurado' });

    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ message: 'Error al procesar devolución' });
    } finally {
        if (connection) connection.release();
    }
});

// Ruta para generar ticket de venta individual (PDF)
app.get('/sales/:id/ticket', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    // 0. Obtener configuración de la empresa
    const [settings] = await db.query('SELECT * FROM settings WHERE id = 1');
    const config = settings[0] || { company_name: 'Business Control' };

    // 1. Obtener datos de la venta y cliente
    const [saleRows] = await db.query(`
      SELECT s.id, s.sale_date, s.total_price, s.notes, c.name as client_name, c.address, c.phone
      FROM sales s
      LEFT JOIN clients c ON s.client_id = c.id
      WHERE s.id = ?
    `, [id]);

    if (saleRows.length === 0) return res.status(404).send('Venta no encontrada');
    const sale = saleRows[0];

    // 2. Obtener detalles de productos
    const [details] = await db.query(`
      SELECT i.product_name, sd.quantity, sd.subtotal, i.price
      FROM sale_details sd
      LEFT JOIN inventory i ON sd.product_id = i.id
      WHERE sd.sale_id = ?
    `, [id]);

    // 3. Generar PDF
    const isThermal = config.ticket_format === '80mm';
    const pdfOptions = isThermal 
        ? { margin: 15, size: [226, 800] } // 80mm width (approx 226 points)
        : { margin: 50, size: 'A4' };

    const doc = new PDFDocument(pdfOptions);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=ticket-${id}.pdf`);

    doc.pipe(res);

    if (isThermal) {
        // --- Logo para Ticket Térmico ---
        if (config.company_logo && fs.existsSync(path.join(__dirname, 'public', config.company_logo))) {
            doc.image(path.join(__dirname, 'public', config.company_logo), {
                fit: [100, 50], // max width 100, max height 50
                align: 'center'
            });
            doc.moveDown(0.5);
        }
        // --- DISEÑO TÉRMICO (80mm) ---
        doc.font('Helvetica-Bold').fontSize(12).text(config.company_name || 'Business Control', { align: 'center' });
        doc.font('Helvetica').fontSize(8);
        if (config.company_address) doc.text(config.company_address, { align: 'center' });
        if (config.company_phone) doc.text(`Tel: ${config.company_phone}`, { align: 'center' });
        
        doc.moveDown(0.5);
        doc.text('------------------------------------------', { align: 'center' });
        doc.text(`Folio: #${sale.id}`);
        doc.text(`Fecha: ${new Date(sale.sale_date).toLocaleString()}`);
        doc.text(`Cliente: ${sale.client_name || 'General'}`);
        doc.text('------------------------------------------', { align: 'center' });
        doc.moveDown(0.5);

        details.forEach(item => {
            const name = item.product_name || 'Producto Eliminado';
            doc.text(`${item.quantity} x ${name}`);
            doc.text(`$${parseFloat(item.subtotal).toFixed(2)}`, { align: 'right' });
            doc.moveDown(0.2);
        });

        doc.text('------------------------------------------', { align: 'center' });
        doc.font('Helvetica-Bold').fontSize(12).text(`TOTAL: $${parseFloat(sale.total_price).toFixed(2)}`, { align: 'right' });
        doc.font('Helvetica').fontSize(8).moveDown().text('¡Gracias por su compra!', { align: 'center' });

    } else {
        // --- DISEÑO ESTÁNDAR (A4) ---
        if (config.company_logo) {
            const logoPath = path.join(__dirname, 'public', config.company_logo);
            if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 45, { width: 50 });
        }

        doc.fontSize(20).text(config.company_name || 'Business Control', { align: 'center' });
        if (config.company_address) doc.fontSize(10).text(config.company_address, { align: 'center' });
        if (config.company_phone) doc.text(`Tel: ${config.company_phone}`, { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text('Ticket de Venta', { align: 'center' });
        doc.moveDown();
        doc.text(`Folio: #${sale.id} - Fecha: ${new Date(sale.sale_date).toLocaleString()}`);
        doc.text(`Cliente: ${sale.client_name || 'Cliente General'}`);
        if (sale.notes) {
            doc.moveDown(0.5);
            doc.text(`Notas: ${sale.notes}`, { oblique: true });
        }
        doc.moveDown();

        doc.font('Courier').fontSize(10);
        doc.text('Cant.  Descripción                    Precio    Total');
        doc.text('-------------------------------------------------------');
        
        details.forEach(item => {
            const name = (item.product_name || 'Producto Eliminado').substring(0, 25).padEnd(25);
            const qty = item.quantity.toString().padEnd(5);
            const priceVal = parseFloat(item.price) || (parseFloat(item.subtotal) / parseFloat(item.quantity));
            const price = priceVal.toFixed(2).padEnd(8);
            const total = parseFloat(item.subtotal).toFixed(2);
            doc.text(`${qty}  ${name}  $${price}  $${total}`);
        });
        
        doc.text('-------------------------------------------------------');
        doc.moveDown();
        doc.font('Helvetica-Bold').fontSize(14).text(`TOTAL: $${parseFloat(sale.total_price).toFixed(2)}`, { align: 'right' });
        doc.fontSize(10).moveDown().text('¡Gracias por su compra!', { align: 'center' });
    }

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al generar ticket');
  }
});

// ==================================================================
// RUTA DE ESTADÍSTICAS PARA REPORTES (GRÁFICOS Y TARJETAS)
// ==================================================================

// Endpoint optimizado para las tarjetas del Dashboard
app.get('/api/dashboard-stats', authenticateToken, async (req, res) => {
    try {
        // 1. Ingresos y Ventas Totales
        const [salesStats] = await db.query(
            `SELECT 
                COALESCE(SUM(total_price), 0) as totalRevenue, 
                COUNT(id) as totalSales 
             FROM sales`
        );

        // 2. Clientes Totales
        const [clientStats] = await db.query(
            `SELECT COUNT(id) as totalClients FROM clients`
        );

        // 3. Productos Totales y Stock Bajo
        const [productStats] = await db.query(
            `SELECT 
                COUNT(id) as totalProducts,
                SUM(CASE WHEN stock < 10 THEN 1 ELSE 0 END) as lowStockCount
             FROM inventory`
        );

        // 4. Tendencia de ventas (Últimos 7 días para el gráfico)
        const [salesTrend] = await db.query(`
            SELECT DATE(sale_date) as date, SUM(total_price) as total
            FROM sales
            WHERE sale_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY DATE(sale_date)
            ORDER BY date ASC
        `);

        // 5. Top 5 Productos más vendidos
        const [topProducts] = await db.query(`
            SELECT i.product_name, SUM(sd.quantity) as totalSold
            FROM sale_details sd
            JOIN inventory i ON sd.product_id = i.id
            GROUP BY sd.product_id
            ORDER BY totalSold DESC
            LIMIT 5
        `);

        // 6. Actividad Reciente (últimas 5 acciones)
        const [recentActivity] = await db.query(`
            (
                SELECT 'sale' as type, s.id, c.name as text, s.total_price as value, s.created_at as date
                FROM sales s
                JOIN clients c ON s.client_id = c.id
            )
            UNION ALL
            (
                SELECT 'client' as type, c.id, c.name as text, NULL as value, c.created_at as date
                FROM clients c
            )
            ORDER BY date DESC
            LIMIT 5
        `);

        res.status(200).json({
            totalRevenue: salesStats[0].totalRevenue,
            totalSales: salesStats[0].totalSales,
            totalClients: clientStats[0].totalClients,
            totalProducts: productStats[0].totalProducts,
            lowStockCount: productStats[0].lowStockCount || 0,
            salesTrend,
            topProducts,
            recentActivity
        });

    } catch (error) {
        console.error('Error cargando estadísticas del dashboard:', error);
        res.status(500).json({ message: 'Error del servidor al obtener estadísticas del dashboard.' });
    }
});

app.get('/api/statistics', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Se requieren fechas de inicio y fin.' });
    }

    // Ajustar la fecha final para que incluya todo el día
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);

    let connection;
    try {
        connection = await db.getConnection();

        // 1. Estadísticas principales (cards)
        const [salesStats] = await connection.query(
            `SELECT 
                COALESCE(SUM(total_price), 0) as totalRevenue, 
                COUNT(id) as totalSales 
             FROM sales 
             WHERE sale_date BETWEEN ? AND ?`,
            [startDate, endOfDay]
        );

        const [clientStats] = await connection.query(
            `SELECT COUNT(id) as newClients FROM clients WHERE created_at BETWEEN ? AND ?`,
            [startDate, endOfDay]
        );

        const [inventoryStats] = await connection.query(
            `SELECT COALESCE(SUM(stock), 0) as totalProducts FROM inventory`
        );

        // 2. Tendencia de ventas (para gráfico de líneas)
        const [salesTrend] = await connection.query(
            `SELECT 
                DATE(sale_date) as date, 
                SUM(total_price) as total 
             FROM sales 
             WHERE sale_date BETWEEN ? AND ?
             GROUP BY DATE(sale_date) 
             ORDER BY date ASC`,
            [startDate, endOfDay]
        );

        // 3. Distribución por categoría (para gráfico de dona)
        const [categoryDistribution] = await connection.query(
            `SELECT 
                COALESCE(i.category, 'Sin Categoría') as category, 
                SUM(sd.subtotal) as total 
             FROM sale_details sd
             JOIN inventory i ON sd.product_id = i.id
             JOIN sales s ON sd.sale_id = s.id
             WHERE s.sale_date BETWEEN ? AND ?
             GROUP BY i.category
             ORDER BY total DESC`,
            [startDate, endOfDay]
        );

        // 4. Top 5 Clientes (para gráfico de barras)
        const [topClients] = await connection.query(
            `SELECT 
                c.name, 
                SUM(s.total_price) as total 
             FROM sales s
             JOIN clients c ON s.client_id = c.id
             WHERE s.sale_date BETWEEN ? AND ?
             GROUP BY c.id
             ORDER BY total DESC
             LIMIT 5`,
            [startDate, endOfDay]
        );

        // 5. Ventas por hora (Horas Pico)
        const [salesByHour] = await connection.query(
            `SELECT HOUR(sale_date) as hour, COUNT(id) as count 
             FROM sales 
             WHERE sale_date BETWEEN ? AND ?
             GROUP BY HOUR(sale_date)
             ORDER BY hour ASC`,
            [startDate, endOfDay]
        );

        res.status(200).json({
            totalRevenue: salesStats[0].totalRevenue,
            totalSales: salesStats[0].totalSales,
            newClients: clientStats[0].newClients,
            totalProducts: inventoryStats[0].totalProducts,
            salesTrend,
            categoryDistribution,
            topClients,
            salesByHour
        });

    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({ message: 'Error del servidor al obtener estadísticas.' });
    } finally {
        if (connection) connection.release();
    }
});

// ==================================================================
// RUTA PARA RESUMEN DIARIO (CIERRE DE CAJA)
// ==================================================================
app.get('/api/daily-summary', authenticateToken, async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ message: 'Se requiere una fecha.' });
    }

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    try {
        const [sales] = await db.query(
            `SELECT 
                COALESCE(SUM(total_price), 0) as totalRevenue, 
                COUNT(id) as totalSales 
             FROM sales 
             WHERE sale_date BETWEEN ? AND ?`,
            [startDate, endDate]
        );

        res.status(200).json({
            date: date,
            totalRevenue: sales[0].totalRevenue,
            totalSales: sales[0].totalSales
        });

    } catch (error) {
        console.error('Error al obtener el resumen diario:', error);
        res.status(500).json({ message: 'Error del servidor al obtener el resumen.' });
    }
});

// Ruta para generar el reporte en PDF
app.get('/report', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  const { startDate, endDate, type } = req.query;
  const doc = new PDFDocument({ margin: 50 });

  try {
    if (type !== 'low-stock' && (!startDate || !endDate)) {
      return res.status(400).send('Fechas de inicio y fin son requeridas para este reporte.');
    }

    const query = `
      SELECT s.id, c.name AS client_name, s.total_price, s.sale_date
      FROM sales s
      LEFT JOIN clients c ON s.client_id = c.id
      WHERE s.sale_date BETWEEN ? AND ?
      ORDER BY s.sale_date ASC
    `;
    
    let filename = 'reporte.pdf';
    if (type === 'sales') {
        filename = `reporte-ventas-${startDate}-a-${endDate}.pdf`;
    } else if (type === 'low-stock') {
        filename = `reporte-stock-bajo-${new Date().toISOString().split('T')[0]}.pdf`;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    // Obtener configuración para el encabezado del reporte
    const [settings] = await db.query('SELECT * FROM settings WHERE id = 1');
    const config = settings[0] || { company_name: 'Business Control' };

    doc.pipe(res);

    // Contenido del PDF
    doc.fontSize(20).text(config.company_name, { align: 'center' });
    doc.moveDown();

    if (type === 'sales') {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        const [sales] = await db.query(query, [startDate, endOfDay]);

        doc.fontSize(16).text('Reporte de Ventas', { align: 'center' });
        doc.fontSize(10).text(`Período: ${startDate} a ${endDate}`, { align: 'center' });
        doc.moveDown();

        if (sales.length === 0) {
            doc.text('No hay ventas registradas en este período.');
        } else {
            let totalRevenue = 0;
            sales.forEach(sale => {
                const saleDate = new Date(sale.sale_date).toLocaleDateString('es-ES');
                doc.fontSize(10).text(`Folio #${sale.id} - ${saleDate} - ${sale.client_name || 'General'}`, { continued: true });
                doc.text(`$${parseFloat(sale.total_price).toFixed(2)}`, { align: 'right' });
                totalRevenue += parseFloat(sale.total_price);
            });
            doc.moveDown();
            doc.font('Helvetica-Bold').fontSize(12).text(`Total Ingresos: $${totalRevenue.toFixed(2)}`, { align: 'right' });
        }
    } else if (type === 'low-stock') {
        const [products] = await db.query('SELECT * FROM inventory WHERE stock < 10 ORDER BY stock ASC');
        
        doc.fontSize(16).text('Reporte de Stock Bajo', { align: 'center' });
        doc.fontSize(10).text(`Generado el: ${new Date().toLocaleDateString()}`, { align: 'center' });
        doc.moveDown();

        if (products.length === 0) {
            doc.text('¡Excelente! No hay productos con stock bajo (menos de 10 unidades).');
        } else {
            doc.font('Helvetica-Bold');
            doc.text('Producto', 50, doc.y, { width: 300 });
            doc.text('Stock Actual', 350, doc.y, { width: 100, align: 'right' });
            doc.moveDown();
            doc.font('Helvetica');
            
            products.forEach(p => {
                doc.text(p.product_name, 50, doc.y, { width: 300 });
                doc.text(p.stock.toString(), 350, doc.y, { width: 100, align: 'right' });
                doc.moveDown(0.5);
            });
        }
    }

    doc.end();
  } catch (error) {
    console.error('Error al generar el reporte:', error);
    // Si ocurre un error, no podemos enviar un JSON porque las cabeceras pueden estar ya enviadas.
    // Lo mejor es terminar el stream y registrar el error.
    res.status(500).end('Error al generar el reporte en PDF.');
  }
});

// ==================================================================
// GESTIÓN DE USUARIOS (SOLO ADMIN)
// ==================================================================

// Obtener configuración
app.get('/settings', authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM settings WHERE id = 1');
    res.json(rows[0] || {});
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener configuración' });
  }
});

// Guardar configuración
app.put('/settings', authenticateToken, authorizeRole(['admin']), upload.single('company_logo'), async (req, res) => {
  const { company_name, company_address, company_phone, company_email, ticket_format } = req.body;
  
  let query = 'UPDATE settings SET company_name = ?, company_address = ?, company_phone = ?, company_email = ?, ticket_format = ?';
  const params = [company_name, company_address, company_phone, company_email, ticket_format || 'A4'];

  if (req.file) {
    // Multer guarda el archivo y req.file contiene su información.
    // Guardamos la ruta relativa para usarla en el frontend.
    const logoPath = `images/uploads/${req.file.filename}`;
    query += ', company_logo = ?';
    params.push(logoPath);
  }

  query += ' WHERE id = 1';

  try {
    await db.query(query, params);
    res.json({ message: 'Configuración actualizada correctamente' });
  } catch (error) {
    console.error('Error al guardar configuración:', error);
    res.status(500).json({ message: 'Error al guardar configuración' });
  }
});

// Obtener todos los usuarios
app.get('/users', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener usuarios' });
  }
});

// Crear nuevo usuario (con rol específico)
app.post('/users', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password || !role) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'El usuario o correo ya existe' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, role]
    );

    res.status(201).json({ message: 'Usuario creado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear usuario' });
  }
});

// Eliminar usuario
app.delete('/users/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  const { id } = req.params;
  
  // Evitar que el admin se borre a sí mismo (comparando con el token)
  if (req.user.id == id) {
      return res.status(400).json({ message: 'No puedes eliminar tu propia cuenta' });
  }

  try {
    await db.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar usuario' });
  }
});

// Generar Backup de la Base de Datos
app.get('/api/backup', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        const [tables] = await db.query('SHOW TABLES');
        let dump = `-- Backup Business Control \n-- Fecha: ${new Date().toLocaleString()}\n\n`;
        dump += `SET FOREIGN_KEY_CHECKS=0;\n\n`;

        for (const row of tables) {
            const tableName = Object.values(row)[0];
            
            // 1. Estructura
            const [create] = await db.query(`SHOW CREATE TABLE \`${tableName}\``);
            dump += `-- Estructura de tabla \`${tableName}\`\n`;
            dump += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
            dump += `${create[0]['Create Table']};\n\n`;

            // 2. Datos
            const [data] = await db.query(`SELECT * FROM \`${tableName}\``);
            if (data.length > 0) {
                dump += `-- Datos de tabla \`${tableName}\`\n`;
                dump += `INSERT INTO \`${tableName}\` VALUES `;
                const values = data.map(row => {
                    const rowValues = Object.values(row).map(val => {
                        if (val === null) return 'NULL';
                        if (typeof val === 'number') return val;
                        if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
                        return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
                    });
                    return `(${rowValues.join(', ')})`;
                }).join(',\n');
                dump += `${values};\n\n`;
            }
        }
        dump += `SET FOREIGN_KEY_CHECKS=1;\n`;

        res.header('Content-Type', 'application/sql');
        res.attachment(`backup-${new Date().toISOString().split('T')[0]}.sql`);
        res.send(dump);
    } catch (error) {
        console.error('Error al generar backup:', error);
        res.status(500).send('Error al generar la copia de seguridad');
    }
});

// Cambiar contraseña del usuario actual
app.put('/profile/change-password', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword } = req.body;

  try {
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Faltan datos para el cambio de contraseña.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    const [userData] = await db.query('SELECT password FROM users WHERE id = ? LIMIT 1', [userId]);
    
    if (userData.length === 0) return res.status(404).json({ message: 'Usuario no encontrado.' });

    const isMatch = await bcrypt.compare(currentPassword, userData[0].password);
    if (!isMatch) {
      return res.status(401).json({ message: 'La contraseña actual no es correcta.' });
    }

    const encryptedPassword = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [encryptedPassword, userId]);

    res.json({ message: 'Contraseña actualizada con éxito.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error del servidor al cambiar contraseña.' });
  }
});

// Middleware para verificar roles
function authorizeRole(allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user ? req.user.role : null;
    if (allowedRoles.includes(userRole)) {
      next();
    } else {
      res.status(403).json({ message: 'No tienes permisos suficientes para esta operación.' });
    }
  };
}

// Middleware para verificar JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Autenticación requerida.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Sesión no válida o expirada.' });
    req.user = user;
    next();
  });
}

// Puerto del servidor Express
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado en el puerto ${PORT}`);
});
// --- FIN DEL ARCHIVO (Borra todo lo que esté debajo de esta línea) ---
