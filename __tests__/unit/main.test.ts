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
          addEventListener: jest.fn(),
          querySelectorAll: jest.fn().mockReturnValue([])
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
    
    // Mock clearInterval
    global.clearInterval = jest.fn();
  });

  test('sendNego should send data through negotiation channel', () => {
    // Clear the module cache to ensure a fresh require
    jest.resetModules();
    
    // Set up the global app object before requiring the module
    global.app = {
      config: getConfig(),
      clients: {},
      cleanups: {},
      nego_handlers: {},
      nego_messages: {},
      sids: {}
    };
    
    // Use dynamic import for ESM compatibility in tests
    const mainModule = await import('../../src/main.ts');
    
    // Create a mock client
    const mockClient = {
      nego_dc: {
        send: jest.fn()
      }
    };
    
    // Create test data
    const testData = { type: 'test', value: 'test-value' };
    
    // Call the function via rtcUtils
    mainModule.rtcUtils.sendNego(mockClient, testData);
    
    // Verify the data was sent
    expect(mockClient.nego_dc.send).toHaveBeenCalledWith(expect.stringContaining('test-value'));
    
    // Verify the message ID was added
    expect(JSON.parse(mockClient.nego_dc.send.mock.calls[0][0]).id).toBeDefined();
  });

  test('destroyClient should clean up client resources', () => {
    // Clear the module cache to ensure a fresh require
    jest.resetModules();
    
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
          dc: {},
          dc_file: {},
          forward: {},
          file_stuff: {},
          _transceiver_interval: 123,
          polite: true,
          makingOffer: false
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

    // Store a reference to the client object and its PC before destroying
    const clientObj = app.clients['test-cid'];
    const pcCloseSpy = clientObj.pc.close;

    // Use dynamic import for ESM compatibility in tests
    const mainModule = await import('../../src/main.ts');

    // Access webRTCApp via rtcUtils and spy on the instance's method
    // No need to assign global.app, the instance manages its own state
    jest.spyOn(mainModule.rtcUtils.webRTCApp, 'sendNego');

    // Call the function via rtcUtils
    mainModule.rtcUtils.destroyClient('test-cid');
    
    // Verify the client was cleaned up
    expect(global.clearInterval).toHaveBeenCalledWith(123);
    expect(pcCloseSpy).toHaveBeenCalled();
    
    // Verify all fields are properly cleaned up
    expect(clientObj.pc).toBeNull();
    expect(clientObj.dc).toBeUndefined();
    expect(clientObj.dc_file).toBeUndefined();
    expect(clientObj.forward).toBeUndefined();
    expect(clientObj.nego_dc).toBeUndefined();
    expect(clientObj.file_stuff).toBeUndefined();
    expect(clientObj._transceiver_interval).toBeUndefined();
    expect(clientObj.polite).toBeUndefined();
    expect(clientObj.makingOffer).toBeUndefined();
    
    // Verify the client is removed from the clients object
    expect(app.clients['test-cid']).toBeUndefined();
    
    // Verify cleanup functions were called
    expect(app.cleanups.test).toHaveBeenCalledWith('test-cid');
    
    // Verify sendNego was called for other clients via the spy on the instance
    expect(mainModule.rtcUtils.webRTCApp.sendNego).toHaveBeenCalledWith(
      app.clients['other-cid'], 
      {type: 'participant.end', cid: 'test-cid'}
    );
  });

  test('uuidv4 should generate a valid UUID', async () => {
    // Use dynamic import for ESM compatibility in tests
    const mainModule = await import('../../src/main.ts');
    
    // Call the function via rtcUtils
    const uuid = mainModule.rtcUtils.uuidv4();
    
    // Verify it's a valid UUID
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('init should set up the application state', async () => {
    // Clear the module cache to ensure a fresh require
    jest.resetModules();

    // Mock bridge initializers *before* requiring main
    const mockStreamInit = jest.fn();
    const mockForwardInit = jest.fn();
    const mockChatInit = jest.fn();
    const mockFileInit = jest.fn();
    // Mock the .ts files directly
    jest.mock('../../src/lib/streamBridge.ts', () => ({ streamInit: mockStreamInit }));
    jest.mock('../../src/lib/forwardBridge.ts', () => ({ forwardInit: mockForwardInit }));
    jest.mock('../../src/lib/chatBridge.ts', () => ({ chatInit: mockChatInit }));
    jest.mock('../../src/lib/fileBridge.ts', () => ({ fileInit: mockFileInit }));

    // Import after mocks are set up
    const mainModule = await import('../../src/main.ts');
    const webRTCAppInstance = mainModule.rtcUtils.webRTCApp; // Get the instance created by main.ts

    // Reset inited flag if necessary before calling init
    // Access app via the instance's getter method
    webRTCAppInstance.getApp().inited = false;

    // Call the function via rtcUtils
    await mainModule.rtcUtils.init();
    
    // Get the app object after initialization using the exported getter
    const appAfterInit = mainModule.rtcUtils._getApp();
    
    // Verify the app state was initialized
    expect(appAfterInit.participants).toEqual({});
    expect(appAfterInit.cleanups).toEqual({});
    expect(appAfterInit.clients).toEqual({});
    expect(appAfterInit.inited).toBe(true);
    expect(appAfterInit.nego_messages).toEqual({});
    expect(appAfterInit.nego_handlers).toBeDefined();
    
    // Verify the init functions were called (via mocks)
    expect(mockStreamInit).toHaveBeenCalledWith(appAfterInit);
    expect(mockForwardInit).toHaveBeenCalledWith(appAfterInit);
    expect(mockChatInit).toHaveBeenCalledWith(appAfterInit);
    expect(mockFileInit).toHaveBeenCalledWith(appAfterInit);
  });
});
