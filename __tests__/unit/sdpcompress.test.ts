import { describe, test, expect, beforeEach } from '@jest/globals';

/**
 * @jest-environment jsdom
 */

describe('SDP Compression', () => {
  test('should be properly set up for testing', () => {
    expect(true).toBe(true);
  });
});

// Import from the .js file (as required by moduleResolution)
import { compress, decompress } from '../../src/lib/utils/sdpCompress.js';

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
