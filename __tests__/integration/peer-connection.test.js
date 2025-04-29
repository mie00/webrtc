/**
 * @jest-environment jsdom
 */

describe('Peer Connection Integration', () => {
  let app;
  
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="media"></div>
      <div id="output"></div>
      <div id="participants"></div>
      <div id="config-overlay">
        <input id="stun-servers" value="stun:stun.l.google.com:19302">
        <input id="turn-server-v2" value="">
        <input id="turn-username" value="">
        <input id="turn-password" value="">
      </div>
      <div id="toggle-controls"></div>
      <div id="control" class="left-full"></div>
    `;
    
    // Create mock app object
    app = {
      clients: {},
      streams: {},
      config: {
        "stun-servers": "stun:stun.l.google.com:19302",
        "turn-server-v2": "",
        "turn-username": "",
        "turn-password": ""
      },
      nego_messages: {},
      cleanups: {}
    };
    
    // Mock global app
    global.app = app;
    
    // Mock UUID function
    global.uuidv4 = jest.fn().mockReturnValue('test-uuid');
    
    // Mock log function
    global.log = jest.fn();
    
    // Mock getConfig function
    global.getConfig = jest.fn().mockReturnValue({
      'stun-servers': 'stun.l.google.com:19302',
      'turn-server-v2': '',
      'turn-username': '',
      'turn-password': ''
    });
    
    // Mock window
    global.window = {
      location: {
        href: 'https://example.com',
        origin: 'https://example.com',
        pathname: '/',
        host: 'example.com'
      },
      addEventListener: jest.fn()
    };
    
    // Mock crypto
    global.crypto = {
      getRandomValues: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
      subtle: {
        digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
      }
    };
    
    // Mock console
    global.console = {
      log: jest.fn(),
      error: jest.fn()
    };
    
    // Mock RTCPeerConnection
    global.RTCPeerConnection = jest.fn().mockImplementation(() => ({
      createDataChannel: jest.fn().mockReturnValue({
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
        send: jest.fn()
      }),
      close: jest.fn()
    }));
  });
  
  test('sendNego should send data through negotiation channel', () => {
    // Import the module - use require directly to avoid hoisting issues
    const { sendNego } = require('../../js/main');
    
    // Create mock client with negotiation channel
    const client = {
      nego_dc: {
        send: jest.fn()
      }
    };
    
    // Call sendNego
    sendNego(client, { type: 'test' });
    
    // Check if send was called with correct data
    expect(client.nego_dc.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"test"')
    );
  });
  
  test('destroyClient should clean up client resources', () => {
    // Import the module - use require directly to avoid hoisting issues
    const { destroyClient } = require('../../js/main');
    
    // Create a mock client
    const mockInterval = setInterval(() => {}, 1000);
    app.clients['test-cid'] = {
      nego_dc: {
        onclose: null,
        onmessage: null
      },
      _transceiver_interval: mockInterval,
      pc: {
        close: jest.fn()
      }
    };

    // Call destroyClient
    destroyClient('test-cid');
    
    // Check cleanup
    expect(app.clients['test-cid'].pc.close).toHaveBeenCalled();
  });
});
// This duplicate describe block has been removed

// This duplicate test has been removed

// This duplicate test has been removed
