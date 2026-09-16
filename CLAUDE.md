# معرض الأندلس — Al-Andalus Vehicle Showroom

An Egyptian vehicle dealership catalogue. ~90% نص نقل / ربع نقل pickups, a smaller ملاكي
(passenger) section. The full build specification lives in
[al-andalus-claude-code-prompt.md](al-andalus-claude-code-prompt.md) — read it before any
substantial work. This file holds the invariants that must survive across sessions.

---

## 1. Scope boundaries

The owner is **not technical**. The site is a catalogue; the sale happens on WhatsApp.

- Visitor browses → opens a vehicle → sees photos, price, specs → taps WhatsApp → chat opens
  pre-filled with the vehicle's details. That is the entire funnel.
- Owner logs in → adds a vehicle with photos → changes its status when it sells →
  occasionally swaps the hero image. That is the entire admin job.

**Never build any of these, even if a mockup or a stray idea suggests them:** payments, cart,
checkout, customer accounts, customer registration, CRM, leads, messages, sales pipeline,
financing calculator, notifications, multi-branch, role management beyond one admin,
revenue/sales charts.

`design/storyboard.png` panel 04 shows a sales line chart, a sales donut, and `العملاء` /
`المبيعات` / `الرسائل` sidebar items. **Those are illustrative only.** The real dashboard is
four stat cards, a CSS category-split bar, the last five vehicles, and an add button.

The only analytics metric is a visitor count. No per-vehicle views, no sales tracking,
nothing fabricated.

---

## 2. Stack (non-negotiable)

- **Angular 21**, standalone components, **zoneless**, signals for state.
- **SSR** via `@angular/ssr`, deployed to **Vercel**. SSR exists for Google indexing and for
  WhatsApp/Facebook link previews — the owner pastes vehicle links into chats.
- **Tailwind CSS v4.** There is **no `tailwind.config.js`**. Design tokens live in
  `src/styles.css` inside `@theme { ... }` as CSS custom properties.
- **TypeScript strict mode** on.
- **Firebase Web SDK v12+ used directly. Never AngularFire.**
- **Cloud Firestore** for vehicles, settings, and the visitor counter.
- **Firebase Authentication** (email/password) for the admin only.
- **Cloudinary** unsigned upload for all images.
- Angular Router, Reactive Forms, RxJS only where it earns its place.
- **No other runtime dependencies.** No UI kit, no chart library, no toast library, no icon
  package — write the toasts, the bar chart and the SVG icons by hand.

### Angular 21 conventions

- Never set `standalone: true` — it is the default and setting it is deprecated.
- `changeDetection: ChangeDetectionStrategy.OnPush` on every component.
- `input()` / `output()` functions, never the decorators.
- `inject()`, never constructor injection.
- `host: { ... }` in the decorator, never `@HostBinding` / `@HostListener`.
- Native control flow `@if` / `@for` / `@switch`, never `*ngIf` / `*ngFor` / `*ngSwitch`.
- `class` and `style` bindings, never `ngClass` / `ngStyle`.
- `computed()` for derived state; `set` / `update` on signals, never `mutate`.
- Services are `providedIn: 'root'` and single-responsibility.
- Avoid `any`; use `unknown` when a type is genuinely uncertain.

### File naming

Angular 21 defaults to `vehicle-card.ts`. This project uses the classic suffix —
`vehicle-card.component.ts`. `angular.json` is already configured for it
(`file-name-style-guide: 2016`, `@schematics/angular:component.type = component`, and the
same for `service` / `guard` / `pipe` / `directive`). Do not regress this; verify with:

```
ng config projects.al-andalus.schematics.@schematics/angular:component.type
```

### Every component is three separate files

```
vehicle-card/
├── vehicle-card.component.ts    ← logic only
├── vehicle-card.component.html  ← markup, Tailwind classes
└── vehicle-card.component.css   ← only styles Tailwind genuinely can't express
```

**Never use inline `template:` or `styles:`.** This overrides the usual Angular advice to
inline small templates. Use `templateUrl` / `styleUrl` with paths relative to the `.ts` file.

---

## 3. Language and direction

- `<html lang="ar" dir="rtl">`.
- **All user-facing text is Egyptian Arabic (عامية مصرية), not فصحى.** Buttons, labels,
  validation messages, toasts, empty states, errors, confirmations, WhatsApp text.
  - `العربيات المتاحة` · `ضيف عربية جديدة` · `عدّل بيانات العربية` · `امسح العربية`
  - `مفيش عربيات متاحة دلوقتي` · `تمت إضافة العربية` · `حصلت مشكلة، حاول تاني`
  - `تواصل معانا على واتساب` · `الحقل ده مطلوب` · `اكتب سعر صحيح`
- Code, file names, variables, interfaces, commit messages: **English**.

### The RTL rule — logical properties only

Use `ms-` / `me-` / `ps-` / `pe-` / `start-` / `end-` / `text-start` / `text-end` /
`border-s` / `border-e` / `rounded-s-*` / `rounded-e-*`.

**Never** `ml-` `mr-` `pl-` `pr-` `left-` `right-` `text-left` `text-right` `border-l`
`border-r`. This is the single most common way an RTL build breaks. The same applies in
hand-written CSS: `margin-inline-start`, `inset-inline-end`, `padding-block`, never the
physical equivalents.

### Storyboard mirroring

The storyboard renders the public logo on the left and the admin sidebar on the left. That is
an artefact of how the mockup was generated. **Place both at the RTL start (right side)** —
logo at the start of the navbar, sidebar at the start of the admin layout — and mirror
everything else accordingly.

---

## 4. Design system (storyboard panel 06 — exact values)

