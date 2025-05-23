import type { WebRTCApp } from './webrtc/WebRTCApp.js';
import type { Config } from '../stores/configStore.js';
import type { getDirectClient as getDirectClientType } from '../stores/connectionStore.js';
import type { compress as compressType, decompress as decompressType } from './utils/sdpCompress.js';

export interface AppLogicState {
  showCopyOverlay: boolean;
  initialOverlayShown: boolean;
  copyText: string;
  qrCodeUrl: string;
  showAcceptButton: boolean;
  showJoinButton: boolean;
  showCopyButton: boolean;
  showPasteText: boolean;
  currentOfferCid: string | null;
  isDuringInitialServerLoad?: boolean; // Specific to server init path
}

export interface AppLogicContext {
  webRTCApp: WebRTCApp;
  config: Readonly<Config>;
  getDirectClient: typeof getDirectClientType;
  compress: typeof compressType;
  decompress: typeof decompressType;
  
  getState: () => AppLogicState;
  setState: (updater: Partial<AppLogicState> | ((prevState: AppLogicState) => Partial<AppLogicState>)) => void;
  
  // Helpers that App.svelte provides
  appOnId: () => void; 
  broadcastManuallyEnteredAnswer: (offer: string, answer: string) => Promise<void>;
  reportCriticalError?: (type: string, error?: any) => void; // For logic modules to signal fatal errors
}

export interface AppLogic {
  initialize(initialUrlParams: URLSearchParams): Promise<void>;
  handleOpenQrRequest(currentUrlParams: URLSearchParams): Promise<void>;
  // Optional methods if they are specific to one logic type
  handleJoin?(id: string): void;
  destroy?(): void; // Optional cleanup method
}
