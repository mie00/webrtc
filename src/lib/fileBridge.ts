import { writable, get } from 'svelte/store';
import { WebRTCApp } from './webrtc/WebRTCApp.js';

// File transfer state interface
export interface FileTransfer {
  id: string;
  name: string;
  type: string;
  size: number;
  progress: number;
  status: 'sending' | 'receiving' | 'complete' | 'error';
  url?: string;
  error?: string;
}

export interface FileState {
  transfers: Record<string, FileTransfer>;
}

// Initial state
const initialState: FileState = {
  transfers: {}
};

function updateProgressBar(id: string, file_size: number, get_ready: () => number): void {
  const bufferedAmount = get_ready();

  // Calculate progress percentage (0 to 100)
  const progressPercentage = (file_size - bufferedAmount) / file_size * 100;
  const elem = document.getElementById(`file-${id}`) as HTMLProgressElement;
  if (elem) {
      elem.value = progressPercentage;
      elem.innerHTML = `${progressPercentage}%`;
  }
}
function splitArrayBuffer(arrayBuffer: ArrayBuffer, chunkSize: number): ArrayBuffer[] {
  const uint8Array = new Uint8Array(arrayBuffer);
  const chunks: ArrayBuffer[] = [];
  let offset = 0;

  while (offset < uint8Array.length) {
      const chunk = uint8Array.slice(offset, offset + chunkSize);
      chunks.push(chunk.buffer);  // Push the ArrayBuffer of the chunk
      offset += chunkSize;
  }

  return chunks;
}

// Create the store
export const fileStore = writable<FileState>(initialState);

// Helper functions
export function getFileState() {
  return get(fileStore);
}

export function addFileTransfer(transfer: FileTransfer): void {
  fileStore.update(state => {
    const transfers = { ...state.transfers };
    transfers[transfer.id] = transfer;
    return { ...state, transfers };
  });
}

export function updateFileTransfer(id: string, updates: Partial<FileTransfer>): void {
  fileStore.update(state => {
    if (!state.transfers[id]) return state;

    const transfers = { ...state.transfers };
    transfers[id] = {
      ...transfers[id],
      ...updates
    };
    return { ...state, transfers };
  });
}

export function removeFileTransfer(id: string): void {
  fileStore.update(state => {
    const transfers = { ...state.transfers };
    delete transfers[id];
    return { ...state, transfers };
  });
}

/**
 * Initialize the file module with the app object
 */
export function fileInit(app: App): void {
  // Set up a subscription to sync store changes with DOM
  fileStore.subscribe(state => {
    // Update UI based on file transfers
    Object.entries(state.transfers).forEach(([id, transfer]) => {
      const progressElem = document.getElementById(`file-${id}`) as HTMLProgressElement;
      if (progressElem) {
        progressElem.value = transfer.progress;
        progressElem.innerHTML = `${transfer.progress}%`;
      }

      if (transfer.status === 'complete' && transfer.url) {
        const fileElement = document.getElementById(`f-${id}`);
        if (fileElement && !document.getElementById(`download-${id}`)) {
          fileElement.innerHTML = `
            <a id="download-${id}" class="w-full py-2 px-4 bg-blue-500 text-white rounded shadow hover:bg-blue-700">Download</a>
            <a id="view-${id}" class="w-full py-2 px-4 bg-blue-500 text-white rounded shadow hover:bg-blue-700" target="_blank">View</a>`;

          const downloadLink = document.getElementById(`download-${id}`) as HTMLAnchorElement;
          if (downloadLink) {
            downloadLink.href = transfer.url;
            downloadLink.download = transfer.name;
          }

          const viewLink = document.getElementById(`view-${id}`) as HTMLAnchorElement;
          if (viewLink) {
            viewLink.href = transfer.url;
          }
        }
      } else if (transfer.status === 'error') {
        const fileElement = document.getElementById(`f-${id}`);
        if (fileElement) {
          fileElement.innerHTML = `Error: ${transfer.error || 'Unknown error'}`;
        }
      }
    });
  });
}

/**
 * Set up file channel for a client
 */
export function setupFileChannel(app: App, cid: string): void {
  const dc_file = app.clients[cid].pc?.createDataChannel("file", {
    negotiated: true,
    id: 2
  });
  if (dc_file) {
    app.clients[cid].dc_file = dc_file;

    dc_file.onmessage = (e: MessageEvent) => {
      if (!app.clients[cid].file_stuff) {
        // First message contains file metadata
        const fileData = JSON.parse(e.data);
        const id = Math.random().toString(16).slice(2);

        app.clients[cid].file_stuff = fileData;
        app.clients[cid].file_stuff.segments = [];
        app.clients[cid].file_stuff.remaining_size = fileData.size;
        app.clients[cid].file_stuff.id = id;

        // Add to store
        addFileTransfer({
          id,
          name: fileData.name,
          type: fileData.type,
          size: fileData.size,
          progress: 0,
          status: 'receiving'
        });

        // Add to DOM for backward compatibility
        WebRTCApp.log(`> <label for="file-${id}">${fileData.name}</label> <span id="f-${id}"><progress id="file-${id}" value="0" max="100"> 0% </progress></span>`);
        return;
      }

      // Subsequent messages contain file chunks
      app.clients[cid].file_stuff.segments.push(e.data);
      app.clients[cid].file_stuff.remaining_size -= e.data.byteLength || e.data.size;

      // Calculate progress
      const progress = ((app.clients[cid].file_stuff.size - app.clients[cid].file_stuff.remaining_size) / app.clients[cid].file_stuff.size) * 100;

      // Update store
      updateFileTransfer(app.clients[cid].file_stuff.id, {
        progress,
        status: 'receiving'
      });

      // Update progress bar for backward compatibility
      updateProgressBar(app.clients[cid].file_stuff.id, app.clients[cid].file_stuff.size, () => app.clients[cid].file_stuff.remaining_size);

      // Check if file is complete
      if (app.clients[cid].file_stuff.remaining_size === 0) {
        const blob = new Blob(app.clients[cid].file_stuff.segments, { type: app.clients[cid].file_stuff.type });
        const url = URL.createObjectURL(blob);

        // Update store
        updateFileTransfer(app.clients[cid].file_stuff.id, {
          progress: 100,
          status: 'complete',
          url
        });

        // Reset file_stuff
        app.clients[cid].file_stuff = null;
      }
    };
  }
}

