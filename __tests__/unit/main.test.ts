import { describe, beforeEach, jest, test, expect, beforeAll } from '@jest/globals';
import type { App } from '../../types/global'; // Import App type

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
      return null; // Return null for unhandled IDs
    });

    // Mock createElement with type assertion
    (document as any).createElement = jest.fn().mockImplementation((tag: string) => {
      return {
        style: {},
        classList: {
          add: jest.fn()
        },
        appendChild: jest.fn()
      };
    });

    (document as any).createDocumentFragment = jest.fn().mockReturnValue({
      appendChild: jest.fn()
    } as any);

    (document as any).createTextNode = jest.fn();
    (document as any).querySelector = jest.fn().mockReturnValue(null);
    if (!document.body) {
      Object.defineProperty(document, 'body', {
        value: { appendChild: jest.fn() } as any,
        writable: true
      });
    } else {
      (document.body as any).appendChild = jest.fn();
    }
  });

  (global as any).window = {
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
    innerHeight: 1080,
    // Add other missing window properties if needed by tests, or cast
  } as any;

  (global as any).navigator = {
    clipboard: {
      writeText: jest.fn().mockResolvedValue(undefined as any)
    },
    vendor: '',
    mediaDevices: {
      getUserMedia: jest.fn().mockResolvedValue({
        getTracks: jest.fn().mockReturnValue([])
      } as any)
    }
  } as any; // Cast navigator

  (global as any).crypto = {
    getRandomValues: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
    subtle: {
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(32) as any)
    }
  } as any; // Cast crypto

  (global as any).RTCPeerConnection = jest.fn().mockImplementation(() => ({
    createDataChannel: jest.fn().mockReturnValue({
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      send: jest.fn()
    } as any), // Cast DataChannel mock
    createOffer: jest.fn().mockResolvedValue({} as any),
    createAnswer: jest.fn().mockResolvedValue({} as any),
    setLocalDescription: jest.fn().mockResolvedValue(undefined as any),
    setRemoteDescription: jest.fn().mockResolvedValue(undefined as any),
    addIceCandidate: jest.fn().mockResolvedValue(undefined as any),
    onicecandidate: null,
    onconnectionstatechange: null,
    oniceconnectionstatechange: null,
    onnegotiationneeded: null,
    close: jest.fn(),
    getStats: jest.fn().mockResolvedValue(new Map() as any),
    addTrack: jest.fn(),
    addTransceiver: jest.fn(),
    getTransceivers: jest.fn().mockReturnValue([]),
    restartIce: jest.fn(),
    signalingState: 'stable',
    connectionState: 'new',
    iceConnectionState: 'new',
    localDescription: { sdp: 'test-sdp' },
    currentLocalDescription: { sdp: 'test-sdp' }
  } as any)); // Cast RTCPeerConnection mock
  (global as any).RTCPeerConnection.generateCertificate = jest.fn().mockResolvedValue({} as any); // Add missing static method

  (global as any).getConfig = jest.fn().mockReturnValue({
    'stun-servers': 'stun.l.google.com:19302',
    'turn-server-v2': 'turn.example.com:3478',
    'turn-username': 'test-username',
    'turn-password': 'test-password',
    'config-loader': 'server'
  } as Record<string, string>); // Cast getConfig return value

  (global as any).io = jest.fn().mockReturnValue({
    on: jest.fn(),
    emit: jest.fn()
  } as any); // Cast io mock

  (global as any).Diff = {
    diffChars: jest.fn().mockReturnValue([
      { value: 'test', added: true },
      { value: 'diff', removed: true },
      { value: 'common', added: false, removed: false }
    ])
  } as any; // Cast Diff mock

  (global as any).QRCode = jest.fn();
  (global as any).BroadcastChannel = jest.fn().mockImplementation(() => ({
    onmessage: null,
    postMessage: jest.fn(),
    close: jest.fn()
  } as any)); // Cast BroadcastChannel mock

  (global as any).URLSearchParams = jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    has: jest.fn().mockReturnValue(false),
    toString: jest.fn().mockReturnValue('')
  } as any)); // Cast URLSearchParams mock

  (global as any).URL = jest.fn().mockImplementation(() => ({
    searchParams: {
      set: jest.fn()
    },
    toString: jest.fn().mockReturnValue('https://example.com')
  } as any)); // Cast URL mock
  // Add missing static methods to URL mock
  (global as any).URL.createObjectURL = jest.fn();
  (global as any).URL.revokeObjectURL = jest.fn();
  (global as any).URL.canParse = jest.fn();
  (global as any).URL.parse = jest.fn();


  (global as any).compress = jest.fn().mockResolvedValue('compressed-sdp' as any);
  (global as any).decompress = jest.fn().mockResolvedValue('decompressed-sdp' as any);
  (global as any).EMOJIS = ['😀', '😁', '😂', '😃'];

  beforeEach(async () => { // Make beforeEach async if needed for mainModule import
    jest.clearAllMocks();
    // Reset the app object for each test
    (global as any).app = undefined;

    // Mock clearInterval
    (global as any).clearInterval = jest.fn();

    // Ensure mainModule is loaded if not done in beforeAll
    if (!mainModule) {
      mainModule = await import('../../src/main.js');
    }
  });

  test('sendNego should send data through negotiation channel', async () => {
    // Set up the global app object before the test
    (global as any).app = {
      config: (global as any).getConfig(),
      clients: {},
      cleanups: {},
      nego_handlers: {},
      nego_messages: {},
      sids: {},
      // Add other required App properties with default/mock values
      viewStreams: {},
      participants: {},
      inited: false,
    } as App; // Use App type

    // mainModule is already imported in beforeAll/beforeEach

    const mockClient: Partial<WebRTCClient> = { // Use Partial<WebRTCClient> for mock
      nego_dc: {
        send: jest.fn()
      } as any // Cast nego_dc mock
    };
    // Create test data
    const testData = { type: 'test', value: 'test-value' };
    
    // Call the function via rtcUtils
    mainModule.rtcUtils.sendNego(mockClient as WebRTCClient, testData); // Cast mockClient

    // Verify the data was sent
    expect(mockClient.nego_dc!.send).toHaveBeenCalledWith(expect.stringContaining('test-value')); // Use non-null assertion

    // Verify the message ID was added (cast argument to string)
    expect(JSON.parse(mockClient.nego_dc!.send.mock.calls[0][0] as string).id).toBeDefined(); // Use non-null assertion
  });

  test('destroyClient should clean up client resources', () => {
    // Set up the global app object using type assertion
    (global as any).app = { // Use App type for better structure
      config: (global as any).getConfig(),
      clients: {
        'test-cid': {
          pc: { close: jest.fn() } as any, // Cast pc mock
          nego_dc: { onclose: null, onmessage: null } as any, // Cast nego_dc mock
          dc: {} as any, // Cast dc mock
          dc_file: {} as any, // Cast dc_file mock
          forward: {} as any, // Cast forward mock
          file_stuff: {} as any, // Cast file_stuff mock
          _transceiver_interval: 123,
          polite: true,
          makingOffer: false
        } as WebRTCClient, // Cast test-cid client
        'other-cid': {
          pc: { close: jest.fn() } as any, // Cast pc mock
          nego_dc: { send: jest.fn() } as any // Cast nego_dc mock
          // Add other required properties for WebRTCClient or cast
        } as WebRTCClient // Cast other-cid client
      },
      cleanups: {
        test: jest.fn()
      },
      // Add other required App properties
      viewStreams: {},
      nego_messages: {},
      nego_handlers: {},
      participants: {},
      inited: false,
    } as App; // Assign to global and cast as App

    // Store a reference to the client object and its PC before destroying
    const clientObj = (global as any).app.clients['test-cid'];
    const pcCloseSpy = clientObj.pc!.close; // Use non-null assertion

    // Access webRTCApp via rtcUtils and spy on the instance's method
    // mainModule is already available
    jest.spyOn(mainModule.rtcUtils.webRTCApp, 'sendNego');

    // Call the function via rtcUtils
    mainModule.rtcUtils.destroyClient('test-cid');

    // Verify the client was cleaned up
    expect((global as any).clearInterval).toHaveBeenCalledWith(123);
    expect(pcCloseSpy).toHaveBeenCalled();

    // Verify all fields are properly cleaned up (accessing via global.app)
    expect(clientObj.pc).toBeNull();
    expect(clientObj.dc).toBeUndefined();
    expect(clientObj.dc_file).toBeUndefined();
    expect(clientObj.forward).toBeUndefined();
    expect(clientObj.nego_dc).toBeUndefined();
    expect(clientObj.file_stuff).toBeUndefined();
    expect(clientObj._transceiver_interval).toBeUndefined();
    expect(clientObj.polite).toBeUndefined();
    expect(clientObj.makingOffer).toBeUndefined();

    // Verify the client is removed from the clients object (accessing via global.app)
    expect((global as any).app.clients['test-cid']).toBeUndefined();

    // Verify cleanup functions were called (accessing via global.app)
    expect((global as any).app.cleanups.test).toHaveBeenCalledWith('test-cid');

    // Verify sendNego was called for other clients via the spy on the instance
    expect(mainModule.rtcUtils.webRTCApp.sendNego).toHaveBeenCalledWith(
      (global as any).app.clients['other-cid'], // Access client via global.app
      {type: 'participant.end', cid: 'test-cid'}
    );
  });

  test('uuidv4 should generate a valid UUID', () => {
    // mainModule is already available
    // Call the function via rtcUtils
    const uuid = mainModule.rtcUtils.uuidv4();

    // Verify it's a valid UUID
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('init should set up the application state', async () => {
    // Mocks are defined and setup outside/before this test
    // mainModule is already available

    const webRTCAppInstance = mainModule.rtcUtils.webRTCApp; // Get the instance

    // Reset inited flag if necessary before calling init
    // Access app via the instance's getter method if needed, or set on global
    (global as any).app = { inited: false }; // Minimal setup if needed before init
    webRTCAppInstance.getApp().inited = false; // Ensure instance state is reset too

    // Call the function via rtcUtils
    await mainModule.rtcUtils.init();

    // Get the app object after initialization using the exported getter
    const appAfterInit = mainModule.rtcUtils._getApp();

    // Verify the app state was initialized (accessing via global.app or appAfterInit)
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
