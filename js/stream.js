window.AudioContext = window.AudioContext || window.webkitAudioContext;

function addEventListenerAll(target, listener, ...otherArguments) {

    // install listeners for all natively triggered events
    for (const key in target) {
        if (/^on/.test(key)) {
            const eventType = key.substr(2);
            target.addEventListener(eventType, listener, ...otherArguments);
        }
    }

    // dynamically install listeners for all manually triggered events, just-in-time before they're dispatched ;D
    const dispatchEvent_original = EventTarget.prototype.dispatchEvent;
    function dispatchEvent(event) {
        target.addEventListener(event.type, listener, ...otherArguments);  // multiple identical listeners are automatically discarded
        dispatchEvent_original.apply(this, arguments);
    }
    EventTarget.prototype.dispatchEvent = dispatchEvent;
    if (EventTarget.prototype.dispatchEvent !== dispatchEvent) throw new Error(`Browser is smarter than you think!`);

}

function normalizeStreamId(id) {
    return id.replace('{', '').replace('}', '')
}

function getStreamElemId(id) {
    return `stream-${normalizeStreamId(id)}`;
}

function streamInit(app) {
    app.streams = {}
    app.streamConfig = {}
    app.viewStreams = {}
    app.nego_handlers['stream.end'] = (data, cid) => {
        document.querySelectorAll(`.${getStreamElemId(data.stream)}`).forEach(elem => elem.remove());
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
                    Object.values(app.clients).forEach((client) => sendNego(client, { type: 'stream.end', stream: normalizeStreamId(stream.id) }));
                } catch { }
                stream.getTracks().map((track) => track.stop());
            });
        }
    };
}

