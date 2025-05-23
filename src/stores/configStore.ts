import { writable, derived, get } from 'svelte/store';

// Define a type for the configuration
export interface Config {
  'config-loader': 'server' | 'client';
  'user-name': string;
  'config-host': string;
  'stun-servers': string;
  'turn-server-v2': string;
  'turn-username': string;
  'turn-password': string;
  'blur-video': 'yes' | 'no';
  'audio-device'?: string;
  'video-device'?: string;
  'coordinator-url': string; // Added coordinator URL
  [key: string]: string | undefined;
}

// Default configuration
const defaultConfig: Config = {
  'config-loader': 'server',
  'user-name': '',
  'config-host': '',
  'stun-servers': 'dealer.mie00.com:3478',
  'turn-server-v2': 'dealer.mie00.com:5349',
  'turn-username': 'mie',
  'turn-password': '',
  'blur-video': 'no',
  'audio-device': 'default|default',
  'video-device': 'default|default',
  'coordinator-url': 'ws://127.0.0.1:5001' // Added default coordinator URL
};

// Load initial config from localStorage
function loadInitialConfig(): Config {
  try {
    const savedConfig = localStorage.getItem('dealer-config');
    return savedConfig ? { ...defaultConfig, ...JSON.parse(savedConfig) } : defaultConfig;
  } catch (e) {
    console.error('Failed to load config from localStorage:', e);
    return defaultConfig;
  }
}

// Create the writable store
export const configStore = writable<Config>(loadInitialConfig());

// Subscribe to changes and save to localStorage
configStore.subscribe(config => {
  try {
    localStorage.setItem('dealer-config', JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save config to localStorage:', e);
  }
});

// Helper functions to work with the store
export function updateConfig(key: keyof Config, value: string): void {
  configStore.update(config => ({ ...config, [key]: value }));
}

export function resetConfig(): void {
  configStore.set(defaultConfig);
}

// Create derived stores for specific config needs
export const isServerMode = derived(
  configStore,
  $config => $config['config-loader'] === 'server'
);

export const rtcServers = derived(configStore, $config => {
  const iceServers: RTCIceServer[] = [];
  
  // Add STUN servers
  const stunServers = $config['stun-servers'].split(',').filter(server => server.trim());
  for (const server of stunServers) {
    iceServers.push({
      urls: `stun:${server}`
    });
  }
  
  // Add TURN server if configured
  if ($config['turn-server-v2'] && $config['turn-username'] && $config['turn-password']) {
    iceServers.push({
      urls: `turn:${$config['turn-server-v2']}`,
      username: $config['turn-username'],
      credential: $config['turn-password']
    });
  }
  
  return { iceServers };
});

// Function to get current config value (for non-reactive contexts)
export function getConfigValue(key: keyof Config): string {
  return get(configStore)[key] || '';
}

// Function to get all config values as a plain object (for compatibility)
export function getAllConfig(): Record<string, string | undefined> {
  return get(configStore);
}
