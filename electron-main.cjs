const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs').promises;
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
      contextIsolation: true, // Enable context isolation for security
      preload: path.join(__dirname, 'electron-preload.js') // Load the preload script
    }
  });

  const viteDevServerUrl = 'http://127.0.0.1:3000'; // As per your vite.config.js

  if (app.isPackaged) {
    // In production, load the remote URL.
    mainWindow.loadURL('https://webrtc.mie00.com');
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

// Electron recording IPC handlers
const activeFileStreams = new Map();

ipcMain.handle('electron-recorder:write-chunk', async (event, fileIdentifier, chunkBuffer) => {
  try {
    const recordingsPath = app.getPath('videos');
    await fs.mkdir(recordingsPath, { recursive: true }); // Ensure directory exists
    const filePath = path.join(recordingsPath, `${fileIdentifier}.webm`);

    if (!activeFileStreams.has(fileIdentifier)) {
      // First chunk, open file for appending
      const fileHandle = await fs.open(filePath, 'a');
      activeFileStreams.set(fileIdentifier, fileHandle);
    }

    const fileHandle = activeFileStreams.get(fileIdentifier);
    if (fileHandle) {
      await fileHandle.appendFile(Buffer.from(chunkBuffer));
    } else {
      console.error(`File handle not found for ${fileIdentifier}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Error writing chunk for ${fileIdentifier}:`, error);
    // Attempt to close the handle if it exists on error
    if (activeFileStreams.has(fileIdentifier)) {
      try {
        await activeFileStreams.get(fileIdentifier).close();
      } catch (closeError) {
        console.error(`Error closing file handle for ${fileIdentifier} after write error:`, closeError);
      }
      activeFileStreams.delete(fileIdentifier);
    }
    return false;
  }
});

ipcMain.handle('electron-recorder:finalize-file', async (event, fileIdentifier) => {
  try {
    if (activeFileStreams.has(fileIdentifier)) {
      const fileHandle = activeFileStreams.get(fileIdentifier);
      await fileHandle.close();
      activeFileStreams.delete(fileIdentifier);
      console.log(`Finalized recording: ${fileIdentifier}.webm`);
      return true;
    }
    console.warn(`No active file stream to finalize for ${fileIdentifier}`);
    return false;
  } catch (error) {
    console.error(`Error finalizing file ${fileIdentifier}:`, error);
    // Ensure it's removed from map even if close fails
    if (activeFileStreams.has(fileIdentifier)) {
      activeFileStreams.delete(fileIdentifier);
    }
    return false;
  }
});
