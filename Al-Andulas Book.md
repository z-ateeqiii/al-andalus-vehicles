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

## PART 1 — How the project was actually run

This part is about process, not code. It is here because the process is the
part that transfers to the next project, and because the shape of the git
history is not an accident.

Seventy-one commits across three days, 2026-09-15 to 2026-09-17.

---

### 1.1 The starting material: one written specification

The project began with [`al-andalus-claude-code-prompt.md`](al-andalus-claude-code-prompt.md)
— 530 lines, seventeen numbered sections, written before any code existed. It
is worth being precise about what kind of document that is, because "write a
big prompt" is not the lesson.

It is a **specification**. It contains:

- A business model section (§1) that states the funnel in two sentences and
  then lists twelve things that must **not** be built.
- A non-negotiable stack (§2), down to "no UI kit, no chart library, no toast
  library, no icon package — write the toasts, the bar chart and the SVG icons
  by hand."
- Exact design tokens (§4) as hex values.
- A complete data model (§7).
- A per-screen breakdown (§6, §8) tied to numbered storyboard panels.
- Acceptance criteria (§16, "Done when") — eleven checkable statements.

Two properties of that document did the heavy lifting:

**It defined the negative space.** §1's "explicitly out of scope" list, and the
note that the storyboard's sales charts and `العملاء` / `المبيعات` / `الرسائل`
sidebar items "are illustrative only", pre-empted the single most likely failure
mode: an agent looking at a mockup of a dashboard and building the dashboard in
the mockup. The storyboard *shows* a sales line chart. The spec says do not
build it. Without that sentence it would have been built — and it would have
been built with fabricated data, because there is no sales data in this system.

**It stated acceptance criteria as observable behaviour**, not implementation.
"view-source on `/vehicles/:id` contains the vehicle title, price and OG tags"
is checkable by someone who did not write the code. Compare "implement SSR",
which is not checkable at all.

---

### 1.2 Why the spec was compressed into CLAUDE.md

§0 of the brief instructs, as its third action:

> Write a `CLAUDE.md` at the repo root containing the invariants from sections
> 2, 3, 4 and 13 of this document, so they survive across sessions.

That happened in the first real commit, `df63295` "docs: project invariants in
CLAUDE.md".

The distinction between the two documents is the point:

| | `al-andalus-claude-code-prompt.md` | `CLAUDE.md` |
|---|---|---|
| Kind | Specification — what to build | Invariants — how it must be built |
| Read | Once per feature area | Every session, automatically |
| Lifetime | Fixed at the start | Amended as debt accrues (`0be8046`) |
| Contains | Screens, data model, acceptance | Stack, naming, RTL rule, tokens, scope |

A 530-line spec cannot be re-read at the head of every session — it would crowd
out the work. But the invariants *must* be present every session, because they
are exactly the things that decay: the RTL logical-properties rule, the
three-files-per-component rule, the never-AngularFire rule, the scope
boundaries. Those are about 200 lines and they are cheap to carry.

The split is: **the spec says what this project is; CLAUDE.md says what would
count as damaging it.**

---

### 1.3 Why phased sessions beat one long prompt

The work ran as ten sessions, each with an explicit scope and an explicit stop.
The boundaries, read off the git history:

| Session | Commits | Scope | The stop |
|---|---|---|---|
| 1 | `4834770` → `700b86d` | Scaffold, tokens, fonts, layouts, shared UI | "STOP THERE… Do not start the data layer or any feature page in this session." |
| 2 | `3d66439` → `29d20f9` | Data layer only — services, models, rules, seed | "then stop and report what you verified rather than what you assume works." |
| 3 | `62edc82` → `0868a46` | Public site — home, inventory, details, favorites, SEO, sitemap | "Verify by inspecting the SSR HTML, not the built bundle." |
| 4 | `f3a5ec1` → `bdddb97` | Bundle: measure, dynamic-import Firebase, measure again | "If the refactor doesn't measurably improve LCP or TBT, say so — don't keep it for its own sake." |
| 5 | `a3a171d` → `0be8046` | The lazy-LCP defect, plus a Known debt section | — |
| 6 | `d87465a` → `9d3f2f3` | The entire admin dashboard | "Verify a real upload end to end: file → Cloudinary → secure_url in Firestore → the image rendering on the public site with a working srcset." |
| 7–9 | `d515a24` → `1e3da03` | Mobile hero (three attempts), plus the guard and layout fixes | — |
| 10 | `248c5f1` → `da6cf43` | Minibus category, social links | "do NOT run the seed — that's my call." |

The value of the boundaries was not organisational tidiness. Each one sits at a
point where **continuing without a check would have compounded an error.**

- The session-1 stop is before Firebase. If the design tokens or the RTL
  conventions were wrong, they would have been wrong in every component built
  afterwards. Catching that across twelve shared components is cheap; catching
  it across sixty is not.
- The session-2 stop is after the services and before any page. The services
  are the layer every page depends on. This is where the `PendingTasks` bug
  (`d7e53f3`) was found — before a single page had been built on top of the
  broken assumption.
