interface SelfieSegmentationOptions {
  modelSelection: number;
  locateFile: (file: string) => string;
}

declare class SelfieSegmentation {
  constructor(options: SelfieSegmentationOptions);
  setOptions(options: { modelSelection: number }): void;
  onResults(callback: (results: any) => void): void;
  send(data: { image: HTMLVideoElement }): Promise<void>;
}

// Socket.io client types
declare const io: (url: string, options?: any) => any;

// QRCode library
declare class QRCode {
  constructor(element: HTMLElement, text: string);
}

// Add EMOJIS global variable used in main.js
declare const EMOJIS: string[];
