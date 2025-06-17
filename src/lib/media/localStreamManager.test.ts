import { vi, describe, it, expect, beforeEach } from 'vitest';
import { writable, get as svelteGet, derived } from 'svelte/store'; // Import svelteGet
import type { StreamState as ActualStreamStateType } from '../stores/streamStore'; // Import type for use in hoisted
import * as streamUtils from './stream';
import * as backgroundUtils from './background'; // Import backgroundUtils
import * as streamLifecycle from '../app/streamLifecycle';
import {
  setAudioCallback,
  enableAudio,
  disableAudio,
  enableCamera,
  disableCamera
  // enableScreenSharing, // TODO: Add tests and uncomment
  // disableScreenSharing, // TODO: Add tests and uncomment
  // enableFileStream, // TODO: Add tests and uncomment
  // disableFileStream, // TODO: Add tests and uncomment
} from './localStreamManager';

// --- Mock streamStore ---
// Use vi.hoisted to ensure actualTestStreamStore is initialized before vi.mock factory runs
const hoistedStore = vi.hoisted(async () => {
  const { writable } = await import('svelte/store');
  const store = writable<ActualStreamStateType>({
    // Use the imported type alias
    localStreams: {},
    remoteStreams: {},
    activeView: { layout: 'grid' }
  });
  return { actualTestStreamStore: store };
});

vi.mock('../stores/streamStore', async () => {
  const original =
    await vi.importActual<typeof import('../stores/streamStore')>('../stores/streamStore');
  return {
    ...original,
    streamStore: hoistedStore.actualTestStreamStore, // Provide our actual store
    // Re-create derived stores based on actualTestStreamStore
    isAudioEnabled: derived(hoistedStore.actualTestStreamStore, ($s) =>
      Object.values($s.localStreams).some((stream) => stream.type === 'audio')
    ),
    isCameraEnabled: derived(hoistedStore.actualTestStreamStore, ($s) =>
      Object.values($s.localStreams).some(
        (stream) => stream.type === 'camera' || stream.type === 'blurred'
      )
    ),
    isScreenSharingEnabled: derived(hoistedStore.actualTestStreamStore, ($s) =>
      Object.values($s.localStreams).some((stream) => stream.type === 'screen')
    ),
    isFileStreamEnabled: derived(hoistedStore.actualTestStreamStore, ($s) =>
      Object.values($s.localStreams).some((stream) => stream.type === 'file')
    ),
    isBlurredStreamEnabled: derived(hoistedStore.actualTestStreamStore, ($s) =>
      Object.values($s.localStreams).some((stream) => stream.type === 'blurred')
    )
    // Helper functions like getLocalStreamsByType will use the mocked streamStore via getStreamState
  };
});
// Import after mocking
import * as streamStore from '../stores/streamStore';
import type { Config } from '../stores/configStore'; // Import the Config type

// --- Mock configStore ---
let capturedConfigSubscriber: ((config: Config) => Promise<void> | void) | undefined;
const mockConfigStoreSubscribeFn = vi.fn(
  (subscriberCallback: (config: Config) => Promise<void> | void) => {
    capturedConfigSubscriber = subscriberCallback;
    return () => {
      capturedConfigSubscriber = undefined; // Optional: clear on unsubscribe
    }; // Returns an unsubscribe function
  }
);
const mockGetAllConfigFn = vi.fn();
const mockUpdateConfigFn = vi.fn();
const mockConfigStoreSetFn = vi.fn();
const mockConfigStoreUpdateFn = vi.fn();
const mockGetConfigValueFn = vi.fn();

vi.mock('../stores/configStore', async () => {
  const originalConfig =
    await vi.importActual<typeof import('../stores/configStore')>('../stores/configStore');
  return {
    ...originalConfig, // Keep other exports like defaultConfig if not directly problematic
    configStore: {
      subscribe: mockConfigStoreSubscribeFn,
      set: mockConfigStoreSetFn,
      update: mockConfigStoreUpdateFn
    },
    getAllConfig: mockGetAllConfigFn,
    updateConfig: mockUpdateConfigFn,
    getConfigValue: mockGetConfigValueFn,
    // Mock derived stores from configStore as well
    isServerMode: derived({ subscribe: vi.fn(() => () => {}) }, () => false), // Simple mock derived
    rtcServers: derived({ subscribe: vi.fn(() => () => {}) }, () => ({ iceServers: [] })) // Simple mock derived
  };
});
// Import after mocking
// import * as configStoreModule from '../stores/configStore'; // No longer needed as we use direct mock functions
// Config type is imported above

