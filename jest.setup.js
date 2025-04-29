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

// Mock TextEncoder and TextDecoder
global.TextEncoder = function() {
  this.encode = function(str) {
    return new Uint8Array([...str].map(c => c.charCodeAt(0)));
  };
  this.encodeInto = function(str, uint8Array) {
    const encoded = this.encode(str);
    uint8Array.set(encoded);
    return { read: str.length, written: encoded.length };
  };
  Object.defineProperty(this, 'encoding', { value: 'utf-8' });
};

global.TextDecoder = function(encoding = 'utf-8') {
  this.decode = function(arr) {
    return String.fromCharCode.apply(null, new Uint8Array(arr));
  };
  Object.defineProperty(this, 'encoding', { value: encoding });
  Object.defineProperty(this, 'fatal', { value: false });
  Object.defineProperty(this, 'ignoreBOM', { value: false });
};

// Global app object for tests
global.app = {
  clients: {},
  streams: {},
  streamConfig: {},
  viewStreams: {},
  nego_handlers: {},
  cleanups: {}
};

// Global DOM elements
document.body.innerHTML = `
  <div id="media"></div>
  <div id="output"></div>
  <div id="participants"></div>
  <div id="config-overlay">
    <input id="stun-servers" value="stun:stun.l.google.com:19302">
    <input id="turn-server-v2" value="">
    <input id="turn-username" value="">
    <input id="turn-password" value="">
  </div>
`;

global.chat = document.createElement('input');
global.output = document.getElementById('output');
global.media = document.getElementById('media');
global.participants = document.getElementById('participants');

// Global utility functions
global.uuidv4 = () => {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
  );
};
