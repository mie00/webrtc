<script lang="ts">
  import { connectionStore } from '../stores/connectionStore.js'; // getDirectClientState, getParticipantState are not directly used in template
  import { getKeysByCid } from '../stores/cidKeyStore.js';
  import { getPeerProfile } from '../stores/peerProfileStore.js';
</script>

<!-- Participants Panel -->
<div class="border-b border-gray-300 pb-4 mb-4">
  <h3 class="text-lg font-semibold mb-2">Connections</h3>
  {#if Object.keys($connectionStore.directClients || {}).length === 0 && Object.keys($connectionStore.participants || {}).length === 0}
    <p class="text-sm text-gray-500">No active connections.</p>
  {/if}

  <!-- Direct Connections -->
  {#each Object.values($connectionStore.directClients || {}) as client (client.cid)}
    {@const state = client.connectionState}
    {@const iceState = client.iceConnectionState}
    {@const isConnected = state === 'connected' && iceState === 'connected'}
    {@const isFailed = state === 'failed' || iceState === 'failed' || state === 'closed' || iceState === 'closed' || state === 'disconnected' || iceState === 'disconnected'}
    {@const isConnecting = !isConnected && !isFailed && (state !== null || iceState !== null)} <!-- Show yellow if not connected/failed but trying -->
    {@const clientKeys = getKeysByCid(client.cid)}
    {@const userProfile = clientKeys?.userPublicKey ? getPeerProfile(clientKeys.userPublicKey) : undefined}
    {@const displayName = userProfile?.userName || client.cid}
    <div class="flex items-center space-x-2 mb-1">
      <div
        id="test-indicator-{client.cid}"
        class="rounded-full h-3 w-3 flex-shrink-0 test-indicator"
        class:test-indicator-connected={isConnected}
        class:bg-green-500={isConnected}
        class:bg-red-500={isFailed}
        class:bg-yellow-400={isConnecting}
        class:bg-gray-400={!isConnected && !isFailed && !isConnecting}
        title={`Direct: ${client.cid}\nState: ${state ?? 'N/A'}\nICE: ${iceState ?? 'N/A'}`}
      ></div>
      <p class="text-sm font-medium text-gray-700" title={`CID: ${client.cid}`}>
        {displayName}
        {#if client.fingerprint}
          <span class="ml-1" title="Connection Fingerprint">{client.fingerprint}</span>
        {/if}
      </p>
    </div>
  {/each}

  <!-- Relayed Participants (Peers known via other direct connections) -->
  {#each Object.values($connectionStore.participants || {}) as participant (participant.cid)}
    <!-- Only show participants that are NOT direct clients -->
    {#if !($connectionStore.directClients || {})[participant.cid]}
      {@const relayClient = ($connectionStore.directClients || {})[participant.relayCid]}
      {@const relayState = relayClient?.connectionState}
      {@const relayIceState = relayClient?.iceConnectionState}
      {@const isRelayConnected = relayState === 'connected' && relayIceState === 'connected'}
      {@const isRelayFailed = !relayClient || relayState === 'failed' || relayIceState === 'failed' || relayState === 'closed' || relayIceState === 'closed' || relayState === 'disconnected' || relayIceState === 'disconnected'}
      {@const isRelayConnecting = relayClient && !isRelayConnected && !isRelayFailed && (relayState !== null || relayIceState !== null)}
      {@const participantKeys = getKeysByCid(participant.cid)}
      {@const relayedUserProfile = participantKeys?.userPublicKey ? getPeerProfile(participantKeys.userPublicKey) : undefined}
      {@const relayedDisplayName = relayedUserProfile?.userName || participant.cid}
      <div class="flex items-center space-x-2 mb-1 opacity-75">
        <div
          id="test-indicator-relayed-{participant.cid}"
          class="rounded-full h-3 w-3 flex-shrink-0 border border-gray-400"
          class:bg-green-300={isRelayConnected}
          class:bg-red-300={isRelayFailed}
          class:bg-yellow-200={isRelayConnecting}
          class:bg-gray-200={!relayClient || (!isRelayConnected && !isRelayFailed && !isRelayConnecting)}
          title={`Relayed: ${participant.cid}\nVia: ${participant.relayCid}\nRelay State: ${relayState ?? 'N/A'}\nRelay ICE: ${relayIceState ?? 'N/A'}`}
        ></div>
        <p class="text-sm font-medium text-gray-500 truncate" title={`CID: ${participant.cid} (via ${participant.relayCid})`}>
          {relayedDisplayName}... (Relayed)
        </p>
      </div>
    {/if}
  {/each}
</div>
