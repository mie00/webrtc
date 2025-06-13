import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ChatHistory } from './ChatHistory';
import type { ChatState } from '../stores/chatStore'; // For message typing

describe('ChatHistory class', () => {
  let chatHistory: ChatHistory;

  beforeEach(() => {
    vi.useFakeTimers();
    chatHistory = new ChatHistory();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize chat history as an empty array', () => {
      expect(chatHistory.getChatHistory()).toEqual([]);
    });
  });

  describe('getChatHistory, addMessageToHistory, clearChatHistory', () => {
    it('should manage chat history correctly', () => {
      const timestamp1 = Date.now();
      const message1: ChatState['messages'][0] = {
        text: 'Hello',
        sender: 'local',
        timestamp: timestamp1
      };
      chatHistory.addMessageToHistory(message1);
      expect(chatHistory.getChatHistory().length).toBe(1);
      expect(chatHistory.getChatHistory()[0]).toEqual(
        expect.objectContaining({ text: 'Hello', sender: 'local', timestamp: timestamp1 })
      );

      vi.advanceTimersByTime(1000);
      const timestamp2 = Date.now();
      const message2: ChatState['messages'][0] = {
        text: 'World',
        sender: 'remote',
        timestamp: timestamp2,
        cid: 'remote-cid'
      };
      chatHistory.addMessageToHistory(message2);
      expect(chatHistory.getChatHistory().length).toBe(2);
      expect(chatHistory.getChatHistory()[1]).toEqual(
        expect.objectContaining({
          text: 'World',
          sender: 'remote',
          timestamp: timestamp2,
          cid: 'remote-cid'
        })
      );

      chatHistory.clearChatHistory();
      expect(chatHistory.getChatHistory().length).toBe(0);
    });
  });
});
