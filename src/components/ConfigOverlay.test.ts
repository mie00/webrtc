import { render, fireEvent, screen, waitFor } from '@testing-library/svelte';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { tick } from 'svelte';
import ConfigOverlay from './ConfigOverlay.svelte';

// Mock the configStore as it's used internally by the component
vi.mock('../stores/configStore.ts', async () => {
  // Added async here
  const {
    writable: actualWritable
  }: { writable: <T>(value: T, start?: any) => import('svelte/store').Writable<T> } =
    await vi.importActual('svelte/store'); // Import inside
  // Define the mock data structure
  const mockConfigData = {
    general: {
      configLoader: 'client' as 'client' | 'server',
      configHost: '',
      identityProviderHost: '',
      coordinatorUrl: ''
    },
    profile: {
      userName: 'TestUser'
    },
    rtc: {
      stunServers: 'stun:stun.l.google.com:19302',
      turnServerV2: '',
      turnUsername: '',
      turnPassword: ''
    },
    media: {
      audioDevice: 'default|default',
      videoDevice: 'default|default',
      blurVideo: 'no' as 'yes' | 'no'
    }
  };

  return {
    configStore: actualWritable(mockConfigData),
    updateConfig: vi.fn()
  };
});

// Mock navigator.mediaDevices.enumerateDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    enumerateDevices: vi.fn(async () => [
      { deviceId: 'audio1', kind: 'audioinput', label: 'Mic 1', groupId: 'group1' },
      { deviceId: 'video1', kind: 'videoinput', label: 'Cam 1', groupId: 'group2' }
    ])
  },
  writable: true
});

describe('ConfigOverlay.svelte', () => {
  it('renders general settings by default and allows tab switching', async () => {
    const handleClose = vi.fn();
    const handleConfigUpdated = vi.fn();

    render(ConfigOverlay, {
      show: true,
      onclose: handleClose,
      onconfigUpdated: handleConfigUpdated
    });

    // Check if General Settings are visible
    expect(screen.getByText('General Settings')).toBeInTheDocument();

    // Switch to RTC tab
    const rtcTabButton = screen.getByText('RTC');
    await fireEvent.click(rtcTabButton);
    expect(screen.getByText('RTC Settings')).toBeInTheDocument();

    // Switch to Media tab
    const mediaTabButton = screen.getByText('Media');
    await fireEvent.click(mediaTabButton);
    expect(screen.getByText('Media Settings')).toBeInTheDocument();
    expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalled();

    // Switch to Profile tab
    const profileTabButton = screen.getByText('Profile');
    await fireEvent.click(profileTabButton);
    await tick(); // Allow Svelte to process the tab change
    await tick(); // Add a second tick to ensure reactive updates fully propagate to DOM
    expect(screen.getByText('Profile Settings')).toBeInTheDocument();

    // Wait for the username input to appear and its value to be correctly set.
    // Re-querying getByLabelText inside waitFor ensures we are checking the most up-to-date element.
    await waitFor(() => {
      const usernameInput = screen.getByLabelText('Username') as HTMLInputElement;
      // First, ensure the input element itself is in the document within the waitFor retry.
      expect(usernameInput).toBeInTheDocument();
      // Then, check its value.
      expect(usernameInput.value).toBe('TestUser');
    });
    // Check the value property directly, as getByDisplayValue might have issues with
    // reactive updates in some JSDOM/Svelte 5 scenarios after a tab switch.
    // If the above passes, the original assertion might also pass, but this is more direct.
    // expect(screen.getByDisplayValue('TestUser')).toBeInTheDocument();

    // Click Save & Close
    const saveButton = screen.getByText('Save & Close');
    await fireEvent.click(saveButton);

    expect(handleConfigUpdated).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('closes when clicking outside the modal content', async () => {
    const handleClose = vi.fn();
    render(ConfigOverlay, { show: true, onclose: handleClose });

    const overlay = screen.getByRole('dialog');
    await fireEvent.click(overlay); // Click on the backdrop

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('closes when Escape key is pressed', async () => {
    const handleClose = vi.fn();
    render(ConfigOverlay, { show: true, onclose: handleClose });

    const overlay = screen.getByRole('dialog'); // The dialog itself can receive keypress
    await fireEvent.keyPress(overlay, { key: 'Escape', code: 'Escape' });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  // Add more tests for input changes and their effects on the store if needed
});
