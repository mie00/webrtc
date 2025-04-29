/**
 * @jest-environment jsdom
 */

describe('Stream Management', () => {
  // Setup mock functions before importing the module
  beforeEach(() => {
    // Setup DOM mocks
    document.getElementById = jest.fn().mockImplementation((id) => {
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
      return null;
    });

    document.createElement = jest.fn().mockImplementation((tag) => {
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
        play: jest.fn().mockResolvedValue(undefined),
        appendChild: jest.fn()
      };
    });

    document.createTextNode = jest.fn();
    document.querySelectorAll = jest.fn().mockReturnValue([]);
    document.querySelector = jest.fn().mockReturnValue(null);

    if (!document.body) {
      Object.defineProperty(document, 'body', {
        value: { appendChild: jest.fn() },
        writable: true
      });
    } else {
      document.body.appendChild = jest.fn();
    }

    document.onclick = null;

    // Setup global mocks
    global.app = {
      clients: {
        'test-client-id': {
          pc: {
            createDataChannel: jest.fn(),
            addTransceiver: jest.fn(),
            addEventListener: jest.fn(),
            getTransceivers: jest.fn().mockReturnValue([]),
            getStats: jest.fn().mockResolvedValue(new Map())
          },
          forward: {}
        }
      },
      cleanups: {},
      nego_handlers: {},
      streams: {},
      viewStreams: {},
      streamConfig: {}
    };

    // Mock navigator
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
          }),
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
          }),
          enumerateDevices: jest.fn().mockResolvedValue([
            { kind: 'audioinput', label: 'Test Microphone', deviceId: 'audio-device-id', groupId: 'audio-group-id' },
            { kind: 'videoinput', label: 'Test Camera', deviceId: 'video-device-id', groupId: 'video-group-id' }
          ])
        },
        userAgent: 'test-user-agent'
      },
      writable: true
    });

    // Mock global functions
    global.sendNego = jest.fn();
    global.getConfig = jest.fn().mockReturnValue({
      'audio-device': 'audio-group-id|audio-device-id',
      'video-device': 'video-group-id|video-device-id',
      'blur-video': 'no'
    });
    global.setConfig = jest.fn();
    global.setButton = jest.fn();
    global.AudioContext = jest.fn().mockImplementation(() => ({
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
    global.Event = jest.fn();
    global.BinPack = jest.fn().mockReturnValue({
      binWidth: jest.fn().mockReturnThis(),
      binHeight: jest.fn().mockReturnThis(),
      addAll: jest.fn(),
      unpositioned: [],
      positioned: []
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('normalizeStreamId should remove curly braces', () => {
    const streamModule = require('../../js/stream.js');

    // Test with curly braces
    expect(streamModule.normalizeStreamId('{test-id}')).toBe('test-id');

    // Test without curly braces
    expect(streamModule.normalizeStreamId('test-id')).toBe('test-id');
  });

  test('getStreamElemId should return correct element ID', () => {
    const streamModule = require('../../js/stream.js');

    // Test with a stream ID
    expect(streamModule.getStreamElemId('test-id')).toBe('stream-test-id');

    // Test with curly braces
    expect(streamModule.getStreamElemId('{test-id}')).toBe('stream-test-id');
  });

  test('stream.end handler should remove elements and clean up', () => {
    const streamModule = require('../../js/stream.js');

    // Initialize the stream module
    streamModule.streamInit(app);

    // Mock document.querySelectorAll to return elements
    const mockElements = [
      { remove: jest.fn() },
      { remove: jest.fn() }
    ];
    document.querySelectorAll.mockReturnValueOnce(mockElements);

    // Call the handler
    app.nego_handlers['stream.end']({ stream: 'test-stream-id' }, 'test-client-id');

    // Verify elements were removed
    expect(document.querySelectorAll).toHaveBeenCalledWith('.stream-test-stream-id');
    expect(mockElements[0].remove).toHaveBeenCalled();
    expect(mockElements[1].remove).toHaveBeenCalled();

    // Verify the stream was removed from viewStreams
    expect(app.viewStreams['test-stream-id']).toBeUndefined();
  });

  test('setupTrackHandler should handle incoming tracks', async () => {
    const streamModule = require('../../js/stream.js');

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
      play: jest.fn().mockResolvedValue(undefined)
    };

    // Ensure media container exists
    document.getElementById.mockReturnValueOnce({
      appendChild: jest.fn()
    });

    document.createElement.mockReturnValueOnce(mockMediaElement);

    // Call the function
    streamModule.setupTrackHandler(app, 'test-client-id');

    // Get the event listener
    const trackListener = app.clients['test-client-id'].pc.addEventListener.mock.calls.find(
      call => call[0] === 'track'
    )[1];

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

    // Call the listener
    await trackListener({ streams: [mockStream], track: mockTrack });

    // Verify the stream was added to viewStreams
    expect(app.viewStreams['test-stream-id']).toBe(mockStream);

    // Verify a media element was created
    expect(document.createElement).toHaveBeenCalledWith('video');
  });
});
