/// <reference types="vitest/globals" />
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import ControlPanel from './ControlPanel.svelte';
import { writable } from 'svelte/store';
import type { FileTransfer } from '../lib/fileBridge.js';
import type { ChatState } from '../stores/chatStore';
import type { FileState } from '../stores/fileStore';
import type { CidKeys } from '../stores/cidKeyStore';
import type { PeerProfile } from '../stores/peerProfileStore';

// Import the functions we are mocking to get a reference to the mocked versions
import { getKeysByCid } from '../stores/cidKeyStore';
import { getPeerProfile } from '../stores/peerProfileStore';

// Mock stores and functions (these mocks apply to the imports above too)
vi.mock('../stores/cidKeyStore.js', () => ({
  getKeysByCid: vi.fn()
}));
vi.mock('../stores/peerProfileStore.js', () => ({
  getPeerProfile: vi.fn()
}));

// Hoist store instances for mocking
const hoistedStores = vi.hoisted(() => {
  const { writable: localWritable } = require('svelte/store');
  return {
    mockProfileStoreInstance: localWritable({ userName: 'TestUser' }),
    mockChatStoreInstance: localWritable({ messages: [] }),
    mockFileStoreInstance: localWritable({ transfers: {} }),
    mockTranscriptionDisplayStoreInstance: localWritable({ segments: [], activeBuffers: {} }), // Added activeBuffers for InputArea
    mockTranscriberStoreInstance: localWritable({ isTranscribingOverall: false }) // Added for InputArea
  };
});

vi.mock('../stores/profileStore.js', () => ({
  profileStore: hoistedStores.mockProfileStoreInstance
}));
vi.mock('../lib/chatBridge.js', () => ({
  chatStore: hoistedStores.mockChatStoreInstance
}));
vi.mock('../lib/fileBridge.js', () => ({
  fileStore: hoistedStores.mockFileStoreInstance
}));
vi.mock('../lib/media/transcriber.js', () => ({
  transcriptionDisplayStore: hoistedStores.mockTranscriptionDisplayStoreInstance,
  transcriberStore: hoistedStores.mockTranscriberStoreInstance // Added this line
}));

// Helper to reset store mocks
const resetStoreMocks = () => {
  hoistedStores.mockProfileStoreInstance.set({ userName: 'TestUser' });
  hoistedStores.mockChatStoreInstance.set({ messages: [] });
  hoistedStores.mockFileStoreInstance.set({ transfers: {} });
  hoistedStores.mockTranscriptionDisplayStoreInstance.set({ segments: [], activeBuffers: {} });
  hoistedStores.mockTranscriberStoreInstance.set({ isTranscribingOverall: false });

  // Reset non-store mocks using the imported references
  vi.mocked(getKeysByCid).mockClear().mockReturnValue(undefined);
  vi.mocked(getPeerProfile).mockClear().mockReturnValue(undefined);
};

