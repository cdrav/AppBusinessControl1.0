const fs = require('fs');
const path = require('path');

// Header de copyright para archivos JavaScript
const JS_COPYRIGHT_HEADER = `/**
 * Business Control - Sistema de Gestión Empresarial
 * Desarrollado por Cristian David Ruiz
 * © 2026 Todos los derechos reservados
 * 
 * Este archivo es parte del sistema Business Control
 * y está protegido por derechos de autor
 */

`;

// Archivos JS principales a procesar
const JS_FILES = [
    'js/api.js',
    'js/auth-unified.js',
    'js/auth.js',
    'js/dashboard.js',
    'js/utils.js',
    'js/ventas.js',
    'js/clientes.js',
    'js/inventario.js',
    'js/proveedores.js'
];

function fixJsFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Verificar si ya tiene copyright
        if (content.includes('Cristian David Ruiz') && content.includes('© 2026')) {
            console.log(`📄 ${path.basename(filePath)} - Ya tiene copyright correcto`);
            return false;
        }
        
        // Eliminar headers existentes si los hay
        const lines = content.split('\n');
        let startIndex = 0;
        
        // Buscar el inicio del código real (después de comentarios)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
                startIndex = i;
                break;
            }
        }
        
        // Agregar nuevo header
        const newContent = JS_COPYRIGHT_HEADER + lines.slice(startIndex).join('\n');
        
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`📄 ${path.basename(filePath)} - Agregado header de copyright`);
        return true;
        
    } catch (error) {
        console.error(`❌ Error procesando ${filePath}:`, error.message);
        return false;
    }
}

// Procesar todos los archivos JS
console.log('🔧 CORRECCIÓN AUTOMÁTICA DE COPYRIGHT EN ARCHIVOS JS\n');
console.log('='.repeat(60));

let totalModified = 0;
let totalProcessed = 0;

for (const filename of JS_FILES) {
    const filePath = path.join(__dirname, 'public', filename);
    
    if (fs.existsSync(filePath)) {
        totalProcessed++;
        if (fixJsFile(filePath)) {
            totalModified++;
        }
    } else {
        console.log(`⚠️ Archivo no encontrado: ${filename}`);
    }
}

console.log('\n' + '='.repeat(60));
console.log('📊 RESUMEN DE CORRECCIONES');
console.log('='.repeat(60));
console.log(`📁 Archivos procesados: ${totalProcessed}`);
console.log(`✏️ Archivos modificados: ${totalModified}`);
console.log(`📈 Tasa de modificación: ${((totalModified / totalProcessed) * 100).toFixed(1)}%`);

if (totalModified > 0) {
    console.log('\n🎉 ¡Headers de copyright actualizados correctamente!');
} else {
    console.log('\n✅ Todos los archivos ya tenían el formato correcto');
}
