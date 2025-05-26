import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { chatStore, addMessage, getChatState, type ChatState } from './chatBridge';

describe('chatBridge', () => {
  beforeEach(() => {
    // Reset the store to its initial state before each test
    chatStore.set({ messages: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('chatStore should initialize with an empty messages array', () => {
    const currentState = get(chatStore);
    expect(currentState.messages).toEqual([]);
  });

  describe('addMessage', () => {
    it('should add a message to the store with text and sender', () => {
      const mockTimestamp = 1678886400000; // March 15, 2023 12:00:00 PM UTC
      vi.setSystemTime(new Date(mockTimestamp));

      addMessage('Hello world', 'Alice');
      const currentState = get(chatStore);

      expect(currentState.messages.length).toBe(1);
      expect(currentState.messages[0]).toEqual({
        text: 'Hello world',
        sender: 'Alice',
        timestamp: mockTimestamp,
        cid: undefined,
      });
    });

    it('should add a message to the store with text, sender, and cid', () => {
      const mockTimestamp = 1678886400000; // March 15, 2023 12:00:00 PM UTC
      vi.setSystemTime(new Date(mockTimestamp));
      
      addMessage('Hi there', 'Bob', 'bob-cid-123');
      const currentState = get(chatStore);

      expect(currentState.messages.length).toBe(1);
      expect(currentState.messages[0]).toEqual({
        text: 'Hi there',
        sender: 'Bob',
        timestamp: mockTimestamp,
        cid: 'bob-cid-123',
      });
    });

    it('should add multiple messages correctly', () => {
      const mockTimestamp1 = 1678886400000;
      const mockTimestamp2 = 1678886405000;

      vi.setSystemTime(new Date(mockTimestamp1));
      addMessage('First message', 'Alice');

      vi.setSystemTime(new Date(mockTimestamp2));
      addMessage('Second message', 'Bob', 'bob-cid-123');

      const currentState = get(chatStore);
      expect(currentState.messages.length).toBe(2);
      expect(currentState.messages[0]).toEqual({
        text: 'First message',
        sender: 'Alice',
        timestamp: mockTimestamp1,
        cid: undefined,
      });
      expect(currentState.messages[1]).toEqual({
        text: 'Second message',
        sender: 'Bob',
        timestamp: mockTimestamp2,
        cid: 'bob-cid-123',
      });
    });
  });

  describe('getChatState', () => {
    it('should return the current state of the chatStore', () => {
      const mockTimestamp = 1678886400000;
      vi.setSystemTime(new Date(mockTimestamp));
      addMessage('Test message', 'Tester');

      const stateFromGetter = getChatState();
      const stateFromStore = get(chatStore);

      expect(stateFromGetter).toEqual(stateFromStore);
      expect(stateFromGetter.messages.length).toBe(1);
      expect(stateFromGetter.messages[0].text).toBe('Test message');
    });
  });
});
