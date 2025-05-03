import { describe, beforeEach, jest, test, expect, beforeAll } from '@jest/globals';
import type { WebRTCClient } from '../../types/global.js'; // Import WebRTCClient - ADD .js extension

/**
 * @jest-environment jsdom
 */

// Declare module variable and mock functions at the top level of the describe block
let mainModule: typeof import('../../src/main.js');
const mockStreamInit = jest.fn();
const mockForwardInit = jest.fn();
const mockChatInit = jest.fn();
const mockFileInit = jest.fn();

// Mock dynamic imports before tests run
jest.mock('../../src/lib/streamBridge.js', () => ({ streamInit: mockStreamInit, setupTrackHandler: jest.fn() }));
jest.mock('../../src/lib/forwardBridge.js', () => ({ forwardInit: mockForwardInit, setupForwardChannel: jest.fn() }));
jest.mock('../../src/lib/chatBridge.js', () => ({ chatInit: mockChatInit, setupChatChannel: jest.fn() }));
jest.mock('../../src/lib/fileBridge.js', () => ({ fileInit: mockFileInit, setupFileChannel: jest.fn() }));


describe('Main Application', () => {
  beforeAll(async () => {
    // Dynamically import the main module once before all tests
    mainModule = await import('../../src/main.js');
  });

  beforeEach(async () => { // Make beforeEach async
    // Reset mocks before each test
    jest.clearAllMocks();
    mockStreamInit.mockClear();
    mockForwardInit.mockClear();
    mockChatInit.mockClear();
    mockFileInit.mockClear();

    // Setup DOM mocks with type assertion for the mock function itself
    document.getElementById = jest.fn().mockImplementation((id: string): HTMLElement | null => { // Add type for id
      if (id === 'toggle-controls') {
        return {
          addEventListener: jest.fn(),
          innerHTML: ''
        } as unknown as HTMLElement; // Cast return value
      } else if (id === 'control') {
        return {
          classList: {
            contains: jest.fn().mockReturnValue(true),
            add: jest.fn(),
            remove: jest.fn()
          } as DOMTokenList // Cast classList
        } as unknown as HTMLElement; // Cast return value
      } else if (id === 'config-overlay' || id === 'copy-overlay') {
        return {
          classList: {
            add: jest.fn(),
            remove: jest.fn()
          },
          addEventListener: jest.fn(),
          querySelectorAll: jest.fn().mockReturnValue([])
        } as any; // Cast return
      } else if (id === 'reset' || id === 'open-config' || id === 'open-qr' || id === 'hangup') {
        return {
          addEventListener: jest.fn()
        } as any; // Cast return
      } else if (id === 'media' || id === 'output' || id === 'participants') {
        return {
          innerHTML: '',
          appendChild: jest.fn(),
          firstChild: { remove: jest.fn() },
          clientWidth: 1000,
          clientHeight: 800
        } as any; // Cast return
      } else if (id === 'copy-text' || id === 'paste-text') {
        return {
          value: ''
        } as any; // Cast return
      } else if (id === 'copy-button' || id === 'accept-button' || id === 'join-button') {
        return {
          innerHTML: '',
          classList: {
            add: jest.fn(),
            remove: jest.fn()
          },
          onclick: null,
          addEventListener: jest.fn()
        } as any; // Cast return
      } else if (id === 'qrcode') {
        return {
          innerHTML: ''
        } as any; // Cast return
      } else if (id === 'diffs') {
        return {
          classList: {
            add: jest.fn(),
            remove: jest.fn()
          },
          appendChild: jest.fn()
        } as any; // Cast return
      }
      return null;
    }) as jest.Mock; // Cast the mock function itself

    // Mock createElement with type assertion for the mock function itself
    document.createElement = jest.fn().mockImplementation((tag: string): HTMLElement => {
      return {
        style: {} as CSSStyleDeclaration, // Cast style
        classList: {
          add: jest.fn()
        } as DOMTokenList, // Cast classList
        appendChild: jest.fn()
      } as unknown as HTMLElement; // Cast return value
    }) as jest.Mock; // Cast the mock function itself

    document.createDocumentFragment = jest.fn().mockReturnValue({
      appendChild: jest.fn()
    } as unknown as DocumentFragment) as jest.Mock; // Cast return and mock

    document.createTextNode = jest.fn() as jest.Mock; // Cast mock
    document.querySelector = jest.fn().mockReturnValue(null) as jest.Mock; // Cast mock
    if (!document.body) {
      Object.defineProperty(document, 'body', {
        value: { appendChild: jest.fn() as jest.Mock }, // Cast appendChild
        writable: true
      });
    } else {
      (document.body as any).appendChild = jest.fn() as jest.Mock; // Cast body and appendChild
    }
  });

  // Mock window properties (casting to any to avoid listing all properties)
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
    } as any, // Cast history
    addEventListener: jest.fn(),
    localStorage: {
      getItem: jest.fn() as jest.Mock, // Cast getItem
      setItem: jest.fn()
    } as any, // Cast localStorage
    innerWidth: 1920,
    innerHeight: 1080
  } as any; // Cast window

  // Mock navigator properties (casting to any)
  global.navigator = {
    clipboard: {
      writeText: jest.fn().mockResolvedValue(undefined as never) // Fix resolved value type
    } as any, // Cast clipboard
    vendor: '',
    mediaDevices: {
      getUserMedia: jest.fn().mockResolvedValue({
        getTracks: jest.fn().mockReturnValue([])
      } as unknown as MediaStream) // Cast resolved value
    } as unknown as MediaDevices // Cast mediaDevices
  } as unknown as Navigator; // Cast navigator

  // Mock crypto properties (casting to any)
  global.crypto = {
    getRandomValues: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
    subtle: {
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(32) as never) // Fix resolved value type
    } as any // Cast subtle
  } as any; // Cast crypto

  global.RTCPeerConnection = jest.fn().mockImplementation(() => ({
    createDataChannel: jest.fn().mockReturnValue({
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      send: jest.fn()
    } as RTCDataChannel), // Cast DataChannel mock
    createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'sdp' } as RTCSessionDescriptionInit), // Cast resolved value
    createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'sdp' } as RTCSessionDescriptionInit), // Cast resolved value
    setLocalDescription: jest.fn().mockResolvedValue(undefined), // Fix resolved value type
    setRemoteDescription: jest.fn().mockResolvedValue(undefined), // Fix resolved value type
    addIceCandidate: jest.fn().mockResolvedValue(undefined), // Fix resolved value type
    onicecandidate: null,
    onconnectionstatechange: null,
    oniceconnectionstatechange: null,
    onnegotiationneeded: null,
    close: jest.fn(),
    getStats: jest.fn().mockResolvedValue(new Map() as RTCStatsReport), // Fix resolved value type
    addTrack: jest.fn(),
    addTransceiver: jest.fn(),
    getTransceivers: jest.fn().mockReturnValue([]),
    restartIce: jest.fn(),
    signalingState: 'stable',
    connectionState: 'new',
    iceConnectionState: 'new',
    localDescription: { sdp: 'test-sdp' },
    currentLocalDescription: { sdp: 'test-sdp' } as RTCSessionDescription, // Cast description
  } as RTCPeerConnection) as jest.Mock; // Cast return and mock
  // Add generateCertificate to the mock implementation if needed, or cast the mock itself
  (global.RTCPeerConnection as any).generateCertificate = jest.fn().mockResolvedValue({} as RTCCertificate); // Fix resolved value type and cast

  // Cast getConfig mock (already declared in jest-globals.d.ts)
  global.getConfig = jest.fn().mockReturnValue({
    'stun-servers': 'stun.l.google.com:19302',
    'turn-server-v2': 'turn.example.com:3478',
    'turn-username': 'test-username',
    'turn-password': 'test-password',
    'config-loader': 'server'
  }) as jest.Mock; // Cast mock

  // Cast io mock (already declared in jest-globals.d.ts)
  // @ts-ignore - Assuming io is correctly typed in jest.global.d.ts but TS struggles here
  global.io = jest.fn().mockReturnValue({
    on: jest.fn(),
    emit: jest.fn()
  } as any);

  // Cast Diff mock (already declared in jest-globals.d.ts)
  // @ts-ignore - Assuming Diff is correctly typed
  global.Diff = {
    diffChars: jest.fn().mockReturnValue([
      { value: 'test', added: true },
      { value: 'diff', removed: true },
      { value: 'common', added: false, removed: false }
    ])
  };

  // Cast QRCode mock (already declared in jest-globals.d.ts)
  // @ts-ignore - Assuming QRCode is correctly typed
  global.QRCode = jest.fn();
  // Cast BroadcastChannel mock
  global.BroadcastChannel = jest.fn().mockImplementation(() => ({
    onmessage: null,
    postMessage: jest.fn(),
    close: jest.fn()
  } as BroadcastChannel)) as jest.Mock;

  // Cast URLSearchParams mock
  global.URLSearchParams = jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    has: jest.fn().mockReturnValue(false),
    toString: jest.fn().mockReturnValue('')
  } as URLSearchParams)) as jest.Mock;

  // Cast URL mock
  global.URL = jest.fn().mockImplementation(() => ({
    searchParams: {
      set: jest.fn()
    } as any, // Cast searchParams
    toString: jest.fn().mockReturnValue('https://example.com')
  } as URL)) as any; // Cast return and mock itself
  // Add missing static methods to URL mock (casting to any)
  (global.URL as any).createObjectURL = jest.fn().mockReturnValue('blob:test-url');
  (global.URL as any).revokeObjectURL = jest.fn();
  (global.URL as any).canParse = jest.fn().mockReturnValue(true);
  (global.URL as any).parse = jest.fn();


  // Cast compress/decompress/EMOJIS (already declared in jest-globals.d.ts)
  global.compress = jest.fn().mockResolvedValue('compressed-sdp') as jest.Mock; // Fix resolved value type & cast mock
  global.decompress = jest.fn().mockResolvedValue('decompressed-sdp') as jest.Mock; // Fix resolved value type & cast mock
  // @ts-ignore - Assuming EMOJIS is correctly typed
  global.EMOJIS = ['😀', '😁', '😂', '😃'];

  beforeEach(async () => { // Make beforeEach async if needed for mainModule import
    jest.clearAllMocks();
    // Reset the app object for each test
    global.app = undefined;

    // Mock clearInterval
    global.clearInterval = jest.fn();

    // Ensure mainModule is loaded if not done in beforeAll
    if (!mainModule) {
      mainModule = await import('../../src/main.js');
    }
  });

  test('sendNego should send data through negotiation channel', async () => {
    // Set up the global app object before the test (type is handled by jest-globals.d.ts)
    global.app = {
      config: global.getConfig(),
      clients: {},
      cleanups: {},
      nego_handlers: {},
      nego_messages: {},
      // sids: {}, // Remove if not part of App type
      viewStreams: {},
      // participants: {}, // Remove if not part of App type
      inited: false,
    } as any; // Use 'as any' for simplicity if App type is complex

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
    expect((mockClient.nego_dc as any).send).toHaveBeenCalledWith(expect.stringContaining('test-value')); // Use non-null assertion with cast

    // Verify the message ID was added (cast argument to string)
    const sendMock = mockClient.nego_dc!.send as jest.Mock; // Cast send to jest.Mock
    expect(JSON.parse(sendMock.mock.calls[0][0] as string).id).toBeDefined();
  });

  test('destroyClient should clean up client resources', () => {
    // Set up the global app object (type handled by jest-globals.d.ts)
    global.app = {
      config: global.getConfig(),
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
        } as unknown as WebRTCClient, // Use unknown cast for complex mock
        'other-cid': {
          pc: { close: jest.fn() } as any, // Cast pc mock
          nego_dc: { send: jest.fn() } as any // Cast nego_dc mock
          // Add other required properties for WebRTCClient or cast
        } as unknown as WebRTCClient // Use unknown cast for complex mock
      },
      cleanups: {
        test: jest.fn()
      },
      viewStreams: {},
      nego_messages: {},
      nego_handlers: {},
      // participants: {}, // Remove if not part of App type
      inited: false,
    } as any; // Use 'as any' for simplicity

    // Store a reference to the client object and its PC before destroying
    const clientObj = global.app!.clients['test-cid']; // Use non-null assertion
    const pcCloseSpy = clientObj.pc!.close; // Use non-null assertion

    // Access webRTCApp via rtcUtils and spy on the instance's method
    // mainModule is already available
    const sendNegoSpy = jest.spyOn(mainModule.rtcUtils.webRTCApp, 'sendNego');

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
    expect(global.app!.clients['test-cid']).toBeUndefined(); // Use non-null assertion

    // Verify cleanup functions were called
    expect(global.app!.cleanups.test).toHaveBeenCalledWith('test-cid'); // Use non-null assertion

    // Verify sendNego was called for other clients via the spy on the instance
    expect(sendNegoSpy).toHaveBeenCalledWith(
      global.app!.clients['other-cid'], // Use non-null assertion
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
    global.app = { inited: false } as any; // Minimal setup if needed before init
    webRTCAppInstance.getApp().inited = false; // Ensure instance state is reset too

    // Call the function via rtcUtils
    await mainModule.rtcUtils.init();

    // Get the app object after initialization using the exported getter
    const appAfterInit = mainModule.rtcUtils._getApp();

    // Verify the app state was initialized
    // expect(appAfterInit.participants).toEqual({}); // Remove if not part of App type
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
