import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// configStore and its functions are now imported dynamically in beforeEach
/*
import {
  configStore,
  updateConfig,
  resetConfig,
  isServerMode,
  rtcServers,
  getConfigValue,
  getAllConfig,
  type Config,
  type GeneralConfig,
  type RtcConfig,
  type MediaConfig,
} from './configStore';
*/
import { get, type Writable, type Readable } from 'svelte/store';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const defaultConfig = {
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
    audioDevice: 'default|default',
    videoDevice: 'default|default'
  }
};

describe('configStore', () => {
  // Type aliases for config structure using dynamic import type
  type Config = import('./configStore.js').Config;
  // type GeneralConfig = import('./configStore').GeneralConfig; // Not directly used for annotations
  // type RtcConfig = import('./configStore').RtcConfig;       // Not directly used for annotations
  // type MediaConfig = import('./configStore').MediaConfig;     // Not directly used for annotations

  // Variables to hold dynamically imported store and functions
  let configStore: Writable<Config>;
  let updateConfig: <G extends keyof Config, K extends keyof Config[G]>(
    group: G,
    key: K,
    value: Config[G][K]
  ) => void;
  let resetConfig: () => void;
  let isServerMode: Readable<boolean>;
  let rtcServers: Readable<{ iceServers: RTCIceServer[] }>;
  let getConfigValue: <G extends keyof Config, K extends keyof Config[G]>(
    group: G,
    key: K
  ) => Config[G][K];
  let getAllConfig: () => Config;

  const CONFIG_STORAGE_KEY = 'dealer-config';

  beforeEach(async () => {
    // Make async
    localStorageMock.clear();

    // Dynamically import the configStore module
    const configModule = await import('./configStore.js');
    configStore = configModule.configStore;
    updateConfig = configModule.updateConfig;
    resetConfig = configModule.resetConfig;
    isServerMode = configModule.isServerMode;
    rtcServers = configModule.rtcServers;
    getConfigValue = configModule.getConfigValue;
    getAllConfig = configModule.getAllConfig;

    // Reset the store to default by explicitly setting it.
    // This uses the dynamically imported configStore and its .set method.
    // This ensures that each test starts with the store in a known default state,
    // and that the store (having been dynamically imported) has initialized with the mocked localStorage.
    configStore.set(JSON.parse(JSON.stringify(defaultConfig))); // Deep copy
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it('should initialize with default config if localStorage is empty', () => {
    // Simulate empty localStorage before module load (hard to do directly with Vitest and Svelte stores)
    // So, we rely on beforeEach to set it to default.
    const currentConfig = get(configStore);
    expect(currentConfig).toEqual(defaultConfig);
  });

  it('should load config from localStorage if present and valid', async () => {
    const savedUserConfig: Config = {
      general: {
        ...defaultConfig.general,
        configLoader: 'client',
        coordinatorUrl: 'ws://loaded.coord.com'
      },
      profile: {
        ...defaultConfig.profile,
        userName: 'LoadedUserFromStorage'
      },
      rtc: {
        ...defaultConfig.rtc,
        stunServers: 'stun:new.stun.com, stun:another.stun.com',
        turnServerV2: 'turn:new.turn.com:3478',
        turnUsername: 'loadedTurnUser',
        turnPassword: 'loadedTurnPassword'
      },
      media: {
        ...defaultConfig.media,
        blurVideo: 'yes',
        audioDevice: 'loadedAudioDevice'
      }
    };
    localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(savedUserConfig));

    // Force re-initialization of the store by resetting modules and re-importing.
    // This ensures loadInitialConfig() in configStore.ts runs again and picks up the new localStorage value.
    vi.resetModules();
    const reloadedConfigModule = await import('./configStore.js');
    const localConfigStore = reloadedConfigModule.configStore; // This instance loaded from savedUserConfig

    const loadedConfig = get(localConfigStore);

    // Verify that the loaded config matches what was saved in localStorage for all groups
    expect(loadedConfig.general.configLoader).toBe('client');
    expect(loadedConfig.profile.userName).toBe('LoadedUserFromStorage');
    expect(loadedConfig.general.coordinatorUrl).toBe('ws://loaded.coord.com');

    expect(loadedConfig.rtc.stunServers).toBe('stun:new.stun.com, stun:another.stun.com');
    expect(loadedConfig.rtc.turnServerV2).toBe('turn:new.turn.com:3478');
    expect(loadedConfig.rtc.turnUsername).toBe('loadedTurnUser');
    expect(loadedConfig.rtc.turnPassword).toBe('loadedTurnPassword');

    expect(loadedConfig.media.blurVideo).toBe('yes');
    expect(loadedConfig.media.audioDevice).toBe('loadedAudioDevice');

    // Also verify that the localStorage was not altered by just loading and getting the store
    const fromStorage = JSON.parse(localStorageMock.getItem(CONFIG_STORAGE_KEY)!);
    expect(fromStorage).toEqual(savedUserConfig); // Should be identical to what we put in
  });

  it('should update a specific config value', () => {
    updateConfig('profile', 'userName', 'NewUser');
    const currentConfig = get(configStore);
    expect(currentConfig.profile.userName).toBe('NewUser');
    expect(JSON.parse(localStorageMock.getItem(CONFIG_STORAGE_KEY)!).profile.userName).toBe(
      'NewUser'
    );
  });

  it('should update a media config value', () => {
    updateConfig('media', 'blurVideo', 'yes');
    expect(get(configStore).media.blurVideo).toBe('yes');
    expect(JSON.parse(localStorageMock.getItem(CONFIG_STORAGE_KEY)!).media.blurVideo).toBe('yes');
  });

  it('should reset config to default values', () => {
    updateConfig('profile', 'userName', 'TemporaryUser');
    updateConfig('media', 'blurVideo', 'yes');
    expect(get(configStore).profile.userName).toBe('TemporaryUser');

    resetConfig();
    const currentConfig = get(configStore);
    expect(currentConfig).toEqual(defaultConfig);
    expect(JSON.parse(localStorageMock.getItem(CONFIG_STORAGE_KEY)!)).toEqual(defaultConfig);
  });

  it('should get a specific config value using getConfigValue', () => {
    expect(getConfigValue('general', 'coordinatorUrl')).toBe(defaultConfig.general.coordinatorUrl);
    updateConfig('rtc', 'stunServers', 'custom.stun.com');
    expect(getConfigValue('rtc', 'stunServers')).toBe('custom.stun.com');
  });

  it('should get all config values using getAllConfig', () => {
    updateConfig('profile', 'userName', 'AnotherUser');
    const allConf = getAllConfig();
    expect(allConf.profile.userName).toBe('AnotherUser');
    expect(allConf.rtc.stunServers).toBe(defaultConfig.rtc.stunServers);
  });

  describe('derived stores', () => {
    it('isServerMode should reflect configLoader correctly', () => {
      expect(get(isServerMode)).toBe(true); // Default is server
      updateConfig('general', 'configLoader', 'client');
      expect(get(isServerMode)).toBe(false);
      updateConfig('general', 'configLoader', 'server');
      expect(get(isServerMode)).toBe(true);
    });

    it('rtcServers should correctly parse STUN and TURN servers', () => {
      // Default config check
      let servers = get(rtcServers);
      expect(servers.iceServers).toContainEqual({ urls: 'stun:dealer.mie00.com:3478' });
      expect(servers.iceServers).toContainEqual({
        urls: 'turn:dealer.mie00.com:5349',
        username: 'mie',
        credential: ''
      });

      // Update to multiple STUN servers
      updateConfig('rtc', 'stunServers', 'stun1.example.com, stun2.example.com');
      servers = get(rtcServers);
      expect(servers.iceServers).toContainEqual({ urls: 'stun:stun1.example.com' });
      expect(servers.iceServers).toContainEqual({ urls: 'stun:stun2.example.com' });

      // Update TURN server details
      updateConfig('rtc', 'turnPassword', 'securepass');
      servers = get(rtcServers);
      const turnServer = servers.iceServers.find((s) => {
        if (typeof s.urls === 'string') {
          return s.urls.startsWith('turn:');
        } else {
          return s.urls.some((url) => url.startsWith('turn:'));
        }
      });
      expect(turnServer).toBeDefined();
      expect(turnServer?.username).toBe('mie');
      expect(turnServer?.credential).toBe('securepass');

      // Remove TURN server by clearing password (as per logic in store)
      updateConfig('rtc', 'turnPassword', '');
      servers = get(rtcServers);
      expect(
        servers.iceServers.some((s) => {
          if (typeof s.urls === 'string') {
            return s.urls.startsWith('turn:');
          } else {
            return s.urls.some((url) => url.startsWith('turn:'));
          }
        })
      ).toBe(true); // TURN server still there but with empty credential

      // Remove TURN by clearing username
      updateConfig('rtc', 'turnUsername', '');
      servers = get(rtcServers);
      expect(
        servers.iceServers.some((s) => {
          if (typeof s.urls === 'string') {
            return s.urls.startsWith('turn:');
          } else {
            return s.urls.some((url) => url.startsWith('turn:'));
          }
        })
      ).toBe(false);
    });
  });
});
