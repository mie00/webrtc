/**
 * @deprecated Use the Svelte store in src/stores/configStore.ts instead
 */

import { getAllConfig, updateConfig } from '../../stores/configStore';

/**
 * Get the current configuration
 * @returns The current configuration as a Record<string, string>
 * @deprecated Use the configStore from src/stores/configStore.ts instead
 */
function getConfig(): Record<string, string> {
    return getAllConfig();
}

/**
 * Set a configuration value
 * @param k The key to set
 * @param v The value to set
 * @deprecated Use updateConfig from src/stores/configStore.ts instead
 */
function setConfig(k: string, v: string): void {
    updateConfig(k, v);
}

// Remove the event listener as it's now handled by the Svelte component
// The save button is now handled by the ConfigOverlay component

export {
    getConfig,
    setConfig
}
