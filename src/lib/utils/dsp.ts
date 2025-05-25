const context = new AudioContext();

const BIT_DURATION = 0.1; // seconds
const FREQ_0 = 1200;
const FREQ_1 = 2200;
const PREAMBLE = "10101010";

// -- Utils --
function textToBinary(text: string): string {
  return [...text].map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join('');
}

function binaryToText(binary: string): string {
  return binary.match(/.{8}/g)?.map(b => String.fromCharCode(parseInt(b, 2))).join('') || '';
}

function xorChecksum(bin: string): string {
  const bytes = bin.match(/.{8}/g);
  if (!bytes) return '00000000';
  let checksum = 0;
  for (const byte of bytes) {
    checksum ^= parseInt(byte, 2);
  }
  return checksum.toString(2).padStart(8, '0');
}

// -- Transmit Function --
export async function sendFSK(text: string): Promise<void> {
  const binary = PREAMBLE + textToBinary(text) + xorChecksum(textToBinary(text));
  const start = context.currentTime;

  binary.split('').forEach((bit, i) => {
    const osc = context.createOscillator();
    const freq = bit === '0' ? FREQ_0 : FREQ_1;
    osc.frequency.value = freq;
    osc.type = 'sine';

    const gain = context.createGain();
    gain.gain.value = 0.3; // soft output

    osc.connect(gain).connect(context.destination);
    const t0 = start + i * BIT_DURATION;
    osc.start(t0);
    osc.stop(t0 + BIT_DURATION);
  });
}

// -- Receive Function --
export async function receiveFSK(timeoutMs = 4000): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mic = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  mic.connect(analyser);

  const sampleRate = context.sampleRate;
  const buffer = new Uint8Array(analyser.frequencyBinCount);
  const indexToFreq = (i: number) => i * sampleRate / analyser.fftSize;

  let bits: string[] = [];
  const start = Date.now();

  return new Promise<string>(resolve => {
    const interval = setInterval(() => {
      analyser.getByteFrequencyData(buffer);

      // Peak detection
      let maxAmp = 0;
      let detected: number | null = null;
      for (let i = 0; i < buffer.length; i++) {
        const amp = buffer[i];
        const freq = indexToFreq(i);
        if (amp > maxAmp && (Math.abs(freq - FREQ_0) < 100 || Math.abs(freq - FREQ_1) < 100)) {
          maxAmp = amp;
          detected = freq;
        }
      }

      if (detected) {
        if (Math.abs(detected - FREQ_0) < 100) bits.push('0');
        else if (Math.abs(detected - FREQ_1) < 100) bits.push('1');
      }

      // Time out after timeoutMs
      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        stream.getTracks().forEach(t => t.stop());

        const bitStr = bits.join('');
        const preambleIndex = bitStr.indexOf(PREAMBLE);
        if (preambleIndex === -1) return resolve('[No Preamble Found]');

        const dataStart = preambleIndex + PREAMBLE.length;
        const dataBits = bitStr.slice(dataStart);
        const bytes = dataBits.match(/.{8}/g);

        if (!bytes || bytes.length < 2) return resolve('[Invalid Data]');

        const checksum = bytes.pop()!;
        const payload = bytes.join('');
        const valid = xorChecksum(payload) === checksum;
        const message = binaryToText(payload);

        resolve(valid ? message : '[Checksum Failed]');
      }
    }, BIT_DURATION * 1000);
  });
}
