const recordButton = document.getElementById('record') as HTMLButtonElement;

let lastStreams: string[] = [];

const FW = 1920;
const FH = 1080;

interface StreamDimension {
  key: string;
  width?: number;
  height?: number;
}

// Import the function from stream.ts
import { getStreamsDims } from './stream.js';

async function setupStreams(merger: any): Promise<void> {
  const streams = (await getStreamsDims()).filter(({ width, height }) => width && height);
  const videoStreamsLength = streams.length;
  
  for (let [key, value] of Object.entries(window.app.viewStreams || {})) {
    if (value.getVideoTracks().length === 0) {
      streams.push({ key });
    }
  }
  
  const streamKeys = streams.map(({ key }) => key);
  if (lastStreams.length === streamKeys.length && lastStreams.every(stream => streamKeys.includes(stream))) {
    return;
  }
  
  lastStreams.forEach(streamKey => {
    merger.removeStream(streamKey);
  });
  lastStreams = streamKeys;

  const rcs = Math.ceil(Math.sqrt(streams.length));
  const cols = rcs;
  const rows = cols * (cols - 1) >= streams.length ? cols - 1 : cols;
  console.log(`${videoStreamsLength} streams will be displayed in ${rows}x${cols}`);
  
  let videoStreamIndex = 0;
  for (var i = 0; i < streams.length; i++) {
    if (!streams[i].width) {
      merger.addStream(window.app.viewStreams?.[streams[i].key], {
        mute: false,
      });
    } else {
      const nw = streams[i].width! * FH / cols / streams[i].height!;
      const scale = nw <= FW / rows ? FH / cols / streams[i].height! : FW / rows / streams[i].width!;
      merger.addStream(window.app.viewStreams?.[streams[i].key], {
        x: (videoStreamIndex % cols) * FW / cols,
        y: Math.floor(videoStreamIndex / cols) * FH / rows,
        width: scale * streams[i].width!,
        height: scale * streams[i].height!,
        mute: false,
      });
      videoStreamIndex++;
    }
  }
}

import { createStreamElement } from './stream.js';
async function startRecording(): Promise<void> {
  var merger = new window.VideoStreamMerger();
  window.app.recorder = window.setInterval(setupStreams.bind(null, merger), 1000);
  window.app.merger = merger;
  merger.setOutputSize(FW, FH);

  await setupStreams(merger);

  merger.start();

  const result = merger.result;
  if (false) { // for debugging only
    window.app.viewStreams = window.app.viewStreams || {};
    window.app.viewStreams[result.id] = result;
    await createStreamElement(result, 'video', { muted: false, controls: true });
  }

  const options = { mimeType: "video/webm; codecs=vp9" };
  const mediaRecorder = new MediaRecorder(result, options);
  window.app.mediaRecorder = mediaRecorder;

  mediaRecorder.ondataavailable = async (ev: BlobEvent) => {
    if (ev.data.size > 0) {
      // Create a link element for downloading
      const anchor = document.createElement('a');
      anchor.href = window.URL.createObjectURL(ev.data);
      anchor.download = 'mie-webrtc-video.mp4';

      // Append the anchor to the body and programmatically click it to trigger download
      document.body.appendChild(anchor);
      anchor.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(anchor.href);
      }, 100);
    }
  };
  
  mediaRecorder.start();
}

function stopRecording(): void {
  if (window.app.mediaRecorder) {
    window.app.mediaRecorder.stop();
    window.app.mediaRecorder = null;
  }
  
  if (window.app.merger) {
    window.app.merger.destroy();
    window.app.merger = null;
  }
  
  if (window.app.recorder) {
    clearInterval(window.app.recorder);
    window.app.recorder = null;
  }
}

export { startRecording, stopRecording };
