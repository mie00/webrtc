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
let prevConfigState: Config = getAllConfig();
let prevLocalStreamsState: Record<string, any> = getStreamState().localStreams;

// Helper function to get device constraints
function getDeviceConstraints(
  deviceHint: string | null | undefined,
  type: 'audio' | 'video'
): MediaStreamConstraints {
  const constraints: MediaStreamConstraints = {};
  if (type === 'audio') {
    constraints.audio =
      deviceHint && deviceHint !== 'default'
        ? { deviceId: { exact: deviceHint.split('|')[1] } }
        : true;
  } else {
    constraints.video =
      deviceHint && deviceHint !== 'default'
        ? { deviceId: { exact: deviceHint.split('|')[1] } }
        : true;
  }
  return constraints;
}

// Manage a single audio stream based on its LocalStreamData
async function manageAudioStream(streamId: string, streamData: any, config: MediaConfig) {
  if (!streamData.stream) {
    // Stream needs to be initialized
    const deviceHint = streamData.src || config.audioDevice; // Use src as hint, fallback to config
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(
        getDeviceConstraints(deviceHint, 'audio')
      );
      setupStream(mediaStream, 'high');
      updateLocalStreamProperties(streamId, { stream: mediaStream, src: null }); // Clear src hint

      if (audioCbFunction) {
        const context = await processAudio(mediaStream, (dataArray) => {
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
    } catch (err) {
      console.error(`Error initializing audio stream ${streamId}:`, err);
      removeLocalStream(streamId); // Remove if initialization failed
    }
  }
}

// Manage a single camera stream based on its LocalStreamData
async function manageCameraStream(streamId: string, streamData: any, config: MediaConfig) {
  if (!streamData.stream) {
    // Stream needs to be initialized
    const deviceHint = streamData.src || config.videoDevice; // Use src as hint
    console.log('dh', streamData.src, config.videoDevice, deviceHint, getDeviceConstraints(deviceHint, 'video'))
    try {
      const rawVideoStream = await navigator.mediaDevices.getUserMedia(
        getDeviceConstraints(deviceHint, 'video')
      );
      setupStream(rawVideoStream, 'low', 'motion', true);
      updateLocalStreamProperties(streamId, { stream: rawVideoStream, src: null }); // Update with actual stream

      if (config.blurVideo === 'yes') {
        updateLocalStreamProperties(streamId, { viewable: false, sendable: false });
        const videoElem = document.createElement('video');
        videoElem.autoplay = true;
        videoElem.muted = true;
        videoElem.srcObject = rawVideoStream;
        await new Promise<void>((resolve) => {
          videoElem.onloadedmetadata = () => videoElem.play().then(() => resolve());
        });
        const blurredStream = await backgroundChange(videoElem);
        setupStream(blurredStream, 'low', 'motion', true);
        addLocalStream('blurred', blurredStream, null, true, true); // This will be managed by its own entry
      }
    } catch (err) {
      console.error(`Error initializing camera stream ${streamId}:`, err);
      removeLocalStream(streamId); // Remove if initialization failed
    }
  }
}

// Teardown for a specific stream
async function teardownStreamResource(streamId: string, streamData: any) {
  if (streamData.stream) {
    await tearDownStream(streamData.stream);
  }
  if (streamData.type === 'audio') {
    const audioNodes = getAudioProcessingContext(streamId);
    stopProcessingAudio(audioNodes);
    removeAudioProcessingContext(streamId);
    if (audioCbFunction) audioCbFunction(0);
  }
  // If it's a 'camera' stream that was blurred, its 'blurred' counterpart is a separate entry
  // and will be handled by its own removal from streamStore.
}

// Subscribe to streamStore to manage stream lifecycles
streamStore.subscribe(async (currentStreamState) => {
  const currentLocalStreams = currentStreamState.localStreams;
  const currentConfig = getAllConfig().media;

  // Detect added streams
  for (const streamId in currentLocalStreams) {
    if (!prevLocalStreamsState[streamId]) {
      const streamData = currentLocalStreams[streamId];
      if (streamData.type === 'audio') {
        await manageAudioStream(streamId, streamData, currentConfig);
      } else if (streamData.type === 'camera') {
        await manageCameraStream(streamId, streamData, currentConfig);
      }
      // 'blurred' streams are added by manageCameraStream, not directly by user toggle
    }
  }

  // Detect removed streams
  for (const streamId in prevLocalStreamsState) {
    if (!currentLocalStreams[streamId]) {
      const streamData = prevLocalStreamsState[streamId];
      await teardownStreamResource(streamId, streamData);
      // If a 'camera' stream is removed, and blur was on, ensure its 'blurred' counterpart is also removed.
      if (streamData.type === 'camera' && currentConfig.blurVideo === 'yes') {
        const blurredStreams = getLocalStreamsByType('blurred');
        // This assumes a naming convention or relation if multiple cameras could be blurred.
        // For simplicity, let's assume one primary blurred stream if any.
        for (const blurredId of Object.keys(blurredStreams)) {
          // Check if this blurred stream was derived from the camera stream being removed.
          // This logic might need refinement if we store relation between camera and blurred stream.
          // For now, if a camera is removed and blur is on, we remove *all* blurred streams.
          // This is a simplification and might need a more robust link if multiple cameras are supported.
          const bStream = prevLocalStreamsState[blurredId] || currentLocalStreams[blurredId];
          if (bStream) await teardownStreamResource(blurredId, bStream);
          removeLocalStream(blurredId); // Ensure it's removed from store
        }
      }
    }
  }
  prevLocalStreamsState = { ...currentLocalStreams };
});

configStore.subscribe(async (newConfig) => {
  const currentStreams = getStreamState().localStreams; // Get latest streams

  // Handle audio device change if an audio stream is active
  if (newConfig.media.audioDevice !== prevConfigState.media.audioDevice) {
    const audioStreams = getLocalStreamsByType('audio');
    for (const streamId in audioStreams) {
      if (currentStreams[streamId] && currentStreams[streamId].stream) {
        await teardownStreamResource(streamId, currentStreams[streamId]);
        // Re-initialize with new device by treating it as a new stream for manageAudioStream
        // but we need to ensure it uses the new device from newConfig.media.audioDevice
        const placeholderData = {
          ...currentStreams[streamId],
          stream: null,
          src: newConfig.media.audioDevice
        };
        await manageAudioStream(streamId, placeholderData, newConfig.media);
      }
    }
  }

  // Handle video device change if a camera stream is active
  if (newConfig.media.videoDevice !== prevConfigState.media.videoDevice) {
    const cameraStreams = getLocalStreamsByType('camera');
    for (const streamId in cameraStreams) {
      if (currentStreams[streamId] && currentStreams[streamId].stream) {
        // Teardown existing camera and any associated blurred stream
        const oldCameraStreamData = currentStreams[streamId];
        await teardownStreamResource(streamId, oldCameraStreamData);
        const blurredStreams = getLocalStreamsByType('blurred'); // Check for related blurred
        for (const blurredId of Object.keys(blurredStreams)) {
          // Simplified: remove all blurred streams if video device changes
          const bStream = currentStreams[blurredId] || prevLocalStreamsState[blurredId];
          if (bStream) await teardownStreamResource(blurredId, bStream);
          removeLocalStream(blurredId);
        }
        // Re-initialize with new device
        const placeholderData = {
          ...currentStreams[streamId],
          stream: null,
          src: newConfig.media.videoDevice
        };
        await manageCameraStream(streamId, placeholderData, newConfig.media);
      }
    }
  }

  // Handle blur video change
  if (newConfig.media.blurVideo !== prevConfigState.media.blurVideo) {
    const cameraStreams = getLocalStreamsByType('camera');
    for (const streamId in cameraStreams) {
      const cameraStreamData = currentStreams[streamId];
      if (cameraStreamData && cameraStreamData.stream) {
        // Ensure camera stream exists and is materialized
        if (newConfig.media.blurVideo === 'yes') {
          // Blur turned ON
          updateLocalStreamProperties(streamId, { viewable: false, sendable: false });
          const videoElem = document.createElement('video');
          videoElem.autoplay = true;
          videoElem.muted = true;
          videoElem.srcObject = cameraStreamData.stream;
          await new Promise<void>((resolve) => {
            videoElem.onloadedmetadata = () => videoElem.play().then(() => resolve());
          });
          const blurredVersion = await backgroundChange(videoElem);
          setupStream(blurredVersion, 'low', 'motion', true);
          addLocalStream('blurred', blurredVersion, null, true, true);
        } else {
          // Blur turned OFF
          updateLocalStreamProperties(streamId, { viewable: true, sendable: true });
          const blurredStreams = getLocalStreamsByType('blurred');
          for (const blurredId of Object.keys(blurredStreams)) {
            const bStream = currentStreams[blurredId] || prevLocalStreamsState[blurredId];
            if (bStream) await teardownStreamResource(blurredId, bStream);
            removeLocalStream(blurredId);
          }
        }
      }
    }
  }
  prevConfigState = { ...newConfig };
});
