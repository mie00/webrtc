import { writable, type Writable } from 'svelte/store';

// Define AppLogicState interface here
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

// Define the initial state
const initialAppLogicState: AppLogicState = {
  showCopyOverlay: false,
  initialOverlayShown: false,
  copyText: '',
  qrCodeUrl: '',
  showAcceptButton: false,
  showJoinButton: false,
  showCopyButton: true,
  showPasteText: false,
  currentOfferCid: null,
  isDuringInitialServerLoad: false
};

// Create and export the writable store
export const appLogicModuleStore: Writable<AppLogicState> = writable(initialAppLogicState);

// Optional: Helper function to reset the store to its initial state if needed elsewhere
export function resetAppLogicModuleStore(): void {
  appLogicModuleStore.set(initialAppLogicState);
}
