<script module lang="ts">
  // add mies type to window
  declare global {
    interface Window {
      mies: HTMLElement[];
      Module: any; // Whisper module
      loadRemote: (
        url: string,
        dst: string,
        size_mb: number,
        cbProgress: (p: number) => void,
        cbStoreFS: (buf: Uint8Array) => void,
        cbCancel: () => void,
        printTextarea: (text: string) => void
      ) => void;
      // MediaRecorder might need full typing if not available globally in your setup
      MediaRecorder: typeof MediaRecorder; 
    }
  }
</script>
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { streamStore, updateStreamConfig, setViewLayout, updateLocalStreamProperties, getLocalStreamsByType, type LayoutType } from '../stores/streamStore.js';
  import { normalizeStreamId, setupLocalFileStream, setAudioCallback } from '../lib/streamBridge.js';
  import { forwardStore, toggleForwardHandler as actualToggleForwardHandler, type LogMessage } from '../lib/forwardBridge.js';
  import { recorderStore, toggleRecording } from '../lib/media/recorder.js';
  import { calculateStreamPositions } from '../lib/media/streamLayout.js';
  import ContextMenu from './ContextMenu.svelte';
  import { updateConfig, configStore } from '../stores/configStore.js';
  import type { MenuItem } from '../types/menu.js';
  import StreamView from './StreamView.svelte';
  import { addLocalFileStream, removeLocalFileStream } from '../stores/localFileStreamStore.js';

  // get hangup and openQr from $props
  let { hangup, openQr }: { hangup?: () => void; openQr?: () => void } = $props();

  // Context menu state
  let showMenu = $state(false);
  let menuPosition = $state({ x: 0, y: 0 });
  let menuItems: MenuItem[] = $state([]);
  let selectedButton: 'audio'|'camera'|null = $state(null);
  let audioButton: HTMLElement;
  let videoButton: HTMLElement;
  let instant = $state(0);

  // Whisper state
  let isTranscribing = $state(false);
  let isWhisperModelLoading = $state(false);
  let isWhisperModelLoaded = $state(false);
  let whisperInstance: any = $state(null); // Opaque pointer/handle from Module.init

  // Audio capture related state for Whisper
  let whisperAudioContext: AudioContext | null = $state(null);
  let whisperMediaRecorder: MediaRecorder | null = $state(null);
  let accumulatedAudioData: Float32Array | null = $state(null); // This will hold the Float32Array for the current session's audio
  let currentSessionBlobs: Blob[] = $state([]); // Stores raw blobs from MediaRecorder for the current session
  let whisperModuleReady = $state(false);
  let transcriptionPollInterval: number | null = $state(null);

  // References to DOM elements
  let uploadVideo: HTMLInputElement;
  let refreshInterval: number;

  // Reactive button states
  const isAudioEnabled = $derived($streamStore.streamConfig.audio !== null);
  const isCameraEnabled = $derived($streamStore.streamConfig.camera !== null);
  const isScreenSharing = $derived($streamStore.streamConfig.screen);
  const isVideoShared = $derived($streamStore.streamConfig.file !== null);
  const isBlurEnabled = $derived($configStore['blur-video'] === 'yes');

  // Forwarding state - button still needs allowedHosts to change its text/color
  const allowedHosts = $derived($forwardStore.allowedHosts);

  // Stream layout state
  const currentLayout = $derived($streamStore.activeView.layout);
  const focusedStream = $derived($streamStore.activeView.focusedStream);

  // Derived stream collections
  const localStreams = $derived(Object.entries($streamStore.localStreams));
  const remoteStreams = $derived(Object.entries($streamStore.remoteStreams).flatMap(([peerId, data]) =>
    Object.entries(data.streams).map(([streamId, stream]) => ({
      id: streamId,
      stream,
      peerId
    }))
  ));

  interface ViewableStream {
    id: string,
    streamKey: string,
    stream: MediaStream | null,
    type: 'camera' | 'screen' | 'audio' | 'file', // Removed forward types
    isLocal: boolean,
    src: string | null,
  
    peerId?: string | null,
    audioStream?: MediaStream | null,
    hasAudio?: boolean | null,
    // logMessages prop removed
  }

  // Group streams by peer ID
  const groupedStreams = $derived.by(() => {
    const groups: Record<string, {
      peerId: string | null,
      streams: Array<ViewableStream>
    }> = {};
    
    // Add local streams
    const localPeerId = 'local';
    groups[localPeerId] = {
      peerId: null,
      streams: localStreams
        .filter(([_, data]) => data.viewable)
        .map(([streamId, data]) => ({
          id: normalizeStreamId(data.stream?.id || data.src || ''),
          streamKey: streamId,
          stream: data.stream,
          type: data.type,
          isLocal: true,
          peerId: null,
          src: data.src,
        }))
    };
    
    // Add remote streams
    remoteStreams.forEach(({ id, stream, peerId }) => {
      if (!groups[peerId]) {
        groups[peerId] = { peerId, streams: [] };
      }
      
      groups[peerId].streams.push({
        id: normalizeStreamId(stream.id),
        streamKey: id,
        stream,
        type: stream.getVideoTracks().length > 0 ? 'camera' : 'audio',
        isLocal: false,
        src: null,
      });
    });
    
    return groups;
  });
  
  // All active streams for display
  const activeStreams = $derived.by(() => {
    const result: ViewableStream[] = [];
    
    // Process each peer's streams from groupedStreams
    Object.values(groupedStreams).forEach(({ streams }) => {
      const hasVideoStreams = streams.some(s => 
        (s.type === 'camera' || s.type === 'screen' || s.type === 'file') && 
        (s.stream && s.stream.getVideoTracks().length > 0 || s.type === 'file')
      );
      
      const audioStreams = streams.filter(s => 
        s.type === 'audio' || 
        (s.stream && s.stream.getVideoTracks().length === 0 && s.stream.getAudioTracks().length > 0)
      );
      
      if (hasVideoStreams) {
        const videoStreams = streams.filter(s => 
          s.type !== 'audio' && 
          (s.stream && s.stream?.getVideoTracks().length > 0 || s.type === 'file')
        );
        
        videoStreams.forEach(stream => {
          const audioStream = audioStreams.length > 0 ? audioStreams[0].stream : null;
          const streamHasAudio = stream.stream && stream.stream.getAudioTracks().length > 0;
          stream.audioStream = audioStream;
          stream.hasAudio = !!audioStream || streamHasAudio;
        });
        result.push(...videoStreams);
      } else {
        result.push(...audioStreams);
      }
    });

    // Forwarding elements are now handled by ForwardOverlay.svelte

    return result;
  });
  // Stream positions
  let mediaContainerElement: HTMLElement;
  let streamPositions: Array<{ id: string; x: number; y: number; width: number; height: number }> = $state([]);
  
  function updateStreamPositions() {
    if (!mediaContainerElement) return;
    
    const containerWidth = mediaContainerElement.clientWidth;
    const containerHeight = mediaContainerElement.clientHeight;
    
    streamPositions = calculateStreamPositions(
      containerWidth,
      containerHeight,
      currentLayout,
      focusedStream
    );
  }

  function printWhisperLog(text: string) {
    console.log('[WhisperLib]:', text);
  }

  onMount(() => {
    // Set up interval for updating stream positions
    refreshInterval = window.setInterval(updateStreamPositions, 1000);

    // Setup Module for Whisper (must be done BEFORE stream.js is loaded)
    // Ensure this runs only once, even if onMount is called multiple times in some scenarios.
    if (!window.Module) {
      window.Module = {
        print: printWhisperLog,
        printErr: printWhisperLog,
        setStatus: function(text: string) {
          printWhisperLog('js status: ' + text);
        },
        monitorRunDependencies: function(left: number) {},
        preRun: function() {
          printWhisperLog('js: Preparing ...');
        },
        postRun: function() {
          printWhisperLog('js: Initialized successfully!');
          // Now Module methods like ccall, FS_xyz should be available
          whisperModuleReady = true;
        }
      };
    }
    // Ensure coi-serviceworker.js is loaded if needed for SharedArrayBuffer
    // This often needs to be at the root and register itself.
    // Example: if (!navigator.serviceWorker.controller && !(window as any).crossOriginIsolated) {
    //   const coiSw = document.createElement('script');
    //   coiSw.src = '/vendor/coi-serviceworker.js'; // Adjust path as needed
    //   document.head.appendChild(coiSw);
    // }
  });

  onDestroy(() => {
    clearInterval(refreshInterval);
    if (isTranscribing) {
      handleStopWhisperTranscription();
    }
    if (transcriptionPollInterval) {
      clearInterval(transcriptionPollInterval);
    }
    // Clean up Whisper audio context if it exists
    if (whisperAudioContext && whisperAudioContext.state !== 'closed') {
      whisperAudioContext.close();
    }
  });

  // Update positions when layout or streams change
  $effect(() => updateStreamPositions());

  // Event handlers
  function handleHangup() {
    if (hangup) hangup();
  }

  async function handleToggleAudio() {
    setAudioCallback((arg) => instant = arg);

    if ($streamStore.streamConfig.audio === null) {
      // Get the current audio device from config or use default
      const deviceString = $configStore['audio-device'] || '';
      updateStreamConfig({ audio: deviceString });
    } else {
      updateStreamConfig({ audio: null });
    }
  }

  async function handleContextMenu(type: 'audio'|'camera', event: MouseEvent) {
    event.preventDefault();
    selectedButton = type;

    const devices = await navigator.mediaDevices.enumerateDevices();
    const filtered = devices.filter(device => device.kind === `${type === 'camera'?'video':type}input`);

    if (filtered.length === 0) {
      alert(`No ${type} devices found`);
      return;
    }

    // Get current device ID
    const currentDeviceId = $streamStore.streamConfig[type];

    menuItems = [
      {
        id: 'enable-disable',
        label: $streamStore.streamConfig[type] === null ? `Enable ${type}` : `Disable ${type}`,
        type: 'toggle' as const,
        checked: $streamStore.streamConfig[type] !== null,
        action: () => {
          if (type === 'audio') {
            handleToggleAudio();
          } else {
            handleToggleVideo();
          }
        }
      },
    ];

    if (type === 'camera') {
      menuItems.push({
        id: 'blur',
        label: 'Blur background',
        type: 'toggle' as const,
        checked: isBlurEnabled,
        action: () => handleToggleBlur()
      });
    }

    menuItems.push({
      id: 'select-device',
      label: 'Select Device',
      type: 'submenu' as const,
      children: filtered.map(device => {
        const deviceString = `${device.groupId}|${device.deviceId}`;
        const isCurrentDevice = currentDeviceId === deviceString;
        
        return {
          id: deviceString,
          label: device.label,
          type: 'toggle' as const,
          checked: isCurrentDevice,
          action: () => {
            // Update both stores for compatibility
            updateConfig(`${type}-device`, deviceString);
            
            // If the stream is already enabled, update it with the new device
            if ($streamStore.streamConfig[type] !== null) {
              // Temporarily disable the stream and then re-enable it with the new device
              updateStreamConfig({ [type]: null });
              // Short delay to ensure cleanup completes before restarting
              setTimeout(() => updateStreamConfig({ [type]: deviceString }), 100);
            } else {
              // If not enabled, just enable it with the new device
              updateStreamConfig({ [type]: deviceString });
            }
          }
        };
      })
    });
    
    menuPosition = { x: event.pageX, y: event.pageY };
    showMenu = true;
  }

  async function handleContextSelect(item: MenuItem | string) {
    // This function is now mostly handled by the action callbacks in the menu items
    showMenu = false;
    
    // Handle legacy string items for backward compatibility
    if (typeof item === 'string' && selectedButton) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const device = devices.find(d => d.label === item && d.kind === `${selectedButton}input`);
      
      if (device) {
        const deviceString = `${device.groupId}|${device.deviceId}`;
        
        // Update both stores for compatibility
        updateConfig(`${selectedButton}-device`, deviceString);
        
        // If the stream is already enabled, update it with the new device
        if ($streamStore.streamConfig[selectedButton] !== null) {
          // Temporarily disable the stream and then re-enable it with the new device
          updateStreamConfig({ [selectedButton]: null });
          // Short delay to ensure cleanup completes before restarting
          setTimeout(() => updateStreamConfig({ [selectedButton!]: deviceString }), 100);
        } else {
          // If not enabled, just enable it with the new device
          updateStreamConfig({ [selectedButton]: deviceString });
        }
      }
    }
  }

  async function handleToggleVideo() {
    if ($streamStore.streamConfig.camera === null) {
      // Get the current video device from config or use default
      const deviceString = $configStore['video-device'] || '';
      updateStreamConfig({ camera: deviceString });
    } else {
      updateStreamConfig({ camera: null });
    }
  }

  async function handleToggleBlur() {
    const newValue = isBlurEnabled ? 'no' : 'yes';
    updateConfig('blur-video', newValue);
    
    // If video is already enabled, restart it to apply the blur effect
    if (isCameraEnabled) {
      // Temporarily disable and re-enable camera to apply blur
      const currentDevice = $streamStore.streamConfig.camera;
      updateStreamConfig({ camera: null });
      setTimeout(() => updateStreamConfig({ camera: currentDevice }), 100);
    }
  }

  async function handleToggleScreen() {
    const newValue = !$streamStore.streamConfig.screen;
    updateStreamConfig({ screen: newValue });
  }
  
  async function handleStartForward() {
    await actualToggleForwardHandler();
  }

  
  // Use the recorder store
  const isRecording = $derived($recorderStore.isRecording);

  async function handleRecord() {
    await toggleRecording();
  }
  
  function handleOpenQr() {
    if(openQr) openQr();
  }
  
  function handleShareVideo() {
    // Trigger file upload dialog
    if ($streamStore.streamConfig.file !== null) {
      handleVideoCleanup();
    } else {
      uploadVideo?.click();
    }
  }

  async function handleVideoUpload(event: Event) {
    if (uploadVideo.files && uploadVideo.files.length > 0) {
      const file = uploadVideo.files[0];
      const fileURL = URL.createObjectURL(file);

      updateStreamConfig({
        file: fileURL,
        videoStream: undefined,
      });
    }
  }
  async function handleVideoCleanup() {
    const src = $streamStore.streamConfig.file!;
    removeLocalFileStream(src);
    updateStreamConfig({file: null, videoStream: null});
    uploadVideo.value = ''; // Reset the file input
  }

  async function handleFilePlay(event: Event) {
    if ($streamStore.streamConfig.videoStream) {
      return
    }
    const videoNode = (event.target as HTMLVideoElement);
    videoNode.play();
    const videoStream = (videoNode as any).captureStream ? 
      (videoNode as any).captureStream() : 
      (videoNode as any).mozCaptureStream();

    updateStreamConfig({
      videoStream
    });
    addLocalFileStream($streamStore.streamConfig.file!, videoStream);
    setupLocalFileStream(videoStream);
    
    // Find the file stream ID to update
    const fileStreams = getLocalStreamsByType('file');
    const fileStreamEntry = Object.entries(fileStreams)[0]; // Get the first file stream
    
    if (fileStreamEntry) {
      // Update the file stream to be sendable now that it's playing
      updateLocalStreamProperties(fileStreamEntry[0], { sendable: true });
    }
  }

  function handleChangeLayout(layout: LayoutType) {
    setViewLayout(layout);
  }

  function handleFocusStream({streamId}:{streamId: string|undefined; peerId : string | null}) {
    setViewLayout('focus', streamId);
  }

  // Whisper Transcription Functions
  async function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve(); // Already loaded
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.type = 'text/javascript';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = (e) => reject(new Error(`Failed to load script: ${src}. Error: ${e}`));
      document.head.appendChild(script);
    });
  }

  async function ensureWhisperReady(): Promise<boolean> {
    if (whisperModuleReady && window.Module?.FS_createDataFile && (window as any).loadRemote) {
        return true;
    }

    try {
      // helpers.js provides loadRemote
      await loadScript('/vendor/whisper.wasm/helpers.js');
      // stream.js initializes Module and its FS functions, and WASM.
      // Module object must be pre-configured before this.
      await loadScript('/vendor/whisper.wasm/stream.js');
      
      let attempts = 0;
      while(!whisperModuleReady && attempts < 200) { // Timeout after 20s
          await new Promise(res => setTimeout(res, 100));
          attempts++;
      }
      if (!whisperModuleReady) {
          console.error("Whisper Module did not become ready.");
          return false;
      }
      if (!(window as any).loadRemote) {
        console.error("window.loadRemote not found after loading helpers.js");
        return false;
      }
      return true;
    } catch (error) {
      console.error("Error loading Whisper scripts:", error);
      isWhisperModelLoading = false;
      return false;
    }
  }

  async function handleStartWhisperTranscriptionFlow() {
    isWhisperModelLoading = true;

    const ready = await ensureWhisperReady();
    if (!ready || !(window as any).loadRemote || !window.Module?.FS_createDataFile) {
      console.error("Whisper library not properly loaded.");
      isWhisperModelLoading = false;
      return;
    }
    
    const model = 'base-q5_1';
    const urls: Record<string, string> = {
      'tiny':     'https://whisper.ggerganov.com/ggml-model-whisper-tiny.bin',
      'base':     'https://whisper.ggerganov.com/ggml-model-whisper-base.bin',
      'small':    'https://whisper.ggerganov.com/ggml-model-whisper-small.bin',

      'tiny-q5_1':     'https://whisper.ggerganov.com/ggml-model-whisper-tiny-q5_1.bin',
      'base-q5_1':     'https://whisper.ggerganov.com/ggml-model-whisper-base-q5_1.bin',
      'small-q5_1':    'https://whisper.ggerganov.com/ggml-model-whisper-small-q5_1.bin',
      'medium-q5_0':   'https://whisper.ggerganov.com/ggml-model-whisper-medium-q5_0.bin',
      'large-q5_0':    'https://whisper.ggerganov.com/ggml-model-whisper-large-q5_0.bin',
    };
    const sizes: Record<string, number> = {
      'tiny':     75,
      'base':     142,
      'small':    466,

      'tiny-q5_1':      31,
      'base-q5_1':      57,
      'small-q5_1':     182,
      'medium-q5_0':    515,
      'large-q5_0':     1030,
    };
    const modelUrl = urls[model];
    const modelDst = 'whisper.bin'; 
    const modelSizeMb = sizes[model];
    const lang = "ar";

    printWhisperLog(`Loading model "${model}"...`);

    (window as any).loadRemote(
      modelUrl, modelDst, modelSizeMb,
      (progress: number) => printWhisperLog(`Model download progress: ${Math.round(progress * 100)}%`),
      (filename: string, modelData: Uint8Array) => { // Corrected callback signature
        try {
            // modelDst from outer scope is the correct path for FS operations
            window.Module.FS_unlink(modelDst);
        } catch (e) { /* ignore */ }
        // Use modelData (the actual binary data) here
        window.Module.FS_createDataFile("/", modelDst, modelData, true, true);
        printWhisperLog(`Stored model: ${modelDst}, size: ${modelData.length}`);
        
        isWhisperModelLoaded = true;
        whisperInstance = window.Module.init(modelDst, lang); // Module.init is from stream.js

        if (whisperInstance) {
          printWhisperLog(`Whisper initialized, instance: ${whisperInstance}`);
          isWhisperModelLoading = false;
          isTranscribing = true;
          startAudioCaptureForWhisper();
          startTranscriptionPolling();
        } else {
          console.error("Failed to initialize whisper instance.");
          isWhisperModelLoading = false;
        }
      },
      () => { // cbCancel
        console.error("Model loading cancelled or failed.");
        isWhisperModelLoading = false;
      },
      printWhisperLog 
    );
  }

  function startAudioCaptureForWhisper() {
    if (!whisperInstance) return;

    const kSampleRate = 16000;
    const kIntervalAudio_ms = 5000; // Pass audio to C++ instance at this rate

    if (whisperAudioContext && whisperAudioContext.state !== 'closed') {
      whisperAudioContext.close();
    }
    whisperAudioContext = new AudioContext({
        sampleRate: kSampleRate, channelCount: 1,
        echoCancellation: false, autoGainControl:  true, noiseSuppression: true,
    });

    currentSessionBlobs = []; // Reset blob accumulator for the new recording session
    accumulatedAudioData = null; // Reset final Float32Array

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        if (whisperMediaRecorder && whisperMediaRecorder.state === "recording") {
          whisperMediaRecorder.stop();
        }
        
        // MediaRecorder is created without specific mimeType, like in the example.
        // The mimeType will be specified when creating the Blob.
        whisperMediaRecorder = new MediaRecorder(stream); 

        whisperMediaRecorder.ondataavailable = (event) => { // Removed async, FileReader is callback based
          if (event.data.size > 0 && whisperAudioContext) {
            currentSessionBlobs.push(event.data);

            // Create a new Blob from all chunks received so far in this session,
            // using the specific MIME type from the example.
            const combinedBlob = new Blob(currentSessionBlobs, { 'type' : 'audio/ogg; codecs=opus' });
            
            const reader = new FileReader();

            reader.onload = () => {
              if (!whisperAudioContext || !reader.result) {
                console.error("Whisper audio context or FileReader result is missing.");
                return; 
              }
              const arrayBuffer = reader.result as ArrayBuffer;

              whisperAudioContext.decodeAudioData(arrayBuffer, (audioBuffer) => {
                const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate);
                const source = offlineCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(offlineCtx.destination);
                source.start(0);

                offlineCtx.startRendering().then((renderedBuffer) => {
                  // This Float32Array represents the audio from the start of the current
                  // recording session up to this point.
                  const currentSessionFloat32Audio = renderedBuffer.getChannelData(0);
                  accumulatedAudioData = currentSessionFloat32Audio; 

                  if (whisperInstance && window.Module?.set_audio && accumulatedAudioData) {
                    window.Module.set_audio(whisperInstance, accumulatedAudioData);
                  }
                }).catch(e => console.error("Error rendering offline audio:", e));
              }, (e) => console.error("Error decoding audio data for Whisper:", e));
            };

            reader.onerror = (e) => {
              console.error("FileReader error:", e);
            };

            reader.readAsArrayBuffer(combinedBlob);
          }
        };
        
        whisperMediaRecorder.start(kIntervalAudio_ms);
        if (window.Module?.set_status) window.Module.set_status("recording");
      })
      .catch(err => {
        console.error('Error getting audio stream for Whisper:', err);
        isTranscribing = false; 
        isWhisperModelLoading = false;
      });
  }

  function startTranscriptionPolling() {
    if (transcriptionPollInterval) clearInterval(transcriptionPollInterval);
    transcriptionPollInterval = window.setInterval(() => {
      if (whisperInstance && window.Module?.get_transcribed) {
        const transcribedText = window.Module.get_transcribed();
        if (transcribedText && transcribedText.length > 0) {
          console.log("Whisper Transcription:", transcribedText);
        }
      }
    }, 1000); // Poll every second
  }

  function handleStopWhisperTranscription() {
    if (whisperMediaRecorder && whisperMediaRecorder.state === "recording") {
      whisperMediaRecorder.stop();
    }
    whisperMediaRecorder?.stream?.getTracks().forEach(track => track.stop());
    
    // Do not close the main AudioContext here, as it might be reused.
    // The example closes and recreates it on each start. Let's follow that.
    if (whisperAudioContext && whisperAudioContext.state !== 'closed') {
      whisperAudioContext.close();
    }
    whisperAudioContext = null; // Allow it to be recreated

    if (transcriptionPollInterval) {
      clearInterval(transcriptionPollInterval);
      transcriptionPollInterval = null;
    }
    
    currentSessionBlobs = []; // Clear accumulated blobs on stop
    // accumulatedAudioData will be reset when/if transcription restarts

    if (window.Module?.set_status) window.Module.set_status("paused");
    printWhisperLog("Transcription stopped.");
    isTranscribing = false;
  }

  function handleToggleTranscription() {
    if (isTranscribing) {
      handleStopWhisperTranscription();
    } else {
      if (!isWhisperModelLoaded) {
        handleStartWhisperTranscriptionFlow(); 
      } else if (whisperInstance) {
        isTranscribing = true;
        startAudioCaptureForWhisper(); // Re-capture audio
        startTranscriptionPolling();   // Restart polling
      } else {
        // Fallback if model was marked loaded but instance is lost
        handleStartWhisperTranscriptionFlow();
      }
    }
  }
