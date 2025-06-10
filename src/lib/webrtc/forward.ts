
async function sendData(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  id: string,
  forward: RTCDataChannel
): Promise<void> {
  console.log('reader', reader);
  const max_size = 2 * 1024;
  let offset = 0;
  let gvalue: Uint8Array | undefined = undefined; // Allow undefined from reader.read()
  let gdone = false;
  let sentOnBuffer = 0;

  const clearBufferAndCb = async function (): Promise<void> {
    sentOnBuffer = 0;
    await cb();
  };

  // TODO: convert to proper promise
  const cb = async function (): Promise<void> {
    forward.removeEventListener('bufferedamountlow', clearBufferAndCb);

    if (!gvalue) {
      const { done, value } = await reader.read();
      offset = 0;
      gdone = done;
      gvalue = value;
    }
    console.log('gvalue', gvalue, 'offset', offset, 'done', gdone);

    while (gvalue && offset < gvalue.byteLength) {
      console.log(
        'sending data',
        'length',
        gvalue.byteLength,
        'offset',
        offset,
        'sentOnBuffer',
        sentOnBuffer
      );
      forward.send(
        JSON.stringify({
          type: 'data',
          id: id,
          chunk: Array.from(gvalue.slice(offset, offset + 10 * 1024))
        })
      );
      sentOnBuffer += Math.min(gvalue.byteLength, offset + 10 * 1024) - offset;
      offset = Math.min(gvalue.byteLength, offset + 10 * 1024);
      if (sentOnBuffer > max_size) {
        forward.addEventListener('bufferedamountlow', clearBufferAndCb);
        return;
      }
    }
    gvalue = undefined; // Assign undefined instead of null
    if (gdone) {
      forward.send(
        JSON.stringify({
          type: 'end',
          id: id
        })
      );
    } else {
      cb();
    }
  };
  cb();
}

// Helper function to set button state
function setButton(button: HTMLElement, state: string | null): void {
  if (state) {
    button.textContent = 'Stop Forwarding';
    button.classList.add('bg-red-500');
    button.classList.remove('bg-blue-500');
  } else {
    button.textContent = 'Start Forwarding';
    button.classList.add('bg-blue-500');
    button.classList.remove('bg-red-500');
  }
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  // Calculate the total length of all arrays
  const totalLength = arrays.reduce((acc, array) => acc + array.length, 0);

  // Create a new Uint8Array with the total length
  const result = new Uint8Array(totalLength);

  // Keep track of the current offset
  let offset = 0;

  // Iterate over each array and copy its contents into the result
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
}

/*
1. init forward channel
2. init service worker
3. send offer to the peer
4. peer opens an iframe with ?host=
5. service worker intercepts request and reads host
6. service worker sends request to client (should be the same one with the iframe)
7. client makes a request to peer using forward channel
8. peer receives request, uses fetch to get response
9. peer forwards response back to peer
10. client gets response from peer and sends it to service worker
11. service worker sends response to page
*/

export { sendData, concatUint8Arrays, setButton };