function setupTrackHandler(app, cid) {
    app.clients[cid].pc.addEventListener("track", async (ev) => {
        console.log("got track event", ev);
        app.viewStreams[normalizeStreamId(ev.streams[0].id)] = ev.streams[0];
        await createStreamElement(ev.streams[0], ev.track.kind, { muted: false });
        ev.track.onended = (ev) => {
            console.log(ev)
            Object.values(app.clients).forEach((client) => sendNego(client, { type: 'stream.end', stream: normalizeStreamId(ev.target.id) }));
            document.querySelectorAll(`.${getStreamElemId(ev.target.id)}`).forEach(elem => elem.remove());
            delete app.viewStreams[normalizeStreamId(ev.target.id)];
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

function processAudio(app, stream, cb) {
    app.context = new AudioContext();
    app.script = app.context.createScriptProcessor(2048, 1, 1);
    app.script.onaudioprocess = function (event) {
        if (app.streamConfig && !app.streamConfig.audio) {
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
        cb(instant);
    };
    app.mic = app.context.createMediaStreamSource(stream);
    app.mic.connect(app.script);
    app.script.connect(app.context.destination);
}

function stopProcessingAudio(app) {
    app.mic.disconnect();
    app.script.disconnect();
    app.mic = null;
    app.script = null;
    app.context = null;
}

const tearDownStream = async (stream) => {
    stream.getTracks().forEach(function (track) {
        track.stop();
        track.dispatchEvent(new Event("ended"));
        for (var client of Object.values(app.clients)) {
            client.pc.getTransceivers().forEach((transceiver) => {
                if (transceiver.sender.track?.id === track.id) {
                    transceiver.stop();
                }
            });
            sendNego(client, {
                type: "stream.end",
                stream: normalizeStreamId(stream.id),
            });
        }
    });
}

const setupTrack = (track, stream, priority, contentHint, simulcast) => {
    if (contentHint && 'contentHint' in track) {
        // TODO: make configurable
        track.contentHint = contentHint;
    }
    for (var client of Object.values(app.clients)) {
        if (client.pc) {
            client.pc.addTransceiver(track, {
                streams: [stream], sendEncodings: [
                    { priority: priority, rid: "o" },
                    ...(simulcast?[
                        { priority: priority, rid: "h", maxBitrate: 1200 * 1024 },
                        { priority: priority, rid: "m", maxBitrate: 600 * 1024, scaleResolutionDownBy: 2 },
                        { priority: priority, rid: "l", maxBitrate: 300 * 1024, scaleResolutionDownBy: 4 },
                    ]:[])
                ],
                direction: "sendrecv",
            });
        }
    }
}

const setupStream = (stream, priority, contentHint, simulcast) => {
    stream.getTracks().forEach((track) => {
        setupTrack(track, stream, priority, contentHint, simulcast);
    })
}

const setupLocalStream = async (changed) => {
    if (app.streams[changed]) {
        const elems = document.querySelectorAll(`.${getStreamElemId(app.streams[changed].id)}`);
        for (const elem of elems) {
            if (elem.substitueStream) {
                tearDownStream(elem.substitueStream);
            }
            if (elem.substitueElement) {
                elem.substitueElement.remove();
            }
            elem.srcObject = null;
            elem.remove();
        }
        delete app.viewStreams[normalizeStreamId(app.streams[changed].id)];
        tearDownStream(app.streams[changed]);
        delete app.streams[changed];
    }
    let stream;
    if (changed === 'audio') {
        const button = document.getElementById('toggle-audio');
        if (app.streamConfig.audio) {
            stream = await navigator.mediaDevices.getUserMedia({ audio: { groupId: getConfig()['audio-device'].split('|')[0], deviceId: getConfig()['audio-device'].split('|')[1] } });
            setupStream(stream, "high");

            processAudio(app, stream, (instant) => {
                button.style.background = `linear-gradient(0deg, rgb(59 130 246) ${instant}%, white ${instant}%)`;
            });
        } else {
            stopProcessingAudio(app);
            button.style.background = ``;
        }
    } else if (changed === 'video') {
        if (app.streamConfig.video) {
            stream = await navigator.mediaDevices.getUserMedia({ video: { groupId: getConfig()['video-device'].split('|')[0], deviceId: getConfig()['video-device'].split('|')[1] } });
            if (!app.config['blur-video'] === 'yes') {
                setupStream(stream, "low", "motion", true);
            }
        }
    } else if (changed === 'local') {
        if (app.streamConfig.local) {
            stream = app.streamConfig.videoStream;
            stream.onaddtrack = async (ev) => {
                setupTrack(ev.track, "medium", undefined, false);
            }
        }
    } else {
        if (app.streamConfig.screen) {
            stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { cursor: "always" } });
            setupStream(stream, "medium", 'detail', false);
        }
    }
    if (stream) {
        app.streams[changed] = stream;
        if (changed === 'video' && app.streamConfig.video) {
            const elem = await createStreamElement(stream, 'video', { muted: true, controls: false, mirrored: true });
            if (app.config['blur-video'] === 'yes') {
                const substituteStream = await backgroundChange(elem);
                setupStream(substituteStream, "low", "motion", true);
            }
        } else if (changed === 'screen' && app.streamConfig.screen) {
            await createStreamElement(stream, 'video', { muted: true, controls: false });
        } else if (changed === 'local' && app.streamConfig.local) {
            await createStreamElement(stream, 'video', { muted: false, controls: true, passedElement: app.streamConfig.videoNode });
        }
        app.viewStreams[normalizeStreamId(stream.id)] = stream;
    }
}

const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

const getStreamsDims = async () => {
    // TODO: use videoHeight and width from element
    let elems = [];
    if (!app.viewStreams) return elems;
    let statsDict = {};
    for (const client of Object.values(app.clients)) {
        const stats = await client.pc.getStats();
        stats.forEach(stat => {
            if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
                statsDict[normalizeStreamId(stat.trackIdentifier)] = { width: stat.frameWidth, height: stat.frameHeight }
            }
        })
    }
    for (let [key, value] of Object.entries(app.viewStreams)) {
        if (value.getVideoTracks().length === 0) {
            continue;
        }
        var width, height;
        console.log(isFirefox, value.getVideoTracks()[0].label != 'remote video')
        var { width, height } = value.getVideoTracks()[0].getSettings();
        if (!width || !height) {
            if (normalizeStreamId(value.getVideoTracks()[0].id) in statsDict) {
                var { width, height } = statsDict[normalizeStreamId(value.getVideoTracks()[0].id)];
            }
        }
        if (!width || !height) {
            const videoElem = document.querySelector(`video.${getStreamElemId(key)}`);
            if (videoElem) {
                height = videoElem.videoHeight;
                width = videoElem.videoWidth;
            }
        }
        elems.push({ key, ow: width, oh: height, width: Math.sqrt(width / height), height: Math.sqrt(height / width) });
    }
    return elems;
}
const refreshStreamViews = async () => {
    const allElems = await getStreamsDims();
    if (allElems.length == 0) {
        return;
    }
    for (const k of allElems) {
        const videoElem = document.querySelector(`video.${getStreamElemId(k.key)}`);
        if (!k.width || !k.height) {
            if (!videoElem) continue;
            videoElem.style.display = 'none';
        } else if (videoElem && videoElem.substitueElement) {
            videoElem.style.display = 'none';
        }
    }
    const elems = allElems.filter(({ width, height }) => width && height);

    const media = document.getElementById('media');
    const totalWidth = media.clientWidth;
    const totalHeight = media.clientHeight;
    let normalizedWidth = Math.sqrt(totalWidth / totalHeight) * Math.sqrt(elems.length);
    const origWidth = normalizedWidth;
    let normalizedHeight = Math.sqrt(totalHeight / totalWidth) * Math.sqrt(elems.length);
    let packer;
    while (true) {
        packer = BinPack();
        packer.binWidth(normalizedWidth);
        packer.binHeight(normalizedHeight);
        packer.addAll(elems);
        if (packer.unpositioned.length !== 0 && normalizedWidth > 10 * origWidth) {
            throw new Error('Could not fit streams');
        } else if (packer.unpositioned.length === 0) {
            break;
        }
        normalizedWidth *= 1.1;
        normalizedHeight *= 1.1;
    }
    for (let elem of packer.positioned) {
        let videoElem = document.querySelector(`video.${getStreamElemId(elem.datum.key)}`);
        if (videoElem.substitueElement) {
            videoElem = videoElem.substitueElement;
        }
        videoElem.style.width = `${elem.datum.width / normalizedWidth * totalWidth}px`;
        videoElem.style.height = `${elem.datum.height / normalizedHeight * totalHeight}px`;
        videoElem.style.left = `${elem.x / normalizedWidth * totalWidth}px`;
        videoElem.style.top = `${elem.y / normalizedHeight * totalHeight}px`;
        videoElem.style.position = 'absolute';
        videoElem.style.display = 'block';
    }
}

setInterval(() => {
    refreshStreamViews();
}, 1000);

window.addEventListener('resize', function (event) {
    refreshStreamViews();
}, true);

const createStreamElement = async (stream, tag, { muted = false, controls = false, mirrored = false, passedElement = null }) => {
    let mediaElement;
    if (passedElement) {
        mediaElement = passedElement;
    } else {
        mediaElement = document.createElement(tag);
        mediaElement.srcObject = stream;
    }
    mediaElement.classList.add(getStreamElemId(stream.id));
    if (mirrored) {
        mediaElement.style.transform = 'scaleX(-1)';
    }
    mediaElement.muted = muted;
    mediaElement.autoplay = true;
    mediaElement.controls = controls;
    mediaElement.disablePictureInPicture = true;
    mediaElement.playsInline = true;
    // mediaElement.classList.add('w-full')
    document.getElementById('media').appendChild(mediaElement);
    try {
        await mediaElement.play();
    } catch (e) {
        console.log('error playing', e)
        let playButton = document.getElementById('play-button');
        if (!playButton) {
            playButton = document.createElement('button');
            playButton.id = 'play-button';
            playButton.classList.add('fixed', 'inset-0', 'bg-black', 'bg-opacity-50', 'flex', 'justify-center', 'items-center', 'z-50', 'text-9xl');
            playButton.appendChild(document.createTextNode('▶'));
            document.body.appendChild(playButton);
            playButton.addEventListener('click', (ev) => {
                mediaElement.play();
                playButton.remove();
            });
        } else {
            playButton.addEventListener('click', (ev) => {
                mediaElement.play();
            });
        }
    }
    return mediaElement;
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

document.getElementById('share-video').addEventListener('click', async (ev) => {
    if (app.streamConfig.local) {
        app.streamConfig.videoNode.src = '';
        app.streamConfig.videoNode = null;
        app.streamConfig.local = false;
        setButton(ev.target, app.streamConfig.local);
        await setupLocalStream('local');
        document.getElementById('upload-video').value = null;
    } else {
        document.getElementById('upload-video').click();
    }
});

document.getElementById('upload-video').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    const fileURL = URL.createObjectURL(file);

    const videoNode = document.createElement('video');
    videoNode.src = fileURL;
    videoNode.autoplay = true;
    videoNode.controls = false;
    videoNode.loop = true;
    app.streamConfig.videoNode = videoNode;
    app.streamConfig.videoStream = videoNode.captureStream ? videoNode.captureStream() : videoNode.mozCaptureStream();
    app.streamConfig.local = !app.streamConfig.local;
    setButton(document.getElementById('share-video'), app.streamConfig.local);
    await setupLocalStream('local');
})
