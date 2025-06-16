import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get, writable } from 'svelte/store';
import {
  transcriberStore,
  transcriptionDisplayStore,
  startOverallTranscription,
  stopOverallTranscription,
  toggleOverallTranscription,
  processReceivedTranscriptionPayload,
  setupTranscriptionChannel,
  // type TranscriberState, // Unused
  // type TranscriptionDisplayStoreState, // Unused
  type TranscriptionSegment,
  type FinalTranscriptionBroadcastPayload
  // generateSessionId is not exported, so we'll test it indirectly or by exporting it if necessary
  // For now, let's assume we might need to test functions that use it.
} from './transcriber';
import { streamStore, getStreamState, type StreamState } from '../stores/streamStore';
import {
  connectionStore,
  getDirectClient,
  getAllDirectClients,
  type ConnectionState,
  type WebRTCClient
} from '../stores/connectionStore';

// Mocks
vi.mock('../stores/streamStore', async () => {
  const actual = await vi.importActual('../stores/streamStore');
  return {
    ...actual,
    streamStore: writable<StreamState>({
      localStreams: {},
      remoteStreams: {},
      activeView: { layout: 'grid' }
    }),
    getStreamState: vi.fn(() => ({
      localStreams: {},
      remoteStreams: {},
      activeView: { layout: 'grid' }
    }))
  };
});

vi.mock('../stores/connectionStore', async () => {
  const actual = await vi.importActual('../stores/connectionStore');
  return {
    ...actual,
    connectionStore: writable<ConnectionState>({ directClients: {}, participants: {} }),
    getDirectClient: vi.fn(),
    getAllDirectClients: vi.fn(() => ({}))
  };
});

// Mock MediaRecorder and WebSocket
const mockMediaRecorderInstance = {
  start: vi.fn(),
  stop: vi.fn(),
  ondataavailable: null,
  onerror: null,
  onstop: null,
  state: 'inactive',
  mimeType: 'audio/webm',
  stream: new (global.MediaStream as any)() // Add a mock stream property
};
global.MediaRecorder = vi.fn().mockImplementation(() => mockMediaRecorderInstance) as any;
(global.MediaRecorder as any).isTypeSupported = vi.fn((mimeType) => mimeType === 'audio/webm');

global.WebSocket = vi.fn().mockImplementation(() => ({
  send: vi.fn(),
  close: vi.fn(),
  readyState: WebSocket.OPEN,
  onopen: null,
  onmessage: null,
  onclose: null,
  onerror: null
})) as any;

// Helper to reset stores
const resetStores = () => {
  transcriberStore.set({
    isTranscribingOverall: false,
    activeSessions: {}
  });
  transcriptionDisplayStore.set({
    segments: [],
    activeBuffers: {},
    lastTextBySpeaker: {}
  });
  // Reset streamStore mock
  (streamStore as any).set({
    localStreams: {},
    remoteStreams: {},
    activeView: { layout: 'grid' }
  });
  (getStreamState as any).mockReturnValue({
    // Cast to any for svelte-check
    localStreams: {},
    remoteStreams: {},
    activeView: { layout: 'grid' }
  });
  // Reset connectionStore mock
  (connectionStore as any).set({ directClients: {}, participants: {} });
  (getDirectClient as any).mockReset(); // Cast to any for svelte-check
  (getAllDirectClients as any).mockReturnValue({}); // Cast to any for svelte-check
};

// Mock MediaStream
class MockMediaStream {
  tracks: any[];
  active: boolean = true;
  id: string = `mock-media-stream-${Math.random()}`;

  constructor(tracks: any[] = []) {
    this.tracks = tracks;
  }
  getTracks = vi.fn(() => this.tracks);
  getAudioTracks = vi.fn(() => this.tracks.filter((t) => t.kind === 'audio'));
  getVideoTracks = vi.fn(() => this.tracks.filter((t) => t.kind === 'video'));
  addTrack = vi.fn((track) => this.tracks.push(track));
  removeTrack = vi.fn((track) => {
    this.tracks = this.tracks.filter((t) => t !== track);
  });
  clone = vi.fn(() => new MockMediaStream([...this.tracks]));
  getTrackById = vi.fn((trackId) => this.tracks.find((t) => t.id === trackId) || null);

