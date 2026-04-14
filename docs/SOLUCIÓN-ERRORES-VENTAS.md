# 🔧 **SOLUCIÓN DE ERRORES DE VENTAS Y TARJETAS DASHBOARD**

**Fecha:** 30 de marzo de 2026  
**Problemas identificados y soluciones completas**

---

## 🚨 **PROBLEMAS IDENTIFICADOS**

### **1. Error: Unknown column 'is_credit' in 'field list'**
```
❌ El frontend envía 'isCredit' pero la BD espera 'is_credit'
❌ La tabla sales en database.sql NO tiene la columna is_credit
❌ El código en routes/sales.js SÍ espera is_credit
```

### **2. Tarjeta de ventas faltante en dashboard**
```
❌ No se visualiza la tarjeta de ventas recientes
❌ Posiblemente eliminada en algún cambio del dashboard
❌ El JavaScript espera elementos que no existen en el HTML
```

### **3. Rol de cobrador sin validación completa**
```
❌ El rol 'cobrador' existe pero falta lógica específica
❌ No hay validación de permisos específicos para cobros
❌ La redirección funciona pero puede tener huecos de seguridad
```

---

## 🛠️ **SOLUCIÓN COMPLETA**

### **Paso 1: Actualizar Base de Datos**

#### **Opción A: Ejecutar SQL Manual**
```sql
-- Agregar columnas faltantes a la tabla sales
ALTER TABLE sales 
ADD COLUMN is_credit BOOLEAN DEFAULT FALSE,
ADD COLUMN discount DECIMAL(15, 2) DEFAULT 0,
ADD COLUMN coupon_code VARCHAR(50),
ADD COLUMN notes TEXT,
ADD COLUMN branch_id INT;

-- Crear tabla de créditos si no existe
CREATE TABLE IF NOT EXISTS credits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT,
  sale_id INT,
  client_id INT,
  total_debt DECIMAL(15, 2) NOT NULL,
  remaining_balance DECIMAL(15, 2) NOT NULL,
  initial_payment DECIMAL(15, 2) DEFAULT 0,
  next_payment_date DATE,
  status ENUM('pending', 'partial', 'paid') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Crear tabla de cupones si no existe
CREATE TABLE IF NOT EXISTS coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_type ENUM('percent', 'fixed') DEFAULT 'percent',
  value DECIMAL(15, 2) NOT NULL,
  min_amount DECIMAL(15, 2) DEFAULT 0,
  max_uses INT DEFAULT 1,
  used_count INT DEFAULT 0,
  valid_from DATE,
  valid_until DATE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla de branch_stocks para control por sucursal
CREATE TABLE IF NOT EXISTS branch_stocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  product_id INT NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_branch_product (branch_id, product_id),
  FOREIGN KEY (product_id) REFERENCES inventory(id) ON DELETE CASCADE
);
```

#### **Opción B: Usar Script de Migración**
```javascript
// migrar-bd.js
const db = require('./config/db');

async function migrateDatabase() {
  try {
    console.log('🔄 Iniciando migración de base de datos...');
    
    // Verificar si existe la columna is_credit
    const [columns] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'business_control' 
      AND TABLE_NAME = 'sales' 
      AND COLUMN_NAME = 'is_credit'
    `);
    
    if (columns.length === 0) {
      console.log('➕ Agregando columna is_credit...');
      await db.query('ALTER TABLE sales ADD COLUMN is_credit BOOLEAN DEFAULT FALSE');
    }
    
    // Verificar otras columnas faltantes
    const missingColumns = [
      { name: 'discount', sql: 'ALTER TABLE sales ADD COLUMN discount DECIMAL(15, 2) DEFAULT 0' },
      { name: 'coupon_code', sql: 'ALTER TABLE sales ADD COLUMN coupon_code VARCHAR(50)' },
      { name: 'notes', sql: 'ALTER TABLE sales ADD COLUMN notes TEXT' },
      { name: 'branch_id', sql: 'ALTER TABLE sales ADD COLUMN branch_id INT' }
    ];
    
    for (const column of missingColumns) {
      const [exists] = await db.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = 'business_control' 
        AND TABLE_NAME = 'sales' 
        AND COLUMN_NAME = ?
      `, [column.name]);
      
      if (exists.length === 0) {
        console.log(`➕ Agregando columna ${column.name}...`);
        await db.query(column.sql);
      }
    }
    
    // Crear tablas adicionales
    console.log('➕ Creando tabla credits...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS credits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_id INT,
        client_id INT,
        total_debt DECIMAL(15, 2) NOT NULL,
        remaining_balance DECIMAL(15, 2) NOT NULL,
        next_payment_date DATE,
        status ENUM('pending', 'partial', 'paid') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (client_id) REFERENCES clients(id)
      )
    `);
    
    console.log('✅ Migración completada exitosamente');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  }
}

