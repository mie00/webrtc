import type {
  NegoData,
  NegoMessageMap,
  NegoMessageType,
  OfferNegoMessage,
  AnswerNegoMessage,
  HangupNegoMessage,
  ParticipantNegoMessage,
  ParticipantEndNegoMessage,
  TrustedNegoMessage,
  BaseNegoMessage
} from '../../types/negoMessages.js';
import type { SpecificNegoHandler } from '../../stores/appStateStore.js'; // For handler types
import type { CidKeys } from '../../stores/cidKeyStore.js';

export interface NegotiationManagerContext {
  uuidv4: () => string;
  actualSend: (dc: RTCDataChannel | undefined, data: string) => void;
  getNegoHandler: <K extends NegoMessageType>(type: K) => SpecificNegoHandler<K> | undefined;
  registerNegoHandler: <K extends NegoMessageType>(type: K, handler: SpecificNegoHandler<K>) => void;
  getDirectClient: (cid: string) => WebRTCClient | undefined;
  destroyClient: (cid: string) => void;
  destroyApp: () => void; // For polite hangup handling
  acceptClient: (cid: string, client: WebRTCClient) => void;
  setCidKeys: (cid: string, publicKey: string | null, userPublicKey: string | null) => void;
  getKeysByCid: (cid: string) => CidKeys | undefined;
  addParticipant: (cid: string, relayingClientCid: string) => void;
  removeParticipant: (cid: string) => void;
}

export class NegotiationManager {
  private nego_messages_processed: Record<string, any> = {};
  private context: NegotiationManagerContext;

  constructor(context: NegotiationManagerContext) {
    this.context = context;
  }

  public sendNegoMessage(client: WebRTCClient, messageData: NegoData): void {
    let finalMessage: NegoData & { id: string };

    if (!messageData.id) {
      finalMessage = { ...messageData, id: this.context.uuidv4() } as NegoData & { id: string };
    } else {
      finalMessage = messageData as NegoData & { id: string };
    }

    this.nego_messages_processed[finalMessage.id] = {}; // Store by ID to prevent re-processing by self

    try {
      this.context.actualSend(client.nego_dc, JSON.stringify(finalMessage));
    } catch (e) {
      console.log("error sending data", finalMessage, "to", client, "error", e);
    }
  }

  public handleIncomingNegoMessage(eventData: string, cid: string, client: WebRTCClient): void {
    const parsedData = JSON.parse(eventData) as BaseNegoMessage;

    if (!client.trusted || !client.trusting) {
      if (!["challenge", "solution", "trusted"].includes(parsedData.type)) {
        console.log("ignoring message from untrusted peer", parsedData);
        return;
      }
    }

    const messageId = String(parsedData.id);
    if (messageId in this.nego_messages_processed) {
      return; // Already processed or sent by self
    }
    this.nego_messages_processed[messageId] = {}; // Mark as processed

    console.log("got negotiation message", parsedData);

    const messageType = parsedData.type as NegoMessageType;
    const handler = this.context.getNegoHandler(messageType);

    if (!handler) {
      console.log("cannot find handler for", messageType);
      return;
    }
    handler(parsedData as NegoMessageMap[typeof messageType], cid);
  }

  public initializeStandardNegoHandlers(): void {
    this.context.registerNegoHandler("answer", (data: AnswerNegoMessage, cid: string) => {
      this.context.getDirectClient(cid)?.pc?.setRemoteDescription(data as RTCSessionDescriptionInit);
    });

    this.context.registerNegoHandler("offer", async (data: OfferNegoMessage, cid: string) => {
      const client = this.context.getDirectClient(cid);
      if (!client || !client.pc) return;
      if (!client.polite) {
        if (client.makingOffer) return;
        if (client.pc.signalingState != "stable") return;
      }
      await client.pc.setRemoteDescription(data as RTCSessionDescriptionInit);
      await client.pc.setLocalDescription();
      if (client.pc.localDescription) {
        this.sendNegoMessage(client, { type: "answer", sdp: client.pc.localDescription.sdp });
      }
    });

    this.context.registerNegoHandler("hangup", (data: HangupNegoMessage, cid: string) => {
      const client = this.context.getDirectClient(cid);
      if (client && !client.polite) {
        this.context.destroyClient(cid);
      } else {
        this.context.destroyApp(); // Destroy self if polite or client not found
      }
    });

    this.context.registerNegoHandler("participant", (data: ParticipantNegoMessage, relayingClientCid: string) => {
      const existingKeys = this.context.getKeysByCid(data.cid);
      if (data.publicKey && (!existingKeys || !existingKeys.userPublicKey)) {
        this.context.setCidKeys(data.cid, existingKeys?.publicKey || null, data.publicKey);
      }
      this.context.addParticipant(data.cid, relayingClientCid);
    });

    this.context.registerNegoHandler("participant.end", (data: ParticipantEndNegoMessage, cid: string) => {
      this.context.removeParticipant(data.cid);
    });

    this.context.registerNegoHandler("trusted", (data: TrustedNegoMessage, cid: string) => {
      const client = this.context.getDirectClient(cid);
      if (!client) return;
      client.trusting = true;
      this.context.acceptClient(cid, client);
    });
  }
}
