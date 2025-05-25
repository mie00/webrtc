import { EMOJIS } from '../utils/emojis.js';
import {
  setCidKeys,
  removeCidKeys,
  resetCidKeyStore,
  getKeysByCid
} from '../../stores/cidKeyStore.js'; // Import new store
import type {
  NegoData, // Keep one NegoData
  NegoMessageMap,
  NegoMessageType,
  OfferNegoMessage, // Keep one OfferNegoMessage
  AnswerNegoMessage, // Keep one AnswerNegoMessage
  // ChallengeNegoMessage, // Moved to authHandler
  // SolutionNegoMessage, // Moved to authHandler
  TrustedNegoMessage, // For authHandler context & NegotiationManager
  ParticipantNegoMessage, // For acceptClient & NegotiationManager
  ParticipantEndNegoMessage, // For destroyClient & NegotiationManager
  HangupNegoMessage, // For cleanup & NegotiationManager
  BaseNegoMessage // For onmessage parsing before passing to negotiationManager
  // OfferNegoMessage, AnswerNegoMessage are still needed for onnegotiationneeded - already listed
  // and NegoData for some typings. - already listed
} from '../../types/negoMessages.js'; // Adjusted import path
import {
  addDirectClient,
  updateDirectClientState,
  updateDirectClientFingerprint,
  // updateDirectClientPublicKey, // Removed
  // updateDirectClientUserPublicKey, // Removed
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
// import { profileStore } from '../../stores/profileStore.js'; // Moved to authHandler
import { 
  updatePeerProfile, 
  removePeerProfile, 
} from '../../stores/peerProfileStore.js';
// import { get } from 'svelte/store'; // Moved to authHandler
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
// import { verifyLoginJWT, verifyLoginJWTFromBase64 } from '../../stores/authStore.js'; // Moved to authHandler
import { 
  createSolutionHandler, 
  createChallengeHandler 
} from './authHandler.js'; // Import new auth handlers
import { NegotiationManager, type NegotiationManagerContext } from './negotiationManager.js';

export class WebRTCApp {
  private sids: Record<string, string> = {};
  private debug = false;
  // private nego_messages: Record<string, any> = {}; // Moved to NegotiationManager
  // Removed challengeDataStore and requestLoginRedirectCallback
  // Note: sentChallengeData is added dynamically to client objects.
  // Ideally, WebRTCClient interface in types/global.d.ts would be updated.
  private negotiationManager: NegotiationManager;
  private negotiationContext: NegotiationManagerContext;

  constructor() { // Removed config parameter
    // Config is now managed solely by configStore

    this.negotiationContext = {
      uuidv4: this.uuidv4.bind(this),
      actualSend: (dc, data) => {
        try {
          dc?.send(data);
        } catch (e) {
          console.log("error in actualSend", data, "to dc", dc, "error", e);
        }
      },
      getNegoHandler: getNegoHandler,
      registerNegoHandler: registerNegoHandler,
      getDirectClient: getDirectClient,
      destroyClient: this.destroyClient.bind(this),
      destroyApp: this.destroy.bind(this),
      acceptClient: this.acceptClient.bind(this),
      setCidKeys: setCidKeys,
      getKeysByCid: getKeysByCid,
      addParticipant: addParticipant,
      removeParticipant: removeParticipant,
    };
    this.negotiationManager = new NegotiationManager(this.negotiationContext);

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
    this.negotiationManager.initializeStandardNegoHandlers();

    // Auth handlers are still registered here, but use negotiationManager's sendNegoMessage
    const solutionHandlerContext = {
      sendNego: this.negotiationManager.sendNegoMessage.bind(this.negotiationManager),
      acceptClient: this.acceptClient.bind(this)
    };
    registerNegoHandler("solution", createSolutionHandler(solutionHandlerContext));

    const challengeHandlerContext = {
      sendNego: this.negotiationManager.sendNegoMessage.bind(this.negotiationManager),
      // uuidv4 is not directly needed by createChallengeHandler if sendNegoMessage handles ID generation,
      // but authHandler might still use it if it constructs messages with IDs itself.
      // The current authHandler.createChallengeHandler doesn't seem to require uuidv4 in its context
      // as sendNego (now negotiationManager.sendNegoMessage) handles ID.
      // The authHandler.ts ChallengeHandlerContext requires uuidv4.
      uuidv4: this.uuidv4.bind(this) 
    };
    registerNegoHandler("challenge", createChallengeHandler(challengeHandlerContext));
  }

  public acceptClient(cid: string, client: WebRTCClient): void {
    if (!client.trusted || !client.trusting) return;

    getAllClientCids().forEach(existingCid => {
        if (existingCid !== cid) {
            const existingClientPeerObject = getDirectClient(existingCid);
            // Get the new client's USER public key from cidKeyStore
            const newClientKeys = getKeysByCid(cid);
            const newUserPublicKey = newClientKeys?.userPublicKey;

            if (existingClientPeerObject && newUserPublicKey) {
                const participantMessage: ParticipantNegoMessage = {
                    type: "participant",
                    cid: cid,
                    publicKey: newUserPublicKey // This is the user public key
                };
                this.negotiationManager.sendNegoMessage(existingClientPeerObject, participantMessage);
            }

            // Get the existing client's USER public key from cidKeyStore
            const existingClientKeys = getKeysByCid(existingCid);
            const existingUserPublicKey = existingClientKeys?.userPublicKey;
            if (existingUserPublicKey) {
                const participantMessageToNew: ParticipantNegoMessage = {
                    type: "participant",
                    cid: existingCid,
                    publicKey: existingUserPublicKey // This is the user public key
                };
                this.negotiationManager.sendNegoMessage(client, participantMessageToNew);
            }
        }
    });

    setupTrackHandler(cid);
    setupChatChannel(cid);
    setupFileChannel(cid);
    setupForwardChannel(cid);
    setupTranscriptionChannel(cid);
  }

  public sendNegoMessage(client: WebRTCClient, messageData: NegoData): void {
    this.negotiationManager.sendNegoMessage(client, messageData);
  }

  public destroyClient(cid: string): void {
    // No need to get clientState for publicKeyToAnnounce, participant.end doesn't use it.

    getAllClientCids().filter((key) => key !== cid).forEach((key) => {
      const otherClient = getDirectClient(key);
      if (otherClient) {
          const participantEndMessage: ParticipantEndNegoMessage = {
            type: 'participant.end', 
            cid: cid, 
          };
          this.negotiationManager.sendNegoMessage(otherClient, participantEndMessage);
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
    removeCidKeys(cid); // Remove keys from the new store
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
        this.negotiationManager.sendNegoMessage(client, hangupMessage);
      }
      // Destroy client (which also removes from store)
      this.destroyClient(cid);
    }

    // Reset the connection store after all clients are processed
    resetConnectionStore();
    // Reset the app state store (handlers, cleanups)
    resetAppStateStore();
    // Reset the cid key store
    resetCidKeyStore();
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
      // Pass to negotiationManager to handle
      this.negotiationManager.handleIncomingNegoMessage(e.data, cid, client);
    };

    nego_dc.onopen = () => {
      const challengeData = Math.random().toString();
      // Store the challenge data on the client object.
      client.sentChallengeData = challengeData; 
      
      const challengeMessage = {
        type: "challenge",
        data: challengeData
      } as NegoData; 
      this.negotiationManager.sendNegoMessage(client, challengeMessage);
      console.log(`Challenge sent to ${cid}: ${challengeData}`);
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
          this.negotiationManager.sendNegoMessage(client, offerMessage);
        } else if (pc?.localDescription && pc.localDescription.type === "answer" && pc.localDescription.sdp) {
          // This case might be less common here if onnegotiationneeded primarily generates offers
          const answerMessage: AnswerNegoMessage = { type: "answer", sdp: pc.localDescription.sdp };
          this.negotiationManager.sendNegoMessage(client, answerMessage);
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
