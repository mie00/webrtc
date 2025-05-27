import { writable, get } from 'svelte/store';

// Chat state interface
export interface ChatState {
  messages: Array<{
    text: string;
    sender: string; // Display name
    timestamp: number;
    cid?: string; // Added: CID of the sender (for received messages)
  }>;
}

// Initial state
const initialState: ChatState = {
  messages: []
};

// Create the store
export const chatStore = writable<ChatState>(initialState);

// Helper functions
export function getChatState() {
  return get(chatStore);
}

// Add optional cid parameter
export function addMessage(text: string, sender: string, cid?: string): void {
  chatStore.update((state) => ({
    ...state,
    messages: [
      ...state.messages,
      {
        text,
        sender,
        timestamp: Date.now(),
        cid // Add the cid to the message object
      }
    ]
  }));
}
