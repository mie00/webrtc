function streamInit(app) {
    app.streams = {}
    app.streamConfig = {}
    app.viewStreams = {}
    app.nego_handlers['stream.end'] = (data, cid) => {
        document.getElementById(`stream-${data.stream}`)?.remove();
        delete app.viewStreams[data.stream];

        for (let cid2 of Object.keys(app.clients)) {
            if (cid == cid2) {
                continue;
            }
            sendNego(app.clients[cid2], data);
        }
    }

    app.cleanups['stream'] = (cid) => {
        if (!cid) {
            Object.keys(app.streams).forEach((streamId) => {
                const stream = app.streams[streamId];
                delete app.streams[streamId];
                try {
                    Object.values(app.clients).forEach((client) => sendNego(client, { type: 'stream.end', stream: stream.id }));
                } catch { }
                stream.getTracks().map((track) => track.stop());
            });
        }
    };
}

function setupTrackHandler(app, cid) {
    app.clients[cid].pc.addEventListener("track", (ev) => {
        let mediaElement = document.createElement(ev.track.kind);
        document.getElementById('media').appendChild(mediaElement);
        mediaElement.id = `stream-${ev.streams[0].id}`;
        mediaElement.srcObject = ev.streams[0];
        mediaElement.muted = false;
        mediaElement.autoplay = true;
        mediaElement.controls = false;
        mediaElement.disablePictureInPicture = true;
        mediaElement.playsInline = true;
        mediaElement.classList.add('w-full');
        // TODO: user has to interact otherwise it fails
        // mediaElement.play();
        app.viewStreams[ev.streams[0].id] = ev.streams[0];
        ev.track.onended = (ev) => {
            console.log(ev)
            Object.values(app.clients).forEach((client) => sendNego(client, { type: 'stream.end', stream: ev.target.id }));
            document.getElementById(`stream-${ev.target.id}`)?.remove();
            delete app.viewStreams[ev.target.id];
        }

        for (let cid2 of Object.keys(app.clients)) {
            if (cid == cid2) {
                continue;
            }
            app.clients[cid2].pc.addTrack(ev.track, ev.streams[0]);
        }
    });
    for (let stream of Object.values(app.viewStreams)) {
        stream.getTracks().forEach(function(track) {
            app.clients[cid].pc.addTrack(track, stream);
        })
    }
}

const setupLocalStream = async (changed) => {
    if (app.streams[changed]) {
        const elem = document.getElementById(`stream-${app.streams[changed].id}`);
        if (elem) {
            elem.srcObject = null;
            elem.remove();
        }
        delete app.viewStreams[app.streams[changed].id];
        app.streams[changed].getTracks().forEach(function(track) {
            track.stop();
            track.dispatchEvent(new Event("ended"));
            for (var client of Object.values(app.clients)) {
                sendNego(client, {
                    type: "stream.end",
                    stream: app.streams[changed].id,
                });
            }
        });
        delete app.streams[changed];
    }
    let stream;
    if (changed === 'audio') {
        if (app.streamConfig.audio) {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            for (var client of Object.values(app.clients)) {
                if (client.pc) {
                    stream.getTracks().forEach((track) => {
                        client.pc.addTrack(track, stream);
                    });
                }
            }
        }
    } else if (changed === 'video') {
        if (app.streamConfig.video) {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            for (var client of Object.values(app.clients)) {
                if (client.pc) {
                    stream.getTracks().forEach((track) => {
                        client.pc.addTrack(track, stream);
                    });
                }
            }
        }
    } else {
        if (app.streamConfig.screen) {
            stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: {cursor: "always"}});
            for (var client of Object.values(app.clients)) {
                if (client.pc) {
                    stream.getTracks().forEach((track) => {
                        client.pc.addTrack(track, stream);
                    });
                }
            }
        }
    }
    if (stream) {
        app.streams[changed] = stream;
        if ((changed === 'video' && app.streamConfig.video) || (changed === 'screen' && app.streamConfig.screen)) {
            let mediaElement = document.createElement('video');
            document.getElementById('media').appendChild(mediaElement);
            mediaElement.id = `stream-${stream.id}`
            mediaElement.srcObject = stream;
            mediaElement.muted = true;
            mediaElement.autoplay = true;
            mediaElement.controls = false;
            mediaElement.disablePictureInPicture = true;
            mediaElement.playsInline = true;
            mediaElement.classList.add('w-full')
        }
        app.viewStreams[stream.id] = stream;
    }
}

const setButton = (target, on) => {
    if (on) {
        target.classList.add('bg-blue-500');
    } else {
        target.classList.remove('bg-blue-500');
    }
}

document.getElementById('toggle-audio').addEventListener('click', async (ev) => {
    app.streamConfig.audio = !app.streamConfig.audio;
    setButton(ev.target, app.streamConfig.audio);
    await setupLocalStream('audio');
});

document.getElementById('toggle-video').addEventListener('click', async (ev) => {
    app.streamConfig.video = !app.streamConfig.video;
    setButton(ev.target, app.streamConfig.video);
    await setupLocalStream('video');
});

document.getElementById('toggle-screen').addEventListener('click', async (ev) => {
    app.streamConfig.screen = !app.streamConfig.screen;
    setButton(ev.target, app.streamConfig.screen);
    await setupLocalStream('screen');
});
