/**
 * Rate limiter en memoria para rutas sensibles
 * Limita peticiones por IP + ruta en una ventana de tiempo
 */
const stores = new Map();

function rateLimit({ windowMs = 60000, max = 10, message = 'Demasiadas solicitudes. Intente de nuevo más tarde.' } = {}) {
  const storeKey = Symbol('rateLimit');
  stores.set(storeKey, new Map());

  // Limpieza automática cada 5 minutos
  setInterval(() => {
    const store = stores.get(storeKey);
    const now = Date.now();
    for (const [key, record] of store) {
      if (now - record.resetTime > windowMs) store.delete(key);
    }
  }, 5 * 60 * 1000).unref();

  return (req, res, next) => {
    const store = stores.get(storeKey);
    const key = (req.ip || req.connection.remoteAddress) + ':' + (req.user?.id || 'anon');
    const now = Date.now();
    const record = store.get(key);

    if (!record || now > record.resetTime) {
      store.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    record.count++;
    if (record.count > max) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ message });
    }

    next();
  };
}

module.exports = rateLimit;
