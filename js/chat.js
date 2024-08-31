
function setupChatChannel(app, cid) {
    const dc = app.clients[cid].pc.createDataChannel("chat", {
        negotiated: true,
        id: 1
    });
    app.clients[cid].dc = dc;
    dc.onopen = () => {
        chat.select();
    };
    dc.onmessage = e => log(`> ${e.data}`);
}

chat.onkeypress = function (e) {
    if (e.keyCode != 13) return;
    for (var client of Object.values(app.clients)) {
        client.dc.send(chat.value);
    }
    log(chat.value);
    chat.value = "";
};
