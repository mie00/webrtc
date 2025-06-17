import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  enableAudio,
  disableAudio,
  enableCamera,
  disableCamera,
  enableScreenSharing,
  disableScreenSharing,
  enableFileStream,
  disableFileStream,
  setAudioCallback
} from './localStreamManager';
import * as streamStore from '../stores/streamStore';
import * as configStoreModule from '../stores/configStore';
import * as localFileStreamStoreModule from '../stores/localFileStreamStore';
import * as streamUtils from './stream';
import * as backgroundUtils from './background';
import * as streamLifecycle from '../app/streamLifecycle';

// Mock dependencies
vi.mock('../stores/streamStore');
vi.mock('../stores/configStore');
vi.mock('../stores/localFileStreamStore');
vi.mock('./stream');
vi.mock('./background');
vi.mock('../app/streamLifecycle');

const mockGetLocalStreamsByType = vi.spyOn(streamStore, 'getLocalStreamsByType');
const mockAddLocalStream = vi.spyOn(streamStore, 'addLocalStream');
const mockRemoveLocalStream = vi.spyOn(streamStore, 'removeLocalStream');
const mockUpdateLocalStreamProperties = vi.spyOn(streamStore, 'updateLocalStreamProperties');
const mockGetIsAudioEnabled = vi.spyOn(streamStore, 'getIsAudioEnabled');
const mockGetIsCameraEnabled = vi.spyOn(streamStore, 'getIsCameraEnabled');

const mockGetAllConfig = vi.spyOn(configStoreModule, 'getAllConfig');
const mockConfigStoreSubscribe = vi.fn();
// @ts-expect-error - part of the mock
configStoreModule.configStore = { subscribe: mockConfigStoreSubscribe };

const mockGetLocalFileStreamState = vi.spyOn(localFileStreamStoreModule, 'getLocalFileStreamState');

const mockSetupStream = vi.spyOn(streamUtils, 'setupStream');
const mockProcessAudio = vi.spyOn(streamUtils, 'processAudio');
const mockStopProcessingAudio = vi.spyOn(streamUtils, 'stopProcessingAudio');
const mockTearDownStream = vi.spyOn(streamUtils, 'tearDownStream');

const mockBackgroundChange = vi.spyOn(backgroundUtils, 'backgroundChange');

const mockGetAudioProcessingContext = vi.spyOn(streamLifecycle, 'getAudioProcessingContext');
const mockSetAudioProcessingContext = vi.spyOn(streamLifecycle, 'setAudioProcessingContext');
const mockRemoveAudioProcessingContext = vi.spyOn(streamLifecycle, 'removeAudioProcessingContext');

const mockMediaStream: MediaStream = {
  id: 'mock-stream-id',
  active: true,
  getAudioTracks: vi.fn(() => [
    {
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
      dispatchEvent: vi.fn()
    }
  ]),
  getVideoTracks: vi.fn(() => [
    {
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
      dispatchEvent: vi.fn()
    }
  ]),
  addTrack: vi.fn(),
  removeTrack: vi.fn(),
  clone: vi.fn(),
  getTrackById: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn()
};

const mockUserMedia = vi.fn().mockResolvedValue(mockMediaStream);
const mockDisplayMedia = vi.fn().mockResolvedValue(mockMediaStream);

