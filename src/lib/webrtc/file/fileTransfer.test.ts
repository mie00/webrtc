import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { setupFileChannel, sendFile } from './fileTransfer';
import {
  getDirectClient,
  getAllClientCids,
  getAllDirectClients
} from '../../stores/connectionStore';
import { addFileTransfer, updateFileTransfer } from '../../stores/fileStore';
import { splitArrayBuffer, getMaxMessageSizeFromSdp } from '../../utils/fileUtils';

// Mock dependencies
vi.mock('../../stores/connectionStore');
vi.mock('../../stores/fileStore');
vi.mock('../../utils/fileUtils');

// Mock browser APIs
const mockCreateObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;

// Mock Math.random for predictable transfer IDs
vi.spyOn(Math, 'random').mockReturnValue(0.123456789); // Ensures transferId is '1f9add3f0c9a5'

class MockRTCDataChannel {
  label: string;
  options: RTCDataChannelInit | undefined;
  readyState: RTCDataChannelState = 'open';
  onmessage: ((this: RTCDataChannel, ev: MessageEvent) => any) | null = null;
  onopen: ((this: RTCDataChannel, ev: Event) => any) | null = null;
  onclose: ((this: RTCDataChannel, ev: Event) => any) | null = null;
  onerror: ((this: RTCDataChannel, ev: Event) => any) | null = null;
  onbufferedamountlow: ((this: RTCDataChannel, ev: Event) => any) | null = null;
  onclosing: ((this: RTCDataChannel, ev: Event) => any) | null = null;
  bufferedAmount: number = 0;
  bufferedAmountLowThreshold: number = 0;
  binaryType: BinaryType = 'arraybuffer';
  id: number | null;
  maxPacketLifeTime: number | null;
  maxRetransmits: number | null;
  negotiated: boolean;
  ordered: boolean;
  protocol: string = '';
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn<(event: Event) => boolean>();
  send = vi.fn();
  close = vi.fn();

  constructor(label: string, options?: RTCDataChannelInit) {
    this.label = label;
    this.options = options;
    this.id = options?.id ?? null;
    this.maxPacketLifeTime = options?.maxPacketLifeTime ?? null;
    this.maxRetransmits = options?.maxRetransmits ?? null;
    this.negotiated = options?.negotiated ?? false;
    this.ordered = options?.ordered ?? true;
  }

  // Helper to simulate receiving a message
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }) as MessageEvent);
    }
  }
}

class MockRTCPeerConnection {
  createDataChannel = vi.fn();
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  // Add other methods/properties if needed by the code under test
}