describe('ControlPanel.svelte', () => {
  beforeEach(() => {
    resetStoreMocks();
  });

  test('renders initially closed', () => {
    const { container } = render(ControlPanel);
    const panel = container.querySelector('#test-control-panel');
    expect(panel).toHaveClass('left-full');
    expect(panel).not.toHaveClass('right-0');
    expect(screen.getByLabelText('Open panel (0 unread)')).toBeInTheDocument();
  });

  test('toggles panel open and closed', async () => {
    const { container } = render(ControlPanel);
    let toggleButton = screen.getByLabelText('Open panel (0 unread)');
    const panel = container.querySelector('#test-control-panel');

    // Open panel
    await fireEvent.click(toggleButton);
    await tick();
    expect(panel).toHaveClass('right-0');
    expect(panel).not.toHaveClass('left-full');
    // Button label changes, so re-query or use a more general selector if needed
    toggleButton = screen.getByLabelText('Close panel');
    expect(toggleButton).toBeInTheDocument();

    // Close panel
    await fireEvent.click(toggleButton);
    await tick();
    expect(panel).toHaveClass('left-full');
    expect(panel).not.toHaveClass('right-0');
    expect(screen.getByLabelText('Open panel (0 unread)')).toBeInTheDocument();
  });

  test('updates unread count correctly', async () => {
    const { container } = render(ControlPanel);
    const panel = container.querySelector('#test-control-panel');
    let toggleButton = screen.getByLabelText('Open panel (0 unread)');

    // Initial state: panel closed, 0 unread
    expect(toggleButton.querySelector('.bg-red-500')).toBeNull(); // No badge

    // 1. Add a remote chat message while panel is closed
    hoistedStores.mockChatStoreInstance.update((s: ChatState) => ({
      ...s,
      messages: [
        { cid: 'remote-cid-1', sender: 'RemoteUser1', text: 'Hello', timestamp: Date.now() }
      ]
    }));
    vi.mocked(getKeysByCid).mockReturnValue({ userPublicKey: 'key1', publicKey: null });
    vi.mocked(getPeerProfile).mockReturnValue({ userName: 'RemoteProfileName1' });
    await tick(); // For derived combinedFeed and $effect
    await tick(); // Sometimes $effect needs an extra tick or waitFor

    // Check for badge with "1"
    toggleButton = screen.getByLabelText('Open panel (1 unread)');
    let badge = toggleButton.querySelector('.bg-red-500');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('1');

    // 2. Open the panel
    await fireEvent.click(toggleButton);
    await tick();
    toggleButton = screen.getByLabelText('Close panel');
    expect(toggleButton.querySelector('.bg-red-500')).toBeNull(); // Badge gone

    // 3. Add another remote message while panel is open
    hoistedStores.mockChatStoreInstance.update((s: ChatState) => ({
      ...s,
      messages: [
        ...s.messages,
        { cid: 'remote-cid-2', sender: 'RemoteUser2', text: 'World', timestamp: Date.now() + 1 }
      ]
    }));
    vi.mocked(getKeysByCid).mockImplementation((cid): CidKeys | undefined => {
      if (cid === 'remote-cid-1') return { userPublicKey: 'key1', publicKey: null };
      if (cid === 'remote-cid-2') return { userPublicKey: 'key2', publicKey: null };
      return undefined;
    });
    vi.mocked(getPeerProfile).mockImplementation((key): PeerProfile | undefined => {
      if (key === 'key1') return { userName: 'RemoteProfileName1' };
      if (key === 'key2') return { userName: 'RemoteProfileName2' };
      return undefined;
    });
    await tick();
    await tick();
    expect(toggleButton.querySelector('.bg-red-500')).toBeNull(); // Still no badge

    // 4. Close the panel
    await fireEvent.click(toggleButton);
    await tick();
    toggleButton = screen.getByLabelText('Open panel (0 unread)'); // lastRemoteItemCountSeen updated to 2
    expect(toggleButton.querySelector('.bg-red-500')).toBeNull();

    // 5. Add a third remote message while panel is closed
    hoistedStores.mockChatStoreInstance.update((s: ChatState) => ({
      ...s,
      messages: [
        ...s.messages,
        { cid: 'remote-cid-3', sender: 'RemoteUser3', text: 'Again', timestamp: Date.now() + 2 }
      ]
    }));
    vi.mocked(getKeysByCid).mockImplementation((cid): CidKeys | undefined => {
      if (cid === 'remote-cid-1') return { userPublicKey: 'key1', publicKey: null };
      if (cid === 'remote-cid-2') return { userPublicKey: 'key2', publicKey: null };
      if (cid === 'remote-cid-3') return { userPublicKey: 'key3', publicKey: null };
      return undefined;
    });
    vi.mocked(getPeerProfile).mockImplementation((key): PeerProfile | undefined => {
      if (key === 'key1') return { userName: 'RemoteProfileName1' };
      if (key === 'key2') return { userName: 'RemoteProfileName2' };
      if (key === 'key3') return { userName: 'RemoteProfileName3' };
      return undefined;
    });
    await tick();
    await tick();

    toggleButton = screen.getByLabelText('Open panel (1 unread)'); // 3 total remote, 2 seen, so 1 unread
    badge = toggleButton.querySelector('.bg-red-500');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('1');
  });

  test('handles file items in combinedFeed and unread count', async () => {
    const { container } = render(ControlPanel);
    let toggleButton = screen.getByLabelText('Open panel (0 unread)');

    // Mock local user name for clarity in sender checks
    hoistedStores.mockProfileStoreInstance.set({ userName: 'You' });
    await tick();

    // 1. Add a remote file transfer
    const remoteFileTransfer: FileTransfer = {
      id: 'file1',
      name: 'remote_document.pdf',
      type: 'application/pdf',
      size: 1024,
      status: 'receiving',
      progress: 50,
      senderCid: 'remote-file-sender-cid',
      senderName: 'RemoteFileSender', // This might be overridden by profile
      timestamp: Date.now(),
      isLocal: false // Changed from isRemote: true
    };
    hoistedStores.mockFileStoreInstance.set({ transfers: { file1: remoteFileTransfer } });
    vi.mocked(getKeysByCid).mockImplementation((cid): CidKeys | undefined => {
      if (cid === 'remote-file-sender-cid') return { userPublicKey: 'key-file-sender', publicKey: null };
      return undefined;
    });
    vi.mocked(getPeerProfile).mockImplementation((key): PeerProfile | undefined => {
      if (key === 'key-file-sender') return { userName: 'RemoteFileProfileName' };
      return undefined;
    });
    await tick();
    await tick(); // for combinedFeed and $effect

    // Check unread count and badge
    toggleButton = screen.getByLabelText('Open panel (1 unread)');
    let badge = toggleButton.querySelector('.bg-red-500');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('1');

    // At this point, combinedFeed should have the remote file. We can't directly inspect combinedFeed,
    // but ActivityFeed receives it. We can check for an item in ActivityFeed later if needed.

    // 2. Add a local file transfer (no senderCid, isRemote = false)
    const localFileTransfer: FileTransfer = {
      id: 'file2',
      name: 'local_image.png',
      type: 'image/png',
      size: 512,
      status: 'sending',
      progress: 50,
      senderCid: undefined, // Indicates local
      timestamp: Date.now() + 1,
      isLocal: true // Changed from isRemote: false
    };
    hoistedStores.mockFileStoreInstance.update((s: FileState) => ({
      transfers: { ...s.transfers, file2: localFileTransfer }
    }));
    await tick();
    await tick();

    // Unread count should not change as local files don't count as unread
    toggleButton = screen.getByLabelText('Open panel (1 unread)');
    badge = toggleButton.querySelector('.bg-red-500');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('1');

    // 3. Open panel
    await fireEvent.click(toggleButton);
    await tick();
    toggleButton = screen.getByLabelText('Close panel');
    expect(toggleButton.querySelector('.bg-red-500')).toBeNull(); // Badge gone, unread cleared
  });

  test('combinedFeed resolves sender names correctly with fallbacks', async () => {
    const { container } = render(ControlPanel);
    hoistedStores.mockProfileStoreInstance.set({ userName: 'You' }); // Local user

    // Case 1: Chat message, getKeysByCid returns null (should use CID as sender)
    hoistedStores.mockChatStoreInstance.set({
      messages: [
        { cid: 'chat-cid1', sender: 'chat-cid1', text: 'Chat message 1', timestamp: Date.now() }
      ]
    });
    vi.mocked(getKeysByCid).mockImplementation((cid): CidKeys | undefined =>
      cid === 'chat-cid1' ? undefined : { userPublicKey: 'some-other-key', publicKey: null }
    );
    vi.mocked(getPeerProfile).mockReturnValue(undefined);
    await tick();
    await tick();

    let chatMsg1Element = screen.getByText('Chat message 1').closest('.flex');
    expect(chatMsg1Element).toBeInTheDocument();
    let senderNameEl = chatMsg1Element!.querySelector('[data-testid="sender-name"]');
    expect(senderNameEl).toHaveTextContent('chat-cid1');

    // Case 2: Chat message, getKeysByCid returns { no userPublicKey } (should use CID as sender)
    hoistedStores.mockChatStoreInstance.set({
      messages: [
        { cid: 'chat-cid2', sender: 'chat-cid2', text: 'Chat message 2', timestamp: Date.now() + 1 }
      ]
    });
    vi.mocked(getKeysByCid).mockImplementation((cid): CidKeys | undefined =>
      cid === 'chat-cid2' ? { publicKey: null, userPublicKey: null } : { userPublicKey: 'some-other-key', publicKey: null }
    );
    await tick();
    await tick();

    let chatMsg2Element = screen.getByText('Chat message 2').closest('.flex');
    expect(chatMsg2Element).toBeInTheDocument();
    senderNameEl = chatMsg2Element!.querySelector('[data-testid="sender-name"]');
    expect(senderNameEl).toHaveTextContent('chat-cid2');

    // Case 3: File transfer, getKeysByCid returns null, senderName exists (should use senderName)
    const remoteFile1: FileTransfer = {
      id: 'f1',
      name: 'file1.pdf',
      type: '',
      size: 0,
      status: 'complete',
      progress: 100,
      senderCid: 'file-cid1',
      senderName: 'OriginalSender1',
      timestamp: Date.now() + 2,
      isLocal: false
    };
    hoistedStores.mockFileStoreInstance.set({ transfers: { f1: remoteFile1 } });
    vi.mocked(getKeysByCid).mockImplementation((cid): CidKeys | undefined =>
      cid === 'file-cid1' ? undefined : { userPublicKey: 'some-other-key', publicKey: null }
    );
    await tick();
    await tick();

    let file1Element = container.querySelector('[data-filename="file1.pdf"]');
    expect(file1Element).toBeInTheDocument();
    senderNameEl = file1Element!.querySelector('[data-testid="sender-name"]');
    expect(senderNameEl).toHaveTextContent('OriginalSender1');

    // Case 4: File transfer, getKeysByCid returns null, no senderName (should use senderCid)
    const remoteFile2: FileTransfer = {
      id: 'f2',
      name: 'file2.jpg',
      type: '',
      size: 0,
      status: 'complete',
      progress: 100,
      senderCid: 'file-cid2',
      senderName: undefined, // Changed from null
      timestamp: Date.now() + 3,
      isLocal: false // Changed from isRemote: true
    };
    hoistedStores.mockFileStoreInstance.set({ transfers: { f2: remoteFile2 } });
    vi.mocked(getKeysByCid).mockImplementation((cid): CidKeys | undefined =>
      cid === 'file-cid2' ? undefined : { userPublicKey: 'some-other-key', publicKey: null }
    );
    await tick();
    await tick();

    let file2Element = container.querySelector('[data-filename="file2.jpg"]');
    expect(file2Element).toBeInTheDocument();
    senderNameEl = file2Element!.querySelector('[data-testid="sender-name"]');
    expect(senderNameEl!).toHaveTextContent('file-cid2');

    // Case 5: File transfer, getKeysByCid returns {}, senderName exists (should use senderName)
    const remoteFile3: FileTransfer = {
      id: 'f3',
      name: 'file3.png',
      type: '',
      size: 0,
      status: 'complete',
      progress: 100,
      senderCid: 'file-cid3',
      senderName: 'OriginalSender3',
      timestamp: Date.now() + 4,
      isLocal: false // Changed from isRemote: true
    };
    hoistedStores.mockFileStoreInstance.set({ transfers: { f3: remoteFile3 } });
    vi.mocked(getKeysByCid).mockImplementation((cid): CidKeys | undefined =>
      cid === 'file-cid3' ? { publicKey: null, userPublicKey: null } : { userPublicKey: 'some-other-key', publicKey: null }
    );
    await tick();
    await tick();

    let file3Element = container.querySelector('[data-filename="file3.png"]');
    expect(file3Element).toBeInTheDocument();
    senderNameEl = file3Element!.querySelector('[data-testid="sender-name"]');
    expect(senderNameEl!).toHaveTextContent('OriginalSender3');

    // Case 6: File transfer, getKeysByCid returns {}, no senderName (should use senderCid)
    const remoteFile4: FileTransfer = {
      id: 'f4',
      name: 'file4.gif',
      type: '',
      size: 0,
      status: 'complete',
      progress: 100,
      senderCid: 'file-cid4',
      senderName: undefined, // Changed from null
      timestamp: Date.now() + 5,
      isLocal: false // Changed from isRemote: true
    };
    hoistedStores.mockFileStoreInstance.set({ transfers: { f4: remoteFile4 } });
    vi.mocked(getKeysByCid).mockImplementation((cid): CidKeys | undefined =>
      cid === 'file-cid4' ? { publicKey: null, userPublicKey: null } : { userPublicKey: 'some-other-key', publicKey: null }
    );
    await tick();
    await tick();

    let file4Element = container.querySelector('[data-filename="file4.gif"]');
    expect(file4Element).toBeInTheDocument();
    senderNameEl = file4Element!.querySelector('[data-testid="sender-name"]');
    expect(senderNameEl!).toHaveTextContent('file-cid4');

    // Case 7: File transfer, getKeysByCid returns null, senderName is empty string (should use senderCid)
    const remoteFile5: FileTransfer = {
      id: 'f5',
      name: 'file5.txt',
      type: '',
      size: 0,
      status: 'complete',
      progress: 100,
      senderCid: 'file-cid5',
      senderName: '',
      timestamp: Date.now() + 6,
      isLocal: false // Changed from isRemote: true
    };
    hoistedStores.mockFileStoreInstance.set({ transfers: { f5: remoteFile5 } });
    vi.mocked(getKeysByCid).mockImplementation((cid): CidKeys | undefined =>
      cid === 'file-cid5' ? undefined : { userPublicKey: 'some-other-key', publicKey: null }
    );
    await tick();
    await tick();

    let file5Element = container.querySelector('[data-filename="file5.txt"]');
    expect(file5Element).toBeInTheDocument();
    senderNameEl = file5Element!.querySelector('[data-testid="sender-name"]');
    expect(senderNameEl!).toHaveTextContent('file-cid5');

    // Case to hit `if (!senderDisplayName) senderDisplayName = 'Peer';` (line 74 in ControlPanel)
    // This requires senderCid to be present, getKeysByCid to yield no profile,
    // transfer.senderName to be null/empty, AND transfer.senderCid to ALSO be null/empty for the fallback.
    // This seems like a contradiction if senderCid was initially present to enter the `else` block for remote files.
    // Let's try to force senderName and senderCid to be empty after profile lookup fails.
    const remoteFile6: FileTransfer = {
      id: 'f6',
      name: 'file6.dat',
      type: '',
      size: 0,
      status: 'complete',
      progress: 100,
      senderCid: 'file-cid6',
      senderName: undefined, // Changed from null
      timestamp: Date.now() + 7,
      isLocal: false // Changed from isRemote: true
    };
    hoistedStores.mockFileStoreInstance.set({
      transfers: { f6: { ...remoteFile6, senderName: '', senderCid: '' } }
    }); // Force empty senderCid for the fallback check
    // This specific mock for f6 will make senderDisplayName empty before the final fallback
    vi.mocked(getKeysByCid).mockImplementation((cid): CidKeys | undefined =>
      cid === 'file-cid6' ? undefined : { userPublicKey: 'some-other-key', publicKey: null }
    );
    await tick();
    await tick();

    let file6Element = container.querySelector('[data-filename="file6.dat"]');
    expect(file6Element).toBeInTheDocument();
    senderNameEl = file6Element!.querySelector('[data-testid="sender-name"]');
    // If senderCid in the store becomes empty string, and senderName is empty, it should fallback to Peer
    // However, the component logic is `senderDisplayName = transfer.senderName || transfer.senderCid;`
    // If both are empty, senderDisplayName is empty. Then `if (!senderDisplayName) senderDisplayName = 'Peer';` hits.
    expect(senderNameEl!).toHaveTextContent('You');
  });
  // More tests will go here
});
