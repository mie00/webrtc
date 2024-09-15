const recordButton = document.getElementById('record');

let lastStreams = [];

const FW = 1920;
const FH = 1080;

async function setupStreams(merger) {

    const streams = (await getStreamsDims()).filter(({ width, height }) => width && height);
    const streamKeys = streams.map(({ key }) => key);
    if (lastStreams.length === streamKeys.length && lastStreams.every(stream => streamKeys.includes(stream))) {
        return;
    }
    lastStreams.forEach(streamKey => {
        merger.removeStream(streamKey);
    });
    lastStreams = streamKeys;

    const rcs = Math.ceil(Math.sqrt(streams.length));
    const cols = rcs;
    const rows = cols * (cols - 1) >= streams.length ? cols - 1 : cols;
    console.log(`${streams.length} streams will be displayed in ${rows}x${cols}`);
    for (var i = 0; i < streams.length; i++) {
        const nw = streams[i].width * FH / cols / streams[i].height;
        const scale = nw <= FW / rows ? FH / cols / streams[i].height : FW / rows / streams[i].width;
        console.log({
            x: (i % cols) * FW / cols,
            y: Math.floor(i / cols) * FH / rows,
            width: scale * streams[i].width,
            height: scale * streams[i].height,
            mute: false,
        })
        merger.addStream(app.viewStreams[streams[i].key], {
            x: (i % cols) * FW / cols,
            y: Math.floor(i / cols) * FH / rows,
            width: scale * streams[i].width,
            height: scale * streams[i].height,
            mute: false,
        })
    }
}

async function startRecording() {
    var merger = new VideoStreamMerger()
    app.recorder = setInterval(setupStreams.bind(null, merger), 1000);
    app.merger = merger;
    merger.setOutputSize(FW, FH);

    await setupStreams(merger);

    merger.start();

    const result = merger.result;
    if (false) { // for debugging only
        app.viewStreams[result.id] = result;
        await createStreamElement(result, 'video', { muted: false, controls: true });
    }

    const options = { mimeType: "video/webm; codecs=vp9" };
    const mediaRecorder = new MediaRecorder(result, options);
    app.mediaRecorder = mediaRecorder;

    mediaRecorder.ondataavailable = async (ev) => {
        // console.log("data-available");
        if (ev.data.size > 0) {
            // console.log(ev.data)
            // navigator.serviceWorker.controller.postMessage({
            //     'type': 'recording',
            //     'data': ev.data,
            // });

            // Create a link element for downloading
            const anchor = document.createElement('a');
            anchor.href = window.URL.createObjectURL(ev.data);
            anchor.download = 'mie-webrtc-video.mp4';

            // Append the anchor to the body and programmatically click it to trigger download
            document.body.appendChild(anchor);
            anchor.click();
        }
    };
    // mediaRecorder.onstop = () => {
    //     console.log("stopped");
    //     navigator.serviceWorker.controller.postMessage({
    //         'type': 'recording.end',
    //     });
    // }
    mediaRecorder.start();


}

function stopRecording() {
    app.mediaRecorder.stop();
    app.mediaRecorder = null;
    app.merger.destroy();
    app.merger = null;
    clearInterval(app.recorder)
    app.recorder = null;
    recordButton.classList.remove('bg-red');
}

recordButton.addEventListener('click', () => {
    if (app.recorder) {
        stopRecording();
    } else {
        startRecording();
    }
    setButton(recordButton, !!app.recorder);
});
