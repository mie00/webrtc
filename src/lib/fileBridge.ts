import { writable, get } from 'svelte/store';
import { WebRTCApp } from './webrtc/WebRTCApp.js';
import { getDirectClient, getAllClientCids, getAllDirectClients } from '../stores/connectionStore.js'; // Adjust path if needed

// File transfer state interface
export interface FileTransfer {
  id: string;
  name: string;
  type: string;
  size: number;
  progress: number;
  status: 'sending' | 'receiving' | 'complete' | 'error';
  timestamp: number; // Added for sorting
  senderCid?: string; // Added: CID of the sender (for received files)
  senderName?: string; // Added: Display name of the sender (for received files)
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

// Helper function to parse max-message-size from SDP
function getMaxMessageSizeFromSdp(sdp: string): number | null {
    if (!sdp) return null;
    const match = sdp.match(/a=max-message-size:(\d+)/);
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    return null;
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
 * Set up file channel for a client
 */
export function setupFileChannel(app: App, cid: string): void { // app might be needed for global config
  const client = getDirectClient(cid);
  if (!client || !client.pc) {
      console.error(`Client or PeerConnection not found for CID ${cid} in setupFileChannel`);
      return;
  }
  const dc_file = client.pc.createDataChannel("file", {
    negotiated: true,
    id: 2
  });
  if (dc_file) {
    client.dc_file = dc_file; // Assign to client object from store

    dc_file.onmessage = (e: MessageEvent) => {
      // Re-fetch client in case state changed
      const currentClient = getDirectClient(cid);
      if (!currentClient) return; // Client might have disconnected

      // TODO: fix incomplete files in case of relay
      const clients = getAllDirectClients();
      for (const clientId in clients) {
        if (clientId !== cid && clients[clientId].dc && clients[clientId].dc.readyState === 'open') {
          try {
            clients[clientId].dc_file?.send(e.data);
          } catch (err) {
            console.error(`Failed to send chat message to ${clientId}:`, err);
          }
        }
      }

      if (!currentClient.file_stuff) {
        // First message contains file metadata
        const fileData = JSON.parse(e.data);
        const id = Math.random().toString(16).slice(2);

        currentClient.file_stuff = fileData;
        currentClient.file_stuff.segments = [];
        currentClient.file_stuff.remaining_size = fileData.size;
        currentClient.file_stuff.id = id;

        // Config is global now, not per-client in this structure
        // TODO: Need a way to get peer's name, perhaps via negotiation?
        const senderName = cid; // Use CID for now

        // Add to store with timestamp and sender info
        addFileTransfer({
          id,
          name: fileData.name,
          type: fileData.type,
          size: fileData.size,
          progress: fileData.size === 0 ? 100 : 0,
          status: 'receiving',
          timestamp: Date.now(), // Add timestamp on receive
          senderCid: cid,        // Add sender CID
          senderName: senderName // Add sender Name (or CID fallback)
        });
      }
      // Ensure file_stuff exists before proceeding
      if (!currentClient.file_stuff) return;

      if (e.data.byteLength || e.data.size) {
        // Subsequent messages contain file chunks
        currentClient.file_stuff.segments.push(e.data);
        currentClient.file_stuff.remaining_size -= e.data.byteLength || e.data.size;

        // Calculate progress
        const progress = currentClient.file_stuff.size === 0 ? 1 : ((currentClient.file_stuff.size - currentClient.file_stuff.remaining_size) / currentClient.file_stuff.size);
        const progressReadable = Math.min(100, Math.round((progress) * 100));
        // Update store
        updateFileTransfer(currentClient.file_stuff.id, {
          progress: progressReadable,
          status: 'receiving'
        });
      }
      // Check if file is complete
      if (currentClient.file_stuff.remaining_size === 0) {
        const blob = new Blob(currentClient.file_stuff.segments, { type: currentClient.file_stuff.type });
        const url = URL.createObjectURL(blob);

        // Update store
        updateFileTransfer(currentClient.file_stuff.id, {
          progress: 100,
          status: 'complete',
          url
        });

        // Reset file_stuff
        currentClient.file_stuff = null;
      }
    };
  }
}

/**
 * Send a file to all connected clients and wait for all transfers to settle.
 */
export async function sendFile(file: File): Promise<void> { // Make async
  // const app = window.app; // No longer need app object directly here
  const transferId = Math.random().toString(16).slice(2); // Use a more descriptive name

  // Create a URL for the sender to view/download their own file
  const fileURL = URL.createObjectURL(file);

  // Add to store immediately with 'sending' status and the local URL
  addFileTransfer({
    id: transferId,
    name: file.name,
    type: file.type,
    size: file.size,
    progress: 0,
    status: 'sending',
    url: fileURL, // Store URL for the sender
    timestamp: Date.now() // Add timestamp on creation
  });

  // Removed legacy DOM injection

  const readFilePromises: Promise<void>[] = [];
  // Send to all connected clients (from store) and collect promises
  for (const cid of getAllClientCids()) {
    const client = getDirectClient(cid);
    // Only attempt to send if a file channel exists and is open for the client
    if (client?.dc_file && client.dc_file.readyState === 'open') {
        readFilePromises.push(readFile(file, cid, transferId));
    } else {
        console.warn(`Skipping file send to client ${cid}: File data channel not available or not open.`);
    }
  }

  // Wait for all readFile operations to settle (complete or fail)
  const results = await Promise.allSettled(readFilePromises);

  // Check results to determine final status
  const failedTransfers = results.filter(result => result.status === 'rejected');

  if (failedTransfers.length > 0) {
    // If any transfer failed, mark the overall status as error
    console.error(`File transfer ${transferId} failed for some clients:`, failedTransfers);
    const errorMessages = failedTransfers
        .map(result => (result as PromiseRejectedResult).reason?.message || 'Unknown error')
        .join(', ');
    updateFileTransfer(transferId, { status: 'error', error: `Failed for ${failedTransfers.length} client(s): ${errorMessages}` });
  } else if (readFilePromises.length > 0) {
    // If all transfers succeeded (and there was at least one attempt), mark as complete
    console.log(`File transfer ${transferId} completed successfully for all clients.`);
    updateFileTransfer(transferId, { progress: 100, status: 'complete' }); // Ensure progress is 100
  } else {
    // If no clients had a file channel, mark as error or handle differently?
    console.warn(`File transfer ${transferId}: No clients to send to.`);
    updateFileTransfer(transferId, { status: 'error', error: 'No connected clients with file channel.' });
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
  // const app = window.app; // No longer need app object directly here
  const client = getDirectClient(cid);
  const dc_file = client?.dc_file;

  if (!dc_file) {
    console.error(`File data channel not found for client ${cid} in readFile`);
    updateFileTransfer(id, { status: 'error', error: 'Data channel not available' });
    return;
  }

  // --- Configuration ---
  const DEFAULT_SEND_CHUNK_SIZE = 16 * 1024;    // 16KB default
  const MAX_SEND_CHUNK_SIZE = 1 * 1024 * 1024;      // Cap at 1MB for safety/performance
  const DEFAULT_READ_CHUNK_SIZE = 1 * 1024 * 1024; // Read 1MB chunks from the file
  const HIGH_WATER_MARK = 0.125 * 1024 * 1024;    // Pause sending if buffered amount exceeds 1MB (tune as needed)

  // Determine dynamic SEND_CHUNK_SIZE based on SDP
  let SEND_CHUNK_SIZE = DEFAULT_SEND_CHUNK_SIZE;
  const pc = client?.pc; // Use pc from the retrieved client
  if (pc && pc.localDescription && pc.remoteDescription) {
      const localMax = getMaxMessageSizeFromSdp(pc.localDescription.sdp);
      const remoteMax = getMaxMessageSizeFromSdp(pc.remoteDescription.sdp);

      // Use the minimum of the two, if available, otherwise keep default Infinity
      const effectiveMax = Math.min(localMax ?? Infinity, remoteMax ?? Infinity);

      if (effectiveMax !== Infinity && effectiveMax > 0) {
          // Use the effective max, but cap it at MAX_SEND_CHUNK_SIZE
          SEND_CHUNK_SIZE = Math.min(effectiveMax, MAX_SEND_CHUNK_SIZE);
          console.log(`Using dynamic SEND_CHUNK_SIZE: ${SEND_CHUNK_SIZE} bytes (based on SDP max: ${effectiveMax})`);
      } else {
           console.log(`Using default SEND_CHUNK_SIZE: ${SEND_CHUNK_SIZE} bytes (SDP max-message-size not found or invalid)`);
      }
  } else {
       console.log(`Using default SEND_CHUNK_SIZE: ${SEND_CHUNK_SIZE} bytes (SDP not available)`);
  }

  // Keep READ_CHUNK_SIZE fixed for now
  const READ_CHUNK_SIZE = DEFAULT_READ_CHUNK_SIZE;

  let offset = 0;
  let totalBytesSent = 0; // Track total bytes *sent* (or queued)

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
        // Flow control: Wait if buffer is too full *before* sending the next small chunk
        while (dc_file.bufferedAmount > HIGH_WATER_MARK) {
            dc_file.bufferedAmountLowThreshold = HIGH_WATER_MARK / 2;
            // console.log(`Pre-send buffer full (${dc_file.bufferedAmount}), waiting...`);
            await waitForBufferDrain(dc_file);
            // console.log(`Pre-send buffer drained (${dc_file.bufferedAmount}), proceeding to send...`);
        }

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

       // Optional: Yield to the event loop occasionally for very large files/chunks
       // await new Promise(resolve => setTimeout(resolve, 0));
    }

    // 3. Final progress update and completion status
    // Ensure buffer is reasonably drained before marking as complete
    while (dc_file.bufferedAmount > 0) {
        // console.log(`Final drain: Buffer has (${dc_file.bufferedAmount}), waiting...`);
        // Use a low threshold for the final drain
        dc_file.bufferedAmountLowThreshold = 0;
        await waitForBufferDrain(dc_file);
        // console.log(`Final drain: Buffer drained (${dc_file.bufferedAmount}), checking again...`);
    }

    // Final status update ('complete') is now handled by sendFile after Promise.allSettled
    console.log(`readFile finished for ${file.name} to ${cid}`);
    // Removed: updateFileTransfer(id, { progress: 100, status: 'complete' });

    // Removed legacy DOM update

  } catch (error) {
    // Error status update is now handled by sendFile after Promise.allSettled
    console.error(`Error sending file ${file.name} to ${cid}:`, error);
    // Removed: updateFileTransfer(id, { status: 'error', error: errorMessage });

    // Removed legacy DOM update
    // Ensure input is re-enabled even if error is caught within the loop

    // Re-throw the error so Promise.allSettled catches it as rejected
    throw error;
  }
}
