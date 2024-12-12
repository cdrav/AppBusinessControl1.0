require('dotenv').config();  
const express = require('express');
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');

// Crear la aplicación Express
const app = express();
app.use(express.json()); 
app.use(cors());

// Configurar la conexión a MySQL
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,  
});

// Conectar a la base de datos
db.connect((err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.code, err.sqlMessage);
    return;
  }
  console.log('Conexión exitosa a la base de datos');
});

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

// Rutas para la gestión de clientes
app.get('/clients', authenticateToken, (req, res) => {
  const query = 'SELECT * FROM clients'; 
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error al obtener los clientes:', err);
      return res.status(500).json({ message: 'Error del servidor' });
    }
    res.status(200).json(results);
  });
});

// Ruta para agregar un nuevo cliente
app.post('/clients', authenticateToken, (req, res) => {
  const { name, email, phone, address } = req.body;

  // Validación básica
  if (!name || !email || !phone) {
    return res.status(400).json({ message: 'Nombre, email y teléfono son obligatorios' });
  }

  const query = 'INSERT INTO clients (name, email, phone, address) VALUES (?, ?, ?, ?)';
  db.query(query, [name, email, phone, address], (err, result) => {
    if (err) {
      console.error('Error al agregar cliente:', err);
      return res.status(500).json({ message: 'Error del servidor' });
    }
    res.status(201).json({ message: 'Cliente agregado con éxito', clienteId: result.insertId });
  });
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
  
// Ruta para agregar una venta
app.post('/sales', authenticateToken, (req, res) => {
    const { clientId, products, saleDate } = req.body;  // Cambié 'productId' y 'quantity' por un arreglo de productos

    // Validación básica
    if (!clientId || !products || products.length === 0 || !saleDate) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }

    // Verificar si los productos tienen suficiente stock
    let totalSalePrice = 0; // Para calcular el total de la venta
    let saleDetails = []; // Para almacenar los detalles de la venta

    // Verificar el stock y calcular el subtotal
    products.forEach(product => {
        const { productId, quantity } = product;
        
        const checkStockQuery = 'SELECT stock, price FROM inventory WHERE id = ?';
        db.query(checkStockQuery, [productId], (err, results) => {
            if (err) {
                console.error('Error al verificar stock del producto:', err);
                return res.status(500).json({ message: 'Error del servidor' });
            }

            if (results.length === 0) {
                return res.status(404).json({ message: 'Producto no encontrado' });
            }

            const productStock = results[0].stock;
            const productPrice = results[0].price;

            if (productStock < quantity) {
                return res.status(400).json({ message: 'No hay suficiente stock del producto' });
            }

            // Calcular el subtotal para este producto
            const subtotal = productPrice * quantity;
            totalSalePrice += subtotal;

            // Agregar los detalles de la venta
            saleDetails.push({ saleId: null, productId, quantity, subtotal }); // saleId se asignará después de insertar la venta

            // Si todos los productos fueron procesados, continuar con la inserción de la venta
            if (saleDetails.length === products.length) {
                // Registrar la venta en la tabla sales
                const insertSaleQuery = 'INSERT INTO sales (client_id, total_price, sale_date) VALUES (?, ?, ?)';
                db.query(insertSaleQuery, [clientId, totalSalePrice, saleDate], (err, result) => {
                    if (err) {
                        console.error('Error al registrar venta:', err);
                        return res.status(500).json({ message: 'Error del servidor' });
                    }

                    const saleId = result.insertId;

                    // Insertar los detalles de la venta en la tabla sale_details
                    saleDetails.forEach(detail => {
                        const insertSaleDetailQuery = 'INSERT INTO sale_details (sale_id, product_id, quantity, subtotal) VALUES (?, ?, ?, ?)';
                        db.query(insertSaleDetailQuery, [saleId, detail.productId, detail.quantity, detail.subtotal], (err) => {
                            if (err) {
                                console.error('Error al insertar detalle de la venta:', err);
                                return res.status(500).json({ message: 'Error del servidor' });
                            }

                            // Actualizar el stock del producto
                            const updateStockQuery = 'UPDATE inventory SET stock = stock - ? WHERE id = ?';
                            db.query(updateStockQuery, [detail.quantity, detail.productId], (err) => {
                                if (err) {
                                    console.error('Error al actualizar stock del producto:', err);
                                    return res.status(500).json({ message: 'Error del servidor' });
                                }
                            });
                        });
                    });

                    res.status(201).json({ message: 'Venta registrada con éxito', saleId });
                });
            }
        });
    });
});

// Ruta para obtener clientes
app.get('/clients', async (req, res) => {
  try {
    const [clients] = await db.query('SELECT id, name FROM Clientes');
    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

// Ruta para obtener productos
app.get('/products', async (req, res) => {
  try {
    const [products] = await db.query('SELECT id, name, price FROM Productos');
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});
// Ruta para registrar una venta
app.post('/sales', authenticateToken, (req, res) => {
  const { client_id, product_id, quantity } = req.body;

  if (!client_id || !product_id || !quantity) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  // Obtenemos el precio del producto
  const query = 'SELECT price FROM products WHERE id = ?';
  db.query(query, [product_id], (err, results) => {
    if (err) {
      console.error('Error al obtener el precio del producto:', err);
      return res.status(500).json({ message: 'Error del servidor' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const price = results[0].price;
    const total = price * quantity;

    // Insertar venta
    const insertSaleQuery = 'INSERT INTO sales (client_id, product_id, quantity, total, sale_date) VALUES (?, ?, ?, ?, NOW())';
    db.query(insertSaleQuery, [client_id, product_id, quantity, total], (err, result) => {
      if (err) {
        console.error('Error al registrar la venta:', err);
        return res.status(500).json({ message: 'Error del servidor' });
      }

      res.status(201).json({ message: 'Venta registrada con éxito', saleId: result.insertId });
    });
  });
});

// Ruta para obtener todas las ventas
app.get('/sales', authenticateToken, (req, res) => {
  const query = `
    SELECT s.id, c.name AS client_name, p.name AS product_name, s.quantity, s.total, s.sale_date
    FROM sales s
    JOIN clients c ON s.client_id = c.id
    JOIN products p ON s.product_id = p.id
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
    const query = 'SELECT * FROM sales';  // Ajusta la consulta a lo que necesites
    db.query(query, (err, results) => {
      if (err) {
        console.error('Error al obtener los datos del reporte:', err);
        return res.status(500).json({ message: 'Error al generar el reporte' });
      }
      
      // Agregar cada venta al PDF
      results.forEach(sale => {
        doc.fontSize(12).text(`ID de Venta: ${sale.id}`);
        doc.text(`Cliente: ${sale.client_id}`);
        doc.text(`Fecha de Venta: ${sale.sale_date}`);
        doc.text(`Total: Q${sale.total_price.toFixed(2)}`);
        doc.moveDown();
      });
      
      // Finalizar el documento PDF
      doc.end();
    });
  });
  
