import {
  getDirectClient,
  getAllClientCids,
  getAllDirectClients
} from '../../stores/connectionStore';
import { addFileTransfer, updateFileTransfer } from '../../stores/fileStore';
import { splitArrayBuffer, getMaxMessageSizeFromSdp } from '../../utils/fileUtils';

/**
 * Set up file channel for a client
 */
export function setupFileChannel(cid: string): void {
  const client = getDirectClient(cid);
  if (!client || !client.pc) {
    console.error(`Client or PeerConnection not found for CID ${cid} in setupFileChannel`);
    return;
  }
  const dc_file = client.pc.createDataChannel('file', {
    negotiated: true,
    id: 2
  });
  if (dc_file) {
    client.dc_file = dc_file;

    dc_file.onmessage = (e: MessageEvent) => {
      const currentClient = getDirectClient(cid);
      if (!currentClient) return;

      // Forward message to other clients
      const clients = getAllDirectClients();
      for (const clientId in clients) {
        if (
          clientId !== cid &&
          clients[clientId].dc_file && // Corrected: check dc_file
          clients[clientId].dc_file!.readyState === 'open'
        ) {
          try {
            clients[clientId].dc_file!.send(e.data);
          } catch (err) {
            console.error(`Failed to forward file message to ${clientId}:`, err);
          }
        }
      }

      // Handle incoming message for this client
      if (typeof e.data === 'string' && !currentClient.file_stuff) {
        // Metadata message
        const metadata = JSON.parse(e.data) as { name: string; type: string; size: number };
        const transferId = Math.random().toString(16).slice(2);

        currentClient.file_stuff = {
          fileName: metadata.name,
          fileType: metadata.type,
          fileSize: metadata.size,
          transferId: transferId,
          senderCid: cid,
          receiverCid: '',
          chunks: [],
          receivedSize: 0
        };

        addFileTransfer({
          id: transferId,
          name: metadata.name,
          type: metadata.type,
          size: metadata.size,
          progress: metadata.size === 0 ? 100 : 0,
          status: 'receiving',
          timestamp: Date.now(),
          senderCid: cid
        });

        if (metadata.size === 0) {
          // Handle empty file completion
          updateFileTransfer(transferId, {
            progress: 100,
            status: 'complete',
            url: undefined
          });
          currentClient.file_stuff = undefined; // Reset
        }
      } else if (
        currentClient.file_stuff &&
        (e.data instanceof ArrayBuffer || e.data instanceof Blob)
      ) {
        // Data chunk
        const fileData = currentClient.file_stuff;
        const chunkSize =
          e.data instanceof ArrayBuffer
            ? e.data.byteLength
            : e.data instanceof Blob
              ? e.data.size
              : 0;

        if (chunkSize > 0) {
          fileData.chunks.push(e.data as ArrayBuffer | Blob);
          fileData.receivedSize += chunkSize;

          const progress = fileData.fileSize === 0 ? 1 : fileData.receivedSize / fileData.fileSize;
          const progressReadable = Math.min(100, Math.round(progress * 100));

          updateFileTransfer(fileData.transferId, {
            progress: progressReadable,
            status: 'receiving'
          });
        }

        if (fileData.receivedSize >= fileData.fileSize) {
          if (fileData.fileSize > 0) {
            const blob = new Blob(fileData.chunks, { type: fileData.fileType });
            const url = URL.createObjectURL(blob);
            fileData.blobUrl = url;

            updateFileTransfer(fileData.transferId, {
              progress: 100,
              status: 'complete',
              url
            });
          } // Empty file already handled
          currentClient.file_stuff = undefined; // Reset
        }
      } else if (typeof e.data === 'string' && currentClient.file_stuff) {
        console.warn(
          `Received unexpected string message for client ${cid} after file metadata:`,
          e.data
        );
      } else {
        console.warn(
          `Received unexpected file data message for client ${cid}:`,
          e.data,
          'currentClient.file_stuff:',
          currentClient.file_stuff
        );
      }
    };
  }
}

export async function sendFile(file: File): Promise<void> {
  const transferId = Math.random().toString(16).slice(2);
  const fileURL = URL.createObjectURL(file);

  addFileTransfer({
    id: transferId,
    name: file.name,
    type: file.type,
    size: file.size,
    progress: 0,
    status: 'sending',
    url: fileURL,
    timestamp: Date.now()
  });

  const readFilePromises: Promise<void>[] = [];
  for (const cid of getAllClientCids()) {
    const client = getDirectClient(cid);
    if (client?.dc_file && client.dc_file.readyState === 'open') {
      readFilePromises.push(readFile(file, cid, transferId));
    } else {
      console.warn(
        `Skipping file send to client ${cid}: File data channel not available or not open.`
      );
    }
  }

  const results = await Promise.allSettled(readFilePromises);
  const failedTransfers = results.filter((result) => result.status === 'rejected');

  if (failedTransfers.length > 0) {
    console.error(`File transfer ${transferId} failed for some clients:`, failedTransfers);
    const errorMessages = failedTransfers
      .map((result) => (result as PromiseRejectedResult).reason?.message || 'Unknown error')
      .join(', ');
    updateFileTransfer(transferId, {
      status: 'error',
      error: `Failed for ${failedTransfers.length} client(s): ${errorMessages}`
    });
  } else if (readFilePromises.length > 0) {
    console.log(`File transfer ${transferId} completed successfully for all clients.`);
    updateFileTransfer(transferId, { progress: 100, status: 'complete' });
  } else {
    console.warn(`File transfer ${transferId}: No clients to send to.`);
    updateFileTransfer(transferId, {
      status: 'error',
      error: 'No connected clients with file channel.'
    });
  }
}