</script>

<div id="media" bind:this={mediaContainerElement} class="w-full w-svw h-svh relative bg-black" style="width: 100svw; height: 100svh;">
  <!-- Hidden video element for file uploads -->
  
  <!-- Unified stream rendering using calculated positions -->
  {#each activeStreams as stream (stream.id + (stream.audioStream?.id || ''))}
    {#if streamPositions.find(pos => pos.id === stream.id)}
      {@const position = streamPositions.find(pos => pos.id === stream.id)}
      <div class="stream-container absolute"
           id={stream.isLocal ? `test-local-video-${stream.streamKey}` : `test-remote-video-${stream.peerId}-${stream.id}`}
           style="left: {position?.x}px; top: {position?.y}px; width: {position?.width}px; height: {position?.height}px;">
        <StreamView
          stream={stream.src?null:stream.stream}
          useSlot={!!stream.src}
          type={!stream.stream || stream.stream.getVideoTracks().length > 0 ? 'video' : 'audio'}
          muted={stream.isLocal && stream.type !== 'file'} 
          mirrored={stream.isLocal && stream.type === 'camera'} 
          peerId={stream.peerId}
          focus={handleFocusStream}
          audioStream={stream.audioStream || undefined}
          hasAudio={stream.hasAudio || undefined}
        >
          {#if stream.type === 'file' && stream.src}
            <!-- svelte-ignore a11y_media_has_caption -->
            {#key stream.src}
              <video onloadeddata={handleFilePlay} src={stream.src} autoplay controls loop class="w-full h-full object-contain"></video>
            {/key}
          {/if}
        </StreamView>
      </div>
    {/if}
  {/each}
</div>

<div class="fixed bottom-0 left-0 right-0 bg-transparent p-4 flex justify-center space-x-0 lg:space-x-4 pointer-events-none">
  <!-- Layout controls -->
  <div class="layout-controls pointer-events-auto flex mr-4">
    <button id="test-layout-grid-button" onclick={() => handleChangeLayout('grid')} class="p-2 rounded-l-full {currentLayout === 'grid' ? 'bg-blue-600' : 'bg-gray-700'} text-white">
      Grid
    </button>
    <button id="test-layout-focus-button" onclick={() => handleChangeLayout('focus')} class="p-2 {currentLayout === 'focus' ? 'bg-blue-600' : 'bg-gray-700'} text-white">
      Focus
    </button>
    <button id="test-layout-present-button" onclick={() => handleChangeLayout('presentation')} class="p-2 rounded-r-full {currentLayout === 'presentation' ? 'bg-blue-600' : 'bg-gray-700'} text-white">
      Present
    </button>
  </div>

  <button id="test-open-qr-button" onclick={handleOpenQr} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto">
    ▩ <!-- QR Code -->
  </button>
  <button id="test-toggle-audio-button" bind:this={audioButton} onclick={handleToggleAudio} oncontextmenu={e => handleContextMenu('audio', e)} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isAudioEnabled} style={isAudioEnabled?`background: linear-gradient(0deg, rgb(59 130 246) ${instant}%, white ${instant}%)`:""}>
    {isAudioEnabled ? '🎤' : '🔇'} <!-- Microphone -->
  </button>
  <button id="test-toggle-transcription-button"
          onclick={handleToggleTranscription}
          class="text-white p-3 rounded-full pointer-events-auto"
          class:bg-green-600={isTranscribing && !isWhisperModelLoading}
          class:hover:bg-green-700={isTranscribing && !isWhisperModelLoading}
          class:bg-gray-700={!isTranscribing && !isWhisperModelLoading}
          class:hover:bg-blue-700={!isTranscribing && !isWhisperModelLoading && !isWhisperModelLoaded}
          class:hover:bg-gray-600={!isTranscribing && !isWhisperModelLoading && isWhisperModelLoaded}
          class:bg-yellow-500={isWhisperModelLoading}
          class:cursor-not-allowed={isWhisperModelLoading}
          disabled={isWhisperModelLoading}>
    {isWhisperModelLoading ? '⏳' : (isTranscribing ? '🛑' : '✍️')}
  </button>
  <button id="test-toggle-video-button" bind:this={videoButton} onclick={handleToggleVideo} oncontextmenu={e => handleContextMenu('camera', e)} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isCameraEnabled}>
    {isCameraEnabled ? '🎥' : '📷'} <!-- Video Camera -->
  </button>
  <button id="test-toggle-screen-button" onclick={handleToggleScreen} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isScreenSharing}>
    🖥️ <!-- Monitor for Share Screen -->
  </button>
  <button 
    id="test-start-forward-button" 
    onclick={handleStartForward} 
    class="text-white p-3 rounded-full pointer-events-auto"
    class:bg-red-500={allowedHosts.length}
    class:hover:bg-red-600={allowedHosts.length}
    class:hover:bg-blue-700={!allowedHosts.length}
  >
    {allowedHosts.length ? '⏹️' : '⏩'}
  </button>
  <button id="test-share-video-button" onclick={handleShareVideo} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isVideoShared}>
    📹 <!-- Share Video -->
  </button>
  <button id="test-record-button" onclick={handleRecord} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-red-600={isRecording}>
    {isRecording ? '⏹' : '⏺'}
  </button>
  <button id="test-hangup-button" onclick={handleHangup} class="hover:bg-red-600 bg-red-500 text-white p-3 rounded-full pointer-events-auto">
    📞
  </button>
  <input bind:this={uploadVideo} type="file" onchange={handleVideoUpload} accept="video/*" class="hidden">
</div>

{#if showMenu}
<ContextMenu
  {menuItems}
  position={menuPosition}
  hide={() => showMenu = false}
/>
{/if}
<svelte:window on:resize={updateStreamPositions} />

<style>
  .stream-container {
    overflow: hidden;
    border-radius: 8px;
    transition: all 0.3s ease;
    padding: 4px;
  }
</style>