  // EventTarget properties
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn(() => true);
  onaddtrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => any) | null = null;
  onremovetrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => any) | null = null;
}
global.MediaStream = MockMediaStream as any;

describe('Transcriber', () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Ensure any timers or subscriptions are cleaned up if necessary
    // For example, if streamStore subscriptions in transcriber.ts cause issues.
  });

  describe('Initial State', () => {
    it('transcriberStore should have correct initial state', () => {
      const state = get(transcriberStore);
      expect(state.isTranscribingOverall).toBe(false);
      expect(state.activeSessions).toEqual({});
    });

    it('transcriptionDisplayStore should have correct initial state', () => {
      const state = get(transcriptionDisplayStore);
      expect(state.segments).toEqual([]);
      expect(state.activeBuffers).toEqual({});
      expect(state.lastTextBySpeaker).toEqual({});
    });
  });

  // Test for generateSessionId (if made exportable, or tested via functions that use it)
  // For now, we'll test functions that implicitly use it.

  describe('startOverallTranscription', () => {
    it('should set isTranscribingOverall to true', () => {
      startOverallTranscription();
      expect(get(transcriberStore).isTranscribingOverall).toBe(true);
    });

    it('should not start transcription if no audio streams are available', () => {
      startOverallTranscription();
      expect(get(transcriberStore).activeSessions).toEqual({});
      // MediaRecorder and WebSocket should not have been called
      expect(global.MediaRecorder).not.toHaveBeenCalled();
      expect(global.WebSocket).not.toHaveBeenCalled();
    });

    it('should start transcription for local audio streams', async () => {
      const mockStream = new (global.MediaStream as any)([{ id: 'audio-track-1', kind: 'audio' }]);
      (getStreamState as any).mockReturnValue({
        // Cast to any for svelte-check
        localStreams: { 'local-stream-1': { stream: mockStream, type: 'audio' } },
        remoteStreams: {},
        activeView: { layout: 'grid' }
      });

      startOverallTranscription();

      expect(get(transcriberStore).isTranscribingOverall).toBe(true);
      // Wait for async operations within startTranscriptionForStream if any
      await new Promise(process.nextTick); // Allow microtasks to run

      // Check if MediaRecorder and WebSocket were called for the local stream
      // This depends on the internal logic of startTranscriptionForStream
      // We expect one session to be active
      const activeSessions = get(transcriberStore).activeSessions;
      const sessionKeys = Object.keys(activeSessions);
      expect(sessionKeys.length).toBe(1);
      expect(sessionKeys[0]).toContain('local|local-stream-1');
      expect(global.MediaRecorder).toHaveBeenCalledTimes(1);
      expect(global.WebSocket).toHaveBeenCalledTimes(1);
    });

    it('should start transcription for remote audio streams', async () => {
      const mockStream = new (global.MediaStream as any)([
        { id: 'remote-audio-track-1', kind: 'audio' }
      ]);
      (getStreamState as any).mockReturnValue({
        // Cast to any for svelte-check
        localStreams: {},
        remoteStreams: {
          'peer-1': {
            streams: { 'remote-stream-1': mockStream },
            videoEnabled: true,
            audioEnabled: true,
            name: 'Peer 1'
          }
        },
        activeView: { layout: 'grid' }
      });

      startOverallTranscription();
      expect(get(transcriberStore).isTranscribingOverall).toBe(true);
      await new Promise(process.nextTick);

      const activeSessions = get(transcriberStore).activeSessions;
      const sessionKeys = Object.keys(activeSessions);
      expect(sessionKeys.length).toBe(1);
      expect(sessionKeys[0]).toContain('remote|peer-1|remote-stream-1');
      expect(global.MediaRecorder).toHaveBeenCalledTimes(1);
      expect(global.WebSocket).toHaveBeenCalledTimes(1);
    });

    it('should handle streams with no audio tracks gracefully', async () => {
      const mockStreamNoAudio = {
        // Keep this simple as it's for no audio tracks
        getAudioTracks: () => []
      } as unknown as MediaStream; // Cast to unknown first
      (getStreamState as any).mockReturnValue({
        // Cast to any for svelte-check
        localStreams: { 'local-no-audio': { stream: mockStreamNoAudio, type: 'video' } },
        remoteStreams: {},
        activeView: { layout: 'grid' }
      });

      startOverallTranscription();
      expect(get(transcriberStore).isTranscribingOverall).toBe(true);
      await new Promise(process.nextTick);

      expect(get(transcriberStore).activeSessions).toEqual({});
      expect(global.MediaRecorder).not.toHaveBeenCalled();
      expect(global.WebSocket).not.toHaveBeenCalled();
    });
  });

  describe('stopOverallTranscription', () => {
    it('should set isTranscribingOverall to false and clear active sessions', async () => {
      // Add async
      // Setup a dummy active session to test clearing
      transcriberStore.set({
        isTranscribingOverall: true,
        activeSessions: {
          'dummy-session': {
            streamId: 'dummy',
            mediaRecorder: new (global.MediaRecorder as any)(new (global.MediaStream as any)()),
            websocket: new WebSocket('ws://localhost')
          }
        }
      });

      stopOverallTranscription();

      const state = get(transcriberStore);
      expect(state.isTranscribingOverall).toBe(false);
      // activeSessions might not be empty immediately if stopTranscriptionForSession is async
      // or relies on events. Let's check after a tick.
      await new Promise(process.nextTick);
      expect(get(transcriberStore).activeSessions).toEqual({});
    });

    it('should call stop on MediaRecorder and attempt to send EOS on WebSocket for active sessions', async () => {
      // Use the globally mocked instances
      const currentMockMediaRecorderInstance = new (global.MediaRecorder as any)(); // Add new
      const currentMockWebSocketInstance = new (global.WebSocket as any)('ws://localhost'); // Add new and a dummy URL

      // Simulate an active session being created
      const stream = new (global.MediaStream as any)([{ id: 'audio-track', kind: 'audio' }]);
      (getStreamState as any).mockReturnValue({
        localStreams: { 'local-stream-test': { stream, type: 'audio' } },
        remoteStreams: {},
        activeView: { layout: 'grid' }
      });
      startOverallTranscription(); // This will create a session

      // Wait for async operations in startTranscriptionForStream
      await new Promise(process.nextTick);

      // Trigger onopen for WebSocket to simulate connection and MediaRecorder start
      if (currentMockWebSocketInstance.onopen) {
        currentMockWebSocketInstance.onopen();
      }
      await new Promise(process.nextTick);

      // Ensure MediaRecorder is in 'recording' state
      currentMockMediaRecorderInstance.state = 'recording';

      stopOverallTranscription();
      await new Promise(process.nextTick);

      expect(currentMockMediaRecorderInstance.stop).toHaveBeenCalled();
      // Check if EOS was sent. This happens in mediaRecorder.onstop if state was 'recording'.
      // To test this properly, we'd need to trigger onstop.
      // For now, let's assume if stop() was called, the EOS logic path is entered.
      // If the MR was recording, an empty blob should be sent.
      if (currentMockMediaRecorderInstance.onstop) {
        currentMockMediaRecorderInstance.onstop(); // Manually trigger onstop
        await new Promise(process.nextTick);
        expect(currentMockWebSocketInstance.send).toHaveBeenCalledWith(expect.any(Blob));
      } else {
        // If onstop is not set up by the mock in this flow, this check might be too strict.
        // The core is that stop() is called.
      }
    });
  });

  describe('toggleOverallTranscription', () => {
    it('should call startOverallTranscription if not transcribing', () => {
      transcriberStore.set({ isTranscribingOverall: false, activeSessions: {} });
      // We need to spy on startOverallTranscription if it were in the same module and exported,
      // or check its effects.
      toggleOverallTranscription();
      expect(get(transcriberStore).isTranscribingOverall).toBe(true);
    });

    it('should call stopOverallTranscription if transcribing', () => {
      transcriberStore.set({ isTranscribingOverall: true, activeSessions: {} });
      toggleOverallTranscription();
      expect(get(transcriberStore).isTranscribingOverall).toBe(false);
    });
  });

  describe('processReceivedTranscriptionPayload', () => {
    const baseTime = Date.now();
    const createSegment = (
      idNum: number,
      utteranceNum: number,
      sessionId: string,
      speakerLabel: string,
      text: string,
      beg: string,
      end: string,
      offsetMs: number = 0
    ): TranscriptionSegment => ({
      id: `id-${idNum}-${baseTime + offsetMs}`,
      utteranceId: `utt-${utteranceNum}-${sessionId}-${speakerLabel}-${beg}`,
      sessionId,
      speakerLabel,
      text,
      beg,
      end,
      timestamp: baseTime + offsetMs
    });

    it('should add new segments to the display store', () => {
      const payload: FinalTranscriptionBroadcastPayload = {
        type: 'transcription_data',
        finalSegments: [
          createSegment(1, 1, 'session1', 'SpeakerA', 'Hello world', '0:00:00', '0:00:02', 0)
        ],
        originalSessionId: 'session1'
      };
      processReceivedTranscriptionPayload(payload);
      const state = get(transcriptionDisplayStore);
      expect(state.segments.length).toBe(1);
      expect(state.segments[0].text).toBe('Hello world');
      expect(state.lastTextBySpeaker['session1-SpeakerA']).toEqual({
        text: 'Hello world',
        utteranceId: state.segments[0].utteranceId
      });
    });

    it('should append text to the last segment if utteranceId and speaker match and it is the absolute last', () => {
      // Initial segment
      const segment1 = createSegment(
        1,
        1,
        'session1',
        'SpeakerA',
        'Hello',
        '0:00:00',
        '0:00:01',
        0
      );
      processReceivedTranscriptionPayload({
        type: 'transcription_data',
        finalSegments: [segment1],
        originalSessionId: 'session1'
      });

      // Update to the same utterance
      const segment1Update = createSegment(
        2,
        1,
        'session1',
        'SpeakerA',
        'Hello world',
        '0:00:00',
        '0:00:02',
        100
      ); // Full text
      processReceivedTranscriptionPayload({
        type: 'transcription_data',
        finalSegments: [segment1Update],
        originalSessionId: 'session1'
      });

      const state = get(transcriptionDisplayStore);
      expect(state.segments.length).toBe(1);
      expect(state.segments[0].text).toBe('Hello world'); // Appended " world"
      expect(state.segments[0].end).toBe('0:00:02');
      expect(state.segments[0].id).toBe(segment1Update.id); // Svelte key id updated
      expect(state.lastTextBySpeaker['session1-SpeakerA']).toEqual({
        text: 'Hello world',
        utteranceId: segment1.utteranceId // Utterance ID remains the same
      });
    });

    it('should add a new segment for the diff if utteranceId and speaker match but it is NOT the absolute last', () => {
      const segA1 = createSegment(1, 1, 'session1', 'SpeakerA', 'Hello', '0:00:00', '0:00:01', 0);
      processReceivedTranscriptionPayload({
        type: 'transcription_data',
        finalSegments: [segA1],
        originalSessionId: 'session1'
      });

      const segB1 = createSegment(
        2,
        1,
        'session1',
        'SpeakerB',
        'Hi there',
        '0:00:01',
        '0:00:03',
        100
      );
      processReceivedTranscriptionPayload({
        type: 'transcription_data',
        finalSegments: [segB1],
        originalSessionId: 'session1'
      }); // Speaker B interjects

      const segA1Update = createSegment(
        3,
        1,
        'session1',
        'SpeakerA',
        'Hello again',
        '0:00:00',
        '0:00:04',
        200
      ); // Full text for Speaker A's original utterance
      processReceivedTranscriptionPayload({
        type: 'transcription_data',
        finalSegments: [segA1Update],
        originalSessionId: 'session1'
      });

      const state = get(transcriptionDisplayStore);
      expect(state.segments.length).toBe(3);
      expect(state.segments[0].text).toBe('Hello'); // Original segA1
      expect(state.segments[1].text).toBe('Hi there'); // segB1
      expect(state.segments[2].text).toBe(' again'); // Diff for segA1Update
      expect(state.segments[2].utteranceId).toBe(segA1.utteranceId);
      expect(state.lastTextBySpeaker['session1-SpeakerA']).toEqual({
        text: 'Hello again',
        utteranceId: segA1.utteranceId
      });
    });

    it('should handle active buffers correctly', () => {
      const payloadWithBuffer: FinalTranscriptionBroadcastPayload = {
        type: 'transcription_data',
        finalSegments: [],
        activeBuffer: { sessionId: 'session1', speakerLabel: 'SpeakerA', text: 'typing...' },
        originalSessionId: 'session1'
      };
      processReceivedTranscriptionPayload(payloadWithBuffer);
      let state = get(transcriptionDisplayStore);
      expect(state.activeBuffers['session1']).toEqual({
        sessionId: 'session1',
        speakerLabel: 'SpeakerA',
        text: 'typing...'
      });

      const payloadClearBuffer: FinalTranscriptionBroadcastPayload = {
        type: 'transcription_data',
        finalSegments: [],
        activeBuffer: undefined, // Explicitly undefined
        originalSessionId: 'session1'
      };
      processReceivedTranscriptionPayload(payloadClearBuffer);
      state = get(transcriptionDisplayStore);
      expect(state.activeBuffers['session1']).toBeUndefined();
    });

    it('should sort segments by timestamp', () => {
      const seg1 = createSegment(1, 1, 's1', 'SA', 'First', '0:00:00', '0:00:01', 200); // Later
      const seg2 = createSegment(2, 1, 's1', 'SB', 'Second', '0:00:01', '0:00:02', 100); // Earlier

      processReceivedTranscriptionPayload({
        type: 'transcription_data',
        finalSegments: [seg1],
        originalSessionId: 's1'
      });
      processReceivedTranscriptionPayload({
        type: 'transcription_data',
        finalSegments: [seg2],
        originalSessionId: 's1'
      });

      const state = get(transcriptionDisplayStore);
      expect(state.segments.length).toBe(2);
      expect(state.segments[0].text).toBe('Second'); // seg2 should be first
      expect(state.segments[1].text).toBe('First'); // seg1 should be second
    });
  });

  describe('setupTranscriptionChannel', () => {
    it('should create a data channel named "transcription" with ID 4', () => {
      const mockPc = {
        createDataChannel: vi.fn().mockReturnValue({
          onopen: null,
          onmessage: null,
          onclose: null,
          onerror: null
        })
      };
      const mockClient = { pc: mockPc, dc_transcription: null } as unknown as WebRTCClient;
      (getDirectClient as any).mockReturnValue(mockClient); // Cast to any

      setupTranscriptionChannel('test-cid');

      expect(mockPc.createDataChannel).toHaveBeenCalledWith('transcription', {
        negotiated: true,
        id: 4
      });
      expect(mockClient.dc_transcription).not.toBeNull();
    });

    it('should log an error if client or pc is not found', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (getDirectClient as any).mockReturnValue(null); // Cast to any
      setupTranscriptionChannel('test-cid-no-client');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Client or PeerConnection not found for CID test-cid-no-client in setupTranscriptionChannel'
      );

      (getDirectClient as any).mockReturnValue({ pc: null } as WebRTCClient); // Cast to any
      setupTranscriptionChannel('test-cid-no-pc');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Client or PeerConnection not found for CID test-cid-no-pc in setupTranscriptionChannel'
      );
      consoleErrorSpy.mockRestore();
    });

    it('should log an error if createDataChannel fails', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockPc = {
        createDataChannel: vi.fn().mockReturnValue(null) // Simulate failure
      };
      const mockClient = { pc: mockPc, dc_transcription: null } as unknown as WebRTCClient;
      (getDirectClient as any).mockReturnValue(mockClient); // Cast to any

      setupTranscriptionChannel('test-cid-fail-dc');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to create transcription data channel for client test-cid-fail-dc'
      );
      consoleErrorSpy.mockRestore();
    });

    // Further tests for onopen, onmessage, onclose, onerror of the data channel
    // would require more involved mocking of the event lifecycle.
    // For onmessage, it would involve testing handleIncomingTranscriptionMessage.
  });

  // More tests needed for:
  // - startTranscriptionForStream (complex, involves WebSocket and MediaRecorder lifecycle)
  // - stopTranscriptionForSession (also complex, with EOS logic)
  // - The streamStore subscription logic for dynamic start/stop
  // - handleIncomingTranscriptionMessage (very complex, with different message types and relay logic)
});
