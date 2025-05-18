import { writable, get } from 'svelte/store';
import { streamStore, getStreamState, type LocalStreamData, type RemoteStreamData, type StreamState } from '../../stores/streamStore.js';

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
  id: string; // Unique ID for Svelte's #each block (e.g., utteranceId + lastUpdateTime)
  utteranceId: string; // Key for identifying the same utterance across updates (sessionId-speaker-beg)
  sessionId: string;
  speakerLabel: string;
  text: string;
  beg: string; // From ASR, e.g., "0:00:00"
  end: string; // From ASR, e.g., "0:00:04"
  timestamp: number; // Message arrival timestamp, for tie-breaking in sort
}

export interface TranscriptionDisplayStoreState {
  segments: TranscriptionSegment[]; 
  activeBuffers: Record<string, { sessionId: string, speakerLabel: string, text: string }>; // Keyed by sessionId
  lastTextBySpeaker: Record<string, { text: string, utteranceId: string }>; // Track last text per speaker
}

const initialDisplayState: TranscriptionDisplayStoreState = {
  segments: [],
  activeBuffers: {},
  lastTextBySpeaker: {},
};
export const transcriptionDisplayStore = writable<TranscriptionDisplayStoreState>(initialDisplayState);
// --- End New Store ---


function generateSessionId(isLocal: boolean, streamId: string, peerId?: string): string {
  // Normalize streamId by removing potential curly braces from some WebRTC implementations
  const normalizedStreamId = streamId.replace(/[{}]/g, "");
  return isLocal ? `local|${normalizedStreamId}` : `remote|${peerId}|${normalizedStreamId}`;
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

      transcriptionDisplayStore.update(s => {
        let segmentsChanged = false;
        
        // Create a copy of the last text by speaker tracking
        const lastTextBySpeaker = { ...s.lastTextBySpeaker };

        // Process finalized lines from ASR
        if (data.lines && Array.isArray(data.lines)) {
          data.lines.forEach((line: any, index: number) => {
            // Ensure essential fields are present
            if (line.text && line.text.trim().length > 0 && typeof line.speaker === 'number' && typeof line.beg === 'string' && typeof line.end === 'string') {
              const speakerLabel = getSpeakerLabelFromAsr(sessionId, line.speaker, line.text);
              
              // Skip fully empty "Silence" lines, but allow "Silence" segments if they have duration/context.
              // The main check is line.text.trim().length > 0.
              // if (speakerLabel === "Silence" && !line.text.trim()) return;

              const utteranceId = `${sessionId}-${line.speaker}-${line.beg}`; // Identifies an utterance
              const currentText = line.text.trim();
              const svelteKeyId = `${utteranceId}-${messageTimestamp}-${index}`; // Unique key for Svelte's #each
              
              // Create a unique key for this speaker
              const speakerKey = `${sessionId}-${speakerLabel}`;
              
              const lastInfo = lastTextBySpeaker[speakerKey];
              
              // Check if we have seen this speaker before
              if (lastInfo) {
                if (lastInfo.text === currentText && lastInfo.utteranceId === utteranceId) {
                } else {
                  const isLast = s.segments[s.segments.length-1]?.utteranceId === utteranceId;
                  // If this is the same speaker as the last segment, update that segment
                  if (isLast) {
                    s.segments[s.segments.length-1].text += currentText.substring(lastInfo.text.length)
                    s.segments[s.segments.length-1].end = line.end;
                    s.segments[s.segments.length-1].timestamp = messageTimestamp + index;
                    s.segments[s.segments.length-1].id = svelteKeyId;
                    segmentsChanged = true;
                  } else {
                    const newSegment = {
                      id: svelteKeyId,
                      utteranceId,
                      sessionId,
                      speakerLabel,
                      text: currentText.substring(lastInfo.text.length),
                      beg: line.beg,
                      end: line.end,
                      timestamp: messageTimestamp + index,
                      n: currentText.length,
                    };
                    s.segments.push(newSegment);
                    segmentsChanged = true;
                  }
                  
                  // Update our tracking of the last text for this speaker
                  lastTextBySpeaker[speakerKey] = { 
                    text: currentText, 
                    utteranceId: lastInfo.utteranceId 
                  };
                }
              } else {
                // The segment was removed or not found, create a new one
                const newSegment = {
                  id: svelteKeyId,
                  utteranceId,
                  sessionId,
                  speakerLabel,
                  text: currentText,
                  beg: line.beg,
                  end: line.end,
                  timestamp: messageTimestamp + index,
                  n: currentText.length,
                };
                s.segments.push(newSegment);
                segmentsChanged = true;
                
                // Update our tracking for this speaker
                lastTextBySpeaker[speakerKey] = { 
                  text: currentText, 
                  utteranceId 
                };
              }
            }
          });
        }

        // Process buffer_transcription
        const bufferText = data.buffer_transcription;
        // Determine speaker for buffer based on last line or default if no lines
        const lastFinalizedSpeaker = data.lines && data.lines.length > 0 ? data.lines[data.lines.length - 1].speaker : -1;
        const bufferSpeakerLabel = getSpeakerLabelFromAsr(sessionId, lastFinalizedSpeaker, bufferText || "");
        
        const newActiveBuffers = { ...s.activeBuffers };
        if (bufferText && bufferText.trim().length > 0) {
          newActiveBuffers[sessionId] = { sessionId, speakerLabel: bufferSpeakerLabel, text: bufferText.trim() };
        } else {
          delete newActiveBuffers[sessionId];
        }
        
        return {
          segments: [...s.segments],
          activeBuffers: newActiveBuffers,
          lastTextBySpeaker,
        };
      });

    } catch (e) {
      console.error(`Error processing transcription message for ${sessionId}:`, e, event.data as string);
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

      // Clear buffer and lastTextBySpeaker entries for this session from the display store
      transcriptionDisplayStore.update(s => {
        const newBuffers = { ...s.activeBuffers };
        delete newBuffers[sessionId];
        
        // Remove all lastTextBySpeaker entries for this session
        const newLastTextBySpeaker = { ...s.lastTextBySpeaker };
        Object.keys(newLastTextBySpeaker).forEach(key => {
          if (key.startsWith(`${sessionId}-`)) {
            delete newLastTextBySpeaker[key];
          }
        });
        
        return { 
          ...s, 
          activeBuffers: newBuffers,
          lastTextBySpeaker: newLastTextBySpeaker
        };
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
  // Also, explicitly set it here to ensure it's false if no sessions were active to begin with.
  transcriberStore.update(s => ({ ...s, isTranscribingOverall: false, activeSessions: {} }));
  // Clear displayable segments and buffers when stopping overall transcription
  transcriptionDisplayStore.update(s => ({
    ...s,
    segments: [],
    activeBuffers: {},
    // lastTextBySpeaker could be cleared too, or left if resuming might benefit
  }));
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

  const sessionParts = sessionId.split('|');
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

// Subscribe to streamStore to dynamically manage transcription sessions
streamStore.subscribe(currentStreamState => {
  const transcriberState = get(transcriberStore);
  if (!transcriberState.isTranscribingOverall) {
    return; // Only manage sessions if overall transcription is active
  }

  const allCurrentAudioStreamSessionIds = new Set<string>();

  // Identify all current audio streams from streamStore
  // Local streams
  Object.entries(currentStreamState.localStreams).forEach(([localStreamId, data]) => {
    if (data.stream && data.stream.getAudioTracks().length > 0) {
      allCurrentAudioStreamSessionIds.add(generateSessionId(true, localStreamId));
    }
  });

  // Remote streams
  Object.entries(currentStreamState.remoteStreams).forEach(([peerId, remoteData]) => {
    Object.entries(remoteData.streams).forEach(([remoteStreamId, stream]) => {
      if (stream.getAudioTracks().length > 0) {
        allCurrentAudioStreamSessionIds.add(generateSessionId(false, remoteStreamId, peerId));
      }
    });
  });

  // Start transcription for new audio streams
  allCurrentAudioStreamSessionIds.forEach(sessionId => {
    if (!transcriberState.activeSessions[sessionId]) {
      // Extract details to call startTranscriptionForStream
      const parts = sessionId.split('|');
      const isLocal = parts[0] === 'local';
      const streamIdInStore = isLocal ? parts[1] : parts[2]; // streamId might contain hyphens
      const peerId = isLocal ? undefined : parts[1];
      
      let streamToTranscribe: MediaStream | null = null;
      if (isLocal) {
        streamToTranscribe = currentStreamState.localStreams[streamIdInStore]?.stream || null;
      } else if (peerId) {
        console.log(currentStreamState.remoteStreams, peerId, parts)
        streamToTranscribe = currentStreamState.remoteStreams[peerId]?.streams[streamIdInStore] || null;
      }

      if (streamToTranscribe) {
        console.log(`Dynamically starting transcription for new/updated stream: ${sessionId}`);
        startTranscriptionForStream(streamToTranscribe, streamIdInStore, isLocal, peerId);
      } else {
        console.warn(`Stream for session ID ${sessionId} not found in current stream state. Cannot start transcription.`);
      }
    }
  });

  // Stop transcription for streams that are no longer present
  Object.keys(transcriberState.activeSessions).forEach(activeSessionId => {
    if (!allCurrentAudioStreamSessionIds.has(activeSessionId)) {
      console.log(`Dynamically stopping transcription for removed stream: ${activeSessionId}`);
      stopTranscriptionForSession(activeSessionId);
    }
  });
});
