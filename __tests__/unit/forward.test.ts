/**
 * @jest-environment jsdom
 */

describe('Forward Channel', () => {
  beforeEach(() => {
    // Setup DOM mocks
    document.getElementById = jest.fn().mockImplementation((id) => {
      if (id === 'start-forward') {
        return {
          addEventListener: jest.fn(),
          textContent: '',
          classList: {
            add: jest.fn(),
            remove: jest.fn()
          }
        };
      } else if (id === 'media') {
        return {
          appendChild: jest.fn()
        };
      } else if (id === 'chat') {
        return {
          select: jest.fn()
        };
      } else if (id.startsWith('log-')) {
        return {
          insertBefore: jest.fn(),
          firstChild: null,
          remove: jest.fn()
        };
      }
      return null;
    });
    
    document.createElement = jest.fn().mockImplementation((tag) => {
      return {
        id: '',
        src: '',
        classList: {
          add: jest.fn()
        },
        appendChild: jest.fn(),
        innerHTML: '',
        setAttribute: jest.fn()
      };
    });
  });

  global.app = {
    clients: {
      'test-client-id': {
        pc: {
          createDataChannel: jest.fn().mockReturnValue({
            onopen: null,
            onmessage: null,
            send: jest.fn(),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn()
          })
        },
        forward: {
          send: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn()
        }
      }
    },
    cleanups: {},
    inflight: {}
  };

  global.navigator = {
    serviceWorker: {
      register: jest.fn().mockResolvedValue({}),
      ready: Promise.resolve({ then: jest.fn() }),
      controller: {
        postMessage: jest.fn()
      },
      addEventListener: jest.fn()
    }
  };

  global.MessageChannel = jest.fn().mockImplementation(() => ({
    port1: { onmessage: null }
  }));

  global.fetch = jest.fn().mockResolvedValue({
    status: 200,
    statusText: 'OK',
    headers: new Map([['Content-Type', 'text/plain']]),
    body: {
      getReader: jest.fn().mockReturnValue({
        read: jest.fn().mockResolvedValue({ done: true, value: new Uint8Array([]) })
      })
    }
  });

  global.alert = jest.fn();
  global.URL = class {
    constructor() {
      this.searchParams = {
        set: jest.fn()
      };
    }
  };
  global.window = {
    location: {
      href: 'http://example.com',
      host: 'example.com'
    },
    history: { 
      pushState: jest.fn() 
    },
    setInterval: jest.fn().mockReturnValue(123)
  };
  global.prompt = jest.fn().mockReturnValue('http://127.0.0.1:5000');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('forwardInit should set up cleanups and initial state', async () => {
    // Use dynamic import and point to .ts file
    const forwardModule = await import('../../src/lib/forwardBridge.ts');
    
    // Call the function
    forwardModule.forwardInit(app);
    
    // Verify the cleanups were set up
    expect(app.cleanups['forward']).toBeDefined();
    expect(app.allowed_host).toBeNull();
  });

  test('setupForwardChannel should create a data channel', async () => {
    // Use dynamic import and point to .ts file
    const forwardModule = await import('../../src/lib/forwardBridge.ts');
    
    // Call the function
    forwardModule.setupForwardChannel(app, 'test-client-id');
    
    // Verify the data channel was created
    expect(app.clients['test-client-id'].pc.createDataChannel).toHaveBeenCalledWith(
      'forward',
      { negotiated: true, id: 3 }
    );
  });

  test('concatUint8Arrays should correctly concatenate arrays', async () => {
    // Use dynamic import and point to .ts file
    const forwardModule = await import('../../src/lib/forwardBridge.ts');
    
    // Create test arrays
    const array1 = new Uint8Array([1, 2, 3]);
    const array2 = new Uint8Array([4, 5]);
    const array3 = new Uint8Array([6, 7, 8, 9]);
    
    // Call the function
    const result = forwardModule.concatUint8Arrays([array1, array2, array3]);
    
    // Verify the result
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });
});
