# Guía de Testing para AppBusinessControl1.0

## 📋 Resumen

Esta guía explica cómo ejecutar y mantener las pruebas del sistema de gestión empresarial.

## 🛠️ Instalación

```bash
# Instalar dependencias de testing
npm install

# O si ya tienes las dependencias, solo las de desarrollo
npm install --save-dev jest supertest
```

## 🗄️ Configuración de Base de Datos

1. **Crear base de datos de testing:**
```bash
mysql -u root -p < database.test.sql
```

2. **Configurar variables de entorno:**
   - El archivo `.env.test` ya está configurado
   - Ajusta las credenciales de MySQL si es necesario

## 🚀 Ejecutar Pruebas

### Pruebas Básicas
```bash
# Ejecutar todas las pruebas
npm test

# Ejecutar en modo watch (se actualiza automáticamente)
npm run test:watch

# Ver cobertura de código
npm run test:coverage
```

### Flujo Completo de Testing
```bash
# Configurar base de datos y ejecutar pruebas
npm run test:all
```

## 📁 Estructura de Tests

```
tests/
├── setup.js                    # Configuración global de Jest
├── database.test.js            # Tests de conexión a BD
├── middleware/
│   └── auth.test.js           # Tests de middleware de autenticación
├── routes/
│   ├── auth.test.js           # Tests de rutas de autenticación
│   └── inventory.test.js      # Tests de rutas de inventario
├── services/
│   └── emailService.test.js   # Tests de servicios de email
└── integration/
    └── api.test.js            # Tests de integración completos
```

## 🧪 Tipos de Pruebas

### 1. **Unit Tests**
- Prueban funciones individuales
- Aisladas con mocks
- Ejemplo: `middleware/auth.test.js`

### 2. **Integration Tests**
- Prueban la interacción entre componentes
- Usan la base de datos real de testing
- Ejemplo: `routes/auth.test.js`

### 3. **API Tests**
- Prueban endpoints completos
- Simulan flujos de usuario reales
- Ejemplo: `integration/api.test.js`

## 📊 Reportes de Cobertura

Ejecuta `npm run test:coverage` para generar:

- **Reporte en consola**: Porcentaje de cobertura
- **Reporte HTML**: `coverage/lcov-report/index.html`
- **Reporte LCOV**: Para integración con CI/CD

## 🔧 Scripts Útiles

### Antes de las Pruebas
```bash
# Limpiar y configurar base de datos
npm run test:setup
```

### Durante Desarrollo
```bash
# Modo watch para desarrollo continuo
npm run test:watch

# Ejecutar tests específicos
npm test -- --testNamePattern="Authentication"
```

### Para Producción
```bash
# Verificar que todo funciona antes de deploy
npm run test:all
```

## 📝 Escribir Nuevos Tests

### Estructura Básica
```javascript
describe('Módulo a probar', () => {
  beforeEach(() => {
    // Configuración antes de cada test
  });

  test('debe hacer X', async () => {
    // Arrange - Preparar datos
    // Act - Ejecutar función
    // Assert - Verificar resultado
    expect(resultado).toBe(esperado);
  });
});
```

### Mocks de Base de Datos
```javascript
const db = require('../../config/db');

jest.mock('../../config/db');

test('debe consultar usuarios', async () => {
  db.query.mockResolvedValueOnce([[{ id: 1, name: 'Test' }]]);
  
  const users = await getUsers();
  expect(users).toHaveLength(1);
});
```

## 🚨 Buenas Prácticas

### ✅ Hacer
- Usar descripciones claras en los tests
- Probar casos exitosos y de error
- Limpiar mocks entre tests
- Usar datos de prueba consistentes

### ❌ Evitar
- Depender de datos externos
- Tests que dependen del orden de ejecución
- Ignorar errores en la consola
- No probar casos límite

## 🔍 Depuración de Tests

### Ver Logs Detallados
```bash
npm test -- --verbose
```

### Ejecutar un Test Específico
```bash
npm test -- --testNamePattern="debe crear usuario"
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

## 📈 Métricas Objetivo

- **Cobertura mínima**: 80%
- **Tests unitarios**: Todos los middleware y servicios
- **Tests de integración**: Todas las rutas principales
- **Tests E2E**: Flujos críticos de negocio

## 🐛 Solución de Problemas Comunes

### Error: "Database connection failed"
```bash
# Verificar que MySQL esté corriendo
mysql -u root -p

# Recrear base de datos de testing
npm run test:setup
```

### Error: "Module not found"
```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

### Error: "Test timeout"
```bash
# Aumentar timeout en jest.config.js
testTimeout: 30000
```

## 🔄 Integración Continua

Para integrar con GitHub Actions, crea `.github/workflows/test.yml`:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:all
```

---

## 📞 Soporte

Si tienes problemas con los tests:

1. Revisa la configuración de `.env.test`
2. Asegúrate que MySQL esté corriendo
3. Verifica las dependencias instaladas
4. Limpia la base de datos: `npm run test:setup`