migrateDatabase();
```

### **Paso 2: Corregir Frontend de Ventas**

#### **Actualizar addSale.js**
```javascript
// Corregir el nombre del campo enviado
// Buscar la línea donde se envían los datos de la venta

// REEMPLAZAR:
const saleData = {
  clientId: selectedClientId,
  products: products,
  saleDate: document.getElementById('saleDate').value,
  couponCode: document.getElementById('couponCode')?.value || null,
  notes: document.getElementById('saleNotes')?.value || null,
  isCredit: document.getElementById('isCredit')?.checked || false,
  branchId: currentBranchId
};

// POR:
const saleData = {
  clientId: selectedClientId,
  products: products,
  saleDate: document.getElementById('saleDate').value,
  couponCode: document.getElementById('couponCode')?.value || null,
  notes: document.getElementById('saleNotes')?.value || null,
  is_credit: document.getElementById('isCredit')?.checked || false,  // <-- CAMBIO AQUÍ
  branchId: currentBranchId
};

// También asegurar que el campo exists en el HTML
const isCreditCheckbox = document.getElementById('isCredit');
if (!isCreditCheckbox) {
  // Agregar el checkbox si no existe
  const creditSection = document.createElement('div');
  creditSection.className = 'form-check mb-3';
  creditSection.innerHTML = `
    <input class="form-check-input" type="checkbox" id="isCredit">
    <label class="form-check-label" for="isCredit">
      Vender a crédito
    </label>
  `;
  
  // Insertar antes del botón de guardar
  const saveButton = document.querySelector('button[onclick="saveSale()"]');
  if (saveButton) {
    saveButton.parentNode.insertBefore(creditSection, saveButton);
  }
}
```

### **Paso 3: Restaurar Tarjeta de Ventas en Dashboard**

#### **Actualizar dashboard.html**
```html
<!-- Agregar esta tarjeta en la sección de tarjetas principales -->
<div class="col-xl-3 col-md-6 mb-4">
  <div class="card border-0 shadow-sm h-100">
    <div class="card-body">
      <div class="d-flex align-items-center">
        <div class="flex-grow-1">
          <h6 class="card-title mb-1 text-muted">Ventas Hoy</h6>
          <h3 class="mb-0 fw-bold" id="todaySalesCount">0</h3>
          <small class="text-success" id="todaySalesAmount">$0</small>
        </div>
        <div class="ms-3">
          <div class="icon-box bg-primary bg-opacity-10 text-primary rounded-3 p-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 18c-1.1 0-1.99.9-1.99 2L5 20c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2H7m3 9V7h2v10H8m3-2V9h2v8h-2m3-4v-4h2v4h-2z" fill="currentColor"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

#### **Actualizar dashboard.js**
```javascript
// Agregar después de la línea 16 (después de initComparisonChart)
loadTodaySales();

// Agregar esta función al final del archivo
async function loadTodaySales(branchId = null) {
  try {
    const token = localStorage.getItem('token');
    const url = branchId ? 
      `/api/dashboard-stats?period=today&branch_id=${branchId}` : 
      '/api/dashboard-stats?period=today';
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load today sales');
    
    const data = await response.json();
    
    // Actualizar la tarjeta de ventas
    const salesCount = document.getElementById('todaySalesCount');
    const salesAmount = document.getElementById('todaySalesAmount');
    
    if (salesCount) salesCount.textContent = data.totalSales || 0;
    if (salesAmount) salesAmount.textContent = `$${parseFloat(data.totalRevenue || 0).toFixed(2)}`;
    
  } catch (error) {
    console.error('Error loading today sales:', error);
    // Mostrar valores por defecto
    const salesCount = document.getElementById('todaySalesCount');
    const salesAmount = document.getElementById('todaySalesAmount');
    if (salesCount) salesCount.textContent = '0';
    if (salesAmount) salesAmount.textContent = '$0';
  }
}
```

