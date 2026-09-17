# معرض الأندلس — Al-Andalus Vehicle Showroom

An Egyptian vehicle dealership catalogue. Visitors browse ربع نقل, ميكروباص and
ملاكي vehicles and contact the showroom on WhatsApp; the owner manages the
inventory from a dashboard. There is no cart, no checkout and no customer
accounts — the sale happens in the chat.

- **Live site:** https://al-andalus-vehicles.vercel.app
- **Admin:** https://al-andalus-vehicles.vercel.app/admin
- **Conventions and invariants:** [CLAUDE.md](CLAUDE.md) — read before changing code
- **Original build specification:** [al-andalus-claude-code-prompt.md](al-andalus-claude-code-prompt.md)

---

## Stack

| Layer     | Choice                                                                                        |
| --------- | --------------------------------------------------------------------------------------------- |
| Framework | Angular 21, standalone, zoneless, signals                                                     |
| Rendering | SSR via `@angular/ssr` with an Express entry ([src/server.ts](src/server.ts))                 |
| Styling   | Tailwind CSS v4 — no config file, tokens live in `@theme` in [src/styles.css](src/styles.css) |
| Data      | Cloud Firestore, Firebase Web SDK v12 used directly (never AngularFire)                       |
| Auth      | Firebase Authentication, email/password, one admin account                                    |
| Images    | Cloudinary, unsigned browser upload + URL transformations                                     |
| Hosting   | Vercel (static CDN + one SSR function)                                                        |

There is **no backend of our own**. The browser talks to Firestore directly and
[firestore.rules](firestore.rules) is the only thing enforcing who may read and
write. The SSR function renders pages; it holds no secret and enforces no policy.

SSR exists for two reasons: Google indexing, and the WhatsApp/Facebook link
previews the owner pastes into chats. Both need real HTML in the server
response.

---

## Getting started

Requires **Node 20.19+** (Node 22 recommended — that is what Vercel runs) and npm.

```bash
npm install
npm start                 # dev server at http://localhost:4200
```

The dev server talks to the **live** Firestore project. There is no separate
staging database, so treat anything you save in the dashboard as production data.

---

## Commands

