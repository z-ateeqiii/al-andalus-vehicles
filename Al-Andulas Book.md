# Al-Andalus — Technical Book

Internal reference for **معرض الأندلس**, an Egyptian vehicle showroom catalogue.
Angular 21 (standalone, zoneless, SSR) on Vercel, talking directly to Cloud
Firestore, with images on Cloudinary.

This document is written for the developer who built it: competent in Angular,
about to start backend work, and deciding how much of what they know here
transfers. It assumes Angular syntax. It does not explain what a component is.

Every claim about this codebase cites a file, a function, or a commit hash.
Where something could not be verified from the repository, it says so.

> **This file contains real infrastructure identifiers** — project ID, API key,
> cloud name, preset name, admin account address. That is deliberate: it is
> internal documentation, and placeholders would make Part 0 untestable. None of
> these values is a secret (Part 0 explains precisely why), but if this
> repository is ever made public, review this file first. **No password appears
> anywhere in it.**

---

## PART 0 — Setup and configuration, reproducible from zero

The test for this part: someone with an empty laptop and no accounts could
rebuild the entire infrastructure from it alone.

---

### 0.1 Firebase — creating the project

Console → **Add project** → name `al-andalus-vehicles`. The project ID that
Firebase generates from that name is what the app actually uses, and it is
baked into three of the six config values below, so it cannot be changed later
without re-registering the app.

**Google Analytics was declined at creation.** The wizard offers it as a default
"on". It was switched off, and this was not laziness:

- The only metric this product wants is a visitor count. That is one integer,
  and it is implemented in eleven lines in
  [`src/app/core/services/analytics.service.ts`](src/app/core/services/analytics.service.ts).
- Enabling GA adds `measurementId` to the web config and pulls
  `firebase/analytics` into the bundle — a dependency the site would download
  on every visit to collect data nobody was going to read.
- GA also introduces a consent/PII question (it sets cookies and collects IP-derived
  location) for a catalogue that otherwise stores nothing about visitors.

The declining is recorded in the config itself as a comment, so nobody adds it
back by reflex:

```ts
// src/environments/environment.ts
messagingSenderId: '559309677123',
appId: '1:559309677123:web:14425c82a3a13580176af6',
// No measurementId: Google Analytics is not used. Firestore and Auth only.
```

---

### 0.2 Registering the web app, and where the config comes from

Console → Project settings → **Your apps** → Web (`</>`) → register. Firebase
returns a `firebaseConfig` object. That object is the entire client-side
identity of the project. It is retrievable at any time from
Project settings → Your apps → SDK setup and configuration → Config.

The exact object as used here, from
[`src/environments/environment.ts`](src/environments/environment.ts):

```ts
firebase: {
  apiKey: 'AIzaSyAHB0b1y4rfNMdoN08W3vx2A2L2TNczfBc',
  authDomain: 'al-andalus-vehicles.firebaseapp.com',
  projectId: 'al-andalus-vehicles',
  storageBucket: 'al-andalus-vehicles.firebasestorage.app',
  messagingSenderId: '559309677123',
  appId: '1:559309677123:web:14425c82a3a13580176af6',
},
```

Key by key:

| Key | What it actually is |
|---|---|
| `apiKey` | A **Google Cloud API key**, not a credential. It identifies *which Google Cloud project* an unauthenticated REST call is addressed to, and lets Google apply that project's quotas and referrer restrictions. It carries no permissions and proves nothing about who is calling. |
| `authDomain` | The host Firebase Auth uses for OAuth redirect flows and for its `iframe`-based session handling. Unused in practice here — this app only does email/password, and `initializeAuth` is called without a popup/redirect resolver (see §0.6). |
| `projectId` | Which Firestore database to talk to. Every REST path the SDK builds contains it. |
| `storageBucket` | The Cloud Storage bucket name. **This project does not use Cloud Storage at all** — images go to Cloudinary (§0.10). The key is left in because it arrives with the generated config and removing it changes nothing. |
| `messagingSenderId` | The FCM sender ID. Unused; also arrives with the generated config. |
| `appId` | Identifies this specific registered app (as opposed to an iOS/Android app in the same project) for analytics and Crashlytics attribution. Unused here. |

#### Why `apiKey` is not a secret, and why committing it is correct

This is the single most commonly misunderstood thing about Firebase, so it is
worth being exact.

An `apiKey` in a Firebase web config is **an identifier, not an authenticator**.
It answers "which project?" It does not answer "who are you?" or "may you do
this?" Anyone who loads the site gets it: it is in the JavaScript bundle, which
the browser must be able to read to run it. There is no version of a client-side
Firebase app where this value is hidden. Obfuscating it would only be
obfuscation.

What actually protects the data is two other things:

1. **[`firestore.rules`](firestore.rules)** — a declarative policy evaluated by
   Google's servers on every single read and write, reproduced in full in §0.8.
   An attacker holding the API key and writing their own client still hits these
   rules. They cannot write a vehicle, because the rules require an
   `admins/{uid}` document to exist for their authenticated UID, and they cannot
   create one, because `admins/*` is denied to every client.
2. **Firebase Auth** — the `apiKey` lets someone *attempt* a sign-in. It does
   not let them succeed without an email and password.

The threat the key does expose is **quota abuse**: someone can make
unauthenticated reads against your project and burn your free-tier reads. The
mitigation is Google Cloud Console → Credentials → the "Browser key
(auto created by Firebase)" → **Application restrictions → HTTP referrers**,
restricted to your production domain. *This has not been done on this project.*
It is listed in Part 5.

