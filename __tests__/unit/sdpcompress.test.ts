/**
 * @jest-environment jsdom
 */

describe('SDP Compression', () => {
  test('should be properly set up for testing', () => {
    expect(true).toBe(true);
  });
});
describe('SDP Compression', () => {
  // Import the functions from the module
  const originalModule = require('../../js/sdpcompress.js');
  
  // Mock the global TextEncoder and TextDecoder
  global.TextEncoder = class {
    encode(str) {
      return new Uint8Array([...str].map(c => c.charCodeAt(0)));
    }
  };
  
  global.TextDecoder = class {
    decode(arr) {
      return String.fromCharCode.apply(null, arr);
    }
  };
  
  // Mock btoa and atob functions
  global.btoa = jest.fn(str => Buffer.from(str, 'binary').toString('base64'));
  global.atob = jest.fn(str => Buffer.from(str, 'base64').toString('binary'));
  
  test('should compress and decompress SDP correctly', () => {
    // Simple SDP example
    const sdp = 'v=0\r\no=- 1234567890 1 IN IP4 127.0.0.1\r\ns=0\r\nt=0 0';
    
    // Compress the SDP
    const compressed = originalModule.compress(sdp);
    
    // Verify it's a base64 string
    expect(typeof compressed).toBe('string');
    expect(compressed.length).toBeGreaterThan(0);
    
    // Decompress and verify it matches the original
    const decompressed = originalModule.decompress(compressed);
    expect(decompressed).toBe(sdp);
  });
  
  test('should handle empty input', () => {
    // This test might fail depending on implementation
    // but it's good to check edge cases
    expect(() => {
      originalModule.compress('');
    }).not.toThrow();
  });
});
import { compress, decompress } from '../../js/sdpcompress';

describe('SDP Compression', () => {
  beforeEach(() => {
    // Setup TextEncoder and TextDecoder mocks if needed
  });

  test('compress should return empty string for empty input', () => {
    expect(compress('')).toBe('');
    expect(compress(null)).toBe('');
    expect(compress(undefined)).toBe('');
  });

  test('decompress should handle compressed data', () => {
    const original = 'v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0';
    const compressed = compress(original);
    expect(typeof compressed).toBe('string');
    expect(compressed.length).toBeGreaterThan(0);
    
    const decompressed = decompress(compressed);
    expect(decompressed).toBe(original);
  });

  test('roundtrip compression and decompression', () => {
    const testCases = [
      'v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0',
      'a=group:BUNDLE 0\r\na=extmap-allow-mixed',
      'm=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99 100 101 102 121 127 120 125 107 108 109 124 119 123 118 114 115 116'
    ];

    testCases.forEach(original => {
      const compressed = compress(original);
      const decompressed = decompress(compressed);
      expect(decompressed).toBe(original);
    });
  });
});
