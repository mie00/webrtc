import { WebRTCApp } from '../webrtc/WebRTCApp';

interface FileStuff {
  name: string;
  type: string;
  size: number;
  segments: ArrayBuffer[];
  remaining_size: number;
  id: string;
}

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

function setupFileChannel(app: App, cid: string): void {
    const pc = window.app.clients[cid]?.pc;
    if (!pc) {
      console.error(`PeerConnection not found for client ${cid} when setting up file channel.`);
      return;
    }
    const dc_file = pc.createDataChannel("file", {
        negotiated: true,
        id: 2
    });
    window.app.clients[cid].dc_file = dc_file;

    dc_file.onmessage = (e: MessageEvent) => {
        if (!window.app.clients[cid].file_stuff) {
            const id = Math.random().toString(16).slice(2);
            window.app.clients[cid].file_stuff = JSON.parse(e.data);
            window.app.clients[cid].file_stuff.segments = [];
            window.app.clients[cid].file_stuff.remaining_size = window.app.clients[cid].file_stuff.size;
            window.app.clients[cid].file_stuff.id = id;
            WebRTCApp.log(`> <label for="file-${id}">${window.app.clients[cid].file_stuff.name}</label> <span id="f-${id}"><progress id="file-${id}" value="0" max="100"> 0% </progress></span>`);
            return;
        }
        window.app.clients[cid].file_stuff.segments.push(e.data);
        window.app.clients[cid].file_stuff.remaining_size -= e.data.byteLength || e.data.size;
        updateProgressBar(window.app.clients[cid].file_stuff.id, window.app.clients[cid].file_stuff.size, () => window.app.clients[cid].file_stuff.remaining_size);
        if (window.app.clients[cid].file_stuff.remaining_size === 0) {
            const blob = new Blob(window.app.clients[cid].file_stuff.segments, { type: window.app.clients[cid].file_stuff.type });
            const url = URL.createObjectURL(blob);
            const fileElement = document.getElementById(`f-${window.app.clients[cid].file_stuff.id}`);
            if (fileElement) {
                fileElement.innerHTML = `
                    <a id="download-${window.app.clients[cid].file_stuff.id}" class="w-full py-2 px-4 bg-blue-500 text-white rounded shadow hover:bg-blue-700">Download</a>
                    <a id="view-${window.app.clients[cid].file_stuff.id}" class="w-full py-2 px-4 bg-blue-500 text-white rounded shadow hover:bg-blue-700" target="_blank">View</a>`;
                const downloadLink = document.getElementById(`download-${window.app.clients[cid].file_stuff.id}`) as HTMLAnchorElement;
                if (downloadLink) {
                    downloadLink.href = url;
                    downloadLink.download = window.app.clients[cid].file_stuff.name;
                }
                const viewLink = document.getElementById(`view-${window.app.clients[cid].file_stuff.id}`) as HTMLAnchorElement;
                if (viewLink) {
                    viewLink.href = url;
                }
            }
            window.app.clients[cid].file_stuff = null;
        }
    };
}

const fileUploadElement = document.getElementById('file-upload');
if (fileUploadElement) {
  fileUploadElement.addEventListener('change', handleFileSelect);
}

function handleFileSelect(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    
    for (const cid of Object.keys(window.app.clients)) {
        readFile(file, cid);
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

function readFile(file: File, cid: string): void {
    const id = Math.random().toString(16).slice(2);
    WebRTCApp.log(`<label for="file-${id}">${file.name}</label> <span id="f-${id}"><progress id="file-${id}" value="0" max="100"> 0% </progress></span>`);
    let offset = 0;
    const max_size = 2 * 1024 * 1024;
    window.app.clients[cid].dc_file?.send(JSON.stringify({ name: file.name, type: file.type, size: file.size }));

    const reader = new FileReader();
    reader.onload = function(event: ProgressEvent<FileReader>) {
        if (!event.target?.result) return;
        
        const result = event.target.result as ArrayBuffer;
        for (const chunk of splitArrayBuffer(result, 128 * 1024)) {
            window.app.clients[cid].dc_file?.send(chunk);
        }
        if (window.app.file_progress_interval) {
            clearInterval(window.app.file_progress_interval);
            window.app.file_progress_interval = undefined;
        }
        window.app.file_progress_interval = window.setInterval(() => {
            const getRemaining = () => ((window.app.clients[cid].dc_file?.bufferedAmount || 0) + (file.size - Math.min(offset, file.size)));
            updateProgressBar(id, file.size, getRemaining);
            if (getRemaining() === 0) {
                if (window.app.file_progress_interval) {
                    clearInterval(window.app.file_progress_interval);
                    window.app.file_progress_interval = undefined;
                }
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
            window.app.clients[cid].dc_file?.removeEventListener("bufferedamountlow", buffer_cb);
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
        window.app.clients[cid].dc_file?.addEventListener("bufferedamountlow", buffer_cb);
    }
    
    reader.readAsArrayBuffer(file.slice(offset, offset + max_size));
    offset += max_size;
}

export {
    updateProgressBar,
    setupFileChannel,
    readFile,
    splitArrayBuffer
};
