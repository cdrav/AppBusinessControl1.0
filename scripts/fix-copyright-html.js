const fs = require('fs');
const path = require('path');

// Plantillas de copyright y meta tags
const COPYRIGHT_FOOTER = '<footer class="main-footer"><p class="mb-0">&copy; 2026 Business Control - Desarrollado por <strong>Cristian David Ruiz</strong>. Todos los derechos reservados.</p></footer>';

const AUTHOR_META = '<meta name="author" content="Cristian David Ruiz">';
const DESCRIPTION_META = '<meta name="description" content="Sistema de gestión empresarial - Business Control por Cristian David Ruiz">';

// Archivos HTML a procesar
const HTML_FILES = [
    'login.html',
    'register.html', 
    'perfil.html',
    'proveedores.html',
    'sedes.html',
    'usuarios.html',
    'usuarios-cobradores.html',
    'gastos.html'
];

function fixHtmlFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;
        
        // Actualizar o agregar meta tags
        if (!content.includes('<meta name="author"')) {
            // Buscar charset meta y agregar después
            const charsetIndex = content.indexOf('<meta charset=');
            if (charsetIndex !== -1) {
                const endOfLine = content.indexOf('>', charsetIndex) + 1;
                content = content.slice(0, endOfLine) + '\n  ' + AUTHOR_META + content.slice(endOfLine);
                modified = true;
                console.log(`   ✅ Agregado meta tag de autor`);
            }
        }
        
        if (!content.includes('<meta name="description"')) {
            // Buscar viewport meta y agregar después
            const viewportIndex = content.indexOf('<meta name="viewport"');
            if (viewportIndex !== -1) {
                const endOfLine = content.indexOf('>', viewportIndex) + 1;
                content = content.slice(0, endOfLine) + '\n  ' + DESCRIPTION_META + content.slice(endOfLine);
                modified = true;
                console.log(`   ✅ Agregado meta tag de descripción`);
            }
        }
        
        // Actualizar footer
        if (content.includes('<footer')) {
            // Reemplazar footer existente
            const footerStart = content.indexOf('<footer');
            const footerEnd = content.indexOf('</footer>') + 9;
            
            if (footerStart !== -1 && footerEnd !== -1) {
                const oldFooter = content.slice(footerStart, footerEnd);
                if (!oldFooter.includes('Cristian David Ruiz') || !oldFooter.includes('2026')) {
                    content = content.slice(0, footerStart) + COPYRIGHT_FOOTER + content.slice(footerEnd);
                    modified = true;
                    console.log(`   ✅ Actualizado footer con copyright correcto`);
                }
            }
        }
        
        // Guardar si se modificó
        if (modified) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`📄 ${path.basename(filePath)} - Actualizado correctamente`);
            return true;
        } else {
            console.log(`📄 ${path.basename(filePath)} - Ya estaba correcto`);
            return false;
        }
        
    } catch (error) {
        console.error(`❌ Error procesando ${filePath}:`, error.message);
        return false;
    }
}

// Procesar todos los archivos HTML
console.log('🔧 CORRECCIÓN AUTOMÁTICA DE COPYRIGHT EN ARCHIVOS HTML\n');
console.log('='.repeat(60));

let totalModified = 0;
let totalProcessed = 0;

for (const filename of HTML_FILES) {
    const filePath = path.join(__dirname, 'public', filename);
    
    if (fs.existsSync(filePath)) {
        totalProcessed++;
        if (fixHtmlFile(filePath)) {
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
    console.log('\n🎉 ¡Copyright y meta tags actualizados correctamente!');
} else {
    console.log('\n✅ Todos los archivos ya tenían el formato correcto');
}
