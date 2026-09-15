import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * SSR exists for Google indexing and for the WhatsApp / Facebook link
 * previews the owner and customers paste into chats (CLAUDE.md §5).
 *
 * `/vehicles/:id` is rendered per request, never prerendered — inventory
 * changes at runtime. Favorites lives in localStorage and the admin area
 * needs browser-only Firebase Auth, so both are client-rendered.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Server },
  { path: 'vehicles', renderMode: RenderMode.Server },
  { path: 'vehicles/:id', renderMode: RenderMode.Server },
  { path: 'favorites', renderMode: RenderMode.Client },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server },
];
