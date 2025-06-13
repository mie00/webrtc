/// <reference types="vitest/globals" />
import { get } from 'svelte/store';
import type { Mock } from 'vitest';
// Import calculateFit statically as it's a pure function and its tests are separate.
// recorderStore, startRecording, stopRecording, toggleRecording will be imported dynamically
// for the 'Recording functions (Facade)' tests.
import { calculateFit, recorderStore } from './recorder';
import type { Position } from './streamLayout';
import { getStreamMetadata as mockGetStreamMetadata } from '../stores/localFileStreamStore';
// getStreamState is used by recorder implementations, so its mock setup is still relevant if testing those deeply.
// For facade testing, it's less critical unless calculateFit or other utils depend on it here.
import { getStreamState as mockGetStreamStateOriginal } from '../stores/streamStore';

// Mock the recorder implementations themselves
// Need to ensure these mocks are established before recorder.ts is imported and instantiates one.
// This is often done by putting mocks in a __mocks__ directory or ensuring vi.mock is at the top.
vi.mock('./browserRecorder', () => {
  // console.log('Mocking BrowserRecorder');
  const BrowserRecorderMock = vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn()
  }));
  return { BrowserRecorder: BrowserRecorderMock };
});

vi.mock('./electronRecorder', () => {
  // console.log('Mocking ElectronRecorder');
  const ElectronRecorderMock = vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn()
  }));
  return {
    ElectronRecorder: ElectronRecorderMock,
    electronRecorderSingletonWrapper: { recorderStore: null } // Mock the wrapper
  };
});

// Mock electronAPI from recorderTypes to control which recorder is chosen
// We need to control this *before* recorder.ts is evaluated.
// This is tricky. A common pattern is to have a separate setup file for tests or use dynamic imports.
// For now, we assume tests run in a Node-like (non-Electron) environment by default for electronAPI.
// To test Electron path, you'd need to set up the mock for electronAPI differently.
vi.mock('./recorderTypes', async () => {
  const actual = await vi.importActual('./recorderTypes');
  return {
    ...actual,
    electronAPI: undefined // Default to browser for tests unless overridden
  };
});

// Mock dependencies for recorder.ts and its imports (like calculateFit)
vi.mock('../stores/streamStore', async () => {
  const actualSvelteStore = (await vi.importActual(
    'svelte/store'
  )) as typeof import('svelte/store');
  const mockStreamStoreData = {
    localStreams: {},
    remoteStreams: {},
    // Ensure this structure matches what BrowserRecorder expects if it uses streamConfig
    streamConfig: { audio: null, camera: null, screen: false, file: null, videoStream: null },
    activeView: { layout: 'grid' }
    // Add other fields as expected by consumers like BrowserRecorder
  };
  const mockStreamStoreInstanceInternal = actualSvelteStore.writable(mockStreamStoreData);
  return {
    getStreamState: vi.fn(() => actualSvelteStore.get(mockStreamStoreInstanceInternal)),
    streamStore: mockStreamStoreInstanceInternal,
    // Mock other exports if they are used by the recorder module directly
    normalizeStreamId: vi.fn((id) => id || 'normalized-id'), // if recorder uses this
    getLocalStreamsByType: vi.fn(() => ({})),
    addLocalStream: vi.fn()
  };
});

vi.mock('../stores/localFileStreamStore', () => ({
  getStreamMetadata: vi.fn().mockReturnValue(null) // Default mock for getStreamMetadata
}));

// video-stream-merger mock is not strictly needed here anymore if BrowserRecorder is fully mocked,
// but keeping it doesn't harm if other parts of tests might rely on its presence.
vi.mock('video-stream-merger', () => {
  const VideoStreamMerger = vi.fn().mockImplementation(() => ({
    setOutputSize: vi.fn(),
    addStream: vi.fn(),
    removeStream: vi.fn(),
    start: vi.fn(),
    destroy: vi.fn(),
    result: new MediaStream()
  }));
  return { VideoStreamMerger };
});

// Mock browser APIs that might be used by calculateFit or its dependencies
// These mocks are simplified.
global.MediaRecorder = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  ondataavailable: null,
  dispatchEvent: vi.fn()
})) as any;
global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-url');
global.URL.revokeObjectURL = vi.fn();
document.createElement = vi.fn().mockImplementation((tagName) => {
  if (tagName === 'a') {
    return { href: '', download: '', click: vi.fn(), appendChild: vi.fn(), removeChild: vi.fn() };
  }
  return {};
});
document.body.appendChild = vi.fn();
document.body.removeChild = vi.fn();

// Mock MediaStream and MediaStreamTrack for calculateFit and potentially BrowserRecorder if not fully mocked
// @ts-ignore
global.MediaStreamTrack = vi.fn().mockImplementation(() => ({
  kind: 'video',
  getSettings: vi.fn().mockReturnValue({ width: 640, height: 480 }), // Default settings
  stop: vi.fn(),
  label: 'mock-track',
  enabled: true,
  id: 'mock-track-id',
  muted: false,
  readyState: 'live'
}));

