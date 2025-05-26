<script lang="ts">
  import {
    configStore,
    updateConfig,
    type Config,
    type GeneralConfig,
    type RtcConfig,
    type MediaConfig
  } from '../stores/configStore.js';
  import { onMount } from 'svelte'; // onMount is not strictly needed if using $effect for this

  // Props
  let {
    show = false,
    onclose,
    onconfigUpdated
  } = $props<{
    show?: boolean;
    onclose?: () => void;
    onconfigUpdated?: () => void;
  }>();

  let currentTab: keyof Config = $state('general');
  let audioInputDevices: MediaDeviceInfo[] = $state([]);
  let videoInputDevices: MediaDeviceInfo[] = $state([]);

  async function loadMediaDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      audioInputDevices = devices.filter((device) => device.kind === 'audioinput');
      videoInputDevices = devices.filter((device) => device.kind === 'videoinput');
    } catch (err) {
      console.error('Error enumerating media devices:', err);
      // Keep device lists empty, dropdowns will show 'Default' or be minimal
    }
  }

  $effect(() => {
    if (show && currentTab === 'media') {
      loadMediaDevices();
    }
  });

  // Event handlers
  function handleClose(event: Event) {
    if (event.target === event.currentTarget) {
      if (onclose) onclose();
    }
  }

  function handleSave() {
    if (onconfigUpdated) onconfigUpdated();
    if (onclose) onclose();
  }

  function handleInputChange<G extends keyof Config, K extends keyof Config[G]>(
    event: Event,
    group: G,
    key: K
  ) {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    updateConfig(group, key, target.value as Config[G][K]);
  }
</script>