The rule to carry forward: **if a value must reach the browser to work, it is
not a secret.** Treat "is this in the bundle?" as the test, and put the security
somewhere the browser cannot reach — which, in a serverless app, means
declarative rules. Part 2 contrasts this with a server-side model, where the
equivalent values genuinely are secrets because they never leave the server.

---

### 0.3 Firestore — creating the database and choosing a location

Console → Firestore Database → Create database → **Production mode** (start
locked down; the rules in §0.8 replace the default). Then choose a location.

**The location choice is permanent.** It cannot be changed after creation; the
only migration path is a new project and a data copy.

Why it matters for this project specifically: every Firestore read is a network
round trip from the user's device (or from the Vercel SSR function) to that
region. For Egyptian users, `europe-west1` (Belgium) or `europe-west3`
(Frankfurt) are roughly 60–90 ms away; `us-central1` is 150–200 ms. The
inventory page performs one query; the details page performs two. On a mobile
connection that difference is small but real, and it compounds with the SSR
model — the *server* also pays the round trip before it can render, so it lands
directly in TTFB.

> **Unverified:** the repository does not record which location was chosen — it
> is not in `firebase.json`, `.firebaserc` is absent, and the SDK does not need
> it. Check Console → Firestore Database → the region shown beside the database
> name. If it is a US region, that is a latency cost paid on every request for
> every Egyptian visitor, and it is not fixable in place.

---

### 0.4 Firestore data model

Three collections plus one marker collection. There is no schema enforcement in
Firestore, so the TypeScript interfaces in
[`src/app/core/models/`](src/app/core/models/) are the only definition, and the
rules in §0.8 are the only enforcement.

```
vehicles/{autoId}          the catalogue
settings/showroom          one document: hero, contact details, social links, toggles
analytics/total            { views: number }
analytics/daily_YYYY-MM-DD { views: number }
admins/{uid}               existence = "this UID is an admin". Never read by a client.
```

The vehicle shape is
[`Vehicle`](src/app/core/models/vehicle.model.ts); the settings shape is
[`ShowroomSettings`](src/app/core/models/showroom-settings.model.ts).

One composite index is required, declared in
[`firestore.indexes.json`](firestore.indexes.json):

```json
{
  "collectionGroup": "vehicles",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

It exists because `VehicleService.listPublic()` combines a `where` on one field
with an `orderBy` on another:

```ts
// src/app/core/services/vehicle.service.ts
fs.query(
  fs.collection(db, COLLECTION),
  fs.where('status', 'in', [...PUBLIC_VEHICLE_STATUSES]),
  fs.orderBy('createdAt', 'desc'),
)
```

Firestore serves single-field queries from automatic indexes, but any query that
filters on one field and orders by another needs a composite index declared up
front. Without it the query fails at runtime with an error containing a console
link to create it — a failure mode that only appears once real data exists, which
is exactly when you are least expecting it.

This is also why the app performs **one** query and filters in memory. From
[`vehicle.service.ts`](src/app/core/services/vehicle.service.ts):

> A showroom holds tens of vehicles, not thousands, so the public catalogue is
> one query and the inventory filters (category, brand, price, search) run in
> memory. That keeps Firestore to a single composite index instead of one per
> filter combination.

That is a genuine architectural trade — see Part 2.

---

### 0.5 Enabling Email/Password auth and creating the admin

Console → Authentication → Get started → Sign-in method → **Email/Password** →
Enable. Leave "Email link (passwordless)" off; nothing uses it.

Then Authentication → Users → **Add user**. The account for this project is
`admin@andalus.cars`. The password is not recorded in this document or anywhere
in the repository; it lives in the owner's password manager.

There is deliberately **no sign-up route in the application**. The only way an
account comes into existence is a human in the Firebase console. This is stated
in [`CLAUDE.md`](CLAUDE.md) §5 and enforced by the absence of any
`createUserWithEmailAndPassword` call anywhere in `src/`.

Copy the new user's **UID** from the users table. You need it for the next step.

---

### 0.6 The `admins/{uid}` document

Console → Firestore → Start collection → `admins` → **Document ID: paste the
UID** → add one field, `role: "admin"` (the field is documentation for a human;
the rules never read it).

**The document ID must be exactly the UID, because the rule matches on the
path, not on a field:**

```
function isAdmin() {
  return request.auth != null
    && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
}
```

`exists()` builds a path from `request.auth.uid` and asks whether a document
sits at it. If you let Firestore auto-generate the document ID, or paste the
email instead of the UID, `exists()` returns false for every request. The
symptom is the confusing one: **sign-in succeeds** (Auth and Firestore are
separate systems — Auth doesn't know the rule exists), and then every admin write
fails with `permission-denied`. The app looks broken in a way that points at the
wrong subsystem.

**The client can never read this collection**, by the last specific rule in the
file:

```
match /admins/{uid} {
  allow read, write: if false;
}
```

That looks self-defeating until you notice that `isAdmin()` is evaluated **by
the rules engine**, which is not itself a client and is not bound by `allow`
rules. So the rules can check admin-ness while no client — including the admin's
own browser — can enumerate who the admins are, or grant themselves the role.

This has a direct consequence in the application code. The route guard cannot
check admin-ness, because it cannot read the collection. So it checks
**authentication only** and leaves **authorisation** to the rules:

```ts
// src/app/core/guards/admin.guard.ts
/**
 * This is a convenience, not the security boundary — anyone can skip a client
 * guard. Authorisation is enforced by `firestore.rules`, which require an
 * `admins/{uid}` document for every write. That document is deliberately
 * unreadable by any client, so the guard checks authentication only.
 */
