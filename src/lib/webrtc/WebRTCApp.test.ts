import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { WebRTCApp } from './WebRTCApp';
import { streamInit } from '../app/streamLifecycle';
import { forwardInit } from '../app/forwardLifecycle';
import { resetConnectionStore, getAllClientCids, getDirectClient } from '../stores/connectionStore';
import { resetAppStateStore, getAllCleanups } from '../stores/appStateStore';
import { resetCidKeyStore } from '../stores/cidKeyStore';

// Mock dependencies
vi.mock('../app/streamLifecycle', () => ({
  streamInit: vi.fn()
}));

vi.mock('../app/forwardLifecycle', () => ({
  forwardInit: vi.fn()
}));

vi.mock('../stores/connectionStore', async () => {
  const actual = await vi.importActual('../stores/connectionStore');
  return {
    ...actual,
    addDirectClient: vi.fn(),
    updateDirectClientState: vi.fn(),
    updateDirectClientFingerprint: vi.fn(),
    removeDirectClient: vi.fn(),
    addParticipant: vi.fn(),
    removeParticipant: vi.fn(),
    resetConnectionStore: vi.fn(actual.resetConnectionStore as any), // Use actual for reset
    getDirectClient: vi.fn(),
    getAllClientCids: vi.fn(() => [])
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
    // Assuming resetConfigStore might be part of actual and used elsewhere.
    resetConfigStore: (actual as any).resetConfigStore ? vi.fn((actual as any).resetConfigStore) : vi.fn()
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

  beforeEach(() => {
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
    mockPeerConnectionInstance.getStats.mockResolvedValue(new Map()); // Reset to default

    // Reset document mocks
    mockDiffsElement.classList.remove.mockClear();
    mockDiffsElement.classList.add.mockClear();
    mockDiffsElement.appendChild.mockClear();
    (global.document.getElementById as Mock).mockImplementation((id) => {
      if (id === 'diffs') return mockDiffsElement;
      return null;
    });
    (global.document.createDocumentFragment as Mock).mockImplementation(() => ({ appendChild: vi.fn() }));
    (global.document.createElement as Mock).mockImplementation((tagName) => ({ style: {}, appendChild: vi.fn() }));


    // Reset crypto.subtle.digest mock if its behavior needs to be fresh for each test
    (global.crypto.subtle.digest as Mock).mockImplementation(async (algorithm, data) => {
      const S = 'mockedhash_';
      const textEncoder = new TextEncoder();
      const dataArray = textEncoder.encode(S + new TextDecoder().decode(data as ArrayBuffer));
      return dataArray.buffer;
    });

    // Reset history and URLSearchParams mocks
    (global.history.replaceState as Mock)?.mockClear();
    (global.URLSearchParams as Mock)?.mockClear().mockImplementation(() => ({
      has: vi.fn().mockReturnValue(false),
      get: vi.fn().mockReturnValue(null)
    }));


    // Manually reset stores that have actual implementations for reset
    resetConnectionStore();
    resetAppStateStore();
    resetCidKeyStore();
    // Potentially reset configStore if it has a reset function and is stateful
    const configStoreMock = await vi.importMock('../stores/configStore');
    if (configStoreMock.resetConfigStore) {
        configStoreMock.resetConfigStore();
    }
    (configStoreMock.getAllConfig as Mock).mockReturnValue({ // Ensure it's reset to default
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
      expect(mockPeerConnectionInstance.createDataChannel).toHaveBeenCalledWith('nego', { negotiated: true, id: 0 });
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
      expect(mockPeerConnectionInstance.setRemoteDescription).toHaveBeenCalledWith({ type: 'offer', sdp: offerSdp.trim() + '\n' });
      expect(mockPeerConnectionInstance.createAnswer).toHaveBeenCalledTimes(1);
      expect(mockPeerConnectionInstance.setLocalDescription).toHaveBeenCalledTimes(1); // Once for answer
      expect(webRTCApp.getCid(sid)).toBe(cid);
    });

    it('should use existing client if sid already exists and client is found', async () => {
      webRTCApp = new WebRTCApp();
      const sid = 'existing-sid';
      // First call to establish the client and sid mapping
      const firstCid = await webRTCApp.initClient(false, { sid });
      (getDirectClient as Mock).mockReturnValue(mockPeerConnectionInstance); // Ensure getDirectClient returns something for the existing CID

      // Second call with the same sid
      const secondCid = await webRTCApp.initClient(false, { sid });

      expect(secondCid).toBe(firstCid);
      expect(global.RTCPeerConnection).toHaveBeenCalledTimes(1); // Constructor only called once
      expect(mockPeerConnectionInstance.restartIce).toHaveBeenCalledTimes(1); // Should call restartIce
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

      mockPeerConnectionInstance.localDescription = { type: 'offer', sdp: 'mockOfferSdpFromNegotiation' };

      expect(mockPeerConnectionInstance.onnegotiationneeded).toBeInstanceOf(Function);
      if (mockPeerConnectionInstance.onnegotiationneeded) {
        await mockPeerConnectionInstance.onnegotiationneeded(); // Manually trigger
      }
      expect(sendNegoMessageSpy).toHaveBeenCalledWith(
        expect.anything(),
        { type: 'offer', sdp: 'mockOfferSdpFromNegotiation' }
      );
    });
    
    it('should call updateDirectClientState and updateFingerprint on connection success', async () => {
      webRTCApp = new WebRTCApp();
      const sid = 'connection-state-sid';
      const cid = await webRTCApp.initClient(false, { sid });

      const mockStatsReport = new Map();
      mockStatsReport.set('transport-1', { type: 'transport', localCertificateId: 'cert-local', remoteCertificateId: 'cert-remote'});
      mockStatsReport.set('cert-local', { type: 'certificate', id: 'cert-local', fingerprint: 'local_fp_mock'});
      mockStatsReport.set('cert-remote', { type: 'certificate', id: 'cert-remote', fingerprint: 'remote_fp_mock'});
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
      expect(mockPeerConnectionInstance.setRemoteDescription).toHaveBeenCalledWith({ type: 'offer', sdp: offerSdp.trim() + '\n' });
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
      const expectedHash = Buffer.from(await global.crypto.subtle.digest('', new TextEncoder().encode(message))).toString('hex');
      
      const hash = await webRTCApp.sha256(message);
      expect(hash).toBe(expectedHash);
    });
  });

  describe('genEmojis', () => {
    it('should generate 4 emojis from a digest', async () => {
      webRTCApp = new WebRTCApp();
      const digest = 'testdigest';
      const emojis = await webRTCApp.genEmojis(digest);
      // This test relies on the EMOJIS array and the mocked crypto.subtle.digest
      // The exact output depends on the mocked hash and EMOJIS content.
      // We are primarily testing that it produces 4 characters (emojis).
      expect(emojis).toBeDefined();
      // Unicode emojis can be multiple code units. A simple length check might be tricky.
      // A more robust check would be to count grapheme clusters if this were critical.
      // For now, checking it's a non-empty string and relying on visual inspection or a known good value from the mock.
      expect(typeof emojis === 'string').toBe(true);
      // Based on the fixed mock hash, we can derive an expected emoji string if EMOJIS array is stable.
      // For simplicity, let's check it returns something plausible.
      // Example: If EMOJIS[0] is '😀', and calculation results in all zeros:
      // expect(emojis).toBe('😀😀😀😀'); // This would be too brittle.
      // Just check length for now, assuming emojis are single char for this test.
      // A better check might be to spy on EMOJIS access or mock EMOJIS for predictable output.
      // Given the current mock, the output is deterministic.
      // Let's assume the mock digest 'mockedhash_testdigest' results in some indices.
      // The number of emojis is fixed at 4 by the implementation.
      const emojiArray = Array.from(emojis); // Splits into grapheme clusters
      expect(emojiArray.length).toBe(4);
    });

    it('should return fallback emojis if crypto.subtle is not available', async () => {
      const originalSubtle = global.crypto.subtle;
      (global.crypto as any).subtle = undefined; // Simulate crypto.subtle not being available
      webRTCApp = new WebRTCApp();
      const digest = 'testdigest_no_subtle';
      const emojis = await webRTCApp.genEmojis(digest);
      expect(emojis).toBe('❗❗❗❗❗❗❗❗');
      global.crypto.subtle = originalSubtle; // Restore
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
