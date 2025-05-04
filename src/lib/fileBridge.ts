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

// Removed updateProgressBar function

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

export function fileInit(app: App): void {
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

        // Removed legacy DOM injection: WebRTCApp.log(...)
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

      // Removed legacy progress bar update: updateProgressBar(...)

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

  // Removed legacy DOM injection: WebRTCApp.log(...)

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

// Helper function to wait for the bufferedamountlow event
async function waitForBufferDrain(dc: RTCDataChannel): Promise<void> {
    // Return a promise that resolves when bufferedamountlow fires
    return new Promise((resolve) => {
        const listener = () => {
            dc.removeEventListener("bufferedamountlow", listener);
            resolve();
        };
        // Always add the listener; the calling loop checks the condition
        dc.addEventListener("bufferedamountlow", listener);
    });
}

async function readFile(file: File, cid: string, id: string): Promise<void> {
  const app = window.app;
  const dc_file = app.clients[cid]?.dc_file;

  if (!dc_file) {
    console.error(`File data channel not found for client ${cid}`);
    updateFileTransfer(id, { status: 'error', error: 'Data channel not available' });
    return;
  }

  // --- Configuration ---
  const READ_CHUNK_SIZE = 1 * 1024 * 1024; // Read 1MB chunks from the file
  const SEND_CHUNK_SIZE = 16 * 1024;      // Send 16KB chunks over WebRTC
  const HIGH_WATER_MARK = 16 * 1024 * 1024; // Pause sending if buffered amount exceeds 16MB

  let offset = 0;
  let totalBytesSent = 0; // Track total bytes *sent* (or queued)

  // Disable file input during transfer
  const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
  if (fileUpload) {
    fileUpload.disabled = true;
  }

  try {
    console.log(`Starting file transfer: ${file.name} (${file.size} bytes) to ${cid}`);

    // 1. Send metadata
    dc_file.send(JSON.stringify({ name: file.name, type: file.type, size: file.size }));

    // 2. Read and send file in chunks
    while (offset < file.size) {
      const slice = file.slice(offset, offset + READ_CHUNK_SIZE);
      const chunkBuffer = await readFileSliceAsArrayBuffer(slice);
      offset += chunkBuffer.byteLength; // Update offset based on actual bytes read

      const smallChunks = splitArrayBuffer(chunkBuffer, SEND_CHUNK_SIZE);

      for (const smallChunk of smallChunks) {
        // Removed the pre-send buffer check loop

        // Send the small chunk
        try {
            dc_file.send(smallChunk);
            totalBytesSent += smallChunk.byteLength;
        } catch (error) {
             console.error(`Error sending chunk for file ${file.name} to ${cid}:`, error);
             const errorMessage = error instanceof Error ? error.message : String(error);
             updateFileTransfer(id, { status: 'error', error: `Send error: ${errorMessage}` });
             // Stop the transfer for this client by re-throwing
             throw error;
        }


        // Update progress (more frequently)
        const progress = Math.min(100, Math.round((totalBytesSent / file.size) * 100));
        updateFileTransfer(id, { progress, status: 'sending' });

        // Removed legacy progress bar update: updateProgressBar(...)
      }

      // Flow control: After sending all small chunks from the large chunk,
      // wait if the buffer is still full before reading the *next* large chunk.
      while (dc_file.bufferedAmount > HIGH_WATER_MARK) {
          dc_file.bufferedAmountLowThreshold = HIGH_WATER_MARK / 2;
          // console.log(`Post-chunk buffer full (${dc_file.bufferedAmount}), waiting before next read...`);
          await waitForBufferDrain(dc_file);
          // console.log(`Post-chunk buffer drained (${dc_file.bufferedAmount}), proceeding to next read...`);
      }

       // Optional: Yield to the event loop occasionally for very large files/chunks
       // await new Promise(resolve => setTimeout(resolve, 0));
    }

    // 3. Final progress update and completion status
    // Ensure buffer is reasonably drained before marking as complete
    while (dc_file.bufferedAmount > 0) {
        // console.log(`Final drain: Buffer has (${dc_file.bufferedAmount}), waiting...`);
        // Use a low threshold for the final drain
        dc_file.bufferedAmountLowThreshold = SEND_CHUNK_SIZE;
        await waitForBufferDrain(dc_file);
        // console.log(`Final drain: Buffer drained (${dc_file.bufferedAmount}), checking again...`);
    }


    console.log(`File transfer complete: ${file.name} to ${cid}`);
    updateFileTransfer(id, { progress: 100, status: 'complete' });

    // Removed legacy DOM update

  } catch (error) {
    console.error(`Error sending file ${file.name} to ${cid}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    updateFileTransfer(id, { status: 'error', error: errorMessage });

    // Removed legacy DOM update
    // Ensure input is re-enabled even if error is caught within the loop
    if (fileUpload) {
      fileUpload.disabled = false;
    }
  } finally {
    // Re-enable file input (redundant if error caught, but safe)
    if (fileUpload && !fileUpload.disabled) { // Check if already enabled
      fileUpload.disabled = false;
    }
    // Note: No interval to clear in this version.
    // The bufferedamountlow listener in waitForBufferDrain removes itself.
  }
}