const mockVideoTrackInstance = new (global.MediaStreamTrack as any)();

global.MediaStream = vi.fn().mockImplementation(() => ({
  active: true,
  id: 'mock-stream-id',
  getTracks: vi.fn(() => [mockVideoTrackInstance]),
  getVideoTracks: vi.fn(() => [mockVideoTrackInstance]),
  getAudioTracks: vi.fn(() => []),
  addTrack: vi.fn(),
  removeTrack: vi.fn(),
  clone: vi.fn(() => new (global.MediaStream as any)())
})) as any;

describe('recorderStore', () => {
  beforeEach(() => {
    recorderStore.set({
      isRecording: false
      // error: null // If using an error field in RecorderState
    });
    vi.clearAllMocks();
  });

  it('should have correct initial state', () => {
    const state = get(recorderStore);
    expect(state.isRecording).toBe(false);
    // expect(state.error).toBeNull(); // If using an error field
  });
});

import type { StreamInfo } from './recorderTypes'; // For calculateFit test

describe('calculateFit', () => {
  let mockStream: MediaStream;
  let mockVideoTrack: MediaStreamTrack; // Use the global mock type

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset or re-initialize mocks for each test
    // @ts-ignore
    mockVideoTrack = new global.MediaStreamTrack();
    (mockVideoTrack.getSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      width: 1280,
      height: 720
    }); // Default for tests

    // @ts-ignore
    mockStream = new global.MediaStream();
    (mockStream.getVideoTracks as ReturnType<typeof vi.fn>).mockReturnValue([mockVideoTrack]);
    (mockStream.getAudioTracks as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (mockStream.getTracks as ReturnType<typeof vi.fn>).mockReturnValue([mockVideoTrack]);

    (mockGetStreamMetadata as ReturnType<typeof vi.fn>).mockReturnValue(null); // Default to no metadata
  });

  // Define mockStreamInfo inside describe or pass mockStream to it
  const getMockStreamInfo = (streamInstance: MediaStream): StreamInfo => ({
    id: 'normalized-stream1', // Should be normalized ID
    key: 'key1',
    stream: streamInstance
  });

  it('should fit wider video to position width and center vertically', () => {
    const position: Position = { id: 'stream1', x: 0, y: 0, width: 800, height: 600 }; // 4:3
    const currentStreamInfo = getMockStreamInfo(mockStream); // Video is 16:9 (1280/720)
    const result = calculateFit(position, currentStreamInfo);
    expect(result.width).toBe(800);
    expect(result.height).toBeCloseTo(800 / (1280 / 720)); // 450
    expect(result.dx).toBe(0);
    expect(result.dy).toBeCloseTo((600 - 450) / 2); // 75
  });

  it('should fit taller video to position height and center horizontally', () => {
    (mockVideoTrack.getSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      width: 600,
      height: 800
    }); // Video is 3:4
    const position: Position = { id: 'stream1', x: 0, y: 0, width: 1600, height: 900 }; // Position is 16:9
    const currentStreamInfo = getMockStreamInfo(mockStream);
    const result = calculateFit(position, currentStreamInfo);
    expect(result.height).toBe(900);
    expect(result.width).toBeCloseTo(900 * (600 / 800)); // 675
    expect(result.dy).toBe(0);
    expect(result.dx).toBeCloseTo((1600 - 675) / 2); // 462.5
  });

  it('should use stream metadata if available', () => {
    (mockGetStreamMetadata as ReturnType<typeof vi.fn>).mockReturnValue({
      width: 1920,
      height: 1080
    }); // 16:9 from metadata
    const position: Position = { id: 'stream1', x: 0, y: 0, width: 800, height: 600 }; // 4:3
    const currentStreamInfo = getMockStreamInfo(mockStream);
    const result = calculateFit(position, currentStreamInfo);
    expect(result.width).toBe(800);
    expect(result.height).toBeCloseTo(800 / (1920 / 1080)); // 450
    expect(mockVideoTrack.getSettings).not.toHaveBeenCalled();
  });

  it('should use fallback aspect ratio (16:9) if video track has invalid dimensions (e.g. undefined width/height) and no metadata', () => {
    (mockVideoTrack.getSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      width: undefined,
      height: undefined
    });
    const position: Position = { id: 'stream1', x: 0, y: 0, width: 800, height: 600 };
    const currentStreamInfo = getMockStreamInfo(mockStream);
    const result = calculateFit(position, currentStreamInfo);
    expect(result.width).toBe(800); // Assuming it fits to width
    expect(result.height).toBeCloseTo(800 / (16 / 9)); // Based on 16/9 fallback
  });

  it('should use fallback aspect ratio (16:9) if no video track found and no metadata', () => {
    (mockStream.getVideoTracks as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);
    const position: Position = { id: 'stream1', x: 0, y: 0, width: 800, height: 600 };
    const currentStreamInfo = getMockStreamInfo(mockStream);
    const result = calculateFit(position, currentStreamInfo);
    expect(result.width).toBe(800);
    expect(result.height).toBeCloseTo(800 / (16 / 9));
  });
});

