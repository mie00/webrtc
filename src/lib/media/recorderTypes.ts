// @ts-ignore (electronRecorderAPI is injected by preload script in Electron environments)
export const electronAPI =
  typeof window !== 'undefined' && window.electronRecorderAPI
    ? window.electronRecorderAPI
    : undefined;

export interface IRecorder {
  start(): Promise<void>;
  stop(): void;
}

export interface RecorderState {
  isRecording: boolean;
  // error: string | null; // Optional: for UI feedback on recording errors
}

// Constants for recording dimensions, primarily for browser merger
export const RECORDER_FW = 1920;
export const RECORDER_FH = 1080;

// Interface for stream information, used by browser recorder for layout and calculateFit
export interface StreamInfo {
  id: string; // Normalized stream ID
  key: string; // Original key from streamStore (e.g., local-camera, remote-peerId-streamId)
  stream: MediaStream;
}
