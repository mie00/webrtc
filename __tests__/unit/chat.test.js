/**
 * @jest-environment jsdom
 */

describe('Chat Functionality', () => {
  beforeEach(() => {
    // Setup DOM mocks
    document.getElementById = jest.fn().mockReturnValue({
      value: 'test message',
      onkeydown: null,
      select: jest.fn()
    });
  });

  global.app = {
    clients: {
      'test-client-id': {
        pc: {
          createDataChannel: jest.fn().mockReturnValue({
            onopen: null,
            onmessage: null,
            send: jest.fn()
          })
        },
        dc: {
          send: jest.fn()
        }
      }
    }
  };

  // Import WebRTCApp and spy on its log method
  const { WebRTCApp } = require('../../js/WebRTCApp');
  jest.spyOn(WebRTCApp, 'log').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('setupChatChannel should create a data channel', () => {
    // Import the module
    const chatModule = require('../../js/chat');
    
    // Call the function
    chatModule.setupChatChannel(app, 'test-client-id');
    
    // Verify the data channel was created
    expect(app.clients['test-client-id'].pc.createDataChannel).toHaveBeenCalledWith(
      'chat',
      { negotiated: true, id: 1 }
    );
  });

  test('chat data channel should handle messages', () => {
    const chatModule = require('../../js/chat');
    
    // Call the function
    chatModule.setupChatChannel(app, 'test-client-id');
    
    // Get the data channel
    const dataChannel = app.clients['test-client-id'].pc.createDataChannel.mock.results[0].value;
    
    // Simulate a message
    dataChannel.onmessage({ data: 'test message from peer' });
    
    // Verify the message was logged using the spied WebRTCApp.log
    expect(WebRTCApp.log).toHaveBeenCalledWith('> test message from peer');
  });
});
