import { describe, jest, beforeEach, test, expect } from '@jest/globals';

/**
 * @jest-environment jsdom
 */

// Mock the backgroundChange function with proper casting
global.backgroundChange = jest.fn().mockResolvedValue({
  getTracks: jest.fn().mockReturnValue([])
} as unknown as MediaStream) as jest.Mock<Promise<MediaStream>>;


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
  let streamModule: typeof import('../../src/lib/streamBridge.js'); // Add .js extension

  // Setup mock functions before importing the module
  beforeAll(async () => {
    // Import the module once after mocks are set up
    streamModule = await import('../../src/lib/streamBridge.js');
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    // Reset modules to ensure clean state if needed, though mocks should handle isolation
    // jest.resetModules(); // Keep this commented unless clearAllMocks isn't enough

    // Setup DOM mocks with type assertion for the mock function itself
    document.getElementById = jest.fn().mockImplementation((id: string): HTMLElement | null => {
      if (id === 'toggle-audio' || id === 'toggle-video' || id === 'toggle-screen') {
        return {
          addEventListener: jest.fn(),
          classList: {
            add: jest.fn(),
            remove: jest.fn()
          } as DOMTokenList, // Cast classList
          style: {} as CSSStyleDeclaration, // Cast style
        } as unknown as HTMLElement; // Cast return value
      } else if (id === 'media') {
        return { // Cast return object to any
          appendChild: jest.fn(),
          clientWidth: 1000,
          clientHeight: 800,
        } as unknown as HTMLElement; // Cast return value
      } else if (id === 'contextMenu') {
        return { // Cast return object to any
          classList: {
            add: jest.fn(),
            remove: jest.fn()
          } as DOMTokenList, // Cast classList
          style: {} as CSSStyleDeclaration, // Cast style
          contains: jest.fn().mockReturnValue(false),
        } as unknown as HTMLElement; // Cast return value
      } else if (id === 'ul-contextMenu') {
        return { // Cast return object to any
          firstChild: null,
          removeChild: jest.fn(),
          appendChild: jest.fn(),
        } as unknown as HTMLElement; // Cast return value
      }
      return null;
    }) as jest.Mock; // Cast the mock function itself

    // Mock createElement with type assertion for the mock function itself
    document.createElement = jest.fn().mockImplementation((tag: string): HTMLElement => {
      return {
        srcObject: null as MediaProvider | null, // Add type for srcObject
        classList: {
          add: jest.fn()
        } as DOMTokenList, // Cast classList
        style: {} as CSSStyleDeclaration, // Cast style
        muted: false,
        autoplay: false,
        controls: false,
        disablePictureInPicture: false,
        playsInline: false,
        play: jest.fn().mockResolvedValue(undefined), // Fix resolved value type
        appendChild: jest.fn(),
      } as unknown as HTMLVideoElement; // Cast return value to specific element type
    }) as jest.Mock; // Cast the mock function itself

    // Mock createTextNode, querySelectorAll, querySelector with type assertions
    document.createTextNode = jest.fn() as jest.Mock; // Cast mock
    document.querySelectorAll = jest.fn().mockReturnValue([]) as jest.Mock; // Cast mock
    document.querySelector = jest.fn().mockReturnValue(null) as jest.Mock; // Cast mock

    // Mock document.body.appendChild with type assertion
    if (!document.body) {
      Object.defineProperty(document, 'body', {
        value: { appendChild: jest.fn() },
        writable: true
      });
    } else {
      (document.body as any).appendChild = jest.fn() as jest.Mock; // Cast body and mock
    }

    document.onclick = null;

    // Setup global mocks with type assertion
    global.app = {
      clients: {
        'test-client-id': {
          pc: {
            createDataChannel: jest.fn(),
            addTransceiver: jest.fn(),
            addEventListener: jest.fn(),
            getTransceivers: jest.fn().mockReturnValue([]),
            getStats: jest.fn().mockResolvedValue(new Map() as RTCStatsReport) // Fix resolved value type
          } as unknown as RTCPeerConnection, // Cast pc
          forward: {} as RTCDataChannel // Cast forward
        } as WebRTCClient // Cast client
      },
      cleanups: {},
      nego_handlers: {},
      streams: {},
      viewStreams: {},
      streamConfig: {} as StreamConfig, // Add type cast
      // Add other required App properties if needed
      config: {},
      nego_messages: {},
    } as App; // Cast global.app

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
            getVideoTracks: jest.fn().mockReturnValue([]),
          } as unknown as MediaStream), // Cast resolved value
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
            getVideoTracks: jest.fn().mockReturnValue([]),
          } as unknown as MediaStream), // Cast resolved value
          enumerateDevices: jest.fn().mockResolvedValue([
            { kind: 'audioinput', label: 'Test Microphone', deviceId: 'audio-device-id', groupId: 'audio-group-id' },
            { kind: 'videoinput', label: 'Test Camera', deviceId: 'video-device-id', groupId: 'video-group-id' },
          ] as MediaDeviceInfo[]) // Cast resolved value
        } as MediaDevices, // Cast mediaDevices
        userAgent: 'test-user-agent',
      } as Navigator, // Cast navigator
      writable: true
    });

    // Mock global functions with type assertions
    global.sendNego = jest.fn() as jest.Mock; // Cast mock
    global.getConfig = jest.fn().mockReturnValue({
      'audio-device': 'audio-group-id|audio-device-id',
      'video-device': 'video-group-id|video-device-id',
      'blur-video': 'no'
    }) as jest.Mock; // Cast mock
    global.setConfig = jest.fn() as jest.Mock; // Cast mock
    global.setButton = jest.fn() as jest.Mock; // Cast mock
    global.AudioContext = jest.fn().mockImplementation(() => ({
      createScriptProcessor: jest.fn().mockReturnValue({
        onaudioprocess: null as ((this: ScriptProcessorNode, ev: AudioProcessingEvent) => any) | null, // Add type
        connect: jest.fn(),
        disconnect: jest.fn()
      } as ScriptProcessorNode), // Cast return value
      createMediaStreamSource: jest.fn().mockReturnValue({
        connect: jest.fn(),
        disconnect: jest.fn()
      } as MediaStreamAudioSourceNode), // Cast return value
      destination: {} as AudioDestinationNode // Cast destination
    })) as jest.Mock; // Cast mock
    global.Event = jest.fn() as unknown as typeof Event & jest.Mock; // Mock Event & Cast
    global.BinPack = jest.fn().mockReturnValue({ // Mock BinPack
      binWidth: jest.fn().mockReturnThis(),
      binHeight: jest.fn().mockReturnThis(),
      addAll: jest.fn(),
      unpositioned: [],
      positioned: []
    } as BinPackResult) as jest.Mock; // Cast return value and mock
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
    streamModule.streamInit(global.app);

    // Mock document.querySelectorAll using jest.spyOn
    const mockElements = [
      { remove: jest.fn() } as unknown as Element, // Cast element
      { remove: jest.fn() } as unknown as Element // Cast element
    ];
    // Cast the return value of the spy
    const querySelectorAllSpy = jest.spyOn(document, 'querySelectorAll').mockReturnValue(mockElements as unknown as NodeListOf<Element>);

    // Call the handler using global.app
    (global.app as App).nego_handlers['stream.end']({ stream: 'test-stream-id' }, 'test-client-id'); // Cast app

    // Verify elements were removed
    expect(querySelectorAllSpy).toHaveBeenCalledWith('.stream-test-stream-id');
    expect(mockElements[0].remove).toHaveBeenCalled();
    expect((mockElements[1] as any).remove).toHaveBeenCalled(); // Cast element

    // Verify the stream was removed from viewStreams using global.app
    expect((global.app as App).viewStreams['test-stream-id']).toBeUndefined(); // Cast app

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
      play: jest.fn().mockResolvedValue(undefined) // Fix resolved value type
    } as HTMLVideoElement; // Cast mock element

    // Ensure media container exists using jest.spyOn and cast return value
    const getElementByIdSpy = jest.spyOn(document, 'getElementById').mockReturnValueOnce({
      appendChild: jest.fn()
    } as unknown as HTMLElement); // Cast return value

    // Mock createElement using jest.spyOn and cast return value
    const createElementSpy = jest.spyOn(document, 'createElement').mockReturnValueOnce(mockMediaElement as unknown as HTMLElement); // Cast return value

    // Call the function using global.app (cast app)
    streamModule.setupTrackHandler(global.app as App, 'test-client-id');

    // Get the event listener using global.app (cast app and client)
    const pcMock = (global.app as App).clients['test-client-id'].pc as unknown as RTCPeerConnection & { addEventListener: jest.Mock };
    const addEventListenerMock = pcMock.addEventListener;
    const trackListenerCall = addEventListenerMock.mock.calls.find(
      (call: [string, EventListenerOrEventListenerObject | null, (boolean | AddEventListenerOptions)?]) => call[0] === 'track'
    );
    const trackListener = trackListenerCall ? trackListenerCall[1] : null;
    expect(trackListener).toBeDefined();
    expect(typeof trackListener).toBe('function'); // Ensure it's a function

    // Create a mock track event
    const mockTrack = {
      kind: 'video',
      id: 'track-id',
      onended: null as ((this: MediaStreamTrack, ev: Event) => any) | null // Add type
    } as MediaStreamTrack; // Cast mock track

    const mockStream = {
      id: '{test-stream-id}',
      getTracks: jest.fn().mockReturnValue([mockTrack])
    } as MediaStream; // Cast mock stream

    // Call the listener if found (cast listener to function type)
    if (trackListener && typeof trackListener === 'function') {
      // Create a mock RTCTrackEvent
      const mockEvent = { streams: [mockStream], track: mockTrack } as unknown as RTCTrackEvent;
      await (trackListener as (ev: RTCTrackEvent) => void | Promise<void>)(mockEvent);
    }

    // Verify the stream was added to viewStreams using global.app (cast app)
    expect((global.app as App).viewStreams['test-stream-id']).toBe(mockStream);

    // Verify a media element was created
    expect(createElementSpy).toHaveBeenCalledWith('video');

    // Restore spies
    getElementByIdSpy.mockRestore();
    createElementSpy.mockRestore();
  });
});
