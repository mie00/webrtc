<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { normalizeStreamId } from '../lib/streamBridge';
  
  export let stream: MediaStream;
  export let type: 'audio' | 'video';
  export let muted: boolean = false;
  export let mirrored: boolean = false;
  export let controls: boolean = false;
  export let peerId: string | null = null;
  export let streamId: string = normalizeStreamId(stream.id);
  
  const dispatch = createEventDispatcher();
  let mediaElement: HTMLVideoElement | HTMLAudioElement;
  let audioContext: AudioContext | undefined;
  let analyser: AnalyserNode | undefined;
  let dataArray: Uint8Array | undefined;
  let audioVisualizationCanvas: HTMLCanvasElement | undefined;
  let canvasContext: CanvasContext2D | undefined;
  let animationFrame: number | undefined;
  
  // For audio visualization
  interface CanvasContext2D extends CanvasRenderingContext2D {}
  
  onMount(() => {
    if (mediaElement) {
      mediaElement.srcObject = stream;
      mediaElement.play().catch(err => console.error('Error playing stream:', err));
      
      // Set up audio visualization if this is an audio stream
      if (type === 'audio' && audioVisualizationCanvas) {
        setupAudioVisualization();
      }
    }
    
    return () => {
      if (mediaElement) {
        mediaElement.srcObject = null;
      }
      
      // Clean up audio visualization
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      
      if (audioContext) {
        audioContext.close();
      }
    };
  });
  
  function setupAudioVisualization() {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      const bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
      
      canvasContext = audioVisualizationCanvas!.getContext('2d') as CanvasContext2D;
      
      // Start visualization
      visualize();
    } catch (err) {
      console.error('Error setting up audio visualization:', err);
    }
  }
  
  function visualize() {
    if (!analyser || !canvasContext || !dataArray || !audioVisualizationCanvas) return;
    
    const width = audioVisualizationCanvas.width;
    const height = audioVisualizationCanvas.height;
    
    // Clear canvas
    canvasContext.clearRect(0, 0, width, height);
    
    // Get audio data
    analyser.getByteFrequencyData(dataArray);
    
    // Draw visualization
    const barWidth = (width / dataArray.length) * 2.5;
    let barHeight;
    let x = 0;
    
    canvasContext.fillStyle = '#3B82F6'; // Blue color
    
    for (let i = 0; i < dataArray.length; i++) {
      barHeight = dataArray[i] / 2;
      
      canvasContext.fillRect(x, height - barHeight, barWidth, barHeight);
      
      x += barWidth + 1;
    }
    
    // Continue animation
    animationFrame = requestAnimationFrame(visualize);
  }
  
  function handleClick() {
    dispatch('focus', { streamId: stream.id, peerId });
  }
</script>

<div class="stream-container" role="button" tabindex="0" on:click={handleClick} on:keypress|stopPropagation>
  {#if type === 'video'}
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