| Command                                                       | What it does                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `npm start`                                                   | Dev server, `http://localhost:4200`                                         |
| `npm run build`                                               | Production build **and** the Vercel package (see [Deployment](#deployment)) |
| `npm run serve:ssr:al-andalus`                                | Runs the built SSR server, `http://localhost:4000`                          |
| `npm run seed`                                                | Inserts sample vehicles and default settings — see [Seeding](#seeding)      |
| `npm run layout-check -- <baseUrl> <paths> <widths> <outDir>` | Drives a real browser and reports horizontal overflow                       |
| `npm run lighthouse -- <baseUrl> <paths> <label> [runs]`      | Lighthouse on mobile 4G, median of N runs                                   |

Examples:

```bash
npm run build
npm run serve:ssr:al-andalus

npm run layout-check -- http://localhost:4000 /,/vehicles,/favorites 320,375,768,1024,1440 ./shots
npm run lighthouse   -- http://localhost:4000 /,/vehicles after 5
```

`npm test` is wired to `ng test` but **there are no test files** — see
[Known gaps](#known-gaps).

---

## Routes

Public pages are server-rendered on demand. Render modes live in
[src/app/app.routes.server.ts](src/app/app.routes.server.ts).

| Route                                             | Rendering | Notes                                                   |
| ------------------------------------------------- | --------- | ------------------------------------------------------- |
| `/`                                               | Server    | Hero, أبرز العربيات (featured), من نحن, contact         |
| `/vehicles`                                       | Server    | Filters plus one labelled section per category          |
| `/vehicles/:id`                                   | Server    | Details, gallery, specs, WhatsApp button, `Car` JSON-LD |
| `/favorites`                                      | Client    | `localStorage` only, no account                         |
| `/sitemap.xml`                                    | Express   | Built from Firestore per request                        |
| `/robots.txt`                                     | Express   | Disallows `/admin`                                      |
| `/admin/login`                                    | Client    | Email/password                                          |
| `/admin/dashboard`                                | Client    | Four stat cards, category split bar, last five vehicles |
| `/admin/vehicles`                                 | Client    | Search, filters, inline status + مميزة toggles, delete  |
| `/admin/vehicles/new`, `/admin/vehicles/edit/:id` | Client    | Add/edit form with Cloudinary upload                    |
| `/admin/settings`                                 | Client    | Hero, contact details, social links, ملاكي toggle       |

The admin area is lazy-loaded and never server-rendered: Firebase Auth is
browser-only. An unknown URL under `/admin` redirects to the dashboard; any
other unknown URL redirects to the home page.

---

## Data model

Four collections. Firestore enforces no schema, so the TypeScript interfaces in
[src/app/core/models/](src/app/core/models/) are the definition and the rules are
the enforcement.

```
vehicles/{autoId}            the catalogue
settings/showroom            one document: hero, contact details, social links, toggles
analytics/total              { views: number }
analytics/daily_YYYY-MM-DD   { views: number }
admins/{uid}                 existence means "this user is an admin" — never readable by a client
```

**Vehicle** ([vehicle.model.ts](src/app/core/models/vehicle.model.ts)) — key fields:

| Field                        | Notes                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category`                   | `'pickup'` (ربع نقل), `'minibus'` (ميكروباص), `'passenger'` (ملاكي). **Stored values are English and must not change** — the Arabic labels are display only |
| `status`                     | `'available'`, `'reserved'`, `'sold'`, `'hidden'`. Only the first two appear publicly                                                                       |
| `price` / `priceOnRequest`   | `price` must be `null` when `priceOnRequest` is true, or the card shows a stale number                                                                      |
| `payload`, `bedType`         | Pickups only                                                                                                                                                |
| `seats`                      | Minibuses only                                                                                                                                              |
| `isFeatured`                 | Shows the vehicle in أبرز العربيات on the home page                                                                                                         |
| `coverImageUrl`, `imageUrls` | Cloudinary `secure_url`s. The Cloudinary `public_id` is **not** stored                                                                                      |

**ShowroomSettings** ([showroom-settings.model.ts](src/app/core/models/showroom-settings.model.ts))
is a single document holding the hero image and text, the WhatsApp number, the
contact details, optional Facebook/TikTok URLs, and the `showPassengerVehicles`
toggle.

One composite index is required, declared in
[firestore.indexes.json](firestore.indexes.json): `vehicles` on `status` ASC +
`createdAt` DESC. The public catalogue query needs it.

---

## Environment values

Everything lives in [src/environments/environment.ts](src/environments/environment.ts),
and **committing it is correct**. Every value there is public by design: the
browser must receive them to work at all.

| Value                     | What it is                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `firebase.apiKey`         | Identifies the Google Cloud project. Not a credential — it grants nothing on its own |
| `firebase.projectId`      | Which Firestore database to use                                                      |
| `cloudinary.cloudName`    | `qzbv9p86` — appears in every image URL                                              |
| `cloudinary.uploadPreset` | `al_andalus_unsigned` — visible in the JS bundle by necessity                        |
| `cloudinary.folder`       | `al-andalus`                                                                         |
| `siteUrl`                 | Last-resort origin; the real host comes from the request                             |
| `whatsappNumber`          | Fallback only — the live number comes from `settings/showroom`                       |

Security comes from [firestore.rules](firestore.rules), not from hiding these.

> **Never put these in the frontend:** a Firebase **Admin SDK** service-account
> key (it bypasses all rules) or a **Cloudinary API secret** (it can delete every
> image). Neither is anywhere in this repository. Keep it that way.

There is no `.env` file and no `environment.prod.ts`: there is one environment,
and it is the same everywhere.

---

## Firebase setup

Only needed when rebuilding the project from scratch against new accounts.

1. **Create the project** in the Firebase console. Google Analytics is
   deliberately **off**: the only metric is a visitor count, and enabling it
   would add a `measurementId` and an unused SDK to the bundle.
2. **Register a web app** and copy the config object into
   `src/environments/environment.ts`.
3. **Create the Firestore database** in production mode. **The location is
   permanent** — pick a European region (`europe-west1`/`europe-west3`) for
   Egyptian visitors; a US region adds latency to every request.
4. **Enable Email/Password** under Authentication → Sign-in method. Leave email
   links off.
5. **Create the admin user by hand** (Authentication → Users → Add user). There
   is no sign-up page anywhere in the app, by design.
6. **Copy that user's UID**, then create a Firestore document at
   `admins/{uid}` with `role: "admin"`.
   **The document ID must be exactly the UID.** The rules check for a document
   at that path, so a generated ID or an email address means sign-in still
   succeeds and every write fails with `permission-denied`.

### Security rules

[firestore.rules](firestore.rules) in short:

- `vehicles` — world-readable, writable only by an admin. Hiding sold vehicles
  is a product decision made in `VehicleService`, not a security one.
- `settings/showroom` — world-readable; any other settings document is not.
- `analytics` — readable by an admin only; **anyone may add exactly 1 view** and
  change nothing else. The rule compares the document before and after, so a
  visitor cannot write an arbitrary number.
- `admins/*` — readable and writable by nobody. The rules engine still checks it.

**Rules in the repository do nothing until deployed:**

```bash
npm install -g firebase-tools
firebase login
firebase use al-andalus-vehicles
firebase deploy --only firestore:rules,firestore:indexes
```

If every read and write suddenly fails with `permission-denied`, undeployed
rules are the first thing to check.

Note that **Firestore rules reject queries, they do not filter them**. A query
must prove it can only match documents the rules allow, so the rule and the
query have to be designed together.

---

## Cloudinary setup

Images go to Cloudinary rather than Firebase Storage because delivery
transformations (resize, format negotiation) are done in the URL rather than by
a pipeline we would have to build.

Create an **unsigned upload preset** named `al_andalus_unsigned`:

| Setting                 | Value                                                 |
| ----------------------- | ----------------------------------------------------- |
| Signing mode            | **Unsigned** — lets the browser upload with no server |
| Asset folder            | `al-andalus`                                          |
| Public ID prefix        | `al-andalus`                                          |
| Incoming transformation | `c_limit,w_2400,q_auto`                               |

The incoming transformation matters: the owner uploads straight from a phone, and
this caps stored images at 2400px and re-encodes them at an automatic quality.

**Delivery** adds `f_auto,q_auto,w_<width>` after `/image/upload/`, and
[cloudinary.service.ts](src/app/core/services/cloudinary.service.ts) builds a
`srcset` across 400/800/1200/1600.

### What "unsigned" costs

The preset name is in the JavaScript bundle and cannot be hidden. Anyone who
finds it can **upload** images into the account — consuming quota. They cannot
delete anything, and they cannot make an image appear on the site, because that
requires writing a `vehicles` document, which the rules forbid.

Mitigations worth applying in the console: restrict upload/delivery by referrer
domain, and rate-limit the preset.

The preset enforces no size or format limit, so the client checks before
uploading: **8 MB max**, JPEG/PNG/WebP only. That protects the owner from
mistakes, not the account from abuse.

---

## Seeding

[scripts/seed.ts](scripts/seed.ts) inserts ten sample vehicles and default
settings. It signs in as the **real admin** and writes through the ordinary
security rules, so a successful run also proves that the rules and `admins/{uid}`
are set up correctly.

```bash
# bash / Git Bash
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='…' npm run seed

# PowerShell — the bash form above is a syntax error here
$env:SEED_ADMIN_EMAIL="you@example.com"; $env:SEED_ADMIN_PASSWORD="…"; npm run seed
```

It refuses to run against a non-empty `vehicles` collection unless you pass
`--force`, and `--force` **appends** rather than replacing. There is no teardown.
**Do not run this against the live database** — it already holds the owner's real
inventory.

---

## Deployment

Vercel, from the `main` branch. `npm run build` does two things:

1. `ng build` → `dist/al-andalus/browser` (static files) and
   `dist/al-andalus/server` (the SSR server).
2. [scripts/vercel-output.mjs](scripts/vercel-output.mjs) → `.vercel/output`,
   using Vercel's Build Output API:

```
.vercel/output/static/              the browser bundle, served by the CDN
.vercel/output/functions/ssr.func/  the SSR server as one Node function
.vercel/output/config.json          serve a real file if one exists, else render
```

This packaging step is **required**. With `outputMode: "server"` the browser
folder contains no `index.html`, only `index.csr.html`, so deploying it as a
plain static site gives Vercel's own 404 on every route and never runs SSR.
[vercel.json](vercel.json) pins the build command so the step cannot be skipped.

### Allowed hosts

[angular.json](angular.json) → `security.allowedHosts` lists the hostnames SSR
will answer for. Anything else gets **400 Bad Request**.

```json
"allowedHosts": ["localhost", "127.0.0.1", "al-andalus-vehicles.vercel.app", "*.vercel.app"]
```

**Adding a custom domain means adding it here too.** Note that only the `*.`
form is a wildcard — a leading dot (`.vercel.app`) matches nothing.

`src/server.ts` also declares which `x-forwarded-*` headers to trust. Vercel sets
`x-forwarded-for`, and an untrusted forwarding header makes Angular silently skip
SSR and return the empty client shell.

### Verifying SSR after a deploy

Do not judge this from the browser — hydration makes a broken server render look
fine. Check what the server actually sent:

```bash
D=https://al-andalus-vehicles.vercel.app
ID=$(curl -s $D/sitemap.xml | grep -o '/vehicles/[A-Za-z0-9]*<' | head -1 | tr -d '<' | cut -d/ -f3)
curl -s $D/vehicles/$ID | grep -oE '<title>[^<]*</title>|EGP [0-9,]+|<meta property="og:(title|image|url)" content="[^"]*"'
```

It must print the vehicle's title, its price and the `og:` tags. Nothing printed
means SSR is not running. In the Vercel dashboard, the deployment's Functions tab
should list `ssr` with a non-zero invocation count.

---

## Handing the site to a new owner

1. Firebase Console → Authentication → **Add user** with the new owner's email.
2. Copy the new UID and create `admins/{uid}` with `role: "admin"`.
   **Step 2 is not optional**: without it they can sign in and nothing will save.
3. Delete the old admin user **and** its `admins/{uid}` document.
4. Transfer ownership of the Firebase project, the Cloudinary account and the
   Vercel project.

> Existing image URLs contain the Cloudinary cloud name `qzbv9p86`. Moving to a
> different Cloudinary account invalidates every stored image URL unless the
> assets are migrated and the documents rewritten. Raise this before it is asked.

---

## Values the owner still supplies

Everything below is content, changed from **/admin/settings** with no deploy.
Current live values as of 2026-09-18:

| Setting           | Live value                    | Status                |
| ----------------- | ----------------------------- | --------------------- |
| اسم المعرض        | معرض الأندلس                  | Set                   |
| رقم الواتساب      | `2001002214646`               | **Wrong — see below** |
| رقم التليفون      | `01002214646`                 | Set                   |
| العنوان           | كفر الشيخ سيدي سالم طريق محرم | Set                   |
| مواعيد العمل      | مفتوح دائماً                  | Set                   |
| فيسبوك            | facebook.com/share/187Pj7maQo | Set                   |
| تيك توك           | tiktok.com/@mostafa.elshaht56 | Set                   |
| صورة الهيرو       | Cloudinary image              | Set                   |
| عنوان ووصف الهيرو | الأندلس / لبيع وشراء السيارات | Set                   |

> **The WhatsApp number is malformed.** It must be the international number with
> **no `+` and no leading `0`**: the local number `01002214646` becomes
> **`201002214646`**, not `2001002214646`. The app builds `wa.me/<number>` from
> this value directly, so while it is wrong, every WhatsApp button — the end of
> the entire sales funnel — opens an invalid chat. Fix it in **/admin/settings →
> رقم الواتساب**.

Per-vehicle content the owner maintains: photos (cover image required), price or
"السعر عند الاتصال", status as stock moves, and the مميزة star for the home page.

---

## Known gaps

Honest list for whoever picks this up next.

- **No tests at all.** `ng test` is wired up but no spec files exist. The
  security rules in particular are untested, and they are the only thing
  protecting the data.
- **Uploaded images can never be deleted.** Cloudinary's `public_id` is not
  stored, so deleting a vehicle or replacing the hero leaves the image in the
  account forever. Fixing this needs a server endpoint and a schema change.
- **No server-side validation of vehicle writes.** The rules check _who_ writes,
  never _what_. The forms are the only validation, so a malformed document is
  possible and the read path defends against it.
- **Missing and sold vehicles return HTTP 200**, with no `noindex`. Google sees
  soft 404s.
- **The visit counter is deduplicated in `sessionStorage`**, so the number is
  indicative, not accurate. It also pulls ~550 kB of Firestore onto the public
  site; a plain REST call would remove that.
- **`/sitemap.xml` and `/robots.txt` trust the request's host header**, and they
  run outside Angular's allowed-hosts check.
- **Portrait tablets (768×1024)** show a weak hero: the text overlaps the vehicle.
- CLAUDE.md §7 records two further deliberate compromises.
