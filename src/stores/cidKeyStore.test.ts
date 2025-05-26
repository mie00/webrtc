import { describe, it, expect, beforeEach } from 'vitest';
import {
  setCidKeys,
  removeCidKeys,
  resetCidKeyStore,
  getKeysByCid,
  getAllCidKeys,
  cidKeyStore, // Import the store itself for direct inspection if needed
  type CidKeys,
  type CidKeyState // Added for typing the store's state
} from './cidKeyStore.js';
import { get } from 'svelte/store';

describe('cidKeyStore', () => {
  const mockCid1 = 'testCid123';
  const mockKeys1: CidKeys = {
    publicKey: 'devicePubKey1',
    userPublicKey: 'userPubKey1'
  };

  const mockCid2 = 'anotherCid456';
  const mockKeys2: CidKeys = {
    publicKey: 'devicePubKey2',
    userPublicKey: 'userPubKey2'
  };

  beforeEach(() => {
    // Reset the store to its initial state before each test
    resetCidKeyStore();
  });

  it('should initialize with an empty keysByCid record', () => {
    const state: CidKeyState = get(cidKeyStore);
    expect(state.keysByCid).toEqual({});
  });

  it('should set and retrieve keys for a CID', () => {
    setCidKeys(mockCid1, mockKeys1.publicKey, mockKeys1.userPublicKey!);
    const retrievedKeys = getKeysByCid(mockCid1);
    expect(retrievedKeys).toEqual(mockKeys1);
  });

  it('should allow setting keys with a null devicePublicKey', () => {
    const keysWithNullDevice: CidKeys = {
      publicKey: null,
      userPublicKey: 'userPubKeyOnly'
    };
    setCidKeys(
      'cidWithNullDeviceKey',
      keysWithNullDevice.publicKey,
      keysWithNullDevice.userPublicKey!
    );
    const retrieved = getKeysByCid('cidWithNullDeviceKey');
    expect(retrieved).toEqual(keysWithNullDevice);
  });

  it('should overwrite existing keys when setting for the same CID', () => {
    setCidKeys(mockCid1, mockKeys1.publicKey, mockKeys1.userPublicKey!);
    const newKeysForCid1: CidKeys = {
      publicKey: 'newDeviceKey',
      userPublicKey: 'newUserKey'
    };
    setCidKeys(mockCid1, newKeysForCid1.publicKey, newKeysForCid1.userPublicKey!);
    const retrievedKeys = getKeysByCid(mockCid1);
    expect(retrievedKeys).toEqual(newKeysForCid1);
  });

  it('should remove keys for a specific CID', () => {
    setCidKeys(mockCid1, mockKeys1.publicKey, mockKeys1.userPublicKey!);
    setCidKeys(mockCid2, mockKeys2.publicKey, mockKeys2.userPublicKey!);

    removeCidKeys(mockCid1);

    expect(getKeysByCid(mockCid1)).toBeUndefined();
    expect(getKeysByCid(mockCid2)).toEqual(mockKeys2); // Ensure other keys are not affected
  });

  it('should do nothing if trying to remove keys for a non-existent CID', () => {
    setCidKeys(mockCid1, mockKeys1.publicKey, mockKeys1.userPublicKey!);
    const initialStoreState = get(cidKeyStore);

    removeCidKeys('nonExistentCid');

    expect(get(cidKeyStore)).toEqual(initialStoreState); // Store should be unchanged
    expect(getKeysByCid(mockCid1)).toEqual(mockKeys1);
  });

  it('should retrieve all CID keys using getAllCidKeys', () => {
    setCidKeys(mockCid1, mockKeys1.publicKey, mockKeys1.userPublicKey!);
    setCidKeys(mockCid2, mockKeys2.publicKey, mockKeys2.userPublicKey!);

    const allKeys = getAllCidKeys();
    expect(allKeys).toEqual({
      [mockCid1]: mockKeys1,
      [mockCid2]: mockKeys2
    });
  });

  it('should reset the store to its initial empty state', () => {
    setCidKeys(mockCid1, mockKeys1.publicKey, mockKeys1.userPublicKey!);
    setCidKeys(mockCid2, mockKeys2.publicKey, mockKeys2.userPublicKey!);

    resetCidKeyStore();

    const state: CidKeyState = get(cidKeyStore);
    expect(state.keysByCid).toEqual({});
    expect(getAllCidKeys()).toEqual({});
  });
});
