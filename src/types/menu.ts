export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  type: 'submenu' | 'item' | 'toggle';
  checked?: boolean;
  disabled?: boolean;
  action?: () => void;
  children?: MenuItem[];
}
