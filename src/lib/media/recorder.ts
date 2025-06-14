import { writable, get } from 'svelte/store';
import type { IRecorder, RecorderState } from './recorderTypes';
import { electronAPI } from './recorderTypes';
import { BrowserRecorder } from './browserRecorder';
import { ElectronRecorder, electronRecorderSingletonWrapper } from './electronRecorder';

export const recorderStore = writable<RecorderState>({
  isRecording: false
  // error: null // Optional: for UI feedback
});

// Initialize the singleton wrapper for ElectronRecorder if in Electron environment
if (electronAPI) {
  electronRecorderSingletonWrapper.recorderStore = recorderStore;
}

const activeRecorder: IRecorder = electronAPI ? new ElectronRecorder() : new BrowserRecorder();

export async function startRecording(): Promise<void> {
  if (get(recorderStore).isRecording) {
    console.warn('Recording is already in progress.');
    return;
  }
  try {
    await activeRecorder.start();
    recorderStore.update((s) => ({ ...s, isRecording: true /*, error: null */ }));
  } catch (error: any) {
    console.error('Failed to start recording:', error);
    recorderStore.update((s) => ({ ...s, isRecording: false /*, error: error.message */ }));
    throw error; // Re-throw to allow UI to handle if needed
  }
}

export function stopRecording(): void {
  if (!get(recorderStore).isRecording) {
    // console.warn('Recording is not in progress.'); // Can be noisy if UI allows spamming stop
    return;
  }
  try {
    activeRecorder.stop();
    recorderStore.update((s) => ({ ...s, isRecording: false }));
  } catch (error: any) {
    console.error('Failed to stop recording:', error);
    // Still update store to reflect intent, but maybe set an error
    recorderStore.update((s) => ({ ...s, isRecording: false /*, error: error.message */ }));
    throw error;
  }
}

export function toggleRecording(): void {
  const currentlyRecording = get(recorderStore).isRecording;
  if (currentlyRecording) {
    stopRecording();
  } else {
    startRecording().catch((_error) => {
      // Error is already logged by startRecording and store updated
      // UI can subscribe to recorderStore.error if that field is added and used
      console.info('Toggle recording: startRecording attempt failed (error already handled).');
    });
  }
}
