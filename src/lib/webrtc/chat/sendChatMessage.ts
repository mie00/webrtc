import { getAllDirectClients } from '../../stores/connectionStore'; // Adjusted path
import { addMessage } from '../../stores/chatStore'; // Adjusted path

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
