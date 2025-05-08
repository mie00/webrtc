import { mount } from 'svelte';
import App from './App.svelte';
import { WebRTCApp } from './lib/webrtc/WebRTCApp.js';

// Make WebRTCApp available globally
window.WebRTCApp = WebRTCApp;

// Create a single instance of the app
const webRTCApp = new WebRTCApp();
window.webRTCApp = webRTCApp;

// Expose it to the window for legacy code that might need it
window.app = window.app || webRTCApp.getApp();

// Initialize the Svelte app
const targetElement = document.getElementById('app');
if (!targetElement) {
  throw new Error("Target element 'app' not found in the DOM");
}
mount(App, {
  target: targetElement,
  props: {
    webRTCApp
  }
});

// For backward compatibility
// Note: `export default app;` is removed as `mount` returns an unmount function, not the instance.
export const rtcUtils = {
  webRTCApp,
  sendNego: (client: WebRTCClient, data: any) => webRTCApp.sendNego(client, data),
  destroyClient: (cid: string) => webRTCApp.destroyClient(cid),
  cleanup: () => webRTCApp.cleanup(),
  destroy: () => webRTCApp.destroy(),
  uuidv4: () => webRTCApp.uuidv4(),
  init: () => webRTCApp.init(),
  initClient: (polite: boolean, options: ClientInitOptions) => webRTCApp.initClient(polite, options),
  getOffer: (cb: (candidate: RTCIceCandidate | null) => Promise<void>, options: {sid: string}) => webRTCApp.getOffer(cb, options),
  getAnswer: (offer: string, cb: (candidate: RTCIceCandidate | null) => Promise<void>, options: {sid: string}) => webRTCApp.getAnswer(offer, cb, options),
  sha256: (message: string) => webRTCApp.sha256(message),
  genEmojis: (digest: string) => webRTCApp.genEmojis(digest),
  logDiff: (d1: string, d2: string) => webRTCApp.logDiff(d1, d2),
  // Static methods
  reset: () => webRTCApp.reset(),
  // Export the app object for testing
  _getApp: () => webRTCApp.getApp()
};

// Add to window for legacy code
window.addEventListener("beforeunload", () => webRTCApp.cleanup());
