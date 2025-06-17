import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  enableAudio,
  disableAudio,
  // enableCamera, // TODO: Add tests and uncomment
  // disableCamera, // TODO: Add tests and uncomment
  // enableScreenSharing, // TODO: Add tests and uncomment
  // disableScreenSharing, // TODO: Add tests and uncomment
  // enableFileStream, // TODO: Add tests and uncomment
  // disableFileStream, // TODO: Add tests and uncomment
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
import * as streamStore from '../stores/streamStore';
import { get } from 'svelte/store';
import * as configStoreModule from '../stores/configStore';
// import * as localFileStreamStoreModule from '../stores/localFileStreamStore'; // TODO: Add tests and uncomment
import * as streamUtils from './stream';
// import * as backgroundUtils from './background'; // TODO: Add tests and uncomment
import * as streamLifecycle from '../app/streamLifecycle';

// Mock dependencies
vi.mock('../stores/streamStore');
vi.mock('../stores/configStore');
vi.mock('../stores/localFileStreamStore'); // Keep mock even if module import is commented, for other spies
vi.mock('./stream');
vi.mock('./background'); // Keep mock even if module import is commented
vi.mock('../app/streamLifecycle');

// Spy on real implementations where possible, or use vi.mock for broader module mocking.
// For streamStore, we often want to spy on its actual methods to verify calls.
let mockGetLocalStreamsByType = vi.spyOn(streamStore, 'getLocalStreamsByType');
let mockAddLocalStream = vi.spyOn(streamStore, 'addLocalStream');
let mockRemoveLocalStream = vi.spyOn(streamStore, 'removeLocalStream');
let mockUpdateLocalStreamProperties = vi.spyOn(streamStore, 'updateLocalStreamProperties');
let mockGetIsAudioEnabled = vi.spyOn(streamStore, 'getIsAudioEnabled');
let mockGetIsCameraEnabled = vi.spyOn(streamStore, 'getIsCameraEnabled');
let mockGetLocalStreamByDeviceId = vi.spyOn(streamStore, 'getLocalStreamByDeviceId');
let mockGetIsDeviceStreamActive = vi.spyOn(streamStore, 'getIsDeviceStreamActive');


let mockGetAllConfig = vi.spyOn(configStoreModule, 'getAllConfig');
const mockConfigStoreSubscribe = vi.fn();
// @ts-expect-error - part of the mock
configStoreModule.configStore = { subscribe: mockConfigStoreSubscribe };

// const mockGetLocalFileStreamState = vi.spyOn(localFileStreamStoreModule, 'getLocalFileStreamState'); // TODO: Add tests and uncomment

