import { EMOJIS } from '../utils/emojis.js';
import type {
  NegoData,
  NegoMessageMap,
  NegoMessageType,
  OfferNegoMessage,
  AnswerNegoMessage,
  ChallengeNegoMessage,
  SolutionNegoMessage,
  TrustedNegoMessage,
  ParticipantNegoMessage,
  ProfileInfoNegoMessage,
  ParticipantEndNegoMessage,
  HangupNegoMessage,
  BaseNegoMessage
} from '../../types/negoMessages.js'; // Adjusted import path
import {
  addDirectClient,
  updateDirectClientState,
  updateDirectClientFingerprint,
  updateDirectClientPublicKey, // Renamed
  removeDirectClient,
  addParticipant,
  removeParticipant,
  resetConnectionStore,
  getDirectClient,
  getAllDirectClients,
  getAllClientCids,
  type DirectClientState,
  getDirectClientState
} from '../../stores/connectionStore.js'; // Adjust path if needed
import { getAllConfig } from '../../stores/configStore.js';
import { profileStore } from '../../stores/profileStore.js';
import { 
  updatePeerProfile, 
  removePeerProfile, 
} from '../../stores/peerProfileStore.js';
import { get } from 'svelte/store';
import { 
  registerNegoHandler, 
  getNegoHandler, 
  getAllCleanups,
  resetAppStateStore
} from '../../stores/appStateStore.js'; // Import store functions
import { diffChars } from 'diff';
import { streamInit } from '../streamBridge.js';
import { forwardInit } from '../forwardBridge.js';

import { setupTrackHandler } from '../streamBridge.js';
import { setupForwardChannel } from '../forwardBridge.js';
import { setupChatChannel } from '../chatBridge.js';
import { setupFileChannel } from '../fileBridge.js';
import { setupTranscriptionChannel } from '../media/transcriber.js';
import { verifyLoginJWT, verifyLoginJWTFromBase64 } from 'src/stores/authStore.js';


export class WebRTCApp {
  private sids: Record<string, string> = {};
  private debug = false;
  private nego_messages: Record<string, any> = {};
  // Removed challengeDataStore and requestLoginRedirectCallback

  constructor() { // Removed config parameter
    // Config is now managed solely by configStore
    this.setupNegoHandlers();
    this.init();
  }

  public init(): void {
    // Initialize modules that register their own handlers/cleanups
    streamInit();
    forwardInit();
  }

  // get cid of sid from sids
  public getCid(sid: string): string | undefined {
    return this.sids[sid];
  }

  // Removed setRequestLoginRedirectCallback

