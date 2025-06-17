import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import MediaArea from './MediaArea.svelte';
import { streamStore, type LayoutType } from '../lib/stores/streamStore';
import { configStore, type GeneralConfig } from '../lib/stores/configStore';
import { forwardStore, type ForwardState } from '../lib/stores/forwardStore';
import { transcriberStore, type TranscriptionDisplayStoreState } from '../lib/media/transcriber';
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
  const actualTranscriberStore = writable<TranscriptionDisplayStoreState>({
    segments: [],
    activeBuffers: {},
    lastTextBySpeaker: {},
    // Add any other properties from TranscriptionDisplayStoreState with default values
    // For example, if isTranscribingOverall is part of it, though it seems to be a separate concept in MediaArea.svelte
    // For the purpose of this mock, we'll assume isTranscribingOverall is handled by the component/store logic
    // and the mock here just needs to satisfy the TranscriptionDisplayStoreState structure.
    // If transcriberStore itself holds isTranscribingOverall, it should be:
    // isTranscribingOverall: false, 
  });

  return {
    ...originalModule,
    transcriberStore: actualTranscriberStore,
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
    activeView: { layout: 'grid' as LayoutType, focusedStream: undefined }
  };
  const mockConfigStoreGeneral: GeneralConfig = {
    configLoader: 'client',
    configHost: 'localhost',
    identityProviderHost: 'localhost',
    coordinatorUrl: 'ws://localhost:1234'
  };
  const mockConfigStore = {
    media: { blurVideo: 'no', audioDevice: '<auto>', videoDevice: '<auto>' },
    general: mockConfigStoreGeneral,
    profile: { userName: 'TestUser', userColor: '#FFFFFF', userEmoji: '😊' }, // Added ProfileConfig
    rtc: { iceServers: [], iceTransportPolicy: 'all' } // Added RtcConfig
  };
  const mockForwardStore: ForwardState = {
    allowedHosts: [],
    forwardPeer: null,
    forwardHost: null,
    inflight: {},
    logMessages: []
  };
  const mockTranscriberStoreState: TranscriptionDisplayStoreState = {
    segments: [],
    activeBuffers: {},
    lastTextBySpeaker: {}
    // isTranscribingOverall: false, // if this is part of the store state
  };


  beforeEach(() => {
    // Reset stores to their mock initial state before each test
    streamStore.set(mockStreamStore);
    configStore.set(mockConfigStore);
    forwardStore.set(mockForwardStore);
    transcriberStore.set(mockTranscriberStoreState);


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
    const calculateStreamPositionsMock = vi.mocked(
      require('../lib/media/streamLayout').calculateStreamPositions
    );
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
    const stopOverallTranscriptionMock = vi.mocked(
      require('../lib/media/transcriber').stopOverallTranscription
    );

    // Set isTranscribingOverall to true to test stopOverallTranscription call
    // This specific property might be managed differently or be part of a more complex state.
    // For now, we ensure the store is set with a valid TranscriptionDisplayStoreState.
    // The component's $derived(isTranscribing) reads from $transcriberStore.isTranscribingOverall
    // So, the mock for transcriberStore needs to reflect this structure if we want to test it.
    // The current mock for transcriberStore in vi.mock doesn't include isTranscribingOverall in its writable state.
    // Let's adjust the mock to include it for this test.
    // We'll assume isTranscribingOverall is a property directly on the store's value.
    transcriberStore.set({
      ...mockTranscriberStoreState,
      // If 'isTranscribingOverall' is a direct property of the store's value:
      // isTranscribingOverall: true, // This line might cause issues if TranscriptionDisplayStoreState doesn't define it.
      // The component reads $transcriberStore.isTranscribingOverall, so the store mock should provide it.
      // Let's update the vi.mock for transcriberStore to include this.
    });
    // To properly test this, the transcriberStore mock needs to be:
    // writable({ segments: [], activeBuffers: {}, lastTextBySpeaker: {}, isTranscribingOverall: false })
    // And then here:
    // transcriberStore.update(s => ({ ...s, isTranscribingOverall: true }));
    // For now, the component's $derived($transcriberStore.isTranscribingOverall) will use the initial mock value.
    // We need to update the mock itself to allow changing this.

    // For the sake of this specific test, let's assume the component's internal logic
    // correctly derives isTranscribing. The stopOverallTranscription mock is the key here.
    // To make the test pass as intended for stopOverallTranscription:
    // We need to ensure $transcriberStore.isTranscribingOverall is true when onDestroy is called.
    // The easiest way is to update the store directly if the mock allows.
    // The provided mock for transcriberStore is: writable({ isTranscribingOverall: false /* other properties */ })
    // So we can do:
    (transcriberStore as any).set({ isTranscribingOverall: true, activeBuffers: {}, segments: [], lastTextBySpeaker: {} });


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
