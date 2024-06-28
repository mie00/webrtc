
list = `
{str}
v=0
o={str} {uint64} {uint8} IN IP4 {ip}
s=0
t=0 0
a=group:BUNDLE 0
a=extmap-allow-mixed
a=msid-semantic: WMS
a=msid-semantic:WMS *
m=application {uint16} UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 {ip}
a=candidate:{uint32} 1 udp {uint32} {uuid}.local {uint16} typ host generation 0 network-cost 999
a=candidate:{uint32} 1 udp {uint32} {ip} {uint16} typ srflx raddr {ip} rport 0 generation 0 network-cost 999
a=candidate:{uint32} 1 UDP {uint32} {uuid}.local {uint16} typ host
a=candidate:{uint32} 1 TCP {uint32} {uuid}.local {uint16} typ host tcptype active
a=candidate:{uint32} 1 UDP {uint32} {ip} {uint16} typ srflx raddr {ip} rport 0
a=ice-ufrag:{str}
a=ice-pwd:{str}
a=ice-options:trickle
a=fingerprint:sha-256 {sha256}
a=setup:actpass
a=setup:active
a=setup:passive
a=mid:0
a=sctp-port:5000
a=max-message-size:{uint32}
a=sendrecv
s=-
a=candidate:{uint32} 1 udp {uint32} {ip} {uint16} typ host generation 0 network-id {uint8}
a=candidate:{uint32} 1 udp {uint32} {ip} {uint16} typ srflx raddr {ip} rport {uint16} generation 0 network-id {uint8}
`.trim().split('\n')

const encoders = {
    'uint8': (f) => new Uint8Array([f]),
    'uint16': (f) => new Uint8Array([Math.floor(f/256), f % 256]),
    'uint32': (f) => new Uint8Array([Math.floor(f/256/256/256), Math.floor(f/256/256) % 256, Math.floor(f/256) % 256, f % 256]),
    'uint64': (f) => new Uint8Array([
        Number(BigInt(f) >> 56n & 0xffn),
        Number(BigInt(f) >> 48n & 0xffn),
        Number(BigInt(f) >> 40n & 0xffn),
        Number(BigInt(f) >> 32n & 0xffn),
        Number(BigInt(f) >> 24n & 0xffn),
        Number(BigInt(f) >> 16n & 0xffn),
        Number(BigInt(f) >> 8n & 0xffn),
        Number(BigInt(f) & 0xffn)
    ]),
    'ip': (f) => new Uint8Array([f.split('.')[0], f.split('.')[1], f.split('.')[2], f.split('.')[3]]),
    'uuid': (f) => new Uint8Array(f.replace(/-/g, '').match(/.{1,2}/g).map(byte => parseInt(byte, 16))),
    'str': (f) => concatTypedArrays(to_array_buffer(f), new Uint8Array([0])),
    'sha256': (f) => new Uint8Array(f.replace(/:/g, '').match(/.{1,2}/g).map(byte => parseInt(byte, 16))),
}

const decoders = {
    'uint8': (f) => f[0],
    'uint16': (f) => f[0] * 256 + f[1],
    'uint32': (f) => f[0] * 256 * 256 * 256 + f[1] * 256 * 256 + f[2] * 256 + f[3],
    'uint64': (f) => (
        (BigInt(f[0]) << 56n)+
        (BigInt(f[1]) << 48n)+
        (BigInt(f[2]) << 40n)+
        (BigInt(f[3]) << 32n)+
        (BigInt(f[4]) << 24n)+
        (BigInt(f[5]) << 16n)+
        (BigInt(f[6]) << 8n)+
        (BigInt(f[7]))
    ).toString(),
    'ip': (f) => f[0] + '.' + f[1] + '.' + f[2] + '.' + f[3],
    'uuid': (f) => Array.from(f, byte => byte.toString(16).padStart(2, '0')).join('').toLowerCase().replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
    'str': (f) => new TextDecoder().decode(f.slice(0, -1)),
    'sha256': (f) =>  Array.from(f, byte => byte.toString(16).padStart(2, '0')).join(':').toUpperCase(),
}

const lengths = {
    'uint8': (f) => 1,
    'uint16': (f) => 2,
    'uint32': (f) => 4,
    'uint64': (f) => 8,
    'ip': (f) => 4,
    'uuid': (f) => 16,
    'str': (f) => f.indexOf(0) + 1,
    'sha256': (f) =>  32,
}

regexes = list.map(x => new RegExp('^' + x.replace(/\{[^}]+}/g, `(.+)`) + '$'));
variables = list.map(x => Array.from(x.matchAll(/\{[^}]+}/g)).map(x => x[0].slice(1, -1)));


function compress(inp) {
    const sep = inp.indexOf('\r\n') != -1?'\r\n':'\n';
    const inp_list = inp.trim().split(sep);
    const arr = concatTypedArraysMulti(...inp_list.map(compress_line));
    const ret = btoa(String.fromCharCode(...arr))
    console.log(inp.trim(), decompress(ret))
    return ret
}

function to_array_buffer(str) {
    var enc = new TextEncoder();
    return new Uint8Array(enc.encode(str));
}

function concatTypedArrays(a, b) { // a, b TypedArray of same type
    var c = new (a.constructor)(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
}

function concatTypedArraysMulti(...args) {
    return args.reduce(concatTypedArrays);
}

const zip = (a, b) => a.map((k, i) => [k, b[i]]);

function encodeField([match, field]) {
    return encoders[field](match);
}

function lastMatch(arr) {
    for (i = arr.length - 1; i >= 0; i--) {
        if (arr[i]) {
            return i;
        }
    }
}

function compress_line(line) {
    const matches = regexes.map(regex => line.match(regex))
    const match = lastMatch(matches);
    const arr = concatTypedArraysMulti(new Uint8Array([match]), ...(zip(matches[match].slice(1), variables[match]).map(encodeField)));
    return arr
}

function decompress(str) {
    let inp = Uint8Array.from(atob(str), c => c.charCodeAt(0));
    les = [];
    while (inp.length) {
        let match = inp[0];
        inp = inp.slice(1)
        let vars = variables[match];
        let le = list[match];
        for (let svar of vars) {
            let len = lengths[svar](inp);
            let val = decoders[svar](inp.slice(0, len));
            le = le.replace(/{[^}]+}/, val.toString());
            inp = inp.slice(len);
        }
        les.push(le);
    }
    return les.join('\r\n');
}
