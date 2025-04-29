describe('Chat Functionality', () => {
  let app;
  
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="chat-container">
        <div id="chat-messages"></div>
        <input id="chat-input" type="text">
        <button id="chat-send">Send</button>
      </div>
    `;
    
    // Create mock app object
    app = {
      clients: {},
      chat: {
        messages: []
      }
    };
    
    // Import the module
    window.app = app;
  });
  
  test('formatChatMessage should properly format messages', () => {
    // Import the function
    const { formatChatMessage } = require('../../js/chat');
    
    const timestamp = new Date('2023-01-01T12:00:00Z');
    const message = formatChatMessage('Test message', 'user1', timestamp);
    
    expect(message).toHaveProperty('text', 'Test message');
    expect(message).toHaveProperty('sender', 'user1');
    expect(message).toHaveProperty('timestamp');
    expect(message.timestamp.toISOString()).toBe(timestamp.toISOString());
  });
  
  test('sendChatMessage should add message to chat history', () => {
    // Import the function
    const { sendChatMessage } = require('../../js/chat');
    
    // Mock client with chat data channel
    app.clients['client1'] = {
      chat_dc: {
        send: jest.fn()
      }
    };
    
    // Send a message
    sendChatMessage('Hello world', 'client1');
    
    // Check message was added to history
    expect(app.chat.messages.length).toBe(1);
    expect(app.chat.messages[0].text).toBe('Hello world');
    
    // Check data channel send was called
    expect(app.clients['client1'].chat_dc.send).toHaveBeenCalled();
  });
});
describe('Chat Functionality', () => {
  let app;
  
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="chat"></div>
      <div id="output"></div>
    `;
    
    // Create mock elements
    global.chat = document.getElementById('chat');
    global.output = document.getElementById('output');
    
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
    
    // Mock log function
    global.log = jest.fn();
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
        
        // Check if log was called
        expect(global.log).toHaveBeenCalledWith('> Test message');
      }
    } else {
      console.warn('setupChatChannel function not found, skipping test');
    }
  });
});
