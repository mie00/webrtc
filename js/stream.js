function streamInit(app) {
    app.streams = {}
    app.config = {}
    app.viewStreams = {}
    app.nego_handlers['stream.end'] = (data, cid) => {
        document.getElementById(`stream-${data.stream}`)?.remove();

        for (let cid2 of Object.keys(app.clients)) {
            if (cid == cid2) {
                continue;
            }
            app.clients[cid2].nego_dc.send(JSON.stringify(data));
        }
    }
}

function setupTrackHandler(app, cid) {
    app.clients[cid].pc.addEventListener("track", (ev) => {
        let mediaElement = document.createElement(ev.track.kind);
        document.getElementById('media').appendChild(mediaElement);
        mediaElement.id = `stream-${ev.streams[0].id}`;
        mediaElement.srcObject = ev.streams[0];
        mediaElement.muted = false;
        mediaElement.autoplay = true;
        mediaElement.classList.add('w-full')
        app.viewStreams[ev.streams[0].id] = ev.streams[0];
        ev.track.onended = (ev) => {
            document.getElementById(`stream-${ev.streams[0].id}`).remove();
            delete app.viewStreams[ev.streams[0].id];
        }

        for (let cid2 of Object.keys(app.clients)) {
            if (cid == cid2) {
                continue;
            }
            app.clients[cid2].pc.addTrack(ev.track, ev.streams[0]);
        }
    });
    for (let streamType of Object.keys(app.streams)) {
        app.streams[streamType].getTracks().forEach(function(track) {
            app.clients[cid].pc.addTrack(track, app.streams[streamType]);
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
                client.nego_dc.send(JSON.stringify({
                    type: "stream.end",
                    stream: app.streams[changed].id,
                }))
            }
        });
    }
    let stream;
    if (changed === 'audio') {
        if (app.config.audio) {
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
        if (app.config.video) {
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
        if (app.config.screen) {
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
        if ((changed === 'video' && app.config.video) || (changed === 'screen' && app.config.screen)) {
            let mediaElement = document.createElement('video');
            document.getElementById('media').appendChild(mediaElement);
            mediaElement.id = `stream-${stream.id}`
            mediaElement.srcObject = stream;
            mediaElement.muted = true;
            mediaElement.autoplay = true;
            mediaElement.classList.add('w-full')
        }
        app.viewStreams[stream.id] = stream;
    }
}

document.getElementById('toggle-audio').addEventListener('click', async (ev) => {
    app.config.audio = !app.config.audio;
    const to_remove = app.config.audio?'bg-blue-500':'bg-gray-500';
    const to_add = app.config.audio?'bg-gray-500':'bg-blue-500';
    ev.target.classList.remove(to_remove);
    ev.target.classList.add(to_add);
    await setupLocalStream('audio');
});

document.getElementById('toggle-video').addEventListener('click', async (ev) => {
    app.config.video = !app.config.video;
    const to_remove = app.config.video?'bg-blue-500':'bg-gray-500';
    const to_add = app.config.video?'bg-gray-500':'bg-blue-500';
    ev.target.classList.remove(to_remove);
    ev.target.classList.add(to_add);
    await setupLocalStream('video');
});

document.getElementById('toggle-screen').addEventListener('click', async (ev) => {
    app.config.screen = !app.config.screen;
    const to_remove = app.config.screen?'bg-blue-500':'bg-gray-500';
    const to_add = app.config.screen?'bg-gray-500':'bg-blue-500';
    ev.target.classList.remove(to_remove);
    ev.target.classList.add(to_add);
    await setupLocalStream('screen');
});
