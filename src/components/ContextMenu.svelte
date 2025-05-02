<script lang="ts">
  import { onMount } from 'svelte';
  
  // Props
  export let position = { x: 0, y: 0 };
  export let menuItems: string[] = [];
  export let cb: (arg0: string) => void
  export let hide: () => void

  onMount(() => {
    // Expose the showContextMenu function to the window
    document.addEventListener('click', hide);
    return () => {
      // Cleanup
      document.removeEventListener('click', hide);
  };
  });
</script>

<div id="contextMenu" class='fixed bg-white' role="button" tabindex=0 style="left: {position.x}px; top: {position.y}px;" on:click|stopPropagation on:keypress|stopPropagation>
  <ul id="ul-contextMenu" class="menu flex flex-col rounded-md shadow-xl overflow-hidden">
    {#each menuItems as item}
      <li>
        <button on:click={() => {
          cb(item);
          hide();
        }} class="px-4 py-2 hover:bg-gray-200">
          {item}
        </button>
      </li>
    {/each}
  </ul>
</div>
