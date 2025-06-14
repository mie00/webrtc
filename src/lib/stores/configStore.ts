import { writable, derived, get } from 'svelte/store';

// Define types for configuration groups
export interface GeneralConfig {
  configLoader: 'server' | 'client';
  configHost: string;
  identityProviderHost: string;
  coordinatorUrl: string;
}

export interface ProfileConfig {
  userName: string;
}

export interface RtcConfig {
  stunServers: string;
  turnServerV2: string;
  turnUsername: string;
  turnPassword: string;
}

export interface MediaConfig {
  blurVideo: 'yes' | 'no';
  audioDevice?: string;
  videoDevice?: string;
}

// Define the main Config interface
export interface Config {
  general: GeneralConfig;
  profile: ProfileConfig;
  rtc: RtcConfig;
  media: MediaConfig;
}

// Default configuration
export const defaultConfig: Config = {
  general: {
    configLoader: 'server',
    configHost: '',
    identityProviderHost: 'https://xauth.mie00.com',
    coordinatorUrl: 'ws://127.0.0.1:5001'
  },
  profile: {
    userName: ''
  },
  rtc: {
    stunServers: 'dealer.mie00.com:3478',
    turnServerV2: 'dealer.mie00.com:5349',
    turnUsername: 'mie',
    turnPassword: ''
  },
  media: {
    blurVideo: 'no',
    audioDevice: '',
    videoDevice: ''
  }
};

// Load initial config from localStorage
function loadInitialConfig(): Config {
  try {
    const savedConfigString = localStorage.getItem('dealer-config');
    if (savedConfigString) {
      const savedConfig = JSON.parse(savedConfigString);
      // Basic structural check for the new grouped format
      if (
        savedConfig &&
        typeof savedConfig === 'object' &&
        'general' in savedConfig &&
        'profile' in savedConfig && // Ensure profile key exists
        'rtc' in savedConfig &&
        'media' in savedConfig &&
        typeof savedConfig.general === 'object' &&
        typeof savedConfig.profile === 'object' && // Ensure profile is an object
        typeof savedConfig.rtc === 'object' &&
        typeof savedConfig.media === 'object'
      ) {
        // Deep merge with defaultConfig to ensure all keys are present and defaults are applied for missing ones
        return {
          general: { ...defaultConfig.general, ...savedConfig.general },
          profile: { ...defaultConfig.profile, ...(savedConfig.profile || {}) },
          rtc: { ...defaultConfig.rtc, ...savedConfig.rtc },
          media: { ...defaultConfig.media, ...savedConfig.media }
        };
      }
    }
    return defaultConfig;
  } catch (e) {
    console.error('Failed to load config from localStorage:', e);
    return defaultConfig;
  }
}

// Create the writable store
export const configStore = writable<Config>(loadInitialConfig());

// Subscribe to changes and save to localStorage
configStore.subscribe((config) => {
  try {
    localStorage.setItem('dealer-config', JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save config to localStorage:', e);
  }
});

// Helper functions to work with the store
export function updateConfig<G extends keyof Config, K extends keyof Config[G]>(
  group: G,
  key: K,
  value: Config[G][K]
): void {
  configStore.update((currentConfig) => {
    const newGroup = { ...currentConfig[group], [key]: value };
    return { ...currentConfig, [group]: newGroup };
  });
}

export function resetConfig(): void {
  configStore.set(defaultConfig);
}

// Create derived stores for specific config needs
export const isServerMode = derived(
  configStore,
  ($config) => $config.general.configLoader === 'server'
);

export const rtcServers = derived(configStore, ($config) => {
  const iceServers: RTCIceServer[] = [];

  // Add STUN servers
  const stunServersList = $config.rtc.stunServers
    .split(',')
    .map((s) => s.trim())
    .filter((server) => server);
  for (const server of stunServersList) {
    iceServers.push({
      urls: `stun:${server}`
    });
  }

  // Add TURN server if configured
  if (
    $config.rtc.turnServerV2 &&
    $config.rtc.turnUsername &&
    typeof $config.rtc.turnPassword === 'string'
  ) {
    iceServers.push({
      urls: `turn:${$config.rtc.turnServerV2}`,
      username: $config.rtc.turnUsername,
      credential: $config.rtc.turnPassword
    });
  }

  return { iceServers };
});

// Function to get current config value (for non-reactive contexts)
export function getConfigValue<G extends keyof Config, K extends keyof Config[G]>(
  group: G,
  key: K
): Config[G][K] {
  return get(configStore)[group][key];
}

// Function to get all config values as a plain object
export function getAllConfig(): Config {
  return get(configStore);
}
