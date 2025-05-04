import { EMOJIS } from '../utils/emojis.js';
import {
  addDirectClient,
  updateDirectClientState,
  updateDirectClientFingerprint,
  removeDirectClient,
  addParticipant,
  removeParticipant,
  resetConnectionStore
} from '../../stores/connectionStore.js'; // Adjust path if needed


// Type definitions for local use
interface NegoMessage {
  id?: string;
  type: string;
  [key: string]: any;
}

export class WebRTCApp {
  // Static reference to the app for static methods
  private app: App = {
    clients: {},
    nego_handlers: {},
    cleanups: {},
    nego_messages: {},
    config: {},
    viewStreams: {},
  };

  constructor(config?: Record<string, string>) {
    // If config is provided, use it; otherwise it will be set later via updateConfig
    if (config) {
      this.app.config = config;
    }
    this.setupNegoHandlers();
  }
  
  /**
   * Updates the application configuration
   * @param config New configuration object
   */
  public updateConfig(config: Record<string, string>): void {
    this.app.config = config;
  }

  private setupNegoHandlers(): void {
    this.app.nego_handlers = {
      "answer": (data: any, cid: string) => {
        this.app.clients[cid].pc?.setRemoteDescription(data);
      },
      "offer": async (data: any, cid: string) => {
        const client = this.app.clients[cid];
        if (!client.polite) {
          if (client.makingOffer) return;
          if (client.pc?.signalingState != "stable") return;
        }
        await client.pc?.setRemoteDescription(data);
        await client.pc?.setLocalDescription();
        if (client.pc?.localDescription) {
          this.sendNego(client, client.pc.localDescription);
        }
      },
      "hangup": (data: any, cid: string) => {
        if (!this.app.clients[cid].polite) {
          this.destroyClient(cid);
        } else {
          this.destroy();
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
    if (!this.app.clients) {
      this.app.clients = {};
      return;
    }
    
    Object.keys(this.app.clients).filter((key) => key !== cid).forEach((key) => {
      this.sendNego(this.app.clients[key], {type: 'participant.end', cid: cid});
    });
    
    if (this.app.clients[cid]) {
      // Clear interval first to ensure it's stopped before any other cleanup
      if (this.app.clients[cid]._transceiver_interval) {
        clearInterval(this.app.clients[cid]._transceiver_interval);
        this.app.clients[cid]._transceiver_interval = undefined;
      }
      
      if (this.app.clients[cid].nego_dc) {
        this.app.clients[cid].nego_dc.onclose = null;
        this.app.clients[cid].nego_dc.onmessage = null;
        this.app.clients[cid].nego_dc.onclose = null;
      }
      
      if (this.app.clients[cid].pc) {
        if (this.app.cleanups) {
          for (const cleanup of Object.values(this.app.cleanups)) {
            cleanup(cid);
          }
        }
        this.app.clients[cid].pc.close();
        this.app.clients[cid].pc = null;
        
        // Delete each property individually for type safety
        this.app.clients[cid].dc = undefined;
        this.app.clients[cid].dc_file = undefined;
        this.app.clients[cid].forward = undefined;
        this.app.clients[cid].nego_dc = undefined;
        this.app.clients[cid].file_stuff = undefined;
        this.app.clients[cid].polite = undefined;
        this.app.clients[cid].makingOffer = undefined;
      }
      
      delete this.app.clients[cid];
    }
    // Store updates handle reactivity, no need for handleChange
    removeDirectClient(cid);
    // Also remove self from the participant list if present (might happen if announced before full cleanup)
    removeParticipant(cid);
  }

  public cleanup(): void {
    resetConnectionStore();
    for (const cid of Object.keys(this.app.clients)) {
      for (const cleanup of Object.values(this.app.cleanups)) {
        cleanup(cid);
      }
    }
    for (const cleanup of Object.values(this.app.cleanups)) {
      cleanup();
    }
    this.app.cleanups = {};
    for (const cid of Object.keys(this.app.clients)) {
      this.sendNego(this.app.clients[cid], {
        type: "hangup",
      });
      this.destroyClient(cid);
    }
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
    // participants are now managed by the store
    this.app.cleanups = {};
    this.app.clients = {};
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
    const config = {
      iceServers: [
        ...this.app.config["stun-servers"].split(',').filter(link => link).map(link => ({ urls: "stun:" + link })),
        ...(this.app.config["turn-server-v2"] && this.app.config["turn-username"] && this.app.config["turn-password"] ? [{
          urls: "turn:" + this.app.config["turn-server-v2"],
          username: this.app.config["turn-username"],
          credential: this.app.config["turn-password"],
        }] : [])
      ],
    };

    const { sid, offer } = options;
    const cid = this.uuidv4();
    this.app.sids = this.app.sids || {};
    if (sid in this.app.sids && this.app.sids[sid] in this.app.clients) {
      this.app.clients[this.app.sids[sid]].pc?.restartIce();
      return this.app.sids[sid];
    }
    this.app.sids[sid] = cid;
    this.app.clients[cid] = {
      pc: new RTCPeerConnection(config)
    };

    const pc = new RTCPeerConnection(config);
    this.app.clients[cid].pc = pc;

    this.app.clients[cid].pc.onconnectionstatechange = () => {
      const currentPc = this.app.clients[cid]?.pc;
      if (currentPc) {
        updateDirectClientState(cid, currentPc.connectionState, currentPc.iceConnectionState);
        // Trigger fingerprint update if connected
        if (currentPc.connectionState === 'connected' && currentPc.iceConnectionState === 'connected') {
          this.updateFingerprint(cid); // Call helper function
        }
      }
    };
    this.app.clients[cid].pc.oniceconnectionstatechange = () => {
      const currentPc = this.app.clients[cid]?.pc;
      if (currentPc) {
        updateDirectClientState(cid, currentPc.connectionState, currentPc.iceConnectionState);
        if (currentPc.iceConnectionState === "failed") {
          currentPc.restartIce();
        }
        // Trigger fingerprint update if connected
        if (currentPc.connectionState === 'connected' && currentPc.iceConnectionState === 'connected') {
          this.updateFingerprint(cid); // Call helper function
        }
      }
    };

    this.app.clients[cid].polite = polite;
    addDirectClient(cid, polite);

    const nego_dc = pc.createDataChannel("nego", {
      negotiated: true,
      id: 0
    });
    this.app.clients[cid].nego_dc = nego_dc;
    nego_dc.onclose = async e => {
      console.log(e);
      this.destroyClient(cid);
    }

    nego_dc.onerror = (error) => {
      console.error('Data channel error:', error);
      this.app.clients[cid].pc?.restartIce();
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
      // Announce self to existing clients
      Object.keys(this.app.clients).forEach(existingCid => {
          if (existingCid !== cid) {
              // Tell existing client about the new client (cid)
              this.sendNego(this.app.clients[existingCid], { type: "participant", cid: cid });
              // Tell the new client (cid) about the existing client
              this.sendNego(this.app.clients[cid], { type: "participant", cid: existingCid });
          }
      });
      // Announce relayed participants known by this peer to the new client
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
    setupFileChannel(this.app, cid);
    setupForwardChannel(this.app, cid);

    this.app.clients[cid]._transceiver_interval = window.setInterval(() => {
      // app.clients[cid].pc.addTransceiver('audio', {direction: "recvonly"});
      // app.clients[cid].pc.addTransceiver('video', {direction: "recvonly"});
    }, 10000);

    if (offer) {
      await this.app.clients[cid].pc.setRemoteDescription({
        type: "offer",
        sdp: offer.trim() + '\n'
      });
      let answer = await this.app.clients[cid].pc.createAnswer();
      await this.app.clients[cid].pc.setLocalDescription(answer);
    } else {
      const offer = await this.app.clients[cid].pc.createOffer();
      await this.app.clients[cid].pc.setLocalDescription(offer);
    }
    this.app.clients[cid].pc.onnegotiationneeded = async () => {
      this.app.clients[cid].makingOffer = true;
      try {
        await this.app.clients[cid].pc?.setLocalDescription();
        if (this.app.clients[cid].pc?.currentLocalDescription && this.app.clients[cid].pc?.localDescription) {
          this.logDiff(this.app.clients[cid].pc.currentLocalDescription.sdp, this.app.clients[cid].pc.localDescription.sdp);
        }
        if (this.app.clients[cid].pc?.localDescription) {
          this.sendNego(this.app.clients[cid], this.app.clients[cid].pc.localDescription);
        }
      } catch (e) {
        console.log("renegotiation error", e);
      } finally {
        this.app.clients[cid].makingOffer = false;
      }
    };

    if (!offer) {
      setTimeout(() => {
        if (this.app.clients[cid].pc?.signalingState === 'have-local-offer') {
          this.destroyClient(cid);
        }
      }, 60 * 1000);
    }
    return cid;
  }

  public async getOffer(cb: (candidate: RTCIceCandidate | null) => Promise<void>, options: {sid: string}): Promise<string> {
    const cid = await this.initClient(false, options);
    if (this.app.clients[cid].pc) {
        this.app.clients[cid].pc.onicecandidate = async ({ candidate }) => {
        console.log('Candidate found (offer)', candidate);
        await cb(candidate);
      };
  }
  return cid;
}

  public async getAnswer(offer: string, cb: (candidate: RTCIceCandidate | null) => Promise<void>, options: {sid: string}): Promise<string> {
    const cid = await this.initClient(true, {sid: options.sid, offer});
    if (this.app.clients[cid].pc) {
      this.app.clients[cid].pc.onicecandidate = async ({ candidate }) => {
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

  // Removed handleChange method as UI updates are now driven by the Svelte store

  private async updateFingerprint(cid: string): Promise<void> {
      const client = this.app.clients[cid];
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
  public getApp(): App {
    return this.app;
  }
}
