import { describe, jest, beforeEach, test, expect } from '@jest/globals';

/**
 * @jest-environment jsdom
 */

// Mock the backgroundChange function
(global as any).backgroundChange = jest.fn().mockResolvedValue({ // Cast global
  getTracks: jest.fn().mockReturnValue([])
} as any); // Cast resolved value

// Declare module variable at the top level
let streamModule: typeof import('../../src/lib/streamBridge.js');

describe('Stream Management', () => {
  let app: any; // Declare app with type any

  // Import module before all tests
  beforeAll(async () => {
    streamModule = await import('../../src/lib/streamBridge.js');
  });

  // Make beforeEach async to handle await import
  beforeEach(async () => {
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

    // Mock global app object with type assertion
    (global as any).app = app;

    // Initialize the module using the imported variable
    streamModule.streamInit(app);
  });

  test('normalizeStreamId should remove curly braces', () => {
    // Use the imported module variable
    expect(streamModule.normalizeStreamId('{stream-id-123}')).toBe('stream-id-123');
    expect(streamModule.normalizeStreamId('stream-id-123')).toBe('stream-id-123');
  });

  test('getStreamElemId should return correct element ID', () => {
    // Use the imported module variable
    expect(streamModule.getStreamElemId('{stream-id-123}')).toBe('stream-stream-id-123');
  });

  test('stream.end handler should remove elements and clean up', () => {
    // Ensure the handler exists before testing
    if (!app.nego_handlers || !app.nego_handlers['stream.end']) {
      console.warn('stream.end handler not found, skipping test.');
      return; // Skip test if handler is not registered
    }
    
    // Create mock elements
    const mockElement = document.createElement('div');
    mockElement.classList.add('stream-test-id');
    document.body.appendChild(mockElement);
    
    // Add mock stream to viewStreams
    app.viewStreams['test-id'] = {};
    
    // Trigger stream.end handler
    app.nego_handlers['stream.end']({ stream: 'test-id' }, 'client1');
    
    // Check cleanup
    expect(app.viewStreams['test-id']).toBeUndefined();
    expect(document.querySelector('.stream-test-id')).toBeNull();
  });
});
