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
  getAllClientCids
} from '../../stores/connectionStore.js'; // Adjust path if needed


// Type definitions for local use
interface NegoMessage {
  id?: string;
  type: string;
  [key: string]: any;
}

export class WebRTCApp {
  // Static reference to the app for static methods
  // Note: 'clients' is removed, managed by connectionStore now
  private app: App = {
    clients: {}, // This will be effectively unused, kept for App type compatibility if needed elsewhere temporarily
    nego_handlers: {},
    cleanups: {},
    nego_messages: {},
    // config: {}, // Removed - Config is managed by configStore
    viewStreams: {},
  };

  constructor() { // Removed config parameter
    // Config is now managed solely by configStore
    this.setupNegoHandlers();
  }

  // Removed updateConfig method

  private setupNegoHandlers(): void {
    this.app.nego_handlers = {
      "answer": (data: any, cid: string) => {
        getDirectClient(cid)?.pc?.setRemoteDescription(data);
      },
      "offer": async (data: any, cid: string) => {
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
      },
      "hangup": (data: any, cid: string) => {
        const client = getDirectClient(cid);
        if (client && !client.polite) {
          this.destroyClient(cid);
        } else {
          this.destroy(); // Destroy self if polite or client not found (shouldn't happen)
        }
      },
      "participant": (data: any, cid: string) => {
        // cid here is the relaying client's cid
        addParticipant(data.cid, cid);
        // No need to call handleChange here, the store update is reactive
      },
      "participant.end": (data: any, cid: string) => {
        // cid here is the relaying client's cid (though not strictly needed for removal)
        removeParticipant(data.cid);
         // No need to call handleChange here, the store update is reactive
      },
    };
  }

  public sendNego(client: WebRTCClient, data: NegoMessage): void {
    if (!data.id) {
      data = JSON.parse(JSON.stringify(data));
      data.id = this.uuidv4();
      if (!this.app.nego_messages) {
        this.app.nego_messages = {};
      }
      this.app.nego_messages[data.id] = {};
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
        if (this.app.cleanups) {
          for (const cleanup of Object.values(this.app.cleanups)) {
            cleanup(cid); // Pass cid to cleanup functions
          }
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
    removeParticipant(cid);
  }

  public cleanup(): void {
    // Get all CIDs before resetting the store
    const cids = getAllClientCids();

    // Run all general cleanup functions first
    for (const cleanup of Object.values(this.app.cleanups)) {
      cleanup(); // Call without cid for global cleanup
    }
    this.app.cleanups = {}; // Clear cleanups

    // Iterate through clients to send hangup and destroy
    for (const cid of cids) {
      const client = getDirectClient(cid);
      if (client) {
        // Run specific cleanups for this client *before* sending hangup/destroying
        // (This might be redundant if destroyClient handles it, but ensures order)
        // for (const cleanup of Object.values(this.app.cleanups)) {
        //   cleanup(cid);
        // }
        this.sendNego(client, { type: "hangup" });
      }
      // Destroy client (which also removes from store)
      this.destroyClient(cid);
    }

    // Reset the store after all clients are processed
    resetConnectionStore();
  }

  public destroy(): void {
    this.cleanup();
    const mediaElement = document.getElementById('media');
    const outputElement = document.getElementById('output');
    if (mediaElement) mediaElement.innerHTML = '';
    if (outputElement) outputElement.innerHTML = '';
    // Store updates handle reactivity, no need for handleChange
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

  public async init(): Promise<void> {
    if (this.app.inited) {
      return;
    }
    // participants are managed by the store
    // clients are managed by the store
    this.app.cleanups = {};
    this.app.inited = true;
    this.app.nego_messages = {};

    // Initialize other modules
    // Import dynamically to avoid circular dependencies
    const { streamInit } = await import('../streamBridge.js');
    const { forwardInit } = await import('../forwardBridge.js');
    const { chatInit } = await import('../chatBridge.js');
    const { fileInit } = await import('../fileBridge.js');
    streamInit(this.app);
    forwardInit(this.app);
    chatInit(this.app);
    fileInit(this.app);
  }

  public async initClient(polite: boolean, options: ClientInitOptions): Promise<string> {
    await this.init();
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
    this.app.sids = this.app.sids || {};
    // Check if a client for this sid already exists in the store
    if (sid in this.app.sids && getDirectClient(this.app.sids[sid])) {
      getDirectClient(this.app.sids[sid])?.pc?.restartIce();
      return this.app.sids[sid];
    }
    this.app.sids[sid] = cid;

    // Create the PeerConnection using config derived from the store
    const pc = new RTCPeerConnection(rtcConfig);
    // Create the client object
    const client: WebRTCClient = { pc, polite };
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
      console.error('Data channel error:', error);
      client.pc?.restartIce();
    };

    nego_dc.onmessage = async e => {
      const data = JSON.parse(e.data);
      if (data.id in this.app.nego_messages) {
        return;
      }
      this.app.nego_messages[data.id] = {};
      console.log("got negotiation message", data);
      const handler = this.app.nego_handlers[data.type];
      if (!handler) {
        console.log("cannot find handler for", data.type);
        return;
      }
      handler(data, cid);
    };

    nego_dc.onopen = () => {
      // Announce self to existing clients (retrieved from store)
      getAllClientCids().forEach(existingCid => {
          if (existingCid !== cid) {
              const existingClient = getDirectClient(existingCid);
              if (existingClient) {
                  // Tell existing client about the new client (cid)
                  this.sendNego(existingClient, { type: "participant", cid: cid });
              }
              // Tell the new client (cid) about the existing client
              this.sendNego(client, { type: "participant", cid: existingCid });
          }
      });
      // Announce relayed participants known by this peer (via store) to the new client
      // This relies on the participant messages received from other peers.
      // The store state isn't directly used for signaling here.
    };

    // Import dynamically to avoid circular dependencies
    const { setupTrackHandler } = await import('../streamBridge.js');
    const { setupForwardChannel } = await import('../forwardBridge.js');
    const { setupChatChannel } = await import('../chatBridge.js');
    const { setupFileChannel } = await import('../fileBridge.js');
    setupTrackHandler(this.app, cid);
    setupChatChannel(this.app, cid);
    setupFileChannel(this.app, cid); // Pass app for config/context if needed, but setup uses store for client
    setupForwardChannel(this.app, cid); // Pass app for config/context if needed, but setup uses store for client

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
      if (this.app.debug) {
        diffs.classList.remove('hidden');
      }
      let span: HTMLSpanElement | null = null;

      const diff = Diff.diffChars(d1, d2);
      const fragment = document.createDocumentFragment();

      diff.forEach((part) => {
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

  public static log(msg: string): void {
    const output = document.getElementById('output');
    if (output) output.innerHTML += `<br>${msg}`;
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

                      // Optional: Hide overlay/update history (consider moving this UI logic elsewhere if possible)
                      const copyOverlayElement = document.getElementById("copy-overlay");
                      if (copyOverlayElement) copyOverlayElement.classList.add('hidden');
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


  // Getter for testing and backward compatibility
  // Note: The 'clients' property within the returned App object is no longer the source of truth.
  // Use connectionStore getters (getDirectClient, getAllDirectClients) for client information.
  public getApp(): App {
    // Return a copy or a version without the actual client objects if needed
    // For now, returning the internal app state, but warn about 'clients' usage.
    return this.app;
  }
}
