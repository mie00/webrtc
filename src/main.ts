import { mount } from 'svelte';
import App from './App.svelte';
import { WebRTCApp } from './lib/webrtc/WebRTCApp.js';
import { authStore } from './stores/authStore.js'; // Import authStore

// Make WebRTCApp available globally
window.WebRTCApp = WebRTCApp;

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

// Add to window for legacy code
window.addEventListener('beforeunload', () => webRTCApp.cleanup());
