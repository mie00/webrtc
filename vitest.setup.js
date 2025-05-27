import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock AudioContext for tests
global.AudioContext = vi.fn(() => ({
  currentTime: 0,
  createOscillator: vi.fn(() => ({
    frequency: { value: 0 },
    type: '',
    connect: vi.fn(() => ({
      connect: vi.fn(),
    })),
    start: vi.fn(),
    stop: vi.fn(),
  })),
  createGain: vi.fn(() => ({
    gain: { value: 0 },
    connect: vi.fn(() => ({
      connect: vi.fn(),
    })),
  })),
  createMediaStreamSource: vi.fn(() => ({
    connect: vi.fn(),
  })),
  createAnalyser: vi.fn(() => ({
    fftSize: 0,
    frequencyBinCount: 0,
    getByteFrequencyData: vi.fn(),
    connect: vi.fn(),
  })),
}));

// Mock navigator.mediaDevices.getUserMedia
global.navigator = global.navigator || {};
global.navigator.mediaDevices = global.navigator.mediaDevices || {};
global.navigator.mediaDevices.getUserMedia = vi.fn(() => Promise.resolve({
  getTracks: vi.fn(() => [{
    stop: vi.fn(),
  }]),
}));