const mockSetupStream = vi.spyOn(streamUtils, 'setupStream');
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
    // Reset streamStore to initial state for each test to ensure test isolation
    streamStore.streamStore.set({
      localStreams: {},
      remoteStreams: {},
      activeView: { layout: 'grid' }
    });

    // Mock implementations for streamStore helpers to reflect the actual store's state
    mockGetLocalStreamsByType.mockImplementation((type) => {
      const allStreams = get(streamStore.streamStore).localStreams;
      return Object.fromEntries(
        Object.entries(allStreams).filter(([, data]) => data.type === type)
      );
    });
    mockGetLocalStreamByDeviceId.mockImplementation((type, deviceId) => {
       const allStreams = get(streamStore.streamStore).localStreams;
       const entry = Object.entries(allStreams).find(
         ([,data]) => data.type === type && data.deviceId === deviceId
       );
       return entry || null;
    });
    mockGetIsDeviceStreamActive.mockImplementation((type, deviceId) => {
      const allStreams = get(streamStore.streamStore).localStreams;
      return Object.values(allStreams).some(s => s.type === type && s.deviceId === deviceId);
    });
     mockGetIsAudioEnabled.mockImplementation(() => {
      const state = get(streamStore.streamStore);
      return Object.values(state.localStreams).some((stream) => stream.type === 'audio');
    });
    mockGetIsCameraEnabled.mockImplementation(() => {
      const state = get(streamStore.streamStore);
      return Object.values(state.localStreams).some((stream) => stream.type === 'camera' || stream.type === 'blurred');
    });


    mockGetAllConfig.mockReturnValue({
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
      // Mock getSettings to return a deviceId for the <auto> case
      const actualAutoDeviceId = 'actual-auto-audio-device-id';
      mockAudioTrack.getSettings = vi.fn().mockReturnValue({ deviceId: actualAutoDeviceId });

      await enableAudio(); // No deviceId, should use default from config ('<auto>')
      expect(mockUserMedia).toHaveBeenCalledWith({ audio: true }); // For <auto>
      expect(mockAddLocalStream).toHaveBeenCalledWith(
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
      expect(mockAddLocalStream).toHaveBeenCalledWith(
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
       // Simulate it's active by adding it to the store
       streamStore.addLocalStream('audio', mockMediaStream, null, true, true, deviceId);
       mockUserMedia.mockClear(); // Clear any previous calls
       mockAddLocalStream.mockClear();

       await enableAudio(deviceId);
       expect(mockUserMedia).not.toHaveBeenCalled();
       expect(mockAddLocalStream).toHaveBeenCalledTimes(1); // Original add, not a new one
    });


    it('should start multiple audio streams if called with different deviceIds', async () => {
      const deviceId1 = 'audio-dev-1';
      const deviceId2 = 'audio-dev-2';

      await enableAudio(deviceId1);
      expect(mockUserMedia).toHaveBeenCalledWith({ audio: { deviceId: deviceId1 } });
      const firstCallArgs = mockAddLocalStream.mock.calls.find(call => call[5] === deviceId1);
      expect(firstCallArgs).toBeDefined();


      mockUserMedia.mockClear();
      // Don't clear mockAddLocalStream, check its total calls later

      await enableAudio(deviceId2);
      expect(mockUserMedia).toHaveBeenCalledWith({ audio: { deviceId: deviceId2 } });
      const secondCallArgs = mockAddLocalStream.mock.calls.find(call => call[5] === deviceId2);
      expect(secondCallArgs).toBeDefined();


      expect(Object.values(get(streamStore.streamStore).localStreams).filter(s => s.type === 'audio').length).toBe(2);
    });
  });

  describe('disableAudio', () => {
    it('should tear down a specific audio stream if deviceId is provided', async () => {
      const deviceId1 = 'audio-to-disable-1';
      const streamIdToRemove = streamStore.addLocalStream('audio', mockMediaStream, null, true, true, deviceId1);
      expect(streamStore.getLocalStreamByDeviceId('audio', deviceId1)).not.toBeNull();

      mockGetAudioProcessingContext.mockReturnValueOnce({} as streamUtils.AudioNodes);

      await disableAudio(deviceId1);

      expect(mockTearDownStream).toHaveBeenCalledWith(mockMediaStream);
      expect(mockStopProcessingAudio).toHaveBeenCalled();
      expect(mockRemoveAudioProcessingContext).toHaveBeenCalledWith(streamIdToRemove);
      expect(mockRemoveLocalStream).toHaveBeenCalledWith(streamIdToRemove);
      expect(streamStore.getLocalStreamByDeviceId('audio', deviceId1)).toBeNull();
    });

    it('should tear down all audio streams if no deviceId is provided', async () => {
      streamStore.addLocalStream('audio', mockMediaStream, null, true, true, 'audio-all-1');
      streamStore.addLocalStream('audio', { ...mockMediaStream, id:"ms2" }, null, true, true, 'audio-all-2');
      expect(Object.values(get(streamStore.streamStore).localStreams).filter(s => s.type === 'audio').length).toBe(2);

      mockGetAudioProcessingContext.mockReturnValue({} as streamUtils.AudioNodes);

      await disableAudio(); // No deviceId

      expect(mockTearDownStream).toHaveBeenCalledTimes(2);
      expect(mockStopProcessingAudio).toHaveBeenCalledTimes(2);
      expect(mockRemoveAudioProcessingContext).toHaveBeenCalledTimes(2);
      expect(mockRemoveLocalStream).toHaveBeenCalledTimes(2);
      expect(Object.values(get(streamStore.streamStore).localStreams).filter(s => s.type === 'audio').length).toBe(0);
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
      mockGetAllConfig.mockReturnValueOnce({
        ...get(configStoreModule.configStore), // Use current value from store
        media: { blurVideo: 'no', audioDevice: '<auto>', videoDevice: '<auto>' }
      });
      await enableCamera();
      expect(mockUserMedia).toHaveBeenCalledWith({ video: true });
      expect(mockAddLocalStream).toHaveBeenCalledWith('camera', mockMediaStream, null, true, true, actualAutoCamId);
    });

    it('should start specific camera if deviceId provided and blur is off', async () => {
      const deviceId = 'cam-device-1';
      mockGetAllConfig.mockReturnValueOnce({
         ...get(configStoreModule.configStore),
        media: { blurVideo: 'no', audioDevice: '<auto>', videoDevice: 'some-default-not-used' }
      });
      await enableCamera(deviceId);
      expect(mockUserMedia).toHaveBeenCalledWith({ video: { deviceId: deviceId } });
      expect(mockAddLocalStream).toHaveBeenCalledWith('camera', mockMediaStream, null, true, true, deviceId);
    });

    it('should start camera and blurred stream if blur is on', async () => {
      const deviceId = 'cam-device-blur';
      mockGetAllConfig.mockReturnValueOnce({
         ...get(configStoreModule.configStore),
        media: { blurVideo: 'yes', audioDevice: '<auto>', videoDevice: deviceId }
      });
      // @ts-expect-error - backgroundChange is a mock
      backgroundUtils.backgroundChange = vi.fn().mockResolvedValue({...mockMediaStream, id: "blurred-stream-id"});

      await enableCamera(deviceId);
      expect(mockUserMedia).toHaveBeenCalledWith({ video: { deviceId: deviceId } });
      // Original camera stream added (viewable: false, sendable: false)
      expect(mockAddLocalStream).toHaveBeenCalledWith('camera', mockMediaStream, null, false, false, deviceId);
      // Blurred stream added (viewable: true, sendable: true)
      expect(mockAddLocalStream).toHaveBeenCalledWith('blurred', {...mockMediaStream, id: "blurred-stream-id"}, null, true, true, deviceId);
      expect(backgroundUtils.backgroundChange).toHaveBeenCalled();
    });
  });

  describe('disableCamera', () => {
    it('should disable specific camera and its blurred stream if deviceId provided', async () => {
      const deviceId = 'cam-to-disable-specific';
      const camStreamId = streamStore.addLocalStream('camera', mockMediaStream, null, false, false, deviceId);
      const blurStreamId = streamStore.addLocalStream('blurred', { ...mockMediaStream, id: "blur-s"}, null, true, true, deviceId);

      await disableCamera(deviceId);
      expect(mockRemoveLocalStream).toHaveBeenCalledWith(camStreamId);
      expect(mockRemoveLocalStream).toHaveBeenCalledWith(blurStreamId);
      expect(mockTearDownStream).toHaveBeenCalledTimes(2);
    });

    it('should disable all camera and blurred streams if no deviceId provided', async () => {
      streamStore.addLocalStream('camera', mockMediaStream, null, true, true, 'cam-all-1');
      streamStore.addLocalStream('blurred', { ...mockMediaStream, id: "blur-all-1"}, null, true, true, 'cam-all-1');
      streamStore.addLocalStream('camera', { ...mockMediaStream, id: "cam-all-2-id"}, null, true, true, 'cam-all-2');

      await disableCamera(); // No deviceId
      // 2 camera streams + 1 blurred stream = 3 removals, 3 teardowns
      expect(mockRemoveLocalStream).toHaveBeenCalledTimes(3);
      expect(mockTearDownStream).toHaveBeenCalledTimes(3);
       expect(Object.values(get(streamStore.streamStore).localStreams)
         .filter(s => s.type === 'camera' || s.type === 'blurred').length).toBe(0);
    });
  });

  describe('configStore subscription for blur', () => {
    it('should apply blur to active, viewable camera streams when blurVideo turns "yes"', async () => {
      const camDeviceId = 'cam-for-blur-config';
      mockGetAllConfig.mockReturnValue({ // Initial config: blur off
        ...get(configStoreModule.configStore),
        media: { blurVideo: 'no', audioDevice: '<auto>', videoDevice: camDeviceId }
      });
      await enableCamera(camDeviceId); // Starts unblurred camera
      const camStreamEntry = streamStore.getLocalStreamByDeviceId('camera', camDeviceId);
      expect(camStreamEntry).not.toBeNull();
      expect(camStreamEntry![1].viewable).toBe(true);

      mockAddLocalStream.mockClear(); // Clear to only catch the 'blurred' add
      // @ts-expect-error - backgroundChange is a mock
      backgroundUtils.backgroundChange = vi.fn().mockResolvedValue({...mockMediaStream, id: "blurred-on-config-change"});

      // Trigger config change to blur: yes
      const newConfigBlurOn = {
        ...get(configStoreModule.configStore), // Get current state which includes the stream
        media: { ...get(configStoreModule.configStore).media, blurVideo: 'yes' }
      };
      configStoreModule.configStore.set(newConfigBlurOn); // This will trigger subscribers

      await vi.waitFor(() => {
        expect(mockUpdateLocalStreamProperties).toHaveBeenCalledWith(camStreamEntry![0], { viewable: false, sendable: false });
      });
      await vi.waitFor(() => {
        expect(backgroundUtils.backgroundChange).toHaveBeenCalled();
      });
      await vi.waitFor(() => {
        expect(mockAddLocalStream).toHaveBeenCalledWith('blurred', {...mockMediaStream, id: "blurred-on-config-change"}, null, true, true, camDeviceId);
      });
    });

     it('should remove blur from active streams when blurVideo turns "no"', async () => {
      const camDeviceId = 'cam-for-unblur-config';
      mockGetAllConfig.mockReturnValue({ // Initial config: blur on
        ...get(configStoreModule.configStore),
        media: { blurVideo: 'yes', audioDevice: '<auto>', videoDevice: camDeviceId }
      });
       // @ts-expect-error - backgroundChange is a mock
      backgroundUtils.backgroundChange = vi.fn().mockResolvedValue({...mockMediaStream, id: "blurred-stream-initial"});
      await enableCamera(camDeviceId); // Starts camera (non-viewable) and blurred (viewable)

      const originalCamStreamEntry = streamStore.getLocalStreamByDeviceId('camera', camDeviceId);
      expect(originalCamStreamEntry).not.toBeNull();
      expect(originalCamStreamEntry![1].viewable).toBe(false); // Original camera is not viewable when blurred
      const blurredStreamEntry = streamStore.getLocalStreamByDeviceId('blurred', camDeviceId);
      expect(blurredStreamEntry).not.toBeNull();

      mockRemoveLocalStream.mockClear();
      mockUpdateLocalStreamProperties.mockClear();

      // Trigger config change to blur: no
      const newConfigBlurOff = {
        ...get(configStoreModule.configStore),
         media: { ...get(configStoreModule.configStore).media, blurVideo: 'no' }
      };
      configStoreModule.configStore.set(newConfigBlurOff);

      await vi.waitFor(() => {
        expect(mockRemoveLocalStream).toHaveBeenCalledWith(blurredStreamEntry![0]);
      });
      await vi.waitFor(() => {
        expect(mockUpdateLocalStreamProperties).toHaveBeenCalledWith(originalCamStreamEntry![0], { viewable: true, sendable: true });
      });
    });

    it('changing default device in configStore should NOT affect active streams', async () => {
      const initialAudioDevice = 'audio-device-initial';
      mockGetAllConfig.mockReturnValue({
        ...get(configStoreModule.configStore),
        media: { ...get(configStoreModule.configStore).media, audioDevice: initialAudioDevice }
      });
      await enableAudio(initialAudioDevice); // Start stream with initial device
      expect(streamStore.getIsDeviceStreamActive('audio', initialAudioDevice)).toBe(true);

      mockTearDownStream.mockClear();
      mockAddLocalStream.mockClear();

      // Change default audio device in config
      const newDefaultAudioDevice = 'audio-device-new-default';
      const newConfigWithNewDefault = {
        ...get(configStoreModule.configStore),
        media: { ...get(configStoreModule.configStore).media, audioDevice: newDefaultAudioDevice }
      };
      configStoreModule.configStore.set(newConfigWithNewDefault);

      // Wait a bit to ensure no async operations are triggered to change streams
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify that the initial stream was NOT torn down and no new stream was added
      expect(mockTearDownStream).not.toHaveBeenCalled();
      expect(mockAddLocalStream).not.toHaveBeenCalled();
      expect(streamStore.getIsDeviceStreamActive('audio', initialAudioDevice)).toBe(true);
      expect(streamStore.getIsDeviceStreamActive('audio', newDefaultAudioDevice)).toBe(false);
    });
  });
});