{#if show}
  <div
    id="config-overlay"
    class="fixed inset-0 bg-black/75 flex justify-center items-center z-60"
    role="dialog"
    tabindex="0"
    aria-modal="true"
    onclick={handleClose}
    onkeypress={(e) => e.key === 'Escape' && onclose && onclose()}
  >
    <div
      class="bg-white rounded-md shadow-md flex w-full max-w-2xl h-auto max-h-[80vh]"
      role="document"
    >
      <!-- Tabs on the left -->
      <div class="w-1/4 border-r border-gray-300 p-2 flex flex-col space-y-1">
        <button
          onclick={() => (currentTab = 'general')}
          class:bg-gray-200={currentTab === 'general'}
          class="block w-full text-left p-2 hover:bg-gray-100 rounded-md"
        >
          General
        </button>
        <button
          onclick={() => (currentTab = 'rtc')}
          class:bg-gray-200={currentTab === 'rtc'}
          class="block w-full text-left p-2 hover:bg-gray-100 rounded-md"
        >
          RTC
        </button>
        <button
          onclick={() => (currentTab = 'media')}
          class:bg-gray-200={currentTab === 'media'}
          class="block w-full text-left p-2 hover:bg-gray-100 rounded-md"
        >
          Media
        </button>
      </div>

      <!-- Content on the right -->
      <div class="flex-1 p-4 overflow-y-auto flex flex-col">
        <div class="flex-grow space-y-3">
          {#if currentTab === 'general'}
            <h2 class="text-xl font-semibold mb-3">General Settings</h2>
            <div class="flex flex-col space-y-1">
              <label for="config-loader" class="text-sm font-medium">Loader Mode</label>
              <select
                id="config-loader"
                class="w-full border border-gray-300 px-3 py-2 rounded-md"
                value={$configStore.general.configLoader}
                onchange={(e) => handleInputChange(e, 'general', 'configLoader')}
              >
                <option value="server">Server</option>
                <option value="client">Client</option>
              </select>
            </div>

            <div class="flex flex-col space-y-1">
              <label for="user-name" class="text-sm font-medium">Username</label>
              <input
                id="user-name"
                type="text"
                placeholder="Username"
                class="w-full border border-gray-300 px-3 py-2 rounded-md"
                value={$configStore.general.userName}
                oninput={(e) => handleInputChange(e, 'general', 'userName')}
              />
            </div>

            <div class="flex flex-col space-y-1">
              <label for="config-host" class="text-sm font-medium">Host</label>
              <input
                id="config-host"
                type="text"
                placeholder="Host URL (e.g., https://app.example.com)"
                class="w-full border border-gray-300 px-3 py-2 rounded-md"
                value={$configStore.general.configHost}
                oninput={(e) => handleInputChange(e, 'general', 'configHost')}
              />
            </div>

            <div class="flex flex-col space-y-1">
              <label for="identity-provider-host" class="text-sm font-medium"
                >Identity Provider Host</label
              >
              <input
                id="identity-provider-host"
                type="text"
                placeholder="Host (e.g., https://example.com)"
                class="w-full border border-gray-300 px-3 py-2 rounded-md"
                value={$configStore.general.identityProviderHost}
                oninput={(e) => handleInputChange(e, 'general', 'identityProviderHost')}
              />
            </div>

            <div class="flex flex-col space-y-1">
              <label for="coordinator-url" class="text-sm font-medium">Coordinator URL</label>
              <input
                id="coordinator-url"
                type="text"
                placeholder="Coordinator URL (e.g., ws://localhost:5001)"
                class="w-full border border-gray-300 px-3 py-2 rounded-md"
                value={$configStore.general.coordinatorUrl}
                oninput={(e) => handleInputChange(e, 'general', 'coordinatorUrl')}
              />
            </div>
          {/if}

          {#if currentTab === 'rtc'}
            <h2 class="text-xl font-semibold mb-3">RTC Settings</h2>
            <div class="flex flex-col space-y-1">
              <label for="stun-servers" class="text-sm font-medium">STUN Servers</label>
              <input
                id="stun-servers"
                type="text"
                placeholder="e.g., stun.l.google.com:19302"
                class="w-full border border-gray-300 px-3 py-2 rounded-md"
                value={$configStore.rtc.stunServers}
                oninput={(e) => handleInputChange(e, 'rtc', 'stunServers')}
              />
            </div>

            <div class="flex flex-col space-y-1">
              <label for="turn-server-v2" class="text-sm font-medium">TURN Server</label>
              <input
                id="turn-server-v2"
                type="text"
                placeholder="e.g., turn.example.com:3478"
                class="w-full border border-gray-300 px-3 py-2 rounded-md"
                value={$configStore.rtc.turnServerV2}
                oninput={(e) => handleInputChange(e, 'rtc', 'turnServerV2')}
              />
            </div>

            <div class="flex flex-col space-y-1">
              <label for="turn-username" class="text-sm font-medium">TURN Username</label>
              <input
                id="turn-username"
                type="text"
                placeholder="TURN Username"
                class="w-full border border-gray-300 px-3 py-2 rounded-md"
                value={$configStore.rtc.turnUsername}
                oninput={(e) => handleInputChange(e, 'rtc', 'turnUsername')}
              />
            </div>

            <div class="flex flex-col space-y-1">
              <label for="turn-password" class="text-sm font-medium">TURN Password</label>
              <input
                id="turn-password"
                type="password"
                placeholder="TURN Password"
                class="w-full border border-gray-300 px-3 py-2 rounded-md"
                value={$configStore.rtc.turnPassword}
                oninput={(e) => handleInputChange(e, 'rtc', 'turnPassword')}
              />
            </div>
          {/if}

          {#if currentTab === 'media'}
            <h2 class="text-xl font-semibold mb-3">Media Settings</h2>
            <div class="flex flex-col space-y-1">
              <label for="audio-device" class="text-sm font-medium">Audio Device</label>
              <select
                id="audio-device"
                class="w-full border border-gray-300 px-3 py-2 rounded-md"
                value={$configStore.media.audioDevice}
                onchange={(e) => handleInputChange(e, 'media', 'audioDevice')}
              >
                <option value="default|default">Default</option>
                {#each audioInputDevices as device, i (device.deviceId)}
                  <option value={`${device.groupId}|${device.deviceId}`}>
                    {device.label || `Audio Input ${i + 1}`}
                  </option>
                {/each}
              </select>
            </div>

            <div class="flex flex-col space-y-1">
              <label for="video-device" class="text-sm font-medium">Video Device</label>
              <select
                id="video-device"
                class="w-full border border-gray-300 px-3 py-2 rounded-md"
                value={$configStore.media.videoDevice}
                onchange={(e) => handleInputChange(e, 'media', 'videoDevice')}
              >
                <option value="default|default">Default</option>
                {#each videoInputDevices as device, i (device.deviceId)}
                  <option value={`${device.groupId}|${device.deviceId}`}>
                    {device.label || `Video Input ${i + 1}`}
                  </option>
                {/each}
              </select>
            </div>

            <div class="flex flex-col space-y-1">
              <label for="blur-video" class="text-sm font-medium">Blur Video Background</label>
              <select
                id="blur-video"
                class="w-full border border-gray-300 px-3 py-2 rounded-md"
                value={$configStore.media.blurVideo}
                onchange={(e) => handleInputChange(e, 'media', 'blurVideo')}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
          {/if}
        </div>

        <div class="mt-4 pt-4 border-t border-gray-200 text-right">
          <button
            id="save-button"
            onclick={handleSave}
            class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
