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
    jest.clearAllMocks();
    // Re-spy after clearing mocks if needed, or ensure spy is set up in beforeAll
    jest.spyOn(WebRTCApp, 'log').mockImplementation(() => {});
  });

  test('setupChatChannel should create a data channel', () => {
    // Use the imported module
    chatModule.setupChatChannel(app, 'test-client-id');
    
    // Verify the data channel was created
    expect(app.clients['test-client-id'].pc.createDataChannel).toHaveBeenCalledWith(
      'chat',
      { negotiated: true, id: 1 }
    );
  });

  test('chat data channel should handle messages', () => {
    // Use the imported module
    chatModule.setupChatChannel(app, 'test-client-id');
    
    // Get the data channel
    const dataChannel = app.clients['test-client-id'].pc.createDataChannel.mock.results[0].value;
    
    // Simulate a message
    dataChannel.onmessage({ data: 'test message from peer' });
    
    // Verify the message was logged using the spied WebRTCApp.log
    expect(WebRTCApp.log).toHaveBeenCalledWith('> test message from peer');
  });
});
