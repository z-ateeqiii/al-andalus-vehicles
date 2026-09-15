# Al-Andalus Vehicle Showroom — Build Prompt

You are a senior Angular engineer. Build a complete, production-ready web application for
**معرض الأندلس (Al-Andalus)**, an Egyptian vehicle dealership specialising in نص نقل /
ربع نقل pickups (~90%) with a smaller ملاكي (passenger) section.

This is a real data-driven application, not a static mockup. Build it, don't describe it.

**The visual reference is `design/storyboard.png` in this repository. Open and study it
before writing any UI code.** It contains six panels: landing hero, inventory page, vehicle
details page, admin dashboard, mobile screens, and the design system swatches.

---

## 0. First actions

1. Read `design/storyboard.png`.
2. Inspect the repo. If it already contains an Angular app, reuse it and adapt. If it is
   empty, scaffold from scratch.
3. Write a `CLAUDE.md` at the repo root containing the invariants from sections 2, 3, 4
   and 13 of this document, so they survive across sessions.
4. Then start building. Do not stop to ask questions about Firebase credentials, the
   Cloudinary preset, or the WhatsApp number — create clearly-marked placeholders and
   keep going.

---

## 1. Business model (this shapes everything)

The owner is **not technical**. The website is a catalogue; the sale happens on WhatsApp.

- Visitor browses vehicles → opens a vehicle → sees photos, price, specs → taps a WhatsApp
  button → a chat opens with the vehicle's details pre-filled. That is the entire funnel.
- Owner logs into a dashboard → adds a vehicle with photos → changes its status when it
  sells → occasionally swaps the hero image. That is the entire admin job.

**Explicitly out of scope. Do not build any of these:** payments, cart, checkout, customer
accounts, customer registration, CRM, leads, messages, sales pipeline, financing calculator,
notifications, multi-branch, role management beyond one admin, revenue/sales charts.

The storyboard's dashboard shows a sales line chart, a sales donut, "العملاء", "المبيعات"
and "الرسائل" sidebar items. **Those are illustrative only — do not implement them.**
Section 9 below defines the real dashboard.

---

## 2. Stack (non-negotiable)

- **Angular 21**, standalone components, zoneless, signals for state.
- **SSR enabled** (`@angular/ssr`), deployed to **Vercel**. SSR is required — see section 11.
- **Tailwind CSS v4** — Angular 21's CLI wires this up via `ng new --style tailwind`.
  There is **no `tailwind.config.js`**. Design tokens go in `src/styles.css` inside
  `@theme { ... }` as CSS custom properties. Verify the exact flags with `ng new --help`
  before running it.
- **TypeScript strict mode** on.
- **Firebase Web SDK v12+ used directly.** Do **not** use AngularFire.
- **Cloud Firestore** for vehicles, settings, and the visitor counter.
- **Firebase Authentication** (email/password) for the admin only.
- **Cloudinary** unsigned upload for all images.
- Angular Router, Reactive Forms, RxJS only where it earns its place.
- **No other runtime dependencies.** No UI kit, no chart library, no toast library,
  no icon package — write the toasts yourself and inline SVG icons.

### File naming

Angular 20+ generates `vehicle-card.ts`. This project wants the classic suffix. Before
generating anything, configure the schematics:

```
ng config projects.<name>.schematics.@schematics/angular:component.type component
ng config projects.<name>.schematics.@schematics/angular:service.type service
ng config projects.<name>.schematics.@schematics/angular:guard.type guard
```

so files come out as `vehicle-card.component.ts`.

### Every component uses three separate files

```
vehicle-card/
├── vehicle-card.component.ts    ← logic only
├── vehicle-card.component.html  ← markup, Tailwind classes
└── vehicle-card.component.css   ← only styles Tailwind genuinely can't express
```

Never use inline `template:` or `styles:`. Do not set `standalone: true` — it is the
default in Angular 21 and setting it is deprecated.

---

## 3. Language and direction

- `<html lang="ar" dir="rtl">`.
- **All user-facing text is Egyptian Arabic (عامية مصرية)**, not فصحى. Buttons, labels,
  validation messages, toasts, empty states, errors, confirmations, WhatsApp text.
  - "العربيات المتاحة" / "ضيف عربية جديدة" / "عدّل بيانات العربية" / "امسح العربية"
  - "مفيش عربيات متاحة دلوقتي" / "تمت إضافة العربية" / "حصلت مشكلة، حاول تاني"
  - "تواصل معانا على واتساب" / "الحقل ده مطلوب" / "اكتب سعر صحيح"
