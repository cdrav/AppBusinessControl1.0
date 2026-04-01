# 🗄️ **INSTRUCCIONES PARA EJECUTAR MIGRACIÓN DE BASE DE DATOS**

**Fecha:** 30 de marzo de 2026  
**Objetivo:** Ejecutar la migración para resolver errores de ventas

---

## 🔍 **VERIFICACIÓN PREVIA**

### **1. Verificar si MySQL está instalado:**
```bash
# Abrir Command Prompt (CMD) o PowerShell y ejecutar:
mysql --version

# Si no está instalado, instalar MySQL Server 8.0 desde:
# https://dev.mysql.com/downloads/mysql/
```

### **2. Verificar si el servicio MySQL está corriendo:**
```bash
# En CMD o PowerShell:
services.msc

# Buscar "MySQL80" o "MySQL" en la lista
# Si no está iniciado, hacer clic derecho → Iniciar
```

### **3. Localizar el ejecutable de MySQL:**
```bash
# Rutas comunes donde encontrar mysql.exe:
C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe
C:\Program Files (x86)\MySQL\MySQL Server 8.0\bin\mysql.exe
C:\xampp\mysql\bin\mysql.exe
C:\wamp64\bin\mysql\mysql.exe

# Agregar al PATH del sistema si no está accesible
```

---

## 🚀 **PASOS PARA EJECUTAR MIGRACIÓN**

### **Opción 1: Usar XAMPP (Recomendado para desarrollo)**
```bash
# 1. Iniciar XAMPP Control Panel
# 2. Iniciar el servicio Apache y MySQL
# 3. Abrir Shell de XAMPP (botón Shell)
# 4. Navegar al proyecto:
cd C:\Users\auxsistemas2\Desktop\AppBusinessControl1.0

# 5. Ejecutar la migración:
mysql -u root -p business_control < actualizar-sales.sql

# Si pide contraseña, dejar en blanco o usar la que configuraste
```

### **Opción 2: Usar MySQL Workbench**
```bash
# 1. Abrir MySQL Workbench
# 2. Conectarse a la base de datos:
   - Host: localhost
   - Port: 3306
   - Username: root
   - Password: (tu contraseña)
   - Default Schema: business_control

# 3. Copiar y pegar el contenido de actualizar-sales.sql
# 4. Ejecutar todo el script (CTRL+A, luego ejecutar)
```

### **Opción 3: Usar línea de comandos directa**
```bash
# 1. Abrir CMD como Administrador
# 2. Navegar a la carpeta de MySQL:
cd "C:\Program Files\MySQL\MySQL Server 8.0\bin"

# 3. Ejecutar el comando:
mysql -u root -p business_control < "C:\Users\auxsistemas2\Desktop\AppBusinessControl1.0\actualizar-sales.sql"

# Si pide contraseña, ingresarla o presionar Enter si no tiene
```

### **Opción 4: Usar phpMyAdmin (si está disponible)**
```bash
# 1. Abrir phpMyAdmin en el navegador:
http://localhost/phpmyadmin/

# 2. Seleccionar la base de datos "business_control"
# 3. Hacer clic en la pestaña "SQL"
# 4. Copiar y pegar todo el contenido de actualizar-sales.sql
# 5. Hacer clic en "Continuar" o "Go"
```

---

## 📋 **CONTENIDO DEL ARCHIVO actualizar-sales.sql**

El archivo ya está creado y contiene:

```sql
-- ========================================
-- MIGRACIÓN DE BASE DE DATOS - SALES
-- ========================================

-- 1. Agregar columnas faltantes a la tabla sales
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS is_credit BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS discount DECIMAL(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS branch_id INT;

-- 2. Crear tabla de créditos
CREATE TABLE IF NOT EXISTS credits (
    id INT AUTO_INCREMENT PRIMARY KEY,
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

-- 3. Crear tabla de cupones
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

-- 4. Crear tabla de stocks por sucursal
CREATE TABLE IF NOT EXISTS branch_stocks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    branch_id INT NOT NULL,
    product_id INT NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_branch_product (branch_id, product_id),
    FOREIGN KEY (product_id) REFERENCES inventory(id) ON DELETE CASCADE
);

-- 5. Verificar estructura
SELECT 
    COLUMN_NAME, 
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'sales'
ORDER BY ORDINAL_POSITION;
```

