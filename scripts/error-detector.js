#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Detector de Errores - AppBusinessControl1.0\n');

// Colores para consola
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(type, message, details = '') {
  const icons = {
    '✅': colors.green,
    '❌': colors.red,
    '⚠️': colors.yellow,
    'ℹ️': colors.blue,
    '🔧': colors.cyan
  };
  const color = icons[type] || colors.reset;
  console.log(`${color}${type}${colors.reset} ${message}${details ? ` - ${details}` : ''}`);
}

// 1. Verificar sintaxis de archivos JavaScript
console.log('📝 Verificación de Sintaxis JavaScript:');
const jsFiles = [
  'server.js',
  'config/db.js',
  'config/mailer.js',
  'middleware/auth.js',
  'services/emailService.js'
];

jsFiles.forEach(file => {
  try {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Verificar errores comunes de sintaxis
      const syntaxErrors = [
        { pattern: /require\(\s*['"]\.\.\/\.\.\/\.\./, message: 'Ruta relativa muy profunda' },
        { pattern: /console\.log.*\n.*console\.log/, message: 'Múltiples console.log seguidos' },
        { pattern: /;\s*;/, message: 'Doble punto y coma' },
        { pattern: /\{\s*\}/, message: 'Llaves vacías' }
      ];
      
      let hasErrors = false;
      syntaxErrors.forEach(error => {
        if (error.pattern.test(content)) {
          log('⚠️', file, error.message);
          hasErrors = true;
        }
      });
      
      if (!hasErrors) {
        log('✅', file, 'Sintaxis OK');
      }
    } else {
      log('❌', file, 'Archivo no encontrado');
    }
  } catch (error) {
    log('❌', file, `Error de lectura: ${error.message}`);
  }
});

// 2. Verificar dependencias faltantes
console.log('\n📦 Verificación de Dependencias:');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const nodeModulesExists = fs.existsSync('node_modules');
  
  if (!nodeModulesExists) {
    log('❌', 'node_modules', 'Carpeta no existe - ejecuta npm install');
  } else {
    log('✅', 'node_modules', 'Dependencias instaladas');
  }
  
  // Verificar dependencias críticas
  const criticalDeps = ['express', 'mysql2', 'bcrypt', 'jsonwebtoken'];
  criticalDeps.forEach(dep => {
    const depPath = path.join('node_modules', dep);
    if (fs.existsSync(depPath)) {
      log('✅', dep, 'Instalado');
    } else {
      log('❌', dep, 'No encontrado');
    }
  });
  
} catch (error) {
  log('❌', 'package.json', `Error: ${error.message}`);
}

// 3. Verificar configuración de base de datos
console.log('\n🗄️  Verificación de Configuración BD:');
try {
  const dbConfig = fs.readFileSync('config/db.js', 'utf8');
  
  const checks = [
    { pattern: /mysql2/, message: 'Usando mysql2 (recomendado)' },
    { pattern: /createPool/, message: 'Usando pool de conexiones' },
    { pattern: /process\.env/, message: 'Usando variables de entorno' },
    { pattern: /waitForConnections.*true/, message: 'Wait for connections configurado' }
  ];
  
  checks.forEach(check => {
    if (check.pattern.test(dbConfig)) {
      log('✅', check.message);
    } else {
      log('⚠️', check.message);
    }
  });
  
} catch (error) {
  log('❌', 'config/db.js', `Error: ${error.message}`);
}

// 4. Verificar seguridad
console.log('\n🔒 Verificación de Seguridad:');
try {
  const serverCode = fs.readFileSync('server.js', 'utf8');
  const authCode = fs.readFileSync('middleware/auth.js', 'utf8');
  
  const securityChecks = [
    { 
      file: 'server.js', 
      code: serverCode, 
      checks: [
        { pattern: /cors\(\)/, message: 'CORS configurado' },
        { pattern: /express\.json\(\)/, message: 'JSON middleware configurado' }
      ]
    },
    { 
      file: 'middleware/auth.js', 
      code: authCode, 
      checks: [
        { pattern: /jwt\.verify/, message: 'JWT verification implementado' },
        { pattern: /bcrypt\.compare/, message: 'Password comparison con bcrypt' },
        { pattern: /process\.env\.JWT_SECRET/, message: 'JWT secret en variables de entorno' }
      ]
    }
  ];
  
  securityChecks.forEach(fileCheck => {
    fileCheck.checks.forEach(check => {
      if (check.pattern.test(fileCheck.code)) {
        log('✅', `${fileCheck.file}: ${check.message}`);
      } else {
        log('⚠️', `${fileCheck.file}: ${check.message}`);
      }
    });
  });
  
} catch (error) {
  log('❌', 'Verificación de seguridad', `Error: ${error.message}`);
}

// 5. Verificar archivos HTML
console.log('\n🌐 Verificación de Archivos HTML:');
try {
  const publicDir = 'public';
  if (fs.existsSync(publicDir)) {
    const htmlFiles = fs.readdirSync(publicDir).filter(file => file.endsWith('.html'));
    
    htmlFiles.forEach(file => {
      const filePath = path.join(publicDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Verificar estructura básica HTML
      const htmlChecks = [
        { pattern: /<!DOCTYPE html>/i, message: 'DOCTYPE declarado' },
        { pattern: /<html.*lang=/i, message: 'Idioma especificado' },
        { pattern: /<head>/i, message: 'Head presente' },
        { pattern: /<meta.*charset=/i, message: 'Charset especificado' },
        { pattern: /<body>/i, message: 'Body presente' }
      ];
      
      let hasErrors = false;
      htmlChecks.forEach(check => {
        if (!check.pattern.test(content)) {
          log('⚠️', file, check.message);
          hasErrors = true;
        }
      });
      
      if (!hasErrors) {
        log('✅', file, 'Estructura HTML OK');
      }
    });
  }
} catch (error) {
  log('❌', 'Verificación HTML', `Error: ${error.message}`);
}

// 6. Verificar variables de entorno críticas
console.log('\n⚙️  Variables de Entorno Críticas:');
try {
  require('dotenv').config();
  
  const criticalVars = [
    { name: 'JWT_SECRET', required: true, sensitive: true },
    { name: 'DB_HOST', required: true, sensitive: false },
    { name: 'DB_USER', required: true, sensitive: false },
    { name: 'DB_PASSWORD', required: false, sensitive: true },
    { name: 'DB_NAME', required: true, sensitive: false },
    { name: 'PORT', required: false, sensitive: false }
  ];
  
  criticalVars.forEach(variable => {
    const value = process.env[variable.name];
    if (value) {
      const displayValue = variable.sensitive ? '*** configurado ***' : value;
      log('✅', variable.name, displayValue);
    } else if (variable.required) {
      log('❌', variable.name, 'Variable requerida no configurada');
    } else {
      log('⚠️', variable.name, 'Variable opcional no configurada');
    }
  });
  
} catch (error) {
  log('❌', 'Variables de entorno', `Error: ${error.message}`);
}

// 7. Verificar estructura de rutas
console.log('\n🛣️  Verificación de Estructura de Rutas:');
try {
  const routesDir = 'routes';
  if (fs.existsSync(routesDir)) {
    const routeFiles = fs.readdirSync(routesDir).filter(file => file.endsWith('.js'));
    
    routeFiles.forEach(file => {
      const filePath = path.join(routesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Verificar estructura básica de ruta
      const routeChecks = [
        { pattern: /express\.Router\(\)/, message: 'Router inicializado' },
        { pattern: /router\.(get|post|put|delete)/, message: 'Métodos HTTP definidos' },
        { pattern: /module\.exports/, message: 'Módulo exportado' }
      ];
      
      let hasErrors = false;
      routeChecks.forEach(check => {
        if (!check.pattern.test(content)) {
          log('⚠️', file, check.message);
          hasErrors = true;
        }
      });
      
      if (!hasErrors) {
        log('✅', file, 'Estructura de ruta OK');
      }
    });
  }
} catch (error) {
  log('❌', 'Verificación de rutas', `Error: ${error.message}`);
}

// 8. Recomendaciones
console.log('\n🔧 Recomendaciones:');
console.log(`${colors.cyan}1. Si hay errores en variables de entorno:${colors.reset}`);
console.log('   - Revisa el archivo .env');
console.log('   - Copia .env.example si existe');

console.log(`\n${colors.cyan}2. Si faltan dependencias:${colors.reset}`);
console.log('   - Ejecuta: npm install');
console.log('   - Verifica package.json');

console.log(`\n${colors.cyan}3. Para probar la aplicación:${colors.reset}`);
console.log('   - Inicia MySQL: mysqld');
console.log('   - Crea BD: mysql -u root -p < database.sql');
console.log('   - Inicia servidor: npm start');

console.log(`\n${colors.cyan}4. Para ejecutar tests:${colors.reset}`);
console.log('   - Tests básicos: npm test -- tests/simple.test.js');
console.log('   - Cobertura: npm run test:coverage');

console.log('\n🎯 Detector de Errores completado!\n');
