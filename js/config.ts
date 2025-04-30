const initialConfig = JSON.parse(window.localStorage.getItem('dealer-config') || '{}');

Array.from(document.getElementById('config-overlay').querySelectorAll('input, select')).forEach((x: HTMLInputElement | HTMLSelectElement) => {
    if (x.id in initialConfig) {
        x.value = initialConfig[x.id];
    }
});

function getConfig(): Record<string, string> {
    const cfg: Record<string, string> = {};
    Array.from(document.getElementById('config-overlay').querySelectorAll('input, select')).forEach((element: HTMLInputElement | HTMLSelectElement) => {
        cfg[element.id] = element.value;
    });
    return cfg;
}

function setConfig(k: string, v: string): void {
    Array.from(document.getElementById('config-overlay').querySelectorAll(`#${k}`)).forEach((element: HTMLInputElement | HTMLSelectElement) => {
        element.value = v;
    });
    window.localStorage.setItem('dealer-config', JSON.stringify({ ...getConfig(), [k]: v }));
}

document.getElementById('save-button')?.addEventListener('click', () => {
    const newConfig = getConfig();
    window.localStorage.setItem('dealer-config', JSON.stringify(newConfig));
    (window as any).app.config = newConfig;
    document.getElementById('config-overlay')?.classList.add('hidden');
    (window as any).reset();
});
