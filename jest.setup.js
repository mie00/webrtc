// Mock browser APIs that aren't available in Jest
global.RTCPeerConnection = jest.fn().mockImplementation(() => ({
  createDataChannel: jest.fn().mockReturnValue({
    onopen: null,
    onmessage: null,
    send: jest.fn(),
  }),
  createOffer: jest.fn().mockResolvedValue({ sdp: 'mock-sdp' }),
  setLocalDescription: jest.fn().mockResolvedValue({}),
  setRemoteDescription: jest.fn().mockResolvedValue({}),
  addIceCandidate: jest.fn().mockResolvedValue({}),
  onicecandidate: null,
  ontrack: null,
  addEventListener: jest.fn(),
  getStats: jest.fn().mockResolvedValue(new Map()),
}));

global.MediaStream = jest.fn().mockImplementation(() => ({
  getTracks: jest.fn().mockReturnValue([]),
  getVideoTracks: jest.fn().mockReturnValue([]),
  getAudioTracks: jest.fn().mockReturnValue([]),
  addTrack: jest.fn(),
  removeTrack: jest.fn(),
}));

// Mock canvas
global.HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
  drawImage: jest.fn(),
  clearRect: jest.fn(),
  save: jest.fn(),
  fillStyle: '',
  globalCompositeOperation: '',
  restore: jest.fn(),
});
