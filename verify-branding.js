const fs = require('fs');
const path = require('path');

// Configuración de branding
const EXPECTED_COPYRIGHT = '© 2026 Business Control - Desarrollado por Cristian David Ruiz. Todos los derechos reservados.';
const EXPECTED_AUTHOR = 'Cristian David Ruiz';
const EXPECTED_TITLE_PREFIX = 'Business Control';

// Directorios a verificar
const PUBLIC_DIR = path.join(__dirname, 'public');

function verifyFile(filePath, fileName) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const issues = [];
        
        // Verificar copyright
        if (!content.includes('©') && !content.includes('&copy;')) {
            issues.push('❌ Falta símbolo de copyright');
        }
        
        if (!content.includes('Cristian David Ruiz')) {
            issues.push('❌ Falta nombre del desarrollador');
        }
        
        if (!content.includes('Business Control')) {
            issues.push('❌ Falta nombre del sistema');
        }
        
        if (!content.includes('Todos los derechos reservados')) {
            issues.push('❌ Falta texto de derechos reservados');
        }
        
        // Verificar año actualizado
        const currentYear = new Date().getFullYear();
        if (!content.includes(currentYear.toString()) && !content.includes('2026')) {
            issues.push(`❌ Año de copyright no actualizado (debe ser ${currentYear})`);
        }
        
        // Verificar meta tags para HTML
        if (fileName.endsWith('.html')) {
            if (!content.includes('<meta name="author"')) {
                issues.push('❌ Falta meta tag de autor');
            }
            
            if (!content.includes('<meta name="description"')) {
                issues.push('❌ Falta meta tag de descripción');
            }
            
            if (!content.includes('<title>')) {
                issues.push('❌ Falta tag title');
            }
        }
        
        return {
            file: fileName,
            issues: issues,
            status: issues.length === 0 ? '✅ OK' : '⚠️ Issues'
        };
    } catch (error) {
        return {
            file: fileName,
            issues: [`❌ Error reading file: ${error.message}`],
            status: '❌ ERROR'
        };
    }
}

function verifyAllFiles() {
    console.log('🔍 VERIFICACIÓN DE BRANDING Y COPYRIGHT\n');
    console.log('='.repeat(60));
    
    const results = [];
    const filesToCheck = [];
    
    // Obtener todos los archivos HTML y JS
    function getAllFiles(dir, fileList = []) {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
                getAllFiles(fullPath, fileList);
            } else if (item.endsWith('.html') || item.endsWith('.js')) {
                fileList.push(fullPath);
            }
        }
        
        return fileList;
    }
    
    const allFiles = getAllFiles(PUBLIC_DIR);
    
    // Verificar cada archivo
    for (const filePath of allFiles) {
        const relativePath = path.relative(PUBLIC_DIR, filePath);
        const result = verifyFile(filePath, relativePath);
        results.push(result);
        
        if (result.issues.length > 0) {
            console.log(`\n📄 ${result.file} - ${result.status}`);
            result.issues.forEach(issue => console.log(`   ${issue}`));
        }
    }
    
    // Resumen
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE VERIFICACIÓN');
    console.log('='.repeat(60));
    
    const okFiles = results.filter(r => r.status === '✅ OK').length;
    const issueFiles = results.filter(r => r.status !== '✅ OK').length;
    
    console.log(`✅ Archivos correctos: ${okFiles}`);
    console.log(`⚠️ Archivos con issues: ${issueFiles}`);
    console.log(`📈 Tasa de cumplimiento: ${((okFiles / results.length) * 100).toFixed(1)}%`);
    
    if (issueFiles > 0) {
        console.log('\n📋 ARCHIVOS QUE REQUIEREN ATENCIÓN:');
        results.filter(r => r.status !== '✅ OK').forEach(r => {
            console.log(`   • ${r.file}`);
        });
    } else {
        console.log('\n🎉 ¡Todos los archivos cumplen con los estándares de branding!');
    }
    
    // Verificar footer específico
    console.log('\n' + '='.repeat(60));
    console.log('🔍 VERIFICACIÓN ESPECÍFICA DE FOOTER');
    console.log('='.repeat(60));
    
    const footerFiles = allFiles.filter(file => {
        const content = fs.readFileSync(file, 'utf8');
        return content.includes('footer') || content.includes('main-footer');
    });
    
    console.log(`📄 Archivos con footer: ${footerFiles.length}`);
    
    for (const filePath of footerFiles) {
        const relativePath = path.relative(PUBLIC_DIR, filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        
        console.log(`\n🔍 ${relativePath}:`);
        
        if (content.includes('main-footer')) {
            console.log('   ✅ Usa clase main-footer');
        } else {
            console.log('   ⚠️ No usa clase main-footer');
        }
        
        if (content.includes(EXPECTED_AUTHOR)) {
            console.log('   ✅ Nombre del desarrollador correcto');
        }
        
        if (content.includes('Business Control')) {
            console.log('   ✅ Nombre del sistema correcto');
        }
    }
}

// Ejutar verificación
verifyAllFiles();
