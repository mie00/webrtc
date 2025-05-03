import { describe, jest, beforeEach, test, expect } from '@jest/globals';

/**
 * @jest-environment jsdom
 */

// Mock the backgroundChange function
global.backgroundChange = jest.fn().mockResolvedValue({
  getTracks: jest.fn().mockReturnValue([])
});

// Restore mocks for specific stores that import svelte/store
jest.mock('../../src/stores/streamStore', () => ({
  streamStore: { subscribe: jest.fn(), update: jest.fn(), set: jest.fn() },
  getStreamState: jest.fn().mockReturnValue({
    viewStreams: {},
    localStreams: {},
    remoteStreams: {},
    activeView: { layout: 'grid' },
    streamConfig: { audio: false, video: false, screen: false, local: false }
  }),
  addViewStream: jest.fn(),
  removeViewStream: jest.fn(),
  addLocalStream: jest.fn(),
  removeLocalStream: jest.fn(),
  addRemoteStream: jest.fn(),
  removeRemoteStream: jest.fn(),
  // Add mocks for any other functions exported/used from streamStore if needed
  updateStreamConfig: jest.fn(),
  toggleLocalStream: jest.fn(),
  setViewLayout: jest.fn(),
  setGridSize: jest.fn(),
}));

jest.mock('../../src/stores/configStore', () => ({
  configStore: { subscribe: jest.fn(), update: jest.fn(), set: jest.fn() },
  getAllConfig: jest.fn().mockReturnValue({
    'audio-device': 'default|default', // Match default value format
    'video-device': 'default|default', // Match default value format
    'blur-video': 'no'
    // Add other default config values if streamBridge relies on them
  }),
  // Mock other exports if needed by streamBridge.ts
  getConfigValue: jest.fn(),
  updateConfig: jest.fn(),
  resetConfig: jest.fn(),
  isServerMode: { subscribe: jest.fn() }, // Mock derived store
  rtcServers: { subscribe: jest.fn() }, // Mock derived store
}));


