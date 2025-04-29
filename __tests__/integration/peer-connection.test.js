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
      config: {},
      nego_messages: {},
      cleanups: {}
    };
    
    // Import required modules
    window.app = app;
    require('../../js/main');
    require('../../js/chat');
    require('../../js/file');
    require('../../js/stream');
  });
  
  test('initClient should create a new client with data channels', async () => {
    // Get the initClient function
    const { initClient } = require('../../js/main');
    
    // Call initClient
    const cid = await initClient(true, { sid: 'test-session' });
    
    // Check client was created
    expect(app.clients[cid]).toBeDefined();
    expect(app.clients[cid].pc).toBeDefined();
    
    // Check data channels
    expect(app.clients[cid].pc.createDataChannel).toHaveBeenCalledWith('chat', expect.any(Object));
    expect(app.clients[cid].pc.createDataChannel).toHaveBeenCalledWith('file', expect.any(Object));
  });
  
  test('destroyClient should clean up client resources', () => {
    // Get the destroyClient function
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
    expect(app.clients['test-cid'].nego_dc.onclose).toBeNull();
    expect(app.clients['test-cid'].nego_dc.onmessage).toBeNull();
  });
});
