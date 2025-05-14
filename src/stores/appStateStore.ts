import { writable, get } from 'svelte/store';

// Define types for handlers and cleanup functions
export type NegoHandler = (data: any, cid: string) => void | Promise<void>;
export type CleanupFunc = (cid?: string) => void;

// Define the state interface for the store
interface AppState {
  negoHandlers: Record<string, NegoHandler>;
  cleanups: Record<string, CleanupFunc>;
}

// Initial state for the store
const initialState: AppState = {
  negoHandlers: {},
  cleanups: {},
};

// Create the Svelte store
const appStateStore = writable<AppState>(initialState);

// --- Negotiation Handlers ---

/**
 * Registers a negotiation handler for a specific message type.
 * @param type - The message type (e.g., "offer", "answer").
 * @param handler - The function to handle the message.
 */
export function registerNegoHandler(type: string, handler: NegoHandler): void {
  appStateStore.update(state => ({
    ...state,
    negoHandlers: {
      ...state.negoHandlers,
      [type]: handler,
    },
  }));
}

/**
 * Retrieves a negotiation handler for a specific message type.
 * @param type - The message type.
 * @returns The handler function, or undefined if not found.
 */
export function getNegoHandler(type: string): NegoHandler | undefined {
  return get(appStateStore).negoHandlers[type];
}

// --- Cleanup Functions ---

/**
 * Registers a cleanup function.
 * @param name - A unique name for the cleanup module (e.g., "stream", "forward").
 * @param func - The cleanup function.
 */
export function registerCleanup(name: string, func: CleanupFunc): void {
  appStateStore.update(state => ({
    ...state,
    cleanups: {
      ...state.cleanups,
      [name]: func,
    },
  }));
}

/**
 * Retrieves all registered cleanup functions.
 * @returns A record of cleanup functions.
 */
export function getAllCleanups(): Record<string, CleanupFunc> {
  return get(appStateStore).cleanups;
}

// --- Store Reset ---

/**
 * Resets the app state store to its initial state.
 * This clears all registered negotiation handlers and cleanup functions.
 */
export function resetAppStateStore(): void {
  appStateStore.set(initialState);
}
