import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { WebRTCApp } from './WebRTCApp';
import { streamInit } from '../app/streamLifecycle';
import { forwardInit } from '../app/forwardLifecycle';
import {
  resetConnectionStore,
  getAllClientCids,
  getDirectClient,
  updateDirectClientState,
  updateDirectClientFingerprint
} from '../stores/connectionStore';
import { resetAppStateStore, getAllCleanups } from '../stores/appStateStore';
import { resetCidKeyStore } from '../stores/cidKeyStore';

// Mocks for WebRTCApp dependencies that are globally accessed or need to be defined early
const mockDataChannel = {
  send: vi.fn(),
  close: vi.fn(),
  onopen: null as (() => void) | null,
  onmessage: null as ((event: MessageEvent) => void) | null,
  onclose: null as (() => void) | null,
  onerror: null as ((event: any) => void) | null,
  readyState: 'open' as RTCDataChannelState
};

const mockPeerConnectionInstance = {
  createDataChannel: vi.fn().mockReturnValue(mockDataChannel),
  createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mockOfferSdp' }),
  createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mockAnswerSdp' }),
  setLocalDescription: vi.fn().mockResolvedValue(undefined),
  setRemoteDescription: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
  restartIce: vi.fn(),
  getStats: vi.fn().mockResolvedValue(new Map()),
  onconnectionstatechange: null as (() => void) | null,
  oniceconnectionstatechange: null as (() => void) | null,
  onicecandidate: null as ((event: any) => void) | null,
  onnegotiationneeded: null as (() => void) | null,
  signalingState: 'stable' as RTCSignalingState,
  connectionState: 'new' as RTCPeerConnectionState,
  iceGatheringState: 'new' as RTCIceGatheringState,
  iceConnectionState: 'new' as RTCIceConnectionState,
  localDescription: null as RTCSessionDescriptionInit | null,
  currentLocalDescription: null as RTCSessionDescriptionInit | null,
  remoteDescription: null as RTCSessionDescriptionInit | null
};

global.RTCPeerConnection = vi.fn().mockImplementation(() => mockPeerConnectionInstance) as any;
// global.RTCPeerConnection and global.crypto will be stubbed in beforeEach

// State for the connectionStore mock
let mockConnectionStoreClients: Record<string, WebRTCClient> = {};

const mockDiffsElement = {
  classList: {
    remove: vi.fn(),
    add: vi.fn()
  },
  appendChild: vi.fn(),
  innerHTML: ''
};

global.document = {
  ...(global.document || {}),
  getElementById: vi.fn().mockImplementation((id) => {
    if (id === 'diffs') {
      return mockDiffsElement;
    }
    return null;
  }),
  createDocumentFragment: vi.fn(() => ({
    appendChild: vi.fn()
  })),
  createElement: vi.fn((_tagName) => ({
    // prefixed tagName with _
    style: {},
    appendChild: vi.fn()
  })),
  createTextNode: vi.fn((text = '') => ({ nodeType: 3, textContent: text, data: text })) // Added mock for createTextNode
} as any;

global.setInterval = vi.fn(() => 12345 as unknown as NodeJS.Timeout) as any; // Return NodeJS.Timeout and cast assignment
global.clearInterval = vi.fn();
global.history = { ...(global.history || {}), replaceState: vi.fn() } as any;
global.URLSearchParams = vi.fn().mockImplementation(() => ({
  has: vi.fn().mockReturnValue(false),
  get: vi.fn().mockReturnValue(null)
})) as any;

if (typeof TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
  global.TextDecoder = require('util').TextDecoder;
}

// Mock dependencies
vi.mock('../app/streamLifecycle', () => ({
  streamInit: vi.fn()
}));

vi.mock('../app/forwardLifecycle', () => ({
  forwardInit: vi.fn()
}));

