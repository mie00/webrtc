import { VideoStreamMerger }  from 'video-stream-merger';

let lastStreams: string[] = [];

const FW = 1920;
const FH = 1080;

interface StreamDimension {
  key: string;
  width?: number;
  height?: number;
}

// Import the function from stream.ts
import { normalizeStreamId } from './stream.js';

interface StreamDimensions {
  key: string;
  ow?: number;
  oh?: number;
  width?: number;
  height?: number;
}

function getStreamElemId(id: string): string {
    return `stream-${normalizeStreamId(id)}`;
}

const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

const getStreamsDims = async (): Promise<StreamDimensions[]> => {
  // TODO: use videoHeight and width from element
  let elems: StreamDimensions[] = [];
  if (!window.app.viewStreams) return elems;
  let statsDict: Record<string, { width?: number, height?: number }> = {};
  for (const client of Object.values(window.app.clients) as WebRTCClient[]) {
      (await client.pc?.getStats())?.forEach((stat: any) => {
          if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
              statsDict[normalizeStreamId(stat.trackIdentifier)] = { width: stat.frameWidth, height: stat.frameHeight };
          }
      });
  }
  for (let [key, value] of Object.entries(window.app.viewStreams) as [string, MediaStream][]) {
      if (value.getVideoTracks().length === 0) {
          continue;
      }
      let width: number | undefined, height: number | undefined;
      console.log(isFirefox, value.getVideoTracks()[0].label != 'remote video');
      const settings = value.getVideoTracks()[0].getSettings();
      width = settings.width;
      height = settings.height;
      if (!width || !height) {
          if (normalizeStreamId(value.getVideoTracks()[0].id) in statsDict) {
              const stats = statsDict[normalizeStreamId(value.getVideoTracks()[0].id)];
              width = stats.width;
              height = stats.height;
          }
      }
      if (!width || !height) {
          const videoElem = document.querySelector(`video.${getStreamElemId(key)}`) as HTMLVideoElement;
          if (videoElem) {
              height = videoElem.videoHeight;
              width = videoElem.videoWidth;
          }
      }
      elems.push({ key, ow: width, oh: height, width: width && height ? Math.sqrt(width / height) : undefined, height: width && height ? Math.sqrt(height / width) : undefined });
  }
  return elems;
};

async function setupStreams(merger: any): Promise<void> {
  const streams = (await getStreamsDims()).filter(({ width, height }) => width && height);
  const videoStreamsLength = streams.length;
  
  for (let [key, value] of Object.entries(window.app.viewStreams || {}) as [string, MediaStream][]) {
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

async function startRecording(): Promise<void> {
  var merger = new VideoStreamMerger();
  window.app.recorder = window.setInterval(setupStreams.bind(null, merger), 1000);
  window.app.merger = merger;
  merger.setOutputSize(FW, FH);

  await setupStreams(merger);

  merger.start();

  const result = merger.result;
  // if (false) { // for debugging only
  //   window.app.viewStreams[result.id] = result;
  //   // await createStreamElement(result, 'video', { muted: false, controls: true });
  // }

  const options = { mimeType: "video/webm; codecs=vp9" };
  const mediaRecorder = new MediaRecorder(result!, options);
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
    window.app.mediaRecorder = undefined;
  }
  
  if (window.app.merger) {
    window.app.merger.destroy();
    window.app.merger = null;
  }
  
  if (window.app.recorder) {
    clearInterval(window.app.recorder);
    window.app.recorder = undefined;
  }
}

export { startRecording, stopRecording };
