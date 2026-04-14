const { cleanString, sanitizeObject, isValidEmail, sanitizeBody } = require('../../middleware/sanitize');

describe('Sanitize Middleware', () => {

  describe('cleanString', () => {
    test('elimina tags HTML', () => {
      expect(cleanString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
    });

    test('elimina javascript: protocol', () => {
      expect(cleanString('javascript:alert(1)')).toBe('alert(1)');
    });

    test('elimina event handlers', () => {
      expect(cleanString('onerror=alert(1)')).toBe('alert(1)');
      expect(cleanString('onclick=hack()')).toBe('hack()');
    });

    test('hace trim de espacios', () => {
      expect(cleanString('  hola  ')).toBe('hola');
    });

    test('retorna valores no-string sin modificar', () => {
      expect(cleanString(123)).toBe(123);
      expect(cleanString(null)).toBe(null);
      expect(cleanString(undefined)).toBe(undefined);
    });

    test('deja strings normales intactos', () => {
      expect(cleanString('Producto ABC-123')).toBe('Producto ABC-123');
      expect(cleanString('usuario@email.com')).toBe('usuario@email.com');
    });
  });

  describe('sanitizeObject', () => {
    test('sanitiza strings en un objeto', () => {
      const input = { name: '<b>test</b>', price: 100 };
      const result = sanitizeObject(input);
      expect(result.name).toBe('btest/b');
      expect(result.price).toBe(100);
    });

    test('sanitiza objetos anidados', () => {
      const input = { user: { name: '<script>x</script>' } };
      const result = sanitizeObject(input);
      expect(result.user.name).toBe('scriptx/script');
    });

    test('no modifica arrays (los deja pasar)', () => {
      const input = { tags: ['a', 'b'] };
      const result = sanitizeObject(input);
      expect(result.tags).toEqual(['a', 'b']);
    });

    test('retorna null/undefined sin error', () => {
      expect(sanitizeObject(null)).toBe(null);
      expect(sanitizeObject(undefined)).toBe(undefined);
    });
  });

  describe('isValidEmail', () => {
    test('acepta emails válidos', () => {
      expect(isValidEmail('user@domain.com')).toBe(true);
      expect(isValidEmail('admin@businesscontrol.com')).toBe(true);
    });

    test('rechaza emails inválidos', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
    });

    test('acepta null/undefined (campo opcional)', () => {
      expect(isValidEmail(null)).toBe(true);
      expect(isValidEmail(undefined)).toBe(true);
      expect(isValidEmail('')).toBe(true);
    });
  });

  describe('sanitizeBody middleware', () => {
    test('sanitiza req.body y llama next()', () => {
      const req = { body: { name: '<script>hack</script>' } };
      const res = {};
      const next = jest.fn();

      sanitizeBody(req, res, next);

      expect(req.body.name).toBe('scripthack/script');
      expect(next).toHaveBeenCalled();
    });

    test('funciona con body vacío', () => {
      const req = { body: null };
      const res = {};
      const next = jest.fn();

      sanitizeBody(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('funciona sin body', () => {
      const req = {};
      const res = {};
      const next = jest.fn();

      sanitizeBody(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
