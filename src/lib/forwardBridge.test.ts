import { get } from 'svelte/store';
import {
  forwardStore,
  getForwardState,
  setAllowedHosts,
  setForwardPeer,
  setForwardHost,
  addInflight,
  removeInflight,
  addLogMessage,
  updateLogMessageStatus,
  clearLogMessages,
  initialState // Assuming initialState is exported or accessible for reset
} from './forwardBridge';
import { describe, it, expect, beforeEach } from 'vitest';

describe('forwardBridge', () => {
  beforeEach(() => {
    // Reset the store to its initial state before each test
    forwardStore.set({ ...initialState, inflight: {}, logMessages: [] }); // Deep copy for safety
  });

  it('getForwardState should return the current state', () => {
    const state = getForwardState();
    expect(state).toEqual(initialState);
  });

  it('setAllowedHosts should update allowedHosts in the store', () => {
    const newHosts = ['host1.com', 'host2.com'];
    setAllowedHosts(newHosts);
    const state = get(forwardStore);
    expect(state.allowedHosts).toEqual(newHosts);
  });

  it('setForwardPeer should update forwardPeer in the store', () => {
    const newPeer = 'peer123';
    setForwardPeer(newPeer);
    const state = get(forwardStore);
    expect(state.forwardPeer).toEqual(newPeer);
    setForwardPeer(null);
    const state2 = get(forwardStore);
    expect(state2.forwardPeer).toBeNull();
  });

  it('setForwardHost should update forwardHost in the store', () => {
    const newHost = 'forward.example.com';
    setForwardHost(newHost);
    const state = get(forwardStore);
    expect(state.forwardHost).toEqual(newHost);
    setForwardHost(null);
    const state2 = get(forwardStore);
    expect(state2.forwardHost).toBeNull();
  });

  it('addInflight and removeInflight should manage inflight requests', () => {
    const id = 'req1';
    const callback = vi.fn();
    addInflight(id, callback);
    let state = get(forwardStore);
    expect(state.inflight[id]).toBe(callback);

    removeInflight(id);
    state = get(forwardStore);
    expect(state.inflight[id]).toBeUndefined();
  });

  it('addLogMessage should add a new log message', () => {
    const id = 'log1';
    const text = 'Test log message';
    addLogMessage(id, text);
    const state = get(forwardStore);
    expect(state.logMessages.length).toBe(1);
    expect(state.logMessages[0]).toEqual({ id, text, status: '🌀' });
  });

  it('updateLogMessageStatus should update the status of a log message', () => {
    const id = 'log1';
    const text = 'Test log message';
    addLogMessage(id, text); // Add a message first
    updateLogMessageStatus(id, '✅');
    const state = get(forwardStore);
    expect(state.logMessages[0].status).toBe('✅');
  });

  it('clearLogMessages should remove all log messages', () => {
    addLogMessage('log1', 'Message 1');
    addLogMessage('log2', 'Message 2');
    clearLogMessages();
    const state = get(forwardStore);
    expect(state.logMessages.length).toBe(0);
  });
});
