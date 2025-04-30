<script lang="ts">
  import { onMount } from 'svelte';
  
  // State
  let isVisible = false;
  let position = { x: 0, y: 0 };
  let menuItems = [];
  
  // Event handlers
  function showContextMenu(event, items) {
    event.preventDefault();
    
    position.x = event.clientX;
    position.y = event.clientY;
    menuItems = items;
    isVisible = true;
    
    // Add event listener to hide menu when clicking elsewhere
    document.addEventListener('click', hideContextMenu);
  }
  
  function hideContextMenu() {
    isVisible = false;
    document.removeEventListener('click', hideContextMenu);
  }
  
  onMount(() => {
    // Expose the showContextMenu function to the window
    window.showContextMenu = showContextMenu;
    
    return () => {
      // Cleanup
      document.removeEventListener('click', hideContextMenu);
      delete window.showContextMenu;
    };
  });
</script>

<div id="contextMenu" class={isVisible ? 'fixed' : 'hidden fixed'} style="left: {position.x}px; top: {position.y}px;">
  <ul id="ul-contextMenu" class="menu flex flex-col rounded-md shadow-xl overflow-hidden">
    {#each menuItems as item}
      <li>
        <button on:click={() => {
          item.action();
          hideContextMenu();
        }} class="px-4 py-2 hover:bg-gray-200">
          {item.label}
        </button>
      </li>
    {/each}
  </ul>
</div>
