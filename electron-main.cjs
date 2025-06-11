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
const activeFileStreams = new Map(); // Stores { handle, filePath, pendingWrites, finalizeRequested }

async function closeAndRemoveStream(fileIdentifier) {
  const streamData = activeFileStreams.get(fileIdentifier);
  if (streamData) {
    try {
      await streamData.handle.close();
      console.log(`Successfully closed and finalized recording: ${streamData.filePath}`);
    } catch (closeError) {
      console.error(
        `Error closing file handle for ${fileIdentifier} (${streamData.filePath}) during finalization:`,
        closeError
      );
    }
    activeFileStreams.delete(fileIdentifier);
  }
}

ipcMain.handle('electron-recorder:write-chunk', async (event, fileIdentifier, chunkBuffer) => {
  let streamData = activeFileStreams.get(fileIdentifier);

  try {
    if (!streamData) {
      const recordingsPath = app.getPath('videos');
      await fs.mkdir(recordingsPath, { recursive: true }); // Ensure directory exists
      const filePath = path.join(recordingsPath, `${fileIdentifier}.webm`);
      const handle = await fs.open(filePath, 'a');
      streamData = { handle, filePath, pendingWrites: 0, finalizeRequested: false };
      activeFileStreams.set(fileIdentifier, streamData);
    }

    streamData.pendingWrites++;
    await streamData.handle.appendFile(Buffer.from(chunkBuffer));
    return true;
  } catch (error) {
    console.error(
      `Error processing chunk for ${fileIdentifier}${streamData ? ' (' + streamData.filePath + ')' : ''}:`,
      error
    );
    return false;
  } finally {
    if (streamData) {
      streamData.pendingWrites--;
      if (streamData.pendingWrites < 0) {
        // This should ideally not happen with correct logic
        console.warn(`Pending writes for ${fileIdentifier} went negative.`);
        streamData.pendingWrites = 0;
      }
      if (streamData.pendingWrites === 0 && streamData.finalizeRequested) {
        await closeAndRemoveStream(fileIdentifier);
      }
    }
  }
});

ipcMain.handle('electron-recorder:finalize-file', async (event, fileIdentifier) => {
  const streamData = activeFileStreams.get(fileIdentifier);

  if (!streamData) {
    console.warn(
      `Finalize request for unknown or already finalized file: ${fileIdentifier}. This might happen if no data was ever sent.`
    );
    return false; // Or true, as it's effectively "finalized" by not existing
  }

  streamData.finalizeRequested = true;

  if (streamData.pendingWrites === 0) {
    await closeAndRemoveStream(fileIdentifier);
    return true;
  } else {
    console.log(
      `File finalize requested for ${fileIdentifier} (${streamData.filePath}), but ${streamData.pendingWrites} write(s) are pending. Will finalize when writes complete.`
    );
    return true; // Optimistically true, as it will be finalized eventually
  }
});
