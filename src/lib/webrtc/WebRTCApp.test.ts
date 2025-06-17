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
    // Manually reset stores that have actual implementations for reset
    resetConnectionStore();
    resetAppStateStore();
    resetCidKeyStore();
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
});
