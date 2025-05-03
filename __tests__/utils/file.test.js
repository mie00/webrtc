/**
 * @jest-environment jsdom
 */

describe('File Utilities', () => {
  test('splitArrayBuffer should correctly split buffer into chunks', () => {
    const { splitArrayBuffer } = require('../../src/lib/utils/file.js'); // Updated path
    
    // Create a sample ArrayBuffer
    const buffer = new ArrayBuffer(1000);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < 1000; i++) {
      view[i] = i % 256;
    }
    
    // Split into chunks of 256 bytes
    const chunks = splitArrayBuffer(buffer, 256);
    
    // Should have 4 chunks
    expect(chunks.length).toBe(4);
    
    // Check first chunk
    const firstChunk = new Uint8Array(chunks[0]);
    expect(firstChunk.length).toBe(256);
    for (let i = 0; i < 256; i++) {
      expect(firstChunk[i]).toBe(i);
    }
    
    // Check last chunk
    const lastChunk = new Uint8Array(chunks[3]);
    expect(lastChunk.length).toBe(232); // 1000 - 3*256 = 232
  });
});
