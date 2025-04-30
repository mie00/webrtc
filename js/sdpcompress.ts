// Type definitions for SDP compression
interface CompressionVariables {
  [key: number]: string[];
}

interface FieldEncoder {
  (value: any): Uint8Array;
}

interface FieldDecoder {
  (value: Uint8Array): any;
}

interface FieldLength {
  (value: Uint8Array): number;
}

interface Encoders {
  [key: string]: FieldEncoder;
}

interface Decoders {
  [key: string]: FieldDecoder;
}

interface Lengths {
  [key: string]: FieldLength;
}

// The list of SDP patterns
const list: string[] = `
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
a=candidate:{uint32} 1 tcp {uint32} {ip} {uint16} typ host tcptype active generation 0 network-id {uint8}
`.trim().split('\n');

// Create regex patterns for matching SDP lines
const regexes: RegExp[] = list.map(x => 
  new RegExp('^' + x.replace(/\{[^}]+}/g, `(.+)`) + '$')
);

// Extract variable names from the patterns
const variables: string[][] = list.map(x => 
  Array.from(x.matchAll(/\{([^}]+)}/g)).map(match => match[1])
);

// Encoders for different field types
const encoders: Encoders = {
  'uint8': (f: number): Uint8Array => new Uint8Array([f]),
  'uint16': (f: number): Uint8Array => new Uint8Array([Math.floor(f/256), f % 256]),
  'uint32': (f: number): Uint8Array => new Uint8Array([
    Math.floor(f/256/256/256), 
    Math.floor(f/256/256) % 256, 
    Math.floor(f/256) % 256, 
    f % 256
  ]),
  'uint64': (f: number | string): Uint8Array => {
    const bigInt = typeof f === 'string' ? BigInt(f) : BigInt(f);
    return new Uint8Array([
      Number(bigInt >> 56n & 0xffn),
      Number(bigInt >> 48n & 0xffn),
      Number(bigInt >> 40n & 0xffn),
      Number(bigInt >> 32n & 0xffn),
      Number(bigInt >> 24n & 0xffn),
      Number(bigInt >> 16n & 0xffn),
      Number(bigInt >> 8n & 0xffn),
      Number(bigInt & 0xffn)
    ]);
  },
  'ip': (f: string): Uint8Array => {
    const parts = f.split('.');
    return new Uint8Array([
      parseInt(parts[0]), 
      parseInt(parts[1]), 
      parseInt(parts[2]), 
      parseInt(parts[3])
    ]);
  },
  'uuid': (f: string): Uint8Array => {
    const hexString = f.replace(/-/g, '');
    const matches = hexString.match(/.{1,2}/g);
    if (!matches) return new Uint8Array(0);
    return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
  },
  'str': (f: string): Uint8Array => concatTypedArrays(to_array_buffer(f), new Uint8Array([0])),
  'sha256': (f: string): Uint8Array => {
    const hexString = f.replace(/:/g, '');
    const matches = hexString.match(/.{1,2}/g);
    if (!matches) return new Uint8Array(0);
    return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
  }
};

// Decoders for different field types
const decoders: Decoders = {
  'uint8': (f: Uint8Array): number => f[0],
  'uint16': (f: Uint8Array): number => f[0] * 256 + f[1],
  'uint32': (f: Uint8Array): number => f[0] * 256 * 256 * 256 + f[1] * 256 * 256 + f[2] * 256 + f[3],
  'uint64': (f: Uint8Array): string => (
    (BigInt(f[0]) << 56n) +
    (BigInt(f[1]) << 48n) +
    (BigInt(f[2]) << 40n) +
    (BigInt(f[3]) << 32n) +
    (BigInt(f[4]) << 24n) +
    (BigInt(f[5]) << 16n) +
    (BigInt(f[6]) << 8n) +
    (BigInt(f[7]))
  ).toString(),
  'ip': (f: Uint8Array): string => `${f[0]}.${f[1]}.${f[2]}.${f[3]}`,
  'uuid': (f: Uint8Array): string => {
    const hexArray = Array.from(f, byte => byte.toString(16).padStart(2, '0'));
    const hexString = hexArray.join('').toLowerCase();
    return hexString.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  },
  'str': (f: Uint8Array): string => new TextDecoder().decode(f.slice(0, -1)),
  'sha256': (f: Uint8Array): string => {
    return Array.from(f, byte => byte.toString(16).padStart(2, '0')).join(':').toUpperCase();
  }
};

