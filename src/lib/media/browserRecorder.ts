import { VideoStreamMerger, type AddStreamOptions } from 'video-stream-merger';
import { getStreamState } from '../stores/streamStore';
import { normalizeStreamId } from './stream';
import { calculateGridPositions, type Position } from './streamLayout';
import { getStreamMetadata } from '../stores/localFileStreamStore';
import type { IRecorder, StreamInfo } from './recorderTypes';
import { RECORDER_FW, RECORDER_FH } from './recorderTypes';
import { calculateFit } from './recorder'; // calculateFit is in recorder.ts

interface BrowserRecorderInternalState {
  merger: VideoStreamMerger | null;
  mediaRecorder: MediaRecorder | null;
  updateIntervalId: number | null;
  lastStreamKeys: Set<string>; // Keys of streams currently in the merger
}

export class BrowserRecorder implements IRecorder {
  private internalState: BrowserRecorderInternalState = {
    merger: null,
    mediaRecorder: null,
    updateIntervalId: null,
    lastStreamKeys: new Set()
  };

  async start(): Promise<void> {
    console.log('Browser recording started via BrowserRecorder.');
    const merger = new VideoStreamMerger();
    merger.setOutputSize(RECORDER_FW, RECORDER_FH);
    this.internalState.merger = merger;

    await this.updateStreamsInMerger(); // Initial stream setup
    merger.start();

    const options = window.isFirefox
      ? { mimeType: 'video/webm' }
      : { mimeType: 'video/webm; codecs=vp9' };
    const mediaRecorder = new MediaRecorder(merger.result!, options);
    this.internalState.mediaRecorder = mediaRecorder;

    mediaRecorder.ondataavailable = async (ev: BlobEvent) => {
      if (ev.data.size > 0) {
        const anchor = document.createElement('a');
        anchor.href = window.URL.createObjectURL(ev.data);
        anchor.download = `mie-webrtc-video-${Date.now()}.webm`;
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(() => {
          document.body.removeChild(anchor);
          window.URL.revokeObjectURL(anchor.href);
        }, 100);
      }
    };

    mediaRecorder.start();
    this.internalState.updateIntervalId = window.setInterval(
      () => this.updateStreamsInMerger(),
      1000
    );
  }

  stop(): void {
    console.log('Browser recording stopped via BrowserRecorder.');
    if (
      this.internalState.mediaRecorder &&
      this.internalState.mediaRecorder.state === 'recording'
    ) {
      this.internalState.mediaRecorder.stop();
    }
    if (this.internalState.merger) {
      this.internalState.merger.destroy();
    }
    if (this.internalState.updateIntervalId) {
      clearInterval(this.internalState.updateIntervalId);
    }
    this.internalState = {
      merger: null,
      mediaRecorder: null,
      updateIntervalId: null,
      lastStreamKeys: new Set()
    };
  }

  private getAspectRatio(stream: MediaStream): number {
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const settings = videoTrack.getSettings();
      if (settings.width && settings.height && settings.width > 0 && settings.height > 0) {
        return settings.width / settings.height;
      }
    }
    const streamMetadata = getStreamMetadata(normalizeStreamId(stream.id || ''));
    if (streamMetadata?.width && streamMetadata?.height) {
      return streamMetadata.width / streamMetadata.height;
    }
    return 16 / 9; // Default aspect ratio
  }

  private async updateStreamsInMerger(): Promise<void> {
    if (!this.internalState.merger) return;
    const merger = this.internalState.merger;
    const streamState = getStreamState();

    const currentVideoStreams: StreamInfo[] = [];
    const currentAudioStreams: StreamInfo[] = []; // Using StreamInfo for consistency, key and stream are relevant

    // Collect local streams
    Object.entries(streamState.localStreams).forEach(([key, data]) => {
      if (data.stream && data.sendable) {
        const streamInfo: StreamInfo = {
          id: normalizeStreamId(data.stream.id || key),
          key: `local-${key}`,
          stream: data.stream
        };
        if (data.stream.getVideoTracks().length > 0) currentVideoStreams.push(streamInfo);
        else if (data.stream.getAudioTracks().length > 0) currentAudioStreams.push(streamInfo);
      }
    });

    // Collect remote streams
    Object.values(streamState.remoteStreams).forEach((peerData) => {
      Object.entries(peerData.streams).forEach(([streamId, stream]) => {
        const key = `remote-${peerData.peerId}-${streamId}`;
        const streamInfo: StreamInfo = {
          id: normalizeStreamId(stream.id || streamId),
          key,
          stream
        };
        if (stream.getVideoTracks().length > 0) currentVideoStreams.push(streamInfo);
        else if (stream.getAudioTracks().length > 0) currentAudioStreams.push(streamInfo);
      });
    });

    const newStreamKeys = new Set(
      [...currentVideoStreams, ...currentAudioStreams].map((s) => s.key)
    );
    const oldStreamKeys = this.internalState.lastStreamKeys;

    // Remove streams no longer present
    oldStreamKeys.forEach((key) => {
      if (!newStreamKeys.has(key)) {
        try {
          merger.removeStream(key);
        } catch (e) {
          console.warn(`Error removing stream key ${key} from merger:`, e);
        }
      }
    });

    // Add new video streams
    const streamInfoForLayout = currentVideoStreams.map((s) => ({
      id: s.id,
      aspectRatio: this.getAspectRatio(s.stream)
    }));
    const positions = calculateGridPositions(RECORDER_FW, RECORDER_FH, streamInfoForLayout);

    currentVideoStreams.forEach((streamInfo) => {
      if (!oldStreamKeys.has(streamInfo.key)) {
        const position = positions.find((p) => p.id === streamInfo.id);
        if (!position) {
          console.warn(
            `No position found for video stream ${streamInfo.key} (id ${streamInfo.id})`
          );
          return;
        }
        const { dx, dy, width, height } = calculateFit(position, streamInfo);
        const videoOptions: Partial<AddStreamOptions> = {
          x: position.x + dx,
          y: position.y + dy,
          width,
          height,
          mute: false,
          index: 0 // Adjust index for layering if needed
        };
        merger.addStream(streamInfo.stream, videoOptions as AddStreamOptions);
      }
    });

    // Add new audio-only streams
    currentAudioStreams.forEach((streamInfo) => {
      if (!oldStreamKeys.has(streamInfo.key)) {
        const audioOptions: Partial<AddStreamOptions> = { mute: false };
        merger.addStream(streamInfo.stream, audioOptions as AddStreamOptions);
      }
    });
    this.internalState.lastStreamKeys = newStreamKeys;
  }
}