- Code, file names, variables, interfaces, commit messages: English.
- **RTL rule: use logical properties only.** `ms-` / `me-` / `ps-` / `pe-` / `start-` /
  `end-` / `text-start` / `text-end`. Never `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`,
  `text-left`, `text-right`. This is the single most common way an RTL build breaks.
- The storyboard renders the public logo on the left and the admin sidebar on the left.
  That is an artefact of how the mockup was generated. **Place them at the RTL start
  (right side)** — logo at the start of the navbar, sidebar at the start of the admin
  layout — and mirror everything else accordingly.

---

## 4. Design system (from storyboard panel 06 — use these exact values)

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

- Fonts: **Tajawal** for Arabic, **Inter** for Latin/numerals. Self-host both as woff2 with
  an Arabic subset for Tajawal. Do not load from Google Fonts at runtime.
- Borders: 1px `--color-elevated`, often at ~40% opacity. Radius: 12px cards, 8px buttons
  and inputs, pill for filter chips.
- Primary button: gold fill, `--color-ink` text. Secondary: transparent with a gold border
  and gold text. Both from panel 06.
- Prices always in gold, Inter for the digits, format `EGP 545,000`.
- Restrained motion: 200ms ease transitions, subtle image zoom on card hover, border warms
  to gold. No parallax, no entrance animations, no bouncing.
- Visible gold focus rings on every interactive element.

---

## 5. Routes

Public (SSR, server-rendered on demand):

```
/                  home
/vehicles          inventory
/vehicles/:id      vehicle details
/favorites         saved vehicles (localStorage only — no account)
```

Admin (client-rendered only, never SSR):

```
/admin/login
/admin             → redirect to /admin/dashboard
/admin/dashboard
/admin/vehicles
/admin/vehicles/new
/admin/vehicles/edit/:id
/admin/settings
```

Two layouts: `public-layout` and `admin-layout`. Lazy-load the admin feature area.
No public sign-up page exists.

---

## 6. Public site

### 6.1 Navbar (storyboard panels 01, 02)

Desktop: logo (gold swoosh + "الأندلس" wordmark) at the start; links
`الرئيسية · المركبات · من نحن · تواصل معنا` in RTL order; search and account icons at the
end. Active link is gold with a short gold underline. The navbar is transparent over the
hero and gains a solid `--color-ink` background with a bottom border once scrolled.

- The search icon expands an inline input that routes to `/vehicles?q=...`.
- The account icon links quietly to `/admin/login`.
- "من نحن" and "تواصل معنا" scroll to sections on the home page.

Mobile (panel 05): hamburger at the start, logo centred, search at the end. Hamburger opens
a full-screen drawer sliding in from the start side. A fixed bottom tab bar on all public
pages: `الرئيسية · المركبات · المفضلة · تواصل معانا`, active tab in gold.

### 6.2 Home (panel 01)

Full-viewport hero: the image fills it with a dark gradient from the bottom and start edge
so the text stays readable. Content block aligned to the start:

- `الأندلس` — very large, Tajawal bold
- `لبيع وشراء السيارات` — second line, slightly smaller
- one-line description in muted cream
- two buttons: gold `تصفح العربيات ←` and outlined `تواصل معانا` (WhatsApp)

Along the bottom of the hero, three trust items with inline SVG icons:
`جميع السيارات مضمونة` (shield) · `أسعار مناسبة` (coins) · `إجراءات سهلة وسريعة` (clock).
A small scroll cue sits at the bottom centre.

**The hero image, headline and description all come from Firestore settings**, with a
sensible bundled fallback. Preload the hero image and give it `fetchpriority="high"`.

Below the hero: `أبرز العربيات` — up to 6 featured vehicles in the standard grid, then a
short `من نحن` band, then a `تواصل معانا` band with phone, WhatsApp, address and hours from
settings, then the footer.

### 6.3 Inventory (panel 02)

- Heading `جميع العربيات` with a one-line subtitle.
- Filter chips: `الكل` · `نص نقل` · `ملاكي`. Selected chip is gold-filled. The `ملاكي` chip
  only renders when `showPassengerVehicles` is true in settings.