describe('fileTransfer', () => {
  let mockClient: any;
  let mockDcFile: MockRTCDataChannel;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDcFile = new MockRTCDataChannel('file', { negotiated: true, id: 2 });
    mockClient = {
      pc: new MockRTCPeerConnection(),
      dc_file: null, // Will be set by setupFileChannel
      file_stuff: undefined
    };

    (getDirectClient as Mock).mockReturnValue(mockClient);
    (getAllClientCids as Mock).mockReturnValue(['client-1']);
    (getAllDirectClients as Mock).mockReturnValue({ 'client-1': mockClient });
    (mockClient.pc.createDataChannel as Mock).mockReturnValue(mockDcFile);
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
    (getMaxMessageSizeFromSdp as Mock).mockReturnValue(16 * 1024); // Default chunk size
    (splitArrayBuffer as Mock).mockImplementation((buffer: ArrayBuffer, _chunkSize: number) => [
      buffer
    ]); // Simple mock
  });

  describe('setupFileChannel', () => {
    it('should create a file data channel and assign it to the client', () => {
      setupFileChannel('client-1');
      expect(mockClient.pc.createDataChannel).toHaveBeenCalledWith('file', {
        negotiated: true,
        id: 2
      });
      expect(mockClient.dc_file).toBe(mockDcFile);
      expect(mockDcFile.onmessage).toBeInstanceOf(Function);
    });

    it('should handle incoming metadata message', () => {
      setupFileChannel('client-1');
      const metadata = { name: 'test.txt', type: 'text/plain', size: 100 };
      mockDcFile.simulateMessage(JSON.stringify(metadata));

      expect(addFileTransfer).toHaveBeenCalledWith({
        id: '1f9add3f0c9a5', // Based on Math.random mock
        name: 'test.txt',
        type: 'text/plain',
        size: 100,
        progress: 0,
        status: 'receiving',
        timestamp: expect.any(Number),
        senderCid: 'client-1'
      });
      expect(mockClient.file_stuff).toEqual({
        fileName: 'test.txt',
        fileType: 'text/plain',
        fileSize: 100,
        transferId: '1f9add3f0c9a5',
        senderCid: 'client-1',
        receiverCid: '',
        chunks: [],
        receivedSize: 0
      });
    });

    it('should handle incoming data chunk message', () => {
      setupFileChannel('client-1');
      const metadata = { name: 'test.txt', type: 'text/plain', size: 100 };
      mockDcFile.simulateMessage(JSON.stringify(metadata)); // Send metadata first

      const chunk = new ArrayBuffer(50);
      mockDcFile.simulateMessage(chunk);

      expect(updateFileTransfer).toHaveBeenCalledWith('1f9add3f0c9a5', {
        progress: 50, // 50 / 100 * 100
        status: 'receiving'
      });
      expect(mockClient.file_stuff.receivedSize).toBe(50);
      expect(mockClient.file_stuff.chunks).toEqual([chunk]);
    });

    it('should handle complete file reception (metadata + chunks)', () => {
      setupFileChannel('client-1');
      const metadata = { name: 'test.txt', type: 'text/plain', size: 100 };
      mockDcFile.simulateMessage(JSON.stringify(metadata));

      const chunk1 = new ArrayBuffer(50);
      mockDcFile.simulateMessage(chunk1);
      expect(updateFileTransfer).toHaveBeenCalledWith('1f9add3f0c9a5', {
        progress: 50,
        status: 'receiving'
      });

      const chunk2 = new ArrayBuffer(50);
      mockDcFile.simulateMessage(chunk2);
      expect(updateFileTransfer).toHaveBeenCalledWith('1f9add3f0c9a5', {
        progress: 100,
        status: 'complete',
        url: 'blob:mock-url'
      });
      expect(mockClient.file_stuff).toBeUndefined(); // Reset after completion
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });

    it('should handle empty file reception', () => {
      setupFileChannel('client-1');
      const metadata = { name: 'empty.txt', type: 'text/plain', size: 0 };
      mockDcFile.simulateMessage(JSON.stringify(metadata));

      expect(addFileTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'empty.txt',
          size: 0,
          progress: 100, // Empty file is immediately 100%
          status: 'receiving' // Initial status
        })
      );

      // The update for completion happens in the same metadata handling block
      expect(updateFileTransfer).toHaveBeenCalledWith('1f9add3f0c9a5', {
        progress: 100,
        status: 'complete',
        url: 'blob:mock-url' // URL.createObjectURL is called with new Blob([])
      });
      expect(mockClient.file_stuff).toBeUndefined(); // Reset after completion
      expect(mockCreateObjectURL).toHaveBeenCalledWith(new Blob([], { type: 'text/plain' }));
    });

    it('should forward messages to other clients if dc_file exists and is open', () => {
      const mockOtherClient = {
        pc: new MockRTCPeerConnection(),
        dc_file: new MockRTCDataChannel('file-other')
      };
      (getAllDirectClients as Mock).mockReturnValue({
        'client-1': mockClient,
        'client-2': mockOtherClient
      });

      setupFileChannel('client-1'); // Sets up dc_file for client-1

      const messageData = JSON.stringify({ name: 'test.txt', type: 'text/plain', size: 100 });
      mockDcFile.simulateMessage(messageData); // Message received on client-1's dc_file

      // Expect client-2's dc_file.send to be called with the data
      expect(mockOtherClient.dc_file.send).toHaveBeenCalledWith(messageData);
    });

    it('should not forward messages if other client dc_file is not open or does not exist', () => {
      const mockOtherClientNoDc = { pc: new MockRTCPeerConnection(), dc_file: null };
      const mockOtherClientClosedDc = {
        pc: new MockRTCPeerConnection(),
        dc_file: new MockRTCDataChannel('file-other')
      };
      mockOtherClientClosedDc.dc_file.readyState = 'closed';
      (getAllDirectClients as Mock).mockReturnValue({
        'client-1': mockClient,
        'client-2-no-dc': mockOtherClientNoDc,
        'client-3-closed-dc': mockOtherClientClosedDc
      });

      setupFileChannel('client-1');

      const messageData = JSON.stringify({ name: 'test.txt', type: 'text/plain', size: 100 });
      mockDcFile.simulateMessage(messageData);

      expect(mockOtherClientNoDc.pc.createDataChannel).not.toHaveBeenCalled(); // dc_file is null
      expect(mockOtherClientClosedDc.dc_file.send).not.toHaveBeenCalled(); // dc_file is closed
    });

    it('should log a warning for unexpected string message after metadata', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      setupFileChannel('client-1');
      const metadata = { name: 'test.txt', type: 'text/plain', size: 100 };
      mockDcFile.simulateMessage(JSON.stringify(metadata)); // Metadata
      mockDcFile.simulateMessage('unexpected string data'); // Unexpected string

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `Received unexpected string message for client client-1 after file metadata:`,
        'unexpected string data'
      );
      consoleWarnSpy.mockRestore();
    });

    it('should log a warning for unexpected file data message if file_stuff is not defined', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      setupFileChannel('client-1');
      // No metadata sent, so client.file_stuff is undefined
      const chunk = new ArrayBuffer(50);
      mockDcFile.simulateMessage(chunk);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `Received unexpected file data message for client client-1:`,
        chunk,
        'currentClient.file_stuff:',
        undefined
      );
      consoleWarnSpy.mockRestore();
    });
  });

  describe('sendFile', () => {
    let mockFile: File;

    beforeEach(() => {
      mockFile = new File(['file content'], 'test-file.txt', { type: 'text/plain' });
      // Mock FileReader
      global.FileReader = vi.fn().mockImplementation(() => ({
        readAsArrayBuffer: vi.fn(),
        onload: null,
        onerror: null,
        result: null
      })) as any;
    });

    it('should add file transfer and attempt to read and send file', async () => {
      // Mock FileReader behavior for this test
      const mockReaderInstance = {
        readAsArrayBuffer: vi.fn(),
        onload: null as ((e: ProgressEvent<FileReader>) => void) | null,
        onerror: null,
        result: new ArrayBuffer(mockFile.size) // Simulate successful read
      };
      (global.FileReader as Mock<new (...args: any[]) => any>).mockImplementation(
        () => mockReaderInstance
      );

      // Simulate async read completion
      mockReaderInstance.readAsArrayBuffer.mockImplementation(function (this: any, _blob: Blob) {
        // `this` is the reader instance
        if (this.onload) {
          // @ts-ignore
          this.onload({ target: { result: this.result } } as ProgressEvent<FileReader>);
        }
      });

      // Ensure dc_file is set up on the client
      setupFileChannel('client-1'); // This sets mockClient.dc_file
      mockClient.dc_file.readyState = 'open'; // Ensure it's open

      await sendFile(mockFile);

      expect(addFileTransfer).toHaveBeenCalledWith({
        id: '1f9add3f0c9a5',
        name: mockFile.name,
        type: mockFile.type,
        size: mockFile.size,
        progress: 0,
        status: 'sending',
        url: 'blob:mock-url',
        timestamp: expect.any(Number)
      });

      // Check if metadata was sent
      expect(mockClient.dc_file.send).toHaveBeenCalledWith(
        JSON.stringify({ name: mockFile.name, type: mockFile.type, size: mockFile.size })
      );
      // Check if data chunk was sent (splitArrayBuffer mock returns the whole buffer as one chunk)
      expect(mockClient.dc_file.send).toHaveBeenCalledWith(mockReaderInstance.result);

      expect(updateFileTransfer).toHaveBeenCalledWith('1f9add3f0c9a5', {
        progress: 100,
        status: 'complete'
      });
    });

    it('should update status to error if no clients are available', async () => {
      (getAllClientCids as Mock).mockReturnValue([]); // No clients

      await sendFile(mockFile);

      expect(addFileTransfer).toHaveBeenCalled(); // Still adds the transfer initially
      expect(updateFileTransfer).toHaveBeenCalledWith('1f9add3f0c9a5', {
        status: 'error',
        error: 'No connected clients with file channel.'
      });
    });

    it('should update status to error if readFile throws an error', async () => {
      // Ensure dc_file is set up on the client
      setupFileChannel('client-1');
      mockClient.dc_file.readyState = 'open';

      // Mock FileReader to throw an error
      const mockReaderInstance = {
        readAsArrayBuffer: vi.fn(),
        onload: null,
        onerror: null as ((e: ProgressEvent<FileReader>) => void) | null,
        result: null,
        error: new Error('FileReader failed')
      };
      (global.FileReader as Mock<new (...args: any[]) => any>).mockImplementation(
        () => mockReaderInstance
      );
      mockReaderInstance.readAsArrayBuffer.mockImplementation(function (this: any, _blob: Blob) {
        if (this.onerror) {
          // @ts-ignore
          this.onerror({} as ProgressEvent<FileReader>); // Simulate error event
        }
      });

      await sendFile(mockFile);

      expect(addFileTransfer).toHaveBeenCalled();
      expect(updateFileTransfer).toHaveBeenCalledWith('1f9add3f0c9a5', {
        status: 'error',
        error: expect.stringContaining('Failed for 1 client(s): FileReader failed')
      });
    });

    it('should use dynamic SEND_CHUNK_SIZE based on SDP if available', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      setupFileChannel('client-1');
      mockClient.dc_file.readyState = 'open';
      mockClient.pc.localDescription = { sdp: 'a=max-message-size:262144', type: 'offer' }; // 256KB
      mockClient.pc.remoteDescription = { sdp: 'a=max-message-size:65536', type: 'answer' }; // 64KB
      (getMaxMessageSizeFromSdp as Mock).mockImplementation((sdp: string) => {
        if (sdp.includes('262144')) return 262144;
        if (sdp.includes('65536')) return 65536;
        return null;
      });

      // Mock FileReader to succeed
      const mockReaderInstance = {
        readAsArrayBuffer: vi.fn(),
        onload: null as ((e: ProgressEvent<FileReader>) => void) | null,
        result: new ArrayBuffer(mockFile.size)
      };
      (global.FileReader as Mock<new (...args: any[]) => any>).mockImplementation(
        () => mockReaderInstance
      );
      mockReaderInstance.readAsArrayBuffer.mockImplementation(function (this: any, _blob: Blob) {
        if (this.onload) {
          // @ts-ignore
          this.onload({ target: { result: this.result } });
        }
      });

      await sendFile(mockFile);

      expect(getMaxMessageSizeFromSdp).toHaveBeenCalledWith(mockClient.pc.localDescription.sdp);
      expect(getMaxMessageSizeFromSdp).toHaveBeenCalledWith(mockClient.pc.remoteDescription.sdp);
      // Effective max is Math.min(262144, 65536) = 65536
      expect(consoleLogSpy).toHaveBeenCalledWith(
        `Using dynamic SEND_CHUNK_SIZE: 65536 bytes (based on SDP max: 65536)`
      );

      // splitArrayBuffer would be called with this chunk size
      // We need to refine the splitArrayBuffer mock if we want to test chunking logic deeply
      // For now, just checking the log is sufficient for this specific test.

      consoleLogSpy.mockRestore();
    });

    it('should handle waitForBufferDrain when bufferedAmount is high', async () => {
      setupFileChannel('client-1');
      mockClient.dc_file.readyState = 'open';
      mockClient.dc_file.bufferedAmount = 200 * 1024; // Higher than HIGH_WATER_MARK (128KB / 8 = 16KB in default test)
      // HIGH_WATER_MARK is 0.125 * 1024 * 1024 = 131072
      // Let's adjust the mock to be 128 * 1024 for HIGH_WATER_MARK
      // The code uses 0.125 * 1024 * 1024 which is 131072

      // Mock FileReader
      const fileContent = new Uint8Array(200 * 1024).fill(0); // 200KB file
      mockFile = new File([fileContent.buffer], 'large-file.bin', {
        type: 'application/octet-stream'
      });
      const mockReaderInstance = {
        readAsArrayBuffer: vi.fn(),
        onload: null as ((e: ProgressEvent<FileReader>) => void) | null,
        result: fileContent.buffer
      };
      (global.FileReader as Mock<new (...args: any[]) => any>).mockImplementation(
        () => mockReaderInstance
      );
      mockReaderInstance.readAsArrayBuffer.mockImplementation(function (this: any, _blob: Blob) {
        if (this.onload) {
          // @ts-ignore
          this.onload({ target: { result: this.result } });
        }
      });

      // Mock splitArrayBuffer to create multiple small chunks
      const smallChunkSize = 16 * 1024;
      (splitArrayBuffer as Mock).mockImplementation((buffer: ArrayBuffer, _chunkSize: number) => {
        const chunks: ArrayBuffer[] = [];
        for (let i = 0; i < buffer.byteLength; i += smallChunkSize) {
          chunks.push(buffer.slice(i, Math.min(i + smallChunkSize, buffer.byteLength)));
        }
        return chunks;
      });

      // Mock addEventListener for 'bufferedamountlow'
      let bufferedAmountLowCallback: (() => void) | null = null;
      mockClient.dc_file.addEventListener.mockImplementation((event: string, cb: () => void) => {
        if (event === 'bufferedamountlow') {
          bufferedAmountLowCallback = cb;
        }
      });

      // Simulate buffer draining
      mockClient.dc_file.send.mockImplementation(() => {
        // If bufferedAmountLowCallback is set (meaning we are waiting), simulate it being called
        if (
          bufferedAmountLowCallback &&
          mockClient.dc_file.bufferedAmount > (0.125 * 1024 * 1024) / 2
        ) {
          // This is a simplification. In reality, send would increase bufferedAmount.
          // Then, after some time, the browser would decrease it and fire 'bufferedamountlow'.
          // For the test, we'll assume send happens, then we manually trigger the drain.

          // Let's simulate the buffer decreasing and the event firing
          Promise.resolve().then(() => {
            // Ensure this runs after the current microtask
            if (bufferedAmountLowCallback) {
              mockClient.dc_file.bufferedAmount = 0; // Simulate drained buffer
              bufferedAmountLowCallback();
              bufferedAmountLowCallback = null; // Event listener is removed
            }
          });
        }
      });

      await sendFile(mockFile);

      // Check that addEventListener was called because bufferedAmount was initially high
      // The first chunk will be sent, then it will check bufferedAmount.
      // If it's high, it will add the listener.
      // The exact number of calls to addEventListener depends on the interaction
      // of chunking and simulated buffer draining.
      // A simpler check is that send was called multiple times (for metadata + chunks)
      expect(mockClient.dc_file.send).toHaveBeenCalledTimes(
        1 + Math.ceil(fileContent.buffer.byteLength / smallChunkSize) // 1 for metadata, rest for chunks
      );
      // And that addEventListener was called at least once if the condition was met.
      // This test is tricky to get perfect without a more complex simulation of RTCDataChannel behavior.
      // The key is that the waitForBufferDrain logic is exercised.
      // If the first chunk send makes bufferedAmount > HIGH_WATER_MARK, addEventListener will be called.
      // Our initial mockClient.dc_file.bufferedAmount = 200 * 1024 ensures this.
      expect(mockClient.dc_file.addEventListener).toHaveBeenCalledWith(
        'bufferedamountlow',
        expect.any(Function)
      );
    });
  });
});
