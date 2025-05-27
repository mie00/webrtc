import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ContextMenu from './ContextMenu.svelte';
import type { MenuItem } from '../types/menu';
import { tick } from 'svelte';
import { vi } from 'vitest';

const mockHide = vi.fn();

const basicItems: MenuItem[] = [
  { id: 'item1', label: 'Item 1', type: 'item', action: vi.fn() },
  { id: 'item2', label: 'Item 2', type: 'item', action: vi.fn(), disabled: true }
];

const toggleItem: MenuItem = {
  id: 'toggle1',
  label: 'Toggle Me',
  type: 'toggle',
  checked: false,
  action: vi.fn()
};

const submenuItems: MenuItem[] = [
  {
    id: 'sub1',
    label: 'Submenu 1',
    type: 'submenu',
    children: [
      { id: 'subitem1', label: 'Sub Item 1', type: 'item', action: vi.fn() },
      { id: 'subitem2', label: 'Sub Item 2', type: 'toggle', checked: true, action: vi.fn() }
    ]
  },
  { id: 'item3', label: 'Item 3', type: 'item', action: vi.fn() }
];

describe('ContextMenu.svelte', () => {
  beforeEach(() => {
    mockHide.mockClear();
    basicItems.forEach((item) => (item.action as vi.Mock).mockClear());
    (toggleItem.action as vi.Mock).mockClear();
    submenuItems.forEach((item) => {
      if (item.action) (item.action as vi.Mock).mockClear();
      if (item.type === 'submenu' && item.children) {
        item.children.forEach((child) => (child.action as vi.Mock).mockClear());
      }
    });
    // Reset toggle item checked state
    toggleItem.checked = false;
    if (submenuItems[0].type === 'submenu' && submenuItems[0].children) {
      const subToggle = submenuItems[0].children[1] as MenuItem & { checked: boolean };
      subToggle.checked = true; // Reset to initial test state
    }
  });

  test('renders basic menu items', () => {
    render(ContextMenu, {
      props: { menuItems: basicItems, hide: mockHide, position: { x: 0, y: 0 } }
    });
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Item 2').closest('button')).toBeDisabled();
  });

  test('calls action and hides on item click', async () => {
    render(ContextMenu, {
      props: { menuItems: basicItems, hide: mockHide, position: { x: 0, y: 0 } }
    });
    const item1Button = screen.getByText('Item 1');
    await fireEvent.click(item1Button);
    expect(basicItems[0].action).toHaveBeenCalled();
    expect(mockHide).toHaveBeenCalled();
  });

  test('does not call action for disabled item', async () => {
    render(ContextMenu, {
      props: { menuItems: basicItems, hide: mockHide, position: { x: 0, y: 0 } }
    });
    const item2Button = screen.getByText('Item 2');
    await fireEvent.click(item2Button);
    expect(basicItems[1].action).not.toHaveBeenCalled();
    expect(mockHide).not.toHaveBeenCalled(); // Should not hide if action not performed due to disable
  });

  test.skip('renders and handles toggle item', async () => {
    render(ContextMenu, {
      props: { menuItems: [toggleItem], hide: mockHide, position: { x: 0, y: 0 } }
    });
    let toggleButton = screen.getByText('Toggle Me');
    expect(toggleButton).toBeInTheDocument();
    expect(toggleButton.querySelector('span.bg-blue-600')).toBeNull(); // Initially unchecked

    await fireEvent.click(toggleButton);
    expect(toggleItem.action).toHaveBeenCalled();
    expect(mockHide).not.toHaveBeenCalled();
    await tick();
    toggleButton = screen.getByText('Toggle Me');
    await waitFor(() => {
      expect(toggleButton.querySelector('span.bg-blue-600')).toBeInTheDocument(); // Should be checked
    });

    // Click again to toggle off
    await fireEvent.click(toggleButton);
    expect(toggleItem.action).toHaveBeenCalledTimes(2);
    await tick();
    toggleButton = screen.getByText('Toggle Me');
    await waitFor(() => {
      expect(toggleButton.querySelector('span.bg-blue-600')).toBeNull(); // Should be unchecked again
    });
  });

  test('renders submenu and toggles its visibility', async () => {
    render(ContextMenu, {
      props: { menuItems: submenuItems, hide: mockHide, position: { x: 0, y: 0 } }
    });
    const submenuButton = screen.getByText('Submenu 1');
    expect(submenuButton).toBeInTheDocument();
    expect(screen.queryByText('Sub Item 1')).not.toBeInTheDocument(); // Submenu initially closed

    await fireEvent.click(submenuButton);
    await tick();
    expect(screen.getByText('Sub Item 1')).toBeInTheDocument();
    expect(screen.getByText('Sub Item 2')).toBeInTheDocument();
    expect(mockHide).not.toHaveBeenCalled(); // Clicking submenu header shouldn't hide main menu

    await fireEvent.click(submenuButton); // Click again to close
    await tick();
    expect(screen.queryByText('Sub Item 1')).not.toBeInTheDocument();
  });

  test('calls action for submenu item and hides main menu', async () => {
    render(ContextMenu, {
      props: { menuItems: submenuItems, hide: mockHide, position: { x: 0, y: 0 } }
    });
    const submenuButton = screen.getByText('Submenu 1');
    await fireEvent.click(submenuButton); // Open submenu
    await tick();

    const subItem1Button = screen.getByText('Sub Item 1');
    await fireEvent.click(subItem1Button);
    const subItem1Action = (submenuItems[0] as any).children[0].action;
    expect(subItem1Action).toHaveBeenCalled();
    expect(mockHide).toHaveBeenCalled();
  });

  test.skip('handles toggle item within a submenu', async () => {
    render(ContextMenu, {
      props: { menuItems: submenuItems, hide: mockHide, position: { x: 0, y: 0 } }
    });
    const submenuButton = screen.getByText('Submenu 1');
    await fireEvent.click(submenuButton); // Open submenu
    await tick();

    let subToggleItemButton = screen.getByText('Sub Item 2');
    const subToggleItem = (submenuItems[0] as any).children[1]; // This is the prop data

    // Check initial visual state based on prop
    await waitFor(() => {
      if (subToggleItem.checked) {
        expect(subToggleItemButton.querySelector('span.bg-blue-600')).toBeInTheDocument();
      } else {
        expect(subToggleItemButton.querySelector('span.bg-blue-600')).toBeNull();
      }
    });

    await fireEvent.click(subToggleItemButton);
    expect(subToggleItem.action).toHaveBeenCalled();
    expect(mockHide).not.toHaveBeenCalled();
    await tick();
    subToggleItemButton = screen.getByText('Sub Item 2'); // Re-query

    // Check visual state after click (should be opposite of initial prop state)
    await waitFor(() => {
      if (subToggleItem.checked) {
        // Original prop was true, so visually it should now be false (unchecked)
        expect(subToggleItemButton.querySelector('span.bg-blue-600')).toBeNull();
      } else {
        // Original prop was false, so visually it should now be true (checked)
        expect(subToggleItemButton.querySelector('span.bg-blue-600')).toBeInTheDocument();
      }
    });
  });

  test('normalizes string array menuItems', () => {
    const stringItems = ['Option A', 'Option B'];
    render(ContextMenu, {
      props: { menuItems: stringItems, hide: mockHide, position: { x: 0, y: 0 } }
    });
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  test('closes on Escape key press', async () => {
    render(ContextMenu, {
      props: { menuItems: basicItems, hide: mockHide, position: { x: 0, y: 0 } }
    });
    const menuElement = screen.getByRole('menu');
    await fireEvent.keyDown(menuElement, { key: 'Escape' });
    expect(mockHide).toHaveBeenCalled();
  });

  test('closes on window click (simulated via svelte:window)', async () => {
    // This test is a bit indirect as we can't easily trigger svelte:window events
    // We rely on the component's internal logic that handleWindowClick calls hide()
    // We can spy on `hide` and ensure it's callable.
    // A more direct test would require a full browser environment or more complex Svelte testing utils.
    const { component } = render(ContextMenu, {
      props: { menuItems: basicItems, hide: mockHide, position: { x: 0, y: 0 } }
    });
    // Simulate the effect of a window click by directly calling the handler if possible,
    // or by ensuring `hide` is passed correctly.
    // For this component, handleWindowClick is attached to svelte:window
    // We can't directly trigger it easily, but we know it calls hide().
    // We'll assume if `hide` is correctly passed and callable, this part works.
    // To actually test it, one might need to dispatch a click event on `document.body`
    // and ensure the component reacts if it were mounted in a full DOM.

    // Let's try dispatching a click on the document to see if Vitest/JSDOM handles it
    await fireEvent.click(document.body);
    expect(mockHide).toHaveBeenCalled();
  });

  // Test for onMount screen adjustment (requires DOM element and window properties)
  test('adjusts position if menu goes off-screen (onMount)', async () => {
    // Mock window dimensions
    // @ts-ignore
    global.innerWidth = 500;
    // @ts-ignore
    global.innerHeight = 500;

    // Mock getBoundingClientRect
    const mockMenuElement = {
      getBoundingClientRect: () => ({ right: 600, bottom: 600, width: 200, height: 150 }),
      style: { left: '', top: '' }
    };
    vi.spyOn(document, 'getElementById').mockReturnValue(mockMenuElement as any);

    render(ContextMenu, {
      props: { menuItems: basicItems, hide: mockHide, position: { x: 400, y: 400 } }
    });
    await tick(); // onMount runs after the first tick

    expect(document.getElementById).toHaveBeenCalledWith('contextMenu');
    // windowWidth (500) - rect.width (200) - 10 = 290
    expect(mockMenuElement.style.left).toBe('290px');
    // windowHeight (500) - rect.height (150) - 10 = 340
    expect(mockMenuElement.style.top).toBe('340px');

    vi.restoreAllMocks(); // Clean up spy
  });

  test('stops propagation for click and keypress on the menu itself', async () => {
    const outerClickHandler = vi.fn();
    const outerKeyPressHandler = vi.fn();

    const { container } = render(ContextMenu, {
      props: { menuItems: basicItems, hide: mockHide, position: { x: 0, y: 0 } }
    });
    const menuElement = screen.getByRole('menu');

    // Attach listeners to a parent element to check propagation
    const parentDiv = document.createElement('div');
    parentDiv.appendChild(container); // container usually contains the rendered component
    document.body.appendChild(parentDiv);
    parentDiv.addEventListener('click', outerClickHandler);
    parentDiv.addEventListener('keypress', outerKeyPressHandler);

    await fireEvent.click(menuElement);
    expect(outerClickHandler).not.toHaveBeenCalled();

    await fireEvent.keyPress(menuElement, { key: 'Enter', charCode: 13 });
    expect(outerKeyPressHandler).not.toHaveBeenCalled();

    document.body.removeChild(parentDiv);
  });
});
