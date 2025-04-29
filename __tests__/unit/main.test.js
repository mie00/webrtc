/**
 * @jest-environment jsdom
 */

describe('Main Application', () => {
  beforeEach(() => {
    // Setup DOM mocks
    document.getElementById = jest.fn().mockImplementation((id) => {
      if (id === 'toggle-controls') {
        return {
          addEventListener: jest.fn(),
          innerHTML: ''
        };
      } else if (id === 'control') {
        return {
          classList: {
            contains: jest.fn().mockReturnValue(true),
            add: jest.fn(),
            remove: jest.fn()
          }
        };
      } else if (id === 'config-overlay' || id === 'copy-overlay') {
        return {
          classList: {
            add: jest.fn(),
            remove: jest.fn()
          },
          addEventListener: jest.fn()
        };
      } else if (id === 'reset' || id === 'open-config' || id === 'open-qr' || id === 'hangup') {
        return {
          addEventListener: jest.fn()
        };
      } else if (id === 'media' || id === 'output' || id === 'participants') {
        return {
          innerHTML: '',
          appendChild: jest.fn(),
          firstChild: { remove: jest.fn() },
          clientWidth: 1000,
          clientHeight: 800
        };
      } else if (id === 'copy-text' || id === 'paste-text') {
        return {
          value: ''
        };
      } else if (id === 'copy-button' || id === 'accept-button' || id === 'join-button') {
        return {
          innerHTML: '',
          classList: {
            add: jest.fn(),
            remove: jest.fn()
          },
          onclick: null,
          addEventListener: jest.fn()
        };
      } else if (id === 'qrcode') {
        return {
          innerHTML: ''
        };
      } else if (id === 'diffs') {
        return {
          classList: {
            add: jest.fn(),
            remove: jest.fn()
          },
          appendChild: jest.fn()
        };
      }
      return null;
    });
    
    document.createElement = jest.fn().mockImplementation((tag) => {
      return {
        style: {},
        classList: {
          add: jest.fn()
        },
        appendChild: jest.fn()
      };
    });
    
    document.createDocumentFragment = jest.fn().mockReturnValue({
      appendChild: jest.fn()
    });
    
    document.createTextNode = jest.fn();
    document.querySelector = jest.fn().mockReturnValue(null);
    
    if (!document.body) {
      Object.defineProperty(document, 'body', {
        value: { appendChild: jest.fn() },
        writable: true
      });
    } else {
      document.body.appendChild = jest.fn();
    }
  });

  global.window = {
    location: {
      href: 'https://example.com',
      origin: 'https://example.com',
      pathname: '/',
      host: 'example.com',
      search: ''
    },
    history: {
      pushState: jest.fn(),
      replaceState: jest.fn()
    },
    addEventListener: jest.fn(),
    localStorage: {
      getItem: jest.fn(),
      setItem: jest.fn()
    },
    innerWidth: 1920,
    innerHeight: 1080
  };

  global.navigator = {
    clipboard: {
      writeText: jest.fn().mockResolvedValue(undefined)
    },
    vendor: '',
    mediaDevices: {
      getUserMedia: jest.fn().mockResolvedValue({
        getTracks: jest.fn().mockReturnValue([])
      })
    }
  };

  global.crypto = {
    getRandomValues: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
    subtle: {
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
    }
  };

  global.RTCPeerConnection = jest.fn().mockImplementation(() => ({
    createDataChannel: jest.fn().mockReturnValue({
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      send: jest.fn()
    }),
    createOffer: jest.fn().mockResolvedValue({}),
    createAnswer: jest.fn().mockResolvedValue({}),
    setLocalDescription: jest.fn().mockResolvedValue(undefined),
    setRemoteDescription: jest.fn().mockResolvedValue(undefined),
    addIceCandidate: jest.fn().mockResolvedValue(undefined),
    onicecandidate: null,
    onconnectionstatechange: null,
    oniceconnectionstatechange: null,
    onnegotiationneeded: null,
    close: jest.fn(),
    getStats: jest.fn().mockResolvedValue(new Map()),
    addTrack: jest.fn(),
    addTransceiver: jest.fn(),
    getTransceivers: jest.fn().mockReturnValue([]),
    restartIce: jest.fn(),
    signalingState: 'stable',
    connectionState: 'new',
    iceConnectionState: 'new',
    localDescription: { sdp: 'test-sdp' },
    currentLocalDescription: { sdp: 'test-sdp' }
  }));

  global.TextEncoder = jest.fn().mockImplementation(() => ({
    encode: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3]))
  }));

  global.TextDecoder = jest.fn().mockImplementation(() => ({
    decode: jest.fn().mockReturnValue('test-text')
  }));

  global.Uint8Array = Uint8Array;
  global.ArrayBuffer = ArrayBuffer;
  global.Array = Array;
  global.Object = Object;
  global.JSON = JSON;
  global.console = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  };

  global.getConfig = jest.fn().mockReturnValue({
    'stun-servers': 'stun.l.google.com:19302',
    'turn-server-v2': 'turn.example.com:3478',
    'turn-username': 'test-username',
    'turn-password': 'test-password',
    'config-loader': 'server'
  });

  global.io = jest.fn().mockReturnValue({
    on: jest.fn(),
    emit: jest.fn()
  });

  global.Diff = {
    diffChars: jest.fn().mockReturnValue([
      { value: 'test', added: true },
      { value: 'diff', removed: true },
      { value: 'common', added: false, removed: false }
    ])
  };

  global.QRCode = jest.fn();
  global.BroadcastChannel = jest.fn().mockImplementation(() => ({
    onmessage: null,
    postMessage: jest.fn(),
    close: jest.fn()
  }));

  global.URLSearchParams = jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    has: jest.fn().mockReturnValue(false),
    toString: jest.fn().mockReturnValue('')
  }));

  global.URL = jest.fn().mockImplementation(() => ({
    searchParams: {
      set: jest.fn()
    },
    toString: jest.fn().mockReturnValue('https://example.com')
  }));

  global.compress = jest.fn().mockResolvedValue('compressed-sdp');
  global.decompress = jest.fn().mockResolvedValue('decompressed-sdp');
  global.EMOJIS = ['😀', '😁', '😂', '😃'];

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the app object for each test
    global.app = undefined;
  });

  test('sendNego should send data through negotiation channel', () => {
    // Set up the global app object before requiring the module
    global.app = {
      config: getConfig(),
      clients: {},
      cleanups: {},
      nego_handlers: {},
      nego_messages: {},
      sids: {}
    };
    
    const mainModule = require('../../js/main.js');
    
    // Create a mock client
    const mockClient = {
      nego_dc: {
        send: jest.fn()
      }
    };
    
    // Create test data
    const testData = { type: 'test', value: 'test-value' };
    
    // Call the function
    mainModule.sendNego(mockClient, testData);
    
    // Verify the data was sent
    expect(mockClient.nego_dc.send).toHaveBeenCalledWith(expect.stringContaining('test-value'));
    
    // Verify the message ID was added
    expect(JSON.parse(mockClient.nego_dc.send.mock.calls[0][0]).id).toBeDefined();
  });

  test('destroyClient should clean up client resources', () => {
    // Set up the global app object before requiring the module
    global.app = {
      config: getConfig(),
      clients: {
        'test-cid': {
          pc: {
            close: jest.fn()
          },
          nego_dc: {
            onclose: null,
            onmessage: null
          },
          _transceiver_interval: 123
        },
        'other-cid': {
          pc: {
            close: jest.fn()
          },
          nego_dc: {
            send: jest.fn()
          }
        }
      },
      cleanups: {
        test: jest.fn()
      }
    };
    
    // Mock the sendNego function to avoid dependency issues
    global.sendNego = jest.fn();
    
    const mainModule = require('../../js/main.js');
    
    // Call the function
    mainModule.destroyClient('test-cid');
    
    // Verify the client was cleaned up
    expect(clearInterval).toHaveBeenCalledWith(123);
    expect(app.clients['test-cid'].pc.close).toHaveBeenCalled();
    expect(app.clients['test-cid']).toBeUndefined();
    expect(app.cleanups.test).toHaveBeenCalledWith('test-cid');
  });

  test('uuidv4 should generate a valid UUID', () => {
    const mainModule = require('../../js/main.js');
    
    // Call the function
    const uuid = mainModule.uuidv4();
    
    // Verify it's a valid UUID
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('init should set up the application state', async () => {
    // Set up the global app object before requiring the module
    global.app = {
      config: getConfig()
    };
    
    const mainModule = require('../../js/main.js');
    
    // Mock the streamInit and forwardInit functions
    global.streamInit = jest.fn();
    global.forwardInit = jest.fn();
    
    // Call the function
    await mainModule.init();
    
    // Verify the app state was initialized
    expect(app.participants).toEqual({});
    expect(app.cleanups).toEqual({});
    expect(app.clients).toEqual({});
    expect(app.inited).toBe(true);
    expect(app.nego_messages).toEqual({});
    expect(app.nego_handlers).toBeDefined();
    
    // Verify the init functions were called
    expect(global.streamInit).toHaveBeenCalledWith(app);
    expect(global.forwardInit).toHaveBeenCalledWith(app);
  });
});
