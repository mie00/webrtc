import { writable, get } from 'svelte/store';
import { streamStore, getStreamState, type LocalStreamData, type RemoteStreamData, type StreamState } from '../../stores/streamStore.js';
import { getDirectClient, getAllDirectClients } from '../../stores/connectionStore.js'; // Added

const WEBSOCKET_URL = 'ws://localhost:8888/asr'; // Ensure this matches your ASR backend
const TRANSCRIPTION_CHUNK_DURATION_MS = 5000;
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

// --- Payload for broadcasting final transcription data ---
export interface FinalTranscriptionBroadcastPayload {
  type: 'transcription_data';
  finalSegments: TranscriptionSegment[]; // Array of finalized segments since last broadcast or for an utterance
  activeBuffer?: { sessionId: string, speakerLabel: string, text: string }; // Current active buffer for a session
  originalSessionId: string; // The sessionId from the source ASR
}
// --- End Payload ---

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
          console.log('sending', event.data)
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
      const asrData = JSON.parse(event.data as string);
      console.log("ASR Data Received:", asrData);
      const messageTimestamp = Date.now();

      const finalSegmentsForBroadcast: TranscriptionSegment[] = [];
      let activeBufferForBroadcast: { sessionId: string, speakerLabel: string, text: string } | undefined = undefined;

      // Process finalized lines from ASR to create segments for local update and broadcast
      if (asrData.lines && Array.isArray(asrData.lines)) {
        asrData.lines.forEach((line: any, index: number) => {
          if (line.text && line.text.trim().length > 0 && typeof line.speaker === 'number' && typeof line.beg === 'string' && typeof line.end === 'string') {
            const speakerLabel = getSpeakerLabelFromAsr(sessionId, line.speaker, line.text);
            const utteranceId = `${sessionId}-${line.speaker}-${line.beg}`;
            const currentText = line.text.trim();
            const svelteKeyId = `${utteranceId}-${messageTimestamp}-${index}`;

            finalSegmentsForBroadcast.push({
              id: svelteKeyId,
              utteranceId,
              sessionId, // This is the original local sessionId
              speakerLabel,
              text: currentText,
              beg: line.beg,
              end: line.end,
              timestamp: messageTimestamp + index,
              // 'n' field removed as it's not standard and can be derived if needed
            });
          }
        });
      }

      // Process buffer_transcription for local update and broadcast
      const bufferText = asrData.buffer_transcription;
      if (bufferText && bufferText.trim().length > 0) {
        const lastFinalizedSpeaker = asrData.lines && asrData.lines.length > 0 ? asrData.lines[asrData.lines.length - 1].speaker : -1;
        const bufferSpeakerLabel = getSpeakerLabelFromAsr(sessionId, lastFinalizedSpeaker, bufferText);
        activeBufferForBroadcast = { sessionId, speakerLabel: bufferSpeakerLabel, text: bufferText.trim() };
      }
      
      // Construct the payload for local processing and broadcasting
      const broadcastPayload: FinalTranscriptionBroadcastPayload = {
        type: 'transcription_data',
        finalSegments: finalSegmentsForBroadcast,
        activeBuffer: activeBufferForBroadcast,
        originalSessionId: sessionId,
      };

      // Process this payload locally
      processReceivedTranscriptionPayload(broadcastPayload);

      // Broadcast this payload to all connected peers
      const clients = getAllDirectClients();
      for (const cid in clients) {
        const client = clients[cid];
        if (client.dc_transcription && client.dc_transcription.readyState === 'open') {
          try {
            client.dc_transcription.send(JSON.stringify(broadcastPayload));
          } catch (err) {
            console.error(`Failed to send transcription data to ${cid}:`, err);
          }
        }
      }

    } catch (e) {
      console.error(`Error processing transcription message from ASR for ${sessionId}:`, e, event.data as string);
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
  const currentGlobalState = get(transcriberStore);
  const session = currentGlobalState.activeSessions[sessionId];

  if (!session) {
    // console.warn(`Session ${sessionId} not found for stopping.`);
    return;
  }

  const cleanupStoreEntries = () => {
    transcriberStore.update(state => {
      const sessionInStore = state.activeSessions[sessionId];
      if (!sessionInStore) return state; // Already removed or changed

      transcriptionDisplayStore.update(s => {
        const newBuffers = { ...s.activeBuffers };
        delete newBuffers[sessionId];
        
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
    });
  };

  if (session.mediaRecorder && session.mediaRecorder.state === "recording") {
    console.log(`Stopping MediaRecorder for ${sessionId}. Will close WebSocket and cleanup on 'stop' event.`);
    
    const originalOnError = session.mediaRecorder.onerror;

    const commonStopCleanup = () => {
      if (session.mediaRecorder) {
        session.mediaRecorder.onstop = null;
        session.mediaRecorder.onerror = originalOnError;
      }
      cleanupStoreEntries();
    };

    session.mediaRecorder.onstop = () => {
      console.log(`MediaRecorder.onstop event for ${sessionId}.`);
      if (closeWebSocket && session.websocket) {
        if (session.websocket.readyState === WebSocket.OPEN) {
          try {
            const emptyBlob = new Blob([], { type: MEDIA_RECORDER_MIME_TYPE });
            session.websocket.send(emptyBlob);
            console.log(`Sent empty blob (EOS) for ${sessionId}.`);
          } catch (e) { 
            console.warn(`Could not send empty blob for ${sessionId}:`, e); 
          }
          session.websocket.close();
          console.log(`WebSocket connection closed from onstop for ${sessionId}.`);
        } else if (session.websocket.readyState === WebSocket.CONNECTING) {
          session.websocket.close();
          console.log(`WebSocket connection (was connecting) closed from onstop for ${sessionId}.`);
        }
      }
      commonStopCleanup();
    };

    session.mediaRecorder.onerror = (event) => {
      console.error(`MediaRecorder error during stop process for ${sessionId}:`, event);
      if (closeWebSocket && session.websocket && 
          (session.websocket.readyState === WebSocket.OPEN || session.websocket.readyState === WebSocket.CONNECTING)) {
        session.websocket.close();
        console.log(`WebSocket connection closed due to MediaRecorder error during stop for ${sessionId}.`);
      }
      if (originalOnError && session.mediaRecorder) {
        originalOnError.call(session.mediaRecorder, event);
      }
      commonStopCleanup();
    };

    session.mediaRecorder.stop();
    // Further cleanup is handled by onstop or onerror.
  } else {
    // MediaRecorder not recording or doesn't exist. Immediate cleanup.
    console.log(`MediaRecorder for ${sessionId} not recording or doesn't exist. Closing WebSocket and cleaning up immediately.`);
    if (closeWebSocket && session.websocket) {
      if (session.websocket.readyState === WebSocket.OPEN || session.websocket.readyState === WebSocket.CONNECTING) {
        session.websocket.close();
        console.log(`WebSocket connection closed (immediate) for ${sessionId}.`);
      }
    }
    cleanupStoreEntries();
  }
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
  
  // Always set isTranscribingOverall to true when this function is called.
  // The streamStore subscription will handle starting individual transcriptions when streams appear.
  transcriberStore.update(s => ({ ...s, isTranscribingOverall: true }));

  if (!transcriptionStarted) {
    console.log("No streams with audio found to transcribe yet. Transcription is enabled and will start when audio streams become available.");
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
  // Retain lastTextBySpeaker as it's managed by processReceivedTranscriptionPayload now.
  transcriptionDisplayStore.update(s => ({
    ...s,
    segments: [],
    activeBuffers: {},
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
  // if (asrSpeakerId !== 0) { // Don't append for "Processing..."
  //    // If ASR provides a positive speaker ID, or -1 (generic), use it.
  //    // This helps distinguish multiple speakers from the same source if ASR supports it.
  //   return `${baseLabel} (Spk ${asrSpeakerId})`;
  // }
  // Always return baseLabel after Silence check and baseLabel determination, per user request.
  return baseLabel; 
}


/**
 * Processes a FinalTranscriptionBroadcastPayload to update the transcriptionDisplayStore.
 * This function is called when new transcription data is available, either from the
 * local ASR service or received from a peer.
 */
export function processReceivedTranscriptionPayload(payload: FinalTranscriptionBroadcastPayload): void {
  transcriptionDisplayStore.update(s => {
    const newSegments = [...s.segments]; // Operate on a mutable copy for this update
    const lastTextBySpeaker = { ...s.lastTextBySpeaker };

    payload.finalSegments.forEach(currentAsrSegment => {
      const speakerKey = `${currentAsrSegment.sessionId}-${currentAsrSegment.speakerLabel}`;
      const lastTrackedInfo = lastTextBySpeaker[speakerKey];

      // Determine if the current ASR segment corresponds to the absolute last segment in our display list
      const isUpdatingAbsoluteLastSegment =
        newSegments.length > 0 &&
        newSegments[newSegments.length - 1].utteranceId === currentAsrSegment.utteranceId &&
        newSegments[newSegments.length - 1].speakerLabel === currentAsrSegment.speakerLabel;

      if (lastTrackedInfo && lastTrackedInfo.utteranceId === currentAsrSegment.utteranceId) {
        // Cases 1 & 2: Utterance seen before for this speaker.
        // currentAsrSegment.text is the full text for the utterance from ASR at this point.
        // lastTrackedInfo.text is the full text we last recorded for this utterance.
        const textDiff = currentAsrSegment.text.substring(lastTrackedInfo.text.length);

        if (isUpdatingAbsoluteLastSegment) {
          // Case 1: Update the absolute last segment by appending the difference.
          const segmentToUpdate = newSegments[newSegments.length - 1];
          segmentToUpdate.text += textDiff; // Append difference
          segmentToUpdate.end = currentAsrSegment.end;
          segmentToUpdate.timestamp = currentAsrSegment.timestamp; // Keep latest timestamp
          segmentToUpdate.id = currentAsrSegment.id; // Update svelte key id
        } else {
          // Case 2: Not the absolute last segment, add a new segment with the diff only.
          // This happens if another speaker interjected, or if this is a continuation
          // of an utterance that wasn't the immediately preceding one.
          newSegments.push({
            ...currentAsrSegment, // base properties (id, utteranceId, sessionId, speakerLabel, beg, end, timestamp)
            text: textDiff,        // only the difference in text
          });
        }
        // Update tracking for this speaker with the full current text of the utterance
        lastTextBySpeaker[speakerKey] = { text: currentAsrSegment.text, utteranceId: currentAsrSegment.utteranceId };

      } else {
        // Case 3: Utterance not seen before for this speaker (or speaker entirely new).
        // Add a new segment with the full text from currentAsrSegment.
        newSegments.push({ ...currentAsrSegment }); // currentAsrSegment.text is already the full text

        // Update tracking for this speaker
        lastTextBySpeaker[speakerKey] = { text: currentAsrSegment.text, utteranceId: currentAsrSegment.utteranceId };
      }
    });

    // Sort all segments by timestamp to ensure chronological order.
    newSegments.sort((a, b) => a.timestamp - b.timestamp);

    const newActiveBuffers = { ...s.activeBuffers };
    if (payload.activeBuffer) {
      newActiveBuffers[payload.activeBuffer.sessionId] = payload.activeBuffer;
    } else {
      // If payload explicitly has no activeBuffer for its originalSessionId,
      // clear it. This handles cases where a peer's buffer clears.
      delete newActiveBuffers[payload.originalSessionId];
    }

    return {
      segments: newSegments,
      activeBuffers: newActiveBuffers,
      lastTextBySpeaker,
    };
  });
}


/**
 * Sets up the transcription data channel for a given client.
 * This should be called when a direct client connection is established and data channels are being negotiated.
 */
export function setupTranscriptionChannel(cid: string): void {
  const client = getDirectClient(cid);
  if (!client || !client.pc) {
    console.error(`Client or PeerConnection not found for CID ${cid} in setupTranscriptionChannel`);
    return;
  }

  console.log(`Setting up transcription data channel for client ${cid}`);
  const dc_transcription = client.pc.createDataChannel("transcription", {
    negotiated: true,
    id: 4 // Unique ID for the transcription channel
  });

  if (dc_transcription) {
    client.dc_transcription = dc_transcription; // Assign to client object

    dc_transcription.onopen = (): void => {
      console.log(`Transcription data channel opened for client ${cid}`);
    };

    dc_transcription.onmessage = (e: MessageEvent): void => {
      try {
        const receivedDataString = e.data as string;
        const payload = JSON.parse(receivedDataString) as FinalTranscriptionBroadcastPayload;

        if (payload.type === 'transcription_data') {
          console.log(`Received transcription data from peer ${cid}:`, payload);
          processReceivedTranscriptionPayload(payload);

          // Relay this data to all *other* connected peers
          const allClients = getAllDirectClients();
          for (const otherCid in allClients) {
            if (otherCid !== cid) { // Don't send back to the original sender
              const otherClient = allClients[otherCid];
              if (otherClient.dc_transcription && otherClient.dc_transcription.readyState === 'open') {
                try {
                  otherClient.dc_transcription.send(receivedDataString); // Send the original string
                } catch (err) {
                  console.error(`Failed to relay transcription data to ${otherCid}:`, err);
                }
              }
            }
          }
        } else {
          console.warn(`Received unknown payload type on transcription channel from ${cid}:`, payload);
        }
      } catch (err) {
        console.error(`Error processing transcription message from peer ${cid}:`, err, e.data);
      }
    };

    dc_transcription.onclose = (): void => {
      console.log(`Transcription data channel closed for client ${cid}`);
      // Optionally, clean up client.dc_transcription if needed, though client removal should handle it.
    };

    dc_transcription.onerror = (err: Event): void => {
      console.error(`Transcription data channel error for client ${cid}:`, err);
    };
  } else {
    console.error(`Failed to create transcription data channel for client ${cid}`);
  }
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
