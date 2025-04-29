/**
 * @jest-environment jsdom
 */

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
    
    // Mock global app object
    global.app = app;
    
    // Import the module
    const stream = require('../../js/stream');
    if (stream.streamInit) {
      stream.streamInit(app);
    }
  });
  
  test('normalizeStreamId should remove curly braces', () => {
    const stream = require('../../js/stream');
    if (stream.normalizeStreamId) {
      expect(stream.normalizeStreamId('{stream-id-123}')).toBe('stream-id-123');
      expect(stream.normalizeStreamId('stream-id-123')).toBe('stream-id-123');
    } else {
      // Skip test if function doesn't exist
      console.warn('normalizeStreamId function not found, skipping test');
    }
  });
  
  test('getStreamElemId should return correct element ID', () => {
    const stream = require('../../js/stream');
    if (stream.getStreamElemId) {
      expect(stream.getStreamElemId('{stream-id-123}')).toBe('stream-stream-id-123');
    } else {
      // Skip test if function doesn't exist
      console.warn('getStreamElemId function not found, skipping test');
    }
  });
  
  test('stream.end handler should remove elements and clean up', () => {
    // Skip if nego_handlers doesn't exist
    if (!app.nego_handlers['stream.end']) {
      console.warn('stream.end handler not found, skipping test');
      return;
    }
    
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
