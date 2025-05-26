/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="jest" />
import type { App, WebRTCClient } from './global'; // Adjust path as needed
import type { BinPackResult } from './global'; // Assuming BinPackResult is defined here
import type { Diff } from 'diff';
import type { Socket } from 'socket.io-client';
import type { QRCode as QRCodeType } from 'qrcode'; // Import actual type if available

// Augment the NodeJS Global type
// Use NodeJS.Global interface for better compatibility
declare namespace NodeJS {
  interface Global {
    // --- From main.test.ts ---
    app: App | undefined; // Allow app to be undefined as it's reset
    io: jest.Mock<Socket>; // Mocked socket.io client
    Diff: { diffChars: jest.Mock<ReturnType<Diff['diffChars']>> }; // Mocked Diff library
    QRCode: jest.Mock<QRCodeType>; // Mocked QRCode library - Use specific type if possible
    compress: jest.Mock<Promise<string>>;
    decompress: jest.Mock<Promise<string>>;
    EMOJIS: string[];
    getConfig: jest.Mock<Record<string, string>>;
    setConfig: jest.Mock<void>;
    sendNego: jest.Mock<(client: WebRTCClient, message: any) => void>;
    setButton: jest.Mock<(buttonId: string, state: boolean) => void>;
    BinPack: jest.Mock<() => BinPackResult>; // Mocked BinPack function/class

    // --- From stream.test.ts / components/stream.test.ts ---
    backgroundChange: jest.Mock<Promise<MediaStream>>;

    // --- From file.test.ts ---
    log: jest.Mock<(...args: any[]) => void>;
    // Add FileReader mock type if used globally in tests
    FileReader: jest.Mock<FileReader>;

    // --- From forward.test.ts ---
    // Note: window properties are mocked on global in some tests
    prompt: jest.Mock<string | null>;
    // MessageChannel is standard, but might be mocked
    MessageChannel: jest.Mock<{ port1: MessagePort; port2: MessagePort }>;

    // Add other standard globals that might be mocked (fetch, alert, etc.)
    fetch: jest.Mock<Promise<Response>>;
    alert: jest.Mock<void>;
    URL: typeof URL & {
      // Mock static methods too
      createObjectURL: jest.Mock<string>;
      revokeObjectURL: jest.Mock<void>;
      canParse?: jest.Mock<boolean>; // Optional static methods
      parse?: jest.Mock<any>;
    };
    // Add RTCPeerConnection mock type if used globally
    RTCPeerConnection: jest.Mock<RTCPeerConnection> & {
      // Add static methods if needed
      generateCertificate?: jest.Mock<Promise<RTCCertificate>>;
    };
    // Add AudioContext mock type
    AudioContext: jest.Mock<AudioContext>;
    // Add Event mock type
    Event: jest.Mock<typeof Event>;
    // Add BroadcastChannel mock type
    BroadcastChannel: jest.Mock<BroadcastChannel>;
    // Add URLSearchParams mock type
    URLSearchParams: jest.Mock<URLSearchParams>;
    // Add crypto mock type
    crypto: Crypto & {
      // Add specific methods used in tests
      getRandomValues: jest.Mock<Uint8Array>;
      subtle: SubtleCrypto & {
        digest: jest.Mock<Promise<ArrayBuffer>>;
      };
    };
    // Add navigator mock type
    navigator: Navigator & {
      // Add specific properties used in tests
      clipboard: Clipboard & {
        writeText: jest.Mock<Promise<void>>;
      };
      mediaDevices: MediaDevices & {
        getUserMedia: jest.Mock<Promise<MediaStream>>;
        getDisplayMedia: jest.Mock<Promise<MediaStream>>;
        enumerateDevices: jest.Mock<Promise<MediaDeviceInfo[]>>;
      };
    };
    // Add window mock type (can be partial)
    window: Window &
      typeof globalThis & {
        // Add specific properties used in tests
        localStorage: Storage & {
          getItem: jest.Mock<string | null>;
          setItem: jest.Mock<void>;
        };
        // Add other window properties mocked in tests
        VideoStreamMerger?: any; // If VideoStreamMerger is attached to window
      };
  }
}

// Extend Window interface if necessary for window-specific mocks
// interface Window {
//   // Add window specific mocks here if needed
// }
// }

// Export {} to make this file a module. This is necessary for augmentation.
export {};