```

That split — a guard for UX, rules for security — is the correct model here, and
worth internalising: **a client-side guard is never a security boundary in any
architecture.** In a REST world the equivalent statement is "route guards are
cosmetic; the `[Authorize]` attribute on the controller is the real check."

---

### 0.7 Why the Firebase Web SDK directly, and not AngularFire

[`CLAUDE.md`](CLAUDE.md) §2 states it as a hard invariant: *"Firebase Web SDK
v12+ used directly. Never AngularFire."*

The reasoning:

- **AngularFire is a wrapper whose main value is Zone.js integration** — it
  patches Firebase's async callbacks so Angular's change detection notices them.
  This app is **zoneless** (Angular 21 default; there is no `zone.js` in
  `package.json`). The wrapper's primary reason to exist does not apply.
- **It adds a release-cadence dependency.** AngularFire has to ship a version
  compatible with both the Angular major and the Firebase major. Using the SDK
  directly means Angular 21 and Firebase 12 upgrade independently.
- **It obscures the thing worth learning.** `getDocs(query(collection(db, 'vehicles'), …))`
  is the actual Firestore API, and it is the same call shape in a Node script
  ([`scripts/seed.ts`](scripts/seed.ts)) as in the browser.

The cost is real and was paid: everything the wrapper would have done —
injection wiring, SSR safety, the `TransferState` bridge — had to be written by
hand, and that hand-written code is where two of the bugs in Part 3 came from.

The wiring lives in
[`src/app/core/config/firebase.config.ts`](src/app/core/config/firebase.config.ts),
which by commit `13f61b9` also became the lazy-loading boundary:

```ts
type FirestoreModule = typeof import('firebase/firestore');

export interface FirestoreApi {
  readonly db: Firestore;
  readonly fs: FirestoreModule;   // fs.getDocs, fs.query, fs.Timestamp, …
}

export async function loadFirestore(): Promise<FirestoreApi> {
  firestorePromise ??= (async () => {
    const [app, fs] = await Promise.all([loadApp(), import('firebase/firestore')]);
    return { db: fs.getFirestore(app), fs };
  })();
  return firestorePromise;
}
```

Every import in that file is `import type`, which erases at compile time, so the
SDK is only fetched when `loadFirestore()` is first awaited. Part 4 has the
numbers.

Auth is deliberately browser-only:

```ts
/**
 * `null` on the server. There is no signed-in user during SSR, and
 * initialising Auth there would reach for browser storage.
 */
