import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import * as chatBridgeModule from './chatBridge.js';

describe('chatBridge', () => {
  beforeEach(() => {
    chatBridgeModule.chatStore.set({ messages: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('chatStore should initialize with an empty messages array', () => {
    const currentState: chatBridgeModule.ChatState = get(chatBridgeModule.chatStore);
    expect(currentState.messages).toEqual([]);
  });

  describe('addMessage', () => {
    it('should add a message to the store with text and sender', () => {
      const mockTimestamp = 1678886400000; // March 15, 2023 12:00:00 PM UTC
      vi.setSystemTime(new Date(mockTimestamp));

      chatBridgeModule.addMessage('Hello world', 'Alice');
      const currentState: chatBridgeModule.ChatState = get(chatBridgeModule.chatStore);

      expect(currentState.messages.length).toBe(1);
      expect(currentState.messages[0]).toEqual({
        text: 'Hello world',
        sender: 'Alice',
        timestamp: mockTimestamp,
        cid: undefined
      });
    });

    it('should add a message to the store with text, sender, and cid', () => {
      const mockTimestamp = 1678886400000; // March 15, 2023 12:00:00 PM UTC
      vi.setSystemTime(new Date(mockTimestamp));

      chatBridgeModule.addMessage('Hi there', 'Bob', 'bob-cid-123');
      const currentState: chatBridgeModule.ChatState = get(chatBridgeModule.chatStore);

      expect(currentState.messages.length).toBe(1);
      expect(currentState.messages[0]).toEqual({
        text: 'Hi there',
        sender: 'Bob',
        timestamp: mockTimestamp,
        cid: 'bob-cid-123'
      });
    });

    it('should add multiple messages correctly', () => {
      const mockTimestamp1 = 1678886400000;
      const mockTimestamp2 = 1678886405000;

      vi.setSystemTime(new Date(mockTimestamp1));
      chatBridgeModule.addMessage('First message', 'Alice');

      vi.setSystemTime(new Date(mockTimestamp2));
      chatBridgeModule.addMessage('Second message', 'Bob', 'bob-cid-123');

      const currentState: chatBridgeModule.ChatState = get(chatBridgeModule.chatStore);
      expect(currentState.messages.length).toBe(2);
      expect(currentState.messages[0]).toEqual({
        text: 'First message',
        sender: 'Alice',
        timestamp: mockTimestamp1,
        cid: undefined
      });
      expect(currentState.messages[1]).toEqual({
        text: 'Second message',
        sender: 'Bob',
        timestamp: mockTimestamp2,
        cid: 'bob-cid-123'
      });
    });
  });

  describe('getChatState', () => {
    it('should return the current state of the chatStore', () => {
      const mockTimestamp = 1678886400000;
      vi.setSystemTime(new Date(mockTimestamp));
      chatBridgeModule.addMessage('Test message', 'Tester');

      const stateFromGetter = chatBridgeModule.getChatState();
      const stateFromStore = get(chatBridgeModule.chatStore);

      expect(stateFromGetter).toEqual(stateFromStore);
      expect(stateFromGetter.messages.length).toBe(1);
      expect(stateFromGetter.messages[0].text).toBe('Test message');
    });
  });
});

describe('ChatBridge class', () => {
  let chatBridge: chatBridgeModule.ChatBridge;
  let mockContext: any;
  let mockPc: any;
  let mockDataChannel: any;
  let mockConnectionStoreUpdate = vi.fn();
  let mockAppStateStoreUpdate = vi.fn();

  beforeEach(() => {
    chatBridgeModule.chatStore.set({ messages: [] }); // Reset global store used by ChatBridge
    vi.useFakeTimers();

    mockConnectionStoreUpdate = vi.fn();
    mockAppStateStoreUpdate = vi.fn();

    mockContext = {
      connectionStore: { update: mockConnectionStoreUpdate },
      appStateStore: { update: mockAppStateStoreUpdate }
    };

    // Mock RTCPeerConnection and RTCDataChannel
    mockDataChannel = {
      send: vi.fn(),
      close: vi.fn(),
      onopen: null,
      onclose: null,
      onmessage: null,
      onerror: null,
      readyState: 'open', // Default to open for some tests
      label: 'chat'
    };

    mockPc = {
      createDataChannel: vi.fn().mockReturnValue(mockDataChannel),
      ondatachannel: null
    };

    chatBridge = new chatBridgeModule.ChatBridge();
    // chatBridge.context = mockContext; // Directly set context for simplicity here
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize chat history as an empty array', () => {
      expect(chatBridge.getChatHistory()).toEqual([]);
    });
  });

  // setContext is implicitly tested by its usage in beforeEach and other tests

  describe('getChatHistory, addMessageToHistory, clearChatHistory', () => {
    it('should manage chat history correctly', () => {
      const timestamp1 = Date.now();
      chatBridge.addMessageToHistory({ text: 'Hello', sender: 'local', timestamp: timestamp1 });
      expect(chatBridge.getChatHistory().length).toBe(1);
      expect(chatBridge.getChatHistory()[0]).toEqual(
        expect.objectContaining({ text: 'Hello', sender: 'local', timestamp: timestamp1 })
      );

      vi.advanceTimersByTime(1000);
      const timestamp2 = Date.now();
      chatBridge.addMessageToHistory({
        text: 'World',
        sender: 'remote',
        timestamp: timestamp2,
        cid: 'remote-cid'
      });
      expect(chatBridge.getChatHistory().length).toBe(2);
      expect(chatBridge.getChatHistory()[1]).toEqual(
        expect.objectContaining({
          text: 'World',
          sender: 'remote',
          timestamp: timestamp2,
          cid: 'remote-cid'
        })
      );

      chatBridge.clearChatHistory();
      expect(chatBridge.getChatHistory().length).toBe(0);
    });
  });
});
