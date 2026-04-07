/**
 * Middleware y utilidades de sanitización de inputs
 * Previene XSS almacenado y datos malformados
 */

// Eliminar tags HTML y caracteres peligrosos de un string
function cleanString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[<>]/g, '') // Eliminar < y >
    .replace(/javascript:/gi, '') // Eliminar javascript:
    .replace(/on\w+\s*=/gi, '') // Eliminar event handlers (onclick=, onerror=, etc.)
    .trim();
}

// Sanitizar recursivamente un objeto
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      clean[key] = cleanString(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      clean[key] = sanitizeObject(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

// Validar formato de email
function isValidEmail(email) {
  if (!email) return true; // email puede ser opcional
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Middleware: sanitizar req.body automáticamente
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

module.exports = { cleanString, sanitizeObject, isValidEmail, sanitizeBody };