export function loadAuthIfBrowser(): Promise<AuthApi | null> {
  return isPlatformBrowser(inject(PLATFORM_ID)) ? loadAuth() : Promise.resolve(null);
}
```

---

### 0.8 `firestore.rules`, rule by rule

This is the security boundary. Reproduced verbatim from
[`firestore.rules`](firestore.rules), then explained.

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null
        && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    match /vehicles/{vehicleId} {
      allow read: if true;
      allow create, update, delete: if isAdmin();
    }

    match /settings/{document} {
      allow read: if document == 'showroom';
      allow write: if isAdmin();
    }

    match /analytics/{document} {
      allow read: if isAdmin();

      allow create: if isAdmin() || (
        request.resource.data.keys().hasOnly(['views'])
        && request.resource.data.views is int
        && request.resource.data.views == 1
      );

      allow update: if isAdmin() || (
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['views'])
        && request.resource.data.views is int
        && request.resource.data.views == resource.data.views + 1
      );

      allow delete: if isAdmin();
    }

    match /admins/{uid} {
      allow read, write: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

#### `vehicles` — public read, admin write

`allow read: if true` means anybody on the internet can read every vehicle
document, including ones whose `status` is `sold` or `hidden`.

That is intentional, and the reasoning is written into the rules file:

> Hiding sold and hidden vehicles is a product decision enforced in
> VehicleService, not a security one: the whole catalogue is public data.

The distinction matters. `VehicleService.listPublic()` filters to
`['available', 'reserved']` so the *site* does not show sold stock, and
`getPublic()` returns `null` for a sold vehicle so a stale link 404s. But a
determined person can query the collection directly and see everything. There
is nothing confidential in a vehicle document — brand, model, price, photos — so
this is an acceptable trade rather than a hole. **If a private field were ever
added to `Vehicle` (a cost price, a seller's phone number), this rule would
become a leak immediately**, and the fix would be splitting the document or
adding a field-level rule.

#### `settings` — one public document, the rest admin-only

```
allow read: if document == 'showroom';
```

The wildcard `{document}` captures the document ID as a variable, and the rule
compares it. So `settings/showroom` is world-readable (the public site needs the
hero and the phone number), while any future `settings/anythingElse` is not.
This is cheaper than a second collection and means a private settings document
can be added later without touching the rules.

#### `analytics` — the "+1 and nothing else" rule

This is the most interesting rule in the file and the one worth studying,
because it does something people assume requires a server: it lets an
**anonymous, untrusted client** mutate shared state, safely.

```
allow update: if isAdmin() || (
  request.resource.data.diff(resource.data).affectedKeys().hasOnly(['views'])
  && request.resource.data.views is int
  && request.resource.data.views == resource.data.views + 1
);
```

Three clauses, and all three are needed:

1. `diff(resource.data).affectedKeys().hasOnly(['views'])` — the write may change
   **no field except `views`**. Without this, a visitor could append arbitrary
   fields to the analytics document and use it as free storage.
2. `request.resource.data.views is int` — type check. Firestore is schemaless; a
   client could otherwise set `views` to a string, an array, or a map, and break
   every subsequent `+ 1` comparison.
3. `request.resource.data.views == resource.data.views + 1` — **exactly one
   more**. Not `>`, not `+ n`. A visitor can add one view; they cannot add a
   thousand.

`resource.data` is the document **as it is now**; `request.resource.data` is the
document **as it would be after this write**. The rule compares before and
after.

The subtlety that makes this work: the client writes

```ts
// src/app/core/services/analytics.service.ts
const views = { views: fs.increment(1) };
await Promise.all([
  fs.setDoc(fs.doc(db, COLLECTION, TOTAL_DOCUMENT), views, { merge: true }),
  fs.setDoc(fs.doc(db, COLLECTION, dailyDocumentId()), views, { merge: true }),
]);
```

`increment(1)` is a **server-side transform**. The client never sends a number —
it sends "add one to whatever is there". Firestore resolves the transform first
and *then* evaluates the rule against the resulting document, so
`request.resource.data.views` is the real post-write value. Two visitors
incrementing concurrently both succeed, and neither overwrites the other.

`create` is separate because on a create there is no `resource.data` to diff
against — reading it would error. The first visit of a day therefore matches the
`create` branch, which requires `views == 1` exactly.

Everything else in the collection is admin-only: `allow read: if isAdmin()`
means the counter can be written by anyone but **read** only by the owner, which
is why the dashboard's `زوار الموقع` card needs a signed-in session.

#### `admins` and the catch-all

```
match /admins/{uid} { allow read, write: if false; }
match /{document=**}  { allow read, write: if false; }
```

The first is explained in §0.6. The second denies every path not named above.
It is strictly redundant — Firestore denies by default — but it makes the intent
explicit, and it means adding a new collection is a deliberate act rather than
something that silently inherits permissions.

#### The thing that surprises people: **rules do not filter**

This is the most important sentence in Part 0.

A Firestore rule is not a `WHERE` clause. It does not narrow a result set. It is
a **predicate evaluated against the query itself**, before any document is read,
and it either allows the whole query or rejects it.

If your rule says documents are readable only when `status == 'available'`, then
this **fails**:

```ts
getDocs(collection(db, 'vehicles'))          // rejected: could return non-available docs
```

…and this **succeeds**:

```ts
getDocs(query(collection(db, 'vehicles'), where('status', '==', 'available')))
```

Firestore cannot evaluate a per-document rule across an unbounded query without
reading every document, so instead it demands that the query *prove* it can only
match permitted documents. **Every query must mirror its rule.**

This project sidesteps the issue by making `vehicles` publicly readable, so no
query shape is constrained. That is why `listAll()` (admin, unfiltered) and
`listPublic()` (filtered) can both run against the same collection without the
rules caring. Had the rules restricted reads by `status`, `listAll()` would have
had to be rewritten as several queries or moved behind a different mechanism
entirely.

The general lesson, and it is the one that bites hardest when coming from SQL:
**in Firestore, security and data access are coupled.** You cannot design the
query and the policy independently. In a REST/SQL backend they are decoupled —
the controller decides what to return and the `WHERE` clause does the filtering
server-side, where nobody can see the rows it excluded. Part 2 develops this.

---

### 0.9 Deploying rules — and what happens if you forget

Rules in the repository do nothing. They are a file. They take effect only when
deployed to the project.

```bash
npm install -g firebase-tools     # once, globally
firebase login                    # opens a browser
firebase use al-andalus-vehicles  # or: firebase use --add
firebase deploy --only firestore:rules,firestore:indexes
```

[`firebase.json`](firebase.json) tells the CLI which files to deploy:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

**This project hit exactly this failure.** The rules were written and committed
in `532f391` ("chore: firestore rules, index and deploy config") but not
deployed. The project was still on Firestore's default production-mode rules,
which deny everything. When a server-side read was first tested end to end, the
result was:

```
PROBE_ERR Missing or insufficient permissions.
```

Every read failed. Nothing in the repository was wrong. `ng build` passed, the
types were correct, the query was correct, and the rules file was correct — it
simply was not the policy the server was enforcing.

Two lessons:

1. **Infrastructure-as-code is not infrastructure until it is applied.** The same
   trap exists with Terraform plans, un-run EF Core migrations, and Kubernetes
   manifests sitting in a repo. "It's in git" and "it's live" are different
   claims.
2. **`permission-denied` on *everything*, including reads that should be public,
   almost always means undeployed rules** — not a bug in your query. A rule bug
   usually denies *some* operations. A blanket denial points at the default
   locked-down ruleset.

Verify deployment in Console → Firestore → Rules, which shows the live ruleset
and the timestamp it was published.

---

### 0.10 The seed script — and why it proves the setup

[`scripts/seed.ts`](scripts/seed.ts) inserts ten sample vehicles (six ربع نقل,
two ميكروباص, two ملاكي) and a default `settings/showroom`.

```bash
# bash / git-bash
SEED_ADMIN_EMAIL=admin@andalus.cars SEED_ADMIN_PASSWORD='…' npm run seed