describe('Stream Management', () => {
  let streamModule: typeof import('../../src/lib/streamBridge'); // Define module variable

  // Setup mock functions before importing the module
  beforeAll(async () => {
    // Import the module once after mocks are set up, adding .js extension
    streamModule = await import('../../src/lib/streamBridge.js');
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    // Reset modules to ensure clean state if needed, though mocks should handle isolation
    // jest.resetModules(); // Keep this commented unless clearAllMocks isn't enough

    // Setup DOM mocks with type assertion
    (document as any).getElementById = jest.fn().mockImplementation((id: string) => {
      if (id === 'toggle-audio' || id === 'toggle-video' || id === 'toggle-screen') {
        return {
          addEventListener: jest.fn(),
          classList: {
            add: jest.fn(),
            remove: jest.fn()
          },
          style: {}
        };
      } else if (id === 'media') {
        return {
          appendChild: jest.fn(),
          clientWidth: 1000,
          clientHeight: 800
        };
      } else if (id === 'contextMenu') {
        return {
          classList: {
            add: jest.fn(),
            remove: jest.fn()
          },
          style: {},
          contains: jest.fn().mockReturnValue(false)
        };
      } else if (id === 'ul-contextMenu') {
        return {
          firstChild: null,
          removeChild: jest.fn(),
          appendChild: jest.fn()
        };
      }
      return null; // Return null for unhandled IDs
    });

    // Mock createElement with type assertion
    (document as any).createElement = jest.fn().mockImplementation((tag: string) => {
      return {
        srcObject: null,
        classList: {
          add: jest.fn()
        },
        style: {},
        muted: false,
        autoplay: false,
        controls: false,
        disablePictureInPicture: false,
        playsInline: false,
        play: jest.fn().mockResolvedValue(undefined as any), // Cast resolved value
        appendChild: jest.fn()
      };
    });

    // Mock createTextNode, querySelectorAll, querySelector with type assertions
    (document as any).createTextNode = jest.fn();
    (document as any).querySelectorAll = jest.fn().mockReturnValue([]);
    (document as any).querySelector = jest.fn().mockReturnValue(null);

    // Mock document.body.appendChild with type assertion
    if (!document.body) {
      Object.defineProperty(document, 'body', {
        value: { appendChild: jest.fn() },
        writable: true
      });
    } else {
      (document.body as any).appendChild = jest.fn();
    }

    (document as any).onclick = null;

    // Setup global mocks with type assertion
    (global as any).app = {
      clients: {
        'test-client-id': {
          pc: {
            createDataChannel: jest.fn(),
            addTransceiver: jest.fn(),
            addEventListener: jest.fn(),
            getTransceivers: jest.fn().mockReturnValue([]),
            getStats: jest.fn().mockResolvedValue(new Map() as any) // Cast resolved value
          },
          forward: {}
        }
      },
      cleanups: {},
      nego_handlers: {},
      streams: {},
      viewStreams: {},
      streamConfig: {},
      // Add other required App properties if needed
      config: {},
      nego_messages: {},
    };

    // Mock navigator with type assertions
    Object.defineProperty(window, 'navigator', {
      value: {
        mediaDevices: {
          getUserMedia: jest.fn().mockResolvedValue({
            id: 'test-stream-id',
            getTracks: jest.fn().mockReturnValue([
              {
                kind: 'audio',
                id: 'audio-track-id',
                stop: jest.fn(),
                dispatchEvent: jest.fn()
              }
            ]),
            getVideoTracks: jest.fn().mockReturnValue([])
          } as any), // Cast resolved value
          getDisplayMedia: jest.fn().mockResolvedValue({
            id: 'test-screen-id',
            getTracks: jest.fn().mockReturnValue([
              {
                kind: 'video',
                id: 'video-track-id',
                stop: jest.fn(),
                dispatchEvent: jest.fn()
              }
            ]),
            getVideoTracks: jest.fn().mockReturnValue([])
          } as any), // Cast resolved value
          enumerateDevices: jest.fn().mockResolvedValue([
            { kind: 'audioinput', label: 'Test Microphone', deviceId: 'audio-device-id', groupId: 'audio-group-id' },
            { kind: 'videoinput', label: 'Test Camera', deviceId: 'video-device-id', groupId: 'video-group-id' }
          ] as any) // Cast resolved value
        },
        userAgent: 'test-user-agent'
      },
      writable: true
    });

    // Mock global functions with type assertions
    (global as any).sendNego = jest.fn();
    (global as any).getConfig = jest.fn().mockReturnValue({
      'audio-device': 'audio-group-id|audio-device-id',
      'video-device': 'video-group-id|video-device-id',
      'blur-video': 'no'
    });
    (global as any).setConfig = jest.fn();
    (global as any).setButton = jest.fn();
    (global as any).AudioContext = jest.fn().mockImplementation(() => ({
      createScriptProcessor: jest.fn().mockReturnValue({
        onaudioprocess: null,
        connect: jest.fn(),
        disconnect: jest.fn()
      }),
      createMediaStreamSource: jest.fn().mockReturnValue({
        connect: jest.fn(),
        disconnect: jest.fn()
      }),
      destination: {}
    }));
    (global as any).Event = jest.fn(); // Mock Event
    (global as any).BinPack = jest.fn().mockReturnValue({ // Mock BinPack
      binWidth: jest.fn().mockReturnThis(),
      binHeight: jest.fn().mockReturnThis(),
      addAll: jest.fn(),
      unpositioned: [],
      positioned: []
    });
  });
    
  // Remove this redundant beforeEach block
  // beforeEach(() => {
  //   jest.clearAllMocks();
  //   jest.resetModules(); // This might interfere with beforeAll import
  // });
    
  test('normalizeStreamId should remove curly braces', () => {
    // Test with curly braces
    expect(streamModule.normalizeStreamId('{test-id}')).toBe('test-id');

    // Test without curly braces
    expect(streamModule.normalizeStreamId('test-id')).toBe('test-id');
  });

  test('getStreamElemId should return correct element ID', () => {
    // Test with a stream ID
    expect(streamModule.getStreamElemId('test-id')).toBe('stream-test-id');

    // Test with curly braces
    expect(streamModule.getStreamElemId('{test-id}')).toBe('stream-test-id');
  });

  test('stream.end handler should remove elements and clean up', () => {
    // Initialize the stream module using global.app
    streamModule.streamInit((global as any).app);

    // Mock document.querySelectorAll using jest.spyOn
    const mockElements = [
      { remove: jest.fn() },
      { remove: jest.fn() }
    ];
    const querySelectorAllSpy = jest.spyOn(document, 'querySelectorAll').mockReturnValue(mockElements as any);

    // Call the handler using global.app
    (global as any).app.nego_handlers['stream.end']({ stream: 'test-stream-id' }, 'test-client-id');

    // Verify elements were removed
    expect(querySelectorAllSpy).toHaveBeenCalledWith('.stream-test-stream-id');
    expect(mockElements[0].remove).toHaveBeenCalled();
    expect(mockElements[1].remove).toHaveBeenCalled();

    // Verify the stream was removed from viewStreams using global.app
    expect((global as any).app.viewStreams['test-stream-id']).toBeUndefined();

    // Restore the spy
    querySelectorAllSpy.mockRestore();
  });

  test('setupTrackHandler should handle incoming tracks', async () => {
    // Create a mock media element
    const mockMediaElement = {
      srcObject: null,
      classList: { add: jest.fn() },
      style: {},
      muted: false,
      autoplay: false,
      controls: false,
      disablePictureInPicture: false,
      playsInline: false,
      play: jest.fn().mockResolvedValue(undefined as any) // Cast resolved value
    };

    // Ensure media container exists using jest.spyOn
    const getElementByIdSpy = jest.spyOn(document, 'getElementById').mockReturnValueOnce({
      appendChild: jest.fn()
    } as any);

    // Mock createElement using jest.spyOn
    const createElementSpy = jest.spyOn(document, 'createElement').mockReturnValueOnce(mockMediaElement as any);

    // Call the function using global.app
    streamModule.setupTrackHandler((global as any).app, 'test-client-id');

    // Get the event listener using global.app
    const addEventListenerMock = (global as any).app.clients['test-client-id'].pc.addEventListener as jest.Mock;
    const trackListenerCall = addEventListenerMock.mock.calls.find(
      (call: any) => call[0] === 'track' // Add type any to call
    );
    const trackListener = trackListenerCall ? trackListenerCall[1] : undefined;
    expect(trackListener).toBeDefined(); // Ensure listener was found

    // Create a mock track event
    const mockTrack = {
      kind: 'video',
      id: 'track-id',
      onended: null
    };

    const mockStream = {
      id: '{test-stream-id}',
      getTracks: jest.fn().mockReturnValue([mockTrack])
    };

    // Call the listener if found
    if (trackListener) {
      await trackListener({ streams: [mockStream], track: mockTrack });
    }

    // Verify the stream was added to viewStreams using global.app
    expect((global as any).app.viewStreams['test-stream-id']).toBe(mockStream);

    // Verify a media element was created
    expect(createElementSpy).toHaveBeenCalledWith('video');

    // Restore spies
    getElementByIdSpy.mockRestore();
    createElementSpy.mockRestore();
  });
});
