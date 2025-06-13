import { get } from 'svelte/store';
import { getStreamState } from '../stores/streamStore';
import type { IRecorder, RecorderState } from './recorderTypes'; // Ensure RecorderState is imported if used by the wrapper
import { electronAPI } from './recorderTypes';

interface ElectronRecorderInternalState {
  recorders: Record<
    string,
    { recorder: MediaRecorder; fileIdentifier: string; firstChunkSent: boolean }
  >;
  updateIntervalId: number | null;
}

export class ElectronRecorder implements IRecorder {
  private internalState: ElectronRecorderInternalState = {
    recorders: {},
    updateIntervalId: null
  };

  constructor() {
    if (!electronAPI) {
      // This case should ideally be prevented by the factory in recorder.ts
      throw new Error('Electron API not available for ElectronRecorder.');
    }
  }

  async start(): Promise<void> {
    console.log('Electron recording started via ElectronRecorder.');
    this.internalState.recorders = {}; // Clear any previous recorders
    await this.updateStreams(); // Initial update
    this.internalState.updateIntervalId = window.setInterval(() => this.updateStreams(), 2000);
  }

  stop(): void {
    console.log('Electron recording stopped via ElectronRecorder.');
    if (this.internalState.updateIntervalId) {
      clearInterval(this.internalState.updateIntervalId);
      this.internalState.updateIntervalId = null;
    }
    Object.values(this.internalState.recorders).forEach(({ recorder }) => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    });
    // Recorders are removed from internalState within their 'onstop' handlers
    // For safety, clear here too, though onstop should handle individual cleanup.
    this.internalState.recorders = {};
  }

  private async updateStreams(): Promise<void> {
    // If stop has been called and cleared the interval, don't proceed.
    if (
      !this.internalState.updateIntervalId &&
      Object.keys(this.internalState.recorders).length === 0
    ) {
      // Check if global recording state is also false, via the singleton wrapper if necessary.
      // This is a safeguard. The primary control is that start() sets the interval, stop() clears it.
      if (
        electronRecorderSingletonWrapper.recorderStore &&
        !get(electronRecorderSingletonWrapper.recorderStore).isRecording
      ) {
        return;
      }
    }

    const streamState = getStreamState();
    const activeStreamKeys = new Set<string>();

    const processStream = async (
      streamKey: string,
      stream: MediaStream,
      cid: string,
      type: 'local' | 'remote'
    ) => {
      activeStreamKeys.add(streamKey);
      if (!this.internalState.recorders[streamKey] && stream.active) {
        const timestamp = Date.now();
        const sanitizedStreamKey = streamKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);
        const fileIdentifier = `rec-${cid}-${type}-${sanitizedStreamKey}-${timestamp}`;

        const options = window.isFirefox
          ? { mimeType: 'video/webm' }
          : { mimeType: 'video/webm; codecs=vp9' };
        const recorder = new MediaRecorder(stream, options);

        const recorderWrapper = {
          recorder,
          fileIdentifier,
          firstChunkSent: false
        };

        recorder.ondataavailable = async (event: BlobEvent) => {
          if (event.data.size > 0 && electronAPI) {
            try {
              const buffer = await event.data.arrayBuffer();
              await electronAPI.writeChunk(recorderWrapper.fileIdentifier, buffer);
              if (!recorderWrapper.firstChunkSent) {
                recorderWrapper.firstChunkSent = true;
              }
            } catch (err) {
              console.error(`Error sending chunk to Electron main for ${fileIdentifier}:`, err);
            }
          }
        };

        recorder.onstop = async () => {
          if (electronAPI && recorderWrapper.firstChunkSent) {
            await electronAPI.finalizeFile(recorderWrapper.fileIdentifier);
          }
          // Clean up this specific recorder from internal state
          // Ensure not to modify the object while iterating if issues arise, e.g. by collecting keys to delete
          delete this.internalState.recorders[streamKey];
        };

        recorder.onerror = (event) => {
          console.error('MediaRecorder error for stream', streamKey, fileIdentifier, event);
        };

        recorder.start(1000); // Timeslice: 1s chunks
        this.internalState.recorders[streamKey] = recorderWrapper;
        console.log(
          `Started Electron recording for stream: ${streamKey}, file: ${fileIdentifier}.webm`
        );
      }
    };

    // Process local streams
    for (const [key, data] of Object.entries(streamState.localStreams)) {
      if (data.stream && data.sendable) {
        await processStream(`local-${key}`, data.stream, 'localuser', 'local');
      }
    }

    // Process remote streams
    for (const peerData of Object.values(streamState.remoteStreams)) {
      for (const [key, stream] of Object.entries(peerData.streams)) {
        await processStream(`remote-${peerData.peerId}-${key}`, stream, peerData.peerId, 'remote');
      }
    }

    // Stop recorders for streams that are no longer active or present
    for (const [streamKey, recorderWrapper] of Object.entries(this.internalState.recorders)) {
      if (!activeStreamKeys.has(streamKey)) {
        console.log(`Stopping Electron recording for obsolete stream: ${streamKey}`);
        if (recorderWrapper.recorder.state === 'recording') {
          recorderWrapper.recorder.stop();
        }
      }
    }
  }
}

// Wrapper to allow ElectronRecorder to access the main recorderStore if absolutely needed,
// primarily for the safeguard check in updateStreams.
// Initialized by recorder.ts.
export const electronRecorderSingletonWrapper: {
  recorderStore: import('svelte/store').Writable<RecorderState> | null;
} = {
  recorderStore: null
};
