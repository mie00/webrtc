interface SelfieSegmentationOptions {
  modelSelection: number;
  locateFile?: (file: string) => string;
}

declare class SelfieSegmentation {
  constructor(options: SelfieSegmentationOptions);
  setOptions(options: { modelSelection: number }): void;
  onResults(callback: (results: any) => void): void;
  send(data: { image: HTMLVideoElement }): Promise<void>;
}

// Socket.io client types
declare const io: (url: string, options?: any) => any;

// QRCode library
declare class QRCode {
  constructor(element: HTMLElement, text: string);
}

// Add EMOJIS global variable used in main.js
declare const EMOJIS: string[];

interface Client {
  pc: RTCPeerConnection;
  dc?: RTCDataChannel;
  dc_file?: RTCDataChannel;
  forward?: RTCDataChannel;
  nego_dc?: RTCDataChannel;
  file_stuff?: any;
  _transceiver_interval?: number;
  polite?: boolean;
  makingOffer?: boolean;
}

interface App {
  clients: Record<string, Client>;
  streams?: Record<string, MediaStream>;
  streamConfig?: Record<string, any>;
  viewStreams?: Record<string, MediaStream>;
  config?: Record<string, string>;
  nego_messages?: Record<string, any>;
  nego_handlers: Record<string, (data: any, cid: string) => void>;
  cleanups: Record<string, (cid?: string) => void>;
  file_progress_interval?: number;
  _send_host_interval?: number;
  _last_forwarded?: string;
  allowed_host?: string;
  inited?: boolean;
  participants?: Record<string, { relay: string }>;
  sids?: Record<string, string>;
  debug?: boolean;
  bc?: BroadcastChannel;
}

declare global {
  var app: App;
  var chat: HTMLElement | null;
  var output: HTMLElement | null;
  var media: HTMLElement | null;
  var participants: HTMLElement | null;
  var uuidv4: () => string;
}

// WebRTC specific types that might be missing
interface RTCPeerConnectionIceEvent {
  candidate: RTCIceCandidate | null;
}
