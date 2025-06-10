const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const url = require('node:url');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false, // Disable Node.js integration in renderer process for security
      contextIsolation: true // Enable context isolation for security
      // preload: path.join(__dirname, 'preload.js'), // Optional: if you need a preload script
    }
  });

  const viteDevServerUrl = 'http://127.0.0.1:3000'; // As per your vite.config.js

  if (app.isPackaged) {
    // In production, load the index.html from the root of the app package.
    // Vite's build output from 'docs/' will be copied to the app package root.
    const indexPath = path.join(__dirname, 'index.html');
    mainWindow.loadFile(indexPath);
  } else {
    // In development, load from the Vite dev server
    mainWindow.loadURL(viteDevServerUrl);
    // Open DevTools automatically in development
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', function () {
    // Dereference the window object
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
