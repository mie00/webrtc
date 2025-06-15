import { derived } from 'svelte/store';
import {
  streamStore,
  getStreamState,
  addLocalStream,
  removeLocalStream,
  updateStreamConfig,
  getLocalStreamsByType,
  updateLocalStreamProperties
} from '../stores/streamStore';
import { getAllConfig, configStore, type Config, type MediaConfig } from '../stores/configStore';
import { getLocalFileStreamState } from '../stores/localFileStreamStore';
import {
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

configStore.subscribe(async (newConfig) => {
  let videoDeviceChangedInThisUpdate = prevConfig.media.videoDevice !== newConfig.media.videoDevice;

  for (const key of Object.keys(newConfig.media) as Array<keyof MediaConfig>) {
    if (prevConfig.media[key] !== newConfig.media[key]) {
      if (key === 'audioDevice') {
        // Check against initial streamState, as streamStore might be updated by other handlers sync
        if (getStreamState().streamConfig.audio !== null) {
          updateStreamConfig({ audio: newConfig.media.audioDevice });
        }
      } else if (key === 'videoDevice') {
        // Check against initial streamState
        if (getStreamState().streamConfig.camera !== null) {
          updateStreamConfig({ camera: newConfig.media.videoDevice });
        }
        // videoDeviceChangedInThisUpdate is already set based on prevConfig and newConfig
      } else if (key === 'blurVideo') {
        if (videoDeviceChangedInThisUpdate) {
          // If videoDevice also changed, cameraDevice.subscribe will handle
          // setting up the new device with the correct blur. Do nothing here.
        } else {
          // videoDevice did NOT change, only blurVideo (or other non-device media settings).
          // videoDevice did NOT change, only blurVideo.
          // Apply blur change to existing camera stream setup.
          if (newConfig.media.blurVideo === 'yes') {
            // Blur turned ON
            const existingCameraStreamsData = getLocalStreamsByType('camera');
            for (const [originalStreamId, streamData] of Object.entries(
              existingCameraStreamsData
            )) {
              if (streamData.stream) {
                updateLocalStreamProperties(originalStreamId, { viewable: false, sendable: false });

                const videoElem = document.createElement('video');
                videoElem.autoplay = true;
                videoElem.muted = true;
                videoElem.srcObject = streamData.stream;
                await new Promise<void>((resolve) => {
                  videoElem.onloadedmetadata = () => videoElem.play().then(() => resolve());
                });
                const blurredVersion = await backgroundChange(videoElem);
                setupStream(blurredVersion, 'low', 'motion', true);
                addLocalStream('blurred', blurredVersion, null, true, true);
              }
            }
          } else {
            // Blur turned OFF
            const existingBlurredStreams = getLocalStreamsByType('blurred');
            for (const [streamId, streamData] of Object.entries(existingBlurredStreams)) {
              if (streamData.stream) await tearDownStream(streamData.stream);
              removeLocalStream(streamId);
            }

            const existingCameraStreamsData = getLocalStreamsByType('camera');
            for (const streamId of Object.keys(existingCameraStreamsData)) {
              updateLocalStreamProperties(streamId, { viewable: true, sendable: true });
            }
          }
        }
      }
    }
  }
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
      const context = await processAudio(stream, (dataArray, _analyser) => {
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
    // Clean up ALL existing camera and blurred streams first
    const oldCameraStreams = getLocalStreamsByType('camera');
    for (const [streamId, streamData] of Object.entries(oldCameraStreams)) {
      if (streamData.stream) await tearDownStream(streamData.stream);
      removeLocalStream(streamId);
    }
    const oldBlurredStreams = getLocalStreamsByType('blurred');
    for (const [streamId, streamData] of Object.entries(oldBlurredStreams)) {
      if (streamData.stream) await tearDownStream(streamData.stream);
      removeLocalStream(streamId);
    }

    const deviceInfo = camera.split('|') || [];
    const rawVideoStream = await navigator.mediaDevices.getUserMedia({
      video: deviceInfo.length === 2 ? { groupId: deviceInfo[0], deviceId: deviceInfo[1] } : true
    });
    setupStream(rawVideoStream, 'low', 'motion', true); // Setup for the raw stream
    const rawCameraStreamId = addLocalStream('camera', rawVideoStream, null, true, true); // Add as 'camera', initially viewable/sendable

    if (globalConfig.media.blurVideo === 'yes') {
      updateLocalStreamProperties(rawCameraStreamId, { viewable: false, sendable: false });

      try {
        const videoElem = document.createElement('video');
        videoElem.autoplay = true;
        videoElem.muted = true;
        videoElem.srcObject = rawVideoStream; // Use the raw stream
        await new Promise<void>((resolve) => {
          videoElem.onloadedmetadata = () => videoElem.play().then(() => resolve());
        });
        const blurredStream = await backgroundChange(videoElem);
        setupStream(blurredStream, 'low', 'motion', true); // Setup for the blurred stream
        addLocalStream('blurred', blurredStream, null, true, true); // Add as 'blurred', viewable/sendable
      } catch (error) {
        console.error('Failed to apply background blur on new camera device:', error);
        // Fallback: ensure the raw camera stream is viewable/sendable if blur fails
        updateLocalStreamProperties(rawCameraStreamId, { viewable: true, sendable: true });
      }
    }
    // If blur is 'no', the raw 'camera' stream added above is already correctly viewable/sendable.
  } else {
    // Camera is turned off
    const cameraStreams = getLocalStreamsByType('camera');
    for (const [streamId, streamData] of Object.entries(cameraStreams)) {
      if (streamData.stream) await tearDownStream(streamData.stream);
      removeLocalStream(streamId);
    }
    const blurredStreams = getLocalStreamsByType('blurred'); // Also cleanup blurred streams
    for (const [streamId, streamData] of Object.entries(blurredStreams)) {
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