  private setupNegoHandlers(): void {
    registerNegoHandler("answer", (data: AnswerNegoMessage, cid: string) => {
      // data is RTCSessionDescriptionInit-like, which is what setRemoteDescription expects
      getDirectClient(cid)?.pc?.setRemoteDescription(data as RTCSessionDescriptionInit);
    });

    registerNegoHandler("offer", async (data: OfferNegoMessage, cid: string) => {
      const client = getDirectClient(cid);
      if (!client || !client.pc) return; // Check if client exists
      if (!client.polite) {
        if (client.makingOffer) return;
        if (client.pc.signalingState != "stable") return;
      }
      // data is RTCSessionDescriptionInit-like
      await client.pc.setRemoteDescription(data as RTCSessionDescriptionInit);
      await client.pc.setLocalDescription(); // This creates an answer
      if (client.pc.localDescription) {
        // Send the answer back
        this.sendNego(client, { type: "answer", sdp: client.pc.localDescription.sdp });
      }
    });

    registerNegoHandler("hangup", (data: HangupNegoMessage, cid: string) => {
      const client = getDirectClient(cid);
      if (client && !client.polite) {
        this.destroyClient(cid);
      } else {
        this.destroy(); // Destroy self if polite or client not found (shouldn't happen)
      }
    });

    registerNegoHandler("participant", (data: ParticipantNegoMessage, relayingClientCid: string) => {
      addParticipant(data.cid, relayingClientCid, data.publicKey);
    });

    registerNegoHandler("participant.end", (data: ParticipantEndNegoMessage, cid: string) => {
      removeParticipant(data.cid);
    });

    registerNegoHandler("trusted", (data: TrustedNegoMessage, cid: string) => {
      const client = getDirectClient(cid);
      if (!client) return;
      client.trusting = true; // We know this peer is trusting us
      this.acceptClient(cid, client);
    });

    registerNegoHandler("solution", async (data: SolutionNegoMessage, cid: string) => {
      console.log("solution", data);
      // Assuming data.solution.jwt and data.solution.pubKey are correct based on SolutionNegoMessage type
      const verified = await verifyLoginJWTFromBase64(data.solution.jwt, data.solution.pubKey);
      if (verified) {
        const client = getDirectClient(cid);
        if (!client) return;

        const peerPublicKey = data.solution.pubKey;
        if (peerPublicKey && typeof peerPublicKey === 'string') {
          updateDirectClientPublicKey(cid, peerPublicKey);
        } else {
          console.warn(`Solution from ${cid} did not contain a valid pubKey.`);
        }
        
        client.trusted = true; // We now trust this peer
        
        this.sendNego(client, { type: "trusted" });
        this.acceptClient(cid, client);
      }
    });

    registerNegoHandler("challenge", async (data: ChallengeNegoMessage, cid: string) => {
      console.log("challenge received from", cid, "data:", data.data);
      const authState = window.authStore?.getAuthState();

      if (!authState || !authState.privateKeyJwk || !authState.jwt || !authState.publicKeyJwk) {
        console.warn(`Cannot respond to challenge from ${cid}: User not authenticated or keys/JWT missing.`);
        return;
      }

      const client = getDirectClient(cid);
      if (!client || !client.pc) {
        console.error("Client not found or PC not available for cid:", cid, "cannot send solution.");
        return;
      }

      try {
        const privateKey = await crypto.subtle.importKey(
            "jwk",
            authState.privateKeyJwk,
            { name: "ECDSA", namedCurve: "P-384" },
            true,
            ["sign"]
        );

        const originalChallengeContent = data.data; // From ChallengeNegoMessage
        const challengeString = typeof originalChallengeContent === 'string' ? originalChallengeContent : JSON.stringify(originalChallengeContent);
        const challengeBuffer = new TextEncoder().encode(challengeString);

        const signatureBuffer = await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          privateKey,
          challengeBuffer
        );
        const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

        const solutionMessage: SolutionNegoMessage = {
          type: "solution",
          solution: {
            signedChallenge: signatureBase64,
            jwt: authState.jwt,
            pubKey: JSON.stringify(authState.publicKeyJwk),
            originalChallenge: originalChallengeContent
          }
        };
        this.sendNego(client, solutionMessage);
        console.log("Solution sent to", cid);

      } catch (error) {
        console.error("Error processing challenge and sending solution to", cid, ":", error);
      }
    });

