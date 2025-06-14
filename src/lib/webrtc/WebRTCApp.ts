import { EMOJIS } from '../utils/emojis';
import { setCidKeys, removeCidKeys, resetCidKeyStore, getKeysByCid } from '../stores/cidKeyStore';
import type {
  NegoData,
  OfferNegoMessage,
  AnswerNegoMessage,
  ParticipantNegoMessage,
  ParticipantEndNegoMessage,
  HangupNegoMessage
} from '../../types/negoMessages';
import {
  addDirectClient,
  updateDirectClientState,
  updateDirectClientFingerprint,
  removeDirectClient,
  addParticipant,
  removeParticipant,
  resetConnectionStore,
  getDirectClient,
  getAllClientCids
} from '../stores/connectionStore';
import { getAllConfig } from '../stores/configStore';
import {
  registerNegoHandler,
  getNegoHandler,
  getAllCleanups,
  resetAppStateStore
} from '../stores/appStateStore';
import { diffChars } from 'diff';
import { streamInit } from '../app/streamLifecycle';
import { forwardInit } from '../app/forwardLifecycle';

import { setupTrackHandler } from './stream/trackHandler';
import { setupForwardChannel } from './forward/forwardChannel';
import { setupChatChannel } from './chat/setupChatChannel';
import { setupFileChannel } from './file/fileTransfer';
import { setupTranscriptionChannel } from '../media/transcriber';
import { createSolutionHandler, createChallengeHandler } from './authHandler';
import { NegotiationManager, type NegotiationManagerContext } from './negotiationManager';

export class WebRTCApp {
  private sids: Record<string, string> = {};
  private debug = false;
  private negotiationManager: NegotiationManager;
  private negotiationContext: NegotiationManagerContext;

