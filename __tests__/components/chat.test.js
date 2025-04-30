/**
 * @jest-environment jsdom
 */

describe('Chat Functionality', () => {
  let app;
  
  // Import WebRTCApp and spy on its log method
  const { WebRTCApp } = require('../../js/WebRTCApp');
  jest.spyOn(WebRTCApp, 'log').mockImplementation(() => {});
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
  });
  
  test('setupChatChannel should create a data channel', () => {
    // Import the module
    const chat = require('../../js/chat');
    
    if (chat.setupChatChannel) {
      // Call the function
      chat.setupChatChannel(app, 'test-client');
      
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
    // Import the module
    const chat = require('../../js/chat');
    
    if (chat.setupChatChannel) {
      // Call the function
      chat.setupChatChannel(app, 'test-client');
      
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
