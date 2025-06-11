const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronRecorderAPI', {
  writeChunk: (fileIdentifier, chunkBuffer) =>
    ipcRenderer.invoke('electron-recorder:write-chunk', fileIdentifier, chunkBuffer),
  finalizeFile: (fileIdentifier) =>
    ipcRenderer.invoke('electron-recorder:finalize-file', fileIdentifier)
});
