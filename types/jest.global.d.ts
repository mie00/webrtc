/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="jest" />
import type { App, WebRTCClient } from './global'; // Adjust path as needed
import type { BinPackResult } from './global'; // Assuming BinPackResult is defined here
import type { Diff } from 'diff'; // Assuming 'diff' package is installed
import type { Socket } from 'socket.io-client'; // Assuming 'socket.io-client' is installed

// Augment the NodeJS Global type
declare global {
  // --- From main.test.ts ---
  var app: App | undefined; // Allow app to be undefined as it's reset
  var io: jest.Mock<Socket>; // Mocked socket.io client
  var Diff: { diffChars: jest.Mock<ReturnType<Diff['diffChars']>> }; // Mocked Diff library
  var QRCode: jest.Mock<any>; // Mocked QRCode library
  var compress: jest.Mock<Promise<string>>;
  var decompress: jest.Mock<Promise<string>>;
  var EMOJIS: string[];
  var getConfig: jest.Mock<Record<string, string>>;
  var setConfig: jest.Mock<void>;
  var sendNego: jest.Mock<(client: WebRTCClient, message: any) => void>;
  var setButton: jest.Mock<(buttonId: string, state: boolean) => void>;
  var BinPack: jest.Mock<() => BinPackResult>; // Mocked BinPack function/class

  // --- From stream.test.ts / components/stream.test.ts ---
  var backgroundChange: jest.Mock<Promise<MediaStream>>;

  // --- From file.test.ts ---
  var log: jest.Mock<(...args: any[]) => void>;

  // --- From forward.test.ts ---
  // Note: window properties are mocked on global in some tests
  var prompt: jest.Mock<string | null>;
  // MessageChannel is standard, but might be mocked
  var MessageChannel: jest.Mock<{ port1: MessagePort; port2: MessagePort }>;

  // Extend Window interface if necessary for window-specific mocks
  // interface Window {
  //   // Add window specific mocks here if needed
  // }
}

// Export {} to make this file a module. This is necessary for augmentation.
export {};