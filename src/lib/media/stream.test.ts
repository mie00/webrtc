import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeStreamId,
  processAudio,
  stopProcessingAudio,
  drawVisualization,
  type AudioNodes
} from './stream';

// Mock global objects and functions
const mockAudioContext = {
  createAnalyser: vi.fn().mockReturnValue({
    fftSize: 0,
    frequencyBinCount: 128,
    connect: vi.fn(),
    getByteFrequencyData: vi.fn()
  }),
  createMediaStreamSource: vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn()
  }),
  close: vi.fn()
};
vi.stubGlobal('AudioContext', vi.fn(() => mockAudioContext));
vi.stubGlobal('webkitAudioContext', vi.fn(() => mockAudioContext));

const mockRequestAnimationFrame = vi.fn().mockImplementation((cb) => {
  // cb(); // Optionally call the callback immediately for some tests
  return 12345; // Return a mock animation frame ID
});
vi.stubGlobal('requestAnimationFrame', mockRequestAnimationFrame);
vi.stubGlobal('cancelAnimationFrame', vi.fn());

describe('stream.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fftSize for each test if necessary, or ensure mockAnalyser is fresh
    mockAudioContext.createAnalyser.mockReturnValue({
      fftSize: 256, // Default or specific test value
      frequencyBinCount: 128,
      connect: vi.fn(),
      getByteFrequencyData: vi.fn(),
      disconnect: vi.fn() // Ensure disconnect is part of the mock
    });
    mockAudioContext.createMediaStreamSource.mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn()
    });
  });

  describe('normalizeStreamId', () => {
    it('should remove curly braces from the ID', () => {
      expect(normalizeStreamId('{abc-123}')).toBe('abc-123');
    });

    it('should return the ID unchanged if no curly braces are present', () => {
      expect(normalizeStreamId('abc-123')).toBe('abc-123');
    });

    it('should handle empty strings', () => {
      expect(normalizeStreamId('')).toBe('');
    });

    it('should handle IDs with only opening or closing braces', () => {
      expect(normalizeStreamId('{abc-123')).toBe('abc-123');
      expect(normalizeStreamId('abc-123}')).toBe('abc-123');
    });
  });

  describe('processAudio', () => {
    let mockStream: MediaStream;

    beforeEach(() => {
      mockStream = { id: 'mockStream' } as MediaStream; // Basic mock
    });

    it('should initialize AudioContext and AnalyserNode', () => {
      const cb = vi.fn();
      processAudio(mockStream, cb);
      expect(AudioContext).toHaveBeenCalledTimes(1);
      expect(mockAudioContext.createAnalyser).toHaveBeenCalledTimes(1);
      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledWith(mockStream);
    });

    it('should set fftSize on the analyser', () => {
      const cb = vi.fn();
      const fftSize = 512;
      const analyser = mockAudioContext.createAnalyser(); // Get the mock analyser instance
      processAudio(mockStream, cb, fftSize);
      expect(analyser.fftSize).toBe(fftSize);
    });

    it('should call requestAnimationFrame to start the update loop', () => {
      const cb = vi.fn();
      processAudio(mockStream, cb);
      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it('should return AudioNodes object', () => {
      const cb = vi.fn();
      const nodes = processAudio(mockStream, cb);
      expect(nodes).toHaveProperty('context');
      expect(nodes).toHaveProperty('analyser');
      expect(nodes).toHaveProperty('source');
      expect(nodes).toHaveProperty('dataArray');
      expect(nodes).toHaveProperty('animationFrame');
      expect(nodes).toHaveProperty('fftSize');
    });

    // To test the callback, we need to manually trigger the animation frame's callback
    it('should call the callback function within the animation loop', () => {
      const cb = vi.fn();
      // Redefine mockRequestAnimationFrame for this specific test to control callback execution
      const customMockRequestAnimationFrame = vi.fn().mockImplementation((loopCb) => {
        loopCb(); // Execute the loop's callback immediately
        return 123; // Return a mock ID
      });
      vi.stubGlobal('requestAnimationFrame', customMockRequestAnimationFrame);

      processAudio(mockStream, cb);

      expect(customMockRequestAnimationFrame).toHaveBeenCalled();
      expect(cb).toHaveBeenCalled();
      expect(mockAudioContext.createAnalyser().getByteFrequencyData).toHaveBeenCalled();

      // Restore original mock
      vi.stubGlobal('requestAnimationFrame', mockRequestAnimationFrame);
    });
  });

  describe('stopProcessingAudio', () => {
    it('should do nothing if nodes is null', () => {
      stopProcessingAudio(null);
      expect(cancelAnimationFrame).not.toHaveBeenCalled();
    });

    it('should cancel animation frame and disconnect source if nodes are provided', () => {
      const mockNodes: AudioNodes = {
        context: mockAudioContext as unknown as AudioContext,
        analyser: mockAudioContext.createAnalyser() as AnalyserNode,
        source: mockAudioContext.createMediaStreamSource({} as MediaStream) as MediaStreamAudioSourceNode,
        dataArray: new Uint8Array(128),
        animationFrame: 12345,
        fftSize: 256
      };
      mockNodes.source.disconnect = vi.fn(); // Ensure source has a disconnect mock

      stopProcessingAudio(mockNodes);

      expect(cancelAnimationFrame).toHaveBeenCalledWith(mockNodes.animationFrame);
      expect(mockNodes.source.disconnect).toHaveBeenCalled();
      // context.close() is commented out in the source, so we don't test it
    });

    it('should not fail if animationFrame is undefined', () => {
      const mockNodes: AudioNodes = {
        context: mockAudioContext as unknown as AudioContext,
        analyser: mockAudioContext.createAnalyser() as AnalyserNode,
        source: mockAudioContext.createMediaStreamSource({} as MediaStream) as MediaStreamAudioSourceNode,
        dataArray: new Uint8Array(128),
        animationFrame: undefined,
        fftSize: 256
      };
      mockNodes.source.disconnect = vi.fn();

      expect(() => stopProcessingAudio(mockNodes)).not.toThrow();
      expect(cancelAnimationFrame).not.toHaveBeenCalledWith(undefined);
      expect(mockNodes.source.disconnect).toHaveBeenCalled();
    });
  });

  describe('drawVisualization', () => {
    let mockCanvasContext: CanvasRenderingContext2D;
    const width = 300;
    const height = 150;

    beforeEach(() => {
      mockCanvasContext = {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillStyle: ''
      } as unknown as CanvasRenderingContext2D;
    });

    it('should clear the canvas', () => {
      const dataArray = new Uint8Array([10, 20, 30]);
      drawVisualization(dataArray, mockCanvasContext, width, height);
      expect(mockCanvasContext.clearRect).toHaveBeenCalledWith(0, 0, width, height);
    });

    it('should set fillStyle to default color if not provided', () => {
      const dataArray = new Uint8Array([10, 20, 30]);
      drawVisualization(dataArray, mockCanvasContext, width, height);
      expect(mockCanvasContext.fillStyle).toBe('#3B82F6');
    });

    it('should set fillStyle to provided color', () => {
      const dataArray = new Uint8Array([10, 20, 30]);
      const color = '#FF0000';
      drawVisualization(dataArray, mockCanvasContext, width, height, color);
      expect(mockCanvasContext.fillStyle).toBe(color);
    });

    it('should call fillRect for each data point', () => {
      const dataArray = new Uint8Array([10, 20, 30, 40]);
      drawVisualization(dataArray, mockCanvasContext, width, height);
      expect(mockCanvasContext.fillRect).toHaveBeenCalledTimes(dataArray.length);

      const barWidth = (width / dataArray.length) * 2.5;
      let x = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const barHeight = dataArray[i] / 2;
        expect(mockCanvasContext.fillRect).toHaveBeenCalledWith(x, height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    });

    it('should handle empty dataArray', () => {
      const dataArray = new Uint8Array([]);
      drawVisualization(dataArray, mockCanvasContext, width, height);
      expect(mockCanvasContext.clearRect).toHaveBeenCalledWith(0, 0, width, height);
      expect(mockCanvasContext.fillRect).not.toHaveBeenCalled();
    });
  });
});
