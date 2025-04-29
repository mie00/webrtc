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
