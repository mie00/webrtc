<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  
  let {
    stream,
    useSlot = false,
    type = "video",
    muted = false,
    mirrored = false,
    controls = false,
    peerId = null,
    children,
    focus,
    audioStream,
    hasAudio = false,
  }: {
    stream: MediaStream | null;
    useSlot?: boolean;
    type?: "audio" | "video";
    muted?: boolean;
    mirrored?: boolean;
    controls?: boolean;
    peerId?: string | null;
    children?: any;
    focus: ({}:{streamId: string|undefined; peerId : string | null}) => void;
    audioStream?: MediaStream;
    hasAudio?: boolean;
  } = $props();

  let mediaElement: HTMLVideoElement | HTMLAudioElement | undefined = $state();
  import { processAudio, stopProcessingAudio, drawVisualization, type AudioNodes } from '../lib/media/stream.js';
  
  let audioNodes: AudioNodes | null;
  let audioVisualizationCanvas: HTMLCanvasElement | undefined = $state();
  let canvasContext: CanvasRenderingContext2D | undefined;
  const FFT_SIZE = 256; // Can be adjusted: 32, 64, 128, 256, 512, 1024, 2048
  
  // Audio level state
  let audioLevel = $state(0);
  let borderColor = $state('red');
  // use #5be7a9 as base
  let borderStyle = $derived(`4px solid ${hasAudio || (stream && stream.getAudioTracks().length > 0) ? 
    `rgba(0, 255, 0, ${Math.max(0.1, audioLevel)})` : 'rgba(255, 0, 0, 0.5)'}`);
  
  // Function to set up audio processing
  function setupAudioProcessing() {
    // Clean up any existing audio processing
    if (audioNodes) {
      stopProcessingAudio(audioNodes);
      audioNodes = null;
    }
    
    // Set up audio visualization for audio streams or video streams with audio
    const streamToProcess = audioStream || stream;
    const hasAudioTracks = streamToProcess && streamToProcess.getAudioTracks().length > 0;
    
    if (streamToProcess && hasAudioTracks && ((type === 'audio' && audioVisualizationCanvas) || type === 'video')) {
      try {
        // For audio-only streams, set up canvas visualization
        if (type === 'audio' && audioVisualizationCanvas) {
          canvasContext = audioVisualizationCanvas.getContext('2d')!;
        }
        
        // Process audio for both audio-only and video streams
        audioNodes = processAudio(
          streamToProcess, 
          (dataArray, analyser) => {
            // For audio-only streams, draw visualization
            if (type === 'audio' && canvasContext && audioVisualizationCanvas) {
              drawVisualization(
                dataArray,
                canvasContext,
                audioVisualizationCanvas.width,
                audioVisualizationCanvas.height
              );
            }
            
            // For all streams, calculate audio level for border
            if (dataArray) {
              // Calculate average volume level from frequency data
              const sum = dataArray.reduce((acc, val) => acc + (val || 0), 0);
              const avg = sum / dataArray.length;
              // Normalize to 0-1 range with some amplification
              audioLevel = Math.pow(Math.min(1, avg / 128), 0.5);
            }
          },
          FFT_SIZE
        );
      } catch (err) {
        console.error('Error setting up audio visualization:', err);
      }
    }
  }
  
  // Watch for changes to stream or audioStream
  $effect(() => {
    if (stream || audioStream) {
      setupAudioProcessing();
    }
  });
  
  onMount(() => {
    if (mediaElement) {
      mediaElement.srcObject = stream;
      mediaElement.play().catch(err => console.error('Error playing stream:', err));
      
      // Initial setup of audio processing
      setupAudioProcessing();
      }
    }
    
    return () => {
      if (mediaElement) {
        mediaElement.srcObject = null;
      }
      
      // Clean up audio visualization using the shared function
      if (audioNodes) {
        stopProcessingAudio(audioNodes);
      }
    };
  });
  
  function handleClick() {
    focus({ streamId: stream?.id, peerId });
  }
</script>

<div class="stream-container" role="button" tabindex="0" onclick={handleClick} onkeypress={() => {}} style={type === 'video' ? `border: ${borderStyle}` : ''}>
  {#if useSlot}
  {@render children?.()}
  {:else if type === 'video'}
    <video 
      bind:this={mediaElement} 
      class="stream-element" 
      autoplay 
      playsinline 
      disablePictureInPicture
      {muted}
      {controls}
      style={mirrored ? 'transform: scaleX(-1);' : ''}
    ></video>
  {:else}
    <audio 
      bind:this={mediaElement} 
      class="stream-element" 
      autoplay 
      {muted}
      {controls}
    ></audio>
    <!-- Audio visualization - only show for audio-only streams -->
    {#if type === 'audio' && stream && stream.getAudioTracks().length > 0}
      <div class="audio-visualization">
        <canvas bind:this={audioVisualizationCanvas} width="300" height="150"></canvas>
      </div>
    {/if}
  {/if}
  
  <!-- Optional overlay with peer info -->
  {#if peerId}
    <div class="peer-info">
      {peerId}
    </div>
  {/if}
</div>

<style>
  .stream-container {
    position: relative;
    overflow: hidden;
    border-radius: 8px;
    background-color: #000;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
    width: 100%;
    height: 100%;
  }
  
  .stream-container:hover {
    transform: scale(1.02);
    box-shadow: 0 8px 15px rgba(0, 0, 0, 0.2);
  }
  
  .stream-element {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  .peer-info {
    position: absolute;
    bottom: 10px;
    left: 10px;
    background-color: rgba(0, 0, 0, 0.5);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
  }
  
  .audio-visualization {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #2a2a2a;
  }
  
  canvas {
    width: 100%;
    height: 100%;
  }
</style>