# PowerShell — the bash form is a parse error here
$env:SEED_ADMIN_EMAIL="admin@andalus.cars"; $env:SEED_ADMIN_PASSWORD="…"; npm run seed
```

**The PowerShell difference caught this project out and is worth stating
plainly.** `VAR=value command` is bash syntax for a one-shot environment
variable. PowerShell has no equivalent inline form: it parses `SEED_ADMIN_EMAIL=…`
as a command name and fails. In PowerShell you assign to `$env:NAME` as a
separate statement first. The same applies to every `ADMIN_EMAIL=… node script`
invocation used during this project's verification runs.

The script is deliberately **not** privileged. It uses the ordinary Web SDK and
signs in as the real admin:

```ts
const app = initializeApp(environment.firebase, 'al-andalus-seed');
const firestore = getFirestore(app);
await signInWithEmailAndPassword(getAuth(app), email, password);
```

There is no Firebase Admin SDK and no service-account key anywhere in the
repository. That choice has a useful property, recorded in the script's own
header:

> It signs in as the real admin account and writes through the ordinary
> security rules, so a successful run is also a check that `firestore.rules`
> and `admins/{uid}` are set up correctly.

In other words the seed is a **smoke test for the whole auth-and-rules chain**.
If `admins/{uid}` has the wrong document ID, or the rules were never deployed,
the seed fails with `permission-denied` at the first `addDoc` — which is a far
better place to discover it than in the admin UI three days later.

An Admin-SDK seed would have bypassed the rules entirely and told you nothing.

It also refuses to run twice by accident:

```ts
const existing = await getDocs(collection(firestore, 'vehicles'));
if (!existing.empty && !force) {
  console.error(`vehicles already holds ${existing.size} document(s). Re-run with --force …`);
  process.exitCode = 1;
  return;
}
```

Note `--force` **appends**; it does not replace. There is no teardown.

---

### 0.11 Cloudinary — why, and not Firebase Storage

Firebase Storage was available in the same project and was not used. The
reasons:

- **Storage stores bytes; it does not transform them.** This site needs every
  image at four widths with format negotiation (§0.14). With Storage you serve
  the original, or you build a resize pipeline — a Cloud Function on upload, a
  thumbnail naming convention, cache invalidation. Cloudinary does it in the URL.
- **Storage would put image delivery on the Firebase bill** alongside Firestore
  reads, and the free Storage egress tier is small.
- **Upload from the browser to Storage needs Firebase Auth**, which would mean
  the image-upload path pulls Firebase Auth into whatever context uploads. Not a
  problem here (uploads are admin-only) but it couples two systems that did not
  need coupling.

The honest counter-argument: Cloudinary is a **second vendor, a second account,
a second free tier to exhaust, and a second thing the client must own at
handover**. For a project already inside Firebase, that is real overhead. The
transformation pipeline is what justifies it; if this site served one image per
vehicle at one size, Storage would have been the simpler call.

---

### 0.12 The Cloudinary account — cloud name vs everything else

Sign up → the dashboard shows a **Product Environment** with:

- **Cloud name** — `qzbv9p86`. This is the only identifier the app uses. It is
  in every delivery URL and in the upload endpoint.
- **API key** and **API secret** — used for *signed* server-side operations
  (signed uploads, admin API, deletions). **Neither appears in this repository
  and neither may ever reach the frontend.** See §0.17.
- An account ID, visible in account settings, which is not used here at all.

In the repo:

```ts
// src/environments/environment.ts
cloudinary: {
  cloudName: 'qzbv9p86',
  uploadPreset: 'al_andalus_unsigned',
  folder: 'al-andalus',
},
```

---

### 0.13 The unsigned upload preset

Console → Settings → Upload → Upload presets → **Add upload preset**. As
configured for this project:

| Field | Value | Why |
|---|---|---|
| Preset name | `al_andalus_unsigned` | Referenced by `environment.cloudinary.uploadPreset`. |
| Signing mode | **Unsigned** | Lets the browser upload directly with no server and no secret. This is the whole point, and §0.15 covers what it costs. |
| Asset folder | `al-andalus` | Where uploads land. The client *also* sends `folder` in the form body (see §0.16) — belt and braces, since the preset can be reconfigured in the console without a deploy. |
| Public ID prefix | `al-andalus` | Prefixes the generated public ID, so assets are namespaced even if the folder setting changes. Observed in a real upload: `public_id: al-andalus/e2c4bnvfv001wth5izij`. |
| Incoming transformation | `c_limit,w_2400,q_auto` | Applied **once, at ingest**. Explained below. |

#### What `c_limit,w_2400,q_auto` does on ingest

- **`c_limit,w_2400`** — resize so the width is at most 2400px, **never
  upscaling**. `c_limit` is "scale down to fit, or leave alone". A 6000px phone
  photo is stored at 2400px; a 1200px image is stored untouched at 1200px.
- **`q_auto`** — re-encode at Cloudinary's automatically chosen quality, which
  analyses the image and picks the lowest quality that is visually equivalent.

It exists because the owner uploads straight from a phone. A modern phone photo
is 4000–6000px and 4–12 MB. Nothing on this site ever displays an image wider
than 1600px (`IMAGE_WIDTHS` in
[`cloudinary.service.ts`](src/app/core/services/cloudinary.service.ts)), so
storing the original would burn storage and bandwidth for pixels no one sees.

Observed effect on a real upload during verification: a 1440×900 PNG of 73 kB
was stored as **25,925 bytes** — `q_auto` doing the work, since the image was
already under the width limit.

The ingest transformation is **destructive**: the original is not kept. That is
fine here (2400px is far beyond any display need) but it is a one-way door — if
you later want 3000px zoom images, the existing assets cannot provide them.

---

### 0.14 Delivery transformations and the `srcset`

Delivery is URL-based. `CloudinaryService.transform()` splices a transformation
segment into the delivery URL immediately after `/image/upload/`:

```ts
const UPLOAD_MARKER = '/image/upload/';

