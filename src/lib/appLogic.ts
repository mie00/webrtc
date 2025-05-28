import type { WebRTCApp } from './webrtc/WebRTCApp';
// Removed Config, getDirectClientType, compressType, decompressType imports

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

import type { Writable } from 'svelte/store';

export interface AppLogicContext {
  webRTCApp: WebRTCApp;
  // Removed config, getDirectClient, compress, decompress

  appStateStore: Writable<AppLogicState>;

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
  acceptHandler?(cidFromEvent: string | null, pasteValue: string): Promise<void>; // For client to accept pasted answer
  destroy?(): void; // Optional cleanup method
}
