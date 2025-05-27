import { writable, get } from 'svelte/store';
import { getDirectClient, getAllDirectClients } from '../stores/connectionStore'; // Adjust path if needed

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

/**
 * Set up chat channel for a client
 */
export function setupChatChannel(cid: string): void {
  // app might be needed for global config
  const client = getDirectClient(cid);
  if (!client || !client.pc) {
    console.error(`Client or PeerConnection not found for CID ${cid} in setupChatChannel`);
    return;
  }
  const dc = client.pc.createDataChannel('chat', {
    negotiated: true,
    id: 1
  });
  if (dc) {
    client.dc = dc; // Assign to client object from store

    dc.onopen = (): void => {};

    dc.onmessage = (e: MessageEvent): void => {
      // Try to parse as JSON first (for structured messages)
      const data = JSON.parse(e.data);
      let senderNameToStore = data.sender || 'Peer'; // Default to received name or 'Peer'

      // Add to store with sender's CID and the determined display name
      addMessage(data.message, senderNameToStore, cid);
      const clients = getAllDirectClients();
      for (const clientId in clients) {
        if (
          clientId !== cid &&
          clients[clientId].dc &&
          clients[clientId].dc.readyState === 'open'
        ) {
          try {
            // Send structured message including the sender's name from config
            clients[clientId].dc.send(
              JSON.stringify({
                type: 'chat',
                message: data.message,
                sender: data.sender
              })
            );
          } catch (err) {
            console.error(`Failed to send chat message to ${clientId}:`, err);
          }
        }
      }
    };
  }
}

/**
 * Send a chat message to all connected clients
 */
export function sendChatMessage(message: string, sender: string = 'You'): void {
  if (!message.trim()) return;

  // Add to local store (sender is 'You' or the name from config)
  addMessage(message, sender);

  // Send to all connected clients (from store)
  const clients = getAllDirectClients();
  for (const cid in clients) {
    const client = clients[cid];
    if (client.dc && client.dc.readyState === 'open') {
      try {
        // Send structured message including the sender's name from config
        client.dc.send(
          JSON.stringify({
            type: 'chat',
            message,
            sender // Send the local user's name
          })
        );
      } catch (err) {
        console.error(`Failed to send chat message to ${cid}:`, err);
        // Fallback might not be useful if JSON stringify failed
        // client.dc.send(message);
      }
    }
  }
}

export class ChatBridge {
  private chatHistory: ChatState['messages'];

  constructor() {
    this.chatHistory = [];
  }

  getChatHistory(): ChatState['messages'] {
    return [...this.chatHistory];
  }

  addMessageToHistory(message: ChatState['messages'][0]): void {
    this.chatHistory.push(message);
  }

  clearChatHistory(): void {
    this.chatHistory = [];
  }

  // Placeholder for context if needed later
  // setContext(context: any) {
  //   // this.context = context;
  // }
}
