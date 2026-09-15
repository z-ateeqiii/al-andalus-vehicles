/** The public navigation, in RTL reading order. Storyboard panels 01 and 05. */
export interface NavLink {
  readonly label: string;
  readonly path: string;
  /** Scrolls to a section of the home page instead of marking an active route. */
  readonly fragment?: string;
  readonly exact?: boolean;
}

export const PUBLIC_NAV_LINKS: readonly NavLink[] = [
  { label: 'الرئيسية', path: '/', exact: true },
  { label: 'المركبات', path: '/vehicles' },
  { label: 'من نحن', path: '/', fragment: 'about' },
  { label: 'تواصل معنا', path: '/', fragment: 'contact' },
];
