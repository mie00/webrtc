import {
  recorderStore,
  startRecording,
  stopRecording,
  toggleRecording,
  calculateFit // Added
} from './recorder';
import type { Position } from './streamLayout'; // Assuming Position is exported from streamLayout
import { getStreamMetadata as mockGetStreamMetadata } from '../../stores/localFileStreamStore';

// Mock dependencies
import { get, writable, type Writable } from 'svelte/store'; // Import get, writable, Writable
// import type { StreamState as ActualStreamState } from '../../stores/streamStore'; // Import actual type for casting
import { getStreamState as mockGetStreamState } from '../../stores/streamStore'; // Import the mocked function

vi.mock('../../stores/streamStore', async (importOriginal) => {
  const svelteStore = await import('svelte/store');
  const mockStreamStoreInstanceInternal = svelteStore.writable<any>({
    localStreams: {},
    remoteStreams: {},
    streamConfig: {
      audio: 'default|Default Audio', // Changed to string
      camera: 'default|Default Camera', // Changed to string
      screen: false, // Kept as boolean
      speaker: 'default|Default Speaker' // Changed to string
    },
    isSwitchingAudio: false,
    isSwitchingCamera: false,
    isLocalAudioAllowed: true,
    isLocalVideoAllowed: true
  });
  return {
    getStreamState: vi.fn(() => svelteStore.get(mockStreamStoreInstanceInternal)),
    streamStore: mockStreamStoreInstanceInternal,
    getLocalStreamsByType: vi.fn(() => ({})), // Added mock for getLocalStreamsByType, returns empty object
    addLocalStream: vi.fn() // Added mock for addLocalStream
    // Ensure other exports from the original module are handled if necessary
    // For example, if StreamState type is used by other modules in a way that affects runtime.
  };
});

vi.mock('../../stores/localFileStreamStore', () => ({
  getStreamMetadata: vi.fn()
}));

vi.mock('video-stream-merger', () => {
  const VideoStreamMerger = vi.fn().mockImplementation(() => ({
    setOutputSize: vi.fn(),
    addStream: vi.fn(),
    removeStream: vi.fn(),
    start: vi.fn(),
    destroy: vi.fn(),
    result: new MediaStream() // Mock the result to be a MediaStream instance
  }));
  return { VideoStreamMerger };
});

// Mock MediaRecorder and related browser APIs
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
    return {
      href: '',
      download: '',
      click: vi.fn(),
      appendChild: vi.fn(),
      removeChild: vi.fn()
    };
  }
  return {};
});
document.body.appendChild = vi.fn();
document.body.removeChild = vi.fn();

// Mock MediaStream and MediaStreamTrack
class MockMediaStreamTrack {
  kind = 'video';
  // Initialize getSettings as a Vitest mock function directly in the class
  getSettings = vi.fn(() => ({ width: 640, height: 480, aspectRatio: 640 / 480 }));
  stop = vi.fn();
  applyConstraints = vi.fn();
  clone = vi.fn(() => this);
  getCapabilities = vi.fn(() => ({}));
  getConstraints = vi.fn(() => ({}));
  getDisplayMedia = vi.fn();
  getTrackById = vi.fn();
  label = 'mock-track';
  enabled = true;
  id = 'mock-track-id';
  muted = false;
  onended = null;
  onmute = null;
  onunmute = null;
  readyState = 'live';
}

const mockVideoTrackInstance = new MockMediaStreamTrack(); // Create a single instance

global.MediaStream = vi.fn().mockImplementation(() => ({
  active: true,
  id: 'mock-stream-id',
  getTracks: vi.fn(() => [mockVideoTrackInstance]),
  getVideoTracks: vi.fn(() => [mockVideoTrackInstance]), // Consistently return the same instance
  getAudioTracks: vi.fn(() => []),
  addTrack: vi.fn(),
  removeTrack: vi.fn(),
  clone: vi.fn(() => new global.MediaStream()),
  onactive: null,
  onaddtrack: null,
  oninactive: null,
  onremovetrack: null
})) as any;

describe('recorderStore', () => {
  beforeEach(() => {
    recorderStore.set({
      isRecording: false,
      merger: null,
      mediaRecorder: null,
      updateInterval: null,
      lastStreams: []
    });
    vi.clearAllMocks(); // Clear mocks before each test
  });

  it('should have correct initial state', () => {
    const state = get(recorderStore);
    expect(state.isRecording).toBe(false);
    expect(state.merger).toBeNull();
    expect(state.mediaRecorder).toBeNull();
    expect(state.updateInterval).toBeNull();
    expect(state.lastStreams).toEqual([]);
  });
});

