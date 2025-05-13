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
  } = $props();

  let mediaElement: HTMLVideoElement | HTMLAudioElement | undefined = $state();
  import { processAudio, stopProcessingAudio, startVisualization, type AudioNodes } from '../lib/media/stream.js';
  
  let audioNodes: AudioNodes | undefined;
  let audioVisualizationCanvas: HTMLCanvasElement | undefined = $state();
  let canvasContext: CanvasRenderingContext2D | undefined;
  
  onMount(async () => {
    if (mediaElement) {
      mediaElement.srcObject = stream;
      mediaElement.play().catch(err => console.error('Error playing stream:', err));
      
      // Set up audio visualization if this is an audio stream
      if (type === 'audio' && audioVisualizationCanvas && stream) {
        try {
          // Get canvas context
          canvasContext = audioVisualizationCanvas.getContext('2d');
          
          if (canvasContext) {
            // Setup audio processing with the shared function
            audioNodes = await processAudio(stream, (instant) => {
              // This callback receives audio level updates
              // Could be used for level meters or other indicators
              // console.log('Audio level:', instant);
            });
            
            if (audioNodes && canvasContext) {
              // Start the visualization loop
              startVisualization(
                audioNodes,
                canvasContext,
                audioVisualizationCanvas.width,
                audioVisualizationCanvas.height
              );
            }
          }
        } catch (err) {
          console.error('Error setting up audio visualization:', err);
        }
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

<div class="stream-container" role="button" tabindex="0" onclick={handleClick} onkeypress={() => {}}>
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
    <!-- Audio visualization -->
    <div class="audio-visualization">
      <canvas bind:this={audioVisualizationCanvas} width="300" height="150"></canvas>
    </div>
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