vi.mock('../stores/connectionStore', async () => {
  const actual = await vi.importActual('../stores/connectionStore'); // To get the original reset function if needed

  return {
    // Spread actual if there are other functions that should retain original behavior and are not mocked.
    // For controlled unit testing, explicitly mocking each used function is often better.
    // ...actual,

    addDirectClient: vi.fn((cid: string, client: WebRTCClient) => {
      mockConnectionStoreClients[cid] = client;
    }),
    getDirectClient: vi.fn((cid: string) => {
      return mockConnectionStoreClients[cid];
    }),
    removeDirectClient: vi.fn((cid: string) => {
      delete mockConnectionStoreClients[cid];
    }),
    getAllClientCids: vi.fn(() => Object.keys(mockConnectionStoreClients)),
    resetConnectionStore: vi.fn(() => {
      mockConnectionStoreClients = {};
      // If actual.resetConnectionStore performs other necessary cleanup, call it:
      // actual.resetConnectionStore();
    }),
    updateDirectClientState: vi.fn(),
    updateDirectClientFingerprint: vi.fn(),
    addParticipant: vi.fn(),
    removeParticipant: vi.fn()
  };
});

vi.mock('../stores/cidKeyStore', async () => {
  const actual = await vi.importActual('../stores/cidKeyStore');
  return {
    ...actual,
    setCidKeys: vi.fn(),
    removeCidKeys: vi.fn(),
    resetCidKeyStore: vi.fn(actual.resetCidKeyStore as any), // Use actual for reset
    getKeysByCid: vi.fn()
  };
});

vi.mock('../stores/appStateStore', async () => {
  const actual = await vi.importActual('../stores/appStateStore');
  return {
    ...actual,
    registerNegoHandler: vi.fn(),
    getNegoHandler: vi.fn(),
    getAllCleanups: vi.fn(() => ({})),
    resetAppStateStore: vi.fn(actual.resetAppStateStore as any) // Use actual for reset
  };
});

vi.mock('../stores/configStore', async () => {
  const actual = await vi.importActual('../stores/configStore');
  return {
    ...actual,
    getAllConfig: vi.fn().mockReturnValue({
      rtc: {
        stunServers: 'stun:stun.l.google.com:19302',
        turnServerV2: '',
        turnUsername: '',
        turnPassword: ''
      },
      profile: { userName: 'TestUser' },
      media: {},
      general: {}
    }),
    resetConfigStore: vi.fn() // Simplified mock
  };
});

vi.mock('./stream/trackHandler', () => ({
  setupTrackHandler: vi.fn()
}));
vi.mock('./forward/forwardChannel', () => ({
  setupForwardChannel: vi.fn()
}));
vi.mock('./chat/setupChatChannel', () => ({
  setupChatChannel: vi.fn()
}));
vi.mock('./file/fileTransfer', () => ({
  setupFileChannel: vi.fn()
}));
vi.mock('../media/transcriber', () => ({
  setupTranscriptionChannel: vi.fn()
}));

