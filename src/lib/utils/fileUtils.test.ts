import { splitArrayBuffer, getMaxMessageSizeFromSdp } from './fileUtils';

describe('fileUtils', () => {
  describe('splitArrayBuffer', () => {
    it('should split an ArrayBuffer into chunks of the specified size', () => {
      const buffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
      const chunks = splitArrayBuffer(buffer, 3);
      expect(chunks.length).toBe(3);
      expect(new Uint8Array(chunks[0])).toEqual(new Uint8Array([1, 2, 3]));
      expect(new Uint8Array(chunks[1])).toEqual(new Uint8Array([4, 5, 6]));
      expect(new Uint8Array(chunks[2])).toEqual(new Uint8Array([7, 8]));
    });

    it('should handle chunk size larger than buffer', () => {
      const buffer = new Uint8Array([1, 2, 3]).buffer;
      const chunks = splitArrayBuffer(buffer, 5);
      expect(chunks.length).toBe(1);
      expect(new Uint8Array(chunks[0])).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should handle empty buffer', () => {
      const buffer = new Uint8Array([]).buffer;
      const chunks = splitArrayBuffer(buffer, 3);
      expect(chunks.length).toBe(0);
    });

    it('should handle buffer size perfectly divisible by chunk size', () => {
      const buffer = new Uint8Array([1, 2, 3, 4, 5, 6]).buffer;
      const chunks = splitArrayBuffer(buffer, 3);
      expect(chunks.length).toBe(2);
      expect(new Uint8Array(chunks[0])).toEqual(new Uint8Array([1, 2, 3]));
      expect(new Uint8Array(chunks[1])).toEqual(new Uint8Array([4, 5, 6]));
    });
  });

  describe('getMaxMessageSizeFromSdp', () => {
    it('should extract max message size from SDP string', () => {
      const sdp =
        'v=0\r\no=- 123 456 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=msid-semantic: WMS\r\na=max-message-size:65536\r\n';
      const size = getMaxMessageSizeFromSdp(sdp);
      expect(size).toBe(65536);
    });

    it('should return null if a=max-message-size is not found', () => {
      const sdp = 'v=0\r\no=- 123 456 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=msid-semantic: WMS\r\n';
      const size = getMaxMessageSizeFromSdp(sdp);
      expect(size).toBeNull();
    });

    it('should return null for empty SDP string', () => {
      const size = getMaxMessageSizeFromSdp('');
      expect(size).toBeNull();
    });

    it('should handle SDP with other attributes', () => {
      const sdp =
        'a=rtcp-mux\r\na=ice-ufrag:someufrag\r\na=max-message-size:16384\r\na=ice-pwd:somepwd';
      const size = getMaxMessageSizeFromSdp(sdp);
      expect(size).toBe(16384);
    });
  });
});