describe('calculateFit', () => {
  const mockStreamInfo = {
    id: 'stream1',
    key: 'key1',
    stream: new MediaStream() // Mocked MediaStream
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset settings for the shared mock track instance
    (mockVideoTrackInstance.getSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      width: 1280,
      height: 720
    });
    (mockGetStreamMetadata as ReturnType<typeof vi.fn>).mockReturnValue(null); // Default to no specific metadata
  });

  it('should fit wider video to position width and center vertically', () => {
    const position: Position = { id: 'stream1', x: 0, y: 0, width: 800, height: 600 }; // Position is 4:3
    // Video is 16:9 (1280/720)
    const result = calculateFit(position, mockStreamInfo as any);
    expect(result.width).toBe(800);
    expect(result.height).toBeCloseTo(800 / (1280 / 720)); // 800 / 1.777... = 450
    expect(result.dx).toBe(0);
    expect(result.dy).toBeCloseTo((600 - 450) / 2); // (600 - 450) / 2 = 75
  });

  it('should fit taller video to position height and center horizontally', () => {
    (mockVideoTrackInstance.getSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      width: 600,
      height: 800
    }); // Video is 3:4
    const position: Position = { id: 'stream1', x: 0, y: 0, width: 1600, height: 900 }; // Position is 16:9
    const result = calculateFit(position, mockStreamInfo as any);
    expect(result.height).toBe(900);
    expect(result.width).toBeCloseTo(900 * (600 / 800)); // 900 * 0.75 = 675
    expect(result.dy).toBe(0);
    expect(result.dx).toBeCloseTo((1600 - 675) / 2); // (1600 - 675) / 2 = 462.5
  });

  it('should use stream metadata if available', () => {
    (mockGetStreamMetadata as ReturnType<typeof vi.fn>).mockReturnValue({
      width: 1920,
      height: 1080
    });
    const position: Position = { id: 'stream1', x: 0, y: 0, width: 800, height: 600 };
    // Video is 16:9 (1920/1080)
    const result = calculateFit(position, mockStreamInfo as any);
    expect(result.width).toBe(800);
    expect(result.height).toBeCloseTo(800 / (1920 / 1080)); // 450
    expect(mockStreamInfo.stream.getVideoTracks()[0].getSettings).not.toHaveBeenCalled();
  });

  it('should throw error if video track has no settings and no metadata', () => {
    (mockVideoTrackInstance.getSettings as ReturnType<typeof vi.fn>).mockReturnValue({}); // No width/height
    const position: Position = { id: 'stream1', x: 0, y: 0, width: 800, height: 600 };
    expect(() => calculateFit(position, mockStreamInfo as any)).toThrow('Invalid video dimensions');
  });

  it('should throw error if no video track found and no metadata', () => {
    (mockStreamInfo.stream.getVideoTracks as ReturnType<typeof vi.fn>).mockReturnValueOnce([]); // No video tracks
    const position: Position = { id: 'stream1', x: 0, y: 0, width: 800, height: 600 };
    expect(() => calculateFit(position, mockStreamInfo as any)).toThrow('No video track found');
  });
});

// Basic tests for start/stop/toggle to ensure they run and update store
// More detailed testing of their effects would require more intricate mocking of VideoStreamMerger behavior
// and streamStore state.
describe('Recording functions', () => {
  beforeEach(async () => {
    // Make beforeEach async if it contains async operations
    recorderStore.set({
      isRecording: false,
      merger: null,
      mediaRecorder: null,
      updateInterval: null,
      lastStreams: []
    });
    vi.clearAllMocks();
    // Mock getStreamState to return some basic stream setup
    (mockGetStreamState as ReturnType<typeof vi.fn>).mockReturnValue({
      localStreams: { local1: { stream: new MediaStream(), sendable: true } },
      remoteStreams: {},
      streamConfig: {
        audio: 'default|Default Audio', // Changed to string
        camera: 'default|Default Camera', // Changed to string
        screen: false, // Kept as boolean
        speaker: 'default|Default Speaker' // Changed to string
      },
      isSwitchingAudio: false,
      isSwitchingCamera: false,
      isLocalAudioAllowed: true,
      isLocalVideoAllowed: true
    });
  });

  describe('startRecording', () => {
    it('should set isRecording to true and store merger/recorder instances', async () => {
      await startRecording();
      const state = get(recorderStore);
      expect(state.isRecording).toBe(true);
      expect(state.merger).not.toBeNull();
      expect(state.mediaRecorder).not.toBeNull();
      expect(state.updateInterval).not.toBeNull();
      expect(global.MediaRecorder).toHaveBeenCalled();
      // @ts-ignore
      expect(state.merger.start).toHaveBeenCalled();
      // @ts-ignore
      expect(state.mediaRecorder.start).toHaveBeenCalled();
    });
  });

  describe('stopRecording', () => {
    it('should set isRecording to false and clear instances', async () => {
      // Start recording first to populate the store
      await startRecording();
      const initialMerger = get(recorderStore).merger;
      const initialRecorder = get(recorderStore).mediaRecorder;

      stopRecording();
      const state = get(recorderStore);
      expect(state.isRecording).toBe(false);
      expect(state.merger).toBeNull();
      expect(state.mediaRecorder).toBeNull();
      expect(state.updateInterval).toBeNull();
      // @ts-ignore
      expect(initialMerger?.destroy).toHaveBeenCalled();
      // @ts-ignore
      expect(initialRecorder?.stop).toHaveBeenCalled();
    });
  });

  describe('toggleRecording', () => {
    it('should call startRecording if not recording', async () => {
      await toggleRecording();
      expect(get(recorderStore).isRecording).toBe(true);
    });

    it('should call stopRecording if already recording', async () => {
      await startRecording(); // Start first
      await toggleRecording(); // Then toggle to stop
      expect(get(recorderStore).isRecording).toBe(false);
    });
  });
});
