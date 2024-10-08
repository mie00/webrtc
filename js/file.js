function updateProgressBar(id, file_size, get_ready) {
    const bufferedAmount = get_ready();

    // Calculate progress percentage (0 to 100)
    const progressPercentage = (file_size - bufferedAmount) / file_size * 100;
    const elem = document.getElementById(`file-${id}`);
    elem.value = progressPercentage;
    elem.innerHTML = `${progressPercentage}%`
}

function setupFileChannel(app, cid) {
    const dc_file = app.clients[cid].pc.createDataChannel("file", {
        negotiated: true,
        id: 2
    });
    app.clients[cid].dc_file = dc_file;

    dc_file.onmessage = e => {
        if (!app.clients[cid].file_stuff) {
            const id = Math.random().toString(16).slice(2);
            app.clients[cid].file_stuff = JSON.parse(e.data);
            app.clients[cid].file_stuff.segments = [];
            app.clients[cid].file_stuff.remaining_size = app.clients[cid].file_stuff.size;
            app.clients[cid].file_stuff.id = id;
            log(`> <label for="file-${id}">${app.clients[cid].file_stuff.name}</label> <span id="f-${id}"><progress id="file-${id}" value="0" max="100"> 0% </progress></span>`)
            return
        }
        app.clients[cid].file_stuff.segments.push(e.data);
        app.clients[cid].file_stuff.remaining_size -= e.data.byteLength || e.data.size;
        updateProgressBar(app.clients[cid].file_stuff.id, app.clients[cid].file_stuff.size, () => app.clients[cid].file_stuff.remaining_size);
        if (app.clients[cid].file_stuff.remaining_size === 0) {
            const blob = new Blob(app.clients[cid].file_stuff.segments, { type: app.clients[cid].file_stuff.type });
            const url = URL.createObjectURL(blob);
            document.getElementById(`f-${app.clients[cid].file_stuff.id}`).innerHTML = `
                <a id="download-${app.clients[cid].file_stuff.id}" class="w-full py-2 px-4 bg-blue-500 text-white rounded shadow hover:bg-blue-700">Download</a>
                <a id="view-${app.clients[cid].file_stuff.id}" class="w-full py-2 px-4 bg-blue-500 text-white rounded shadow hover:bg-blue-700" target="_blank">View</a>`;
            const a = document.getElementById(`download-${app.clients[cid].file_stuff.id}`);
            a.href = url;
            a.download = app.clients[cid].file_stuff.name;
            const aview = document.getElementById(`view-${app.clients[cid].file_stuff.id}`)
            aview.href = url;
            app.clients[cid].file_stuff = null;
        }
    };
}

document.getElementById('file-upload').addEventListener('change', handleFileSelect);

function handleFileSelect(event) {
    const file = event.target.files[0];
    for (var cid of Object.keys(app.clients)) {
        readFile(file, cid);
    }
}

function splitArrayBuffer(arrayBuffer, chunkSize) {
    const uint8Array = new Uint8Array(arrayBuffer);
    const chunks = [];
    let offset = 0;

    while (offset < uint8Array.length) {
        const chunk = uint8Array.slice(offset, offset + chunkSize);
        chunks.push(chunk.buffer);  // Push the ArrayBuffer of the chunk
        offset += chunkSize;
    }

    return chunks;
}

function readFile(file, cid) {
    const id = Math.random().toString(16).slice(2);
    log(`<label for="file-${id}">${file.name}</label> <span id="f-${id}"><progress id="file-${id}" value="0" max="100"> 0% </progress></span>`)
    let offset = 0;
    const max_size = 2 * 1024 * 1024;
    app.clients[cid].dc_file.send(JSON.stringify({ name: file.name, type: file.type, size: file.size }));

    const reader = new FileReader();
    reader.onload = function (event) {
        for (var chunk of splitArrayBuffer(event.target.result, 128 * 1024)) {
            app.clients[cid].dc_file.send(chunk);
        }
        if (app.file_progress_interval) {
            clearInterval(app.file_progress_interval);
            app.file_progress_interval = null;
        }
        app.file_progress_interval = setInterval(() => {
            const getRemaining = () => ((app.clients[cid].dc_file.bufferedAmount || 0) + (file.size - Math.min(offset, file.size)));
            updateProgressBar(id, file.size, getRemaining);
            if (getRemaining() == 0) {
                clearInterval(app.file_progress_interval);
                app.file_progress_interval = null;
                document.getElementById(`f-${id}`).innerHTML = "Sent";
            }
        }, 100);
    };
    var buffer_cb = (event) => {
        reader.readAsArrayBuffer(file.slice(offset, offset + max_size));
        offset += max_size;
        if (offset > file.size) {
            app.clients[cid].dc_file.removeEventListener("bufferedamountlow", buffer_cb);
            document.getElementById('file-upload').disabled = false;
        }
    };
    if (file.size > max_size) {
        document.getElementById('file-upload').disabled = true;
        app.clients[cid].dc_file.addEventListener("bufferedamountlow", buffer_cb);
    }
    reader.readAsArrayBuffer(file.slice(offset, offset + max_size));
    offset += max_size;
}
