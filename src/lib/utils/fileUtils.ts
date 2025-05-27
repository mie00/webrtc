export function splitArrayBuffer(arrayBuffer: ArrayBuffer, chunkSize: number): ArrayBuffer[] {
  const uint8Array = new Uint8Array(arrayBuffer);
  const chunks: ArrayBuffer[] = [];
  let offset = 0;

  while (offset < uint8Array.length) {
    const chunk = uint8Array.slice(offset, offset + chunkSize);
    chunks.push(chunk.buffer); // Push the ArrayBuffer of the chunk
    offset += chunkSize;
  }

  return chunks;
}

// Helper function to parse max-message-size from SDP
export function getMaxMessageSizeFromSdp(sdp: string): number | null {
  if (!sdp) return null;
  const match = sdp.match(/a=max-message-size:(\d+)/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}
