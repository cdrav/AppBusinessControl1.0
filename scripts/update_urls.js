const fs = require('fs');
const path = require('path');

// Carpeta donde están los scripts del frontend
const jsDir = path.join(__dirname, 'public', 'js');

console.log('🔄 Iniciando actualización de API_URL en archivos JS...');

if (fs.existsSync(jsDir)) {
    const files = fs.readdirSync(jsDir);

    files.forEach(file => {
        if (path.extname(file) === '.js') {
            const filePath = path.join(jsDir, file);
            let content = fs.readFileSync(filePath, 'utf8');

            // Busca cualquier definición de API_URL con comillas simples o dobles
            const regex = /(const|let)\s+API_URL\s*=\s*['"`].*['"`];/g;

            if (regex.test(content)) {
                const newContent = content.replace(regex, "const API_URL = '';");
                if (content !== newContent) {
                    fs.writeFileSync(filePath, newContent, 'utf8');
                    console.log(`✅ Actualizado: ${file}`);
                } else {
                    console.log(`👌 Ya estaba listo: ${file}`);
                }
            }
        }
    });
    console.log('\n✨ Proceso completado. Todas las URLs ahora son relativas.');
} else {
    console.error('❌ No se encontró la carpeta public/js');
}