// --- Other Mocks ---
vi.mock('../stores/localFileStreamStore');
vi.mock('./stream');
vi.mock('./background');
vi.mock('../app/streamLifecycle');

// Spies on functions from auto-mocked modules (or re-exported actual functions)
const mockAddLocalStream = vi.spyOn(streamStore, 'addLocalStream');
// const mockRemoveLocalStream = vi.spyOn(streamStore, 'removeLocalStream'); // Not directly asserted, covered by store state checks
// const mockUpdateLocalStreamProperties = vi.spyOn(streamStore, 'updateLocalStreamProperties'); // Not directly asserted, covered by store state checks
// No need to spy on getLocalStreamsByType, getIsAudioEnabled etc. if they correctly use actualTestStreamStore

const mockProcessAudio = vi.spyOn(streamUtils, 'processAudio');
const mockStopProcessingAudio = vi.spyOn(streamUtils, 'stopProcessingAudio');
const mockTearDownStream = vi.spyOn(streamUtils, 'tearDownStream');

// const mockBackgroundChange = vi.spyOn(backgroundUtils, 'backgroundChange'); // TODO: Add tests and uncomment

const mockGetAudioProcessingContext = vi.spyOn(streamLifecycle, 'getAudioProcessingContext');
const mockSetAudioProcessingContext = vi.spyOn(streamLifecycle, 'setAudioProcessingContext'); // Used in enableAudio
const mockRemoveAudioProcessingContext = vi.spyOn(streamLifecycle, 'removeAudioProcessingContext');

const mockAudioTrack: MediaStreamTrack = {
  id: 'audio-track-1',
  kind: 'audio',
  enabled: true,
  label: 'Mock Audio Track',
  muted: false,
  readyState: 'live',
  stop: vi.fn(),
  applyConstraints: vi.fn(),
  getCapabilities: vi.fn(),
  getConstraints: vi.fn(),
  getSettings: vi.fn(),
  clone: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  contentHint: '',
  onended: null,
  onmute: null,
  onunmute: null
};

const mockVideoTrack: MediaStreamTrack = {
  id: 'video-track-1',
  kind: 'video',
  enabled: true,
  label: 'Mock Video Track',
  muted: false,
  readyState: 'live',
  stop: vi.fn(),
  applyConstraints: vi.fn(),
  getCapabilities: vi.fn(),
  getConstraints: vi.fn(),
  getSettings: vi.fn(),
  clone: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  contentHint: '',
  onended: null,
  onmute: null,
  onunmute: null
};

const mockMediaStream: MediaStream = {
  id: 'mock-stream-id',
  active: true,
  getAudioTracks: vi.fn(() => [mockAudioTrack]),
  getVideoTracks: vi.fn(() => [mockVideoTrack]),
  addTrack: vi.fn(),
  removeTrack: vi.fn(),
  clone: vi.fn(),
  getTrackById: vi.fn(),
  getTracks: vi.fn(() => [mockAudioTrack, mockVideoTrack]), // Added
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  onaddtrack: null, // Added
  onremovetrack: null // Added
};

const mockUserMedia = vi.fn().mockResolvedValue(mockMediaStream);
const mockDisplayMedia = vi.fn().mockResolvedValue(mockMediaStream);

// Mock specific methods on navigator.mediaDevices
if (global.navigator.mediaDevices) {
  vi.spyOn(global.navigator.mediaDevices, 'getUserMedia').mockImplementation(mockUserMedia);
  vi.spyOn(global.navigator.mediaDevices, 'getDisplayMedia').mockImplementation(mockDisplayMedia);
} else {
  // @ts-expect-error - navigator.mediaDevices might not exist in all test environments
  global.navigator.mediaDevices = {
    getUserMedia: mockUserMedia,
    getDisplayMedia: mockDisplayMedia,
    enumerateDevices: vi.fn().mockResolvedValue([]),
    getSupportedConstraints: vi.fn().mockReturnValue({}),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  };
}

global.URL.createObjectURL = vi.fn(() => 'mock-object-url');
global.URL.revokeObjectURL = vi.fn();

