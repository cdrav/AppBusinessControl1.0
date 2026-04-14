-- Script para corregir el saldo de la venta a crédito
-- Reemplaza SALE_ID con el ID real de la venta (lo ves en la URL de ventas.html o en el ticket)

-- Verificar el crédito actual
SELECT 
    c.id,
    c.total_debt,
    c.remaining_balance,
    s.total_price,
    c.total_debt - 300000 as saldo_correcto
FROM credits c
JOIN sales s ON c.sale_id = s.id
WHERE c.sale_id = SALE_ID;

-- CORREGIR el saldo (descomenta y ejecuta después de verificar)
-- UPDATE credits 
-- SET remaining_balance = remaining_balance - 300000,
--     total_debt = total_debt - 300000
-- WHERE sale_id = SALE_ID;
