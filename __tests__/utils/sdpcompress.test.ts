import { describe, beforeEach, jest, test, expect } from '@jest/globals';

/**
 * @jest-environment jsdom
 */

describe('SDP Compression', () => {
  beforeEach(() => {
    // Import the module for each test to ensure clean state
    jest.resetModules();
    
    // Add TextEncoder and TextDecoder polyfills if they don't exist
    if (typeof global.TextEncoder === 'undefined') {
      global.TextEncoder = require('util').TextEncoder;
    }
    if (typeof global.TextDecoder === 'undefined') {
      global.TextDecoder = require('util').TextDecoder;
    }
  });

  test('compress and decompress should be reversible', async () => {
    // Import the functions - Use dynamic import and point to .ts file
    const { compress, decompress } = await import('../../src/lib/utils/sdpCompress');
    
    const sampleSDP = `v=0
o=- 1234567890 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
m=video 9 UDP/TLS/RTP/SAVPF 96 97
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0`;
    
    const compressed = compress(sampleSDP);
    expect(compressed).toBeTruthy();
    
    const decompressed = decompress(compressed);
    
    // Normalize whitespace before comparison
    const normalizedDecompressed = decompressed.split('\n').map(line => line.trimEnd()).join('\n');
    expect(normalizedDecompressed).toBe(sampleSDP);
  });
});