function readFileSliceAsArrayBuffer(slice: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        resolve(event.target.result as ArrayBuffer);
      } else {
        reject(new Error('Failed to read file slice.'));
      }
    };
    reader.onerror = (event) => {
      reject(reader.error || new Error('FileReader error'));
    };
    reader.readAsArrayBuffer(slice);
  });
}

async function waitForBufferDrain(dc: RTCDataChannel): Promise<void> {
  return new Promise((resolve) => {
    const listener = () => {
      dc.removeEventListener('bufferedamountlow', listener);
      resolve();
    };
    dc.addEventListener('bufferedamountlow', listener);
  });
}

async function readFile(file: File, cid: string, id: string): Promise<void> {
  const client = getDirectClient(cid);
  const dc_file = client?.dc_file;

  if (!dc_file) {
    console.error(`File data channel not found for client ${cid} in readFile`);
    updateFileTransfer(id, { status: 'error', error: 'Data channel not available' });
    return;
  }

  const DEFAULT_SEND_CHUNK_SIZE = 16 * 1024;
  const MAX_SEND_CHUNK_SIZE = 1 * 1024 * 1024;
  const DEFAULT_READ_CHUNK_SIZE = 1 * 1024 * 1024;
  const HIGH_WATER_MARK = 0.125 * 1024 * 1024;

  let SEND_CHUNK_SIZE = DEFAULT_SEND_CHUNK_SIZE;
  const pc = client?.pc;
  if (pc && pc.localDescription && pc.remoteDescription) {
    const localMax = getMaxMessageSizeFromSdp(pc.localDescription.sdp);
    const remoteMax = getMaxMessageSizeFromSdp(pc.remoteDescription.sdp);
    const effectiveMax = Math.min(localMax ?? Infinity, remoteMax ?? Infinity);

    if (effectiveMax !== Infinity && effectiveMax > 0) {
      SEND_CHUNK_SIZE = Math.min(effectiveMax, MAX_SEND_CHUNK_SIZE);
      console.log(
        `Using dynamic SEND_CHUNK_SIZE: ${SEND_CHUNK_SIZE} bytes (based on SDP max: ${effectiveMax})`
      );
    } else {
      console.log(
        `Using default SEND_CHUNK_SIZE: ${SEND_CHUNK_SIZE} bytes (SDP max-message-size not found or invalid)`
      );
    }
  } else {
    console.log(`Using default SEND_CHUNK_SIZE: ${SEND_CHUNK_SIZE} bytes (SDP not available)`);
  }

  const READ_CHUNK_SIZE = DEFAULT_READ_CHUNK_SIZE;
  let offset = 0;
  let totalBytesSent = 0;

  try {
    console.log(`Starting file transfer: ${file.name} (${file.size} bytes) to ${cid}`);
    dc_file.send(JSON.stringify({ name: file.name, type: file.type, size: file.size }));

    while (offset < file.size) {
      const slice = file.slice(offset, offset + READ_CHUNK_SIZE);
      const chunkBuffer = await readFileSliceAsArrayBuffer(slice);
      offset += chunkBuffer.byteLength;

      const smallChunks = splitArrayBuffer(chunkBuffer, SEND_CHUNK_SIZE);

      for (const smallChunk of smallChunks) {
        while (dc_file.bufferedAmount > HIGH_WATER_MARK) {
          dc_file.bufferedAmountLowThreshold = HIGH_WATER_MARK / 2;
          await waitForBufferDrain(dc_file);
        }

        try {
          dc_file.send(smallChunk);
          totalBytesSent += smallChunk.byteLength;
        } catch (error) {
          console.error(`Error sending chunk for file ${file.name} to ${cid}:`, error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          updateFileTransfer(id, { status: 'error', error: `Send error: ${errorMessage}` });
          throw error;
        }

        const progress = Math.min(100, Math.round((totalBytesSent / file.size) * 100));
        updateFileTransfer(id, { progress, status: 'sending' });
      }
    }

    while (dc_file.bufferedAmount > 0) {
      dc_file.bufferedAmountLowThreshold = 0;
      await waitForBufferDrain(dc_file);
    }
    console.log(`readFile finished for ${file.name} to ${cid}`);
  } catch (error) {
    console.error(`Error sending file ${file.name} to ${cid}:`, error);
    throw error;
  }
}
