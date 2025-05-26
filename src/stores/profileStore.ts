import { writable, type Writable } from 'svelte/store';

export interface ProfileState {
  userName: string | null;
  isProfileComplete: boolean;
}

const LOCAL_STORAGE_KEY = 'profileState';

// Function to get initial state from localStorage or use defaults
function getInitialState(): ProfileState {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedState = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (storedState) {
        const parsedState = JSON.parse(storedState);
        // Basic validation to ensure the structure is somewhat correct
        if (typeof parsedState.isProfileComplete === 'boolean') {
          return parsedState;
        }
      }
    }
  } catch (error) {
    console.error('Error reading profile state from localStorage:', error);
    // Fallback to default if error or invalid data
  }
  return {
    userName: null,
    isProfileComplete: false // Initially, profile is not complete
  };
}

const initialProfileState: ProfileState = getInitialState();

export const profileStore: Writable<ProfileState> = writable(initialProfileState);

// Subscribe to store changes and update localStorage
if (typeof window !== 'undefined' && window.localStorage) {
  profileStore.subscribe((state) => {
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error writing profile state to localStorage:', error);
    }
  });
}

// Function to update the profile and mark it as complete
export function updateUserProfile(name: string): void {
  profileStore.update((state) => ({
    ...state,
    userName: name,
    isProfileComplete: true
  }));
}

// Function to reset profile state (e.g., on logout)
export function resetProfileState(): void {
  const defaultState: ProfileState = {
    userName: null,
    isProfileComplete: false
  };
  profileStore.set(defaultState);
  // The subscription above will handle saving this reset state to localStorage
}
