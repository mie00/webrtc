import { derived } from 'svelte/store';
import {
  streamStore, // Keep for direct access if needed, though getStreamState is preferred for snapshots
  getStreamState,
  addLocalStream,
  removeLocalStream,
  getLocalStreamsByType,
  updateLocalStreamProperties
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

configStore.subscribe(async (newConfig) => {
  // Check if videoDevice changed to coordinate with blur logic
  const videoDeviceJustChanged = prevConfig.media.videoDevice !== newConfig.media.videoDevice;

  // Handle blur changes
  if (prevConfig.media.blurVideo !== newConfig.media.blurVideo) {
    // Only apply blur changes if the camera is intended to be active
    // and the video device itself hasn't just changed (which would trigger a full camera restart via cameraDevice.subscribe)
    if (newConfig.media.videoDevice && !videoDeviceJustChanged) {
      if (newConfig.media.blurVideo === 'yes') {
        // Blur turned ON for existing camera stream
        const existingCameraStreamsData = getLocalStreamsByType('camera');
        for (const [originalStreamId, streamData] of Object.entries(existingCameraStreamsData)) {
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
  prevConfig = { ...newConfig }; // Store a copy of the new config
});

// Derived stores for active audio and camera based on configStore
const audioConfig = derived(configStore, ($config) => $config.media.audioDevice);
const cameraConfig = derived(configStore, ($config) => $config.media.videoDevice);
// Screen sharing and file streaming are managed directly by MediaArea.svelte for now

audioConfig.subscribe(async (audioDeviceValue) => {
  // audioDeviceValue is the device ID string, or undefined if audio should be off
  if (audioDeviceValue) {
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

    const deviceInfo = audioDeviceValue.split('|') || [];
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceInfo.length === 2 ? { groupId: deviceInfo[0], deviceId: deviceInfo[1] } : true
    });
    setupStream(stream, 'high');
    const newStreamId = addLocalStream('audio', stream, null, true, true);

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
      setAudioProcessingContext(newStreamId, context);
    }
  } else {
    // Audio should be off (audioDeviceValue is undefined)
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

cameraConfig.subscribe(async (cameraDeviceValue) => {
  const globalConfig = getAllConfig(); // Get current global config, including blur setting

  // First, clean up ALL existing camera and blurred streams
  // This ensures a clean state regardless of whether camera is being turned on, off, or device is changing.
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

  if (cameraDeviceValue) {
    // Camera should be on if cameraDeviceValue is a device ID string
    const deviceInfo = cameraDeviceValue.split('|') || [];
    const rawVideoStream = await navigator.mediaDevices.getUserMedia({
      video: deviceInfo.length === 2 ? { groupId: deviceInfo[0], deviceId: deviceInfo[1] } : true
    });
    setupStream(rawVideoStream, 'low', 'motion', true);
    const rawCameraStreamId = addLocalStream('camera', rawVideoStream, null, true, true);

    if (globalConfig.media.blurVideo === 'yes') {
      updateLocalStreamProperties(rawCameraStreamId, { viewable: false, sendable: false });
      try {
        const videoElem = document.createElement('video');
        videoElem.autoplay = true;
        videoElem.muted = true;
        videoElem.srcObject = rawVideoStream;
        await new Promise<void>((resolve) => {
          videoElem.onloadedmetadata = () => videoElem.play().then(() => resolve());
        });
        const blurredStream = await backgroundChange(videoElem);
        setupStream(blurredStream, 'low', 'motion', true);
        addLocalStream('blurred', blurredStream, null, true, true);
      } catch (error) {
        console.error('Failed to apply background blur on new camera device:', error);
        updateLocalStreamProperties(rawCameraStreamId, { viewable: true, sendable: true });
      }
    }
    // If blur is 'no', the raw 'camera' stream is already correctly viewable/sendable.
  }
  // If cameraDeviceValue is undefined, all streams were already cleaned up at the start of the subscription.
});