- A compact filter panel (sidebar on desktop, a collapsible sheet on mobile) with three
  selects — نوع العربية / الماركة / السعر — and a gold `تطبيق الفلتر` button. Derive the
  brand and price-range options from the actual data, not a hardcoded list.
- When `الكل` is selected, render **two labelled sections** exactly as in the storyboard:
  `عربيات نص نقل` then `عربيات ملاكي`. When a single category is selected, one section.
- Grid: 5 columns on wide desktop, 4 at 1280, 3 at 1024, 2 at tablet, 1 on mobile.
- Filter state lives in the URL query string so results are shareable and SSR-friendly.
- Skeletons while loading, a friendly empty state per section
  (`لسه مفيش عربيات ملاكي متاحة دلوقتي`), and an error state with a `حاول تاني` button.

### 6.4 Vehicle card

Exactly as the storyboard: 4:3 cover image on top; below it a small coloured dot plus the
colour name (e.g. `● أحمر`), then the vehicle title, then the year in muted text, then the
price in gold. A status badge overlays the image corner only when the vehicle is `محجوزة`.
A heart icon toggles favourite. The whole card is a link; hover zooms the image slightly
inside its frame and warms the border to gold.

Never show `hidden` or `sold` vehicles publicly.

### 6.5 Vehicle details (panel 03)

Two columns on desktop, stacked on mobile.

**Start column:** large image with prev/next arrows, a thumbnail strip underneath, keyboard
arrow support, and swipe on touch.

**End column:** title (`شيفروليه ربع نقل 2022`), colour dot and name, then a **three-column
spec grid** of icon + label + value — الموديل, العداد, الفئة, الفتيس, الحمولة, السعر — with
the price cell emphasised in gold. Then a full-width gold `تواصل معانا على واتساب` button
and an outlined `احفظ في المفضلة` button.

Below: a `مواصفات العربية` strip of up to six icon tiles (محرك, القوة, ناقل الحركة, الفرامل,
الوسائد الهوائية, التكييف) and a `الصور` horizontal gallery of the remaining photos.

**Any field without a value is omitted entirely** — no empty labels, no dashes. The spec
grid and the tile strip must reflow cleanly with 2, 4 or 6 items.

On mobile the WhatsApp button is **sticky at the bottom of the viewport** above the tab bar.

### 6.6 WhatsApp flow

One `WhatsAppService`. The number comes from Firestore settings with an environment
fallback — never hardcoded in a component. Build:

```
السلام عليكم، أنا مهتم بالعربية دي:

الماركة: {brand}
الموديل: {model}
السنة: {year}
النوع: {نص نقل | ملاكي}
السعر: {price} جنيه

ممكن أعرف تفاصيل أكتر؟
```

Encode with `encodeURIComponent` and open `https://wa.me/<number>?text=<encoded>` in a new
tab. Omit any line whose value is missing.

---

## 7. Data model

```ts
export type VehicleCategory = 'pickup' | 'passenger';
export type VehicleStatus = 'available' | 'reserved' | 'sold' | 'hidden';

export interface Vehicle {
  id: string;
  category: VehicleCategory;
  brand: string;
  model: string;
  year: number;
  price: number | null;        // null when priceOnRequest
  priceOnRequest: boolean;     // shows "السعر عند الاتصال"
  currency: 'EGP';
  color?: string;              // Arabic name
  colorHex?: string;           // for the dot on the card
  mileage?: number;
  condition?: 'new' | 'used';
  engine?: string;
  power?: string;
  transmission?: string;
  fuelType?: string;
  payload?: string;            // pickups
  bedType?: string;            // pickups
  description?: string;
  features?: string[];
  coverImageUrl: string;
  imageUrls: string[];
  status: VehicleStatus;
  isFeatured?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ShowroomSettings {
  showroomName: string;
  whatsappNumber: string;       // international format, no +
  phoneNumber?: string;
  address?: string;
  workingHours?: string;
  heroImageUrl: string;
  heroHeading: string;
  heroSubheading: string;
  heroDescription: string;
  showPassengerVehicles: boolean;
  updatedAt: Timestamp;
}
```

Firestore layout:

```
vehicles/{vehicleId}
settings/showroom
analytics/daily_{YYYY-MM-DD}   →  { views: number }
analytics/total                →  { views: number }
```

---

## 8. Admin dashboard

### 8.1 Layout (panel 04)