    registerNegoHandler("profile_info", (data: ProfileInfoNegoMessage, cid: string) => {
      const client = getDirectClient(cid);
      if (!client?.trusted) {
        console.log("recieved profile_info from untrusted peer, ignoring");
        return;
      }
      // Properties are now strongly typed via ProfileInfoNegoMessage
      updatePeerProfile(data.publicKey, { userName: data.profile.userName });
      console.log(`Received profile for ${data.profile.userName} (publicKey: ${data.publicKey}) from client ${cid}`);
    });
  }

  // Removed handleCallbackAndSendSolution method

  public acceptClient(cid: string, client: WebRTCClient): void {
    if (!client.trusted || !client.trusting) return;

    getAllClientCids().forEach(existingCid => {
        if (existingCid !== cid) {
            const existingClientPeerObject = getDirectClient(existingCid);
            const newClientState = getDirectClientState(cid);
            const newClientPublicKey = newClientState?.publicKey;

            if (existingClientPeerObject && newClientPublicKey) {
                const participantMessage: ParticipantNegoMessage = { 
                    type: "participant", 
                    cid: cid, 
                    publicKey: newClientPublicKey 
                };
                this.sendNego(existingClientPeerObject, participantMessage);
            }

            const existingClientState = getDirectClientState(existingCid);
            const existingClientPublicKey = existingClientState?.publicKey;
            if (existingClientPublicKey) {
                const participantMessageToNew: ParticipantNegoMessage = { 
                    type: "participant", 
                    cid: existingCid, 
                    publicKey: existingClientPublicKey 
                };
                this.sendNego(client, participantMessageToNew);
            }
        }
    });

    const authState = window.authStore?.getAuthState();
    const localPublicKey = authState?.publicKeyJwk ? JSON.stringify(authState.publicKeyJwk) : null;
    const localProfile = get(profileStore);

    if (localPublicKey && localProfile.isProfileComplete && localProfile.userName) {
      const profileInfoMessage: ProfileInfoNegoMessage = {
        type: "profile_info",
        publicKey: localPublicKey,
        profile: { userName: localProfile.userName }
      };
      this.sendNego(client, profileInfoMessage);
    }

    setupTrackHandler(cid);
    setupChatChannel(cid);
    setupFileChannel(cid);
    setupForwardChannel(cid);
    setupTranscriptionChannel(cid);
  }

  public sendNego(client: WebRTCClient, messageData: NegoData): void {
    let finalMessage: NegoData & { id: string }; // Ensure id is present

    if (!messageData.id) {
      // Make a copy to add id without mutating original if it's from a source like localDescription
      finalMessage = { ...messageData, id: this.uuidv4() } as NegoData & { id: string };
    } else {
      finalMessage = messageData as NegoData & { id: string };
    }
  
    if (!this.nego_messages) {
      this.nego_messages = {};
    }
    this.nego_messages[finalMessage.id] = {}; // Store by ID to prevent re-processing

    try {
      client.nego_dc?.send(JSON.stringify(finalMessage));
    } catch (e) {
      console.log("error sending data", finalMessage, "to", client, "error", e);
    }
  }

  public destroyClient(cid: string): void {
    const clientState = getDirectClientState(cid);
    const publicKeyToAnnounce = clientState?.publicKey;

    getAllClientCids().filter((key) => key !== cid).forEach((key) => {
      const otherClient = getDirectClient(key);
      if (otherClient) {
          const participantEndMessage: ParticipantEndNegoMessage = {
            type: 'participant.end', 
            cid: cid, 
          };
          this.sendNego(otherClient, participantEndMessage);
      }
    });

    const client = getDirectClient(cid);
    if (client) {
      // Clear interval first
      if (client._transceiver_interval) {
        clearInterval(client._transceiver_interval);
        client._transceiver_interval = undefined;
      }

      // Clean up data channels
      if (client.nego_dc) {
        client.nego_dc.onclose = null;
        client.nego_dc.onmessage = null;
      }
      if (client.dc) {
        client.dc.onclose = null;
        client.dc.onmessage = null;
      }
       if (client.dc_file) {
        client.dc_file.onclose = null;
        client.dc_file.onmessage = null;
      }
       if (client.forward) {
        client.forward.onclose = null;
        client.forward.onmessage = null;
      }

      // Clean up PeerConnection
      if (client.pc) {
        // Run specific cleanups associated with this client
        const cleanups = getAllCleanups();
        for (const cleanup of Object.values(cleanups)) {
          cleanup(cid); // Pass cid to cleanup functions
        }
        client.pc.close();
        client.pc = null; // Nullify PC reference

        // Clear other client properties (optional, helps GC)
        client.dc = undefined;
        client.dc_file = undefined;
        client.forward = undefined;
        client.nego_dc = undefined;
        client.file_stuff = undefined;
        client.polite = undefined;
        client.makingOffer = undefined;
      }
    }
    // Remove from the store last
    removeDirectClient(cid);
    // Also remove self from the participant list if present (might happen if announced before full cleanup)
    removeParticipant(cid); // This might be redundant if participant.end already handled it for this cid
  }

  public cleanup(): void {
    // Get all CIDs before resetting the store
    const cids = getAllClientCids();

    // Run all general cleanup functions first
    const cleanups = getAllCleanups();
    for (const cleanup of Object.values(cleanups)) {
      cleanup(); // Call without cid for global cleanup
    }
    // appStateStore will be reset later, which clears cleanups

    // Iterate through clients to send hangup and destroy
    for (const cid of cids) {
      const client = getDirectClient(cid);
      if (client) {
        const hangupMessage: HangupNegoMessage = { type: "hangup" };
        this.sendNego(client, hangupMessage);
      }
      // Destroy client (which also removes from store)
      this.destroyClient(cid);
    }

    // Reset the connection store after all clients are processed
    resetConnectionStore();
    // Reset the app state store (handlers, cleanups)
    resetAppStateStore();
  }

  public destroy(): void {
    this.cleanup(); // This now also calls resetAppStateStore via cleanup's end
    this.reset();
  }

  public reset(): void {
    window.location.href = window.location.origin + window.location.pathname;
  }

  public uuidv4(): string {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
  }

  public async initClient(polite: boolean, options: ClientInitOptions): Promise<string> {
    // Get current config from the store
    const currentConfig = getAllConfig();
    const rtcConfig = {
      iceServers: [
        ...(currentConfig["stun-servers"]?.split(',').filter(link => link).map(link => ({ urls: "stun:" + link })) || []),
        ...(currentConfig["turn-server-v2"] && currentConfig["turn-username"] && currentConfig["turn-password"] ? [{
          urls: "turn:" + currentConfig["turn-server-v2"],
          username: currentConfig["turn-username"],
          credential: currentConfig["turn-password"],
        }] : [])
      ],
    };

    const { sid, offer } = options;
    const cid = this.uuidv4();
    this.sids = this.sids || {};
    // Check if a client for this sid already exists in the store
    if (sid && sid in this.sids && getDirectClient(this.sids[sid])) {
      getDirectClient(this.sids[sid])?.pc?.restartIce();
      return this.sids[sid];
    }
    this.sids[sid] = cid;

    // Create the PeerConnection using config derived from the store
    const pc = new RTCPeerConnection(rtcConfig);
    // Create the client object
    const client: WebRTCClient = { pc, polite, trusted: false, trusting: false };
    // Add client to the store immediately
    addDirectClient(cid, client);

    // Use the local 'client' variable for event handlers
    pc.onconnectionstatechange = () => {
      if (pc) { // Check if pc still exists
        updateDirectClientState(cid, pc.connectionState, pc.iceConnectionState);
        // Trigger fingerprint update if connected
        if (pc.connectionState === 'connected' && pc.iceConnectionState === 'connected') {
          this.updateFingerprint(cid); // Call helper function
        }
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc) { // Check if pc still exists
        updateDirectClientState(cid, pc.connectionState, pc.iceConnectionState);
        if (pc.iceConnectionState === "failed") {
          pc.restartIce();
        }
        // Trigger fingerprint update if connected
        if (pc.connectionState === 'connected' && pc.iceConnectionState === 'connected') {
          this.updateFingerprint(cid); // Call helper function
        }
      }
    };

    // addDirectClient(cid, polite); // This is now handled above with the full client object

    const nego_dc = pc.createDataChannel("nego", {
      negotiated: true,
      id: 0
    });
    client.nego_dc = nego_dc; // Assign to local client object
    nego_dc.onclose = async e => {
      console.log(e);
      this.destroyClient(cid);
    }

    nego_dc.onerror = (error) => {
      console.error('Data channel error:', error, error.error);
      client.pc?.restartIce();
    };

    nego_dc.onmessage = async e => {
      const parsedData = JSON.parse(e.data) as BaseNegoMessage; // Parse as BaseNegoMessage first to get id and type

      if (!client.trusted || !client.trusting) {
        if (!["challenge", "solution", "trusted"].includes(parsedData.type)) {
          console.log("ignoring message from untrusted peer", parsedData);
          return;
        }
      }

      // Ensure parsedData.id is a string before using it as an index
      const messageId = String(parsedData.id);
      if (messageId in this.nego_messages) {
        return;
      }
      this.nego_messages[messageId] = {};
      
      console.log("got negotiation message", parsedData);

      const messageType = parsedData.type as NegoMessageType;
      const handler = getNegoHandler(messageType);

      if (!handler) {
        console.log("cannot find handler for", messageType);
        return;
      }
      // Cast to the specific message type expected by the handler
      // NegoMessageMap[typeof messageType] would be NegoMessageMap[NegoMessageType] which is too broad.
      // We cast parsedData to NegoData (the union of all specific messages)
      // and rely on the handler's parameter type for correctness.
      // The handler's `data` parameter is NegoMessageMap[K], so this should align.
      handler(parsedData as NegoMessageMap[typeof messageType], cid);
    };

    nego_dc.onopen = () => {
      const challengeMessage: ChallengeNegoMessage = {
        type: "challenge",
        data: Math.random().toString()
      };
      this.sendNego(client, challengeMessage);
    };

    client._transceiver_interval = window.setInterval(() => {
      // client.pc?.addTransceiver('audio', {direction: "recvonly"});
      // client.pc?.addTransceiver('video', {direction: "recvonly"});
    }, 10000);

    if (offer) {
      await pc.setRemoteDescription({
        type: "offer",
        sdp: offer.trim() + '\n'
      });
      let answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
    } else {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
    }
    pc.onnegotiationneeded = async () => {
      client.makingOffer = true;
      try {
        await pc?.setLocalDescription(); // This creates an offer if needed
        if (pc?.currentLocalDescription && pc?.localDescription) {
          this.logDiff(pc.currentLocalDescription.sdp, pc.localDescription.sdp);
        }
        if (pc?.localDescription && pc.localDescription.type === "offer" && pc.localDescription.sdp) {
          const offerMessage: OfferNegoMessage = { type: "offer", sdp: pc.localDescription.sdp };
          this.sendNego(client, offerMessage);
        } else if (pc?.localDescription && pc.localDescription.type === "answer" && pc.localDescription.sdp) {
          // This case might be less common here if onnegotiationneeded primarily generates offers
          const answerMessage: AnswerNegoMessage = { type: "answer", sdp: pc.localDescription.sdp };
          this.sendNego(client, answerMessage);
        }
      } catch (e) {
        console.log("renegotiation error", e);
      } finally {
        client.makingOffer = false;
      }
    };

    if (!offer) {
      setTimeout(() => {
        // Re-fetch client from store in case it was destroyed
        const currentClient = getDirectClient(cid);
        if (currentClient?.pc?.signalingState === 'have-local-offer') {
          this.destroyClient(cid);
        }
      }, 60 * 1000);
    }
    return cid;
  }

  public async getOffer(cb: (candidate: RTCIceCandidate | null) => Promise<void>, options: {sid: string}): Promise<string> {
      const cid = await this.initClient(false, options);
      const client = getDirectClient(cid); // Retrieve client from store
      if (client?.pc) {
          client.pc.onicecandidate = async ({ candidate }) => {
          console.log('Candidate found (offer)', candidate);
          await cb(candidate);
        };
    }
    return cid;
  }

  public async getAnswer(offer: string, cb: (candidate: RTCIceCandidate | null) => Promise<void>, options: {sid: string}): Promise<string> {
      const cid = await this.initClient(true, {sid: options.sid, offer});
      const client = getDirectClient(cid); // Retrieve client from store
      if (client?.pc) {
        client.pc.onicecandidate = async ({ candidate }) => {
          console.log('Candidate found (answer)', candidate);
          await cb(candidate);
        };
      }
      return cid;
  }

  public async sha256(message: string): Promise<string> {
    // encode as UTF-8
    const msgBuffer = new TextEncoder().encode(message);

    // hash the message
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);

    // convert ArrayBuffer to Array
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    // convert bytes to hex string                  
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  public async genEmojis(digest: string): Promise<string> {
    if (!crypto.subtle) {
      return "❗❗❗❗❗❗❗❗";
    }
    const msgBuffer = new TextEncoder().encode(digest);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const limit = Math.pow(EMOJIS.length, 4) + Math.pow(EMOJIS.length, 3) + Math.pow(EMOJIS.length, 2) + EMOJIS.length;
    let val = 0;
    let ind = 0;
    while (val < limit && ind < hashArray.length) {
      val += Math.pow(hashArray[ind], ind + 1);
      ind += 1;
    }
    return (EMOJIS[val % EMOJIS.length]) +
      (EMOJIS[Math.floor(val / EMOJIS.length) % EMOJIS.length]) +
      (EMOJIS[Math.floor(val / EMOJIS.length / EMOJIS.length) % EMOJIS.length]) +
      (EMOJIS[Math.floor(val / EMOJIS.length / EMOJIS.length / EMOJIS.length) % EMOJIS.length]);
  }

  public logDiff(d1: string, d2: string): void {
    const diffs = document.getElementById('diffs');
    if (diffs) {
      if (this.debug) {
        diffs.classList.remove('hidden');
      }
      let span: HTMLSpanElement | null = null;

      const diff = diffChars(d1, d2);
      const fragment = document.createDocumentFragment();

      diff.forEach((part: any) => {
        // green for additions, red for deletions
        // grey for common parts
        const color = part.added ? 'green' :
          part.removed ? 'red' : 'grey';
        span = document.createElement('span');
        span.style.color = color;
        span.appendChild(document.createTextNode(part.value));
        fragment.appendChild(span);
      });
      diffs.appendChild(fragment);
    }
  }

  // Removed handleChange method

  private async updateFingerprint(cid: string): Promise<void> {
      const client = getDirectClient(cid); // Get client from store
      if (!client || !client.pc) return;

      try {
          const stats = await client.pc.getStats();
          let transport: RTCTransportStats | null = null;
          let certificates: Record<string, any> = {}; // Use specific type
          stats.forEach(stat => {
              if (stat.type === 'transport') {
                  transport = stat as RTCTransportStats;
              } else if (stat.type === 'certificate') {
                  certificates[stat.id] = stat as any;
              }
          });

          if (transport) {
              const remoteCertId = (transport as any).remoteCertificateId;
              const localCertId = (transport as any).localCertificateId;

              if (localCertId && remoteCertId && certificates[localCertId] && certificates[remoteCertId]) {
                  // Ensure consistent ordering for fingerprint generation
                  const firstCert = client.polite ? certificates[remoteCertId] : certificates[localCertId];
                  const secondCert = !client.polite ? certificates[remoteCertId] : certificates[localCertId];

                  if (firstCert?.fingerprint && secondCert?.fingerprint) {
                      const fingerprints = firstCert.fingerprint + secondCert.fingerprint;
                      const ejs = await this.genEmojis(fingerprints);
                      updateDirectClientFingerprint(cid, ejs);
                      console.log(`Fingerprint for ${cid}: ${ejs}`);

                      // Optional: Update history (UI logic for overlay is now in App.svelte)
                      if (!new URLSearchParams(window.location.search).has('r')) {
                          history.replaceState('', '', window.location.origin + window.location.pathname);
                      }
                  } else {
                      console.warn(`Missing fingerprint for one or both certificates for client ${cid}`);
                  }
              } else {
                 console.warn(`Missing certificate IDs or certificate stats for client ${cid}`);
              }
          } else {
             console.warn(`No transport stats found for client ${cid}`);
          }
      } catch (error) {
          console.error(`Error getting stats/fingerprint for ${cid}:`, error);
      }
  }
}
