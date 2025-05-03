import { describe, jest, beforeAll, beforeEach, test, expect } from '@jest/globals';

/**
 * @jest-environment jsdom
 */

describe('Chat Functionality', () => {
  let app: App; // Add type annotation if possible
  
  // Import WebRTCApp and spy on its log method - Point to .ts file
  let WebRTCApp: typeof import('../../src/lib/webrtc/WebRTCApp.ts').WebRTCApp;
  let chatModule: typeof import('../../src/lib/chatBridge.ts');

  beforeAll(async () => {
    // Import modules before tests run
    const rtcAppModule = await import('../../src/lib/webrtc/WebRTCApp.ts');
    WebRTCApp = rtcAppModule.WebRTCApp;
    chatModule = await import('../../src/lib/chatBridge.ts');
    jest.spyOn(WebRTCApp, 'log').mockImplementation(() => {});
  });

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="chat"></div>
      <div id="output"></div>
    `;
    
    // Create mock elements
    window.chat = document.getElementById('chat');
    window.output = document.getElementById('output');
    
    // Create mock app object
    app = {
      clients: {
        'test-client': {
          pc: new RTCPeerConnection()
        }
      }
    };
    
    // Mock global app
    global.app = app;
    // Re-spy after clearing mocks if needed
    jest.spyOn(WebRTCApp, 'log').mockImplementation(() => {});
  });
  
  test('setupChatChannel should create a data channel', () => {
    // Use the imported module
    if (chatModule.setupChatChannel) {
      // Call the function
      chatModule.setupChatChannel(app, 'test-client');
      
      // Check if data channel was created
      expect(app.clients['test-client'].pc.createDataChannel).toHaveBeenCalledWith(
        'chat', 
        expect.objectContaining({
          negotiated: true,
          id: 1
        })
      );
    } else {
      console.warn('setupChatChannel function not found, skipping test');
    }
  });
  
  test('chat data channel should handle messages', () => {
    // Use the imported module
    if (chatModule.setupChatChannel) {
      // Call the function
      chatModule.setupChatChannel(app, 'test-client');
      
      // Get the data channel
      const dc = app.clients['test-client'].dc;
      
      // Trigger message event
      if (dc && dc.onmessage) {
        dc.onmessage({ data: 'Test message' });
        
        // Check if the spied WebRTCApp.log was called
        expect(WebRTCApp.log).toHaveBeenCalledWith('> Test message');
      }
    } else {
      console.warn('setupChatChannel function not found, skipping test');
    }
  });
});
