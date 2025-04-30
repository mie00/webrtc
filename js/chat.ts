const chat = document.getElementById("chat") as HTMLInputElement;

function setupChatChannel(app: App, cid: string): void {
    const dc = app.clients[cid].pc.createDataChannel("chat", {
        negotiated: true,
        id: 1
    });
    app.clients[cid].dc = dc;
    dc.onopen = (): void => {
        if (chat) {
            chat.select();
        }
    };
    dc.onmessage = (e: MessageEvent): void => log(`> ${e.data}`);
}

if (chat) {
    chat.onkeydown = function(e: KeyboardEvent): void {
        if (e.keyCode != 13) return;
        for (const client of Object.values(app.clients)) {
            if (client.dc) {
                client.dc.send(chat.value);
            }
        }
        log(chat.value);
        chat.value = "";
    };
}

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        setupChatChannel
    };
}
