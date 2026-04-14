const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');

console.log('Iniciando reorganización del proyecto...');

// 1. Crear carpeta public si no existe
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir);
    console.log('✅ Carpeta "public" creada.');
}

// 2. Mover carpetas de recursos (css, js, scripts, images)
const foldersToMove = ['css', 'js', 'scripts', 'images'];

foldersToMove.forEach(folder => {
    const srcPath = path.join(rootDir, folder);
    const destPath = path.join(publicDir, folder);
    
    if (fs.existsSync(srcPath)) {
        // Si la carpeta destino no existe, movemos la carpeta entera
        if (!fs.existsSync(destPath)) {
            fs.renameSync(srcPath, destPath);
            console.log(`✅ Carpeta "${folder}" movida a public/${folder}`);
        } else {
            // Si ya existe (ej. public/js), movemos el contenido
            console.log(`ℹ️ La carpeta public/${folder} ya existe, fusionando contenido...`);
            fs.readdirSync(srcPath).forEach(file => {
                const srcFile = path.join(srcPath, file);
                const destFile = path.join(destPath, file);
                // Solo mover si no existe en destino para evitar sobrescribir archivos más nuevos
                if (!fs.existsSync(destFile)) {
                    fs.renameSync(srcFile, destFile);
                    console.log(`   -> Archivo ${file} movido.`);
                }
            });
            // Intentar borrar la carpeta origen si quedó vacía
            try { fs.rmdirSync(srcPath); } catch(e) {}
        }
    }
});

// 3. Mover todos los archivos .html
fs.readdirSync(rootDir).forEach(file => {
    if (path.extname(file) === '.html') {
        const srcPath = path.join(rootDir, file);
        const destPath = path.join(publicDir, file);
        fs.renameSync(srcPath, destPath);
        console.log(`✅ Archivo HTML "${file}" movido a public/`);
    }
});

// 4. Mover archivos JS sueltos de la raíz a public/js
const jsFilesToMove = ['ventas.js', 'addInventory.js', 'reportes.js', 'index.js', 'utils.js', 'clientes.js', 'addSale.js', 'login.js', 'register.js', 'dashboard.js', 'addClient.js', 'inventario.js', 'editInventory.js', 'editClient.js', 'cupones.js', 'configuracion.js', 'perfil.js', 'usuarios.js'];
const jsDir = path.join(publicDir, 'js');
if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir);

jsFilesToMove.forEach(file => {
    const srcPath = path.join(rootDir, file);
    const destPath = path.join(jsDir, file);

    if (fs.existsSync(srcPath)) {
        // PRIORIDAD: Si existe en la raíz, asumimos que es la versión más reciente editada.
        // Si ya existe en destino, lo borramos para poner el nuevo.
        if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
            console.log(`♻️ Actualizando public/js/${file} con la versión más reciente de la raíz.`);
        }
        fs.renameSync(srcPath, destPath);
        console.log(`✅ JS Raíz "${file}" movido a public/js/`);
    }
});

console.log('\n🎉 Organización completada.');
console.log('Ahora tu servidor servirá los archivos desde la carpeta "public".');
