import type { WebRTCApp } from './webrtc/WebRTCApp';
// Removed Config, getDirectClientType, compressType, decompressType imports
// AppLogicState is now in appLogicStore.ts

export interface AppLogicContext {
  webRTCApp: WebRTCApp;
  // Removed config, getDirectClient, compress, decompress
  // Removed appStateStore, it will be imported directly by logic modules

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
