/**
 * @jest-environment jsdom
 */

const file = require('../../js/file.js');

describe('File Utilities', () => {
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
    const chunks = file.splitArrayBuffer(arrayBuffer, 3);
    
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
      innerHTML: ''
    };
    // Use jest.spyOn to mock getElementById
    const getElementByIdSpy = jest.spyOn(document, 'getElementById').mockReturnValue(mockProgressElement);
    
    // Call the function with test values
    file.updateProgressBar('test-id', 100, () => 25);
    
    // Verify the progress was updated correctly
    expect(mockProgressElement.value).toBe(75); // (100-25)/100*100
    expect(mockProgressElement.innerHTML).toBe('75%');
    
    // Restore the original implementation
    getElementByIdSpy.mockRestore();
  });

  test('readFile should process file correctly', () => {
    // Mock FileReader
    global.FileReader = jest.fn().mockImplementation(() => {
      return {
        onload: null,
        readAsArrayBuffer: jest.fn(function() {
          // Simulate the load event
          if (this.onload) {
            this.onload({ target: { result: new ArrayBuffer(10) } });
          }
        })
      };
    });
    
    // Create a test file
    const testFile = {
      name: 'test.txt',
      type: 'text/plain',
      size: 1024,
      slice: jest.fn().mockReturnValue(new Blob())
    };
    
    // Call the function
    file.readFile(testFile, 'test-client-id');
    
    // Verify the file data was sent
    expect(app.clients['test-client-id'].dc_file.send).toHaveBeenCalledWith(
      expect.stringContaining('"name":"test.txt"')
    );
    
    // Verify the file reader was used
    expect(FileReader).toHaveBeenCalled();
  });
});
