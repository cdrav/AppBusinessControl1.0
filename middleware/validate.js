/**
 * Middleware de validación centralizada
 * Reemplaza validaciones dispersas en cada ruta
 */
const { isValidEmail } = require('./sanitize');

// Errores de validación con código 400
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

// Errores de lógica de negocio (stock insuficiente, precio inválido, etc.)
class BusinessError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'BusinessError';
    this.statusCode = statusCode;
  }
}

// Helper para manejar errores en catch de transacciones
function handleTransactionError(res, err, conn) {
  const statusCode = err.statusCode || 500;
  if (conn) conn.rollback().catch(() => {});
  res.status(statusCode).json({ message: err.message });
}

// Validar campos requeridos en req.body
function requireFields(...fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => !req.body[f] && req.body[f] !== 0);
    if (missing.length > 0) {
      return res.status(400).json({ 
        message: `Campos requeridos: ${missing.join(', ')}` 
      });
    }
    next();
  };
}

// Validar email si está presente
function validateEmail(field = 'email') {
  return (req, res, next) => {
    const email = req.body[field];
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ message: 'Formato de email inválido' });
    }
    next();
  };
}

// Validar que un campo sea numérico positivo
function validatePositiveNumber(...fields) {
  return (req, res, next) => {
    for (const field of fields) {
      const val = req.body[field];
      if (val !== undefined && val !== null) {
        const num = Number(val);
        if (isNaN(num) || num < 0) {
          return res.status(400).json({ 
            message: `${field} debe ser un número positivo` 
          });
        }
      }
    }
    next();
  };
}

// Validar longitud mínima de string
function validateMinLength(field, min) {
  return (req, res, next) => {
    const val = req.body[field];
    if (val && typeof val === 'string' && val.trim().length < min) {
      return res.status(400).json({ 
        message: `${field} debe tener al menos ${min} caracteres` 
      });
    }
    next();
  };
}

// Validar que req.params.id sea numérico
function validateParamId(req, res, next) {
  const id = req.params.id;
  if (id && isNaN(parseInt(id))) {
    return res.status(400).json({ message: 'ID inválido' });
  }
  next();
}

// Validar array no vacío en body
function requireArray(field) {
  return (req, res, next) => {
    const arr = req.body[field];
    if (!Array.isArray(arr) || arr.length === 0) {
      return res.status(400).json({ 
        message: `${field} debe ser un array no vacío` 
      });
    }
    next();
  };
}

module.exports = {
  ValidationError,
  BusinessError,
  handleTransactionError,
  requireFields,
  validateEmail,
  validatePositiveNumber,
  validateMinLength,
  validateParamId,
  requireArray
};
