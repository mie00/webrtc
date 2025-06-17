import {
  addLocalStream,
  removeLocalStream,
  getLocalStreamsByType,
  updateLocalStreamProperties,
  getIsAudioEnabled,
  getIsCameraEnabled,
  getLocalStreamByDeviceId,
  getIsDeviceStreamActive // Import new helper
} from '../stores/streamStore';
import { getAllConfig, configStore, type Config } from '../stores/configStore';
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
  const oldConfigMedia = prevConfig.media;
  const newConfigMedia = newConfig.media;
  prevConfig = { ...newConfig }; // Update prevConfig for the next run

  // Handle blurVideo changes
  if (oldConfigMedia.blurVideo !== newConfigMedia.blurVideo) {
    if (newConfigMedia.blurVideo === 'yes') {
      // Blur turned ON: find active 'camera' streams and create 'blurred' versions
      const cameraStreamsToBlur = getLocalStreamsByType('camera');
      for (const [camStreamId, camStreamData] of Object.entries(cameraStreamsToBlur)) {
        if (camStreamData.stream && camStreamData.viewable) {
          // Only blur viewable (non-blurred) camera streams
          updateLocalStreamProperties(camStreamId, { viewable: false, sendable: false });
          try {
            const videoElem = document.createElement('video');
            videoElem.autoplay = true;
            videoElem.muted = true;
            videoElem.srcObject = camStreamData.stream;
            await new Promise<void>((resolve, reject) => {
              videoElem.onloadedmetadata = () => videoElem.play().then(resolve).catch(reject);
              videoElem.onerror = (e) => reject(e);
            });
            const blurredVersion = await backgroundChange(videoElem);
            setupStream(blurredVersion, 'low', 'motion', true);
            addLocalStream('blurred', blurredVersion, null, true, true, camStreamData.deviceId);
          } catch (error) {
            console.error(`Failed to create blurred stream for ${camStreamId}:`, error);
            updateLocalStreamProperties(camStreamId, { viewable: true, sendable: true }); // Revert
          }
        }
      }
    } else {
      // Blur turned OFF: remove 'blurred' streams and make original 'camera' streams viewable
      const blurredStreamsToRemove = getLocalStreamsByType('blurred');
      for (const [blurredStreamId, blurredStreamData] of Object.entries(blurredStreamsToRemove)) {
        if (blurredStreamData.stream) await tearDownStream(blurredStreamData.stream);
        removeLocalStream(blurredStreamId);

        // Find the original camera stream using deviceId
        if (blurredStreamData.deviceId) {
          const originalCamStreamEntry = getLocalStreamByDeviceId(
            'camera',
            blurredStreamData.deviceId
          );
          if (originalCamStreamEntry) {
            const [originalCamStreamId] = originalCamStreamEntry;
            updateLocalStreamProperties(originalCamStreamId, { viewable: true, sendable: true });
          }
        }
      }
    }
  }
  // Note: Changes to default audioDevice/videoDevice in config no longer auto-restart streams.
});

