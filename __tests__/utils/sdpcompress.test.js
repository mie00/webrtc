/**
 * @jest-environment jsdom
 */

describe('SDP Compression', () => {
  beforeEach(() => {
    // Import the module for each test to ensure clean state
    jest.resetModules();
  });

  test('compress and decompress should be reversible', () => {
    // Import the functions
    const { compress, decompress } = require('../../js/sdpcompress');
    
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
    expect(decompressed).toBe(sampleSDP);
  });
});