- The session-4 boundary is drawn around a **measurement**, not a feature. The
  instruction was explicitly reversible: measure, change, measure, discard the
  change if it did not help. That framing is what made the honest answer in
  Part 4 — that TBT got *worse* — reportable rather than something to bury.

The general claim: **one long prompt produces one long uninterrupted chain of
assumptions.** An error introduced in hour one is still there in hour six, and
by then it has been built upon. Phase boundaries are not about attention span.
They are the places where a wrong assumption is cheapest to discover.

The second-order effect is the commit history itself. Because each session had
a narrow scope and the standing instruction was "commit after every meaningful
unit of work", the history is **bisectable and readable**. `d7e53f3 fix: hold
SSR stability until Firestore reads resolve` is a single-purpose commit touching
one file. Part 3 of this book could be written from the diffs because each diff
is the size of one idea. A batched history would not have supported it.

---

### 1.4 What came out right without being asked

Worth separating honestly, because it says something about where an agent's
defaults do and do not align with a project.

**Right unprompted:**

- **Comment discipline.** The brief never asks for *reasons* to be written down.
  They were, consistently, at the point of decision —
  [`transfer-codec.ts`](src/app/core/services/transfer-codec.ts) explains why it
  duck-types instead of using `instanceof`;
  [`analytics.service.ts`](src/app/core/services/analytics.service.ts) explains
  why the counter waits for idle. Much of Part 3 was reconstructed from these
  comments plus the diffs.
- **`satisfies` over `as`** in `countByStatus` — the correct instinct was
  present. §3.7 covers the one place it was not applied, and what that cost.
- **Failure modes chosen deliberately.** `recordVisit()` swallows every error
  under the comment "Counting is best-effort by design"; `alreadyCounted()`
  returns `false` when `sessionStorage` throws, with "count this view rather
  than losing every visitor." Nobody specified either behaviour, and both are
  the right call.
- **Refactors extracted when they earned it** — `d37be63` pulls the codec into
  a pure module, `7362570` exposes settings as a signal. Both unprompted, both
  improvements.

**Right only because it was specified:**

- **Scope discipline.** Without §1's out-of-scope list and the "illustrative
  only" note, the sales charts get built. This is the clearest case in the
  project: a mockup is a strong instruction, and only a stronger
  counter-instruction overrides it.
- **No AngularFire.** The conventional, most-documented path for Angular plus
  Firebase is AngularFire. It took a hard invariant in CLAUDE.md §2 to take the
  other road. The reasoning in §0.7 is sound, but it is *post-hoc* reasoning for
  a decision that was handed down.
- **Logical properties throughout.** `ml-`/`mr-`/`text-left` is what nearly
  every Tailwind example on the internet uses. A codebase-wide absence of them
  is the result of an explicit, repeated rule.
- **Three files per component.** This actively contradicts standard Angular
  advice to inline small templates, and CLAUDE.md says so in as many words:
  "This overrides the usual Angular advice."
- **Egyptian colloquial rather than فصحى.** The default register for written
  Arabic is فصحى. `مفيش عربيات متاحة دلوقتي` only happens if someone insists on
  it and keeps insisting.

The pattern: **defaults are good at local craft and bad at project-specific
judgement.** Comment quality, error handling and type safety improved on their
own. Scope, register, and deliberate departures from convention did not, and
would not have. Those are exactly where specification budget is worth spending.

---

### 1.5 Where verification caught what review would not have

This is the part most worth internalising, because it is a claim about the
limits of reading code.

Several of the defects in Part 3 were found by *running* something, and most of
them would have survived a careful review, because **the code was locally
correct**:

| Defect | Why reading it would not have caught it |
|---|---|
| Missing `PendingTasks` (§3.1) | `transfer-cache.service.ts` reads as a correct cache. The bug is an *absence* — a call that was never there. You cannot see a missing line. |
| Guard unsatisfiable (§3.2) | `await auth.whenReady(); return user !== null …` reads as textbook. The bug is in the semantics of a method defined in a different file. |
| Undeployed rules (§0.9) | Every file in the repo was correct. The defect was in the world, not the code. |
| Lazy LCP image (§3.6) | `loading="lazy"` on a vehicle card is the recommended practice. Whether it is wrong depends on where the element lands in the viewport at runtime. |
| `f_auto` negotiation (§0.14) | No amount of reading `transform()` tells you whether Cloudinary actually switches format. Only a request does. |

The methods that worked, and what each is good for:

**Inspect the transport, not the source.** The session-3 instruction was "verify
by inspecting the SSR HTML, not the built bundle." A bundle tells you what
*could* run. `curl | grep 'og:image'` tells you what a crawler actually
received. This is the check that would have caught §3.1 immediately, and it is
why it is the standing SSR verification in §0.19.

**Drive the real UI.** [`scripts/dev/layout-check.mjs`](scripts/dev/layout-check.mjs)
(`42090ed`) uses `puppeteer-core` to load real routes at real widths and report
overflow. It was written *because* an ad-hoc method had already produced a false
result — the stale-server incident in §3.8, where a layout bug was chased that
did not exist, because the screenshot was of a build that was no longer running.
A repeatable script has no such failure mode.

**Measure both builds at once.** Session 4 served the old and the new build
simultaneously and took the median of five Lighthouse runs against each. A
single before-and-after pair taken an hour apart on a laptop measures the
laptop.

**Diff pixels for non-regression.** Sessions 7–9 changed the mobile hero
repeatedly under a hard constraint that desktop must not move. Desktop
screenshots were diffed: 0.786% and 0.817% of pixels differing, with the
bounding box confined to the trust-icon row. That is a claim with a number
attached. "Desktop looks fine" is not.

**And the method that failed.** Sessions 7–9 exist as three attempts at one hero
because the first two were verified at 390×844 — the nominal iPhone 14 viewport
— while the real one, with Safari's URL bar showing, is about 390×664. The
tooling was working correctly and reporting accurately on the wrong thing. This
is the sharpest lesson available here: **a green check against the wrong target
is more dangerous than no check at all**, because it ends the investigation. A
photograph of an actual phone restarted it.

---

## PART 2 — The architecture, and the road not taken

This is the part to study.

Everything marked **[illustrative]** below was **not built in this project**. It
is a sketch of how the same requirement is normally met by an Angular frontend
against a REST API, written to make the comparison concrete. It has not been
compiled or run, and the .NET and Node fragments are shaped for readability
rather than production.

---

### 2.1 What this application actually is

Strip away the Angular and it is this:

> A browser-side application with **no application server of its own**, holding
> credentials that identify but do not authorise, talking directly to a hosted
> database over the public internet, where every read and write is checked
> against a **declarative policy** evaluated by the database provider.

There is one server-side process — the Angular SSR function on Vercel
([`src/server.ts`](src/server.ts)) — and it is worth being exact about what it
is and is not. It **renders**. It runs the same application code as the browser,
using the same `VehicleService`, obeying the same `firestore.rules`. It holds no
secret, enforces no policy, and owns no business logic. Remove it and the app
still works; you lose SEO and link previews, not correctness.

So this is a serverless SPA with SSR bolted on for crawlers. The security
boundary is [`firestore.rules`](firestore.rules) — 40 lines of a declarative
language — and nothing else.

The consequences run through every section below, but the three that matter
most:

1. **There is nowhere to put a secret.** Not "it's hard"; there is no such
   place. Every capability the app has, a hostile client has too. Anything that
   must stay private must be something the client never needs.
2. **There is nowhere to put logic that must be trusted.** Validation, derived
   values, authorisation — if it has to be true, it has to be expressible in the
   rules language or it is not enforced.
3. **Every client is a direct database client.** The database's query surface is
   the public API. You cannot narrow it; you can only reject calls against it.

---

### 2.2 Reading a vehicle list

**As built.** The rule:

```
match /vehicles/{vehicleId} {
  allow read: if true;
  allow create, update, delete: if isAdmin();
}
```

The query, from
[`vehicle.service.ts`](src/app/core/services/vehicle.service.ts):

```ts
listPublic(): Promise<Vehicle[]> {
  return this.transferCache.through('vehicles:public', async () => {
    const api = await loadFirestore();
    const { db, fs } = api;

    const snapshot = await fs.getDocs(
      fs.query(
        fs.collection(db, COLLECTION),
        fs.where('status', 'in', [...PUBLIC_VEHICLE_STATUSES]),
        fs.orderBy('createdAt', 'desc'),
      ),
    );

    return snapshot.docs.map((doc) => toVehicle(doc, api));
  });
}
```

Three things are happening that have no analogue in a REST client.

**The query is the API.** There is no `/api/vehicles` endpoint whose author
decided what it returns. The browser composes a Firestore query and Firestore
executes it. `where`, `orderBy`, `limit`, `startAfter` are all available to
anyone, which is why the rule has to be written as a statement about what any
query may touch, rather than what this particular one returns.

**Filtering is a product decision, not a security one.** `status in
['available','reserved']` does not hide sold vehicles from a determined person —
`allow read: if true` means the whole collection is readable and a hand-written
query returns all of it. The rules file says this itself:

> Hiding sold and hidden vehicles is a product decision enforced in
> VehicleService, not a security one: the whole catalogue is public data.

**Rules reject; they do not filter.** Covered in §0.8 and repeated here because
it is the load-bearing fact. Had the rule been

```
allow read: if resource.data.status in ['available', 'reserved'];
```

then `listPublic()` would still work — its `where` clause proves it can only
match permitted documents — but `listAll()` would fail outright, because an
unfiltered `getDocs(collection(db,'vehicles'))` might return a hidden vehicle
and Firestore refuses to find out. **The rule and the query are one design, not
two.**

#### [illustrative] The same thing against a REST API

```csharp
// VehiclesController.cs — NOT part of this project
[HttpGet("api/vehicles")]
[AllowAnonymous]
public async Task<ActionResult<IEnumerable<VehicleDto>>> GetPublic()
{
    var vehicles = await _db.Vehicles
        .Where(v => v.Status == VehicleStatus.Available || v.Status == VehicleStatus.Reserved)
        .OrderByDescending(v => v.CreatedAt)
        .Select(v => v.ToDto())
        .ToListAsync();

    return Ok(vehicles);
}
```

```ts
// vehicle.service.ts — NOT part of this project
listPublic(): Observable<Vehicle[]> {
  return this.http.get<Vehicle[]>('/api/vehicles');
}
```

The differences that matter:

| | Firestore, as built | REST [illustrative] |
|---|---|---|
| Who decides the result set | The client's query, bounded by a rule | The controller, absolutely |
| Can a caller see a sold vehicle | Yes, by writing their own query | No — the `Where` runs server-side and the rows never leave the database |
| Shape of the response | The stored document | A DTO — you choose the fields |
| New filter (e.g. by brand) | Client change only, possibly a new index | Server change, redeploy |
| Client bundle | ~550 kB Firestore SDK | `HttpClient`, already present |
| Round trips to render a page | 1, from the browser or the SSR function | 1, from the browser; 0 extra if the server renders |

**What the Firebase approach buys.** No endpoint to write, deploy or version. A
new filter is a client-side change. No serialisation layer, no DTO mapping, no
API contract to keep in sync with two codebases. For a catalogue that changed
shape four times during this build (a category was added in `248c5f1` and
touched *nothing* server-side), that is real velocity.

**What it costs.** The stored document *is* the wire format, so you cannot add a
private field without either splitting the document or writing a field-level
rule. The SDK is large. And the coupling between query and rule means the
security model has to be revisited every time a new query shape is introduced —
a category of change that is free in the REST model.

**When the cost starts to win.** The moment a `Vehicle` needs one field the
public must not see. At that point the Firestore model needs a second
collection (`vehicles_private/{id}`), a second read, and a rule per collection,
while the REST model needs one line removed from a DTO.

---

### 2.3 Authentication and authorisation

**As built.** Three pieces, in three places.

*Authentication* — [`auth.service.ts`](src/app/core/auth/auth.service.ts) wraps
the Firebase Auth SDK and exposes signals:

```ts
readonly user = this.currentUser.asReadonly();
readonly ready = this.resolved.asReadonly();
readonly isSignedIn = computed(() => this.currentUser() !== null);
readonly uid = computed(() => this.currentUser()?.uid ?? null);
```

The SDK holds the session in `localStorage` (`browserLocalPersistence`, set in
[`firebase.config.ts`](src/app/core/config/firebase.config.ts)), refreshes the
ID token in the background, and attaches it to every Firestore request.

*Routing* — [`admin.guard.ts`](src/app/core/guards/admin.guard.ts), which is
explicit about not being a security control:

> This is a convenience, not the security boundary — anyone can skip a client
> guard.

*Authorisation* — `isAdmin()` in the rules, checking for the existence of
`admins/{request.auth.uid}`.

The division is unusual and worth stating precisely: **the client knows whether
it is signed in, and does not know whether it is an admin.** It cannot know,
because `admins/*` is unreadable. It finds out empirically, by attempting a
write and seeing whether it is rejected.

That is why the admin area has no "you are not an authorised administrator"
screen. There is nothing to check. A signed-in non-admin would reach the
dashboard, see the stat cards fail to load (`totalViews()` catches and returns
`0`), and get `حصلت مشكلة، حاول تاني` on every save. Acceptable for a system with
exactly one account; poor for anything larger.

#### [illustrative] The same thing with JWT and middleware

```csharp
// NOT part of this project
[HttpPost("api/auth/login")]
public async Task<ActionResult<TokenResponse>> Login(LoginRequest request)
{
    var user = await _users.FindByEmailAsync(request.Email);
    if (user is null || !await _users.CheckPasswordAsync(user, request.Password))
        return Unauthorized(new { message = "الإيميل أو الباسورد غلط" });

    var roles = await _users.GetRolesAsync(user);          // roles table
    return Ok(new TokenResponse(_tokens.Issue(user, roles)));
}

[HttpPost("api/vehicles")]
[Authorize(Roles = "Admin")]                                // the real boundary
public async Task<ActionResult<VehicleDto>> Create(CreateVehicleRequest request) { … }
```

| | Firestore, as built | JWT + middleware [illustrative] |
|---|---|---|
| Where roles live | `admins/{uid}` document existence | A `Roles` / `UserRoles` table |
| Who can read roles | Nobody, by rule | The server, freely |
| Client knows its role | No | Yes — it is a claim in the token |
| Enforcement point | Every Firestore operation | Every decorated endpoint |
| Cost of a second role | A collection, a rule function, per-path edits | A row |
| Cost of a mistake | Wrong doc ID ⇒ silent total denial (§0.6) | Missing `[Authorize]` ⇒ silent total exposure |

That last row is the interesting asymmetry. **The Firebase failure mode is
fail-closed; the middleware failure mode is fail-open.** Forgetting to add
`admins/{uid}` breaks the admin loudly and immediately. Forgetting `[Authorize]`
on one controller action breaks nothing visible and ships a hole. Given a choice
of which way to fail, the Firebase direction is better — and this is a genuine
point in its favour that is rarely made.

**When the cost starts to win.** As soon as there are two kinds of user. Custom
claims are Firebase's answer (`admin: true` minted into the token by a privileged
process), but minting them requires the Admin SDK — which requires a server —
which means the serverless property has been given up anyway. A roles table and
an `[Authorize]` attribute are simply better at the thing they do. This project
has one account, so the question never arises.

---

### 2.4 Writing and validating data

This is where the serverless model is weakest, and it should be said plainly.

**As built.** `VehicleService.create()`:

```ts
async create(draft: VehicleDraft): Promise<string> {
  const { db, fs } = await loadFirestore();

  const reference = await fs.addDoc(fs.collection(db, COLLECTION), {
    ...stripUndefined(draft),
    createdAt: fs.serverTimestamp(),
    updatedAt: fs.serverTimestamp(),
  });

  return reference.id;
}
```

The rule that governs it, in full:

```
allow create, update, delete: if isAdmin();
```

**That is the entire server-side validation of a vehicle document.** It checks
who you are. It checks nothing about what you wrote.

A signed-in admin can create a vehicle whose `price` is the string `"free"`,
whose `category` is `"submarine"`, whose `status` is absent, with a hundred
extra fields, or with none of the expected fields at all. Firestore will store
it, because Firestore is schemaless and the rule did not object.

What actually prevents this is a stack of things that are all client-side:

- The `VehicleDraft` TypeScript interface — a compile-time construct that does
  not exist at runtime.
- Reactive Forms validators in the add/edit form (`ea7ca72`).
- `stripUndefined()`, which exists for a runtime reason rather than a
  correctness one: *"Firestore rejects `undefined`; `null` is meaningful (an
  unpriced vehicle)."*
- Defensive reads on the way back out, in `toVehicle()`:

```ts
// A half-written document must not take a page down.
imageUrls: Array.isArray(data['imageUrls']) ? (data['imageUrls'] as string[]) : [],
createdAt: data['createdAt'] instanceof fs.Timestamp ? data['createdAt'] : fs.Timestamp.now(),
```

That comment is the tell. **The read path defends against the write path**,
because nothing guarantees the write path produced a well-formed document. In a
system with server-side validation you would not write that line; the database
would not contain such a row.

Only the analytics rules do real validation, and §0.8 shows what that costs in
rule syntax for a single integer field. Extrapolate: a `Vehicle` has around
twenty fields, some optional, some category-conditional (`payloadKg` for pickup,
`seats` for minibus). Expressing that in the rules language is possible and
would be perhaps eighty lines of near-unmaintainable, untested, un-debuggable
predicate — with no way to return a useful error message, since a rule
rejection carries no detail.

**It was not attempted, and for one admin that is the right call.** The owner
is not an adversary; the realistic risk is a typo, not an attack, and forms catch
typos. But it is a decision that is right *only because the project is small*,
and it is the first thing that breaks if the system ever gains a second writer.

#### [illustrative] The same thing with DTOs and model binding

```csharp
// NOT part of this project
public sealed record CreateVehicleRequest
{
    [Required, StringLength(80)]           public string Brand { get; init; } = "";
    [Required, StringLength(80)]           public string Model { get; init; } = "";
    [Range(1980, 2030)]                    public int Year { get; init; }
    [Range(0, 100_000_000)]                public decimal? Price { get; init; }
    [Required, EnumDataType(typeof(VehicleCategory))] public string Category { get; init; } = "";
    [Url]                                  public string CoverImageUrl { get; init; } = "";
}

[HttpPost("api/vehicles")]
[Authorize(Roles = "Admin")]
public async Task<ActionResult<VehicleDto>> Create(CreateVehicleRequest request)
{
    if (!ModelState.IsValid) return ValidationProblem(ModelState);   // 400 + per-field errors

    if (request.Category == "pickup" && request.PayloadKg is null)
        return ValidationProblem("الحمولة مطلوبة لربع النقل");

    var vehicle = Vehicle.Create(request, _clock.UtcNow);   // server owns CreatedAt
    _db.Vehicles.Add(vehicle);
    await _db.SaveChangesAsync();

    return CreatedAtAction(nameof(GetById), new { id = vehicle.Id }, vehicle.ToDto());
}
```

| | Firestore, as built | DTO + model binding [illustrative] |
|---|---|---|
| Schema | None; the interface is a suggestion | Enforced by the table and the DTO |
| Validation | Client-side only, in practice | Attributes + explicit checks, server-side |
| Cross-field rules | Would be rule-language predicates | Ordinary C# |
| Error detail | A bare `permission-denied` | 400 with per-field messages |
| Malformed data possible | Yes | No |
| Read path | Must defend against bad documents | Trusts the database |
| Cost to add a field | Nothing | Migration, DTO, mapper, redeploy |

**What the Firebase approach buys.** Adding `seats` for the minibus category in
`206ff4d` touched the model, the form and the details template. No migration, no
DTO, no endpoint, no redeploy of anything but the frontend. That is genuinely
fast and it is not nothing.

**What it costs.** Correctness is enforced by convention. The database will hold
whatever it is given.

**When the cost starts to win.** The instant a second person or a second client
writes to the collection — a mobile app, an import script, a colleague's
console session. At that point "the form validates it" stops being a statement
about the data and becomes a statement about one code path.

---

### 2.5 The visit counter

The cleanest illustration in the project of what declarative rules can do that
looks like it needs a server.

**As built.** The client, in
[`analytics.service.ts`](src/app/core/services/analytics.service.ts):

```ts
const { db, fs } = await loadFirestore();
const views = { views: fs.increment(1) };

await Promise.all([
  fs.setDoc(fs.doc(db, COLLECTION, TOTAL_DOCUMENT), views, { merge: true }),
  fs.setDoc(fs.doc(db, COLLECTION, dailyDocumentId()), views, { merge: true }),
]);
```

The rule, which does the real work:

```
allow update: if isAdmin() || (
  request.resource.data.diff(resource.data).affectedKeys().hasOnly(['views'])
  && request.resource.data.views is int
  && request.resource.data.views == resource.data.views + 1
);
```

An anonymous, untrusted, fully-inspectable client is allowed to mutate a shared
counter — and the worst it can do is add one. Not two. Not a thousand. Not a
different field. The three clauses in §0.8 close every other door.

`increment(1)` is a server-side transform, so concurrent visitors do not
overwrite each other and the client never sends a number of its own choosing.

Deduplication is the honest weak point:

```ts
private alreadyCounted(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;   // Storage blocked: count this view rather than losing every visitor.
  }
}
```

`sessionStorage` is client state. Clearing it, or opening a private window,
yields another view. **The rule bounds the damage per request; it cannot bound
the number of requests.** Someone with a loop can inflate this counter one call
at a time, indefinitely. Firestore's per-project write quota is the only ceiling.

The counter is also the only thing that pulls Firestore onto the public site at
all — about 550 kB for a first-time visitor, which is why `bdddb97` defers it
to `requestIdleCallback`, and why CLAUDE.md §7 records replacing it with a bare
`fetch` to the Firestore REST `commit` endpoint as known debt.

#### [illustrative] The same thing with a server endpoint

```csharp
// NOT part of this project
[HttpPost("api/analytics/visit")]
[AllowAnonymous]
[EnableRateLimiting("per-ip")]
public async Task<IActionResult> RecordVisit()
{
    var fingerprint = $"{HttpContext.Connection.RemoteIpAddress}:{DateOnly.FromDateTime(DateTime.UtcNow)}";
    if (!await _cache.TryMarkSeenAsync(fingerprint, TimeSpan.FromHours(24)))
        return NoContent();                       // already counted today

    await _db.Database.ExecuteSqlAsync(
        $"UPDATE Analytics SET Views = Views + 1 WHERE Id = 'total'");

    return NoContent();
}
```

| | Firestore rule, as built | Server endpoint [illustrative] |
|---|---|---|
| Who owns the increment | The rule; the client issues it | The server; the client only asks |
| Client payload | `{ views: increment(1) }` | An empty POST |
| Dedup signal | `sessionStorage` — the client's word | Server-side IP/session state |
| Abuse ceiling | +1 per request, unlimited requests | Rate limiter, per IP |
| Extra cost on the client | ~550 kB SDK | One `fetch` |
| Extra infrastructure | None | An endpoint, a cache, a rate limiter |

**What the Firebase approach buys.** It exists at all. There is no server here,
so without the rule there is no counter — or there is a counter the client can
set to any number it likes.

**What it costs.** Dedup is unenforceable, and the client pays half a megabyte
for a single integer.

**When the cost starts to win.** When the number needs to be *trustworthy* —
reported to anyone, used for a decision, or shown to an advertiser. For "roughly
how many people visit", it is fine. The REST version is strictly better at
accuracy and strictly worse at existing for free.

---

### 2.6 Image upload

**As built.** The browser POSTs directly to Cloudinary with a preset name that
is public (§0.13, §0.15), gets a `secure_url` back, and writes that URL into a
Firestore document. Cloudinary never learns who uploaded; Firestore never learns
that Cloudinary exists. The two systems are joined only by a string.

The authorisation chain is worth tracing, because it is not obvious:

1. The upload to Cloudinary is authorised by **nothing**. Anyone can do it.
2. Writing the resulting URL into `vehicles/{id}` is authorised by `isAdmin()`.
3. So an attacker can put a file *in your Cloudinary account*, but cannot put
   it *on your website*.

The security boundary is not on the upload. It is on the database write that
makes the upload visible — which is the right place for it, and is more robust
than it first appears.

#### [illustrative] Signed upload, or a server proxy

```csharp
// Option A — server signs, browser still uploads directly. NOT part of this project.
[HttpPost("api/uploads/signature")]
[Authorize(Roles = "Admin")]                       // ← the boundary moves here
public IActionResult GetSignature()
{
    var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    var toSign = $"folder=al-andalus&timestamp={timestamp}{_options.ApiSecret}";
    var signature = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(toSign))).ToLower();

    return Ok(new { timestamp, signature, apiKey = _options.ApiKey, folder = "al-andalus" });
}
```

```csharp
// Option B — server proxies the bytes. NOT part of this project.
[HttpPost("api/vehicles/{id}/images")]
[Authorize(Roles = "Admin")]
public async Task<IActionResult> Upload(Guid id, IFormFile file)
{
    if (file.Length > 8 * 1024 * 1024) return BadRequest("الصورة كبيرة أوي، أقصى حجم 8 ميجا");
    if (!await _scanner.IsImageAsync(file)) return BadRequest("الملف ده مش صورة");   // real sniffing

    var result = await _cloudinary.UploadAsync(file, "al-andalus");
    await _db.AddVehicleImageAsync(id, result.SecureUrl, result.PublicId);   // publicId kept
    return NoContent();
}
```

| | Unsigned, as built | Signed [A] | Proxied [B] |
|---|---|---|---|
| Who may upload | Anyone on the internet | Only an admin | Only an admin |
| Secret location | None exists | Server | Server |
| Bytes through your server | No | No | Yes — bandwidth and time |
| Size/type enforcement | Client only (§0.16) | Preset, if configured | Real, server-side sniffing |
| `public_id` retained | **No** (§0.17) | Possible | Yes |
| Deletion possible later | No | Yes | Yes |
| Infrastructure | None | One endpoint | One endpoint + bandwidth |

**What the Firebase/unsigned approach buys.** Zero infrastructure, and uploads
that never touch your server — an 8 MB photo goes browser → Cloudinary at
Cloudinary's speed, with no function timeout to worry about.

**What it costs.** Anyone can fill your account (quota abuse, §0.15); size and
type checks are cosmetic; and — the one that actually bites — **the `public_id`
is discarded, so deletion is off the table forever.**

**When the cost starts to win.** Here, arguably already. The orphaned-asset
problem in §0.17 is not hypothetical: it accrues every time the owner deletes a
vehicle. Option A is a single endpoint and would have fixed the abuse vector,
the format enforcement and the deletion problem together. **This is the place in
the project where "no backend" is least defensible.**

---

### 2.7 SSR data fetching

**As built.** Angular's hydration has a transfer cache that covers `HttpClient`
and nothing else. The Firebase SDK does not go through `HttpClient`, so the
cache does not apply and a hand-written equivalent was required —
[`transfer-cache.service.ts`](src/app/core/services/transfer-cache.service.ts)
plus [`transfer-codec.ts`](src/app/core/services/transfer-codec.ts), about 200
lines.

Three distinct problems had to be solved, none of which a REST app encounters:

**(1) Storing and retrieving the result.**

```ts
async through<T>(key: string, read: () => Promise<T>): Promise<T> {
  const stateKey = makeStateKey<unknown>(key);

  if (this.isBrowser && this.transferState.hasKey(stateKey)) {
    const transferred = this.transferState.get(stateKey, null);
    // Read once: a later navigation should hit Firestore for fresh data.
    this.transferState.remove(stateKey);
    return decodeFromTransfer(transferred) as T;
  }
  …
}
```

The key has to identify the query exactly and identically on both platforms —
`'vehicles:public'`, `` `vehicle:${id}` `` — or the client silently re-fetches
and the user sees a flicker. The cache is deliberately single-use, so a second
navigation gets fresh data rather than a stale server snapshot.

**(2) Holding the server stable until the read resolves.**

```ts
const taskDone = this.pendingTasks.add();
```

The absence of this line was the worst bug in the project. Part 3 §3.1.

**(3) Getting a `Timestamp` through JSON.** `TransferState` serialises as JSON,
and a Firestore `Timestamp` does not survive that — it arrives as
`{seconds, nanoseconds}` with no methods. `transfer-codec.ts` marks them on the
way out and rebuilds them on the way in, using a stand-in class rather than the
real one:

```ts
/** Duck-typing, because the real class is not loaded here. */
function isTimestampLike(value: object): value is TimestampShape { … }
```

The comment explains why it cannot simply import `Timestamp`:

> Decoding runs on the hydrating client's first load, and pulling ~460kB of
> Firestore in just to reconstruct two fields would undo the whole point of the
> transfer cache.

So the codec is fighting the bundle-splitting decision from §0.7. The stand-in
implements everything this project calls (`toDate`, `toMillis`, `isEqual`,
`valueOf`, `toJSON`, `toString`) but `instanceof Timestamp` is false for it and
`toInstant()` is absent. That is recorded as known debt in CLAUDE.md §7 and
again in Part 5.

#### [illustrative] The same thing with HttpClient

```ts
// app.config.ts — NOT part of this project
provideClientHydration(withHttpTransferCacheOptions({ includePostRequests: false }))
```

That is the whole implementation. Angular intercepts server-side `HttpClient`
calls, serialises the responses into the document keyed by method + URL + body,
and the hydrating client's identical calls resolve from the cache. Stability is
handled too, because `HttpClient` registers its own pending tasks.

| | Firebase SDK, as built | HttpClient [illustrative] |
|---|---|---|
| Transfer cache | ~200 hand-written lines | One provider line |
| Cache key | Chosen by hand; must match across platforms | Derived from the request automatically |
| SSR stability | Manual `PendingTasks.add()` | Automatic |
| Non-JSON types | A hand-written codec and a stand-in class | JSON in, JSON out — no round-trip problem |
| Failure mode if wrong | Empty SSR markup (§3.1) or a hydration flicker | — |

**What the Firebase approach buys.** Nothing, in this section. This is the one
comparison with no upside: it is the SDK's price of admission, paid because it
was chosen for other reasons.

**What it costs.** Two hundred lines, one shipped-to-production-class bug, and a
known correctness compromise in the codec.

**When the cost starts to win.** It already has. If SSR is a requirement from
day one, `HttpClient` against a REST API is straightforwardly better here, and
it is not close.

---

### 2.8 The verdict, decision by decision

No hedging.

**Right for this project, and would be right again at a larger size:**

- **Firestore rules as the security boundary for reads.** A public catalogue is
  public. `allow read: if true` is honest about what the data is, and no server
  would have made it safer.
- **The `+1` analytics rule.** A genuinely elegant use of the rules language,
  and the right shape for a metric nobody will audit.
- **Auth split into a UX guard plus server-evaluated rules.** Fail-closed, which
  is the correct direction to fail.
- **Direct Web SDK over AngularFire.** Fewer moving parts, no Zone.js
  dependency, independent upgrade paths, and the API you learn is the real one.
- **One query filtered in memory.** Correct at tens of documents, and honestly
  argued in the service's own comment. It would be wrong at ten thousand, and
  the comment says so.

**Right only because this project is small:**

- **No server-side write validation.** Defensible with exactly one trusted
  writer. Indefensible with two. The `toVehicle()` defensive reads are the
  premium being paid.
- **Everything in one collection with no private fields.** Works because nothing
  about a vehicle is confidential. One private field breaks the model.
- **`sessionStorage` deduplication.** Fine for a vanity metric, useless for a
  number anyone relies on.
- **Filtering in the client.** See above — a property of the data volume, not of
  the architecture.

**Weak, regardless of size:**

- **Unsigned upload with the `public_id` discarded.** Two separate defects
  compounding: the upload is open to anyone, and the identifier needed to ever
  clean up was thrown away. A single signed-upload endpoint fixes both. §0.17,
  §2.6, Part 5.
- **No API-key referrer restriction and no Cloudinary referrer restriction.**
  Both are console settings costing minutes. Neither is applied. §0.2, §0.15.
- **The hand-rolled `TransferState` bridge.** Not wrong given the constraints,
  but it is 200 lines of infrastructure carrying a known-incorrect `Timestamp`
  substitute, written to work around a choice made elsewhere. The cost was
  underestimated when the SDK was chosen.

---

### 2.9 What a real backend would have changed

**Easier:**

- **Validation.** DTOs and attributes replace client-side hope. The
  `toVehicle()` defensive reads disappear, because the database could not hold a
  malformed row.
- **SSR.** `provideClientHydration()` and `HttpClient` replace
  `transfer-cache.service.ts`, `transfer-codec.ts`, the manual `PendingTasks`
  call, and the `Timestamp` stand-in. Four artefacts and one shipped bug, gone.
- **Image upload.** A signed-URL endpoint closes the abuse vector, allows real
  format sniffing, and keeps the `public_id` so assets can be deleted.
- **The visitor count.** Server-side dedup makes the number mean something, and
  removes the last reason Firestore is on the public site at all — roughly
  550 kB off the first visit.
- **Bundle size.** No Firebase SDK in the browser. `HttpClient` is already
  there. §0.7's whole lazy-loading apparatus becomes unnecessary.
- **Private data.** A cost price, a supplier note, an internal status — all
  trivial. Today they require restructuring.
- **Error messages.** `ValidationProblem` returns per-field detail. A rule
  rejection returns `permission-denied` and nothing else, which is why every
  failure in this app surfaces as `حصلت مشكلة، حاول تاني`.

**Harder:**

- **Anything has to be running.** Today, Vercel serves a static SPA plus a
  render function and Google runs the database. A backend means a host, a
  runtime, a deployment pipeline, a database to provision, back up and patch,
  connection pooling, and a second thing that can be down at 2am. For a
  showroom with one admin, that is a real operational burden borne by someone
  who is not technical.
- **Schema changes cost a migration.** `248c5f1` added an entire vehicle
  category by editing TypeScript. With EF Core that is a migration, a redeploy,
  and a coordinated frontend release.
- **Two codebases drift.** Every field exists in a C# model, a DTO, a mapper and
  a TypeScript interface. Four places to change, one contract to keep honest.
- **Realtime is no longer free.** Firestore's `onSnapshot` is available whenever
  it is wanted. The REST equivalent is SignalR or WebSockets, and it is a
  project of its own. *(This project does not use realtime anywhere — but the
  option is currently free and would stop being.)*
- **Auth becomes yours.** Password hashing, reset flows, token refresh, lockout,
  rotation. Firebase Auth does all of it, correctly, for nothing.
- **Latency gains a hop.** Browser → your server → database, instead of browser
  → database. Usually irrelevant, occasionally not.

**The honest summary.** For this specific product — a catalogue, one admin, no
private data, no transactions, no reporting — serverless was the right call, and
the project shipped in three days partly because of it. The architecture's real
costs landed almost entirely in one place: **SSR**, where the hand-written
transfer machinery produced the worst bug in Part 3, and in **image upload**,
where the absence of a server produced a defect with no fix available from the
client side.

If a second admin, a private field, or a report anyone relies on ever appears,
the balance flips — and it flips faster than it looks, because the first two of
those are ordinary requests that a client would not expect to be architectural.

---
