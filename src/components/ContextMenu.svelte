<script lang="ts">
  import { onMount } from 'svelte';
  import type { MenuItem } from '../types/menu.js';

  // Props
  let {
    position = { x: 0, y: 0 },
    menuItems = [],
    hide
  } = $props<{
    position: { x: number; y: number };
    menuItems: MenuItem[] | string[];
    hide: () => void;
  }>();

  // State for tracking open submenus
  let openSubmenus = $state<Record<string, boolean>>({});

  // Convert string array to MenuItem array for backward compatibility
  const normalizedMenuItems = $derived(
    Array.isArray(menuItems) && menuItems.length > 0 && typeof menuItems[0] === 'string'
      ? (menuItems as string[]).map((item) => ({
          id: item,
          label: item,
          type: 'item' as const,
          disabled: false
        }))
      : (menuItems as MenuItem[])
  );

  function handleItemClick(item: MenuItem) {
    if (item.type === 'submenu') {
      // Toggle submenu
      openSubmenus[item.id] = !openSubmenus[item.id];
      return;
    }

    if (item.type === 'toggle') {
      // For toggle items, we want to update the checked state
      item.checked = !item.checked;
      openSubmenus = { ...openSubmenus }; // HACK: Force reactivity for $derived
    }

    // Execute the item's action if provided
    if (item.action) {
      item.action();
    }

    // Only hide for regular items and toggles (not for submenus)
    if (item.type !== 'toggle') {
      hide();
    }
  }

  // Close submenus when clicking outside
  function handleWindowClick() {
    openSubmenus = {};
    hide();
  }

  // Handle keyboard navigation
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      hide();
    }
  }

  // Adjust position if menu would go off-screen
  onMount(() => {
    const menu = document.getElementById('contextMenu');
    if (menu) {
      const rect = menu.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      if (rect.right > windowWidth) {
        menu.style.left = `${windowWidth - rect.width - 10}px`;
      }

      if (rect.bottom > windowHeight) {
        menu.style.top = `${windowHeight - rect.height - 10}px`;
      }
    }
  });
</script>

<div
  id="contextMenu"
  class="fixed bg-white rounded-md shadow-xl z-50"
  role="menu"
  tabindex="0"
  style="left: {position.x}px; top: {position.y}px;"
  onclick={(event) => event.stopPropagation()}
  onkeypress={(event) => event.stopPropagation()}
  onkeydown={handleKeyDown}
>
  <ul id="ul-contextMenu" class="menu flex flex-col overflow-visible">
    {#each normalizedMenuItems as item}
      <li class="relative">
        <button
          onclick={() => handleItemClick(item)}
          class="w-full text-left px-4 py-2 hover:bg-gray-200 transition-colors flex items-center justify-between gap-2 {item.disabled
            ? 'opacity-50 cursor-not-allowed'
            : ''}"
          disabled={item.disabled}
        >
          <span class="flex items-center gap-2">
            <span>{item.label}</span>
          </span>

          {#if item.type === 'toggle'}
            <span
              class="w-4 h-4 border border-gray-400 rounded flex items-center justify-center bg-white"
            >
              {#if item.checked}
                <span class="w-2 h-2 bg-blue-600 rounded-sm"></span>
              {/if}
            </span>
          {:else if item.type === 'submenu'}
            <span class="text-gray-500">▶</span>
          {/if}
        </button>

        {#if item.type === 'submenu' && item.children && openSubmenus[item.id]}
          <div
            class="absolute left-full top-0 bg-white rounded-md shadow-xl -mt-1 ml-1"
            role="button"
            tabindex="0"
            onclick={(event) => event.stopPropagation()}
            onkeydown={(event) => event.stopPropagation()}
          >
            <ul class="menu flex flex-col overflow-visible">
              {#each item.children as subItem}
                <li>
                  <button
                    onclick={() => handleItemClick(subItem)}
                    class="w-full text-left px-4 py-2 hover:bg-gray-200 transition-colors flex items-center justify-between gap-2 {subItem.disabled
                      ? 'opacity-50 cursor-not-allowed'
                      : ''}"
                    disabled={subItem.disabled}
                  >
                    <span class="flex items-center gap-2">
                      {#if subItem.icon}<span class="menu-icon">{subItem.icon}</span>{/if}
                      <span>{subItem.label}</span>
                    </span>

                    {#if subItem.type === 'toggle'}
                      <span
                        class="w-4 h-4 border border-gray-400 rounded flex items-center justify-center bg-white"
                      >
                        {#if subItem.checked}
                          <span class="w-2 h-2 bg-blue-600 rounded-sm"></span>
                        {/if}
                      </span>
                    {/if}
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</div>
<svelte:window on:click={handleWindowClick} />

<style>
  .menu {
    min-width: 180px;
    border-radius: 0.375rem;
  }

  .menu-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
  }
</style>
