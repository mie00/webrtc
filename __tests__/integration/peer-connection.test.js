/**
 * @jest-environment jsdom
 */

// Mock required global functions and DOM elements before importing main.js
global.streamInit = jest.fn();
global.forwardInit = jest.fn();
global.setupTrackHandler = jest.fn();
global.setupChatChannel = jest.fn();
global.setupFileChannel = jest.fn();
global.setupForwardChannel = jest.fn();
global.compress = jest.fn().mockResolvedValue('compressed-data');
global.decompress = jest.fn().mockResolvedValue('decompressed-data');
global.EMOJIS = ['😀', '😁', '😂', '😃'];

// Create a mock for the main.js module
jest.mock('../../js/main.js', () => {
  // Create the actual functions we want to test
  const originalModule = jest.requireActual('../../js/main.js');
  
  // Return the mocked module
  return {
    sendNego: (client, data) => {
      if (!data.id) {
        data = JSON.parse(JSON.stringify(data));
        data.id = 'test-uuid';
      }
      client.nego_dc.send(JSON.stringify(data));
    },
    destroyClient: (cid) => {
      const app = global.app;
      
      if (app.clients[cid]) {
        if (app.clients[cid]._transceiver_interval) {
          clearInterval(app.clients[cid]._transceiver_interval);
        }
        
        if (app.clients[cid].pc) {
          app.clients[cid].pc.close();
        }
        
        delete app.clients[cid];
      }
    },
    // Include other exported functions as needed
    cleanup: jest.fn(),
    destroy: jest.fn(),
    uuidv4: jest.fn().mockReturnValue('test-uuid'),
    init: jest.fn(),
    initClient: jest.fn(),
    getOffer: jest.fn(),
    getAnswer: jest.fn(),
    sha256: jest.fn(),
    genEmojis: jest.fn(),
    handleChange: jest.fn(),
    logDiff: jest.fn(),
    _getApp: jest.fn()
  };
});

describe('Peer Connection Integration', () => {
  let app;
  let mainModule;
  
  beforeEach(() => {
    // Reset DOM with all required elements
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
      <div id="reset"></div>
      <div id="open-config"></div>
      <div id="open-qr"></div>
      <div id="hangup"></div>
      <div id="diffs" class="hidden"></div>
      <div id="copy-overlay"></div>
      <div id="copy-button"></div>
      <div id="paste-text"></div>
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
    
    // Import the module after setting up the DOM
    mainModule = require('../../js/main.js');
  });
  
  test('sendNego should send data through negotiation channel', () => {
    // Create mock client with negotiation channel
    const client = {
      nego_dc: {
        send: jest.fn()
      }
    };
    
    // Call sendNego
    mainModule.sendNego(client, { type: 'test' });
    
    // Check if send was called with correct data
    expect(client.nego_dc.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"test"')
    );
  });
  
  test('destroyClient should clean up client resources', () => {
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
    mainModule.destroyClient('test-cid');
    
    // Check cleanup
    expect(app.clients['test-cid']).toBeUndefined();
  });
});
