window.AudioContext = window.AudioContext || window.webkitAudioContext;

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
        stream.getTracks().forEach(function (track) {
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
        app.streams[changed].getTracks().forEach(function (track) {
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
        const button = document.getElementById('toggle-audio');
        if (app.streamConfig.audio) {
            stream = await navigator.mediaDevices.getUserMedia({ audio: {groupId: getConfig()['audio-device'].split('|')[0], deviceId: getConfig()['audio-device'].split('|')[1]} });
            for (var client of Object.values(app.clients)) {
                if (client.pc) {
                    stream.getTracks().forEach(async (track) => {
                        client.pc.addTransceiver(track, {streams: [stream], sendEncodings: [{
                            priority: "high",
                        }]})
                    });
                }
            }

            app.context = new AudioContext();
            app.script = app.context.createScriptProcessor(2048, 1, 1);
            app.script.onaudioprocess = function (event) {
                if (!app.streamConfig.audio) {
                    return;
                }
                const input = event.inputBuffer.getChannelData(0);
                let i;
                let sum = 0.0;
                let clipcount = 0;
                for (i = 0; i < input.length; ++i) {
                    sum += input[i] * input[i];
                    if (Math.abs(input[i]) > 0.99) {
                        clipcount += 1;
                    }
                }
                const instant = Math.sqrt(Math.sqrt(sum / input.length)) * 100;
                button.style.background = `linear-gradient(0deg, rgb(59 130 246) ${instant}%, white ${instant}%)`;
            };
            app.mic = app.context.createMediaStreamSource(stream);
            app.mic.connect(app.script);
            app.script.connect(app.context.destination);
        } else {
            app.mic.disconnect();
            app.script.disconnect();
            app.mic = null;
            app.script = null;
            app.context = null;
            button.style.background = ``;
        }
    } else if (changed === 'video') {
        if (app.streamConfig.video) {
            stream = await navigator.mediaDevices.getUserMedia({ video: {groupId: getConfig()['video-device'].split('|')[0], deviceId: getConfig()['video-device'].split('|')[1]} });
            for (var client of Object.values(app.clients)) {
                if (client.pc) {
                    stream.getTracks().forEach(async (track) => {
                        if ('contentHint' in track) {
                            // TODO: make configurable
                            track.contentHint = 'motion';
                        }
                        client.pc.addTransceiver(track, {streams: [stream], sendEncodings: [{
                            priority: "low",
                        }]})
                    });
                }
            }
        }
    } else {
        if (app.streamConfig.screen) {
            stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { cursor: "always" } });
            for (var client of Object.values(app.clients)) {
                if (client.pc) {
                    stream.getTracks().forEach(async (track) => {
                        if ('contentHint' in track) {
                            // TODO: make configurable
                            track.contentHint = 'detail';
                        }
                        client.pc.addTransceiver(track, {streams: [stream], sendEncodings: [{
                            priority: "medium",
                        }]})
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

document.getElementById('toggle-audio').addEventListener('contextmenu', async (ev) => {
    ev.preventDefault();
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
    if (devices.length < 1) {
        alert("no devices found");
        return
    }
    const menu = document.getElementById('contextMenu');
    menu.style.display = 'block';
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    menu.style.display = '';

    // Determine position for the menu
    let posX = ev.pageX;
    let posY = ev.pageY;

    // Check if the menu goes beyond the right edge of the window
    if (posX + menuWidth > window.innerWidth) {
        posX = window.innerWidth - menuWidth;
    }

    // Check if the menu goes beyond the bottom edge of the window
    if (posY + menuHeight > window.innerHeight) {
        posY = window.innerHeight - menuHeight;
    }

    // Set the position of the menu
    menu.style.left = posX + 'px';
    menu.style.top = posY + 'px';

    menu.classList.remove('hidden');
    const ul = document.getElementById('ul-contextMenu');
    while (ul.firstChild) {
        ul.removeChild(ul.firstChild);
    }

    devices.forEach((device) => {
        const li = document.createElement('li');
        li.classList.add('cursor-pointer', 'bg-white', 'dark:bg-gray-800', 'hover:bg-gray-200', 'transition-all', 'ease-linear', 'dark:hover:bg-gray-800/50', 'p-4', 'w-full', 'h-full', 'text-gray-800', 'dark:text-gray-200');
        li.appendChild(document.createTextNode(device.label));
        // Append the new list item to the ul with id ul-contextmenu
        if (ul) {
            ul.appendChild(li);
        }
        li.addEventListener('click', async () => {
            menu.classList.add('hidden');
            app.streamConfig.audio = true;
            setButton(ev.target, app.streamConfig.audio);
            setConfig('audio-device', `${device.groupId}|${device.deviceId}`);
            await setupLocalStream('audio');
        });
    })
});


document.getElementById('toggle-video').addEventListener('contextmenu', async (ev) => {
    ev.preventDefault();
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
    if (devices.length < 1) {
        alert("no devices found");
        return
    }
    const menu = document.getElementById('contextMenu');
    menu.style.display = 'block';
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    menu.style.display = '';

    // Determine position for the menu
    let posX = ev.pageX;
    let posY = ev.pageY;

    // Check if the menu goes beyond the right edge of the window
    if (posX + menuWidth > window.innerWidth) {
        posX = window.innerWidth - menuWidth;
    }

    // Check if the menu goes beyond the bottom edge of the window
    if (posY + menuHeight > window.innerHeight) {
        posY = window.innerHeight - menuHeight;
    }

    // Set the position of the menu
    menu.style.left = posX + 'px';
    menu.style.top = posY + 'px';

    menu.classList.remove('hidden');
    const ul = document.getElementById('ul-contextMenu');
    while (ul.firstChild) {
        ul.removeChild(ul.firstChild);
    }

    devices.forEach((device) => {
        const li = document.createElement('li');
        li.classList.add('cursor-pointer', 'bg-white', 'dark:bg-gray-800', 'hover:bg-gray-200', 'transition-all', 'ease-linear', 'dark:hover:bg-gray-800/50', 'p-4', 'w-full', 'h-full', 'text-gray-800', 'dark:text-gray-200');
        li.appendChild(document.createTextNode(device.label));
        // Append the new list item to the ul with id ul-contextmenu
        if (ul) {
            ul.appendChild(li);
        }
        li.addEventListener('click', async () => {
            menu.classList.add('hidden');
            app.streamConfig.video = true;
            setButton(ev.target, app.streamConfig.video);
            setConfig('video-device', `${device.groupId}|${device.deviceId}`);
            await setupLocalStream('video');
        });
    })
});

document.onclick = function (event) {
    const menu = document.getElementById('contextMenu');
    if (!menu.contains(event.target)) {
        menu.classList.add('hidden');
    }
};
