<script lang="ts">
  /// <reference path="../../../types/global.d.ts" />
  import { WebRTCApp } from './lib/webrtc/WebRTCApp.js';
  import MainAppRouter from './components/MainAppRouter.svelte';

  // Instantiate WebRTCApp here, so it's a single instance for the application.
  // It's passed as a prop to MainAppRouter.
  const webRTCApp = new WebRTCApp();
  
</script>

<!-- 
  The MainAppRouter component now handles all the UI rendering,
  state management, and logic initialization that was previously in App.svelte.
-->
<MainAppRouter {webRTCApp} />
