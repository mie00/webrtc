// Declare functions from other JS files
declare function getConfig(): Record<string, string>;
declare function streamInit(app: App): void;
declare function forwardInit(app: App): void;
declare function setupTrackHandler(app: App, cid: string): void;
declare function setupChatChannel(app: App, cid: string): void;
declare function setupFileChannel(app: App, cid: string): void;
declare function setupForwardChannel(app: App, cid: string): void;
declare function compress(sdp: string): Promise<string>;
declare function decompress(compressed: string): Promise<string>;
declare function handleChange(cid?: string): void;

// Declare global variables used in main.js
declare const Diff: {
  diffChars: (text1: string, text2: string) => Array<{
    value: string;
    added?: boolean;
    removed?: boolean;
  }>;
};
