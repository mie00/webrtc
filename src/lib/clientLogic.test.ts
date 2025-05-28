import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
import { ClientLogic } from './clientLogic';
import type { AppLogicContext } from './appLogic';
import type { Config } from './stores/configStore';
import { get } from 'svelte/store';
// Import the actual store and its reset function for testing
import {
  appLogicModuleStore,
  resetAppLogicModuleStore,
  type AppLogicState
} from './stores/appLogicStore';

// Mocks for direct imports in ClientLogic.ts
const mockGetDirectClient = vi.fn();
const mockGetAllConfig = vi.fn();
const mockCompress = vi.fn((sdp: string | null | undefined) => (sdp ? `compressed-${sdp}` : ''));
const mockDecompress = vi.fn((text: string) => text.replace(/^compressed-/, ''));

vi.mock('./stores/connectionStore.js', () => ({ // Adjusted path assuming connectionStore.js is a sibling in stores
  getDirectClient: mockGetDirectClient
}));

vi.mock('./stores/configStore.js', async () => { // Adjusted path
  const actualConfigStore =
    await vi.importActual<typeof import('./stores/configStore.js')>('./stores/configStore.js');
  return {
    ...actualConfigStore, // Spread actual exports
    getAllConfig: mockGetAllConfig, // Override getAllConfig with our mock
    defaultConfig: actualConfigStore.defaultConfig // Ensure defaultConfig is available
  };
});

// Corrected mock path for sdpCompress relative to ClientLogic.ts
vi.mock('./utils/sdpCompress.js', () => ({
  compress: mockCompress,
  decompress: mockDecompress
}));

// Mock BroadcastChannel
const mockBroadcastChannelInstance = {
  onmessage: null as ((event: { data: any }) => void) | null,
  postMessage: vi.fn(),
  close: vi.fn()
};
const MockBroadcastChannel = vi.fn(() => mockBroadcastChannelInstance);

// Mock AppLogicContext
// No longer need mockAppLogicStore here, will use the real one and reset it.

const mockWebRTCApp = {
  getOffer: vi.fn(),
  getAnswer: vi.fn()
  // Add other WebRTCApp methods here if ClientLogic uses them
};

// Define mockContext with placeholders for properties that will be reset in beforeEach
let mockContext: AppLogicContext; // To be initialized in beforeEach

