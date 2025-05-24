import { writable, type Writable } from 'svelte/store';

export interface ProfileState {
  userName: string | null;
  isProfileComplete: boolean;
}

const initialProfileState: ProfileState = {
  userName: null,
  isProfileComplete: false, // Initially, profile is not complete
};

export const profileStore: Writable<ProfileState> = writable(initialProfileState);

// Function to update the profile and mark it as complete
export function updateUserProfile(name: string): void {
  profileStore.update(state => ({
    ...state,
    userName: name,
    isProfileComplete: true,
  }));
}

// Function to reset profile state (e.g., on logout)
export function resetProfileState(): void {
  profileStore.set(initialProfileState);
}
