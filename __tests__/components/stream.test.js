describe('Stream Management', () => {
  let app;
  
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '<div id="media"></div>';
    
    // Create mock app object
    app = {
      clients: {},
      streams: {},
      streamConfig: {},
      viewStreams: {},
      nego_handlers: {},
      cleanups: {}
    };
    
    // Import the module
    const { streamInit } = require('../../js/stream');
    streamInit(app);
  });
  
  test('normalizeStreamId should remove curly braces', () => {
    const { normalizeStreamId } = require('../../js/stream');
    
    expect(normalizeStreamId('{stream-id-123}')).toBe('stream-id-123');
    expect(normalizeStreamId('stream-id-123')).toBe('stream-id-123');
  });
  
  test('getStreamElemId should return correct element ID', () => {
    const { getStreamElemId } = require('../../js/stream');
    
    expect(getStreamElemId('{stream-id-123}')).toBe('stream-stream-id-123');
  });
  
  test('stream.end handler should remove elements and clean up', () => {
    // Create mock elements
    const mockElement = document.createElement('div');
    mockElement.classList.add('stream-test-id');
    document.body.appendChild(mockElement);
    
    // Add mock stream to viewStreams
    app.viewStreams['test-id'] = {};
    
    // Trigger stream.end handler
    app.nego_handlers['stream.end']({ stream: '{test-id}' }, 'client1');
    
    // Check cleanup
    expect(app.viewStreams['test-id']).toBeUndefined();
    expect(document.querySelector('.stream-test-id')).toBeNull();
  });
});
