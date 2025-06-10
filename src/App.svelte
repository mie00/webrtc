<script lang="ts">
  /// <reference path="../types/global.d.ts" />
  import { WebRTCApp } from './lib/webrtc/WebRTCApp';
  import MainAppRouter from './components/MainAppRouter.svelte';
  import AuthHandler from './components/AuthHandler.svelte';
  import ProfileSetup from './components/ProfileSetup.svelte'; // Import the new component
  import { authStore, type AuthState } from './lib/stores/authStore';
  import { configStore } from './lib/stores/configStore'; // Import config store
  import { onDestroy } from 'svelte';

  const webRTCApp = new WebRTCApp();

  let currentAuthState: AuthState;
  const unsubscribeAuth = authStore.subscribe((value) => {
    currentAuthState = value;
  });

  // This simple path check works for initial load.
  // For more complex client-side routing, a proper routing library would be needed.
  let currentPath = window.location.pathname;

  onDestroy(() => {
    if (unsubscribeAuth) {
      unsubscribeAuth();
    }
  });
</script>

<AuthHandler />

{#if currentAuthState && currentAuthState.jwt && currentPath !== '/cb'}
  {#if $configStore.profile.userName && $configStore.profile.userName.trim() !== ''}
    <MainAppRouter {webRTCApp} />
  {:else}
    <ProfileSetup />
  {/if}
{/if}
