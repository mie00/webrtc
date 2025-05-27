/**
 * Concatenate multiple Uint8Arrays into a single Uint8Array.
 */
export function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const arr of arrays) {
    totalLength += arr.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Send data from a ReadableStreamDefaultReader over an RTCDataChannel.
 * @param reader The reader for the stream.
 * @param id The identifier for this data transfer.
 * @param dc The RTCDataChannel to send data over.
 */
export async function sendData(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  id: string,
  dc: RTCDataChannel | undefined | null
): Promise<void> {
  if (!dc) {
    console.error(`Data channel not available for sendData, id: ${id}`);
    return;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        dc.send(JSON.stringify({ type: 'end', id }));
        break;
      }
      if (value) {
        // Consider chunking 'value' if it can be larger than dc.maxMessageSize
        // For now, sending as is.
        dc.send(JSON.stringify({ type: 'data', id, chunk: Array.from(value) }));
      }
    }
  } catch (error) {
    console.error(`Error reading or sending data for id ${id}:`, error);
    try {
      dc.send(JSON.stringify({ type: 'error', id, error: 'Failed to read or send stream data' }));
    } catch (sendError) {
      console.error(`Failed to send error message for id ${id}:`, sendError);
    }
  }
}
