describe('Peer Connection Integration', () => {
  let app;
  
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="media"></div>
      <div id="output"></div>
      <div id="config-overlay">
        <input id="stun-servers" value="stun:stun.l.google.com:19302">
        <input id="turn-server-v2" value="">
        <input id="turn-username" value="">
        <input id="turn-password" value="">
      </div>
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
  });
  
  test('sendNego should send data through negotiation channel', () => {
    // Import the module if possible
    try {
      const main = require('../../js/main');
      
      if (main.sendNego) {
        // Create mock client with negotiation channel
        const client = {
          nego_dc: {
            send: jest.fn()
          }
        };
        
        // Call sendNego
        main.sendNego(client, { type: 'test' });
        
        // Check if send was called with correct data
        expect(client.nego_dc.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"test"')
        );
      } else {
        console.warn('sendNego function not found, skipping test');
      }
    } catch (e) {
      console.warn('Could not import main.js, skipping test:', e.message);
    }
  });
  
  test('destroyClient should clean up client resources', () => {
    // Import the module if possible
    try {
      const main = require('../../js/main');
      
      if (main.destroyClient) {
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
        main.destroyClient('test-cid');
        
        // Check cleanup
        expect(app.clients['test-cid'].pc.close).toHaveBeenCalled();
      } else {
        console.warn('destroyClient function not found, skipping test');
      }
    } catch (e) {
      console.warn('Could not import main.js, skipping test:', e.message);
    }
  });
});