transform(url: string, width: number): string {
  if (!url.includes(UPLOAD_MARKER)) {
    return url;
  }
  return url.replace(UPLOAD_MARKER, `${UPLOAD_MARKER}f_auto,q_auto,w_${width}/`);
}
```

The guard matters: seeded placeholder images point at `placehold.co`, which is
not a Cloudinary URL. Rather than mangle them into something broken, they are
returned untouched — and `srcset()` returns `''` for them, so no `srcset`
attribute is emitted at all.

A real URL from this project (the current hero image):

```
https://res.cloudinary.com/qzbv9p86/image/upload/v1789529871/al-andalus/czx6aqksares9jrhzemr.png
```

…becomes, at `w_800`:

```
https://res.cloudinary.com/qzbv9p86/image/upload/f_auto,q_auto,w_800/v1789529871/al-andalus/czx6aqksares9jrhzemr.png
```

- **`f_auto`** — negotiate the format from the request's `Accept` header. A
  Chrome client gets AVIF or WebP; an older client gets JPEG or the original
  PNG.
- **`q_auto`** — per-image quality selection, again.
- **`w_N`** — the delivery width.

`srcset()` builds all four:

```ts
srcset(url: string, widths: readonly number[] = IMAGE_WIDTHS): string {
  if (!url.includes(UPLOAD_MARKER)) {
    return '';
  }
  return widths.map((width) => `${this.transform(url, width)} ${width}w`).join(', ');
}
```

**Verified evidence that `f_auto` is actually negotiating.** During the
end-to-end upload check, each of the four generated URLs was fetched and its
response inspected:

| width | status | bytes | format (from magic bytes) |
|---|---|---|---|
| `w_400` | 200 | 5,532 | PNG |
| `w_800` | 200 | 15,411 | PNG |
| `w_1200` | 200 | 28,084 | PNG |
| `w_1600` | 200 | 64,344 | **JPEG** |

At 1600 Cloudinary switched the encoding to JPEG — the PNG had stopped being the
smaller choice at that size. That is `f_auto` working, and it is the reason the
transformation is worth having rather than serving one static file.

> **Reproducibility note:** that test ran against a temporary asset uploaded
> during verification (`al-andalus/e2c4bnvfv001wth5izij`), not against a file
> tracked in this repository. The numbers are observed, not derivable from the
> source.

#### The known defect: upscaling above native width

`srcset` always offers all four widths, regardless of how large the asset
actually is. The ingest preset caps assets at 2400px, but a given upload may be
much smaller — the hero is natively **1672×941**.

Requesting `w_1600` from a 1672px-wide asset is fine. Requesting `w_1600` from a
1440px-wide asset makes Cloudinary **upscale**, producing a file that is both
larger in bytes and softer than the original. In the table above, `w_1600`
(64,344 bytes) is larger than the stored asset itself (25,925 bytes), because
that test image was 1440px wide and got scaled up.

The fix is one token: adding **`c_limit`** to the *delivery* transformation, not
just the ingest one. `f_auto,q_auto,c_limit,w_1600` means "at most 1600 wide,
never upscale" — Cloudinary returns the native size and the browser's `srcset`
picker still behaves, because it compares the declared `1600w` descriptor, not
the actual bytes.

This has **not** been done. It is in Part 5.

---

### 0.15 What "unsigned" actually means for security

Be honest about this, because the tempting summary ("it's fine, it's
restricted") is wrong.

**The preset name is in the JavaScript bundle.** It has to be — the browser
sends it. Anyone can open devtools, read `al_andalus_unsigned`, and POST to:

```
https://api.cloudinary.com/v1_1/qzbv9p86/image/upload
```

**What an attacker can do:**

- Upload arbitrary images to your Cloudinary account, into the `al-andalus`
  folder, consuming your storage and transformation quota.
- Keep doing it until the free tier is exhausted and delivery degrades or the
  account is suspended.
- Host their own content on your cloud name, which is a (mild) reputational issue.

**What an attacker cannot do:**

- Delete or overwrite existing assets. Unsigned uploads create; they cannot
  destroy. Deletion requires the API secret.
- Reach Firestore. A Cloudinary upload produces a URL and nothing more. To make
  that URL appear on the site, they would have to write a `vehicles` document,
  which the rules forbid.
- Read anything private. There is nothing private in the account.

So the realistic threat is **quota abuse, not data compromise** — the same shape
of risk as the Firebase API key in §0.2.

**Mitigations that exist and are not applied here:**

- Settings → Security → **restrict delivery/upload by referrer domain**.
- A **rate limit** on the preset.
- Moving to **signed uploads**, which requires a server endpoint that signs a
  timestamp with the API secret — and therefore requires a backend. This is one
  of the clearest places where "having a server" would buy something concrete;
  Part 2 revisits it.

---

### 0.16 Why the preset has no size or format limit, and what compensates

Cloudinary presets historically exposed **Max file size** and **Allowed
formats** fields. In the console UI at the time this project was configured,
those fields were not available on the unsigned preset form — so the preset
enforces neither.

> **Reported, not verified from the repo:** the console's field availability is
> the project owner's observation during setup. It is recorded here because the
> code was written to compensate for it, and that compensation only makes sense
> with this context. Re-check the console before relying on it.

The compensation is entirely client-side, in
[`cloudinary.service.ts`](src/app/core/services/cloudinary.service.ts):

```ts
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