```css
@theme {
  --color-ink:      #0F0D0A;  /* page background */
  --color-surface:  #1B1A18;  /* cards, panels */
  --color-elevated: #2E2A24;  /* hover, borders, inputs */
  --color-gold:     #D4AF7C;  /* accent, prices, primary buttons */
  --color-cream:    #E8E1D3;  /* primary text */
  --color-muted:    #9A9288;  /* secondary text — warm grey */
}
```

- Fonts: **Tajawal** for Arabic, **Inter** for Latin/numerals. Both **self-hosted as woff2**,
  Tajawal with an Arabic subset. **Never load from Google Fonts at runtime.**
- Borders: 1px `--color-elevated`, often at ~40% opacity.
- Radius: 12px cards, 8px buttons and inputs, pill for filter chips.
- Primary button: gold fill, `--color-ink` text. Secondary: transparent, gold border, gold
  text.
- Prices always gold, Inter for the digits, formatted `EGP 545,000`.
- Restrained motion: 200ms ease transitions, subtle image zoom on card hover, border warms to
  gold. **No parallax, no entrance animations, no bouncing.**
- Visible gold focus ring on every interactive element.
- Touch targets ≥ 44px. Verify at 320 / 375 / 768 / 1024 / 1440. No horizontal overflow at
  any width.

---

## 5. Architecture

```
src/app/
  core/       auth/ guards/ services/ models/ config/
  shared/     components/ (toast, skeleton, vehicle-card, image-upload, empty-state,
                           error-state, confirm-dialog, icon)
              pipes/ (egp-price, arabic-date)
  features/   public/ (home, vehicles, vehicle-details, favorites)
              admin/  (login, dashboard, vehicles, vehicle-form, settings)
  layouts/    public-layout/ admin-layout/
```

Services: `AuthService`, `VehicleService`, `SettingsService`, `CloudinaryService`,
`AnalyticsService`, `ToastService`, `FavoritesService`, `WhatsAppService`.

**Business logic lives in services, not components.**

- **Toasts:** own implementation, signal-based, four kinds (success / error / warning / info),
  bottom-start on desktop and top on mobile, `role="status"`, dismissible, auto-close ~4s.
- **Skeletons:** shaped to match real layouts — hero, vehicle card, vehicle grid, details
  page, stat cards, admin table rows, settings form. Subtle shimmer on `--color-surface`.
  **Never a bare spinner for a whole page.**
- **Icons:** inline SVG through the shared `icon` component. No icon package.

### Routes

Public, server-rendered on demand: `/` · `/vehicles` · `/vehicles/:id` · `/favorites`
(favorites is client-rendered, localStorage only, no account).

Admin, client-rendered and lazy-loaded, never SSR: `/admin/login` · `/admin` (redirects to
dashboard) · `/admin/dashboard` · `/admin/vehicles` · `/admin/vehicles/new` ·
`/admin/vehicles/edit/:id` · `/admin/settings`.

**No public sign-up page exists.** The admin account is created by hand in the Firebase
console.

### SSR safety

- Render modes: `/`, `/vehicles`, `/vehicles/:id` → **Server**. `/favorites`, `/admin/**` →
  **Client**. **Do not prerender `/vehicles/:id`** — inventory changes at runtime.
- **Transfer state is mandatory.** Angular's hydration transfer cache covers `HttpClient`
  only, not the Firebase SDK. Wrap every public read in `TransferState` so server-fetched data
  hydrates the client instead of being re-fetched. A visible flicker or a duplicated read on
  first load is a bug.
- Never touch `window`, `document`, `localStorage` or `sessionStorage` without
  `isPlatformBrowser` or `afterNextRender`. Firebase Auth initialises browser-side only.

### Images

Every rendered image goes through Cloudinary transformations — `f_auto,q_auto` plus a width,
with a `srcset` across 400 / 800 / 1200 / 1600 and correct `sizes`. `loading="lazy"` and
explicit `width`/`height` everywhere except the hero, which is preloaded with
`fetchpriority="high"`.

### Secrets

The Firebase web config and the Cloudinary cloud name + unsigned preset are **public by
design** — committing them in `src/environments/` is correct. Security comes from
`firestore.rules` and the upload preset restrictions. **Never put the Firebase Admin SDK or a
Cloudinary API secret in the frontend.**

---

## 6. Working agreement

- Build in working increments and run `ng build` after each. Fix every error before moving on.
- **Commit after every meaningful unit of work** — small, focused commits with clear English
  messages (`feat: vehicle card component`, `chore: configure tailwind theme tokens`). Never
  batch unrelated changes into one commit.
- Never commit `node_modules`, `.angular`, or `dist`.
- Do not stop to ask about Firebase credentials, the Cloudinary preset, or the WhatsApp
  number — create clearly-marked placeholders and keep going.

---

## 7. Known debt

Deliberate compromises, not oversights. Each is safe today and each has a
condition under which it stops being safe.

- **`transfer-codec.ts` rebuilds timestamps as a stand-in, not a real
  `Timestamp`.** Reconstructing the SDK class on the hydrating client would
  pull ~550kB of Firestore back into the first load and undo the transfer
  cache. The stand-in implements `seconds`, `nanoseconds`, `toDate`,
  `toMillis`, `isEqual`, `valueOf`, `toJSON` and `toString`, but
  **`instanceof Timestamp` is false for it and `toInstant()` is absent**.
  Safe while nothing reads `createdAt` / `updatedAt` on a transferred
  document — verify that before relying on either.

- **The visit counter is the only thing pulling Firestore onto the public
  site.** It waits for main-thread idle, so it costs no paint time, but it
  still downloads ~550kB for every first-time visitor just to add 1 to two
  counters. Replacing it with a plain `fetch` to the Firestore REST `commit`
  endpoint (a `FieldTransform` with `increment`) would take the SDK off the
  public site entirely and leave it only in the lazy admin chunk.
