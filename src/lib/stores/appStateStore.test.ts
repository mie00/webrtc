import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerNegoHandler,
  getNegoHandler,
  registerCleanup,
  getAllCleanups,
  resetAppStateStore,
  type SpecificNegoHandler,
  type CleanupFunc
} from './appStateStore';
import type { NegoMessageType } from '../../types/negoMessages';

describe('appStateStore', () => {
  beforeEach(() => {
    // Reset the store before each test to ensure a clean state
    resetAppStateStore();
  });

  describe('Negotiation Handlers', () => {
    it('should register and retrieve a negotiation handler', () => {
      const mockHandler: SpecificNegoHandler<'offer'> = vi.fn();
      const type: NegoMessageType = 'offer';

      registerNegoHandler(type, mockHandler);
      const retrievedHandler = getNegoHandler(type);

      expect(retrievedHandler).toBe(mockHandler);
    });

    it('should return undefined for a non-existent negotiation handler', () => {
      const retrievedHandler = getNegoHandler('answer'); // Assuming 'answer' handler hasn't been registered
      expect(retrievedHandler).toBeUndefined();
    });

    it('should allow overriding a registered negotiation handler', () => {
      const initialHandler: SpecificNegoHandler<'offer'> = vi.fn();
      const newHandler: SpecificNegoHandler<'offer'> = vi.fn();
      const type: NegoMessageType = 'offer';

      registerNegoHandler(type, initialHandler);
      registerNegoHandler(type, newHandler);
      const retrievedHandler = getNegoHandler(type);

      expect(retrievedHandler).toBe(newHandler);
      expect(retrievedHandler).not.toBe(initialHandler);
    });
  });

  describe('Cleanup Functions', () => {
    it('should register and retrieve cleanup functions', () => {
      const mockCleanup1: CleanupFunc = vi.fn();
      const mockCleanup2: CleanupFunc = vi.fn();

      registerCleanup('module1', mockCleanup1);
      registerCleanup('module2', mockCleanup2);

      const allCleanups = getAllCleanups();

      expect(allCleanups.module1).toBe(mockCleanup1);
      expect(allCleanups.module2).toBe(mockCleanup2);
      expect(Object.keys(allCleanups).length).toBe(2);
    });

    it('should allow overriding a registered cleanup function', () => {
      const initialCleanup: CleanupFunc = vi.fn();
      const newCleanup: CleanupFunc = vi.fn();

      registerCleanup('moduleX', initialCleanup);
      registerCleanup('moduleX', newCleanup);

      const allCleanups = getAllCleanups();
      expect(allCleanups.moduleX).toBe(newCleanup);
      expect(allCleanups.moduleX).not.toBe(initialCleanup);
    });
  });

  describe('resetAppStateStore', () => {
    it('should reset all negotiation handlers', () => {
      const mockHandler: SpecificNegoHandler<'offer'> = vi.fn();
      registerNegoHandler('offer', mockHandler);
      expect(getNegoHandler('offer')).toBeDefined(); // Ensure it's there before reset

      resetAppStateStore();
      const retrievedHandler = getNegoHandler('offer');
      expect(retrievedHandler).toBeUndefined();
    });

    it('should reset all cleanup functions', () => {
      const mockCleanup: CleanupFunc = vi.fn();
      registerCleanup('testModule', mockCleanup);
      expect(getAllCleanups().testModule).toBeDefined(); // Ensure it's there before reset

      resetAppStateStore();
      const allCleanups = getAllCleanups();
      expect(allCleanups.testModule).toBeUndefined();
      expect(Object.keys(allCleanups).length).toBe(0);
    });
  });
});