validate(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return 'الصورة لازم تكون JPG أو PNG أو WEBP';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'الصورة كبيرة أوي، أقصى حجم 8 ميجا';
  }
  return null;
}
```

`upload()` calls `validate()` and rejects before opening the request, so nothing
is sent for an invalid file. The service comment states the position without
dressing it up:

> The preset applies `c_limit,w_2400,q_auto` on ingest but enforces no size or
> format limit server-side, so the checks in `validate` are the only thing
> standing between the owner and a 40MB TIFF.

**Be clear about what this is worth.** These checks protect the *owner* from
accidentally uploading a huge file. They protect *nothing* from an attacker, who
is not running your JavaScript. Client-side validation is a UX feature. This is
the single most transferable lesson in Part 0: **validation the client performs
is a courtesy; validation the server performs is a control.** In a REST backend
the same rule holds — the `[Required]` attribute on a DTO is the control; the
Angular `Validators.required` is the courtesy.

---

### 0.17 The upload request and response

Endpoint, built once at module scope:

```ts
const UPLOAD_ENDPOINT = `https://api.cloudinary.com/v1_1/${environment.cloudinary.cloudName}/image/upload`;
// → https://api.cloudinary.com/v1_1/qzbv9p86/image/upload
```

Form fields sent — exactly three:

```ts
const form = new FormData();
form.append('file', file);
form.append('upload_preset', environment.cloudinary.uploadPreset);  // al_andalus_unsigned
form.append('folder', environment.cloudinary.folder);               // al-andalus
```

`XMLHttpRequest` is used rather than `fetch`, and the reason is specific:

```ts
/**
 * `XMLHttpRequest` rather than `fetch` because only XHR reports upload
 * progress, which the add-vehicle form shows per file.
 */
