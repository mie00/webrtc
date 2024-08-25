
function setupChatChannel(app) {
    const dc = app.pc.createDataChannel("chat", {
        negotiated: true,
        id: 1
    });
    app.dc = dc;
    dc.onopen = () => {
        chat.select();
    };
    dc.onmessage = e => log(`> ${e.data}`);
    app.pc.oniceconnectionstatechange = e => log(app.pc.iceConnectionState);

    app.pc.onconnectionstatechange = ev => handleChange();
    app.pc.oniceconnectionstatechange = ev => handleChange();
}

chat.onkeypress = function (e) {
    if (e.keyCode != 13) return;
    app.dc.send(chat.value);
    log(chat.value);
    chat.value = "";
};