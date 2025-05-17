import { writable, get } from 'svelte/store';
import { getStreamState, type LocalStreamData, type RemoteStreamData } from '../../stores/streamStore'; // Assuming StreamState is exported

const WEBSOCKET_URL = 'ws://localhost:8888/asr';
const TRANSCRIPTION_CHUNK_DURATION_MS = 1000;
const MEDIA_RECORDER_MIME_TYPE = 'audio/webm';

interface ActiveTranscriptionSession {
  streamId: string; // A unique identifier for the stream being transcribed
  mediaRecorder: MediaRecorder;
  websocket: WebSocket;
  peerId?: string; // For remote streams
}

export interface TranscriberState {
  isTranscribingOverall: boolean;
  activeSessions: Record<string, ActiveTranscriptionSession>; // Keyed by a unique session ID (e.g., local-streamXYZ or remote-peerABC-streamXYZ)
}

export const transcriberStore = writable<TranscriberState>({
  isTranscribingOverall: false,
  activeSessions: {},
});

function generateSessionId(isLocal: boolean, streamId: string, peerId?: string): string {
  return isLocal ? `local-${streamId}` : `remote-${peerId}-${streamId}`;
}

async function startTranscriptionForStream(stream: MediaStream, streamId: string, isLocal: boolean, peerId?: string) {
  if (!stream.getAudioTracks().length) {
    console.log(`Stream ${streamId} has no audio tracks. Skipping transcription.`);
    return;
  }

  const sessionId = generateSessionId(isLocal, streamId, peerId);
  const currentState = get(transcriberStore);

  if (currentState.activeSessions[sessionId]) {
    console.log(`Transcription session already active for ${sessionId}`);
    return;
  }

  console.log(`Attempting to connect to WebSocket for stream ${sessionId}: ${WEBSOCKET_URL}`);
  const websocket = new WebSocket(WEBSOCKET_URL);
  let mediaRecorder: MediaRecorder;

  websocket.onopen = () => {
    console.log(`WebSocket connection established for ${sessionId}.`);
    try {
      const options = { mimeType: MEDIA_RECORDER_MIME_TYPE };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn(`${options.mimeType} is not supported for MediaRecorder on stream ${sessionId}. Trying default.`);
        mediaRecorder = new MediaRecorder(stream); // Fallback to default
      } else {
        mediaRecorder = new MediaRecorder(stream, options);
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && websocket.readyState === WebSocket.OPEN) {
          websocket.send(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error(`MediaRecorder error for ${sessionId}:`, event);
        // Attempt to clean up this specific session
        stopTranscriptionForSession(sessionId);
      };
      
      mediaRecorder.start(TRANSCRIPTION_CHUNK_DURATION_MS);
      console.log(`Audio capture started for ${sessionId}.`);

      transcriberStore.update(state => ({
        ...state,
        activeSessions: {
          ...state.activeSessions,
          [sessionId]: { streamId, mediaRecorder, websocket, peerId },
        },
      }));
    } catch (e) {
      console.error(`Error starting MediaRecorder for ${sessionId}:`, e);
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close();
      }
      // No need to update store here as session wasn't added if MR failed
    }
  };

  websocket.onmessage = (event) => {
    console.log(`Transcription for ${sessionId} (WS):`, event.data);
    // TODO: Process transcription data, potentially update another store or emit events
  };

  websocket.onclose = (event) => {
    console.log(`WebSocket connection closed for ${sessionId}. Code: ${event.code}, Reason: ${event.reason}`);
    stopTranscriptionForSession(sessionId, false); // Don't try to close websocket again
  };

  websocket.onerror = (error) => {
    console.error(`WebSocket error for ${sessionId}:`, error);
    stopTranscriptionForSession(sessionId, false); // Don't try to close websocket again
  };
}

function stopTranscriptionForSession(sessionId: string, closeWebSocket = true) {
  transcriberStore.update(state => {
    const session = state.activeSessions[sessionId];
    if (session) {
      if (session.mediaRecorder && session.mediaRecorder.state === "recording") {
        session.mediaRecorder.stop();
        // Send empty blob if WebSocket is still open and we intend to close it gracefully
        if (closeWebSocket && session.websocket && session.websocket.readyState === WebSocket.OPEN) {
            try {
                const emptyBlob = new Blob([], { type: MEDIA_RECORDER_MIME_TYPE });
                session.websocket.send(emptyBlob);
                console.log(`Sent empty blob to signal end of audio for ${sessionId}.`);
            } catch (e) {
                console.warn(`Could not send empty blob for ${sessionId}:`, e);
            }
        }
      }
      // MediaRecorder tracks are part of the original stream, don't stop them here
      // as the stream itself is managed by streamStore.

      if (closeWebSocket && session.websocket && 
          (session.websocket.readyState === WebSocket.OPEN || session.websocket.readyState === WebSocket.CONNECTING)) {
        session.websocket.close();
        console.log(`WebSocket connection closed for ${sessionId}.`);
      }

      const { [sessionId]: _, ...remainingSessions } = state.activeSessions;
      const stillTranscribing = Object.keys(remainingSessions).length > 0;
      
      return {
        ...state,
        activeSessions: remainingSessions,
        isTranscribingOverall: stillTranscribing,
      };
    }
    return state;
  });
}

export function startOverallTranscription(): void {
  const streamState = getStreamState();
  let transcriptionStarted = false;

  // Transcribe local streams
  Object.entries(streamState.localStreams).forEach(([localStreamId, data]: [string, LocalStreamData]) => {
    if (data.stream && data.stream.getAudioTracks().length > 0) {
      startTranscriptionForStream(data.stream, localStreamId, true);
      transcriptionStarted = true;
    }
  });

  // Transcribe remote streams
  Object.entries(streamState.remoteStreams).forEach(([peerId, remoteData]: [string, RemoteStreamData]) => {
    Object.entries(remoteData.streams).forEach(([remoteStreamId, stream]) => {
      if (stream.getAudioTracks().length > 0) {
        startTranscriptionForStream(stream, remoteStreamId, false, peerId);
        transcriptionStarted = true;
      }
    });
  });
  
  if (transcriptionStarted) {
    transcriberStore.update(s => ({ ...s, isTranscribingOverall: true }));
  } else {
    console.log("No streams with audio found to transcribe.");
    transcriberStore.update(s => ({ ...s, isTranscribingOverall: false }));
  }
}

export function stopOverallTranscription(): void {
  const currentState = get(transcriberStore);
  Object.keys(currentState.activeSessions).forEach(sessionId => {
    stopTranscriptionForSession(sessionId);
  });
  // isTranscribingOverall will be set to false by the last call to stopTranscriptionForSession
}

export function toggleOverallTranscription(): void {
  const state = get(transcriberStore);
  if (state.isTranscribingOverall) {
    stopOverallTranscription();
  } else {
    startOverallTranscription();
  }
}
