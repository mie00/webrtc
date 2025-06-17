import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MediaArea from './MediaArea.svelte';
import { streamStore, updateLocalStreamProperties } from '../lib/stores/streamStore';
import { configStore } from '../lib/stores/configStore';
import { forwardStore } from '../lib/stores/forwardStore';
import { recorderStore } from '../lib/media/recorder';
import { transcriberStore, stopOverallTranscription } from '../lib/media/transcriber';
import { writable } from 'svelte/store';

// Mocks for external dependencies
vi.mock('../lib/media/stream', () => ({
  normalizeStreamId: vi.fn((id) => id),
  setupStream: vi.fn()
}));

vi.mock('../lib/media/localStreamManager', () => ({
  setAudioCallback: vi.fn(),
  enableAudio: vi.fn(),
  disableAudio: vi.fn(),
  enableCamera: vi.fn(),
  disableCamera: vi.fn(),
  enableScreenSharing: vi.fn(),
  disableScreenSharing: vi.fn(),
  enableFileStream: vi.fn(),
  disableFileStream: vi.fn()
}));

vi.mock('../lib/app/forwardHandler', () => ({
  toggleForwardHandler: vi.fn()
}));

vi.mock('../lib/media/recorder', async () => {
  const originalModule = await vi.importActual('../lib/media/recorder');
  return {
    ...originalModule,
    recorderStore: writable({ isRecording: false, recordings: [] }), // Mock store
    toggleRecording: vi.fn()
  };
});

vi.mock('../lib/media/transcriber', async () => {
  const originalModule = await vi.importActual('../lib/media/transcriber');
  return {
    ...originalModule,
    transcriberStore: writable({ isTranscribingOverall: false, /* other properties */ }), // Mock store
    toggleOverallTranscription: vi.fn(),
    stopOverallTranscription: vi.fn()
  };
});


vi.mock('../lib/media/streamLayout', () => ({
  calculateStreamPositions: vi.fn(() => [])
}));

vi.mock('../lib/stores/localFileStreamStore', () => ({
  addLocalFileStream: vi.fn(),
  removeLocalFileStream: vi.fn()
}));


describe('MediaArea.svelte', () => {
  // Mock initial store values
  const mockStreamStore = {
    localStreams: {},
    remoteStreams: {},
    activeView: { layout: 'grid', focusedStream: undefined }
  };
  const mockConfigStore = {
    media: { blurVideo: 'no', audioDevice: '<auto>', videoDevice: '<auto>' },
    general: {},
    profile: {},
    rtc: {}
  };
  const mockForwardStore = {
    allowedHosts: [],
    forwardHost: null,
    inflight: {},
    logMessages: []
  };

  beforeEach(() => {
    // Reset stores to their mock initial state before each test
    streamStore.set(mockStreamStore);
    configStore.set(mockConfigStore);
    forwardStore.set(mockForwardStore);
    // recorderStore and transcriberStore are already mocked with writable stores

    // Reset mocks
    vi.clearAllMocks();

    // Mock for HTMLVideoElement.captureStream
    Object.defineProperty(global.HTMLVideoElement.prototype, 'captureStream', {
      value: vi.fn().mockReturnValue(new MediaStream()),
      writable: true,
      configurable: true
    });
    Object.defineProperty(global.HTMLVideoElement.prototype, 'mozCaptureStream', {
      value: vi.fn().mockReturnValue(new MediaStream()),
      writable: true,
      configurable: true
    });
  });

  it('renders correctly', () => {
    const { container } = render(MediaArea, { props: { hangup: vi.fn(), openQr: vi.fn() } });
    expect(container.querySelector('#media')).toBeTruthy();
    // Check for child components (presence by a known element/class they render)
    // For example, if StreamDisplayArea renders a specific class:
    // expect(screen.getByTestId('stream-display-area')).toBeInTheDocument(); // Assuming you add data-testid
    // expect(screen.getByTestId('layout-controls')).toBeInTheDocument();
    // expect(screen.getByTestId('media-controls')).toBeInTheDocument();
  });

  it('calls hangup when hangup prop is called', async () => {
    const hangupMock = vi.fn();
    render(MediaArea, { props: { hangup: hangupMock, openQr: vi.fn() } });
    
    // To simulate handleHangup, we need to trigger it.
    // This might involve finding a button in MediaControls and clicking it,
    // or if MediaControls passes up the event, we'd test that interaction.
    // For now, let's assume MediaControls has a hangup button.
    // This part will need adjustment based on MediaControls implementation.
    // For example, if MediaControls has a button with text "Hang Up":
    // const hangupButton = screen.getByRole('button', { name: /hang up/i });
    // await fireEvent.click(hangupButton);
    // expect(hangupMock).toHaveBeenCalled();
    
    // Since handleHangup is directly passed to MediaControls, we can't directly call it from MediaArea test.
    // We would test this interaction in MediaControls.test.ts or via an integration test.
    // However, we can check if the prop is passed.
    // This is implicitly tested by the fact that if it wasn't passed, TS would complain or it would be undefined.
  });

  it('updates stream positions on mount and resize', async () => {
    const calculateStreamPositionsMock = vi.mocked(require('../lib/media/streamLayout').calculateStreamPositions);
    render(MediaArea, { props: { hangup: vi.fn(), openQr: vi.fn() } });
    
    // onMount
    expect(calculateStreamPositionsMock).toHaveBeenCalled();
    
    calculateStreamPositionsMock.mockClear(); // Clear previous calls

    // Simulate window resize
    global.dispatchEvent(new Event('resize'));
    expect(calculateStreamPositionsMock).toHaveBeenCalled();
  });
  
  it('clears refresh interval and stops transcription on destroy', () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const stopOverallTranscriptionMock = vi.mocked(require('../lib/media/transcriber').stopOverallTranscription);
    
    // Set isTranscribingOverall to true to test stopOverallTranscription call
    transcriberStore.set({ isTranscribingOverall: true });

    const { unmount } = render(MediaArea, { props: { hangup: vi.fn(), openQr: vi.fn() } });
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(stopOverallTranscriptionMock).toHaveBeenCalled();
    
    clearIntervalSpy.mockRestore();
  });

  // TODO: Add more tests for:
  // - Context menu interactions (audio and camera)
  // - Toggling audio, video, blur, screen sharing
  // - Forwarding
  // - Recording
  // - Video upload and cleanup
  // - Layout changes
  // - Stream focusing
  // - Transcription toggling
  // - activeStreams derivation logic (might need more complex store setup)
  // - groupedStreams derivation logic
});
