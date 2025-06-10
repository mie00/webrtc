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

// User-Agent Client Hints API
interface UADataBrand {
  readonly brand: string;
  readonly version: string;
}

interface NavigatorUAData {
  readonly brands: ReadonlyArray<UADataBrand>;
  readonly mobile: boolean;
  readonly platform: string;
  getHighEntropyValues(hints: string[]): Promise<Record<string, any>>;
}

// Socket.io client types
declare const io: (url: string, options?: any) => any;

// External functions used across files
declare function sendNego(client: WebRTCClient, data: any): void;
declare function getConfig(): Record<string, string>;
declare function setConfig(key: string, value: string): void;
interface BinPackResult {
  positioned: Array<{
    x: number;
    y: number;
    datum: any;
  }>;
  unpositioned: any[];
  binWidth: (width: number) => any;
  binHeight: (height: number) => any;
  addAll: (items: any[]) => void;
}

declare function BinPack(): BinPackResult;
declare function backgroundChange(videoElement: HTMLVideoElement): Promise<MediaStream>;

// QRCode library
declare class QRCode {
  constructor(element: HTMLElement, text: string);
}

// Add EMOJIS global variable used in main.js
declare const EMOJIS: string[];

interface WebRTCClient {
  pc: RTCPeerConnection | null;
  dc?: RTCDataChannel;
  dc_file?: RTCDataChannel;
  forward?: RTCDataChannel;
  nego_dc?: RTCDataChannel;
  dc_transcription?: RTCDataChannel;
  file_stuff?: any;
  _transceiver_interval?: number;
  polite?: boolean;
  makingOffer?: boolean;
  trusted: boolean;
  trusting: boolean;
  sentChallengeData?: string; // Added to store the challenge sent to this client
  // When adding new properties to this interface, make sure to:
  // 1. Update the destroyClient function in js/main.ts to clean up the new property
  // 2. Update the unit tests in __tests__/unit/main.test.js to verify cleanup
}

// Add this to HTMLVideoElement
interface HTMLVideoElement {
  substitueStream?: MediaStream;
  substitueElement?: HTMLElement;
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
}

// Stream element options
interface StreamElementOptions {
  muted?: boolean;
  controls?: boolean;
  mirrored?: boolean;
  passedElement?: HTMLVideoElement | HTMLAudioElement | null;
}

// WebRTC specific types that might be missing
interface RTCPeerConnectionIceEvent {
  readonly candidate: RTCIceCandidate | null;
}

interface ClientInitOptions {
  sid: string;
  offer?: string;
}

interface Navigator {
  readonly userAgentData?: NavigatorUAData;
}

interface Window {
  app: App & {
    recorder?: number;
    merger?: any;
    mediaRecorder?: MediaRecorder;
  };
  webRTCApp: WebRTCApp;
  WebRTCApp: typeof WebRTCApp;
  uuidv4: () => string;
  VideoStreamMerger: any;
  isFirefox?: boolean;
  authStore: typeof import('../src/stores/authStore.js').authStore; // Added for global authStore
  // verifyLoginJWT will no longer be global
}

// Assuming you already have `declare global { ... }` for __BROWSER__
// If not, wrap these in `declare global { ... }`
declare global {
  // From jest-puppeteer (ensure this is declared somewhere, often handled by preset types)
  var __BROWSER__: import('puppeteer').Browser;

  // Added for global setup/teardown
  var __SERVER_URL__: string | undefined;
  var __SERVER_PID__: number | undefined;
  var __PAGE_A__: import('puppeteer').Page | undefined;
  var __PAGE_B__: import('puppeteer').Page | undefined;
}

declare module 'diff';
