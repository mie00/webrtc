import { derived } from 'svelte/store';
import {
  streamStore,
  getStreamState,
  addLocalStream,
  removeLocalStream,
  updateStreamConfig,
  getLocalStreamsByType
} from '../stores/streamStore';
import { getAllConfig, configStore, type Config, type MediaConfig } from '../stores/configStore';
import { getLocalFileStreamState } from '../stores/localFileStreamStore';
import {
  type AudioNodes,
  setupStream,
  processAudio,
  stopProcessingAudio,
  tearDownStream
} from './stream';
import { backgroundChange } from './background';
import {
  getAudioProcessingContext,
  setAudioProcessingContext,
  removeAudioProcessingContext
} from '../app/streamLifecycle'; // For managing audioProcessingContexts

// Module-level storage for audio callback, if it needs to be set from outside
let audioCbFunction: ((instant: number) => void) | undefined;
export function setAudioCallback(cb: ((instant: number) => void) | undefined) {
  audioCbFunction = cb;
}

// Track previous config state for device changes
let prevConfig: Config = getAllConfig();

configStore.subscribe((newConfig) => {
  const streamState = getStreamState();

  (Object.keys(newConfig.media) as Array<keyof MediaConfig>).forEach((key) => {
    if (prevConfig.media[key] !== newConfig.media[key]) {
      if (key === 'audioDevice') {
        if (streamState.streamConfig.audio !== null) {
          updateStreamConfig({ audio: newConfig.media.audioDevice });
        }
      } else if (key === 'videoDevice') {
        if (streamState.streamConfig.camera !== null) {
          updateStreamConfig({ camera: newConfig.media.videoDevice });
        }
      } else if (key === 'blurVideo' && streamState.streamConfig.camera !== null) {
        const currentVideoDevice = newConfig.media.videoDevice;
        updateStreamConfig({ camera: null });
        setTimeout(() => updateStreamConfig({ camera: currentVideoDevice }), 100);
      }
    }
  });
  prevConfig = newConfig;
});

const audioDevice = derived(streamStore, ($state) => $state.streamConfig.audio);
const cameraDevice = derived(streamStore, ($state) => $state.streamConfig.camera);
const screenSharing = derived(streamStore, ($state) => $state.streamConfig.screen);
const fileStream = derived(streamStore, ($state) => $state.streamConfig.file);

audioDevice.subscribe(async (audio) => {
  if (audio !== null) {
    const audioStreams = getLocalStreamsByType('audio');
    for (const [streamId, streamData] of Object.entries(audioStreams)) {
      if (streamData.stream) {
        await tearDownStream(streamData.stream);
        const audioNodes = getAudioProcessingContext(streamId);
        stopProcessingAudio(audioNodes);
        removeAudioProcessingContext(streamId);
      }
      removeLocalStream(streamId);
    }

    const deviceInfo = audio.split('|') || [];
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceInfo.length === 2 ? { groupId: deviceInfo[0], deviceId: deviceInfo[1] } : true
    });
    setupStream(stream, 'high');
    const streamId = addLocalStream('audio', stream, null, true, true);

    if (audioCbFunction) {
      const context = await processAudio(stream, (dataArray, analyser) => {
        if (dataArray.length > 0) {
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          audioCbFunction?.(sum / dataArray.length);
        } else {
          audioCbFunction?.(0);
        }
      });
      setAudioProcessingContext(streamId, context);
    }
  } else {
    const audioStreams = getLocalStreamsByType('audio');
    for (const [streamId, streamData] of Object.entries(audioStreams)) {
      if (streamData.stream) {
        await tearDownStream(streamData.stream);
        const audioNodes = getAudioProcessingContext(streamId);
        stopProcessingAudio(audioNodes);
        removeAudioProcessingContext(streamId);
      }
      removeLocalStream(streamId);
    }
    if (audioCbFunction) audioCbFunction(0);
  }
});

cameraDevice.subscribe(async (camera) => {
  const globalConfig = getAllConfig();
  if (camera !== null) {
    const cameraStreams = getLocalStreamsByType('camera');
    for (const [streamId, streamData] of Object.entries(cameraStreams)) {
      if (streamData.stream) await tearDownStream(streamData.stream);
      removeLocalStream(streamId);
    }

    const deviceInfo = camera.split('|') || [];
    const stream = await navigator.mediaDevices.getUserMedia({
      video: deviceInfo.length === 2 ? { groupId: deviceInfo[0], deviceId: deviceInfo[1] } : true
    });

    if (globalConfig.media.blurVideo === 'yes') {
      try {
        const videoElem = document.createElement('video');
        videoElem.autoplay = true;
        videoElem.muted = true;
        videoElem.srcObject = stream;
        await new Promise<void>((resolve) => {
          videoElem.onloadedmetadata = () => videoElem.play().then(() => resolve());
        });
        const blurredStream = await backgroundChange(videoElem);
        setupStream(blurredStream, 'low', 'motion', true);
        addLocalStream('camera', blurredStream, null, true, true);
      } catch (error) {
        console.error('Failed to apply background blur:', error);
        setupStream(stream, 'low', 'motion', true);
        addLocalStream('camera', stream, null, true, true);
      }
    } else {
      setupStream(stream, 'low', 'motion', true);
      addLocalStream('camera', stream, null, true, true);
    }
  } else {
    const cameraStreams = getLocalStreamsByType('camera');
    for (const [streamId, streamData] of Object.entries(cameraStreams)) {
      if (streamData.stream) await tearDownStream(streamData.stream);
      removeLocalStream(streamId);
    }
  }
});

screenSharing.subscribe(async (screen) => {
  if (screen) {
    const screenStreams = getLocalStreamsByType('screen');
    for (const [streamId, streamData] of Object.entries(screenStreams)) {
      if (streamData.stream) await tearDownStream(streamData.stream);
      removeLocalStream(streamId);
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: { cursor: 'always' } as any
    });
    setupStream(stream, 'medium', 'detail', false);
    addLocalStream('screen', stream, null, true, true);
  } else {
    const screenStreams = getLocalStreamsByType('screen');
    for (const [streamId, streamData] of Object.entries(screenStreams)) {
      if (streamData.stream) await tearDownStream(streamData.stream);
      removeLocalStream(streamId);
    }
  }
});

fileStream.subscribe(async (file) => {
  if (file !== null) {
    const fileStreams = getLocalStreamsByType('file');
    for (const [streamId, streamData] of Object.entries(fileStreams)) {
      if (streamData.stream) {
        await tearDownStream(streamData.stream);
      } else if (streamData.src) {
        URL.revokeObjectURL(streamData.src);
        const stream = getLocalFileStreamState().localFileStreams[streamData.src];
        if (stream) await tearDownStream(stream);
      }
      removeLocalStream(streamId);
    }
    addLocalStream('file', null, file, true, false);
  } else {
    const fileStreams = getLocalStreamsByType('file');
    for (const [streamId, streamData] of Object.entries(fileStreams)) {
      if (streamData.stream) {
        await tearDownStream(streamData.stream);
      } else if (streamData.src) {
        URL.revokeObjectURL(streamData.src);
        const stream = getLocalFileStreamState().localFileStreams[streamData.src];
        if (stream) await tearDownStream(stream);
      }
      removeLocalStream(streamId);
    }
  }
});
