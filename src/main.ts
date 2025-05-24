import { mount } from 'svelte';
import App from './App.svelte';
import { WebRTCApp } from './lib/webrtc/WebRTCApp.js';
import { authStore } from './stores/authStore.js'; // Import authStore

// Make WebRTCApp available globally
window.WebRTCApp = WebRTCApp;

// Make authStore available globally for WebRTCApp's challenge handler (temporary workaround)
// Ideally, WebRTCApp would get auth state via AppLogicContext
(window as any).authStore = authStore;


// Create a single instance of the app
const webRTCApp = new WebRTCApp();
window.webRTCApp = webRTCApp;

// Initialize the Svelte app
const targetElement = document.getElementById('app');
if (!targetElement) {
  throw new Error("Target element 'app' not found in the DOM");
}
mount(App, {
  target: targetElement
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
  sha256: (message: string) => webRTCApp.sha256(message),
  genEmojis: (digest: string) => webRTCApp.genEmojis(digest),
  logDiff: (d1: string, d2: string) => webRTCApp.logDiff(d1, d2),
  // Static methods
  reset: () => webRTCApp.reset(),
};

// Add to window for legacy code
window.addEventListener("beforeunload", () => webRTCApp.cleanup());