describe('WebRTCApp', () => {
  let webRTCApp: WebRTCApp;

  beforeEach(async () => {
    // Made beforeEach async
    // Reset mocks before each test
    vi.clearAllMocks();

    // Reset properties of mockPeerConnectionInstance and mockDataChannel
    mockDataChannel.onopen = null;
    mockDataChannel.onmessage = null;
    mockDataChannel.onclose = null;
    mockDataChannel.onerror = null;
    // Ensure vi.fn() on mockDataChannel are cleared by clearAllMocks or reset here if needed
    // e.g., mockDataChannel.send.mockClear(); mockDataChannel.close.mockClear();

    mockPeerConnectionInstance.onconnectionstatechange = null;
    mockPeerConnectionInstance.oniceconnectionstatechange = null;
    mockPeerConnectionInstance.onicecandidate = null;
    mockPeerConnectionInstance.onnegotiationneeded = null;
    mockPeerConnectionInstance.localDescription = null;
    mockPeerConnectionInstance.currentLocalDescription = null;
    mockPeerConnectionInstance.remoteDescription = null;
    mockPeerConnectionInstance.signalingState = 'stable';
    mockPeerConnectionInstance.connectionState = 'new';
    mockPeerConnectionInstance.iceGatheringState = 'new';
    mockPeerConnectionInstance.iceConnectionState = 'new';
    // Ensure vi.fn() on mockPeerConnectionInstance are cleared by clearAllMocks or reset here
    // e.g., mockPeerConnectionInstance.createDataChannel.mockClear(); ...
    // Re-apply mockReturnValue after vi.clearAllMocks()
    mockPeerConnectionInstance.createDataChannel.mockReturnValue(mockDataChannel);
    mockPeerConnectionInstance.getStats.mockResolvedValue(new Map()); // Reset to default

    // Reset document mocks
    mockDiffsElement.classList.remove.mockClear();
    mockDiffsElement.classList.add.mockClear();
    mockDiffsElement.appendChild.mockClear();
    (global.document.getElementById as Mock).mockImplementation((id) => {
      if (id === 'diffs') return mockDiffsElement;
      return null;
    });
    (global.document.createDocumentFragment as Mock).mockImplementation(() => ({
      appendChild: vi.fn()
    }));
    (global.document.createElement as Mock).mockImplementation((_tagName) => ({
      // prefixed tagName with _
      style: {},
      appendChild: vi.fn()
    }));
    (global.document.createTextNode as Mock)
      ?.mockClear()
      .mockImplementation((text = '') => ({ nodeType: 3, textContent: text, data: text }));

    // Stub global.RTCPeerConnection for each test
    global.RTCPeerConnection = vi.fn().mockImplementation(() => mockPeerConnectionInstance) as any;
    (global.RTCPeerConnection as any).generateCertificate = vi
      .fn()
      .mockResolvedValue({} as RTCCertificate);

    // Stub global.crypto for each test with clean mock implementations
    vi.stubGlobal('crypto', {
      getRandomValues: vi.fn().mockImplementation((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      }),
      subtle: {
        digest: vi.fn().mockImplementation(async () => {
          // Return a very simple, predictable, small-valued hash buffer
          const simpleHash = new Uint8Array(32); // 32 bytes
          for (let i = 0; i < 4; i++) simpleHash[i] = 1; // e.g., [1,1,1,1,0,0,...]
          return simpleHash.buffer;
        })
      }
    });

    // Reset history and URLSearchParams mocks
    (global.history.replaceState as Mock)?.mockClear();
    (global.URLSearchParams as Mock)?.mockClear().mockImplementation(() => ({
      has: vi.fn().mockReturnValue(false),
      get: vi.fn().mockReturnValue(null)
    }));

    // Manually reset stores
    // For connectionStore, our mock's resetConnectionStore will clear mockConnectionStoreClients
    const connectionStore = await import('../stores/connectionStore');
    (connectionStore.resetConnectionStore as Mock)();
    
    resetAppStateStore(); // This is mocked to call the actual reset
    resetCidKeyStore();   // This is mocked to call the actual reset

    // Reset configStore mock
    const configStore = await import('../stores/configStore');
    // Cast to any to satisfy TypeScript for the mocked properties
    ((configStore as any).resetConfigStore as Mock)();
    ((configStore as any).getAllConfig as Mock).mockReturnValue({
      // Ensure it's reset to default
      rtc: {
        stunServers: 'stun:stun.l.google.com:19302',
        turnServerV2: '',
        turnUsername: '',
        turnPassword: ''
      },
      profile: { userName: 'TestUser' },
      media: {},
      general: {}
    });
  });

  afterEach(() => {
    // Ensure cleanup is called if an app instance was created
    if (webRTCApp) {
      webRTCApp.cleanup();
    }
    vi.restoreAllMocks();
  });

  it('should construct and call init', () => {
    webRTCApp = new WebRTCApp();
    expect(webRTCApp).toBeInstanceOf(WebRTCApp);
    expect(streamInit).toHaveBeenCalledTimes(1);
    expect(forwardInit).toHaveBeenCalledTimes(1);
  });

  it('should return undefined for getCid if sid is not found', () => {
    webRTCApp = new WebRTCApp();
    expect(webRTCApp.getCid('nonexistent-sid')).toBeUndefined();
  });

  it('should generate a uuidv4', () => {
    webRTCApp = new WebRTCApp();
    const uuid = webRTCApp.uuidv4();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  describe('cleanup', () => {
    it('should call destroyClient for each client and reset stores', () => {
      // Setup: Create an app instance and mock some clients
      webRTCApp = new WebRTCApp();
      const mockClient1 = { pc: { close: vi.fn() } as any, nego_dc: { send: vi.fn() } as any };
      const mockClient2 = { pc: { close: vi.fn() } as any, nego_dc: { send: vi.fn() } as any };
      (getAllClientCids as Mock).mockReturnValue(['cid1', 'cid2']);
      (getDirectClient as Mock).mockImplementation((cid: string) => {
        if (cid === 'cid1') return mockClient1;
        if (cid === 'cid2') return mockClient2;
        return undefined;
      });
      const mockCleanupFunction = vi.fn();
      (getAllCleanups as Mock).mockReturnValue({ testCleanup: mockCleanupFunction });

      const destroyClientSpy = vi.spyOn(webRTCApp, 'destroyClient');

      // Clear mock history for store resets before the action specifically for this test's assertions
      (resetConnectionStore as Mock).mockClear();
      (resetAppStateStore as Mock).mockClear();
      (resetCidKeyStore as Mock).mockClear();

      // Action
      webRTCApp.cleanup();

      // Assertions
      expect(mockCleanupFunction).toHaveBeenCalledTimes(3); // Global + once per client
      expect(mockCleanupFunction).toHaveBeenCalledWith(); // Global cleanup call
      expect(mockCleanupFunction).toHaveBeenCalledWith('cid1'); // destroyClient('cid1') call
      expect(mockCleanupFunction).toHaveBeenCalledWith('cid2'); // destroyClient('cid2') call

      expect(destroyClientSpy).toHaveBeenCalledTimes(2);
      expect(destroyClientSpy).toHaveBeenCalledWith('cid1');
      expect(destroyClientSpy).toHaveBeenCalledWith('cid2');

      expect(resetConnectionStore).toHaveBeenCalledTimes(1);
      expect(resetAppStateStore).toHaveBeenCalledTimes(1);
      expect(resetCidKeyStore).toHaveBeenCalledTimes(1);
    });

    it('should send hangup message to each client during cleanup', () => {
      webRTCApp = new WebRTCApp();
      const mockClient = { pc: { close: vi.fn() } as any, nego_dc: { send: vi.fn() } as any };
      (getAllClientCids as Mock).mockReturnValue(['cid1']);
      (getDirectClient as Mock).mockReturnValue(mockClient);
      // Spy on the method that is actually called within cleanup
      const sendNegoMessageSpy = vi.spyOn(webRTCApp['negotiationManager'], 'sendNegoMessage');

      webRTCApp.cleanup();

      expect(sendNegoMessageSpy).toHaveBeenCalledWith(mockClient, { type: 'hangup' });
    });
  });

  describe('destroy', () => {
    it('should call cleanup and reset', () => {
      webRTCApp = new WebRTCApp();
      const cleanupSpy = vi.spyOn(webRTCApp, 'cleanup');
      const resetSpy = vi.spyOn(webRTCApp, 'reset');

      webRTCApp.destroy();

      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      expect(resetSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset', () => {
    it('should redirect to the origin + pathname', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: '',
          origin: 'http://localhost:3000',
          pathname: '/testpath'
        },
        writable: true
      });
      webRTCApp = new WebRTCApp();
      webRTCApp.reset();
      expect(window.location.href).toBe('http://localhost:3000/testpath');
    });
  });

  describe('initClient', () => {
    it('should initialize a new client without an offer', async () => {
      webRTCApp = new WebRTCApp();
      const sid = 'test-sid';
      const cid = await webRTCApp.initClient(false, { sid });

      expect(cid).toBeDefined();
      expect(global.RTCPeerConnection).toHaveBeenCalledTimes(1);
      expect(getDirectClient(cid)).toBeDefined();
      expect(mockPeerConnectionInstance.createDataChannel).toHaveBeenCalledWith('nego', {
        negotiated: true,
        id: 0
      });
      expect(mockPeerConnectionInstance.createOffer).toHaveBeenCalledTimes(1);
      expect(mockPeerConnectionInstance.setLocalDescription).toHaveBeenCalledTimes(1);
      expect(webRTCApp.getCid(sid)).toBe(cid);
    });

    it('should initialize a new client with an offer', async () => {
      webRTCApp = new WebRTCApp();
      const sid = 'test-sid-offer';
      const offerSdp = 'v=0\r\no=- 12345 67890 IN IP4 host.example.com\r\n...';
      const cid = await webRTCApp.initClient(true, { sid, offer: offerSdp });

      expect(cid).toBeDefined();
      expect(global.RTCPeerConnection).toHaveBeenCalledTimes(1);
      expect(mockPeerConnectionInstance.setRemoteDescription).toHaveBeenCalledWith({
        type: 'offer',
        sdp: offerSdp.trim() + '\n'
      });
      expect(mockPeerConnectionInstance.createAnswer).toHaveBeenCalledTimes(1);
      expect(mockPeerConnectionInstance.setLocalDescription).toHaveBeenCalledTimes(1); // Once for answer
      expect(webRTCApp.getCid(sid)).toBe(cid);
    });

    it('should use existing client if sid already exists and client is found', async () => {
      webRTCApp = new WebRTCApp();
      const sid = 'existing-sid';
      // First call to establish the client and sid mapping.
      // The client created here will have its `pc` property as `mockPeerConnectionInstance`
      // because `new RTCPeerConnection()` is mocked to return `mockPeerConnectionInstance`.
      // Our stateful `addDirectClient` mock will store this client.
      const firstCid = await webRTCApp.initClient(false, { sid });

      // Second call with the same sid.
      // `initClient` should find the existing client via the stateful `getDirectClient` mock.
      // The returned client's `pc` property (which is `mockPeerConnectionInstance`) should have `restartIce` called.
      const secondCid = await webRTCApp.initClient(false, { sid });

      expect(secondCid).toBe(firstCid); // Should return the same CID
      expect(global.RTCPeerConnection).toHaveBeenCalledTimes(1); // Constructor only called once for the first client
      expect(mockPeerConnectionInstance.restartIce).toHaveBeenCalledTimes(1); // Should call restartIce on the existing client's pc
    });

    it('should trigger nego_dc.onopen and send challenge', async () => {
      webRTCApp = new WebRTCApp();
      const sendNegoMessageSpy = vi.spyOn(webRTCApp['negotiationManager'], 'sendNegoMessage');
      const sid = 'nego-dc-open-sid';
      await webRTCApp.initClient(false, { sid });

      expect(mockDataChannel.onopen).toBeInstanceOf(Function);
      if (mockDataChannel.onopen) {
        mockDataChannel.onopen(); // Manually trigger onopen
      }

      expect(sendNegoMessageSpy).toHaveBeenCalledWith(
        expect.anything(), // client object
        expect.objectContaining({ type: 'challenge', data: expect.any(String) })
      );
    });

    it('should handle onnegotiationneeded', async () => {
      webRTCApp = new WebRTCApp();
      const sendNegoMessageSpy = vi.spyOn(webRTCApp['negotiationManager'], 'sendNegoMessage');
      const sid = 'negotiation-needed-sid';
      await webRTCApp.initClient(false, { sid }); // polite=false, so it's an offerer

      mockPeerConnectionInstance.localDescription = {
        type: 'offer',
        sdp: 'mockOfferSdpFromNegotiation'
      };

      expect(mockPeerConnectionInstance.onnegotiationneeded).toBeInstanceOf(Function);
      if (mockPeerConnectionInstance.onnegotiationneeded) {
        await mockPeerConnectionInstance.onnegotiationneeded(); // Manually trigger
      }
      expect(sendNegoMessageSpy).toHaveBeenCalledWith(expect.anything(), {
        type: 'offer',
        sdp: 'mockOfferSdpFromNegotiation'
      });
    });

    it('should call updateDirectClientState and updateFingerprint on connection success', async () => {
      webRTCApp = new WebRTCApp();
      const sid = 'connection-state-sid';
      const cid = await webRTCApp.initClient(false, { sid });

      const mockStatsReport = new Map();
      mockStatsReport.set('transport-1', {
        type: 'transport',
        localCertificateId: 'cert-local',
        remoteCertificateId: 'cert-remote'
      });
      mockStatsReport.set('cert-local', {
        type: 'certificate',
        id: 'cert-local',
        fingerprint: 'local_fp_mock'
      });
      mockStatsReport.set('cert-remote', {
        type: 'certificate',
        id: 'cert-remote',
        fingerprint: 'remote_fp_mock'
      });
      mockPeerConnectionInstance.getStats.mockResolvedValue(mockStatsReport);

      mockPeerConnectionInstance.connectionState = 'connected';
      mockPeerConnectionInstance.iceConnectionState = 'connected';

      expect(mockPeerConnectionInstance.onconnectionstatechange).toBeInstanceOf(Function);
      if (mockPeerConnectionInstance.onconnectionstatechange) {
        mockPeerConnectionInstance.onconnectionstatechange(); // Trigger event
      }

      // Wait for async operations within onconnectionstatechange, like updateFingerprint
      await vi.waitFor(() => {
        expect(updateDirectClientState).toHaveBeenCalledWith(cid, 'connected', 'connected');
      });
      await vi.waitFor(() => {
        expect(updateDirectClientFingerprint).toHaveBeenCalledWith(cid, expect.any(String));
      });
    });
  });

  describe('getOffer', () => {
    it('should initialize client and set onicecandidate', async () => {
      webRTCApp = new WebRTCApp();
      const cb = vi.fn().mockResolvedValue(undefined);
      const sid = 'get-offer-sid';
      const cid = await webRTCApp.getOffer(cb, { sid });

      expect(cid).toBeDefined();
      expect(global.RTCPeerConnection).toHaveBeenCalledTimes(1); // initClient called
      expect(mockPeerConnectionInstance.onicecandidate).toBeInstanceOf(Function);

      // Simulate an ICE candidate
      const mockCandidate = { candidate: 'mockCandidateData' };
      if (mockPeerConnectionInstance.onicecandidate) {
        await mockPeerConnectionInstance.onicecandidate({ candidate: mockCandidate });
      }
      expect(cb).toHaveBeenCalledWith(mockCandidate);
    });
  });

  describe('getAnswer', () => {
    it('should initialize client with offer and set onicecandidate', async () => {
      webRTCApp = new WebRTCApp();
      const offerSdp = 'v=0\r\no=- offer 123\r\n...';
      const cb = vi.fn().mockResolvedValue(undefined);
      const sid = 'get-answer-sid';
      const cid = await webRTCApp.getAnswer(offerSdp, cb, { sid });

      expect(cid).toBeDefined();
      expect(global.RTCPeerConnection).toHaveBeenCalledTimes(1); // initClient called
      expect(mockPeerConnectionInstance.setRemoteDescription).toHaveBeenCalledWith({
        type: 'offer',
        sdp: offerSdp.trim() + '\n'
      });
      expect(mockPeerConnectionInstance.onicecandidate).toBeInstanceOf(Function);

      // Simulate an ICE candidate
      const mockCandidate = { candidate: 'mockCandidateDataForAnswer' };
      if (mockPeerConnectionInstance.onicecandidate) {
        await mockPeerConnectionInstance.onicecandidate({ candidate: mockCandidate });
      }
      expect(cb).toHaveBeenCalledWith(mockCandidate);
    });
  });

  describe('sha256', () => {
    it('should compute a SHA-256 hash', async () => {
      webRTCApp = new WebRTCApp();
      const message = 'test message';
      // The mock crypto.subtle.digest returns a fixed ArrayBuffer based on 'mockedhash_' + message
      const expectedHash = Buffer.from(
        await global.crypto.subtle.digest('', new TextEncoder().encode(message))
      ).toString('hex');

      const hash = await webRTCApp.sha256(message);
      expect(hash).toBe(expectedHash);
    });
  });

  describe('genEmojis', () => {
    it('should generate 4 emojis from a digest', async () => {
      // Override crypto.subtle.digest for this specific test for very predictable small hash values
      const simpleHashBuffer = new Uint8Array(32); // 32 bytes of zeros
      simpleHashBuffer[0] = 1; // Make it slightly non-zero but small
      simpleHashBuffer[1] = 1;
      simpleHashBuffer[2] = 1;
      simpleHashBuffer[3] = 1;

      vi.stubGlobal('crypto', {
        getRandomValues: vi.fn().mockImplementation((arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
          }
          return arr;
        }),
        subtle: {
          digest: vi.fn().mockResolvedValue(simpleHashBuffer.buffer)
        }
      });

      webRTCApp = new WebRTCApp(); // Re-initialize to pick up the test-specific crypto mock
      const digest = 'testdigest';
      const emojis = await webRTCApp.genEmojis(digest);

      expect(emojis).toBeDefined();
      expect(typeof emojis === 'string').toBe(true);
      const emojiArray = Array.from(emojis);
      expect(emojiArray.length).toBe(4);
    });

    it('should return fallback emojis if crypto.subtle is not available', async () => {
      // Temporarily stub crypto for this specific test case
      vi.stubGlobal('crypto', {
        // getRandomValues might be called by uuidv4 during WebRTCApp instantiation or other init paths
        getRandomValues: vi.fn().mockImplementation((arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
          }
          return arr;
        }),
        subtle: undefined // Key: set subtle to undefined
      });

      // Re-initialize WebRTCApp to ensure it picks up the modified crypto stub
      webRTCApp = new WebRTCApp();
      const digest = 'testdigest_no_subtle';
      const emojis = await webRTCApp.genEmojis(digest);
      expect(emojis).toBe('❗❗❗❗❗❗❗❗');

      // vi.restoreAllMocks() in afterEach will restore the original crypto stub
    });
  });

  describe('logDiff', () => {
    it('should append diff to the #diffs element', () => {
      webRTCApp = new WebRTCApp();
      (webRTCApp as any).debug = true; // Enable debug to show diffs

      webRTCApp.logDiff('abc', 'abd');

      expect(document.getElementById).toHaveBeenCalledWith('diffs');
      expect(mockDiffsElement.classList.remove).toHaveBeenCalledWith('hidden');
      expect(document.createDocumentFragment).toHaveBeenCalled();
      expect(mockDiffsElement.appendChild).toHaveBeenCalled();

      // Check that createElement was called to create spans for diff parts
      // diffChars('abc', 'abd') produces: [{value: "ab", count:2}, {value:"c", removed:true, count:1}, {value:"d", added:true, count:1}]
      expect(document.createElement).toHaveBeenCalledWith('span'); // At least one span
    });

    it('should not show diffs if debug is false', () => {
      webRTCApp = new WebRTCApp();
      (webRTCApp as any).debug = false;

      webRTCApp.logDiff('abc', 'abd');

      expect(document.getElementById).toHaveBeenCalledWith('diffs');
      // classList.remove('hidden') should NOT be called if debug is false and element is already hidden
      // However, the current implementation of logDiff always calls remove('hidden') if debug is true.
      // If debug is false, it doesn't touch classList.
      expect(mockDiffsElement.classList.remove).not.toHaveBeenCalledWith('hidden');
      expect(mockDiffsElement.appendChild).toHaveBeenCalled(); // Still appends, just doesn't ensure visibility
    });
  });
});
