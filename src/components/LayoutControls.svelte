<script lang="ts">
  import type { LayoutType } from '../stores/streamStore';

  let {
    currentLayout,
    onChangeLayout
  }: {
    currentLayout: LayoutType;
    onChangeLayout: (layout: LayoutType) => void;
  } = $props();
</script>

<div class="fixed top-0 left-0 right-0 bg-transparent p-4 flex justify-center pointer-events-none">
  <div class="layout-controls pointer-events-auto flex">
    <button
      id="test-layout-grid-button"
      onclick={() => onChangeLayout('grid')}
      class="p-2 rounded-l-full {currentLayout === 'grid'
        ? 'bg-blue-600'
        : 'bg-gray-700'} text-white"
    >
      Grid
    </button>
    <button
      id="test-layout-focus-button"
      onclick={() => onChangeLayout('focus')}
      class="p-2 {currentLayout === 'focus' ? 'bg-blue-600' : 'bg-gray-700'} text-white"
    >
      Focus
    </button>
    <button
      id="test-layout-present-button"
      onclick={() => onChangeLayout('presentation')}
      class="p-2 rounded-r-full {currentLayout === 'presentation'
        ? 'bg-blue-600'
        : 'bg-gray-700'} text-white"
    >
      Present
    </button>
  </div>
</div>