  constructor() {
    this.negotiationContext = {
      uuidv4: this.uuidv4.bind(this),
      actualSend: (dc, data) => {
        try {
          dc?.send(data);
        } catch (e) {
          console.log('error in actualSend', data, 'to dc', dc, 'error', e);
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
      removeParticipant: removeParticipant
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

  public getCid(sid: string): string | undefined {
    return this.sids[sid];
  }

  private setupNegoHandlers(): void {
    this.negotiationManager.initializeStandardNegoHandlers();

    const solutionHandlerContext = {
      sendNego: this.negotiationManager.sendNegoMessage.bind(this.negotiationManager),
      acceptClient: this.acceptClient.bind(this)
    };
    registerNegoHandler('solution', createSolutionHandler(solutionHandlerContext));

    const challengeHandlerContext = {
      sendNego: this.negotiationManager.sendNegoMessage.bind(this.negotiationManager)
    };
    registerNegoHandler('challenge', createChallengeHandler(challengeHandlerContext));
  }

  public acceptClient(cid: string, client: WebRTCClient): void {
    if (!client.trusted || !client.trusting) return;

    getAllClientCids().forEach((existingCid: string) => {
      if (existingCid !== cid) {
        const existingClientPeerObject = getDirectClient(existingCid);
        const newClientKeys = getKeysByCid(cid);
        const newUserPublicKey = newClientKeys?.userPublicKey;

        if (existingClientPeerObject && newUserPublicKey) {
          const participantMessage: ParticipantNegoMessage = {
            type: 'participant',
            cid: cid,
            publicKey: newUserPublicKey
          };
          this.negotiationManager.sendNegoMessage(existingClientPeerObject, participantMessage);
        }

        const existingClientKeys = getKeysByCid(existingCid);
        const existingUserPublicKey = existingClientKeys?.userPublicKey;
        if (existingUserPublicKey) {
          const participantMessageToNew: ParticipantNegoMessage = {
            type: 'participant',
            cid: existingCid,
            publicKey: existingUserPublicKey
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
    getAllClientCids()
      .filter((key: string) => key !== cid)
      .forEach((key: string) => {
        const otherClient = getDirectClient(key);
        if (otherClient) {
          const participantEndMessage: ParticipantEndNegoMessage = {
            type: 'participant.end',
            cid: cid
          };
          this.negotiationManager.sendNegoMessage(otherClient, participantEndMessage);
        }
      });

    const client = getDirectClient(cid);
    if (client) {
      if (client._transceiver_interval) {
        clearInterval(client._transceiver_interval);
        client._transceiver_interval = undefined;
      }

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

      if (client.pc) {
        const cleanups = getAllCleanups();
        for (const cleanup of Object.values(cleanups)) {
          cleanup(cid);
        }
        client.pc.close();
        client.pc = null;

        client.dc = undefined;
        client.dc_file = undefined;
        client.forward = undefined;
        client.nego_dc = undefined;
        client.file_stuff = undefined;
        client.polite = undefined;
        client.makingOffer = undefined;
      }
    }
    removeDirectClient(cid);
    removeCidKeys(cid);
    removeParticipant(cid);
  }

  public cleanup(): void {
    const cids = getAllClientCids();

    const cleanups = getAllCleanups();
    for (const cleanup of Object.values(cleanups)) {
      cleanup();
    }

    for (const cid of cids) {
      const client = getDirectClient(cid);
      if (client) {
        const hangupMessage: HangupNegoMessage = { type: 'hangup' };
        this.negotiationManager.sendNegoMessage(client, hangupMessage);
      }
      this.destroyClient(cid);
    }

    resetConnectionStore();
    resetAppStateStore();
    resetCidKeyStore();
  }

  public destroy(): void {
    this.cleanup();
    this.reset();
  }

  public reset(): void {
    window.location.href = window.location.origin + window.location.pathname;
  }

  public uuidv4(): string {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
      (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)
    );
  }

  public async initClient(polite: boolean, options: ClientInitOptions): Promise<string> {
    console.log('entered init client', options);
    const currentConfig = getAllConfig(); // Returns new Config type
    const rtcConfig = {
      iceServers: [
        ...(currentConfig.rtc.stunServers
          ?.split(',')
          .filter((link) => link)
          .map((link) => ({ urls: 'stun:' + link })) || []),
        ...(currentConfig.rtc.turnServerV2 &&
        currentConfig.rtc.turnUsername &&
        currentConfig.rtc.turnPassword
          ? [
              {
                urls: 'turn:' + currentConfig.rtc.turnServerV2,
                username: currentConfig.rtc.turnUsername,
                credential: currentConfig.rtc.turnPassword
              }
            ]
          : [])
      ]
    };

    const { sid, offer } = options;
    const cid = this.uuidv4();
    this.sids = this.sids || {};
    if (sid && sid in this.sids && getDirectClient(this.sids[sid])) {
      getDirectClient(this.sids[sid])?.pc?.restartIce();
      return this.sids[sid];
    }
    this.sids[sid] = cid;

    const pc = new RTCPeerConnection(rtcConfig);
    const client: WebRTCClient = { pc, polite, trusted: false, trusting: false };
    addDirectClient(cid, client);

    pc.onconnectionstatechange = () => {
      console.log('onconnectionstatechange', options);
      if (pc) {
        updateDirectClientState(cid, pc.connectionState, pc.iceConnectionState);
        if (pc.connectionState === 'connected' && pc.iceConnectionState === 'connected') {
          this.updateFingerprint(cid);
        }
      }
    };
    pc.oniceconnectionstatechange = () => {
      console.log('oniceconnectionstatechange', options);
      if (pc) {
        updateDirectClientState(cid, pc.connectionState, pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          pc.restartIce();
        }
        if (pc.connectionState === 'connected' && pc.iceConnectionState === 'connected') {
          this.updateFingerprint(cid);
        }
      }
    };

    const nego_dc = pc.createDataChannel('nego', {
      negotiated: true,
      id: 0
    });
    client.nego_dc = nego_dc;
    nego_dc.onclose = async (e) => {
      console.log(e);
      this.destroyClient(cid);
    };

    nego_dc.onerror = (error) => {
      console.error('Data channel error:', error, error.error);
      client.pc?.restartIce();
    };

    nego_dc.onmessage = async (e) => {
      this.negotiationManager.handleIncomingNegoMessage(e.data, cid, client);
    };

    nego_dc.onopen = () => {
      const challengeData = Math.random().toString();
      client.sentChallengeData = challengeData;

      const challengeMessage = {
        type: 'challenge',
        data: challengeData
      } as NegoData;
      this.negotiationManager.sendNegoMessage(client, challengeMessage);
      console.log(`Challenge sent to ${cid}: ${challengeData}`);
    };

    client._transceiver_interval = window.setInterval(() => {}, 10000);

    if (offer) {
      await pc.setRemoteDescription({
        type: 'offer',
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
        if (
          pc?.localDescription &&
          pc.localDescription.type === 'offer' &&
          pc.localDescription.sdp
        ) {
          const offerMessage: OfferNegoMessage = { type: 'offer', sdp: pc.localDescription.sdp };
          this.negotiationManager.sendNegoMessage(client, offerMessage);
        } else if (
          pc?.localDescription &&
          pc.localDescription.type === 'answer' &&
          pc.localDescription.sdp
        ) {
          const answerMessage: AnswerNegoMessage = { type: 'answer', sdp: pc.localDescription.sdp };
          this.negotiationManager.sendNegoMessage(client, answerMessage);
        }
      } catch (e) {
        console.log('renegotiation error', e);
      } finally {
        client.makingOffer = false;
      }
    };

    if (!offer) {
      setTimeout(() => {
        const currentClient = getDirectClient(cid);
        if (currentClient?.pc?.signalingState === 'have-local-offer') {
          this.destroyClient(cid);
        }
      }, 60 * 1000);
    }
    return cid;
  }

  public async getOffer(
    cb: (candidate: RTCIceCandidate | null) => Promise<void>,
    options: { sid: string }
  ): Promise<string> {
    console.log('WebRTCApp::getOffer', options);
    const cid = await this.initClient(false, options);
    const client = getDirectClient(cid);
    if (client?.pc) {
      client.pc.onicecandidate = async ({ candidate }: { candidate: RTCIceCandidate | null }) => {
        console.log('Candidate found (offer)', candidate);
        await cb(candidate);
      };
    }
    return cid;
  }

  public async getAnswer(
    offer: string,
    cb: (candidate: RTCIceCandidate | null) => Promise<void>,
    options: { sid: string }
  ): Promise<string> {
    const cid = await this.initClient(true, { sid: options.sid, offer });
    const client = getDirectClient(cid);
    if (client?.pc) {
      client.pc.onicecandidate = async ({ candidate }: { candidate: RTCIceCandidate | null }) => {
        console.log('Candidate found (answer)', candidate);
        await cb(candidate);
      };
    }
    return cid;
  }

  public async sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  public async genEmojis(digest: string): Promise<string> {
    if (!crypto.subtle) {
      return '❗❗❗❗❗❗❗❗';
    }
    const msgBuffer = new TextEncoder().encode(digest);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const limit =
      Math.pow(EMOJIS.length, 4) +
      Math.pow(EMOJIS.length, 3) +
      Math.pow(EMOJIS.length, 2) +
      EMOJIS.length;
    let val = 0;
    let ind = 0;
    while (val < limit && ind < hashArray.length) {
      val += Math.pow(hashArray[ind], ind + 1);
      ind += 1;
    }
    return (
      EMOJIS[val % EMOJIS.length] +
      EMOJIS[Math.floor(val / EMOJIS.length) % EMOJIS.length] +
      EMOJIS[Math.floor(val / EMOJIS.length / EMOJIS.length) % EMOJIS.length] +
      EMOJIS[Math.floor(val / EMOJIS.length / EMOJIS.length / EMOJIS.length) % EMOJIS.length]
    );
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
        const color = part.added ? 'green' : part.removed ? 'red' : 'grey';
        span = document.createElement('span');
        span.style.color = color;
        span.appendChild(document.createTextNode(part.value));
        fragment.appendChild(span);
      });
      diffs.appendChild(fragment);
    }
  }

  private async updateFingerprint(cid: string): Promise<void> {
    const client = getDirectClient(cid);
    if (!client || !client.pc) return;

    try {
      const stats = await client.pc.getStats();
      let transport: RTCTransportStats | null = null;
      let certificates: Record<string, any> = {};
      stats.forEach((stat: any) => {
        if (stat.type === 'transport') {
          transport = stat as RTCTransportStats;
        } else if (stat.type === 'certificate') {
          certificates[stat.id] = stat as any;
        }
      });

      if (transport) {
        const remoteCertId = (transport as any).remoteCertificateId;
        const localCertId = (transport as any).localCertificateId;

        if (
          localCertId &&
          remoteCertId &&
          certificates[localCertId] &&
          certificates[remoteCertId]
        ) {
          const firstCert = client.polite ? certificates[remoteCertId] : certificates[localCertId];
          const secondCert = !client.polite
            ? certificates[remoteCertId]
            : certificates[localCertId];

          if (firstCert?.fingerprint && secondCert?.fingerprint) {
            const fingerprints = firstCert.fingerprint + secondCert.fingerprint;
            const ejs = await this.genEmojis(fingerprints);
            updateDirectClientFingerprint(cid, ejs);
            console.log(`Fingerprint for ${cid}: ${ejs}`);

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