Fixed sidebar at the RTL start on desktop, drawer on mobile. Logo at the top, then exactly
four items: `لوحة التحكم` · `العربيات` · `الإعدادات`, with `تسجيل الخروج` pinned at the
bottom. Active item gets a gold background tint, gold text and a gold edge bar.
Header shows the page title and `مرحبًا بيك في لوحة تحكم الأندلس`.

### 8.2 Dashboard home

Four stat cards, each with an icon, big number and label:

- `إجمالي العربيات`
- `العربيات المتاحة`
- `المباعة والمحجوزة`
- `زوار الموقع` — total page views

Then a **category split** rendered as a plain CSS horizontal bar with two labelled segments
(نص نقل / ملاكي) and their percentages — computed from the vehicle documents. No chart
library.

Then `أحدث العربيات المضافة` — the last five, each row showing thumbnail, name, price and
status, with `عرض الكل` linking to `/admin/vehicles`. And a large gold
`ضيف عربية جديدة` button.

Nothing else. No line chart, no donut, no revenue.

### 8.3 Vehicles management

Search box (brand / model / title), category filter, status filter, and
`ضيف عربية جديدة`. Desktop: a table with thumbnail, name, category, price, a **status
`<select>` that saves immediately from the row**, and edit / delete actions. Mobile: the
same as cards. Delete opens a confirmation dialog naming the vehicle. Every mutation fires
a toast.

### 8.4 Add / edit form

One reusable reactive form, three sections:

1. **البيانات الأساسية** — نوع العربية, الماركة, الموديل, سنة الصنع, السعر (with a
   `السعر عند الاتصال` checkbox that disables the price field), الحالة. All required.
2. **الصور** — drag-and-drop area, multi-select, thumbnail previews, per-file progress,
   remove before saving, and clicking any thumbnail promotes it to cover. A cover image is
   required.
3. **تفاصيل إضافية** — collapsed by default, everything optional: اللون (+ colour picker
   for the dot), الكيلومترات, الموتور, القوة, الفتيس, نوع الوقود, الوصف, المميزات
   (chip input). When `نص نقل` is selected, الحمولة and نوع الصندوق appear here;
   they are hidden for ملاكي.

Validation messages in Egyptian Arabic under each field, shown on blur or submit. Price must
be a positive number; year between 1990 and next year. Submit button shows a spinner and
blocks double submission. Edit mode preloads everything and keeps existing images unless
explicitly removed. Cancel returns to `/admin/vehicles`.

### 8.5 Settings (`/admin/settings`)

One screen: hero image upload with live preview, hero heading, subheading, description,
WhatsApp number, phone, address, working hours, and a `اعرض عربيات الملاكي` toggle.
Save shows a toast. The owner must be able to change the hero image without touching code.

---

## 9. Analytics — deliberately minimal

**One metric: visitor count.** Nothing else.

- On the first public page view of a browser session, increment `analytics/total.views` and
  `analytics/daily_{today}.views` with `increment(1)`.
- **Browser only** — guard with `isPlatformBrowser` / `afterNextRender`, otherwise SSR and
  link-preview crawlers will inflate it.
- De-duplicate per session using `sessionStorage`.
- The dashboard card is labelled `زوار الموقع` and its tooltip says `مشاهدات الصفحة`.
- Do not track per-vehicle views, do not track sales, do not fabricate anything.

---

## 10. Images — Cloudinary

- Unsigned upload preset, restricted server-side to one folder with a max file size.
- Client-side: reject files over ~8MB or non-image types before uploading.
- Store only the returned `secure_url` plus `public_id` in Firestore.
- **Every rendered image must go through Cloudinary transformations**: `f_auto,q_auto` plus
  a width, and a `srcset` across 400 / 800 / 1200 / 1600 widths with correct `sizes`.
  Cover images and thumbnails must not download full-resolution originals.
- `loading="lazy"` and explicit `width`/`height` everywhere except the hero.
- One reusable `ImageUploadComponent` and one `CloudinaryService`.

---

## 11. SSR, performance and SEO

SSR exists for two reasons: Google indexing, and link previews — the owner and customers
will paste vehicle links into WhatsApp and Facebook, and those previews need server-rendered
meta tags.

- Render modes: `/`, `/vehicles`, `/vehicles/:id` → **Server**. `/favorites` and
  `/admin/**` → **Client**. Do not prerender `/vehicles/:id`; inventory changes at runtime.