/**
 * Send a file to all connected clients
 */
export function sendFile(file: File): void {
  const app = window.app;
  const id = Math.random().toString(16).slice(2);

  // Add to store
  addFileTransfer({
    id,
    name: file.name,
    type: file.type,
    size: file.size,
    progress: 0,
    status: 'sending'
  });

  // Add to DOM for backward compatibility
  WebRTCApp.log(`<label for="file-${id}">${file.name}</label> <span id="f-${id}"><progress id="file-${id}" value="0" max="100"> 0% </progress></span>`);

  // Send to all connected clients
  for (const cid of Object.keys(app.clients)) {
    readFile(file, cid, id);
  }
}

// Helper function to read a slice as ArrayBuffer using FileReader wrapped in a Promise
function readFileSliceAsArrayBuffer(slice: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        resolve(event.target.result as ArrayBuffer);
      } else {
        reject(new Error("Failed to read file slice."));
      }
    };
    reader.onerror = (event) => {
      reject(reader.error || new Error("FileReader error"));
    };
    reader.readAsArrayBuffer(slice);
  });
}

// Helper function to wait until the buffer amount is below a threshold
async function waitForBufferDrain(dc: RTCDataChannel, threshold: number): Promise<void> {
    // If buffer is already low, resolve immediately
    if (dc.bufferedAmount < threshold) {
        return;
    }
    // Otherwise, return a promise that resolves when bufferedamountlow fires
    return new Promise((resolve) => {
        const listener = () => {
            if (dc.bufferedAmount < threshold) {
                dc.removeEventListener("bufferedamountlow", listener);
                resolve();
            }
        };
        // Add listener only if buffer isn't already low
        if (dc.bufferedAmount >= threshold) {
            dc.addEventListener("bufferedamountlow", listener);
        } else {
            resolve(); // Resolve immediately if condition met before listener attached
        }
    });
}

/**
 * Read and send a file to a specific client (Rewritten Version)
 */
async function readFile(file: File, cid: string, id: string): Promise<void> {
  let offset = 0;
  const max_size = 2 * 1024 * 1024;
  const app = window.app;

  app.clients[cid].dc_file?.send(JSON.stringify({ name: file.name, type: file.type, size: file.size }));

  const reader = new FileReader();
  reader.onload = function (event: ProgressEvent<FileReader>) {
    if (!event.target?.result) return;

    const result = event.target.result as ArrayBuffer;
    for (const chunk of splitArrayBuffer(result, 128 * 1024)) {
      app.clients[cid].dc_file?.send(chunk);
    }

    if (app.file_progress_interval) {
      clearInterval(app.file_progress_interval);
      app.file_progress_interval = undefined;
    }

    app.file_progress_interval = window.setInterval(() => {
      const getRemaining = () => ((app.clients[cid].dc_file?.bufferedAmount || 0) + (file.size - Math.min(offset, file.size)));
      const progress = ((file.size - getRemaining()) / file.size) * 100;

      // Update store
      updateFileTransfer(id, {
        progress,
        status: 'sending'
      });

      // Update progress bar for backward compatibility
      updateProgressBar(id, file.size, getRemaining);

      if (getRemaining() === 0) {
        if (app.file_progress_interval) {
          clearInterval(app.file_progress_interval);
          app.file_progress_interval = undefined;
        }

        // Update store
        updateFileTransfer(id, {
          progress: 100,
          status: 'complete'
        });

        // Update DOM for backward compatibility
        const fileElement = document.getElementById(`f-${id}`);
        if (fileElement) {
          fileElement.innerHTML = "Sent";
        }
      }
    }, 100);
  };

  const buffer_cb = () => {
    reader.readAsArrayBuffer(file.slice(offset, offset + max_size));
    offset += max_size;
    if (offset > file.size) {
      app.clients[cid].dc_file?.removeEventListener("bufferedamountlow", buffer_cb);
      const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
      if (fileUpload) {
        fileUpload.disabled = false;
      }
    }
  };

  if (file.size > max_size) {
    const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
    if (fileUpload) {
      fileUpload.disabled = true;
    }
    app.clients[cid].dc_file?.addEventListener("bufferedamountlow", buffer_cb);
  }

  reader.readAsArrayBuffer(file.slice(offset, offset + max_size));
  offset += max_size;
}
