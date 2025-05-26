// --- Browser-Side Audio Analysis ---
// (This function is identical to the one in __tests__/e2e/shared/browserMediaUtils.ts
//  as it's designed to be stringified and run in the browser. Only its TS signature might differ if needed)
export interface AudioAnalysisResult {
  frequencies: (number | null)[];
  peakAmplitudes: (number | null)[];
  err?: any;
}

export async function analyzeAudioInBrowser(options: {
  analysisType: 'frequency' | 'amplitude';
  silenceThresholdDb?: number;
}): Promise<AudioAnalysisResult> {
  // This function's body is executed in the browser context.
  // It's copied verbatim from the original browserMediaUtils.ts
  const { analysisType, silenceThresholdDb = -80 } = options;
  console.log(`--- Starting Audio Analysis in Browser --- Type: ${analysisType}`);
  const MAX_FREQ_SAMPLES = 4;

  const results: AudioAnalysisResult = {
    frequencies: [],
    peakAmplitudes: []
  };

  let audioCtx: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;

  try {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = analysisType === 'frequency' ? 4096 : 512;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    console.log('Searching for playing, unmuted <audio> or <video> elements with audio tracks...');
    const mediaElements = document.querySelectorAll('audio, video');
    console.log(` Found ${mediaElements.length} media elements.`);

    for (const el of mediaElements) {
      const mediaElement = el as HTMLAudioElement | HTMLVideoElement;
      const container = mediaElement.closest(
        'div[id^="test-local-video-"], div[id^="test-remote-video-"], div[id*="stream-container"]'
      );
      console.log(
        `  Checking element: Tag=${mediaElement.tagName}, Muted=${mediaElement.muted}, Paused=${mediaElement.paused}, SrcObject Type=${typeof mediaElement.srcObject}, In Test Container=${!!container}`
      );

      if (container && !mediaElement.muted && !mediaElement.paused) {
        if (mediaElement.srcObject instanceof MediaStream) {
          const stream = mediaElement.srcObject;
          const audioTracks = stream.getAudioTracks();
          console.log(
            `   Stream found in container ${container.id || 'unknown'}: StreamID=${stream.id}, Active=${stream.active}, Audio Tracks=${audioTracks.length}`
          );

          if (
            stream.active &&
            audioTracks.length > 0 &&
            audioTracks.some((track) => track.enabled)
          ) {
            console.log(`   Found suitable playing stream in ${mediaElement.tagName} element.`);
            try {
              sourceNode = audioCtx.createMediaStreamSource(stream);
              console.log(`   Successfully created source node from stream ${stream.id}.`);
              break;
            } catch (err) {
              console.warn(
                `   Could not create source node from stream ${stream.id}: ${(err as Error).message}`
              );
              sourceNode = null;
            }
          } else {
            console.log(`   Stream ${stream.id} is inactive or has no enabled audio tracks.`);
          }
        } else {
          try {
            sourceNode = audioCtx.createMediaElementSource(mediaElement);
            console.log(`   Successfully created source node from HTML5 Media Element.`);
            break;
          } catch (err) {
            console.warn(
              `   Could not create source node from HTML5 Media Element: ${(err as Error).message}`
            );
            sourceNode = null;
          }
        }
      } else {
        console.log(
          `   Element is muted, paused, has no valid MediaStream srcObject, or not in a recognized test container.`
        );
      }
    }

    if (!sourceNode) {
      console.error(
        'Failed to find any suitable playing, unmuted audio stream source in a test container.'
      );
      results.peakAmplitudes = analysisType === 'amplitude' ? [null] : [];
      results.frequencies = [];
      return results;
    }

    console.log(`Successfully connected sourceNode for analysis.`);
    sourceNode.connect(analyser);

    function getDominantFrequency(): number | null {
      if (!analyser) return null;
      analyser.getFloatFrequencyData(dataArray);
      let maxAmp = -Infinity;
      let maxIndex = -1;
      for (let i = 0; i < bufferLength; i++) {
        if (dataArray[i] > maxAmp && isFinite(dataArray[i])) {
          maxAmp = dataArray[i];
          maxIndex = i;
        }
      }
      if (maxIndex === -1 || maxAmp < silenceThresholdDb!) {
        console.log(
          ` Freq Analysis: Detected low amplitude (${maxAmp.toFixed(2)} dB), returning null.`
        );
        return null;
      }
      const nyquist = audioCtx!.sampleRate / 2;
      const frequency = (maxIndex * nyquist) / bufferLength;
      console.log(
        ` Freq Analysis: Max Amp ${maxAmp.toFixed(2)} dB at Index ${maxIndex}, Calculated Freq: ${frequency.toFixed(2)} Hz`
      );
      return frequency;
    }

    function getPeakAmplitude(): number | null {
      if (!analyser) return null;
      analyser.getFloatFrequencyData(dataArray);
      let maxAmp = -Infinity;
      for (let i = 0; i < bufferLength; i++) {
        if (dataArray[i] > maxAmp && isFinite(dataArray[i])) {
          maxAmp = dataArray[i];
        }
      }
      if (maxAmp === -Infinity) {
        console.log(` Amp Analysis: No valid signal detected, returning null.`);
        return null;
      }
      console.log(` Amp Analysis: Peak Amplitude: ${maxAmp.toFixed(2)} dB`);
      return maxAmp;
    }

    if (analysisType === 'frequency') {
      for (let i = 0; i < MAX_FREQ_SAMPLES; i++) {
        if (i > 0) {
          const randomInterval = Math.random() * 1000 + 2000;
          console.log(` Waiting ${randomInterval.toFixed(0)}ms for next sample...`);
          await new Promise((resolve) => setTimeout(resolve, randomInterval));
        } else {
          console.log(' Initial 1000ms delay for analyser stabilization...');
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        console.log(` Taking frequency sample ${i + 1}/${MAX_FREQ_SAMPLES}...`);
        const currentFreq = getDominantFrequency();
        results.frequencies.push(currentFreq);
        if (results.frequencies.length >= 2) {
          const lastFreq = results.frequencies[results.frequencies.length - 1];
          const prevFreq = results.frequencies[results.frequencies.length - 2];
          if (lastFreq !== null && prevFreq !== null && lastFreq !== prevFreq) {
            console.log(
              ` Detected frequency change (${prevFreq.toFixed(2)} Hz -> ${lastFreq.toFixed(2)} Hz). Stopping sampling early.`
            );
            break;
          }
        }
      }
    } else {
      console.log(' Initial 500ms delay for analyser stabilization...');
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log(` Taking amplitude sample 1/1...`);
      results.peakAmplitudes.push(getPeakAmplitude());
    }
  } catch (error) {
    console.error(`Error during audio analysis in browser: ${(error as Error).message}`);
    results.err = { message: (error as Error).message, stack: (error as Error).stack };
    if (!results.frequencies) results.frequencies = [];
    if (!results.peakAmplitudes)
      results.peakAmplitudes = analysisType === 'amplitude' ? [null] : [];
  } finally {
    console.log('Cleaning up audio analysis resources...');
    if (sourceNode && analyser) {
      try {
        sourceNode.disconnect(analyser);
        console.log(' Disconnected source node from analyser.');
      } catch (e) {
        console.warn('Could not disconnect source node:', (e as Error).message);
      }
    }
    if (audioCtx) {
      try {
        await audioCtx.close();
        console.log(' Closed AudioContext.');
      } catch (e) {
        console.warn('Could not close AudioContext:', (e as Error).message);
      }
    }
  }
  console.log('--- Audio Analysis Complete --- Results:', JSON.stringify(results));
  return results;
}

// --- Browser-Side YCbCr Analysis ---
// analyzeImageForYuvAveragesInBrowser and its YuvAnalysisResult interface have been removed.
// The functionality is now covered by analyzeImageBufferForYuvNode in pwNodeMediaProcessingUtils.ts
