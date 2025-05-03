import { describe, beforeAll, beforeEach, jest, test, expect } from '@jest/globals';

/**
 * @jest-environment jsdom
 */

// Use dynamic import and point to .ts file
let file: typeof import('../../src/lib/utils/file.ts');

describe('File Utilities', () => {
  beforeAll(async () => {
    // Import the module before tests run
    file = await import('../../src/lib/utils/file');
  });

  beforeEach(() => {
    // Setup DOM mocks
    document.getElementById = jest.fn().mockReturnValue({
      addEventListener: jest.fn(),
      disabled: false
    });
    
    document.createElement = jest.fn().mockReturnValue({
      href: '',
      download: '',
      classList: {
        add: jest.fn()
      },
      appendChild: jest.fn()
    });
    
    document.createTextNode = jest.fn();
  });

  global.app = {
    clients: {
      'test-client-id': {
        dc_file: {
          send: jest.fn(),
          addEventListener: jest.fn(),
          bufferedAmount: 0
        }
      }
    }
  };

  global.URL = {
    createObjectURL: jest.fn().mockReturnValue('blob:test-url')
  };

  global.log = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('splitArrayBuffer should correctly split buffer into chunks', () => {
    // Create a test ArrayBuffer
    const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const arrayBuffer = testData.buffer;

    // Test with chunk size of 3
    const chunks = fileModule.splitArrayBuffer(arrayBuffer, 3); // Use imported module

    // Verify the chunks
    expect(chunks.length).toBe(4);
    expect(new Uint8Array(chunks[0])).toEqual(new Uint8Array([1, 2, 3]));
    expect(new Uint8Array(chunks[1])).toEqual(new Uint8Array([4, 5, 6]));
    expect(new Uint8Array(chunks[2])).toEqual(new Uint8Array([7, 8, 9]));
    expect(new Uint8Array(chunks[3])).toEqual(new Uint8Array([10]));
  });

  test('updateProgressBar should update progress element correctly', () => {
    // Setup mock element
    const mockProgressElement = {
      value: 0,
      value: 0,
      innerHTML: ''
    };
    // Use jest.spyOn to mock getElementById and cast return value
    const getElementByIdSpy = jest.spyOn(document, 'getElementById').mockReturnValue(mockProgressElement as any);

    // Call the function with test values using imported module
    fileModule.updateProgressBar('test-id', 100, () => 25); // Use imported module

    // Verify the progress was updated correctly
    expect(mockProgressElement.value).toBe(75); // (100-25)/100*100
    expect(mockProgressElement.innerHTML).toBe('75%');
    
    // Restore the original implementation
    getElementByIdSpy.mockRestore();
  });

  test('readFile should process file correctly', () => {
    // FileReader is mocked in beforeEach

    // Create a test file object (cast to File or any)
    const testFile = {
      name: 'test.txt',
      type: 'text/plain',
      size: 1024,
      slice: jest.fn().mockReturnValue(new Blob())
    } as any; // Cast to any to avoid missing File properties error

    // Call the function using imported module
    fileModule.readFile(testFile, 'test-client-id'); // Use imported module

    // Verify the file data was sent using global.app
    expect((global as any).app.clients['test-client-id'].dc_file.send).toHaveBeenCalledWith(
      expect.stringContaining('"name":"test.txt"')
    );

    // Verify the file reader was used (accessing the mocked global)
    expect((global as any).FileReader).toHaveBeenCalled();
  });
});
