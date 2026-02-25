const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  // Crear la ventana del navegador.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false, // Deshabilitar integración de Node.js en el renderizador
      contextIsolation: true, // Habilitar aislamiento de contexto
      preload: path.join(__dirname, 'preload.js') // Archivo preload para seguridad
    }
  });

  // Cargar el index.html de tu aplicación web.
  // Ajuste: subir un nivel (..) porque este archivo está en /routes
  mainWindow.loadFile(path.join(__dirname, '../public', 'index.html'));

  // Abrir las herramientas de desarrollo (opcional).
  // mainWindow.webContents.openDevTools()
}

// Este método se llama cuando Electron ha terminado
// la inicialización y está listo para crear ventanas del navegador.
// Algunas APIs solo pueden usarse después de que este evento ocurra.
app.whenReady().then(createWindow);

// Quit cuando todas las ventanas estén cerradas, excepto en macOS. En macOS, es común
// que las aplicaciones y su barra de menú permanezcan activas hasta que el usuario salga
// explícitamente con Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // En macOS, es común recrear una ventana en la aplicación cuando el icono del dock es
  // clickeado y no hay otras ventanas abiertas.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.