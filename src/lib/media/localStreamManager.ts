import {
  addLocalStream,
  removeLocalStream,
  getLocalStreamsByType,
  updateLocalStreamProperties,
  isAudioEnabled,
  isCameraEnabled
} from '../stores/streamStore';
import { getAllConfig, configStore, type Config, type MediaConfig } from '../stores/configStore';
import { getLocalFileStreamState } from '../stores/localFileStreamStore';
import { setupStream, processAudio, stopProcessingAudio, tearDownStream } from './stream';
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
        // If audio is currently enabled, restart with new device
        if (isAudioEnabled()) {
          await restartAudioWithDevice(newConfig.media.audioDevice);
        }
      } else if (key === 'videoDevice') {
        // If camera is currently enabled, restart with new device
        if (isCameraEnabled()) {
          await restartCameraWithDevice(newConfig.media.videoDevice);
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

// Helper functions to enable/disable streams
export async function enableAudio(deviceId?: string): Promise<void> {
  // Clean up existing audio streams
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

  const config = getAllConfig();
  const deviceString = deviceId || config.media.audioDevice || '';
  const deviceInfo = deviceString.split('|') || [];
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
}

export async function disableAudio(): Promise<void> {
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

export async function enableCamera(deviceId?: string): Promise<void> {
  const globalConfig = getAllConfig();

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

  const deviceString = deviceId || globalConfig.media.videoDevice || '';
  const deviceInfo = deviceString.split('|') || [];
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
}

export async function disableCamera(): Promise<void> {
  const cameraStreams = getLocalStreamsByType('camera');
  for (const [streamId, streamData] of Object.entries(cameraStreams)) {
    if (streamData.stream) await tearDownStream(streamData.stream);
    removeLocalStream(streamId);
  }
  const blurredStreams = getLocalStreamsByType('blurred');
  for (const [streamId, streamData] of Object.entries(blurredStreams)) {
    if (streamData.stream) await tearDownStream(streamData.stream);
    removeLocalStream(streamId);
  }
}

export async function enableScreenSharing(): Promise<void> {
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
}

export async function disableScreenSharing(): Promise<void> {
  const screenStreams = getLocalStreamsByType('screen');
  for (const [streamId, streamData] of Object.entries(screenStreams)) {
    if (streamData.stream) await tearDownStream(streamData.stream);
    removeLocalStream(streamId);
  }
}

export async function enableFileStream(fileUrl: string): Promise<void> {
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
  addLocalStream('file', null, fileUrl, true, false);
}

export async function disableFileStream(): Promise<void> {
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

// Helper functions for device changes
async function restartAudioWithDevice(deviceId?: string): Promise<void> {
  if (isAudioEnabled()) {
    await enableAudio(deviceId);
  }
}

async function restartCameraWithDevice(deviceId?: string): Promise<void> {
  if (isCameraEnabled()) {
    await enableCamera(deviceId);
  }
}
