import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ClientLogic } from './clientLogic';
import type { AppLogicContext, AppLogicState } from './appLogic';
import type { Config } from '../stores/configStore';
// REMOVED: import { defaultConfig } from '../stores/configStore';

// Mock BroadcastChannel
const mockBroadcastChannelInstance = {
  onmessage: null as ((event: { data: any }) => void) | null,
  postMessage: vi.fn(),
  close: vi.fn()
};
const MockBroadcastChannel = vi.fn(() => mockBroadcastChannelInstance);

// Default initial state for AppLogicState
const getDefaultAppLogicState = (): AppLogicState => ({
  showCopyOverlay: false,
  initialOverlayShown: false,
  copyText: '',
  qrCodeUrl: '',
  showAcceptButton: false,
  showJoinButton: false,
  showCopyButton: false,
  showPasteText: false,
  currentOfferCid: null
});

// Mock AppLogicContext
let mockAppLogicState: AppLogicState;

const mockWebRTCApp = {
  getOffer: vi.fn(),
  getAnswer: vi.fn()
  // Add other WebRTCApp methods here if ClientLogic uses them
};

// Define mockContext with placeholders for properties that will be reset in beforeEach
const mockContext: AppLogicContext = {
  webRTCApp: mockWebRTCApp as any,
  config: undefined as any, // Will be set in beforeEach
  getDirectClient: vi.fn(),
  compress: vi.fn(async (sdp: string) => `compressed-${sdp}`),
  decompress: vi.fn(async (text: string) => text.replace(/^compressed-/, '')),
  getState: vi.fn(), // Will be set in beforeEach
  setState: vi.fn(), // Will be set in beforeEach
  appOnId: vi.fn(),
  broadcastManuallyEnteredAnswer: vi.fn(),
  reportCriticalError: vi.fn()
};