- **Transfer state is mandatory.** Angular's hydration transfer cache only covers
  `HttpClient`, not the Firebase SDK. Wrap every public read in the data services with
  Angular's `TransferState` so the server-fetched data hydrates the client instead of being
  re-fetched. A visible flicker or a duplicated read on first load is a bug.
- Never touch `window`, `document`, `localStorage` or `sessionStorage` without
  `isPlatformBrowser` or `afterNextRender`. Firebase Auth must initialise browser-side only.
- Per-vehicle `Title` and `Meta` in Arabic, Open Graph and Twitter card tags using the
  cover image, and `schema.org` `Car` + `Offer` JSON-LD with the EGP price.
- A `/sitemap.xml` generated from Firestore at request time, and a `robots.txt`.
- Targets: LCP under 2.5s on a throttled 4G connection, CLS under 0.1, no layout shift from
  images or fonts, no horizontal overflow at any width.

---

## 12. Auth and security rules

- Email/password only. The admin account is created by hand in the Firebase console.
- Route guard redirects unauthenticated users to `/admin/login`. Persist the session.
- Login errors in Egyptian Arabic — never leak whether the email exists.
- An `admins/{uid}` document marks the admin. Ship `firestore.rules`:
  - `vehicles`: public read; write only if `exists(/databases/$(database)/documents/admins/$(request.auth.uid))`.
  - `settings/showroom`: public read, admin write.
  - `analytics/*`: admin read; public create/update permitted **only** when the diff touches
    nothing but `views` and the new value is exactly the old value plus one.
  - `admins/*`: no client access.
- Never put the Firebase Admin SDK or a Cloudinary API secret in the frontend.
- The Firebase web config and the Cloudinary cloud name and unsigned preset are public by
  design; putting them in `src/environments/` and committing them is correct. Security comes
  from the rules and the preset restrictions, not from hiding these values. Ship an
  `environment.example.ts` with placeholders and document every value in the README.

---

## 13. Shared components and architecture

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
Business logic lives in services, not components.

**Toasts:** own implementation, signal-based, four kinds (success / error / warning / info),
bottom-start on desktop and top on mobile, `role="status"`, dismissible, auto-close ~4s,
styled to match the dark theme.

**Skeletons:** shaped to match real layouts — hero, vehicle card, vehicle grid, details page,
stat cards, admin table rows, settings form. A subtle shimmer on `--color-surface`.
Never a bare spinner for a whole page.

---

## 14. Responsive

Verify at 320 / 375 / 768 / 1024 / 1440. Touch targets ≥ 44px. No horizontal overflow
anywhere. The admin table becomes cards on mobile. Filters become a bottom sheet. The hero
text must not collide with the image subject at 320px.

---

## 15. Seed data

Write a `scripts/seed.ts` that inserts ~8 realistic sample vehicles (6 نص نقل, 2 ملاكي,
Egyptian brands and plausible EGP prices) plus a default `settings/showroom` document, using
placeholder image URLs. This must be a separate script, never a fallback inside the app —
the app reads from Firestore only.

---

## 16. Done when

- `ng build` passes with zero TypeScript errors and the SSR bundle builds.
- The public site renders server-side; view-source on `/vehicles/:id` contains the vehicle
  title, price and OG tags.
- An admin logs in, adds a vehicle with a cover image and extra photos to Cloudinary, and it
  appears publicly within one refresh.
- Editing price and status works; hiding or selling removes it from the public site.
- The `ملاكي` toggle in settings controls the public chip, the `الكل` results and the ملاكي
  section together.
- The WhatsApp button opens a chat pre-filled with that vehicle's details.
- The hero image changes from `/admin/settings` with no code change.
- Skeletons, empty states, error states and toasts all exist and are in Egyptian Arabic.
- RTL is correct at every breakpoint; no `ml-`/`mr-`/`left-`/`right-` in the codebase.
- The visitor counter increments once per session and shows in the dashboard.
- `firestore.rules` is written and documented.

## 17. Finish by writing a README covering

Routes · Firestore collections and models · required environment values · Cloudinary preset
setup · Firebase Auth and rules setup · run and build commands · Vercel deployment steps ·
and the exact list of real showroom values the owner still needs to supply.

Build it in working increments — foundation and design tokens, then Firebase services, then
the public site, then the dashboard — running the build after each. Fix every error before
moving on.
