const initialConfig = JSON.parse(window.localStorage.getItem('dealer-config') || '{}');

Array.from(document.getElementById('config-overlay').querySelectorAll('input')).forEach(x => {
    if (x.id in initialConfig) {
        x.value = initialConfig[x.id];
    }
});

function getConfig() {
    const cfg = {};
    Array.from(document.getElementById('config-overlay').querySelectorAll('input')).forEach(element => {
        cfg[element.id] = element.value;
    });
    return cfg
}

document.getElementById('save-button').addEventListener('click', () => {
    const newConfig = getConfig();
    window.localStorage.setItem('dealer-config', JSON.stringify(newConfig));
    app.config = newConfig;
    document.getElementById('config-overlay').classList.add('hidden');
})
