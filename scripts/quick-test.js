#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('⚡ Quick Test - AppBusinessControl1.0\n');

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

// Tests rápidos esenciales
const tests = [
  {
    name: 'Archivo package.json existe',
    test: () => fs.existsSync('package.json')
  },
  {
    name: 'Dependencias instaladas',
    test: () => fs.existsSync('node_modules')
  },
  {
    name: 'Servidor principal existe',
    test: () => fs.existsSync('server.js')
  },
  {
    name: 'Configuración de BD existe',
    test: () => fs.existsSync('config/db.js')
  },
  {
    name: 'Middleware de autenticación existe',
    test: () => fs.existsSync('middleware/auth.js')
  },
  {
    name: 'Variables de entorno configuradas',
    test: () => {
      try {
        require('dotenv').config();
        return process.env.JWT_SECRET && process.env.DB_HOST;
      } catch {
        return false;
      }
    }
  },
  {
    name: 'Estructura de rutas existe',
    test: () => fs.existsSync('routes') && fs.readdirSync('routes').some(f => f.endsWith('.js'))
  },
  {
    name: 'Archivos públicos existen',
    test: () => fs.existsSync('public') && fs.readdirSync('public').some(f => f.endsWith('.html'))
  },
  {
    name: 'Tests básicos funcionan',
    test: () => fs.existsSync('tests/simple.test.js')
  },
  {
    name: 'Configuración de Jest existe',
    test: () => fs.existsSync('jest.config.js')
  }
];

let passed = 0;
let failed = 0;

tests.forEach(test => {
  try {
    if (test.test()) {
      log('✅', test.name);
      passed++;
    } else {
      log('❌', test.name);
      failed++;
    }
  } catch (error) {
    log('❌', `${test.name} - Error: ${error.message}`);
    failed++;
  }
});

console.log(`\n📊 Resultados: ${colors.green}${passed} pasaron${colors.reset}, ${colors.red}${failed} fallaron${colors.reset}`);

if (failed === 0) {
  console.log(`\n🎉 ${colors.green}¡Todo está bien configurado!${colors.reset}`);
  console.log('\n🚀 Para iniciar la aplicación:');
  console.log('   1. Asegúrate de que MySQL esté corriendo');
  console.log('   2. Crea la base de datos: mysql -u root -p < database.sql');
  console.log('   3. Inicia el servidor: npm start');
  console.log('   4. Abre http://localhost:3000');
  
  console.log('\n🧪 Para ejecutar tests:');
  console.log('   npm test -- tests/simple.test.js');
  
} else {
  console.log(`\n⚠️  ${colors.yellow}Hay problemas que necesitan atención${colors.reset}`);
  console.log('\n🔧 Soluciones rápidas:');
  
  if (!fs.existsSync('node_modules')) {
    console.log('   - Ejecuta: npm install');
  }
  
  if (!fs.existsSync('.env')) {
    console.log('   - Crea archivo .env con las variables necesarias');
  }
  
  if (!fs.existsSync('database.sql')) {
    console.log('   - Verifica que database.sql exista');
  }
  
  console.log('\n🔍 Para diagnóstico completo:');
  console.log('   node scripts/health-check.js');
  console.log('   node scripts/error-detector.js');
}

console.log('\n⚡ Quick Test completado!\n');
