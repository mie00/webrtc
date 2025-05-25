// Base message structure
export interface BaseNegoMessage {
  id?: string; // Optional on send, will be added by sendNego
  type: string; // Discriminant
}

// WebRTC Signaling Messages
export interface OfferNegoMessage extends BaseNegoMessage {
  type: "offer";
  sdp?: string; // sdp is part of RTCSessionDescriptionInit
}

export interface AnswerNegoMessage extends BaseNegoMessage {
  type: "answer";
  sdp?: string; // sdp is part of RTCSessionDescriptionInit
}

// Lifecycle Messages
export interface HangupNegoMessage extends BaseNegoMessage {
  type: "hangup";
}

// Participant Management Messages
export interface ParticipantNegoMessage extends BaseNegoMessage {
  type: "participant";
  cid: string;
  publicKey: string | null;
}

export interface ParticipantEndNegoMessage extends BaseNegoMessage {
  type: "participant.end";
  cid: string;
}

// Trust and Authentication Messages
export interface TrustedNegoMessage extends BaseNegoMessage {
  type: "trusted";
}

export interface ChallengeNegoMessage extends BaseNegoMessage {
  type: "challenge";
  data: string; // The random challenge string
}

export interface SolutionNegoMessage extends BaseNegoMessage {
  type: "solution";
  solution: {
    signedChallenge: string;
    jwt: string;
    pubKey: string; // JWK string
    userPubKey: string;
    originalChallenge: any; // Can be string or other JSON type from original challenge
  };
  profile: {
    userName: string;
  };
}

// Stream Management Messages
export interface StreamEndNegoMessage extends BaseNegoMessage {
  type: "stream.end";
  stream: string; // Normalized stream ID
}

// Union of all Nego Messages that can be sent/received
// This helps ensure that sendNego and onmessage handlers deal with known structures.
export type NegoData =
  | OfferNegoMessage
  | AnswerNegoMessage
  | HangupNegoMessage
  | ParticipantNegoMessage
  | ParticipantEndNegoMessage
  | TrustedNegoMessage
  | ChallengeNegoMessage
  | SolutionNegoMessage
  | StreamEndNegoMessage;

// For registerNegoHandler and getNegoHandler's type safety
export interface NegoMessageMap {
  "offer": OfferNegoMessage;
  "answer": AnswerNegoMessage;
  "hangup": HangupNegoMessage;
  "participant": ParticipantNegoMessage;
  "participant.end": ParticipantEndNegoMessage;
  "trusted": TrustedNegoMessage;
  "challenge": ChallengeNegoMessage;
  "solution": SolutionNegoMessage;
  "stream.end": StreamEndNegoMessage;
}

export type NegoMessageType = keyof NegoMessageMap;
