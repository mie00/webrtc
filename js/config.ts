import { WebRTCApp } from './WebRTCApp.js';

const initialConfig = JSON.parse(window.localStorage.getItem('dealer-config') || '{}');

const configOverlay = document.getElementById('config-overlay');
if (configOverlay) {
    Array.from(configOverlay.querySelectorAll('input, select')).forEach((x: Element) => {
        const inputElement = x as HTMLInputElement | HTMLSelectElement;
        if (inputElement.id in initialConfig) {
            inputElement.value = initialConfig[inputElement.id];
        }
    });
}

function getConfig(): Record<string, string> {
    const cfg: Record<string, string> = {};
    const configOverlay = document.getElementById('config-overlay');
    if (configOverlay) {
        Array.from(configOverlay.querySelectorAll('input, select')).forEach((x: Element) => {
            const element = x as HTMLInputElement | HTMLSelectElement;
            cfg[element.id] = element.value;
        });
    }
    return cfg;
}

function setConfig(k: string, v: string): void {
    Array.from(document.getElementById('config-overlay').querySelectorAll(`#${k}`)).forEach((x: Element) => {
        const element = x as HTMLInputElement | HTMLSelectElement;
        element.value = v;
    });
    window.localStorage.setItem('dealer-config', JSON.stringify({ ...getConfig(), [k]: v }));
}

document.getElementById('save-button')?.addEventListener('click', () => {
    const newConfig = getConfig();
    window.localStorage.setItem('dealer-config', JSON.stringify(newConfig));
    window.app.config = newConfig;
    document.getElementById('config-overlay')?.classList.add('hidden');
    WebRTCApp.reset();
});

export {
    getConfig
}
