import type { WebRTCClient } from '../../stores/connectionStore'; // Assuming WebRTCClient is exported here

// Type definitions for forwarding
export interface ForwardClient extends WebRTCClient {
  forward: RTCDataChannel;
}

export interface ForwardResponse {
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: Uint8Array; // Assuming body will be fully constructed before sending to service worker
  };
  data: Uint8Array[]; // Used to accumulate chunks before constructing the final body
}