```

`fetch` has no upload-progress event. (`ReadableStream` request bodies can
approximate one, but support is partial and it complicates the abort path.) The
per-file progress bar in
[`image-upload.component.html`](src/app/shared/components/image-upload/image-upload.component.html)
is a real product requirement from the brief, so XHR it is.

Response fields consumed — four, of which two are stored:

```ts
interface CloudinaryUploadResponse {
  readonly secure_url?: string;
  readonly public_id?: string;
  readonly width?: number;
  readonly height?: number;
  readonly error?: { readonly message?: string };
}
```

```ts
resolve({
  secureUrl: payload.secure_url,
  publicId: payload.public_id ?? '',
  width: payload.width ?? 0,
  height: payload.height ?? 0,
});
```

**Only `secure_url` reaches Firestore.**
[`vehicle.model.ts`](src/app/core/models/vehicle.model.ts) has exactly two image
fields —

```ts
coverImageUrl: string;
imageUrls: string[];
```

— and no field for `public_id`. Grepping the whole of `src/` for `publicId`
returns three hits, all of them inside `cloudinary.service.ts` itself: the
interface declaration, the JSDoc above it, and the line that populates it.
**Nothing ever consumes it.** The service returns the public ID and every caller
drops it on the floor.

Two things follow.

First, the JSDoc on that interface is **wrong**:

```ts
/** Only `secureUrl` and `publicId` are stored in Firestore. */
export interface UploadedImage {
```

`publicId` is not stored in Firestore. Nothing is, except `secureUrl`. Part 5
lists it.

Second, and more seriously: **deleting a vehicle leaves its images in Cloudinary
forever.** Cloudinary's destroy API addresses assets by public ID, so even if you
were willing to build the server endpoint the deletion needs (the API secret
cannot go in the browser — §0.18), the identifier required to call it was thrown
away at upload time. The account accumulates orphans at the rate the owner
deletes vehicles. Fixing this later means either storing the public ID from now
on, or parsing it back out of the stored `secure_url`, which is possible but
fragile against URL-format changes. Part 5.

Always `secure_url`, never `url` — the latter is `http:` and would be a mixed-content
failure on an HTTPS site.

---

### 0.18 `src/environments` — what belongs there

The directory holds two files:

- [`environment.ts`](src/environments/environment.ts) — the real values,
  **committed deliberately**.
- [`environment.example.ts`](src/environments/environment.example.ts) — the same
  shape with placeholders and a comment explaining where each value comes from,
  for anyone rebuilding the project against their own accounts.

There is no `environment.prod.ts` and no `fileReplacements` block in
`angular.json`. There is only one environment, because every value in it is
public and identical in every deployment. Adding a build-time swap would have
implied a distinction that does not exist.

What lives here: **public identifiers** — Firebase web config, Cloudinary cloud
name and unsigned preset, the WhatsApp fallback number, the site URL fallback.

#### What must never reach the frontend

Two things, and it is worth being precise about what each would allow:

**The Firebase Admin SDK** (a service-account JSON key). It authenticates as the
project itself and **bypasses `firestore.rules` entirely** — that is its designed
purpose, so servers are not blocked by client rules. A leaked service-account
key means: read, write, and delete every document in every collection; mint
custom auth tokens impersonating any user; and, depending on the roles attached
to the service account, reach other Google Cloud resources in the same project.
There is no rule you can write that stops it, because rules do not apply to it.

**The Cloudinary API secret.** It signs Admin API requests. A leaked secret
means: delete every asset in the account; rename or move assets (breaking every
`coverImageUrl` already stored in Firestore); generate signed upload URLs; and
read the account's full asset list and usage. Unlike the unsigned preset, this
is destructive.

Neither appears anywhere in this repository. Verified: no `serviceAccount`,
`private_key`, `api_secret`, or `.json` credential file is tracked.

The rule that generalises: **a secret is a value that grants capability. An
identifier merely names a resource.** `apiKey` and `cloudName` name things.
Service-account keys and API secrets grant things. Only the second category
needs hiding — and in a browser app, the second category simply cannot be
present at all, which is precisely why serverless architectures push
authorisation into declarative rules instead.

---

### 0.19 Vercel deployment and `security.allowedHosts`

The app builds to an SSR bundle (`outputMode: "server"` in
[`angular.json`](angular.json)) with an Express entry at
[`src/server.ts`](src/server.ts). Vercel runs that as a serverless function.

```bash
npm i -g vercel
vercel link
vercel --prod
```

Render modes are declared in
[`src/app/app.routes.server.ts`](src/app/app.routes.server.ts):

```ts
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Server },
  { path: 'vehicles', renderMode: RenderMode.Server },
  { path: 'vehicles/:id', renderMode: RenderMode.Server },
  { path: 'favorites', renderMode: RenderMode.Client },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server },
];
```

`/vehicles/:id` is `Server`, never `Prerender`, because inventory changes
whenever the owner adds or sells a vehicle. Favorites is `Client` because it
reads `localStorage`; admin is `Client` because Firebase Auth is browser-only.

#### `security.allowedHosts` — the silent SSR killer

Angular 21 added an SSRF protection to the SSR server: it checks the incoming
`Host` header against an allowlist, and **a missing or empty list means nothing
is allowed**. The CLI scaffolds it empty:

```json
"security": { "allowedHosts": [] }
```

With that, every SSR request produces:

```
ERROR: Bad Request ("http://localhost:4321/").
Header "host" with value "localhost:4321" is not allowed.
Falling back to client side rendering. This will become a 400 Bad Request in a future major version.
```

The response is still **HTTP 200**. The page still works. It is simply rendered
entirely in the browser — which silently destroys the two reasons SSR exists
here: Google indexing, and the WhatsApp/Facebook link previews the owner pastes
into chats. A crawler fetching the URL gets an empty `<app-root>`.

This project hit it on the first SSR smoke test. The fix, in
[`angular.json`](angular.json):

```json
"allowedHosts": ["localhost", "127.0.0.1", ".vercel.app"]
```

A leading dot matches subdomains, which covers Vercel's preview deployments.
**When a custom domain is added, it must be added here too**, or production
quietly degrades to client rendering.

#### How to verify SSR is actually working on the live domain

Do not trust the rendered page in a browser — hydration makes CSR and SSR look
identical. Check the bytes the server sent:

```bash
curl -s https://YOUR-DOMAIN/vehicles/SOME_ID | grep -o '<title>.*</title>'
curl -s https://YOUR-DOMAIN/vehicles/SOME_ID | grep -c 'og:image'
curl -s https://YOUR-DOMAIN/vehicles/SOME_ID | grep -c 'EGP'
```

If SSR is live, the title contains the vehicle name, the OG tags are present,
and the price appears in the markup. If it has fallen back to CSR, you get the
shell `<title>` and no vehicle data at all. This exact check was used throughout
development — the details page was verified to contain the title, `EGP 545,000`,
the OG tags, and the `Car`/`Offer` JSON-LD in the server response.

A second, blunter check: view-source and search for a vehicle's brand. If it is
only in the `ng-state` JSON and not in the HTML body, SSR is not rendering.

---

### 0.20 Handover — moving the admin account to the client

At handover the owner needs their own login. The two-step nature of this is easy
to get wrong, and getting it wrong produces the confusing failure from §0.6.

1. **Firebase Console → Authentication → Users → Add user** with the client's
   email and a password they set. Copy the **new UID**.
2. **Firestore → `admins` → Add document, ID = that new UID**, field
   `role: "admin"`.

**Step 2 is not optional and is not implied by step 1.** Creating the Auth user
gives them the ability to *sign in*. It gives them no ability to *write
anything*, because `isAdmin()` checks for a document that does not yet exist.
The symptom of skipping it: they log in successfully, reach the dashboard, and
every save fails with a generic `حصلت مشكلة، حاول تاني` toast — because
[`vehicle.service.ts`](src/app/core/services/vehicle.service.ts) surfaces a
rejected write as a generic error and does not distinguish `permission-denied`.

Then delete the development admin (`admin@andalus.cars`) from Authentication
**and** delete its `admins/{uid}` document. Deleting only the Auth user leaves an
orphan marker document, which is harmless but misleading to the next person who
reads the collection.

Also transfer, outside this repository:

- Firebase project ownership (Console → Users and permissions → change Owner).
- The Cloudinary account, or create one for the client and re-point
  `environment.cloudinary`. **Note that existing `coverImageUrl` values in
  Firestore embed the cloud name `qzbv9p86`** — moving clouds invalidates every
  stored image URL unless the assets are migrated and the documents rewritten.
  This is a genuine lock-in and should be raised before the client asks.
- The Vercel project.

---
