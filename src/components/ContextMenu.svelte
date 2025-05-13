<script lang="ts">
  import { onMount } from 'svelte';
  import { $props } from 'svelte/legacy'; // Or 'svelte' if using Svelte 5.0+ runes mode fully

  // Props
  let { position = { x: 0, y: 0 }, menuItems = [], cb, hide } = $props();

  onMount(() => {
    // Expose the showContextMenu function to the window
    document.addEventListener('click', hide);
    return () => {
      // Cleanup
      document.removeEventListener('click', hide);
  };
  });
</script>

<div id="contextMenu" class='fixed bg-white' role="button" tabindex=0 style="left: {position.x}px; top: {position.y}px;" onclick={(event) => event.stopPropagation()} onkeypress={(event) => event.stopPropagation()}>
  <ul id="ul-contextMenu" class="menu flex flex-col rounded-md shadow-xl overflow-hidden">
    {#each menuItems as item}
      <li>
        <button onclick={() => {
          cb(item);
          hide();
        }} class="px-4 py-2 hover:bg-gray-200">
          {item}
        </button>
      </li>
    {/each}
  </ul>
</div>
