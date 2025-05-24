import { EMOJIS } from '../utils/emojis.js';
import {
  addDirectClient,
  updateDirectClientState,
  updateDirectClientFingerprint,
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
  resetPeerProfilesStore,
  getPeerProfile
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


// Type definitions for local use
interface NegoMessage {
  id?: string;
  type: string;
  [key: string]: any;
}

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
    registerNegoHandler("answer", (data: any, cid: string) => {
      getDirectClient(cid)?.pc?.setRemoteDescription(data);
    });

    registerNegoHandler("offer", async (data: any, cid: string) => {
      const client = getDirectClient(cid);
      if (!client || !client.pc) return; // Check if client exists
      if (!client.polite) {
        if (client.makingOffer) return;
        if (client.pc.signalingState != "stable") return;
      }
      await client.pc.setRemoteDescription(data);
      await client.pc.setLocalDescription();
      if (client.pc.localDescription) {
        this.sendNego(client, client.pc.localDescription);
      }
    });

    registerNegoHandler("hangup", (data: any, cid: string) => {
      const client = getDirectClient(cid);
      if (client && !client.polite) {
        this.destroyClient(cid);
      } else {
        this.destroy(); // Destroy self if polite or client not found (shouldn't happen)
      }
    });

    registerNegoHandler("participant", (data: any, cid: string) => {
      // cid here is the relaying client's cid
      addParticipant(data.cid, cid); // data.cid is the new participant's CID
      if (data.profile && typeof data.profile.userName !== 'undefined') {
        updatePeerProfile(data.cid, { userName: data.profile.userName });
      }
      // No need to call handleChange here, the store update is reactive
    });

    registerNegoHandler("participant.end", (data: any, cid: string) => {
      // cid here is the relaying client's cid (though not strictly needed for removal)
      removeParticipant(data.cid); // data.cid is the participant leaving
      removePeerProfile(data.cid); // Remove profile of the participant leaving
        // No need to call handleChange here, the store update is reactive
    });

    registerNegoHandler("trusted", (data: any, cid: string) => {
      const client = getDirectClient(cid);
      if (!client) return;
      client.trusting = true;

      if (data.profile && typeof data.profile.userName !== 'undefined') {
        updatePeerProfile(cid, { userName: data.profile.userName });
      }
      this.acceptClient(cid, client);
    });

    registerNegoHandler("solution", async (data: any, cid: string) => {
      console.log("solution", data);
      // TODO: verify solution
      const verified = await true;
      if (verified) {
        const client = getDirectClient(cid);
        if (!client) return;
        client.trusted = true;

        const currentUserProfile = get(profileStore);
        const profileData = { userName: currentUserProfile.userName };
        
        this.sendNego(client, { type: "trusted", profile: profileData });
        // Store own profile for this peer as well, as they now trust us
        if (profileData.userName !== null) {
            updatePeerProfile(cid, profileData);
        }
        this.acceptClient(cid, client);
      }
    });

    registerNegoHandler("challenge", async (data: any, cid: string) => {
      console.log("challenge received from", cid, "data:", data);
      // Auth state (keys, jwt) should be retrieved from authStore via AppLogicContext or similar
      // For this example, we'll assume a way to get it.
      // This handler now relies on the UI/authStore to manage login.
      // It will only attempt to send a solution if already authenticated.

      // Placeholder for getting auth state - in a real scenario, this would come from AppLogicContext
      // which has access to authStore.
      const authState = window.authStore?.getAuthState(); // Example: direct access for simplicity here

      if (!authState || !authState.privateKeyJwk || !authState.jwt || !authState.publicKeyJwk) {
        console.warn(`Cannot respond to challenge from ${cid}: User not authenticated or keys/JWT missing.`);
        // UI should be responsible for prompting login if necessary.
        // Optionally, send a "login_required" nego message if the protocol supports it.
        // this.sendNego(getDirectClient(cid), { type: "login_required_for_challenge" });
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

        const originalChallengeContent = data.data; // The actual challenge content
        const challengeString = typeof originalChallengeContent === 'string' ? originalChallengeContent : JSON.stringify(originalChallengeContent);
        const challengeBuffer = new TextEncoder().encode(challengeString);

        const signatureBuffer = await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          privateKey,
          challengeBuffer
        );
        const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

        this.sendNego(client, {
          type: "solution",
          solution: {
            signedChallenge: signatureBase64,
            jwt: authState.jwt,
            pubKey: JSON.stringify(authState.publicKeyJwk), // Send the JWK string
            originalChallenge: originalChallengeContent
          }
        });
        console.log("Solution sent to", cid);

      } catch (error) {
        console.error("Error processing challenge and sending solution to", cid, ":", error);
        // Optionally send an error back to the challenger
        // this.sendNego(client, { type: "solution_error", error: "Failed to process challenge solution" });
      }
    });
  }

  // Removed handleCallbackAndSendSolution method

  public acceptClient(cid: string, client: WebRTCClient): void {
    if (!client.trusted || !client.trusting) return;

    // Announce self to existing clients (retrieved from store)
    getAllClientCids().forEach(existingCid => {
        if (existingCid !== cid) { // cid is the new client, existingCid is an already connected client
            const existingClientPeer = getDirectClient(existingCid);
            if (existingClientPeer) {
                // Tell existing client (existingCid) about the new client (cid)
                const newClientProfile = getPeerProfile(cid); // Profile of the newly accepted client
                this.sendNego(existingClientPeer, { type: "participant", cid: cid, profile: newClientProfile });
            }
            // Tell the new client (cid) about the existing client (existingCid)
            const existingClientKnownProfile = getPeerProfile(existingCid); // Profile of an already connected client
            this.sendNego(client, { type: "participant", cid: existingCid, profile: existingClientKnownProfile });
        }
    });

    setupTrackHandler(cid);
    setupChatChannel(cid);
    setupFileChannel(cid); // Pass app for config/context if needed, but setup uses store for client
    setupForwardChannel(cid); // Pass app for config/context if needed, but setup uses store for client
    setupTranscriptionChannel(cid);
  }

  public sendNego(client: WebRTCClient, data: NegoMessage): void {
    if (!data.id) {
      data = JSON.parse(JSON.stringify(data));
      data.id = this.uuidv4();
      if (!this.nego_messages) {
        this.nego_messages = {};
      }
      this.nego_messages[data.id] = {};
    }
    try {
      client.nego_dc?.send(JSON.stringify(data));
    } catch (e) {
      console.log("error sending data", data, "to", client, "error", e);
    }
  }

  public destroyClient(cid: string): void {
    // Notify other clients about the departure
    getAllClientCids().filter((key) => key !== cid).forEach((key) => {
      const otherClient = getDirectClient(key);
      if (otherClient) {
          this.sendNego(otherClient, {type: 'participant.end', cid: cid});
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
    removePeerProfile(cid); // Remove profile for the disconnected client
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
        // Run specific cleanups for this client *before* sending hangup/destroying
        // (This might be redundant if destroyClient handles it, but ensures order)
        // for (const cleanup of Object.values(this.cleanups)) {
        //   cleanup(cid);
        // }
        this.sendNego(client, { type: "hangup" });
      }
      // Destroy client (which also removes from store)
      this.destroyClient(cid);
    }

    // Reset the connection store after all clients are processed
    resetConnectionStore();
    // Reset the app state store (handlers, cleanups)
    resetAppStateStore();
    // Reset the peer profiles store
    resetPeerProfilesStore();
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
      const data = JSON.parse(e.data);
      if (!client.trusted || !client.trusting) {
        if (!["challenge", "solution", "trusted"].includes(data.type)) {
          console.log("ignoring message from untrusted peer", data);
          return;
        }
      }
      if (data.id in this.nego_messages) {
        return;
      }
      this.nego_messages[data.id] = {};
      console.log("got negotiation message", data);
      const handler = getNegoHandler(data.type);
      if (!handler) {
        console.log("cannot find handler for", data.type);
        return;
      }
      handler(data, cid);
    };

    nego_dc.onopen = () => {
      // send a random string challenge
      this.sendNego(client, { type: "challenge", data: Math.random().toString() });
      // Announce relayed participants known by this peer (via store) to the new client
      // This relies on the participant messages received from other peers.
      // The store state isn't directly used for signaling here.
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
        await pc?.setLocalDescription();
        if (pc?.currentLocalDescription && pc?.localDescription) {
          this.logDiff(pc.currentLocalDescription.sdp, pc.localDescription.sdp);
        }
        if (pc?.localDescription) {
          this.sendNego(client, pc.localDescription);
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
