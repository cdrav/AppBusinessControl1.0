#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Health Check - AppBusinessControl1.0\n');

// Colores para consola
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(status, message) {
  const color = status === '✅' ? colors.green : status === '❌' ? colors.red : colors.yellow;
  console.log(`${color}${status}${colors.reset} ${message}`);
}

// 1. Verificar estructura del proyecto
console.log('📁 Estructura del Proyecto:');
const requiredFiles = [
  'server.js',
  'package.json',
  'database.sql',
  '.env',
  'config/db.js',
  'config/mailer.js',
  'middleware/auth.js',
  'services/emailService.js'
];

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    log('✅', file);
  } else {
    log('❌', `${file} (falta)`);
  }
});

// 2. Verificar carpetas de rutas
console.log('\n🛣️  Rutas de la API:');
const routesDir = 'routes';
if (fs.existsSync(routesDir)) {
  const routeFiles = fs.readdirSync(routesDir);
  routeFiles.forEach(file => {
    if (file.endsWith('.js')) {
      log('✅', `routes/${file}`);
    }
  });
} else {
  log('❌', 'Carpeta routes no encontrada');
}

// 3. Verificar archivos públicos
console.log('\n🌐 Archivos Públicos:');
const publicDir = 'public';
if (fs.existsSync(publicDir)) {
  const publicFiles = fs.readdirSync(publicDir);
  const htmlFiles = publicFiles.filter(file => file.endsWith('.html'));
  htmlFiles.forEach(file => {
    log('✅', `public/${file}`);
  });
} else {
  log('❌', 'Carpeta public no encontrada');
}

// 4. Verificar dependencias
console.log('\n📦 Dependencias:');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const dependencies = packageJson.dependencies || {};
  const devDependencies = packageJson.devDependencies || {};
  
  console.log(`${colors.blue}Dependencias de Producción:${colors.reset}`);
  Object.keys(dependencies).forEach(dep => {
    log('✅', `${dep}@${dependencies[dep]}`);
  });
  
  console.log(`\n${colors.blue}Dependencias de Desarrollo:${colors.reset}`);
  Object.keys(devDependencies).forEach(dep => {
    log('✅', `${dep}@${devDependencies[dep]}`);
  });
} catch (error) {
  log('❌', 'Error leyendo package.json');
}

// 5. Verificar archivos de testing
console.log('\n🧪 Archivos de Testing:');
const testFiles = [
  'jest.config.js',
  'tests/setup.js',
  'tests/simple.test.js',
  'tests/middleware/auth.test.js',
  'tests/services/emailService.test.js'
];

testFiles.forEach(file => {
  if (fs.existsSync(file)) {
    log('✅', file);
  } else {
    log('❌', `${file} (falta)`);
  }
});

// 6. Verificar configuración de entorno
console.log('\n⚙️  Configuración de Entorno:');
try {
  require('dotenv').config();
  
  const requiredEnvVars = [
    'NODE_ENV',
    'JWT_SECRET',
    'DB_HOST',
    'DB_USER',
    'DB_NAME'
  ];
  
  requiredEnvVars.forEach(envVar => {
    if (process.env[envVar]) {
      log('✅', `${envVar}: ${envVar.includes('SECRET') || envVar.includes('PASSWORD') ? '*** configurado ***' : process.env[envVar]}`);
    } else {
      log('⚠️', `${envVar} (no configurado)`);
    }
  });
} catch (error) {
  log('❌', 'Error verificando variables de entorno');
}

// 7. Verificar si el servidor puede iniciar (sin iniciar realmente)
console.log('\n🚀 Verificación del Servidor:');
try {
  const serverCode = fs.readFileSync('server.js', 'utf8');
  
  // Verificar componentes clave
  const checks = [
    { name: 'Express import', pattern: /require\(['"]express['"]/, code: serverCode },
    { name: 'CORS middleware', pattern: /cors\(\)/, code: serverCode },
    { name: 'JSON middleware', pattern: /express\.json\(\)/, code: serverCode },
    { name: 'Rutas importadas', pattern: /require\(['"]\.\/routes\//, code: serverCode },
    { name: 'Server listen', pattern: /app\.listen\(/, code: serverCode },
    { name: 'JWT middleware', pattern: /authenticateToken/, code: serverCode }
  ];
  
  checks.forEach(check => {
    if (check.pattern.test(check.code)) {
      log('✅', check.name);
    } else {
      log('❌', check.name);
    }
  });
  
} catch (error) {
  log('❌', 'Error leyendo server.js');
}

// 8. Verificar estructura de base de datos
console.log('\n🗄️  Estructura de Base de Datos:');
try {
  const sqlCode = fs.readFileSync('database.sql', 'utf8');
  const tables = [
    'users',
    'clients', 
    'inventory',
    'sales',
    'sale_details'
  ];
  
  tables.forEach(table => {
    if (sqlCode.includes(`CREATE TABLE.*${table}`)) {
      log('✅', `Tabla ${table}`);
    } else {
      log('❌', `Tabla ${table} (no encontrada)`);
    }
  });
} catch (error) {
  log('❌', 'Error leyendo database.sql');
}

// 9. Resumen
console.log('\n📊 Resumen del Health Check:');
console.log(`${colors.blue}Para ejecutar tests funcionales:${colors.reset}`);
console.log('  npm test -- tests/simple.test.js');
console.log('  npm test -- tests/middleware/');
console.log('  npm test -- tests/services/');

console.log(`\n${colors.blue}Para iniciar el servidor:${colors.reset}`);
console.log('  npm start');
console.log('  npm run dev');

console.log(`\n${colors.blue}Para ver cobertura de tests:${colors.reset}`);
console.log('  npm run test:coverage');

console.log('\n🎯 Health Check completado!\n');