// Test the main recording functions (facade)
// These tests will verify that the correct recorder implementation (mocked) is called.
describe('Recording functions (Facade)', () => {
  // These will be populated in beforeEach
  let startRecordingFunc: () => Promise<void>;
  let stopRecordingFunc: () => void;
  let toggleRecordingFunc: () => void;
  let recorderStoreInstance: import('svelte/store').Writable<
    import('./recorderTypes').RecorderState
  >;
  let activeRecorderMocks: { start: Mock; stop: Mock };

  beforeEach(async () => {
    vi.resetModules(); // Reset modules to ensure recorder.ts is re-evaluated

    // Dynamically import the module under test.
    // This ensures activeRecorder in recorder.ts is newly instantiated using fresh mocks.
    const recorderModule = await import('./recorder');
    startRecordingFunc = recorderModule.startRecording;
    stopRecordingFunc = recorderModule.stopRecording;
    toggleRecordingFunc = recorderModule.toggleRecording;
    recorderStoreInstance = recorderModule.recorderStore;

    // Set initial store state for the test using the dynamically imported store
    recorderStoreInstance.set({ isRecording: false });

    // Access the mock instance created within the re-evaluated recorder.ts
    const browserRecorderModule = await import('./browserRecorder');
    const BRMock = vi.mocked(browserRecorderModule.BrowserRecorder);

    const electronRecorderModule = await import('./electronRecorder');
    const ERMock = vi.mocked(electronRecorderModule.ElectronRecorder);

    const recorderTypesModule = await import('./recorderTypes');
    const currentElectronAPI = recorderTypesModule.electronAPI;

    if (currentElectronAPI) {
      if (ERMock.mock.instances.length === 0) {
        throw new Error('ElectronRecorder mock constructor was not called by recorder.ts');
      }
      activeRecorderMocks = ERMock.mock.instances[0] as unknown as { start: Mock; stop: Mock };
    } else {
      if (BRMock.mock.instances.length === 0) {
        throw new Error('BrowserRecorder mock constructor was not called by recorder.ts');
      }
      activeRecorderMocks = BRMock.mock.instances[0] as unknown as { start: Mock; stop: Mock };
    }
  });

  describe('startRecording', () => {
    it('should call activeRecorder.start() and update store', async () => {
      await startRecordingFunc();
      expect(activeRecorderMocks.start).toHaveBeenCalledTimes(1);
      expect(get(recorderStoreInstance).isRecording).toBe(true);
    });

    it('should not call activeRecorder.start() if already recording', async () => {
      recorderStoreInstance.set({ isRecording: true });
      await startRecordingFunc();
      expect(activeRecorderMocks.start).not.toHaveBeenCalled();
    });

    it('should handle errors from activeRecorder.start() and update store', async () => {
      activeRecorderMocks.start.mockRejectedValueOnce(new Error('Start failed'));

      await expect(startRecordingFunc()).rejects.toThrow('Start failed');
      expect(get(recorderStoreInstance).isRecording).toBe(false);
      // If using an error field in RecorderState:
      // expect(get(recorderStoreInstance).error).toBe('Start failed');
    });
  });

  describe('stopRecording', () => {
    it('should call activeRecorder.stop() and update store if recording', async () => {
      recorderStoreInstance.set({ isRecording: true });
      stopRecordingFunc();
      expect(activeRecorderMocks.stop).toHaveBeenCalledTimes(1);
      expect(get(recorderStoreInstance).isRecording).toBe(false);
    });

    it('should not call activeRecorder.stop() if not recording', async () => {
      stopRecordingFunc(); // isRecording is false by default from beforeEach
      expect(activeRecorderMocks.stop).not.toHaveBeenCalled();
    });
  });

  describe('toggleRecording', () => {
    it('should call startRecording (and thus activeRecorder.start) if not recording', async () => {
      await toggleRecordingFunc();
      expect(activeRecorderMocks.start).toHaveBeenCalledTimes(1);
      expect(get(recorderStoreInstance).isRecording).toBe(true);
    });

    it('should call stopRecording (and thus activeRecorder.stop) if already recording', async () => {
      recorderStoreInstance.set({ isRecording: true });
      // activeRecorderMocks.start is already a vi.fn(). If startRecordingFunc were called by toggleRecording,
      // it would use this mock. No need to further mock it here for this specific test path.
      toggleRecordingFunc();
      expect(activeRecorderMocks.stop).toHaveBeenCalledTimes(1);
      expect(get(recorderStoreInstance).isRecording).toBe(false);
    });
  });
});
