export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  type: 'item' | 'toggle' | 'submenu';
  checked?: boolean;
  disabled?: boolean;
  action?: () => void;
  children?: MenuItem[];
}