---

## ✅ **VERIFICACIÓN POST-MIGRACIÓN**

### **Para verificar que todo funcionó:**

#### **1. Verificar tablas creadas:**
```sql
-- Ejecutar en MySQL Workbench o phpMyAdmin:
SHOW TABLES LIKE 'credits';
SHOW TABLES LIKE 'coupons';
SHOW TABLES LIKE 'branch_stocks';

DESCRIBE sales;
```

#### **2. Verificar columnas en sales:**
```sql
-- Debe mostrar estas columnas:
+-------------+--------------+------+-----+---------+-------+
| Field       | Type         | Null | Key     | Default |
+-------------+--------------+------+-----+---------+-------+
| id          | int          | NO   | PRI     | NULL    |
| client_id   | int          | YES  | MUL     | NULL    |
| total_price | decimal(10,2)| NO   |         | NULL    |
| sale_date  | datetime     | NO   |         | NULL    |
| is_credit  | tinyint(1)   | NO   |         | 0      |  <-- NUEVA
| discount   | decimal(15,2)| NO   |         | 0.00   |  <-- NUEVA
| coupon_code| varchar(50)   | YES  |         | NULL    |  <-- NUEVA
| notes      | text         | YES  |         | NULL    |  <-- NUEVA
| branch_id  | int          | YES  |         | NULL    |  <-- NUEVA
| created_at | timestamp    | NO   |         | CURRENT_TIMESTAMP |
+-------------+--------------+------+-----+---------+-------+
```

#### **3. Probar el sistema:**
```javascript
// 1. Iniciar el servidor:
npm start

// 2. Ir a http://localhost:3000
// 3. Hacer login
// 4. Ir a addSale.html
// 5. Intentar hacer una venta normal
// 6. Debe funcionar sin error "Unknown column 'is_credit'"
```

---

## 🚨 **SOLUCIÓN DE PROBLEMAS COMUNES**

### **Error: "Access denied for user 'root'@'localhost'**
```bash
# Solución 1: Resetear contraseña de root
mysqladmin -u root -p password

# Solución 2: Crear nuevo usuario
mysql -u root -p
CREATE USER 'business_user'@'localhost' IDENTIFIED BY 'tu_password';
GRANT ALL PRIVILEGES ON business_control.* TO 'business_user'@'localhost';
FLUSH PRIVILEGES;
```

### **Error: "Can't connect to MySQL server**
```bash
# Verificar que el servicio esté corriendo:
services.msc

# Iniciar manualmente si es necesario:
net start mysql80

# O reiniciar el servicio:
net stop mysql80
net start mysql80
```

### **Error: "Unknown database 'business_control'"**
```bash
# Crear la base de datos primero:
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS business_control;"

# O usar el database.sql original:
mysql -u root -p < database.sql
```

---

## 🎯 **RECOMENDACIÓN**

**Usa XAMPP si tienes instalado** - Es la forma más fácil para desarrollo local.

**Si no tienes MySQL instalado:**
1. Descarga XAMPP desde: https://www.apachefriends.org/es/xampp-windows.html
2. Instálalo en C:\xampp
3. Inicia Apache y MySQL desde el XAMPP Control Panel
4. Usa el Shell de XAMPP para ejecutar la migración

**Después de la migración:**
1. Reinicia el servidor Node.js
2. Limpia el caché del navegador
3. Prueba hacer una venta normal
4. Verifica que no aparezca el error

---

## 📞 **SOPORTE**

Si tienes problemas con la migración:

1. **Verifica que MySQL esté corriendo**
2. **Usa la contraseña correcta**
3. **Ejecuta el SQL completo (no por partes)**
4. **Reinicia el servidor Node.js después de migrar**

**El archivo actualizar-sales.sql está listo para ser ejecutado.**

---

*Instrucciones completas para ejecutar la migración de base de datos y resolver todos los errores de ventas.*
