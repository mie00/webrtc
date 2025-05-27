import { getDirectClient, getAllDirectClients } from '../../stores/connectionStore'; // Adjusted path
import { addMessage } from '../../stores/chatStore'; // Adjusted path

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