global.navigator.mediaDevices = {
  ...global.navigator.mediaDevices,
  getUserMedia: mockUserMedia,
  getDisplayMedia: mockDisplayMedia
};

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

    // Default mock implementations
    mockGetLocalStreamsByType.mockReturnValue({});
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
    mockAddLocalStream.mockReturnValue('new-stream-id');
    mockProcessAudio.mockResolvedValue({
      sourceNode: {} as AudioNode,
      analyserNode: {} as AnalyserNode,
      gainNode: {} as GainNode,
      scriptProcessorNode: {} as ScriptProcessorNode // or AudioWorkletNode
    });
  });

  describe('setAudioCallback', () => {
    it('should set the audio callback function', async () => {
      const cb = vi.fn();
      setAudioCallback(cb);
      // To verify, we'd need to trigger logic that uses audioCbFunction
      // For example, by calling enableAudio and ensuring processAudio uses it.
      // This is more of an integration test for the callback.
      // For now, we'll assume it's set and test its usage in enableAudio.
      mockGetLocalStreamsByType.mockReturnValueOnce({}); // No existing streams
      await enableAudio();
      expect(mockProcessAudio).toHaveBeenCalled();
      // Simulate the callback from processAudio
      const processAudioCallback = mockProcessAudio.mock.calls[0][1];
      processAudioCallback(new Uint8Array([128, 128]), {} as AnalyserNode);
      expect(cb).toHaveBeenCalledWith(128);
    });
  });

  describe('enableAudio', () => {
    it('should request user media for audio and add it to the store', async () => {
      mockGetLocalStreamsByType.mockReturnValueOnce({}); // No existing streams
      await enableAudio();

      expect(mockUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(mockSetupStream).toHaveBeenCalledWith(mockMediaStream, 'high');
      expect(mockAddLocalStream).toHaveBeenCalledWith('audio', mockMediaStream, null, true, true);
    });

    it('should use a specific deviceId if provided', async () => {
      mockGetLocalStreamsByType.mockReturnValueOnce({});
      const deviceId = 'group1|device1';
      await enableAudio(deviceId);

      expect(mockUserMedia).toHaveBeenCalledWith({
        audio: { groupId: 'group1', deviceId: 'device1' }
      });
    });

    it('should clean up existing audio streams before adding a new one', async () => {
      const existingStreamId = 'existing-audio-stream';
      const existingStreamData = {
        stream: mockMediaStream,
        src: null,
        type: 'audio',
        viewable: true,
        sendable: true,
        name: 'Audio',
        id: existingStreamId
      };
      mockGetLocalStreamsByType.mockReturnValueOnce({ [existingStreamId]: existingStreamData });
      const mockAudioNodes = {
        sourceNode: {} as AudioNode,
        analyserNode: {} as AnalyserNode,
        gainNode: {} as GainNode,
        scriptProcessorNode: {} as ScriptProcessorNode
      };
      mockGetAudioProcessingContext.mockReturnValueOnce(mockAudioNodes);

      await enableAudio();

      expect(mockTearDownStream).toHaveBeenCalledWith(existingStreamData.stream);
      expect(mockStopProcessingAudio).toHaveBeenCalledWith(mockAudioNodes);
      expect(mockRemoveAudioProcessingContext).toHaveBeenCalledWith(existingStreamId);
      expect(mockRemoveLocalStream).toHaveBeenCalledWith(existingStreamId);

      expect(mockUserMedia).toHaveBeenCalledTimes(1); // New stream requested
      expect(mockAddLocalStream).toHaveBeenCalledTimes(1); // New stream added
    });

    it('should call audioCbFunction if set', async () => {
      const cb = vi.fn();
      setAudioCallback(cb);
      mockGetLocalStreamsByType.mockReturnValueOnce({});

      await enableAudio();

      expect(mockProcessAudio).toHaveBeenCalled();
      const processAudioCb = mockProcessAudio.mock.calls[0][1]; // Get the callback passed to processAudio
      const testDataArray = new Uint8Array([100, 150, 200]);
      processAudioCb(testDataArray, {} as AnalyserNode);

      expect(cb).toHaveBeenCalledWith(150); // (100+150+200)/3
    });
  });

  describe('disableAudio', () => {
    it('should tear down existing audio streams and remove them from the store', async () => {
      const streamId1 = 'audio-stream-1';
      const streamData1 = {
        stream: mockMediaStream,
        src: null,
        type: 'audio',
        viewable: true,
        sendable: true,
        name: 'Audio 1',
        id: streamId1
      };
      mockGetLocalStreamsByType.mockReturnValueOnce({ [streamId1]: streamData1 });
      const mockAudioNodes = {
        sourceNode: {} as AudioNode,
        analyserNode: {} as AnalyserNode,
        gainNode: {} as GainNode,
        scriptProcessorNode: {} as ScriptProcessorNode
      };
      mockGetAudioProcessingContext.mockReturnValueOnce(mockAudioNodes);

      await disableAudio();

      expect(mockTearDownStream).toHaveBeenCalledWith(streamData1.stream);
      expect(mockStopProcessingAudio).toHaveBeenCalledWith(mockAudioNodes);
      expect(mockRemoveAudioProcessingContext).toHaveBeenCalledWith(streamId1);
      expect(mockRemoveLocalStream).toHaveBeenCalledWith(streamId1);
    });

    it('should call audioCbFunction with 0 if set', async () => {
      const cb = vi.fn();
      setAudioCallback(cb);
      mockGetLocalStreamsByType.mockReturnValueOnce({}); // No streams to remove, but cb should still be called

      await disableAudio();
      expect(cb).toHaveBeenCalledWith(0);
    });
  });

  // TODO: Add tests for enableCamera, disableCamera, configStore subscription logic,
  // enableScreenSharing, disableScreenSharing, enableFileStream, disableFileStream.
});
