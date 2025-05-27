import { compress, decompress } from './sdpCompress';

describe('sdpCompress', () => {
  it('should compress and decompress an SDP string', () => {
    const sdp = [
      'v=0',
      'o=- 1234567890 1234567890 IN IP4 127.0.0.1',
      's=-',
      't=0 0',
      'a=msid-semantic: WMS'
    ].join('\r\n');

    const compressed = compress(sdp);
    const decompressed = decompress(compressed);

    expect(decompressed).toBe(sdp);
  });
});