describe('ClientLogic', () => {
  let clientLogic: ClientLogic;
  let actualDefaultConfig: Config; // To store the dynamically imported config

  beforeEach(async () => {
    // Make beforeEach async
    // Dynamically import defaultConfig to ensure we get the fresh, unmocked version
    const configStoreModule =
      await vi.importActual<typeof import('./stores/configStore.js')>('./stores/configStore.js');
    actualDefaultConfig = configStoreModule.defaultConfig;

    if (typeof actualDefaultConfig === 'undefined') {
      // This error should not be hit anymore if defaultConfig is exported
      throw new Error(
        'defaultConfig from vi.importActual is undefined. Ensure it is exported from configStore.ts.'
      );
    }

    // Reset the actual appLogicModuleStore before each test
    resetAppLogicModuleStore();

    // Setup mocks for imported functions
    mockGetAllConfig.mockReturnValue(JSON.parse(JSON.stringify(actualDefaultConfig))); // Deep copy
    mockCompress.mockImplementation((sdp: string | null | undefined) =>
      sdp ? `compressed-${sdp}` : ''
    );
    mockDecompress.mockImplementation((text: string) => text.replace(/^compressed-/, '')); // Ensure it's synchronous for tests expecting that
    mockGetDirectClient.mockClear(); // Clear any previous mock state if necessary

    // Spy on appLogicModuleStore.update
    vi.spyOn(appLogicModuleStore, 'update');

    mockContext = {
      webRTCApp: mockWebRTCApp as any,
      // appStateStore removed from context
      appOnId: vi.fn(),
      broadcastManuallyEnteredAnswer: vi.fn(),
      reportCriticalError: vi.fn()
    };

    // Mock global objects
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
    const mockHistory = { replaceState: vi.fn() }; // Keep mockHistory in scope for clearing
    vi.stubGlobal('history', mockHistory);
    const mockWindowLocation = {
      search: '',
      origin: 'http://localhost',
      pathname: '/testpath',
      href: 'http://localhost/testpath',
      toString: () => 'http://localhost/testpath'
    };
    vi.stubGlobal('window', {
      location: mockWindowLocation,
      URLSearchParams: URLSearchParams // Ensure real URLSearchParams is available
    });

    // Clear call history and results of mocks
    vi.clearAllMocks();

    // Reset/re-initialize specific mocks after clearAllMocks
    // BroadcastChannel
    mockBroadcastChannelInstance.onmessage = null;
    mockBroadcastChannelInstance.postMessage.mockClear();
    mockBroadcastChannelInstance.close.mockClear();
    MockBroadcastChannel.mockClear();
    // History
    mockHistory.replaceState.mockClear(); // Clear the specific mock

    // WebRTCApp methods
    mockWebRTCApp.getOffer.mockClear();
    mockWebRTCApp.getAnswer.mockClear();
    mockContext.webRTCApp = mockWebRTCApp as any;

    // Clear mocks for imported functions
    mockGetDirectClient.mockClear();
    mockCompress.mockClear();
    mockCompress.mockImplementation((sdp: string | null | undefined) =>
      sdp ? `compressed-${sdp}` : ''
    );
    mockDecompress.mockClear();
    mockDecompress.mockImplementation((text: string) => text.replace(/^compressed-/, ''));
    mockGetAllConfig.mockClear();
    mockGetAllConfig.mockReturnValue(JSON.parse(JSON.stringify(actualDefaultConfig))); // Reset to default config

    // Other context functions
    (mockContext.appOnId as any).mockClear();
    (mockContext.broadcastManuallyEnteredAnswer as any).mockClear();
    (mockContext.reportCriticalError! as any).mockClear();

    clientLogic = new ClientLogic(mockContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Ensure our module-level mocks are also cleared if not covered by restoreAllMocks fully for vi.mock pattern
    mockGetDirectClient.mockReset();
    mockGetAllConfig.mockReset();
    mockCompress.mockReset();
    mockDecompress.mockReset(); // Reset to initial mock implementation if needed

    // Restore spy on appLogicModuleStore.update if vi.restoreAllMocks() doesn't cover it for some reason
    // (though it generally should)
    if ((appLogicModuleStore.update as any).mockRestore) {
      (appLogicModuleStore.update as any).mockRestore();
    }
  });

  describe('constructor', () => {
    it('should store the provided context', () => {
      expect((clientLogic as any).context).toBe(mockContext);
    });
  });

  describe('initialize', () => {
    it('should generate an offer if no URL params are present', async () => {
      (vi.mocked(window).location as any).search = '';

      const mockCid = 'mock-offer-cid';
      let iceCallback: ((candidate: any, cid: string) => Promise<void>) | null = null;

      (mockContext.webRTCApp.getOffer as any).mockImplementation(
        async (cb: (candidate: any, cid: string) => Promise<void>, options: any) => {
          // Simulate WebRTCApp passing the CID to the callback
          iceCallback = (candidate) => cb(candidate, mockCid);
          return mockCid; // Resolve with a mock CID
        }
      );

      const mockClientPc = {
        localDescription: { sdp: 'mockOfferSdp' }
      };
      const mockClient = { pc: mockClientPc };
      mockGetDirectClient.mockReturnValue(mockClient as any);

      await clientLogic.initialize(new URLSearchParams((vi.mocked(window).location as any).search));

      // Manually trigger the ICE callback
      expect(iceCallback).not.toBeNull();
      if (iceCallback) {
        await (iceCallback as any)(null); // Simulate ICE gathering complete
      }

      expect(mockContext.webRTCApp.getOffer).toHaveBeenCalledTimes(1);
      expect(mockGetDirectClient).toHaveBeenCalledWith(mockCid);
      expect(mockCompress).toHaveBeenCalledWith('mockOfferSdp');
      // ... (previous assertions: webRTCApp.getOffer, getDirectClient, compress)

      const expectedCompressedSdp = 'compressed-mockOfferSdp'; // From mockCompress
      const expectedPathname = (vi.mocked(window).location as any).pathname;
      const expectedOrigin = (vi.mocked(window).location as any).origin;
      const expectedQrCodeContent = `${expectedOrigin}${expectedPathname}?offer=${expectedCompressedSdp}`;

      // Check that history.replaceState was called with the correct final URL
      // This is called from prepareOfferForClientModeDisplay's ICE callback
      expect(vi.mocked(history.replaceState)).toHaveBeenCalledWith(null, '', expectedQrCodeContent);

      // Check key aspects of the final state (held in appLogicModuleStore)
      const finalState = get(appLogicModuleStore);
      expect(finalState.currentOfferCid).toBe(mockCid);
      expect(finalState.qrCodeUrl).toBe(expectedQrCodeContent);
      expect(finalState.copyText).toBe(expectedQrCodeContent);
      expect(finalState.showCopyOverlay).toBe(true);
      expect(finalState.initialOverlayShown).toBe(true);
    });

    it('should process an offer from URL params and generate an answer', async () => {
      const compressedOfferInUrl = 'compressed-offer-from-url';
      const offerSdp = 'offer-sdp-from-url';
      (vi.mocked(window).location as any).search = `?offer=${compressedOfferInUrl}`;
      const urlParams = new URLSearchParams((vi.mocked(window).location as any).search);

      mockDecompress.mockResolvedValue(offerSdp);

      const mockAnswererCid = 'mock-answerer-cid';
      let answerIceCallback: ((candidate: any, cid: string) => Promise<void>) | null = null;
      (mockContext.webRTCApp.getAnswer as any).mockImplementation(
        async (offer: string, cb: (candidate: any, cid: string) => Promise<void>, options: any) => {
          expect(offer).toBe(offerSdp);
          // Simulate WebRTCApp passing the CID to the callback
          answerIceCallback = (candidate) => cb(candidate, mockAnswererCid);
          return mockAnswererCid;
        }
      );

      const mockClientPc = { localDescription: { sdp: 'mockAnswerSdp' } };
      const mockClient = { pc: mockClientPc };
      mockGetDirectClient.mockReturnValue(mockClient as any);

      // mockCompress is already mocked via vi.mock and beforeEach

      await clientLogic.initialize(urlParams);

      // Trigger ICE callback for getAnswer
      expect(answerIceCallback).not.toBeNull();
      if (answerIceCallback) {
        await (answerIceCallback as any)(null);
      }

      expect(mockDecompress).toHaveBeenCalledWith(compressedOfferInUrl);
      expect(mockContext.webRTCApp.getAnswer).toHaveBeenCalledTimes(1);
      expect(mockGetDirectClient).toHaveBeenCalledWith(mockAnswererCid);
      expect(mockCompress).toHaveBeenCalledWith('mockAnswerSdp');

      const compressedAnswerSdp = 'compressed-mockAnswerSdp'; // From mockCompress
      const expectedPathname = (vi.mocked(window).location as any).pathname;
      const expectedOrigin = (vi.mocked(window).location as any).origin;

      const finalUrlParams = new URLSearchParams();
      finalUrlParams.set('offer', compressedOfferInUrl);
      finalUrlParams.set('answer', compressedAnswerSdp);
      const expectedAnswerUrl = `${expectedOrigin}${expectedPathname}?${finalUrlParams.toString()}`;

      // Check the history.replaceState call from getAnswer's ICE callback
      expect(vi.mocked(history.replaceState)).toHaveBeenCalledWith('', '', expectedAnswerUrl);

      // Check final state properties set during this flow
      const finalState = get(appLogicModuleStore);
      expect(finalState.qrCodeUrl).toBe(expectedAnswerUrl);
      expect(finalState.copyText).toBe(compressedAnswerSdp);
      expect(finalState.showCopyOverlay).toBe(true);
      expect(finalState.initialOverlayShown).toBe(true);
      expect(finalState.showAcceptButton).toBe(false);
      expect(finalState.showPasteText).toBe(false);
      expect(finalState.showCopyButton).toBe(true);

      // Check the history.replaceState call (should be only one in this path from initialize)
      const historyCalls = vi.mocked(history.replaceState).mock.calls;
      expect(historyCalls.length).toBe(1);
      expect(historyCalls[0]).toEqual(['', '', expectedAnswerUrl]);
    });

    it('should process an answer from URL params and broadcast it', async () => {
      const offerParam = 'compressed-offer-for-answer';
      const answerParam = 'compressed-answer-from-url';
      (vi.mocked(window).location as any).search = `?offer=${offerParam}&answer=${answerParam}`;
      const urlParams = new URLSearchParams((vi.mocked(window).location as any).search);

      await clientLogic.initialize(urlParams);

      expect(mockContext.broadcastManuallyEnteredAnswer).toHaveBeenCalledWith(
        offerParam,
        answerParam
      );

      const finalState = get(appLogicModuleStore);
      expect(finalState.showCopyOverlay).toBe(true);
      expect(finalState.initialOverlayShown).toBe(true);
      expect(finalState.copyText).toBe('Call started on another tab, please close this one');
      expect(finalState.showCopyButton).toBe(false);
      expect(finalState.showAcceptButton).toBe(false);
      expect(finalState.showPasteText).toBe(false);
      expect(finalState.showJoinButton).toBe(false);

      // In this specific path of initialize, history.replaceState is NOT called.
      expect(vi.mocked(history.replaceState)).not.toHaveBeenCalled();
    });
  });

  describe('handleOpenQrRequest', () => {
    it('should prepare and display an offer if no offer/answer in URL params', async () => {
      const urlParams = new URLSearchParams(''); // Empty params
      (vi.mocked(window).location as any).search = ''; // Ensure window.location.search is also empty for prepareOffer...

      const mockCid = 'mock-offer-cid-for-qr';
      let iceCallback: ((candidate: any, cid: string) => Promise<void>) | null = null;
      (mockContext.webRTCApp.getOffer as any).mockImplementation(
        async (cb: (candidate: any, cid: string) => Promise<void>, options: any) => {
          iceCallback = (candidate) => cb(candidate, mockCid);
          return mockCid;
        }
      );
      const mockClientPc = { localDescription: { sdp: 'mockOfferSdpForQr' } };
      const mockClient = { pc: mockClientPc };
      mockGetDirectClient.mockReturnValue(mockClient as any);

      await clientLogic.handleOpenQrRequest(urlParams);

      expect(iceCallback).not.toBeNull();
      if (iceCallback) {
        await (iceCallback as any)(null);
      }
      // Check that appLogicModuleStore was updated to set initialOverlayShown: false
      const updateCallsTyped = (appLogicModuleStore.update as Mock).mock.calls as [
        (state: AppLogicState) => AppLogicState
      ][];
      const initialStateStub: AppLogicState = {
        showCopyOverlay: false,
        initialOverlayShown: true, // Crucial for testing the transition to false
        copyText: '',
        qrCodeUrl: '',
        showAcceptButton: false,
        showJoinButton: false,
        showCopyButton: true,
        showPasteText: false,
        currentOfferCid: null,
        isDuringInitialServerLoad: false
      };
      const initialOverlayUpdate = updateCallsTyped.find((call) => {
        const updater = call[0];
        const updatedState = updater(initialStateStub);
        return updatedState.initialOverlayShown === false;
      });
      expect(initialOverlayUpdate).toBeDefined();

      expect(mockContext.webRTCApp.getOffer).toHaveBeenCalledTimes(1);
      expect(mockCompress).toHaveBeenCalledWith('mockOfferSdpForQr');

      const expectedCompressedSdp = 'compressed-mockOfferSdpForQr'; // From mockCompress
      const expectedPathname = (vi.mocked(window).location as any).pathname;
      const expectedOrigin = (vi.mocked(window).location as any).origin;
      const expectedQrCodeContent = `${expectedOrigin}${expectedPathname}?offer=${expectedCompressedSdp}`;

      expect(vi.mocked(history.replaceState)).toHaveBeenCalledWith(null, '', expectedQrCodeContent);
      const finalState = get(appLogicModuleStore);
      expect(finalState.qrCodeUrl).toBe(expectedQrCodeContent);
      expect(finalState.copyText).toBe(expectedQrCodeContent);
      expect(finalState.showCopyOverlay).toBe(true);
    });

    it('should call appOnId and set UI for displaying existing URL if params are present', async () => {
      const urlParams = new URLSearchParams('?offer=someoffer');
      (vi.mocked(window).location as any).search = '?offer=someoffer';

      (mockContext.appOnId as any).mockImplementation(() => {
        appLogicModuleStore.update((s) => ({
          ...s,
          qrCodeUrl: 'http://localhost/testpath?offer=someoffer',
          copyText: 'http://localhost/testpath?offer=someoffer',
          showCopyOverlay: true
        }));
      });

      appLogicModuleStore.update((s) => ({ ...s, copyText: 'initial copy text' })); // Before appOnId is called

      await clientLogic.handleOpenQrRequest(urlParams);

      const updateCallsTyped = (appLogicModuleStore.update as Mock).mock.calls as [
        (state: AppLogicState) => AppLogicState
      ][];
      const initialStateStub: AppLogicState = {
        showCopyOverlay: false,
        initialOverlayShown: true, // Crucial for testing the transition to false
        copyText: '',
        qrCodeUrl: '',
        showAcceptButton: false,
        showJoinButton: false,
        showCopyButton: true,
        showPasteText: false,
        currentOfferCid: null,
        isDuringInitialServerLoad: false
      };
      const initialOverlayUpdate = updateCallsTyped.find((call) => {
        const updater = call[0];
        const updatedState = updater(initialStateStub);
        return updatedState.initialOverlayShown === false;
      });
      expect(initialOverlayUpdate).toBeDefined();

      expect(mockContext.appOnId).toHaveBeenCalledTimes(1);

      const finalState = get(appLogicModuleStore);
      expect(finalState.showCopyButton).toBe(true);
      expect(finalState.showAcceptButton).toBe(false);
      expect(finalState.showPasteText).toBe(false);
      expect(finalState.showJoinButton).toBe(false);

      expect(finalState.qrCodeUrl).toBe('http://localhost/testpath?offer=someoffer');
      expect(finalState.copyText).toBe('http://localhost/testpath?offer=someoffer'); // Updated by appOnId
      expect(finalState.showCopyOverlay).toBe(true);
    });

    it('should hide copy button if currentCopyText indicates call started on another tab', async () => {
      const urlParams = new URLSearchParams('?answer=someanswer');
      (vi.mocked(window).location as any).search = '?answer=someanswer';

      // Simulate currentCopyText *before* appOnId runs for this specific call context
      // The `get(appLogicModuleStore)` in handleOpenQrRequest happens before `appOnId()`
      appLogicModuleStore.set({
        ...get(appLogicModuleStore), // Keep other default state parts
        copyText: 'Call started on another tab, please close this one'
      });

      (mockContext.appOnId as any).mockImplementation(() => {
        // appOnId might change copyText, but the check in handleOpenQrRequest uses the *old* one
        appLogicModuleStore.update((s) => ({
          ...s,
          qrCodeUrl: 'http://localhost/testpath?answer=someanswer',
          copyText: 'http://localhost/testpath?answer=someanswer', // Potentially updated by appOnId
          showCopyOverlay: true
        }));
      });

      await clientLogic.handleOpenQrRequest(urlParams);

      const updateCallsTyped = (appLogicModuleStore.update as Mock).mock.calls as [
        (state: AppLogicState) => AppLogicState
      ][];
      const initialStateStub: AppLogicState = {
        showCopyOverlay: false,
        initialOverlayShown: true, // Crucial for testing the transition to false
        copyText: '',
        qrCodeUrl: '',
        showAcceptButton: false,
        showJoinButton: false,
        showCopyButton: true,
        showPasteText: false,
        currentOfferCid: null,
        isDuringInitialServerLoad: false
      };
      const initialOverlayUpdate = updateCallsTyped.find((call) => {
        const updater = call[0];
        const updatedState = updater(initialStateStub);
        return updatedState.initialOverlayShown === false;
      });
      expect(initialOverlayUpdate).toBeDefined();
      expect(mockContext.appOnId).toHaveBeenCalledTimes(1);

      const finalState = get(appLogicModuleStore);
      expect(finalState.showCopyButton).toBe(false);
      expect(finalState.showAcceptButton).toBe(false);
      expect(finalState.showPasteText).toBe(false);
      expect(finalState.showJoinButton).toBe(false);
    });
  });

  describe('acceptHandler', () => {
    it('should decompress answer, set remote description, and update state on success', async () => {
      const cid = 'test-cid';
      const pastedAnswer = 'compressedAnswerValue '; // With trailing space for trim test
      const decompressedAnswer = 'decompressedAnswerValue';

      mockDecompress.mockResolvedValue(decompressedAnswer);
      const mockSetRemoteDescription = vi.fn().mockResolvedValue(undefined);
      const mockClient = { pc: { setRemoteDescription: mockSetRemoteDescription } };
      mockGetDirectClient.mockReturnValue(mockClient as any);
      // To ensure targetCid is resolved from cidFromEvent
      appLogicModuleStore.update((s) => ({ ...s, currentOfferCid: null }));

      await clientLogic.acceptHandler(cid, pastedAnswer);

      expect(mockDecompress).toHaveBeenCalledWith('compressedAnswerValue'); // Trimmed
      expect(mockGetDirectClient).toHaveBeenCalledWith(cid);
      expect(mockSetRemoteDescription).toHaveBeenCalledWith({
        type: 'answer',
        sdp: decompressedAnswer + '\n'
      });
      const finalState = get(appLogicModuleStore);
      expect(finalState.showCopyOverlay).toBe(false);
      expect(finalState.initialOverlayShown).toBe(false);
    });

    it('should use currentOfferCid from state if cidFromEvent is null', async () => {
      const stateCid = 'state-offer-cid';
      appLogicModuleStore.update((s) => ({ ...s, currentOfferCid: stateCid }));
      const pastedAnswer = 'pastedSdp';
      const decompressedAnswer = 'decompressedSdp';

      mockDecompress.mockResolvedValue(decompressedAnswer);
      const mockSetRemoteDescription = vi.fn().mockResolvedValue(undefined);
      const mockClient = { pc: { setRemoteDescription: mockSetRemoteDescription } };
      mockGetDirectClient.mockReturnValue(mockClient as any);

      await clientLogic.acceptHandler(null, pastedAnswer);

      expect(mockGetDirectClient).toHaveBeenCalledWith(stateCid);
      expect(mockSetRemoteDescription).toHaveBeenCalledWith({
        type: 'answer',
        sdp: decompressedAnswer + '\n'
      });
      const finalState = get(appLogicModuleStore);
      expect(finalState.showCopyOverlay).toBe(false);
      expect(finalState.initialOverlayShown).toBe(false);
    });

    it('should do nothing if pasteValue is empty', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      const initialStoreValue = get(appLogicModuleStore);
      await clientLogic.acceptHandler('some-cid', '');

      expect(mockDecompress).not.toHaveBeenCalled();
      expect(mockGetDirectClient).not.toHaveBeenCalled();
      expect(get(appLogicModuleStore)).toEqual(initialStoreValue); // State should not change
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Accept handler: Paste value or CID is missing.',
        { pasteValue: '', targetCid: 'some-cid' }
      );
      consoleWarnSpy.mockRestore();
    });

    it('should do nothing if targetCid is missing', async () => {
      appLogicModuleStore.update((s) => ({ ...s, currentOfferCid: null }));
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      const initialStoreValue = get(appLogicModuleStore);

      await clientLogic.acceptHandler(null, 'some-answer');

      expect(mockDecompress).not.toHaveBeenCalled();
      expect(mockGetDirectClient).not.toHaveBeenCalled();
      expect(get(appLogicModuleStore)).toEqual(initialStoreValue); // State should not change
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Accept handler: Paste value or CID is missing.',
        { pasteValue: 'some-answer', targetCid: null }
      );
      consoleWarnSpy.mockRestore();
    });

    it('should warn if getDirectClient returns no client', async () => {
      const cid = 'test-cid';
      const pastedAnswer = 'pastedAnswer';
      mockDecompress.mockResolvedValue('decompressedAnswer');
      mockGetDirectClient.mockReturnValue(null);
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      const initialStoreValue = get(appLogicModuleStore);

      await clientLogic.acceptHandler(cid, pastedAnswer);

      expect(mockDecompress).toHaveBeenCalledWith('pastedAnswer');
      expect(mockGetDirectClient).toHaveBeenCalledWith(cid);
      expect(get(appLogicModuleStore)).toEqual(initialStoreValue); // State should not change
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Client or PeerConnection not found for CID:',
        cid,
        'when accepting pasted answer.'
      );
      consoleWarnSpy.mockRestore();
    });

    it('should warn if client.pc is null', async () => {
      const cid = 'test-cid';
      const pastedAnswer = 'pastedAnswer';
      mockDecompress.mockResolvedValue('decompressedAnswer');
      mockGetDirectClient.mockReturnValue({ pc: null } as any);
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      const initialStoreValue = get(appLogicModuleStore);

      await clientLogic.acceptHandler(cid, pastedAnswer);

      expect(mockDecompress).toHaveBeenCalledWith('pastedAnswer');
      expect(mockGetDirectClient).toHaveBeenCalledWith(cid);
      expect(get(appLogicModuleStore)).toEqual(initialStoreValue); // State should not change
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Client or PeerConnection not found for CID:',
        cid,
        'when accepting pasted answer.'
      );
      consoleWarnSpy.mockRestore();
    });

    it('should log error if decompress fails', async () => {
      const cid = 'test-cid';
      const pastedAnswer = 'pastedAnswer';
      const decompressError = new Error('Decompression failed');
      mockDecompress.mockRejectedValue(decompressError);
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const initialStoreValue = get(appLogicModuleStore);

      await clientLogic.acceptHandler(cid, pastedAnswer);

      expect(mockDecompress).toHaveBeenCalledWith('pastedAnswer');
      expect(mockGetDirectClient).not.toHaveBeenCalled();
      expect(get(appLogicModuleStore)).toEqual(initialStoreValue); // State should not change
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error processing pasted answer for CID:',
        cid,
        decompressError
      );
      consoleErrorSpy.mockRestore();
    });

    it('should log error if setRemoteDescription fails', async () => {
      const cid = 'test-cid';
      const pastedAnswer = 'pastedAnswer';
      const decompressedAnswer = 'decompressedAnswer';
      const setError = new Error('Set remote failed');

      mockDecompress.mockResolvedValue(decompressedAnswer);
      const mockSetRemoteDescription = vi.fn().mockRejectedValue(setError);
      const mockClient = { pc: { setRemoteDescription: mockSetRemoteDescription } };
      mockGetDirectClient.mockReturnValue(mockClient as any);
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const initialStoreValue = get(appLogicModuleStore);

      await clientLogic.acceptHandler(cid, pastedAnswer);

      expect(mockDecompress).toHaveBeenCalledWith('pastedAnswer');
      expect(mockGetDirectClient).toHaveBeenCalledWith(cid);
      expect(mockSetRemoteDescription).toHaveBeenCalled();
      expect(get(appLogicModuleStore)).toEqual(initialStoreValue); // State should not change
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error processing pasted answer for CID:',
        cid,
        setError
      );
      consoleErrorSpy.mockRestore();
    });
  });

  // More tests for initialize, prepareOfferForClientModeDisplay, etc. will go here
});
