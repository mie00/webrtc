import { writable, type Writable, get } from 'svelte/store';

// Using a simple interface for peer profile, can be expanded later
export interface PeerProfile {
  userName: string | null;
}

export interface PeerProfilesState {
  profiles: Record<string, PeerProfile>; // Keyed by publicId
}

const LOCAL_STORAGE_KEY = 'peerProfilesState_v2'; // Changed key due to structure change

// Function to get initial state from localStorage or use defaults
function getInitialState(): PeerProfilesState {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedState = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (storedState) {
        const parsedState = JSON.parse(storedState);
        // Basic validation to ensure the structure is somewhat correct
        if (parsedState && typeof parsedState.profiles === 'object') {
          // Ensure all profiles have at least userName property
          for (const publicId in parsedState.profiles) { // Iterate by publicId
            if (typeof parsedState.profiles[publicId].userName === 'undefined') {
               parsedState.profiles[publicId].userName = null; // Or handle as error
            }
          }
          return parsedState;
        }
      }
    }
  } catch (error) {
    console.error('Error reading peer profiles state from localStorage:', error);
  }
  // Default initial state
  return {
    profiles: {},
  };
}

const initialState: PeerProfilesState = getInitialState();

const peerProfilesStore: Writable<PeerProfilesState> = writable(initialState);

// Subscribe to store changes and update localStorage
if (typeof window !== 'undefined' && window.localStorage) {
  peerProfilesStore.subscribe(state => {
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error writing peer profiles state to localStorage:', error);
    }
  });
}

// --- Store Actions ---

// Add or update a peer's profile, keyed by publicId
export function updatePeerProfile(publicId: string, profile: PeerProfile): void {
  peerProfilesStore.update(state => {
    const newProfiles = { ...state.profiles, [publicId]: profile };
    return { ...state, profiles: newProfiles };
  });
}

// Remove a peer's profile, keyed by publicId
export function removePeerProfile(publicId: string): void {
  peerProfilesStore.update(state => {
    const newProfiles = { ...state.profiles };
    delete newProfiles[publicId];
    return { ...state, profiles: newProfiles };
  });
}

// Reset the store to its initial empty state
export function resetPeerProfilesStore(): void {
  const defaultState: PeerProfilesState = { profiles: {} };
  peerProfilesStore.set(defaultState);
  // The subscription above will handle saving this reset state to localStorage
}

// --- Getters ---

// Get a specific peer's profile, by publicId
export function getPeerProfile(publicId: string): PeerProfile | undefined {
  return get(peerProfilesStore).profiles[publicId];
}

// Get all peer profiles, keyed by publicId
export function getAllPeerProfiles(): Record<string, PeerProfile> {
  return get(peerProfilesStore).profiles;
}

// Optional: Export the store itself if direct subscription is needed elsewhere
export { peerProfilesStore };
