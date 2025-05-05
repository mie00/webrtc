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
  chatStore.update(state => ({
    ...state,
    messages: [
      ...state.messages,
      {
        text,
        sender,
        timestamp: Date.now()
      }
    ]
  }));
}

/**
 * Initialize the chat module with the app object
 */
export function chatInit(app: App): void {
  // No longer need to subscribe here, Svelte component handles rendering
}

/**
 * Set up chat channel for a client
 */
export function setupChatChannel(app: App, cid: string): void {
  const dc = app.clients[cid].pc?.createDataChannel("chat", {
    negotiated: true,
    id: 1
  });
  if (dc) {
    app.clients[cid].dc = dc;
    
    dc.onopen = (): void => {
    };
    
    dc.onmessage = (e: MessageEvent): void => {
      try {
        // Try to parse as JSON first (for structured messages)
        const data = JSON.parse(e.data);
        if (data.type === 'chat') {
          // Determine sender name for storage. If the received sender is "You",
          // use the actual sender name received, or fallback.
          const senderName = data.sender || 'Peer'; // Use received name or fallback
          // Add to store with sender's CID
          addMessage(data.message, senderName, cid);
        } else {
          // Legacy format or unknown format - No CID available
          addMessage(e.data, 'Peer (Legacy)'); // Indicate legacy format
        }
      } catch (err) {
        // Legacy format (plain text) - No CID available
        addMessage(e.data, 'Peer (Legacy)');
      }
    };
  }
}

/**
 * Send a chat message to all connected clients
 */
export function sendChatMessage(message: string, sender: string = 'You'): void {
  if (!message.trim()) return;
  
  const app = window.app;
  
  // Add to local store
  addMessage(message, sender);
  
  // Send to all connected clients
  for (const cid in app.clients) {
    if (app.clients[cid].dc && app.clients[cid].dc.readyState === 'open') {
      try {
        // Send structured message
        app.clients[cid].dc.send(JSON.stringify({
          type: 'chat',
          message,
          sender
        }));
      } catch (err) {
        // Fallback to plain text
        app.clients[cid].dc.send(message);
      }
    }
  }
}