// Helper functions to enable/disable streams
export async function enableAudio(requestedDeviceId?: string): Promise<void> {
  const config = getAllConfig();
  // Determine the target device: specific if requested, otherwise default from config
  const targetDeviceId = requestedDeviceId || config.media.audioDevice;

  // Prevent starting if the specific stream is already active
  if (
    targetDeviceId &&
    targetDeviceId !== '<auto>' &&
    getIsDeviceStreamActive('audio', targetDeviceId)
  ) {
    console.warn(`Audio stream for device ${targetDeviceId} is already active.`);
    return;
  }
  // If main toggle (no requestedDeviceId) and default is <auto>, only proceed if no audio is active at all.
  // This case is mostly handled by UI calling disableAudio if getIsAudioEnabled() is true.
  if (!requestedDeviceId && targetDeviceId === '<auto>' && getIsAudioEnabled()) {
    console.warn('Audio is already enabled. Main toggle should call disableAudio().');
    return;
  }

  let audioConstraints: boolean | MediaTrackConstraints = true;
  let effectiveDeviceId: string | undefined = targetDeviceId; // Will store the actual deviceId if <auto>

  if (targetDeviceId && targetDeviceId !== '<auto>') {
    const deviceInfo = targetDeviceId.split('|');
    audioConstraints =
      deviceInfo.length === 2
        ? { groupId: deviceInfo[0], deviceId: deviceInfo[1] }
        : { deviceId: targetDeviceId };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    if (targetDeviceId === '<auto>') {
      effectiveDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId || undefined;
      // Check again if this auto-selected device is already active (edge case)
      if (effectiveDeviceId && getIsDeviceStreamActive('audio', effectiveDeviceId)) {
        console.warn(
          `Auto-selected audio device ${effectiveDeviceId} is already active. Stopping redundant stream.`
        );
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
    }

    setupStream(stream, 'high');
    const streamId = addLocalStream('audio', stream, null, true, true, effectiveDeviceId);

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
  } catch (error) {
    console.error('Failed to enable audio:', error);
  }
}

export async function disableAudio(specificDeviceId?: string): Promise<void> {
  if (specificDeviceId) {
    // Disable a specific audio stream
    const streamEntry = getLocalStreamByDeviceId('audio', specificDeviceId);
    if (streamEntry) {
      const [streamId, streamData] = streamEntry;
      if (streamData.stream) {
        await tearDownStream(streamData.stream);
        const audioNodes = getAudioProcessingContext(streamId);
        stopProcessingAudio(audioNodes);
        removeAudioProcessingContext(streamId); // Important: use the unique streamId
      }
      removeLocalStream(streamId);
    }
  } else {
    // Disable all audio streams
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
  }
  // If all audio streams are now disabled, call the callback with 0
  if (!getIsAudioEnabled() && audioCbFunction) {
    audioCbFunction(0);
  }
}

export async function enableCamera(requestedDeviceId?: string): Promise<void> {
  const globalConfig = getAllConfig();
  const targetDeviceId = requestedDeviceId || globalConfig.media.videoDevice;

  if (
    targetDeviceId &&
    targetDeviceId !== '<auto>' &&
    getIsDeviceStreamActive('camera', targetDeviceId)
  ) {
    console.warn(`Camera stream for device ${targetDeviceId} is already active.`);
    return;
  }
  if (!requestedDeviceId && targetDeviceId === '<auto>' && getIsCameraEnabled()) {
    console.warn('Camera is already enabled. Main toggle should call disableCamera().');
    return;
  }

  let videoConstraints: boolean | MediaTrackConstraints = true;
  let effectiveDeviceId: string | undefined = targetDeviceId;

  if (targetDeviceId && targetDeviceId !== '<auto>') {
    const deviceInfo = targetDeviceId.split('|');
    videoConstraints =
      deviceInfo.length === 2
        ? { groupId: deviceInfo[0], deviceId: deviceInfo[1] }
        : { deviceId: targetDeviceId };
  }

  try {
    const rawVideoStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
    if (targetDeviceId === '<auto>') {
      effectiveDeviceId = rawVideoStream.getVideoTracks()[0]?.getSettings().deviceId || undefined;
      if (effectiveDeviceId && getIsDeviceStreamActive('camera', effectiveDeviceId)) {
        console.warn(
          `Auto-selected camera device ${effectiveDeviceId} is already active. Stopping redundant stream.`
        );
        rawVideoStream.getTracks().forEach((track) => track.stop());
        return;
      }
    }

    setupStream(rawVideoStream, 'low', 'motion', true);
    const shouldBlur = globalConfig.media.blurVideo === 'yes';
    const rawCameraStreamId = addLocalStream(
      'camera',
      rawVideoStream,
      null,
      !shouldBlur, // viewable only if not blurring
      !shouldBlur, // sendable only if not blurring
      effectiveDeviceId
    );

    if (shouldBlur) {
      updateLocalStreamProperties(rawCameraStreamId, { viewable: false, sendable: false });
      try {
        const videoElem = document.createElement('video');
        videoElem.autoplay = true;
        videoElem.muted = true;
        videoElem.srcObject = rawVideoStream;
        await new Promise<void>((resolve, reject) => {
          videoElem.onloadedmetadata = () => videoElem.play().then(resolve).catch(reject);
          videoElem.onerror = (e) => reject(e);
        });
        const blurredStream = await backgroundChange(videoElem);
        setupStream(blurredStream, 'low', 'motion', true);
        addLocalStream('blurred', blurredStream, null, true, true, effectiveDeviceId);
      } catch (error) {
        console.error('Failed to apply background blur on new camera device:', error);
        updateLocalStreamProperties(rawCameraStreamId, { viewable: true, sendable: true }); // Revert
      }
    }
  } catch (error) {
    console.error('Failed to enable camera:', error);
  }
}

export async function disableCamera(specificDeviceId?: string): Promise<void> {
  if (specificDeviceId) {
    // Disable specific camera stream and its corresponding blurred stream
    const cameraStreamEntry = getLocalStreamByDeviceId('camera', specificDeviceId);
    if (cameraStreamEntry) {
      const [camId, camData] = cameraStreamEntry;
      if (camData.stream) await tearDownStream(camData.stream);
      removeLocalStream(camId);
    }
    const blurredStreamEntry = getLocalStreamByDeviceId('blurred', specificDeviceId);
    if (blurredStreamEntry) {
      const [blurId, blurData] = blurredStreamEntry;
      if (blurData.stream) await tearDownStream(blurData.stream);
      removeLocalStream(blurId);
    }
  } else {
    // Disable all camera and blurred streams
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

// Helper functions for device changes (restartAudioWithDevice, restartCameraWithDevice)
// are removed as changing default device in config no longer auto-restarts streams.
