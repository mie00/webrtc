<script lang="ts">
  import { onMount, onDestroy } from 'svelte'; // Added onDestroy
  import { authStore, type AuthState, getJwtPayload } from '../lib/stores/authStore'; // Added getJwtPayload
  import { getConfigValue } from '../lib/stores/configStore';
  import ConfigOverlay from './ConfigOverlay.svelte';

  let showConfigOverlay = $state(false);
  let currentAuthState: AuthState = $state(authStore.getAuthState());
  authStore.subscribe((value) => {
    currentAuthState = value;
  });

  let currentPath = window.location.pathname;
  let expiryTimerId: number | null = null; // Timer ID for JWT expiration

  const performLoginRedirect = (url: string) => {
    window.location.href = url;
  };

  async function handleLoginClick() {
    const devicePublicKeySpki = await authStore.getDevicePublicKeyAsSpki();
    if (devicePublicKeySpki) {
      // Append current query parameters to the callbackTarget
      const callbackTarget = `${window.location.origin}/cb${window.location.search}`;
      // The payload is now the base64 URL encoded SPKI string
      const identityProviderHost = getConfigValue('general', 'identityProviderHost');
      const loginUrl = `${identityProviderHost}/login?callback=${encodeURIComponent(callbackTarget)}&payload=${encodeURIComponent(devicePublicKeySpki)}`;
      performLoginRedirect(loginUrl);
    } else {
      console.error('Failed to get device public key as SPKI for login redirect.');
      // Potentially show an error to the user
    }
  }

  function clearExpiryTimer() {
    if (expiryTimerId !== null) {
      clearTimeout(expiryTimerId);
      expiryTimerId = null;
    }
  }

  function scheduleLogoutOnExpiry(jwt: string | null) {
    clearExpiryTimer(); // Clear any existing timer

    if (jwt) {
      const payload = getJwtPayload(jwt);
      if (payload && typeof payload.exp === 'number') {
        const expirationTimeMs = payload.exp * 1000;
        const currentTimeMs = Date.now();

        if (expirationTimeMs <= currentTimeMs) {
          console.log('JWT already expired upon check. Logging out.');
          authStore.logout();
        } else {
          const msUntilExpiry = expirationTimeMs - currentTimeMs;
          console.log(`JWT valid. Scheduling auto-logout in ${msUntilExpiry / 1000} seconds.`);
          expiryTimerId = window.setTimeout(() => {
            console.log('JWT expired as scheduled. Logging out automatically.');
            authStore.logout();
          }, msUntilExpiry);
        }
      } else {
        console.warn('Could not parse JWT or find a valid exp claim to schedule auto-logout.');
      }
    }
  }

  // Reactive statement to handle JWT changes and initial load.
  // This will run when currentAuthState.jwt changes.
  $: scheduleLogoutOnExpiry(currentAuthState.jwt);

  onMount(async () => {
    if (currentPath === '/cb') {
      const urlParams = new URLSearchParams(window.location.search);
      const jwt = urlParams.get('jwt');
      const pubkeyJwkString = urlParams.get('pubKey'); // Corrected: 'pubkey' (lowercase k)
      console.log('AuthHandler /cb params:', JSON.stringify(Array.from(urlParams.entries())));

      if (jwt && pubkeyJwkString) {
        const success = await authStore.setJwtAndVerifyKey(jwt, pubkeyJwkString);
        if (success) {
          console.log('AuthHandler: JWT and public key stored successfully.');
        } else {
          console.error('AuthHandler: Failed to store JWT or verify public key.');
        }
      } else {
        console.error('AuthHandler: Missing jwt or pubkey in callback URL for /cb');
      }

      // Preserve other query parameters after removing auth-specific ones
      const basePath = window.location.pathname.split('/cb')[0] || '/';
      urlParams.delete('jwt');
      urlParams.delete('pubKey');
      // The 'payload' param was sent to the login server, not expected back in the /cb URL directly.
      // If it were, it would be urlParams.delete('payload');
      const remainingParams = urlParams.toString();
      window.location.href =
        window.location.origin + basePath + (remainingParams ? `?${remainingParams}` : '');
      // No return needed here as the page will redirect.
    }
    // Initial JWT check is handled by the reactive statement $: scheduleLogoutOnExpiry(...)
  });

  onDestroy(() => {
    clearExpiryTimer(); // Clean up timer when component is destroyed
  });
</script>

{#if currentPath === '/cb'}
  <div>Processing callback...</div>
{:else if !currentAuthState || !currentAuthState.jwt}
  <div
    class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center z-50"
  >
    <div class="p-5 border w-96 shadow-lg rounded-md bg-white">
      <div class="text-center">
        <h3 class="text-lg leading-6 font-medium text-gray-900">Authentication Required</h3>
        <div class="mt-2 px-7 py-3">
          <p class="text-sm text-gray-500">
            Please log in to use the full features of the application.
          </p>
        </div>
        <div class="items-center px-4 py-3">
          <button
            id="login-button"
            class="px-4 py-2 bg-blue-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
            onclick={handleLoginClick}
          >
            Login
          </button>
        </div>
        <div class="items-center px-4 py-3">
          <button
            class="px-4 py-2 bg-gray-200 text-gray-700 text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300"
            onclick={() => authStore.logout()}
          >
            (Dev) Logout / Clear Auth
          </button>
        </div>
        <div class="items-center px-4 py-3">
          <button
            class="px-4 py-2 bg-yellow-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-300"
            onclick={() => (showConfigOverlay = true)}
          >
            Open Configuration
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showConfigOverlay}
  <ConfigOverlay show={showConfigOverlay} onclose={() => (showConfigOverlay = false)} />
{/if}
