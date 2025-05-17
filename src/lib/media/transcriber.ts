import { writable, get } from 'svelte/store';
import { getStreamState, type LocalStreamData, type RemoteStreamData } from '../../stores/streamStore.js';

const WEBSOCKET_URL = 'ws://localhost:8888/asr'; // Ensure this matches your ASR backend
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
  activeSessions: Record<string, ActiveTranscriptionSession>; 
}

// Store for overall transcription state (on/off, active sessions)
export const transcriberStore = writable<TranscriberState>({
  isTranscribingOverall: false,
  activeSessions: {},
});

// --- New Store for Displayable Transcription Data ---
export interface TranscriptionSegment {
  id: string; // Unique ID for the segment (e.g., sessionId + messageTimestamp + lineIndex)
  sessionId: string; 
  speakerLabel: string; 
  text: string;
  timestamp: number; // For ordering
}

export interface TranscriptionDisplayStoreState {
  segments: TranscriptionSegment[]; 
  activeBuffers: Record<string, { sessionId: string, speakerLabel: string, text: string }>; // Keyed by sessionId
}

const initialDisplayState: TranscriptionDisplayStoreState = {
  segments: [],
  activeBuffers: {},
};
export const transcriptionDisplayStore = writable<TranscriptionDisplayStoreState>(initialDisplayState);
// --- End New Store ---


function generateSessionId(isLocal: boolean, streamId: string, peerId?: string): string {
  // Normalize streamId by removing potential curly braces from some WebRTC implementations
  const normalizedStreamId = streamId.replace(/[{}]/g, "");
  return isLocal ? `local-${normalizedStreamId}` : `remote-${peerId}-${normalizedStreamId}`;
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
    try {
      const data = JSON.parse(event.data as string);
      const messageTimestamp = Date.now();

      // Process finalized lines from ASR
      if (data.lines && Array.isArray(data.lines)) {
        const newSegments: TranscriptionSegment[] = [];
        data.lines.forEach((line: any, index: number) => {
          if (line.text && line.text.trim().length > 0) {
            const speakerLabel = getSpeakerLabelFromAsr(sessionId, line.speaker, line.text);
            
            // Avoid adding "Silence" or "Processing" as full segments if they have no meaningful text,
            // or if we decide to handle them differently (e.g., just via buffer or not at all).
            // For now, if it has text, it's a segment.
            if (speakerLabel === "Silence" && !line.text.trim()) return; // Skip empty silence lines

            newSegments.push({
              id: `${sessionId}-${messageTimestamp}-${index}`, // Create a unique ID
              sessionId,
              speakerLabel,
              text: line.text.trim(),
              timestamp: messageTimestamp + index, // Add index to ensure order within same message
            });
          }
        });

        if (newSegments.length > 0) {
          transcriptionDisplayStore.update(s => ({
            ...s,
            // Add new segments and re-sort. Consider performance for very long transcriptions.
            segments: [...s.segments, ...newSegments].sort((a, b) => a.timestamp - b.timestamp),
          }));
        }
      }

      // Process buffer_transcription
      const bufferText = data.buffer_transcription;
      // Determine speaker for buffer based on last line or default if no lines
      const lastSpeakerInMessage = data.lines && data.lines.length > 0 ? data.lines[data.lines.length - 1].speaker : -1; // Default to a common speaker ID
      const bufferSpeakerLabel = getSpeakerLabelFromAsr(sessionId, lastSpeakerInMessage, bufferText || "");
      
      transcriptionDisplayStore.update(s => {
        const newBuffers = { ...s.activeBuffers };
        if (bufferText && bufferText.trim().length > 0) {
          newBuffers[sessionId] = { sessionId, speakerLabel: bufferSpeakerLabel, text: bufferText.trim() };
        } else {
          delete newBuffers[sessionId]; // Remove buffer if it's now empty
        }
        return { ...s, activeBuffers: newBuffers };
      });

    } catch (e) {
      console.error(`Error processing transcription message for ${sessionId}:`, e, event.data);
    }
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
        // console.log(`WebSocket connection closed for ${sessionId}.`); // Already logged by onclose
      }

      // Clear buffer for this session from the display store
      transcriptionDisplayStore.update(s => {
        const newBuffers = { ...s.activeBuffers };
        delete newBuffers[sessionId];
        return { ...s, activeBuffers: newBuffers };
      });

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

// Helper to generate a user-friendly speaker label
function getSpeakerLabelFromAsr(sessionId: string, asrSpeakerId: number, text: string): string {
  if (asrSpeakerId === -2) return "Silence"; // Typically, ASR indicates silence.
  // if (asrSpeakerId === 0) return "Processing..."; // ASR might use 0 for segments under diarization.

  const sessionParts = sessionId.split('-');
  let baseLabel = "Unknown Speaker";

  if (sessionParts[0] === 'local') {
    // For local streams, streamId might be 'audio', 'camera-XYZ', 'screen-XYZ', 'file-XYZ'
    // We can simplify this to "You" or "Your Audio", "Your Screen" etc.
    baseLabel = "You"; 
    if (sessionParts[1].startsWith('screen')) baseLabel = "Your Screen";
    else if (sessionParts[1].startsWith('file')) baseLabel = "Shared Video";

  } else if (sessionParts[0] === 'remote') {
    // For remote, sessionParts[1] is peerId, sessionParts[2] is remote streamId
    baseLabel = `Peer ${sessionParts[1].substring(0, 5)}`;
  }
  
  // Append ASR's speaker number if it's specific (e.g., -1, 1, 2 for diarized speakers)
  // ASR often uses -1 as a generic "speaker" if no specific diarization ID is assigned.
  if (asrSpeakerId !== 0) { // Don't append for "Processing..."
     // If ASR provides a positive speaker ID, or -1 (generic), use it.
     // This helps distinguish multiple speakers from the same source if ASR supports it.
    return `${baseLabel} (Spk ${asrSpeakerId})`;
  }
  return baseLabel; // For speakerId 0 or if no specific handling
}