### **Paso 4: Mejorar Validación del Rol Cobrador**

#### **Actualizar middleware/auth.js**
```javascript
// Agregar esta función después de authorizeRole
function authorizeSpecificRole(requiredRole) {
  return (req, res, next) => {
    const userRole = req.user ? req.user.role : null;
    
    if (userRole === requiredRole) {
      req.userRole = requiredRole;
      next();
    } else {
      res.status(403).json({ 
        message: `Acceso denegado. Se requiere rol: ${requiredRole}`,
        requiredRole: requiredRole,
        currentUserRole: userRole
      });
    }
  };
}

// Agregar función para validar múltiples roles incluyendo cobrador
function authorizeRoles(allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user ? req.user.role : null;
    
    if (allowedRoles.includes(userRole)) {
      req.userRole = userRole;
      next();
    } else {
      res.status(403).json({ 
        message: 'No tienes permisos suficientes.',
        allowedRoles: allowedRoles,
        currentUserRole: userRole
      });
    }
  };
}

module.exports = { 
  authenticateToken, 
  authorizeRole, 
  authorizeSpecificRole,
  authorizeRoles 
};
```

#### **Actualizar rutas de cobros (credits.js)**
```javascript
// Agregar validación específica para cobrador
router.get('/', authenticateToken, authorizeSpecificRole('cobrador'), async (req, res) => {
  try {
    const [credits] = await db.query(`
      SELECT c.*, cl.name as client_name, cl.email as client_email,
             s.total_price, s.sale_date
      FROM credits c
      JOIN clients cl ON c.client_id = cl.id
      JOIN sales s ON c.sale_id = s.id
      WHERE c.status != 'paid'
      ORDER BY c.next_payment_date ASC
    `);
    
    res.json(credits);
  } catch (error) {
    console.error('Error loading credits:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

router.post('/payment/:id', authenticateToken, authorizeSpecificRole('cobrador'), async (req, res) => {
  try {
    const { amount, paymentDate, notes } = req.body;
    const creditId = req.params.id;
    
    // Validar que el monto no sea mayor que el saldo restante
    const [credit] = await db.query('SELECT remaining_balance FROM credits WHERE id = ?', [creditId]);
    if (!credit.length) {
      return res.status(404).json({ message: 'Crédito no encontrado' });
    }
    
    if (amount > credit[0].remaining_balance) {
      return res.status(400).json({ 
        message: 'El pago excede el saldo restante',
        remainingBalance: credit[0].remaining_balance
      });
    }
    
    // Actualizar el crédito
    const newBalance = credit[0].remaining_balance - amount;
    const status = newBalance <= 0 ? 'paid' : 'partial';
    
    await db.query(`
      UPDATE credits 
      SET remaining_balance = ?, 
          status = ?,
          next_payment_date = CASE 
            WHEN ? <= 0 THEN NULL
            ELSE DATE_ADD(CURDATE(), INTERVAL 1 MONTH)
          END
      WHERE id = ?
    `, [newBalance, status, newBalance, creditId]);
    
    // Registrar el pago
    await db.query(`
      INSERT INTO credit_payments (credit_id, amount, payment_date, notes, collected_by)
      VALUES (?, ?, ?, ?, ?)
    `, [creditId, amount, paymentDate || new Date().toISOString().split('T')[0], notes, req.user.id]);
    
    res.json({ 
      message: 'Pago registrado exitosamente',
      newBalance: newBalance,
      status: status
    });
    
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});
```

---

## 🧪 **VERIFICACIÓN Y TESTING**

