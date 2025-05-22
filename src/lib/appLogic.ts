import type { Socket } from 'socket.io-client';
import type { WebRTCApp } from './webrtc/WebRTCApp';
import type { Config } from '../stores/configStore';
import type { getDirectClient as getDirectClientType } from '../stores/connectionStore';
import type { compress as compressType, decompress as decompressType } from './utils/sdpCompress';

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
  socket: Socket;
  config: Readonly<Config>;
  getDirectClient: typeof getDirectClientType;
  compress: typeof compressType;
  decompress: typeof decompressType;
  
  getState: () => AppLogicState;
  setState: (updater: Partial<AppLogicState> | ((prevState: AppLogicState) => Partial<AppLogicState>)) => void;
  
  // Helpers that App.svelte provides
  appOnId: () => void; 
  broadcastManuallyEnteredAnswer: (offer: string, answer: string) => Promise<void>;
}

export interface AppLogic {
  initialize(initialUrlParams: URLSearchParams): Promise<void>;
  handleOpenQrRequest(currentUrlParams: URLSearchParams): Promise<void>;
  // Optional methods if they are specific to one logic type
  handleJoin?(id: string): void; 
}