// Mock document.createElement for video elements used in blur
const mockVideoElement = {
  autoplay: false,
  muted: false,
  srcObject: null,
  play: vi.fn().mockResolvedValue(undefined),
  onloadedmetadata: null
} as unknown as HTMLVideoElement;
global.document.createElement = vi.fn((tagName) => {
  if (tagName === 'video') {
    return { ...mockVideoElement }; // Return a fresh mock each time
  }
  // For other elements, you might want to return a more generic mock or throw an error
  return {} as HTMLElement;
});

describe('localStreamManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset actualTestStreamStore to initial state for each test
    hoistedStore.actualTestStreamStore.set({
      localStreams: {},
      remoteStreams: {},
      activeView: { layout: 'grid' }
    });

    // Set default mock return value for getAllConfigFn
    mockGetAllConfigFn.mockReturnValue({
      general: {
        configLoader: 'client',
        configHost: '',
        identityProviderHost: '',
        coordinatorUrl: ''
      },
      profile: { userName: 'TestUser' },
      rtc: { stunServers: '', turnServerV2: '', turnUsername: '', turnPassword: '' },
      media: { blurVideo: 'no', audioDevice: '<auto>', videoDevice: '<auto>' }
    });
    // addLocalStream is spied on its real implementation.
    mockProcessAudio.mockResolvedValue({
      context: {} as AudioContext,
      source: {
        mediaStream: mockMediaStream,
        disconnect: vi.fn()
      } as unknown as MediaStreamAudioSourceNode,
      analyser: {} as AnalyserNode,
      dataArray: new Uint8Array(),
      fftSize: 256,
      animationFrame: 0
    });
  });

  describe('setAudioCallback', () => {
    it('should set the audio callback function', async () => {
      const cb = vi.fn();
      setAudioCallback(cb);
      // To verify, we'd need to trigger logic that uses audioCbFunction
      // For example, by calling enableAudio and ensuring processAudio uses it.
      // This is more of an integration test for the callback.
      // Test if cb is called when audio is enabled and processed.
      await enableAudio(); // Enable default
      expect(mockProcessAudio).toHaveBeenCalled();
      if (mockProcessAudio.mock.calls.length > 0) {
        const processAudioCallback = mockProcessAudio.mock.calls[0][1];
        processAudioCallback(new Uint8Array([128, 128]), {} as AnalyserNode);
        expect(cb).toHaveBeenCalledWith(128);
      } else {
        // This case might happen if enableAudio exited early due to stream already active
        // For this specific test, we assume enableAudio proceeds.
        // Consider adding a check or fail if mockProcessAudio wasn't called.
        expect(mockProcessAudio).toHaveBeenCalled();
      }
    });
  });

  describe('enableAudio', () => {
    it('should request user media for default audio (<auto>) and add it to the store with its actual deviceId', async () => {
      const actualAutoDeviceId = 'actual-auto-audio-device-id';
      mockAudioTrack.getSettings = vi.fn().mockReturnValue({ deviceId: actualAutoDeviceId });

      await enableAudio(); // No deviceId, should use default from config ('<auto>')
      expect(mockUserMedia).toHaveBeenCalledWith({ audio: true }); // For <auto>
      expect(streamStore.addLocalStream).toHaveBeenCalledWith(
        'audio',
        mockMediaStream,
        null,
        true,
        true,
        actualAutoDeviceId // Stored with actual deviceId
      );
      expect(mockSetAudioProcessingContext).toHaveBeenCalled();
    });

    it('should use a specific deviceId if provided and add to store with that deviceId', async () => {
      const deviceId = 'group1|audio-device-1';
      await enableAudio(deviceId);
      expect(mockUserMedia).toHaveBeenCalledWith({
        audio: { groupId: 'group1', deviceId: 'audio-device-1' }
      });
      expect(streamStore.addLocalStream).toHaveBeenCalledWith(
        'audio',
        mockMediaStream,
        null,
        true,
        true,
        deviceId
      );
    });

    it('should not start a new stream if the specific requested deviceId is already active', async () => {
      const deviceId = 'audio-device-special';
      // Simulate it's active by adding it to the store using the actual addLocalStream
      streamStore.addLocalStream('audio', mockMediaStream, null, true, true, deviceId);

      // Clear mocks that would be called if a new stream was started
      mockUserMedia.mockClear();
      mockAddLocalStream.mockClear(); // Clear the spy on the actual addLocalStream

      await enableAudio(deviceId); // Attempt to enable the already active stream

      expect(mockUserMedia).not.toHaveBeenCalled();
      // addLocalStream should not have been called again to add a *new* stream.
      // The mockAddLocalStream spy tracks calls to the original streamStore.addLocalStream.
      // Since we cleared it after the initial setup call, it should remain at 0 calls for this test's action.
      expect(mockAddLocalStream).not.toHaveBeenCalled();
    });

    it('should start multiple audio streams if called with different deviceIds', async () => {
      const deviceId1 = 'audio-dev-1';
      const deviceId2 = 'audio-dev-2';

      await enableAudio(deviceId1);
      expect(mockUserMedia).toHaveBeenCalledWith({ audio: { deviceId: deviceId1 } });
      // Verify streamStore.addLocalStream was called for deviceId1
      expect(streamStore.addLocalStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        deviceId1
      );

      mockUserMedia.mockClear();
      // Clear the spy to check the next call specifically for deviceId2
      vi.mocked(streamStore.addLocalStream).mockClear();

      await enableAudio(deviceId2);
      expect(mockUserMedia).toHaveBeenCalledWith({ audio: { deviceId: deviceId2 } });
      expect(streamStore.addLocalStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        deviceId2
      );

      expect(
        Object.values(svelteGet(hoistedStore.actualTestStreamStore).localStreams).filter(
          (s) => s.type === 'audio'
        ).length
      ).toBe(2);
    });
  });

  describe('disableAudio', () => {
    it('should tear down a specific audio stream if deviceId is provided', async () => {
      const deviceId1 = 'audio-to-disable-1';
      const streamIdToRemove = streamStore.addLocalStream(
        'audio',
        mockMediaStream,
        null,
        true,
        true,
        deviceId1
      );
      // Check using the actual helper that now uses actualTestStreamStore
      expect(streamStore.getLocalStreamByDeviceId('audio', deviceId1)).not.toBeNull();

      mockGetAudioProcessingContext.mockReturnValueOnce({} as streamUtils.AudioNodes);

      await disableAudio(deviceId1);

      expect(mockTearDownStream).toHaveBeenCalledWith(mockMediaStream);
      expect(mockStopProcessingAudio).toHaveBeenCalled();
      expect(mockRemoveAudioProcessingContext).toHaveBeenCalledWith(streamIdToRemove);
      expect(streamStore.removeLocalStream).toHaveBeenCalledWith(streamIdToRemove);
      // Check using the actual helper
      expect(streamStore.getLocalStreamByDeviceId('audio', deviceId1)).toBeNull();
    });

    it('should tear down all audio streams if no deviceId is provided', async () => {
      streamStore.addLocalStream('audio', mockMediaStream, null, true, true, 'audio-all-1');
      streamStore.addLocalStream(
        'audio',
        { ...mockMediaStream, id: 'ms2' },
        null,
        true,
        true,
        'audio-all-2'
      );
      expect(
        Object.values(svelteGet(hoistedStore.actualTestStreamStore).localStreams).filter(
          (s) => s.type === 'audio'
        ).length
      ).toBe(2);

      mockGetAudioProcessingContext.mockReturnValue({} as streamUtils.AudioNodes);

      await disableAudio(); // No deviceId

      expect(mockTearDownStream).toHaveBeenCalledTimes(2);
      expect(mockStopProcessingAudio).toHaveBeenCalledTimes(2);
      expect(mockRemoveAudioProcessingContext).toHaveBeenCalledTimes(2);
      expect(streamStore.removeLocalStream).toHaveBeenCalledTimes(2);
      expect(
        Object.values(svelteGet(hoistedStore.actualTestStreamStore).localStreams).filter(
          (s) => s.type === 'audio'
        ).length
      ).toBe(0);
    });

    it('should call audioCbFunction with 0 if set and all audio becomes disabled', async () => {
      const cb = vi.fn();
      setAudioCallback(cb);
      streamStore.addLocalStream('audio', mockMediaStream, null, true, true, 'audio-cb-test');

      await disableAudio(); // Disable all
      expect(cb).toHaveBeenCalledWith(0);
    });
  });

  describe('enableCamera', () => {
    it('should start default camera (<auto>) if no deviceId, blur is off, and store with actual deviceId', async () => {
      const actualAutoCamId = 'actual-auto-cam-id';
      mockVideoTrack.getSettings = vi.fn().mockReturnValue({ deviceId: actualAutoCamId });
      mockGetAllConfigFn.mockReturnValueOnce({
        // Use mockGetAllConfigFn
        // ...svelteGet(actualTestConfigStore), // If we had an actualTestConfigStore
        general: {
          configLoader: 'client',
          configHost: '',
          identityProviderHost: '',
          coordinatorUrl: ''
        },
        profile: { userName: 'TestUser' },
        rtc: { stunServers: '', turnServerV2: '', turnUsername: '', turnPassword: '' },
        media: { blurVideo: 'no', audioDevice: '<auto>', videoDevice: '<auto>' }
      });
      await enableCamera();
      expect(mockUserMedia).toHaveBeenCalledWith({ video: true });
      expect(streamStore.addLocalStream).toHaveBeenCalledWith(
        'camera',
        mockMediaStream,
        null,
        true,
        true,
        actualAutoCamId
      );
    });

    it('should start specific camera if deviceId provided and blur is off', async () => {
      const deviceId = 'cam-device-1';
      mockGetAllConfigFn.mockReturnValueOnce({
        // Use mockGetAllConfigFn
        general: {
          configLoader: 'client',
          configHost: '',
          identityProviderHost: '',
          coordinatorUrl: ''
        },
        profile: { userName: 'TestUser' },
        rtc: { stunServers: '', turnServerV2: '', turnUsername: '', turnPassword: '' },
        media: { blurVideo: 'no', audioDevice: '<auto>', videoDevice: 'some-default-not-used' }
      });
      await enableCamera(deviceId);
      expect(mockUserMedia).toHaveBeenCalledWith({ video: { deviceId: deviceId } });
      expect(streamStore.addLocalStream).toHaveBeenCalledWith(
        'camera',
        mockMediaStream,
        null,
        true,
        true,
        deviceId
      );
    });

    it('should start camera and blurred stream if blur is on', async () => {
      const deviceId = 'cam-device-blur';
      mockGetAllConfigFn.mockReturnValueOnce({
        // Use mockGetAllConfigFn
        general: {
          configLoader: 'client',
          configHost: '',
          identityProviderHost: '',
          coordinatorUrl: ''
        },
        profile: { userName: 'TestUser' },
        rtc: { stunServers: '', turnServerV2: '', turnUsername: '', turnPassword: '' },
        media: { blurVideo: 'yes', audioDevice: '<auto>', videoDevice: deviceId }
      });
      vi.mocked(backgroundUtils.backgroundChange).mockResolvedValue({
        ...mockMediaStream,
        id: 'blurred-stream-id'
      });

      await enableCamera(deviceId);
      expect(mockUserMedia).toHaveBeenCalledWith({ video: { deviceId: deviceId } });
      // Original camera stream added (viewable: false, sendable: false)
      expect(streamStore.addLocalStream).toHaveBeenCalledWith(
        'camera',
        mockMediaStream,
        null,
        false,
        false,
        deviceId
      );
      // Blurred stream added (viewable: true, sendable: true)
      expect(streamStore.addLocalStream).toHaveBeenCalledWith(
        'blurred',
        { ...mockMediaStream, id: 'blurred-stream-id' },
        null,
        true,
        true,
        deviceId
      );
      expect(backgroundUtils.backgroundChange).toHaveBeenCalled();
    });
  });

  describe('disableCamera', () => {
    it('should disable specific camera and its blurred stream if deviceId provided', async () => {
      const deviceId = 'cam-to-disable-specific';
      const camStreamId = streamStore.addLocalStream(
        'camera',
        mockMediaStream,
        null,
        false,
        false,
        deviceId
      );
      const blurStreamId = streamStore.addLocalStream(
        'blurred',
        { ...mockMediaStream, id: 'blur-s' },
        null,
        true,
        true,
        deviceId
      );

      await disableCamera(deviceId);
      expect(streamStore.removeLocalStream).toHaveBeenCalledWith(camStreamId);
      expect(streamStore.removeLocalStream).toHaveBeenCalledWith(blurStreamId);
      expect(mockTearDownStream).toHaveBeenCalledTimes(2);
    });

    it('should disable all camera and blurred streams if no deviceId provided', async () => {
      streamStore.addLocalStream('camera', mockMediaStream, null, true, true, 'cam-all-1');
      streamStore.addLocalStream(
        'blurred',
        { ...mockMediaStream, id: 'blur-all-1' },
        null,
        true,
        true,
        'cam-all-1'
      );
      streamStore.addLocalStream(
        'camera',
        { ...mockMediaStream, id: 'cam-all-2-id' },
        null,
        true,
        true,
        'cam-all-2'
      );

      await disableCamera(); // No deviceId
      // 2 camera streams + 1 blurred stream = 3 removals, 3 teardowns
      expect(streamStore.removeLocalStream).toHaveBeenCalledTimes(3);
      expect(mockTearDownStream).toHaveBeenCalledTimes(3);
      expect(
        Object.values(svelteGet(hoistedStore.actualTestStreamStore).localStreams).filter(
          (s) => s.type === 'camera' || s.type === 'blurred'
        ).length
      ).toBe(0);
    });
  });

  describe('configStore subscription for blur', () => {
    it('should apply blur to active, viewable camera streams when blurVideo turns "yes"', async () => {
      const camDeviceId = 'cam-for-blur-config';
      mockGetAllConfigFn.mockReturnValue({
        // Use mockGetAllConfigFn
        general: {
          configLoader: 'client',
          configHost: '',
          identityProviderHost: '',
          coordinatorUrl: ''
        },
        profile: { userName: 'TestUser' },
        rtc: { stunServers: '', turnServerV2: '', turnUsername: '', turnPassword: '' },
        media: { blurVideo: 'no', audioDevice: '<auto>', videoDevice: camDeviceId }
      });
      await enableCamera(camDeviceId); // Starts unblurred camera
      const camStreamEntry = streamStore.getLocalStreamByDeviceId('camera', camDeviceId);
      expect(camStreamEntry).not.toBeNull();
      if (!camStreamEntry) throw new Error('Camera stream entry not found'); // Type guard
      expect(camStreamEntry[1].viewable).toBe(true);

      vi.mocked(streamStore.addLocalStream).mockClear(); // Clear to only catch the 'blurred' add
      vi.mocked(backgroundUtils.backgroundChange).mockResolvedValue({
        ...mockMediaStream,
        id: 'blurred-on-config-change'
      });

      // Simulate configStore subscription callback
      const newConfigBlurOn: Config = {
        general: {
          configLoader: 'client' as const,
          configHost: '',
          identityProviderHost: '',
          coordinatorUrl: ''
        },
        profile: { userName: 'TestUser' },
        rtc: { stunServers: '', turnServerV2: '', turnUsername: '', turnPassword: '' },
        media: { blurVideo: 'yes', audioDevice: '<auto>', videoDevice: camDeviceId }
      };

      if (capturedConfigSubscriber) {
        await capturedConfigSubscriber(newConfigBlurOn);
      } else {
        throw new Error('configStore.subscribe was not called by localStreamManager');
      }

      await vi.waitFor(() => {
        expect(streamStore.updateLocalStreamProperties).toHaveBeenCalledWith(camStreamEntry[0], {
          viewable: false,
          sendable: false
        });
      });
      await vi.waitFor(() => {
        expect(backgroundUtils.backgroundChange).toHaveBeenCalled();
      });
      await vi.waitFor(() => {
        expect(streamStore.addLocalStream).toHaveBeenCalledWith(
          'blurred',
          { ...mockMediaStream, id: 'blurred-on-config-change' },
          null,
          true,
          true,
          camDeviceId
        );
      });
    });

    it('should remove blur from active streams when blurVideo turns "no"', async () => {
      const camDeviceId = 'cam-for-unblur-config';
      mockGetAllConfigFn.mockReturnValue({
        // Use mockGetAllConfigFn
        general: {
          configLoader: 'client',
          configHost: '',
          identityProviderHost: '',
          coordinatorUrl: ''
        },
        profile: { userName: 'TestUser' },
        rtc: { stunServers: '', turnServerV2: '', turnUsername: '', turnPassword: '' },
        media: { blurVideo: 'yes', audioDevice: '<auto>', videoDevice: camDeviceId }
      });
      vi.mocked(backgroundUtils.backgroundChange).mockResolvedValue({
        ...mockMediaStream,
        id: 'blurred-stream-initial'
      });
      await enableCamera(camDeviceId); // Starts camera (non-viewable) and blurred (viewable)

      const originalCamStreamEntry = streamStore.getLocalStreamByDeviceId('camera', camDeviceId);
      expect(originalCamStreamEntry).not.toBeNull();
      if (!originalCamStreamEntry) throw new Error('Original camera stream entry not found');
      expect(originalCamStreamEntry[1].viewable).toBe(false); // Original camera is not viewable when blurred

      const blurredStreamEntry = streamStore.getLocalStreamByDeviceId('blurred', camDeviceId);
      expect(blurredStreamEntry).not.toBeNull();
      if (!blurredStreamEntry) throw new Error('Blurred stream entry not found');

      vi.mocked(streamStore.removeLocalStream).mockClear();
      vi.mocked(streamStore.updateLocalStreamProperties).mockClear();

      // Simulate configStore subscription callback
      const newConfigBlurOff: Config = {
        general: {
          configLoader: 'client' as const,
          configHost: '',
          identityProviderHost: '',
          coordinatorUrl: ''
        },
        profile: { userName: 'TestUser' },
        rtc: { stunServers: '', turnServerV2: '', turnUsername: '', turnPassword: '' },
        media: { blurVideo: 'no', audioDevice: '<auto>', videoDevice: camDeviceId }
      };

      if (capturedConfigSubscriber) {
        await capturedConfigSubscriber(newConfigBlurOff);
      } else {
        throw new Error('configStore.subscribe was not called by localStreamManager');
      }

      await vi.waitFor(() => {
        expect(streamStore.removeLocalStream).toHaveBeenCalledWith(blurredStreamEntry[0]);
      });
      await vi.waitFor(() => {
        expect(streamStore.updateLocalStreamProperties).toHaveBeenCalledWith(
          originalCamStreamEntry[0],
          {
            viewable: true,
            sendable: true
          }
        );
      });
    });

    it('changing default device in configStore should NOT affect active streams', async () => {
      const initialAudioDevice = 'audio-device-initial';
      mockGetAllConfigFn.mockReturnValue({
        // Use mockGetAllConfigFn
        general: {
          configLoader: 'client',
          configHost: '',
          identityProviderHost: '',
          coordinatorUrl: ''
        },
        profile: { userName: 'TestUser' },
        rtc: { stunServers: '', turnServerV2: '', turnUsername: '', turnPassword: '' },
        media: { blurVideo: 'no', audioDevice: initialAudioDevice, videoDevice: '<auto>' }
      });
      await enableAudio(initialAudioDevice); // Start stream with initial device
      expect(streamStore.getIsDeviceStreamActive('audio', initialAudioDevice)).toBe(true);

      mockTearDownStream.mockClear();
      vi.mocked(streamStore.addLocalStream).mockClear();

      // Simulate configStore subscription callback with a new default device
      const newDefaultAudioDevice = 'audio-device-new-default';
      const newConfigWithNewDefault: Config = {
        general: {
          configLoader: 'client' as const,
          configHost: '',
          identityProviderHost: '',
          coordinatorUrl: ''
        },
        profile: { userName: 'TestUser' },
        rtc: { stunServers: '', turnServerV2: '', turnUsername: '', turnPassword: '' },
        media: { blurVideo: 'no', audioDevice: newDefaultAudioDevice, videoDevice: '<auto>' }
      };

      if (capturedConfigSubscriber) {
        await capturedConfigSubscriber(newConfigWithNewDefault); // prevConfig will be updated inside localStreamManager
      } else {
        throw new Error('configStore.subscribe was not called by localStreamManager');
      }

      // Wait a bit to ensure no async operations are triggered to change streams
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify that the initial stream was NOT torn down and no new stream was added
      expect(mockTearDownStream).not.toHaveBeenCalled();
      expect(streamStore.addLocalStream).not.toHaveBeenCalled(); // Check the mock of the actual function
      expect(streamStore.getIsDeviceStreamActive('audio', initialAudioDevice)).toBe(true);
      expect(streamStore.getIsDeviceStreamActive('audio', newDefaultAudioDevice)).toBe(false);
    });
  });
});