describe('ClientLogic', () => {
  let clientLogic: ClientLogic;
  let actualDefaultConfig: Config; // To store the dynamically imported config

  beforeEach(async () => {
    // Make beforeEach async
    // Dynamically import defaultConfig to ensure we get the fresh, unmocked version
    const configStoreModule =
      await vi.importActual<typeof import('../stores/configStore')>('../stores/configStore');
    actualDefaultConfig = configStoreModule.defaultConfig;

    if (typeof actualDefaultConfig === 'undefined') {
      // This error should not be hit anymore if defaultConfig is exported
      throw new Error(
        'defaultConfig from vi.importActual is undefined. Ensure it is exported from configStore.ts.'
      );
    }

    mockAppLogicState = getDefaultAppLogicState();

    mockContext.config = JSON.parse(JSON.stringify(actualDefaultConfig)); // Deep copy

    mockContext.getState = vi.fn(() => mockAppLogicState);
    mockContext.setState = vi.fn((updater) => {
      const oldState = { ...mockAppLogicState };
      let newStatePart;
      if (typeof updater === 'function') {
        newStatePart = updater(oldState);
      } else {
        newStatePart = updater;
      }
      mockAppLogicState = { ...oldState, ...newStatePart };
    });

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

    // Other context functions
    mockContext.getDirectClient.mockClear();
    mockContext.compress = vi.fn(async (sdp: string) => `compressed-${sdp}`);
    mockContext.decompress = vi.fn(async (text: string) => text.replace(/^compressed-/, ''));
    mockContext.appOnId.mockClear();
    mockContext.broadcastManuallyEnteredAnswer.mockClear();
    mockContext.reportCriticalError.mockClear();

    clientLogic = new ClientLogic(mockContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should store the provided context', () => {
      expect((clientLogic as any).context).toBe(mockContext);
    });
  });

  describe('setConfig', () => {
    it('should update the config in the context', () => {
      const newConfig: Config = {
        ...actualDefaultConfig, // Use the dynamically imported one
        general: {
          ...actualDefaultConfig.general,
          userName: 'NewUserTest'
        },
        // Ensure all top-level keys from Config are present
        rtc: actualDefaultConfig.rtc,
        media: actualDefaultConfig.media
      };
      clientLogic.setConfig(newConfig);
      expect(mockContext.config.general.userName).toBe('NewUserTest');
      expect(mockContext.config).toEqual(newConfig); // Use toEqual for deep comparison
    });
  });

  describe('initialize', () => {
    it('should generate an offer if no URL params are present', async () => {
      (vi.mocked(window).location as any).search = '';

      const mockCid = 'mock-offer-cid';
      let iceCallback: ((candidate: any) => Promise<void>) | null = null;

      mockContext.webRTCApp.getOffer.mockImplementation(async (cb: any, options: any) => {
        iceCallback = cb; // Capture the ICE callback
        return mockCid; // Resolve with a mock CID
      });

      const mockClientPc = {
        localDescription: { sdp: 'mockOfferSdp' }
      };
      const mockClient = { pc: mockClientPc };
      mockContext.getDirectClient.mockReturnValue(mockClient as any);

      await clientLogic.initialize(new URLSearchParams((vi.mocked(window).location as any).search));

      // Manually trigger the ICE callback
      expect(iceCallback).not.toBeNull();
      if (iceCallback) {
        await iceCallback(null); // Simulate ICE gathering complete
      }

      expect(mockContext.webRTCApp.getOffer).toHaveBeenCalledTimes(1);
      expect(mockContext.getDirectClient).toHaveBeenCalledWith(mockCid);
      expect(mockContext.compress).toHaveBeenCalledWith('mockOfferSdp');
      // ... (previous assertions: webRTCApp.getOffer, getDirectClient, compress)

      const expectedCompressedSdp = 'compressed-mockOfferSdp'; // From compress mock
      const expectedPathname = (vi.mocked(window).location as any).pathname;
      const expectedOrigin = (vi.mocked(window).location as any).origin;
      const expectedQrCodeContent = `${expectedOrigin}${expectedPathname}?offer=${expectedCompressedSdp}`;

      // Check that history.replaceState was called with the correct final URL
      // This is called from prepareOfferForClientModeDisplay's ICE callback
      expect(vi.mocked(history.replaceState)).toHaveBeenCalledWith(null, '', expectedQrCodeContent);

      // Check key aspects of the final state (held in mockAppLogicState by our mock setState implementation)
      expect(mockAppLogicState.currentOfferCid).toBe(mockCid);
      expect(mockAppLogicState.qrCodeUrl).toBe(expectedQrCodeContent);
      expect(mockAppLogicState.copyText).toBe(expectedQrCodeContent);
      expect(mockAppLogicState.showCopyOverlay).toBe(true);
      expect(mockAppLogicState.initialOverlayShown).toBe(true);
    });

    it('should process an offer from URL params and generate an answer', async () => {
      const compressedOfferInUrl = 'compressed-offer-from-url';
      const offerSdp = 'offer-sdp-from-url';
      (vi.mocked(window).location as any).search = `?offer=${compressedOfferInUrl}`;
      const urlParams = new URLSearchParams((vi.mocked(window).location as any).search);

      mockContext.decompress.mockResolvedValue(offerSdp);

      const mockAnswererCid = 'mock-answerer-cid';
      let answerIceCallback: ((candidate: any) => Promise<void>) | null = null;
      mockContext.webRTCApp.getAnswer.mockImplementation(async (offer, cb, options) => {
        expect(offer).toBe(offerSdp);
        answerIceCallback = cb;
        return mockAnswererCid;
      });

      const mockClientPc = { localDescription: { sdp: 'mockAnswerSdp' } };
      const mockClient = { pc: mockClientPc };
      mockContext.getDirectClient.mockReturnValue(mockClient as any);

      // mockContext.compress is already mocked in beforeEach to return `compressed-${sdp}`

      await clientLogic.initialize(urlParams);

      // Trigger ICE callback for getAnswer
      expect(answerIceCallback).not.toBeNull();
      if (answerIceCallback) {
        await answerIceCallback(null);
      }

      expect(mockContext.decompress).toHaveBeenCalledWith(compressedOfferInUrl);
      expect(mockContext.webRTCApp.getAnswer).toHaveBeenCalledTimes(1);
      expect(mockContext.getDirectClient).toHaveBeenCalledWith(mockAnswererCid);
      expect(mockContext.compress).toHaveBeenCalledWith('mockAnswerSdp');

      const compressedAnswerSdp = 'compressed-mockAnswerSdp';
      const expectedPathname = (vi.mocked(window).location as any).pathname;
      const expectedOrigin = (vi.mocked(window).location as any).origin;

      const finalUrlParams = new URLSearchParams();
      finalUrlParams.set('offer', compressedOfferInUrl);
      finalUrlParams.set('answer', compressedAnswerSdp);
      const expectedAnswerUrl = `${expectedOrigin}${expectedPathname}?${finalUrlParams.toString()}`;

      // Check the history.replaceState call from getAnswer's ICE callback
      expect(vi.mocked(history.replaceState)).toHaveBeenCalledWith('', '', expectedAnswerUrl);

      // Check final state properties set during this flow
      expect(mockAppLogicState.qrCodeUrl).toBe(expectedAnswerUrl);
      expect(mockAppLogicState.copyText).toBe(compressedAnswerSdp);
      expect(mockAppLogicState.showCopyOverlay).toBe(true);
      expect(mockAppLogicState.initialOverlayShown).toBe(true);
      expect(mockAppLogicState.showAcceptButton).toBe(false);
      expect(mockAppLogicState.showPasteText).toBe(false);
      expect(mockAppLogicState.showCopyButton).toBe(true);

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

      expect(mockAppLogicState.showCopyOverlay).toBe(true);
      expect(mockAppLogicState.initialOverlayShown).toBe(true);
      expect(mockAppLogicState.copyText).toBe('Call started on another tab, please close this one');
      expect(mockAppLogicState.showCopyButton).toBe(false);
      expect(mockAppLogicState.showAcceptButton).toBe(false);
      expect(mockAppLogicState.showPasteText).toBe(false);
      expect(mockAppLogicState.showJoinButton).toBe(false);

      // In this specific path of initialize, history.replaceState is NOT called.
      expect(vi.mocked(history.replaceState)).not.toHaveBeenCalled();
    });
  });

  describe('handleOpenQrRequest', () => {
    it('should prepare and display an offer if no offer/answer in URL params', async () => {
      const urlParams = new URLSearchParams(''); // Empty params
      (vi.mocked(window).location as any).search = ''; // Ensure window.location.search is also empty for prepareOffer...

      const mockCid = 'mock-offer-cid-for-qr';
      let iceCallback: ((candidate: any) => Promise<void>) | null = null;
      mockContext.webRTCApp.getOffer.mockImplementation(async (cb: any, options: any) => {
        iceCallback = cb;
        return mockCid;
      });
      const mockClientPc = { localDescription: { sdp: 'mockOfferSdpForQr' } };
      const mockClient = { pc: mockClientPc };
      mockContext.getDirectClient.mockReturnValue(mockClient as any);

      await clientLogic.handleOpenQrRequest(urlParams);

      expect(iceCallback).not.toBeNull();
      if (iceCallback) {
        await iceCallback(null);
      }

      expect(mockContext.setState).toHaveBeenCalledWith({ initialOverlayShown: false });
      expect(mockContext.webRTCApp.getOffer).toHaveBeenCalledTimes(1);
      expect(mockContext.compress).toHaveBeenCalledWith('mockOfferSdpForQr');

      const expectedCompressedSdp = 'compressed-mockOfferSdpForQr';
      const expectedPathname = (vi.mocked(window).location as any).pathname;
      const expectedOrigin = (vi.mocked(window).location as any).origin;
      const expectedQrCodeContent = `${expectedOrigin}${expectedPathname}?offer=${expectedCompressedSdp}`;

      expect(vi.mocked(history.replaceState)).toHaveBeenCalledWith(null, '', expectedQrCodeContent);
      expect(mockAppLogicState.qrCodeUrl).toBe(expectedQrCodeContent);
      expect(mockAppLogicState.copyText).toBe(expectedQrCodeContent);
      expect(mockAppLogicState.showCopyOverlay).toBe(true);
    });

    it('should call appOnId and set UI for displaying existing URL if params are present', async () => {
      const urlParams = new URLSearchParams('?offer=someoffer');
      (vi.mocked(window).location as any).search = '?offer=someoffer';

      mockContext.appOnId.mockImplementation(() => {
        mockContext.setState({
          qrCodeUrl: 'http://localhost/testpath?offer=someoffer',
          copyText: 'http://localhost/testpath?offer=someoffer',
          showCopyOverlay: true
        });
      });

      mockAppLogicState.copyText = 'initial copy text'; // Before appOnId is called

      await clientLogic.handleOpenQrRequest(urlParams);

      expect(mockContext.setState).toHaveBeenCalledWith({ initialOverlayShown: false });
      expect(mockContext.appOnId).toHaveBeenCalledTimes(1);

      expect(mockAppLogicState.showCopyButton).toBe(true);
      expect(mockAppLogicState.showAcceptButton).toBe(false);
      expect(mockAppLogicState.showPasteText).toBe(false);
      expect(mockAppLogicState.showJoinButton).toBe(false);

      expect(mockAppLogicState.qrCodeUrl).toBe('http://localhost/testpath?offer=someoffer');
      expect(mockAppLogicState.copyText).toBe('http://localhost/testpath?offer=someoffer');
      expect(mockAppLogicState.showCopyOverlay).toBe(true);
    });

    it('should hide copy button if currentCopyText indicates call started on another tab', async () => {
      const urlParams = new URLSearchParams('?answer=someanswer');
      (vi.mocked(window).location as any).search = '?answer=someanswer';

      // Simulate currentCopyText *before* appOnId runs for this specific call context
      // The `getState()` in handleOpenQrRequest happens before `appOnId()`
      mockAppLogicState.copyText = 'Call started on another tab, please close this one';

      mockContext.appOnId.mockImplementation(() => {
        // appOnId might change copyText, but the check in handleOpenQrRequest uses the *old* one
        mockContext.setState({
          qrCodeUrl: 'http://localhost/testpath?answer=someanswer',
          copyText: 'http://localhost/testpath?answer=someanswer', // Potentially updated by appOnId
          showCopyOverlay: true
        });
      });

      await clientLogic.handleOpenQrRequest(urlParams);

      expect(mockContext.setState).toHaveBeenCalledWith({ initialOverlayShown: false });
      expect(mockContext.appOnId).toHaveBeenCalledTimes(1);

      expect(mockAppLogicState.showCopyButton).toBe(false);
      expect(mockAppLogicState.showAcceptButton).toBe(false);
      expect(mockAppLogicState.showPasteText).toBe(false);
      expect(mockAppLogicState.showJoinButton).toBe(false);
    });
  });

  describe('acceptHandler', () => {
    it('should decompress answer, set remote description, and update state on success', async () => {
      const cid = 'test-cid';
      const pastedAnswer = 'compressedAnswerValue '; // With trailing space for trim test
      const decompressedAnswer = 'decompressedAnswerValue';

      mockContext.decompress.mockResolvedValue(decompressedAnswer);
      const mockSetRemoteDescription = vi.fn().mockResolvedValue(undefined);
      const mockClient = { pc: { setRemoteDescription: mockSetRemoteDescription } };
      mockContext.getDirectClient.mockReturnValue(mockClient as any);
      // To ensure targetCid is resolved from cidFromEvent
      mockAppLogicState.currentOfferCid = null;

      await clientLogic.acceptHandler(cid, pastedAnswer);

      expect(mockContext.decompress).toHaveBeenCalledWith('compressedAnswerValue'); // Trimmed
      expect(mockContext.getDirectClient).toHaveBeenCalledWith(cid);
      expect(mockSetRemoteDescription).toHaveBeenCalledWith({
        type: 'answer',
        sdp: decompressedAnswer + '\n'
      });
      expect(mockContext.setState).toHaveBeenCalledWith({
        showCopyOverlay: false,
        initialOverlayShown: false
      });
    });

    it('should use currentOfferCid from state if cidFromEvent is null', async () => {
      const stateCid = 'state-offer-cid';
      mockAppLogicState.currentOfferCid = stateCid;
      const pastedAnswer = 'pastedSdp';
      const decompressedAnswer = 'decompressedSdp';

      mockContext.decompress.mockResolvedValue(decompressedAnswer);
      const mockSetRemoteDescription = vi.fn().mockResolvedValue(undefined);
      const mockClient = { pc: { setRemoteDescription: mockSetRemoteDescription } };
      mockContext.getDirectClient.mockReturnValue(mockClient as any);

      await clientLogic.acceptHandler(null, pastedAnswer);

      expect(mockContext.getDirectClient).toHaveBeenCalledWith(stateCid);
      expect(mockSetRemoteDescription).toHaveBeenCalledWith({
        type: 'answer',
        sdp: decompressedAnswer + '\n'
      });
      expect(mockContext.setState).toHaveBeenCalledWith({
        showCopyOverlay: false,
        initialOverlayShown: false
      });
    });

    it('should do nothing if pasteValue is empty', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      await clientLogic.acceptHandler('some-cid', '');

      expect(mockContext.decompress).not.toHaveBeenCalled();
      expect(mockContext.getDirectClient).not.toHaveBeenCalled();
      expect(mockContext.setState).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Accept handler: Paste value or CID is missing.',
        { pasteValue: '', targetCid: 'some-cid' }
      );
      consoleWarnSpy.mockRestore();
    });

    it('should do nothing if targetCid is missing', async () => {
      mockAppLogicState.currentOfferCid = null;
      const consoleWarnSpy = vi.spyOn(console, 'warn');

      await clientLogic.acceptHandler(null, 'some-answer');

      expect(mockContext.decompress).not.toHaveBeenCalled();
      expect(mockContext.getDirectClient).not.toHaveBeenCalled();
      expect(mockContext.setState).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Accept handler: Paste value or CID is missing.',
        { pasteValue: 'some-answer', targetCid: null }
      );
      consoleWarnSpy.mockRestore();
    });

    it('should warn if getDirectClient returns no client', async () => {
      const cid = 'test-cid';
      const pastedAnswer = 'pastedAnswer';
      mockContext.decompress.mockResolvedValue('decompressedAnswer');
      mockContext.getDirectClient.mockReturnValue(null);
      const consoleWarnSpy = vi.spyOn(console, 'warn');

      await clientLogic.acceptHandler(cid, pastedAnswer);

      expect(mockContext.decompress).toHaveBeenCalledWith('pastedAnswer');
      expect(mockContext.getDirectClient).toHaveBeenCalledWith(cid);
      expect(mockContext.setState).not.toHaveBeenCalled();
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
      mockContext.decompress.mockResolvedValue('decompressedAnswer');
      mockContext.getDirectClient.mockReturnValue({ pc: null } as any);
      const consoleWarnSpy = vi.spyOn(console, 'warn');

      await clientLogic.acceptHandler(cid, pastedAnswer);

      expect(mockContext.decompress).toHaveBeenCalledWith('pastedAnswer');
      expect(mockContext.getDirectClient).toHaveBeenCalledWith(cid);
      expect(mockContext.setState).not.toHaveBeenCalled();
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
      mockContext.decompress.mockRejectedValue(decompressError);
      const consoleErrorSpy = vi.spyOn(console, 'error');

      await clientLogic.acceptHandler(cid, pastedAnswer);

      expect(mockContext.decompress).toHaveBeenCalledWith('pastedAnswer');
      expect(mockContext.getDirectClient).not.toHaveBeenCalled();
      expect(mockContext.setState).not.toHaveBeenCalled();
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

      mockContext.decompress.mockResolvedValue(decompressedAnswer);
      const mockSetRemoteDescription = vi.fn().mockRejectedValue(setError);
      const mockClient = { pc: { setRemoteDescription: mockSetRemoteDescription } };
      mockContext.getDirectClient.mockReturnValue(mockClient as any);
      const consoleErrorSpy = vi.spyOn(console, 'error');

      await clientLogic.acceptHandler(cid, pastedAnswer);

      expect(mockContext.decompress).toHaveBeenCalledWith('pastedAnswer');
      expect(mockContext.getDirectClient).toHaveBeenCalledWith(cid);
      expect(mockSetRemoteDescription).toHaveBeenCalled();
      expect(mockContext.setState).not.toHaveBeenCalled();
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