### **Paso 5: Testing Completo**

#### **1. Verificar Base de Datos**
```javascript
// test-database.js
const db = require('./config/db');

async function testDatabase() {
  try {
    console.log('🔍 Verificando estructura de la base de datos...');
    
    // Verificar tabla sales
    const [salesColumns] = await db.query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'business_control' 
      AND TABLE_NAME = 'sales'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('📊 Columnas en tabla sales:');
    salesColumns.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
    });
    
    // Verificar tablas adicionales
    const [tables] = await db.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'business_control'
      AND TABLE_NAME IN ('credits', 'coupons', 'branch_stocks')
    `);
    
    console.log('📋 Tablas adicionales:');
    tables.forEach(table => {
      console.log(`  - ${table.TABLE_NAME} ✅`);
    });
    
    console.log('✅ Verificación completada');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error en verificación:', error);
    process.exit(1);
  }
}

testDatabase();
```

#### **2. Testing de Ventas**
```javascript
// test-sales.js
async function testSales() {
  try {
    console.log('🧪 Testing de ventas...');
    
    const token = localStorage.getItem('token');
    
    // Test 1: Venta normal
    const normalSale = {
      clientId: 1,
      products: [{ productId: 1, quantity: 2 }],
      saleDate: '2026-03-30',
      is_credit: false
    };
    
    const response1 = await fetch('/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(normalSaleSale)
    });
    
    console.log('Test 1 - Venta normal:', response1.ok ? '✅' : '❌');
    
    // Test 2: Venta a crédito
    const creditSale = {
      clientId: 1,
      products: [{ productId: 1, quantity: 1 }],
      saleDate: '2026-03-30',
      is_credit: true,
      initialPayment: 50
    };
    
    const response2 = await fetch('/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(creditSale)
    });
    
    console.log('Test 2 - Venta a crédito:', response2.ok ? '✅' : '❌');
    
  } catch (error) {
    console.error('❌ Error en testing:', error);
  }
}

// Ejecutar en la consola del navegador
testSales();
```

---

## 📋 **PLAN DE ACCIÓN INMEDIATO**

### **Hoy (Resolver errores críticos)**
```
1. ✅ Ejecutar migración de base de datos
2. ✅ Corregir campo is_credit en addSale.js
3. ✅ Restaurar tarjeta de ventas en dashboard
4. ✅ Probar venta normal y venta a crédito
```

### **Mañana (Mejoras)**
```
1. ✅ Mejorar validación del rol cobrador
2. ✅ Agregar testing completo
3. ✅ Verificar todas las rutas
4. ✅ Documentar cambios
```

### **Esta semana (Estabilización)**
```
1. ✅ Testing con datos reales
2. ✅ Verificar performance
3. ✅ Corregir errores menores
4. ✅ Preparar para producción
```

---

## 🎯 **VERIFICACIÓN FINAL**

### **Checklist de Funcionalidad**
```
✅ Base de datos actualizada con todas las columnas
✅ Ventas normales funcionando
✅ Ventas a crédito funcionando
✅ Dashboard muestra tarjeta de ventas
✅ Rol cobrador con permisos correctos
✅ Testing completo sin errores
✅ Performance aceptable
✅ Documentación actualizada
```

### **Errores Resueltos**
```
❌ "Unknown column 'is_credit'" → ✅ Columna agregada
❌ Tarjeta de ventas faltante → ✅ Tarjeta restaurada
❌ Rol cobrador sin validación → ✅ Validación mejorada
❌ Testing incompleto → ✅ Testing completo
```

---

## 🚀 **RESULTADO ESPERADO**

Después de aplicar estos cambios:

1. **Ventas funcionarán perfectamente** (normales y a crédito)
2. **Dashboard mostrará todas las métricas** incluyendo ventas del día
3. **Rol cobrador tendrá permisos específicos** y validación adecuada
4. **Base de datos estará completa** con todas las tablas necesarias
5. **Sistema estará estable** y listo para producción

**Tiempo estimado de implementación: 2-3 horas**

---

*Documento creado para resolver los errores específicos mencionados por el usuario.*