// Length calculators for different field types
const lengths: Lengths = {
  'uint8': (): number => 1,
  'uint16': (): number => 2,
  'uint32': (): number => 4,
  'uint64': (): number => 8,
  'ip': (): number => 4,
  'uuid': (): number => 16,
  'str': (f: Uint8Array): number => f.indexOf(0) + 1,
  'sha256': (): number => 32
};

/**
 * Converts a string to a Uint8Array
 * @param str - The string to convert
 * @returns A Uint8Array representation of the string
 */
function to_array_buffer(str: string): Uint8Array {
  const enc = new TextEncoder();
  return enc.encode(str);
}

/**
 * Concatenates two Uint8Arrays
 * @param a - First Uint8Array
 * @param b - Second Uint8Array
 * @returns A new Uint8Array containing the concatenated data
 */
function concatTypedArrays(a: Uint8Array, b: Uint8Array): Uint8Array {
  const c = new Uint8Array(a.length + b.length);
  c.set(a, 0);
  c.set(b, a.length);
  return c;
}

/**
 * Concatenates multiple Uint8Arrays
 * @param args - Array of Uint8Arrays to concatenate
 * @returns A new Uint8Array containing all concatenated data
 */
function concatTypedArraysMulti(...args: Uint8Array[]): Uint8Array {
  return args.reduce(concatTypedArrays, new Uint8Array(0));
}

/**
 * Zips two arrays together
 * @param a - First array
 * @param b - Second array
 * @returns An array of pairs [a[i], b[i]]
 */
function zip<T, U>(a: T[], b: U[]): [T, U][] {
  return a.map((k, i) => [k, b[i]]);
}

/**
 * Encodes a field based on its type
 * @param matchAndField - A tuple containing the matched value and field type
 * @returns A Uint8Array containing the encoded field
 */
function encodeField([match, field]: [string, string]): Uint8Array {
  return encoders[field](match);
}

/**
 * Finds the last matching index in an array
 * @param arr - The array to search
 * @returns The index of the last truthy value, or -1 if none found
 */
function lastMatch(arr: any[]): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i]) {
      return i;
    }
  }
  return -1;
}

/**
 * Compresses a line of SDP
 * @param line - The SDP line to compress
 * @returns A Uint8Array containing the compressed data
 */
function compress_line(line: string): Uint8Array {
  const matches = regexes.map(regex => line.match(regex));
  const matchIndex = lastMatch(matches);
  
  if (matchIndex === -1 || !matches[matchIndex]) {
    return new Uint8Array([0]);
  }
  
  const matchResult = matches[matchIndex];
  const matchVars = variables[matchIndex];
  
  // Create pairs of [matched value, field type]
  const fieldPairs = zip(
    matchResult.slice(1), 
    matchVars
  );
  
  // Encode each field and concatenate with the match index
  return concatTypedArraysMulti(
    new Uint8Array([matchIndex]), 
    ...fieldPairs.map(encodeField)
  );
}

/**
 * Compresses an SDP string
 * @param inp - The SDP string to compress
 * @returns A base64 encoded string of the compressed data
 */
export function compress(inp: string | null | undefined): string {
  if (!inp || inp.trim() === '') {
    return '';
  }
  
  const sep = inp.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  const inp_list = inp.trim().split(sep);
  const arr = concatTypedArraysMulti(...inp_list.map(compress_line));
  
  // Convert to base64
  const ret = btoa(String.fromCharCode.apply(null, Array.from(arr)));
  console.log({'compressed': inp.trim()});
  return ret;
}

/**
 * Decompresses a compressed SDP string
 * @param str - The base64 encoded compressed SDP
 * @returns The decompressed SDP string
 */
export function decompress(str: string): string {
  let inp = Uint8Array.from(atob(str), c => c.charCodeAt(0));
  let lines: string[] = [];
  
  while (inp.length) {
    // Get the match index
    const matchIndex = inp[0];
    inp = inp.slice(1);
    
    // Get the variables for this pattern
    const vars = variables[matchIndex];
    let line = list[matchIndex];
    
    // Replace each variable in the pattern
    for (const varType of vars) {
      const len = lengths[varType](inp);
      const val = decoders[varType](inp.slice(0, len));
      line = line.replace(`{${varType}}`, val.toString());
      inp = inp.slice(len);
    }
    
    lines.push(line);
  }
  
  return lines.join('\r\n');
}
