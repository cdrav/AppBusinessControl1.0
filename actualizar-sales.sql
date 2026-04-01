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
