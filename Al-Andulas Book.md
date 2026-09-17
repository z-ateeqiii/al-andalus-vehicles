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
restricted to your production domain. *Nothing in the repository or the session record shows this being done — check the console before assuming it has.*
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

**Mitigations that exist, none of which the repository or session record shows being applied:**

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
  Both are console settings costing minutes. Neither is evidenced anywhere in the repository or session record. §0.2, §0.15.
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

## PART 3 — Every real bug, in depth

Ten defects. Each is presented in the same six-part order: the symptom as it
appeared, the mechanism at framework level, why it was invisible, the real diff,
what would have happened in production, and the general class of bug.

Two of the ten have no commit. §3.4 was caught before it was committed, and
§3.8 was not a code defect at all. Both are included because omitting them would
misrepresent what actually happened.

---

### 3.1 Missing `PendingTasks` — SSR shipped empty markup

Commit `d7e53f3`. The most serious defect in the project.

#### 1. Symptom

A server-rendered route returned HTTP 200 with a fully-formed HTML shell —
`<head>`, styles, layout chrome, the navbar, the footer — and **no vehicle data
anywhere in the body**. The `<script id="ng-state">` block that carries
`TransferState` was present and empty.

In a browser, nothing looked wrong. Hydration ran, the client saw no transferred
state, fetched from Firestore itself, and the page filled in. The defect was
only visible to something that does not execute JavaScript.

#### 2. Mechanism

Angular's SSR does not render for a fixed duration. It renders, then **waits for
the application to become stable**, then serialises the DOM. "Stable" means: no
pending navigations, no pending `HttpClient` requests, no outstanding entries in
`PendingTasks`.

`PendingTasks` is the registry an app uses to say *"do not serialise yet, I am
still working."* `HttpClient` registers itself there automatically. The router
does too.

**The Firebase SDK does not.** It is an ordinary third-party library issuing its
own network calls through its own transport; Angular has no idea it exists. So
the sequence was:

1. The component calls `VehicleService.listPublic()`, which returns a `Promise`.
2. The template renders with `vehicles()` still `null` — the skeleton branch.
3. Angular checks for stability. Nothing is pending. The app is stable.
4. Angular serialises the DOM — skeletons — and sends the response.
5. Firestore answers a few hundred milliseconds later, into a request that has
   already been closed. `transferState.set(...)` writes into an object nobody
   will ever read.

The `await` inside the component suspends *that function*. It does not suspend
*the renderer*. Nothing connected the two.

#### 3. Why it was invisible

Every automated check passed, and passed correctly:

- `ng build` — the code is type-correct. A `Promise` that resolves after
  serialisation is not a type error.
- The SSR bundle built. The server started. Routes returned 200.
- Opening the page in a browser looked completely normal, because hydration
  papered over it. The only artefact was a skeleton flash that reads as normal
  loading.
- Even `TransferState` code review passes: `transfer-cache.service.ts` reads as
  a correct read-through cache. **The bug is the absence of a line**, and there
  is no way to notice a line that was never written by reading the file.

It was found by deliberately wiring a server-rendered route to a real Firestore
read and looking at the **raw response body** — not the browser, not the bundle.

#### 4. The fix

```diff
+    // Holds the application "unstable" until the read resolves. Without this
+    // the server serialises the page before Firestore answers, and every
+    // server-rendered route ships empty markup with nothing in TransferState.
+    const taskDone = this.pendingTasks.add();
     const request = read()
       .then((value) => {
         if (!this.isBrowser) {
           this.transferState.set(stateKey, encodeForTransfer(value));
         }
         return value;
       })
       .finally(() => {
         this.inFlight.delete(key);
+        taskDone();
       });
```

Two lines. `pendingTasks.add()` returns a function; calling it removes the
entry. It is placed in `.finally()` so a *rejected* read also releases stability
— otherwise one Firestore error would hang the SSR render until it timed out,
turning a data problem into an availability problem.

#### 5. What would have happened in production

This defect defeats the entire reason SSR exists in this project. CLAUDE.md §2:

> SSR exists for Google indexing and for WhatsApp/Facebook link previews — the
> owner pastes vehicle links into chats.

Both would have failed silently:

- **Googlebot** does render JavaScript, but on a deferred second pass with no
  guaranteed timing. The first-pass index would have held pages with no vehicle
  names, no prices, and no content — which is what ranking is computed from.
- **WhatsApp, Facebook and Twitter link unfurlers do not execute JavaScript at
  all.** They fetch the HTML, read the `og:` meta tags, and stop. The owner's
  single most important sales action — pasting a vehicle link into a customer
  chat — would have produced a bare URL with no image, no title and no price.

And the failure is **invisible from inside**. The owner opens the link on their
own phone, the page renders correctly, and they have no reason to suspect
anything. The only signal would have been WhatsApp previews looking wrong, weeks
later, with no obvious cause.

#### 6. The general lesson

**Class: async work invisible to the framework's lifecycle.**

Any time a library performs I/O outside the framework's own primitives, the
framework's notion of "done" no longer includes it. This is not Firebase-specific
— the same hole opens with a raw `fetch`, a WebSocket handshake, a third-party
analytics SDK, or any Promise created outside `HttpClient` during SSR.

How to recognise it: ask **"what tells the renderer this work exists?"** If the
answer is "nothing", the renderer will not wait. In Angular the fix is
`PendingTasks`. In Next.js it is the `await` in a server component. In Nuxt it
is `useAsyncData`. Every SSR framework has exactly one such mechanism, and any
I/O that does not route through it is invisible.

The corollary, stated as a rule: **verify SSR by reading the bytes the server
sent, never by looking at the rendered page.** Hydration is specifically
designed to make a broken server render indistinguishable from a working one.

---

### 3.2 The admin guard that signing in could never satisfy

Commit `18d52c9`.

#### 1. Symptom

Enter correct credentials on `/admin/login`. The request succeeds — Firebase
returns 200, no error is thrown, no error toast appears. The app navigates to
`/admin/dashboard` and **immediately lands back on `/admin/login`**, with no
error message.

Repeating it produced the same result every time. The admin area was completely
unreachable.

#### 2. Mechanism

The guard was:

```ts
const user = await auth.whenReady();
return user !== null ? true : router.createUrlTree(['/admin/login']);
```

This reads as textbook. It is wrong because of what `whenReady()` means.

From [`auth.service.ts`](src/app/core/auth/auth.service.ts), `whenReady()`
returns `this.firstState` — a `Promise` created once in the constructor and
resolved by the **first** `onAuthStateChanged` callback:

```ts
let settled = false;

const unsubscribe = api.fa.onAuthStateChanged(api.auth, (user) => {
  this.currentUser.set(user);
  this.resolved.set(true);

  if (!settled) {
    settled = true;
    resolve(user);          // ← resolves once, with whatever the FIRST state was
  }
});
```

So `whenReady()` answers **"has Firebase finished restoring a persisted
session?"** — a one-time startup question. It does not answer "who is signed in
right now."

On a cold load with no stored session, the first callback fires with `null`. The
Promise resolves with `null`. **A Promise's resolved value is permanent.** Every
subsequent `await whenReady()` in that page's lifetime returns `null`, no matter
how many users have signed in since.

The sequence:

1. Page loads. No session. `whenReady()` resolves `null`. Permanently.
2. The user signs in. `signInWithEmailAndPassword` succeeds. The SDK's internal
   state updates and `onAuthStateChanged` fires again — but `settled` is already
   `true`, so the Promise is untouched.
3. The app navigates to `/admin/dashboard`. The guard runs.
4. `await auth.whenReady()` → `null`. Redirect to login.

The guard could be satisfied only by arriving with a session already restored —
which never happens on the navigation immediately following a sign-in.

There was a second, smaller race stacked underneath: even a guard reading the
signal could lose, because `onAuthStateChanged` fires asynchronously and the
component navigates on the line after `signIn()` returns.

#### 3. Why it was invisible

- `ng build` passes. `whenReady(): Promise<User | null>` and the guard handles
  both branches. Types are perfect.
- No error is thrown or logged anywhere. Sign-in genuinely succeeded.
- The guard's own logic is locally correct — "await readiness, then check the
  user" is the right shape. The bug lives in the *semantics of a method defined
  in another file*, and nothing at the call site hints at it.
- It is 100% reproducible but only manifests through a **complete** flow: load
  the page, sign in, navigate. Testing sign-in alone shows success. Testing the
  guard with a restored session shows it working.

It was found by doing the whole thing as a user would, with real credentials,
after the admin login page was built.

#### 4. The fix

```diff
-  const user = await auth.whenReady();
+  // whenReady() only answers "has the restored session been reported yet".
+  // It resolves once — with null on a cold load — so the answer to "who is
+  // signed in now" has to come from the signal, or signing in could never
+  // get past this guard.
+  await auth.whenReady();
-  return user !== null ? true : router.createUrlTree(['/admin/login']);
+  return auth.isSignedIn() ? true : router.createUrlTree(['/admin/login']);
```

`whenReady()` is kept, but **only for timing** — its value is discarded. The
answer comes from `isSignedIn()`, a `computed()` over a signal, which is always
current.

And in `signIn()`, closing the race:

```ts
// Publish immediately rather than waiting for onAuthStateChanged: the
// caller navigates straight into a guarded route on the next line.
this.currentUser.set(credential.user);
this.resolved.set(true);
```

#### 5. What would have happened in production

The owner could never log in. The admin area — the entire reason the project has
a backend at all — would be unreachable from the moment of deploy. Vehicles
could not be added, statuses could not be changed, the hero could not be swapped.
The public site would work perfectly and be permanently frozen on whatever the
seed script wrote.

This one is at least loud. It would have been found within minutes of handover
and it would have looked like a total failure of the deliverable.

#### 6. The general lesson

**Class: a one-shot Promise used as a continuous source of truth.**

A `Promise` is a value that settles once. A signal, observable or store is a
value that changes over time. Using the former where the latter is needed
produces exactly this: correct behaviour on the first evaluation, permanently
stale behaviour on every one after.

Recognising it: **any `await someService.ready()` whose *return value* is then
used as state is suspect.** Readiness and state are different questions.
`whenReady()` is legitimately a Promise — "has startup finished" settles once and
stays settled. `isSignedIn()` is legitimately a signal — it changes. The bug was
conflating them.

The same trap appears with `firstValueFrom(store.user$)` in RxJS code, with a
memoised `getSession()` in React, and with any cached `Promise` holding a
snapshot of mutable state. The fix is always the same shape: **await the
Promise for its timing, read the current value from something live.**

---

### 3.3 The admin layout crashed on every page inside it

Commit `641b52c`.

#### 1. Symptom

With the guard fixed (§3.2), every route behind it rendered **blank**. Not an
error page, not a partial layout — nothing. `/admin/dashboard`,
`/admin/vehicles`, `/admin/settings` all produced an empty document body with a
runtime error in the console.

`/admin/login` worked, because it sits outside the admin layout.

#### 2. Mechanism

`AdminLayoutComponent` derived its header title by walking to the deepest child
route and reading `data['title']`:

```ts
private deepestTitle(): string {
  let route = this.route;
  while (route.firstChild) { route = route.firstChild; }
  const title: unknown = route.snapshot.data['title'];
  return typeof title === 'string' ? title : 'لوحة التحكم';
}
```

This was called during the layout component's construction.

An `ActivatedRoute` and its `snapshot` are not the same object with the same
lifetime. The route *tree* is built as the router matches URL segments, so
`firstChild` links exist early. But a child route's **`snapshot` is populated
when that route is activated**, and activation proceeds parent-first: the layout
component is constructed *before* its children are activated.

So the loop walked down to the deepest `ActivatedRoute` — which existed — and
read `.snapshot.data`, where `snapshot` was `undefined`. Reading `.data` on
`undefined` throws `TypeError`.

The throw happened in a **component constructor**. Angular has no recovery path
there: the component is not created, so its template — which contains the
`<router-outlet>` for every admin page — is never rendered. One unguarded
property access took down the entire admin subtree.

#### 3. Why it was invisible

The commit message is explicit about it:

> Never caught before because the guard redirected away from all of them.

This is the important detail. §3.2 and §3.3 were **layered**: the guard bug
meant no navigation ever reached the layout, so the layout bug could not fire.
Fixing the first revealed the second, which had been present since `22c5b7a`
("feat: admin layout with sidebar and header") — 41 commits earlier, since session 1.

Beyond that:

- `ng build` passes. `route.snapshot` is typed `ActivatedRouteSnapshot`, **not**
  `ActivatedRouteSnapshot | undefined`. TypeScript believed it was always
  present, because in the type definition it always is. This is a type lying
  about a runtime lifecycle, and strict mode cannot help.
- `data['title']` is an index signature returning `any`, so even the value read
  was unchecked.
- The pattern is common and appears in tutorials, where it usually runs inside a
  `NavigationEnd` subscription — i.e. *after* activation — and is fine there.
  Moving it into the constructor is what broke it, and nothing flags that.

#### 4. The fix

```diff
-  private deepestTitle(): string {
-    let route = this.route;
-    while (route.firstChild) { route = route.firstChild; }
-    const title: unknown = route.snapshot.data['title'];
-    return typeof title === 'string' ? title : 'لوحة التحكم';
+  private deepestTitle(): string {
+    let current: ActivatedRoute | null = this.route;
+    let found = '';
+    while (current) {
+      const snapshot: ActivatedRouteSnapshot | undefined = current.snapshot;
+      const title: unknown = snapshot?.data?.['title'];
+      if (typeof title === 'string') { found = title; }
+      current = current.firstChild;
+    }
+    return found || 'لوحة التحكم';
   }
```

Three changes, and all three matter:

1. **`snapshot?.data?.['title']`** — tolerate an absent snapshot instead of
   assuming one. Note that `snapshot` had to be explicitly annotated as possibly
   `undefined`; without that annotation TypeScript would flag the `?.` as
   unnecessary.
2. **Keep the deepest route that actually declares a title**, rather than the
   deepest route of any kind. The previous version read only the leaf, so a
   deeper route without a `title` erased a parent's perfectly good one.
3. **Walk the whole chain**, accumulating, instead of stopping at the bottom.

#### 5. What would have happened in production

The entire admin dashboard — a blank page. Every route, every time. The public
site would be unaffected and look healthy, which makes it worse: the deploy
appears successful.

Combined with §3.2, the two bugs together mean the owner cannot log in, and if
they somehow could, they would see nothing.

#### 6. The general lesson

**Class: reading lifecycle-dependent state before the lifecycle has reached it.**

Two distinct lessons are stacked here.

**First — a type is not a lifetime.** `ActivatedRoute.snapshot` is typed
non-nullable because it is non-null *once the route is activated*. The type
system has no vocabulary for "after activation", so it states the
steady-state truth and leaves the transient one undocumented. This is endemic:
`@ViewChild` before `ngAfterViewInit`, `nativeElement` before the view exists,
a `@Input()` inside a constructor. In every case the type says the value is
there and the runtime disagrees. **When a framework type describes something
that gets populated, find out *when*.**

**Second — bugs queue behind other bugs.** §3.3 had been in the layout since
`22c5b7a`, 41 commits earlier, and §3.2 hid it by redirecting every attempt to
reach a page inside the layout. Fixing a bug that was blocking a code path does not verify that path;
it merely makes it reachable for the first time. **After fixing anything that
was preventing execution, re-verify everything downstream of it as if it were
new** — because from a testing standpoint, it is.

---

### 3.4 Pipe precedence: `a ? b : c | pipe`

**No commit exists for this one.** It was caught and fixed in the working tree
before `a0ca2cb` was committed — `git show a0ca2cb:src/app/shared/components/vehicle-card/vehicle-card.component.html`
already has the corrected line. The original expression below comes from the
session record of the edit, not from git.

#### 1. Symptom

Nothing wrong was ever seen on screen. The defect was spotted in the source after
Prettier reformatted the template, before any vehicle with `priceOnRequest: true`
had been rendered. Had one been rendered, its card would have shown **no price
line at all**: an empty gold slot where `السعر عند الاتصال` should be.

#### 2. Mechanism

The card's price binding was written as:

```html
{{ vehicle().priceOnRequest ? null : vehicle().price | egpPrice }}
```

The intent was "if the price is on request, give the pipe `null`; otherwise give
it the price", so that [`EgpPricePipe`](src/app/shared/pipes/egp-price.pipe.ts)
would turn `null` into its fallback:

```ts
transform(value: number | null | undefined, fallback = 'السعر عند الاتصال'): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return `EGP ${new Intl.NumberFormat('en-US').format(value)}`;
}
```

But in Angular's template grammar **the pipe binds more tightly than the
conditional**, so the expression actually parses as:

```html
{{ vehicle().priceOnRequest ? null : (vehicle().price | egpPrice) }}
```

The pipe applies to the false branch only. For a priced vehicle that is exactly
right, which is why the line looks correct. For an on-request vehicle, the true
branch gives a bare `null` that never goes through the pipe, and interpolating
`null` renders an empty string. That line can never produce the fallback label
the pipe exists to supply.

This is the opposite of the intuition carried over from shell pipes, where `|`
applies to everything on its left.

#### 3. Why it was invisible

- `ng build` passes. Both branches type-check, and `null` is a legal
  interpolation value that produces no warning.
- **It is correct in the common case.** Priced vehicles, which are nearly all of
  the seed data, rendered `EGP 545,000` through the pipe as intended.
- The failure is an *absence*: an empty text node. There is no error and no
  `undefined` on screen to catch the eye.
- The line reads as intended. The pipe is right there on it.

**Prettier** exposed it. When the formatter rewrote the template, it printed the
parsed structure back with explicit grouping, and that grouping was not what the
author meant.

#### 4. The fix

The line `a0ca2cb` shipped with:

```html
{{ vehicle().price | egpPrice }}
```

The fix removes the conditional instead of adding parentheses. The conditional
was redundant, because the model already stores `price: null` for an on-request
vehicle:

```ts
// src/app/core/models/vehicle.model.ts
price: number | null; // null when priceOnRequest
priceOnRequest: boolean; // shows "السعر عند الاتصال"
```

The pipe already maps `null` to the fallback, so the shorter line is also the
correct one.

The fix depends on one rule in the data: **`priceOnRequest: true` must mean
`price === null`.** The add/edit form enforces that, but nothing on the server
does (§2.4). A document with `priceOnRequest: true` and a leftover number would
show the number on the card. The other call sites check both fields
([`seo.service.ts:74`](src/app/core/services/seo.service.ts#L74) and
[`whatsapp.service.ts:51`](src/app/core/services/whatsapp.service.ts#L51)), so
the card is the only place that relies on that rule alone. Part 5 lists it.

#### 5. What would have happened in production

Every vehicle the owner marked `السعر عند الاتصال` would have shown a blank where
its price belongs, on the inventory grid and in the home page's featured band. To
a visitor, a blank price looks like a broken listing. On-request vehicles are
also usually the ones the owner most wants a customer to call about.

The impact is small, but a quick look at the live site would not have caught it,
because the seed data is almost entirely priced.

#### 6. The general lesson

**Class: operator precedence in a template language that does not match the host
language.**

Angular template expressions are not TypeScript. They are a small language with
their own precedence table and one operator, the pipe, that does not exist in
JavaScript. Intuitions from TypeScript do not carry over.

The rule: **never combine a pipe with `?:` or `??` without parentheses.** Better
still, as in this fix: if the pipe already handles the edge case, don't branch in
the template at all.

Also note how it was found. A **formatter** printed the real structure back, and
the difference was visible. A formatter, an AST viewer and the compiled template
all show the code's actual parse, and that makes each of them a form of
verification.

---

### 3.5 `min-width: auto` overflowed the details page at 320px

Commit `0868a46`.

#### 1. Symptom

At a 320px viewport — the narrowest supported width, per CLAUDE.md §4 — the
vehicle details page scrolled horizontally. Content extended roughly **40px past
the right edge**. The page was usable but visibly broken, with the whole layout
shifted and a horizontal scrollbar on a page that should have none.

#### 2. Mechanism

This is the CSS behaviour that catches nearly everyone once.

**A flex or grid item's `min-width` defaults to `auto`, not `0`.**

For a normal block element, `min-width: auto` computes to `0`, so the element
shrinks freely. For a **flex or grid item**, `auto` computes to that item's
`min-content` size — the narrowest it can be without its contents overflowing
*themselves*.

The result: a flex/grid item **refuses to shrink below its content's intrinsic
minimum**, no matter what the track or container says. It wins the argument with
its parent.

Here, the gallery column contained a horizontally-scrolling thumbnail rail. Its
`min-content` width was the sum of all the thumbnails — `max-content`, in
effect, because a row of fixed-size images does not wrap. That number was larger
than the 320px viewport. The column inflated to fit it, the grid track inflated
to fit the column, and the page overflowed.

The `overflow-x: auto` on the rail did not help. Overflow governs what happens
to content *inside* a box once the box has a size. It does not cause the box to
accept a smaller size.

#### 3. Why it was invisible

- `ng build` passes — this is CSS, not TypeScript. No build tool inspects it.
- It is **width-conditional**. At 375px, 768px, 1024px and 1440px the layout is
  fine, because the container is wide enough to hold the rail's intrinsic
  minimum. Only 320px triggers it. Any responsive check that skipped 320px would
  have reported success.
- The markup looks entirely reasonable. `flex flex-col gap-6` on a column and a
  scrollable rail inside it is ordinary, correct-looking code. Nothing in it
  says "this will refuse to shrink" — the behaviour comes from a CSS initial
  value that is not written anywhere in the file.
- Visually it is easy to miss in a desktop browser window narrowed by hand,
  because the scrollbar can appear off-screen.

It was caught by `npm run layout-check`, which drives real routes through
`puppeteer-core` at 320 / 375 / 768 / 1024 / 1440 and reports
`scrollWidth > clientWidth`.

#### 4. The fix

```diff
--- a/src/app/features/public/vehicle-details/vehicle-details.component.html
+++ b/src/app/features/public/vehicle-details/vehicle-details.component.html
       <!-- End column: identity, specs and the calls to action. -->
-      <div class="flex flex-col gap-6">
+      <div class="flex min-w-0 flex-col gap-6">
```

```diff
--- a/src/app/.../vehicle-gallery/vehicle-gallery.component.html
+++ b/src/app/.../vehicle-gallery/vehicle-gallery.component.html
 <div
-  class="flex flex-col gap-3"
+  class="flex min-w-0 flex-col gap-3"
```

```diff
--- a/src/app/.../vehicle-gallery/vehicle-gallery.component.ts
+++ b/src/app/.../vehicle-gallery/vehicle-gallery.component.ts
-  host: { class: 'block' },
+  host: { class: 'block min-w-0' },
```

`min-w-0` is `min-width: 0` — restoring the behaviour most people assumed was
the default.

The third hunk is the one worth noticing. `min-w-0` had to be applied to the
**component host element** too, not only to the markup inside the template. A
component's host is itself a grid item in the parent's layout, and it has the
same `min-width: auto`. Fixing only the inner elements would have left the host
inflating the track. This is a recurring Angular-specific trap: the host
participates in the parent's layout and is invisible in both templates.

The same commit also removed `RouterLink` and `EgpPricePipe` from the component's
`imports` — both were unused from the template. Unrelated cleanup, ridden along.

#### 5. What would have happened in production

Horizontal scroll on the vehicle details page for anyone on a 320px-class device
— older iPhone SE, small Android handsets, and any phone at large accessibility
text sizes, which effectively narrows the layout viewport.

In Egypt, where this site's traffic is overwhelmingly mobile and skews toward
budget handsets, this is not an edge case. The details page is the page that
carries the WhatsApp button — the last step of the entire sales funnel. A broken
layout there costs conversions directly, and the affected users are precisely
the ones least likely to report a bug and most likely to just leave.

#### 6. The general lesson

**Class: a CSS initial value that differs by formatting context.**

The rule to memorise: **flex and grid items have `min-width: auto` (and
`min-height: auto`), which means they will not shrink below their content's
intrinsic minimum.** If a flex or grid child contains anything with a large
intrinsic width — a long unbroken string, a `<pre>`, a table, a
horizontally-scrolling rail, a wide image — it will blow out the layout, and no
amount of `overflow` or `width` on the parent will stop it. `min-width: 0` on
the item is the fix, essentially always.

The three canonical symptoms: text that will not wrap, a scroll container that
scrolls the page instead of itself, and exactly this — a child wider than its
track.

The second lesson is about **testing the boundary, not the middle**. 320px is
listed in CLAUDE.md §4 for a reason. Bugs of this class live at extremes: the
narrowest viewport, the longest string, the empty list, the single item. Testing
375px and 1440px covers the comfortable middle and finds nothing, because the
comfortable middle is where everything works.

---

### 3.6 `loading="lazy"` on the LCP candidate

Commit `a3a171d`.

#### 1. Symptom

`/vehicles` had a Largest Contentful Paint of **8401 ms** on simulated mobile
4G — catastrophic, and roughly 3.3× the 2500 ms "good" threshold.

Breaking LCP into its four phases showed the problem was not the network or the
server:

| Phase | Before |
|---|---|
| TTFB | 458 ms |
| **Load Delay** | **4226 ms** |
| Load Time | 2537 ms |
| Render Delay | 539 ms |

**Load Delay** is the gap between the page starting to load and the LCP
resource's request starting. Four and a quarter seconds of doing nothing about
the most important image on the page.

#### 2. Mechanism

Every vehicle card image carried `loading="lazy"`, which is the correct default
for a catalogue grid — most cards are below the fold and should not be fetched.

But the **first card's image was the LCP element**, and `loading="lazy"` tells
the browser the opposite of what it needs to hear about that image.

A lazy image is not fetched during the preload scan. The browser must first:
parse the HTML, build the DOM, load and apply the CSS, compute layout, determine
where the element actually lands, and only then — once it knows the image is
near the viewport — issue the request. On a throttled mobile connection with the
CSS and JS still arriving, every one of those steps is delayed by everything
else in flight.

Meanwhile the **preload scanner**, which is the browser's fastest path to
discovering resources, skips lazy images entirely by design. The single most
important byte on the page was placed in the slowest possible discovery queue.

This is a case where a good default is wrong for exactly one element.

#### 3. Why it was invisible

- `ng build` passes. `loading="lazy"` is a valid attribute and correct practice.
- It is not a bug in any conventional sense — no error, no wrong output. The
  page is correct; it is slow.
- **A code review would endorse it.** "Lazy-load images below the fold" is
  standard advice, and a vehicle card is a generic component with no idea
  whether it is first on the page or fortieth. The component was right; its
  *usage in one position* was wrong.
- Whether it is a defect depends on runtime layout — where the element lands in
  the viewport at a given breakpoint — which no static analysis can determine.

It was found by running Lighthouse with mobile 4G throttling and reading the LCP
phase breakdown rather than the single score. The score says "slow". The phase
breakdown says **why**, and Load Delay of 4226 ms points at exactly one thing.

#### 4. The fix

The interesting part is that it is **not** simply "set `eager` on the first
row". The commit separates two hints that are usually conflated:

```diff
--- a/src/app/shared/components/cloud-image/cloud-image.component.ts
+++ b/src/app/shared/components/cloud-image/cloud-image.component.ts
-  /** The hero only: eager, high priority, decoded synchronously. */
+  /**
+   * The LCP candidate: eager, `fetchpriority="high"`, decoded synchronously.
+   * At most one image per page should carry this — several high-priority
+   * images only compete with each other.
+   */
   readonly priority = input(false);
 
+  /**
+   * Above the fold but not the LCP candidate: eager, so the browser does not
+   * deprioritise it the way it does a lazy image, but at normal priority.
+   */
+  readonly eager = input(false);
+
+  protected readonly loading = computed(() => (this.priority() || this.eager() ? 'eager' : 'lazy'));
```

```diff
--- a/src/app/shared/components/cloud-image/cloud-image.component.html
+++ b/src/app/shared/components/cloud-image/cloud-image.component.html
-  [attr.loading]="priority() ? 'eager' : 'lazy'"
+  [attr.loading]="loading()"
   [attr.fetchpriority]="priority() ? 'high' : null"
   [attr.decoding]="priority() ? 'sync' : 'async'"
```

And the grid assigns them positionally:

```diff
--- a/src/app/shared/components/vehicle-grid/vehicle-grid.component.html
+++ b/src/app/shared/components/vehicle-grid/vehicle-grid.component.html
-    @for (vehicle of list; track vehicle.id) {
-      <app-vehicle-card [vehicle]="vehicle" />
+    @for (vehicle of list; track vehicle.id; let i = $index) {
+      <app-vehicle-card
+        [vehicle]="vehicle"
+        [priority]="eagerCount() > 0 && i === 0"
+        [eager]="i > 0 && i < eagerCount()"
+      />
     }
```

The reasoning behind the split is recorded on `eagerCount`:

> The real first row is breakpoint-dependent (1 card at 375px, 5 at 1536px) and
> markup cannot know which applies, so this is a deliberate compromise: enough
> cards to cover a desktop row, with only one high-priority hint so a phone does
> not fetch four full-width images that compete with each other.

The instruction for this session was "the first row of vehicle cards must be
`loading="eager"` with `fetchpriority="high"`". That was **deliberately not
followed literally**, and the commit message says so:

> Deliberate deviation from 'the whole first row gets fetchpriority=high': the
> real first row is 1 card at 375px and 5 at 1536px, and several high-priority
> images only compete. One hint, several eager.

`fetchpriority="high"` is a *relative* signal. Applying it to five images tells
the browser they are all more important than everything else and nothing about
which to fetch first — on a phone, where the "first row" is one card, it would
have meant four full-width images competing with the one that actually matters.

Also note `eagerCount` defaults to `0`, and the home page leaves it there: its
featured band sits below a full-viewport hero, so those cards correctly stay
lazy. The hero is that page's LCP candidate.

**Result, and what it revealed.**

| Phase | Before | After |
|---|---|---|
| TTFB | 458 ms | 456 ms |
| **Load Delay** | **4226 ms** | **335 ms** |
| Load Time | 2537 ms | 176 ms |
| Render Delay | 539 ms | 3827 ms |
| **LCP** | **8401 ms** | **5631 ms** |

2770 ms removed, median of five runs.

The load delay collapsed by 3891 ms and load time by 2361 ms — but **render
delay rose from 539 ms to 3827 ms**. The image now arrives early and waits for
the main thread to be free enough to paint it. The bottleneck moved from network
discovery to main-thread contention; it was not removed. The commit message
states this plainly: *"The image is no longer the bottleneck."* Part 4 takes up
what that means and what it did not prove.

#### 5. What would have happened in production

An 8.4-second LCP on the inventory page, on mobile 4G — the exact profile of
this site's actual audience. Well past the point where a large share of visitors
abandon before seeing anything. It also directly degrades Google ranking, since
LCP is a Core Web Vital, on a site whose entire discovery strategy is organic
search.

#### 6. The general lesson

**Class: a correct default applied to the one element that is the exception.**

`loading="lazy"` is right for roughly forty images on that page and catastrophic
for one. The rule is simple and absolute: **the LCP element must never be lazy,
and there must be exactly one `fetchpriority="high"` per page.**

The harder, transferable part is the *diagnostic* method. A Lighthouse score is
a number to feel bad about. **The LCP phase breakdown tells you which of four
different problems you have**, and each has a different fix:

| Dominant phase | Meaning | Fix |
|---|---|---|
| TTFB | The server is slow to respond | Caching, a faster region, less server work |
| **Load Delay** | The resource was discovered late | `preload`, remove `lazy`, stop hiding it behind CSS/JS |
| Load Time | The resource is too big | Compression, format negotiation, correct `srcset` |
| Render Delay | It arrived but could not be painted | Reduce main-thread work, split bundles, shrink hydration |

Before optimising anything, find out which phase dominates. Optimising the wrong
one is effort that changes no number at all — and after this fix, the dominant
phase became Render Delay, which means the next optimisation would have to be a
completely different kind of work.

---

### 3.7 `as Record` hid a missing key that would have produced `NaN`

Commit `248c5f1`.

#### 1. Symptom

None — it was caught before shipping. Had it shipped: the dashboard's category
split bar would have shown `NaN%` for every segment, or collapsed to nothing,
the moment a single minibus vehicle existed.

#### 2. Mechanism

`countByCategory` reduces vehicles into a per-category tally. The seed value was
written as:

```ts
{ pickup: 0, passenger: 0 } as Record<VehicleCategory, number>
```

When `VehicleCategory` was `'pickup' | 'passenger'`, that object was complete and
the cast was merely unnecessary. Commit `248c5f1` added a third member:

```ts
export type VehicleCategory = 'pickup' | 'minibus' | 'passenger';
```

The object was now missing `minibus`. **The `as` cast suppressed the error.**

`as` is an assertion, not a conversion. It tells the compiler "trust me, treat
this as that" and disables the check that would have caught the gap. So
`counts['minibus']` was `undefined` at runtime, and:

```ts
counts[vehicle.category] += 1;      // undefined += 1  →  NaN
```

`undefined + 1` is `NaN`, and `NaN` propagates through every arithmetic
operation it touches. The split bar computes each segment as a percentage of the
total; one `NaN` in the sum makes the total `NaN`, and every percentage `NaN`.

The failure is **silent, delayed and data-dependent**. The code is fine until a
minibus document exists.

#### 3. Why it was invisible

- `ng build` passes — that is precisely what the cast accomplished. TypeScript
  had the information needed to reject it and was explicitly told not to.
- `strict: true` does not help. Strict mode governs nullability and implicit
  `any`. It does not override an explicit assertion; an assertion is the
  programmer overriding the compiler, and strict mode respects that.
- Nothing fails at the moment of change. The type widens, the object does not,
  and the two silently diverge.
- With only pickup and passenger vehicles in the database, behaviour is
  completely correct. The defect activates on data, not on deploy.

It was noticed while adding the category, by asking what else referenced
`VehicleCategory` — not by any tool.

#### 4. The fix

```diff
-      { pickup: 0, passenger: 0 } as Record<VehicleCategory, number>,
+      // Written out rather than cast, so adding a category is a compile
+      // error here instead of a silent NaN in the dashboard.
+      { pickup: 0, minibus: 0, passenger: 0 } satisfies Record<VehicleCategory, number>,
```

The difference between `as` and `satisfies` is the whole lesson:

- **`as T`** — "treat this as `T`." Checking is suppressed. The programmer wins
  the argument.
- **`satisfies T`** — "check that this conforms to `T`, and keep its own narrower
  type." Checking is enforced. The compiler wins.

With `satisfies`, adding a fourth category becomes a **compile error at this
exact line**, pointing directly at the code that needs updating.

The neighbouring `countByStatus` already used `satisfies` correctly:

```ts
{ available: 0, reserved: 0, sold: 0, hidden: 0 } satisfies Record<VehicleStatus, number>,
```

Same shape, same file, one function apart — one safe, one not. That is what
makes this worth documenting: **the correct instinct was present and was not
applied uniformly.** An inconsistency like that is invisible until the day it
matters.

#### 5. What would have happened in production

The owner adds their first ميكروباص. The dashboard's category bar — one of five
things on the page — breaks, showing `NaN%` or vanishing. Nothing else is
affected; vehicles still save, the public site is fine.

Non-critical, but corrosive in a specific way: it breaks **the first time the
owner uses a brand-new feature they were just told about**, on a screen they
were shown at handover. For a non-technical user, a page that displays `NaN`
does not read as "one widget has a bug"; it reads as "the system is broken and I
should not trust it."

#### 6. The general lesson

**Class: a type assertion suppressing the exact check that would have caught a
later change.**

Every `as` is a place where the compiler was told to stop checking. That is
sometimes necessary — parsing external JSON, narrowing a DOM node, working
around an incomplete third-party type. It is almost never necessary for an
object literal you wrote three characters ago.

The rules:

1. **Never use `as` on an object literal.** If it is meant to be `T`, annotate
   it `const x: T = {...}` or assert `{...} satisfies T`. Both check. `as` does
   not.
2. **`as` on a union-keyed `Record` is a trap with a timer on it.** It is
   correct on the day it is written and becomes wrong when someone extends the
   union — and it will not tell them.
3. **When you widen a union type, grep for every use.** `Record<T, …>`,
   `switch` statements without `default`, and exhaustiveness helpers are where
   the fallout lands.

Recognising it: **search the codebase for `as ` and ask of each one, "what check
is this turning off, and what future change would that check have caught?"** In
this repository the audit found one. It was enough.

---

### 3.8 The stale server — chasing a bug that did not exist

**No commit exists for this.** It was not a defect in the code; it was a defect
in the verification method. It appears here because the time it consumed was
real and the lesson is the most practically valuable in Part 3.

#### 1. Symptom

During the session-3 responsive check, the screenshots showed the page
**overflowing horizontally at 375px, with the RTL start edge clipped**. The
session record says: *"Found a real bug at 375px — the page overflows
horizontally and the RTL start edge is clipped."* The element at that edge was
moved to fix it, and the screenshot was taken again. Nothing had changed.

#### 2. Mechanism

Two separate failures, each making the other worse.

**The server was never replaced.** The rebuild sequence stopped the old server
with `taskkill //F //PID …` and then started a new one. The old process kept
port 4400. The note written on noticing it says: *"The server never restarted —
the old process kept port 4400, so I've been screenshotting a stale build."*
Every screenshot after the first showed a build without the edits under test.
The record doesn't show why the kill failed. What matters is that nobody checked
whether it had worked.

**The screenshot method was also unreliable for RTL.** The screenshots came from
headless Chrome's command-line flags (`--screenshot`, `--window-size`). Those did
not reliably capture an RTL page at the scroll position a real visitor sees, so
part of the apparent clipping came from the capture itself. The note at the time:
*"The CLI approach is too unreliable to trust."*

Two unreliable instruments produced a picture that was consistent, believable
and wrong.

#### 3. Why it was invisible

- There is no error. A stale server returns 200 and valid HTML. The build is
  simply old.
- **Consistency looked like confirmation.** Identical screenshots after each edit
  seemed to prove the bug was real and the edits were wrong. In fact they proved
  *nothing was changing*, and from the outside the two look the same.
- Nobody checked the assumption that the screen reflected the code just written.
  Everything that followed was reasoning about a bug that wasn't there.
- A badly captured RTL page looks like a real RTL layout bug, which is the most
  likely kind of bug in this codebase, so it was believed.

#### 4. The fix

The fix was a tool rather than a code change. `puppeteer-core` was added as a
devDependency and
[`scripts/dev/layout-check.mjs`](scripts/dev/layout-check.mjs) was written
(`42090ed`), run with `npm run layout-check`. It drives a real browser against
real routes at the widths in CLAUDE.md §4 and reports overflow as a number,
instead of relying on someone reading a picture.

Being automated is only part of its value. It **removes the steps that failed**:
no hand-typed screenshot flags, no guessing at scroll position, and a measured
`scrollWidth` in place of an impression. It is the tool that later found §3.5.

On its own it doesn't fix the process problem: pointed at a stale server, the
script would measure the stale server. The habit that fixes that is below.

#### 5. What would have happened in production

Nothing directly, because no broken code shipped. The cost was time, plus a less
obvious risk: **an edit was made to fix a bug that did not exist.** The
repository can't tell us which session-3 edits were reactions to the false bug,
and that is itself the problem. Changes to working code made on false evidence
are how real regressions get introduced.

#### 6. The general lesson

**Class: trusting an instrument without checking the instrument.**

**First: when a change seems to have no effect, suspect the build and serve
steps before the change itself.** Make a deliberately obvious edit, such as a
magenta background or a printed timestamp. If it doesn't appear, you are not
looking at your code. That check takes fifteen seconds and would have ended this
incident at once.

**Second: process management fails silently, so check it.** `taskkill`, `kill`
and `docker stop` all fail quietly for ordinary reasons. After stopping a server,
**confirm the port is free** (`netstat -ano | grep :4400`) before starting the
next one. Assuming a kill worked is the same mistake as assuming a write worked.

**Third: repeating an observation from one unchecked source doesn't confirm it.**
Five identical screenshots from a stale server are one observation taken five
times.

The broader point explains why this ended in a script and not a promise to be
more careful: **when a verification method has failed you, replace it.**

---

### 3.9 The hero "fix" that regressed the design

Commits `139a937` → `171db28` → `48912f6` → `1e3da03`. Four commits and three
sessions for one section of one page.

#### 1. Symptom

Three distinct symptoms in sequence, which is what makes this worth documenting.

**(a)** The mobile hero was wrong at 390×844: the truck was cropped through its
middle behind the headline, contrast was too low, the section was too tall for
its content, and the trust indicators stacked vertically and consumed a third of
the screen.

**(b)** After `139a937` fixed all four, a photograph of a **real iPhone running
Safari** showed the hero badly broken in a new way — the crop cutting the truck
in half with dead ink bands above and below it. The user's message was: *"what's
this !! look at mobile screens !"*

**(c)** After `171db28` fixed that, the user rejected the fix outright:

> This is a regression in shape, not a fix. You turned the hero into an ordinary
> image block sitting below the text in normal flow. That is not a hero — the
> text now sits on flat ink with the photo as a separate band underneath it.
> Look at design/storyboard.png panel 05: the mobile hero is the same
> composition as desktop — the photo is the BACKGROUND and the headline,
> description and buttons sit ON TOP of it.

#### 2. Mechanism

**Symptom (b) — the `svh` unit.** `139a937` sized the picture band with `74svh`
and let `object-fit: cover` crop a padded image into it.

`svh` is the *small viewport height*: the viewport with all dynamic browser UI
**shown**. It was introduced precisely to avoid the old `100vh` problem on
mobile. But it is still a **viewport-relative unit**, and on iOS Safari the
layout viewport changes as the URL bar collapses and expands during scrolling.
The band's height became a moving target. On a real phone it ended up shorter
than the photo's natural height, and `object-fit: cover` did what it is supposed
to do: crop the overflow — straight through the middle of the truck.

Verification at 390×844 in headless Chrome could not reveal this. 844 is the
*full* viewport height. With Safari's URL bar showing, the real usable height is
about **664**. The tooling reported accurately on a viewport that does not exist
on the device it was standing in for.

**Symptom (c) — solving the wrong problem.** `171db28` correctly diagnosed "the
height depends on the viewport" and then took the wrong remedy: it moved the
photo **out of the background** into normal flow as an ordinary block with a
fixed aspect ratio, with the text below it.

That does make the height viewport-independent. It also stops being a hero. A
hero is a specific composition — text over image — and the fix replaced it with
a picture and a caption. The bug was fixed and the design was destroyed.

The real insight came in `48912f6`, and it is the one worth extracting:

> The picture is absolute inset-0 again with both scrims restored, and the
> section height comes from min-h-[22rem] plus its content — rem, never
> svh/vh/dvh, so Safari's URL bar cannot resize it. **That was always the real
> cause and it never required moving the image.**

The offending property was the *unit*, not the *layout*. Replacing `74svh` with
`min-h-[22rem]` — an absolute unit that no browser chrome can influence — fixes
the bug while keeping the composition intact. The earlier fix had changed a
variable that was correlated with the bug rather than the one causing it.

#### 3. Why it was invisible

- `ng build` passes. `npm run layout-check` passes. Both were measuring a
  viewport that does not occur on a real iPhone.
- **A green check against the wrong target is worse than no check**, because it
  ends the investigation. 390×844 is the specified viewport for an iPhone 14 and
  is what every device-emulation dropdown offers. It is also not what the page
  gets when Safari's URL bar is visible.
- Symptom (c) is not detectable by any automated means at all. "The photo is no
  longer the background" is a **design** regression. No overflow check, no
  screenshot diff, no Lighthouse audit encodes "this must remain a hero." Only a
  person holding the storyboard can see it.
- Desktop was verified non-regressed throughout — 0.786%, then 0.817% of pixels
  differing, confined to the trust-icon row. That check was sound and it worked.
  It simply had nothing to say about mobile composition.

#### 4. The fix

The relevant change, from `48912f6`:

- Picture returns to `absolute inset-0` with both scrims restored.
- Section height comes from `min-h-[22rem]` **plus content** — rem, never
  `svh`/`vh`/`dvh`.
- The final composition (`1e3da03`) uses two chained Cloudinary transforms:
  `c_fill,ar_3:2,g_west` crops toward the vehicle, then `c_pad,ar_4:5,g_north`
  pads beneath it in ink, so the truck sits whole across the top with the text
  centred on the dark ground below — the storyboard's composition.

The `22rem` figure is derived, not guessed, and the commit records the
derivation:

> 22rem is not arbitrary: the truck spans 0..0.583 of the source width, so a
> west-gravity fill crop only keeps it whole while the section stays wider than
> 1.036:1. At 390px that caps the hero near 376px; 22rem lands at 352px (aspect
> 1.108) with margin, and the description is line-clamped on mobile so an
> over-long one cannot push past it.

Verified at **both** 390×664 and 390×844, producing an identical hero at each —
which is the actual proof that the height no longer depends on the viewport.

#### 5. What would have happened in production

Version (b) — the `svh` version — would have shipped a broken hero to **every
iOS Safari visitor**, which on an Egyptian consumer site is a large share of
traffic. The first thing a visitor sees, cropped through the middle of the
subject, on the page that has one job: make the showroom look credible.

It would also have been **invisible to the developer**, because it renders
correctly in every desktop browser and in every device emulator. Only a real
phone shows it.

#### 6. The general lesson

Three lessons, in ascending order of value.

**First — never size a layout-critical element in viewport-relative units on
mobile.** `vh`, `svh`, `lvh` and `dvh` all vary with browser chrome on iOS
Safari, and `dvh` changes *during scroll*. If an element must have a stable
height, derive it from content, from a fixed aspect ratio, or from absolute
units. `rem` cannot be resized by a URL bar.

**Second — device emulation is not a device.** The nominal viewport of a phone
is not the viewport your page receives. Safari's URL bar, Android's gesture bar,
notches and safe-area insets all take space that emulators hand back to you. For
anything mobile-critical, **test on real hardware at least once**. Two of these
four commits exist because that had not happened, and the thing that finally
broke the loop was a photograph of a phone.

**Third, and most important — when fixing a bug, change the thing that causes
it.** `171db28` correctly identified "the height depends on the viewport" and
then removed the image from the background, which was neither necessary nor
sufficient — it was simply *near* the bug. The result fixed the symptom and
destroyed the feature.

The discipline: **before applying a fix, state what it changes and why that is
the minimum change that resolves the cause.** If the answer includes altering
something the user can see that they did not ask to have altered, it is the
wrong fix — even when it makes the symptom go away. The user's rejection here
was correct and immediate, and the eventual one-property fix proves it: the
composition never needed to change at all.

---

### 3.10 The footer shipped placeholder contact details to live visitors

Commit `da6cf43`.

#### 1. Symptom

The public footer, on every page of the live site, displayed:

```
+20 100 000 0000
العنوان هيتحدد من لوحة التحكم        ("the address will be set from the dashboard")
مواعيد العمل هتتحدد من لوحة التحكم    ("the working hours will be set from the dashboard")
```

A fake phone number and two internal notes-to-self, in Arabic, addressed to the
developer, shown to every visitor of a real business's website.

#### 2. Mechanism

Not a framework bug. A piece of scaffolding that was never replaced.

The footer was built in `36c592c` ("feat: public layout with navbar, drawer, tab
bar and footer") — session 1, before Firebase existed in the project. CLAUDE.md
§6 explicitly sanctions this:

> Do not stop to ask about Firebase credentials, the Cloudinary preset, or the
> WhatsApp number — create clearly-marked placeholders and keep going.

That instruction is correct and it is why the project moved quickly. The failure
is that **nothing tracked the placeholder afterwards.** The pre-fix template
hardcoded all three values:

```html
<li class="flex items-center gap-2">
  <app-icon name="phone" [size]="16" class="text-gold" />
  <span dir="ltr" class="font-latin">+20 100 000 0000</span>
</li>
<li class="flex items-center gap-2">
  <app-icon name="map-pin" [size]="16" class="text-gold" />
  <span>العنوان هيتحدد من لوحة التحكم</span>
</li>
```

`ShowroomSettings` grew `phoneNumber`, `address` and `workingHours`. The admin
settings page was built with fields for all three (`9d3f2f3`). The owner could
enter their real details, save them successfully, and see **no change on the
site**, because the footer never read them. It survived every subsequent session
because nobody was looking at the footer — each session had a different scope,
and the footer was in none of them.

It was found incidentally, in session 10, while adding social links to the same
component.

#### 3. Why it was invisible

- `ng build` passes. Hardcoded strings in a template are valid markup.
- **It rendered perfectly.** There is no failure state. A footer showing a
  plausible-looking phone number and two lines of Arabic text is exactly what a
  footer looks like.
- The text is in Arabic and the placeholder nature is only apparent if you read
  it. `العنوان هيتحدد من لوحة التحكم` is not visually distinct from a real
  address — it is the same length, the same font, in the same position.
- No test, linter, type check or Lighthouse audit has any concept of "this
  string was meant to be replaced."
- The footer is on every page, which paradoxically made it *less* visible: it
  became chrome, the part of the screenshot the eye stops registering.

#### 4. The fix

The component now loads settings and the template renders each line
conditionally:

```html
@if (settings()?.phoneNumber; as phone) {
  <li class="flex items-center gap-2">
    <app-icon name="phone" [size]="16" class="text-gold" />
    <a dir="ltr" class="font-latin transition hover:text-gold" [href]="'tel:' + phone">
      {{ phone }}
    </a>
  </li>
}

@if (settings()?.address; as address) { … }
@if (settings()?.workingHours; as hours) { … }
```

Three things changed beyond removing the strings:

1. **Absent data renders nothing.** `@if (settings()?.phoneNumber; as phone)`
   means an empty field produces no row — not an empty row, not a placeholder.
   An incomplete footer is strictly better than a false one.
2. **The phone became a `tel:` link.** It was inert text before.
3. **The copyright line reads `settings()?.showroomName ?? 'معرض الأندلس'`** —
   the fallback is the real business name, not a placeholder.

The same commit added the social links, and the commit message does not bury the
incidental discovery:

> This also wires the footer to settings/showroom at last: the phone, address
> and hours had been hardcoded placeholders since the layout was built, and were
> reading 'العنوان هيتحدد من لوحة التحكم' to real visitors.

#### 5. What would have happened in production

It **did** reach production. This is the only defect in Part 3 that was live on
the deployed site rather than caught before deploy.

The consequences are commercial rather than technical:

- A visitor wanting to phone the showroom gets a fake number. There is no
  fallback path — the footer is where people look for a phone number.
- The site tells its own customers, in Arabic, that its address has not been
  configured. To a visitor, that reads as an abandoned or unfinished business.
- Worst: the owner can enter their real address in the dashboard, save it,
  receive `تم حفظ الإعدادات`, and still see the placeholder on the site. They
  would have no way to diagnose that, and would reasonably conclude the admin
  panel does not work.

#### 6. The general lesson

**Class: temporary scaffolding with no mechanism for its own removal.**

Placeholders are a legitimate and valuable technique — CLAUDE.md prescribes them
and the project shipped faster because of them. The defect is not the
placeholder. **It is a placeholder with no forcing function.**

A placeholder needs one of these, or it becomes permanent:

1. **A marker that tooling can find.** `// TODO(settings): wire to
   settings/showroom` is greppable. `CI` can fail on `TODO` in `main`. A plain
   Arabic string is findable by nobody.
2. **A visible failure.** Rendering `⚠ PLACEHOLDER` or leaving the element out
   entirely makes the gap obvious. A placeholder that looks like real content is
   the dangerous kind, and this one looked exactly like real content.
3. **An entry in a list that is actually read.** CLAUDE.md gained a "Known debt"
   section in `0be8046` — but that was session 5, and the footer placeholder
   from session 1 was never added to it.

The sharpest version of the rule: **a placeholder that renders as plausible
content is a bug from the moment it is written.** Its indistinguishability is
the whole problem.

There is a second lesson about scope. Every session after the first had a
defined scope, and that discipline is defended in Part 1 as the reason the
project worked. This is its cost: **nothing outside the current scope gets
looked at, for as long as the scoping lasts.** The footer was in no session's
scope for nine sessions.

The mitigation is not to abandon scoping. It is to add one thing the phased
approach lacked: a **pass with no scope** — a walk through every page of the
running site, reading what is actually on the screen, before handover. That pass
would have found this in under a minute. It was never scheduled, and this defect
is what that omission cost.

---

## PART 4 — Performance, measured

Every number in this part comes from two measurement sessions on 2026-09-16:
session 4 (bundle splitting, commits `13f61b9` and `bdddb97`) and session 5
(the lazy LCP image, `a3a171d`). No performance measurement was taken after
that. The admin build, the Cloudinary images and all three hero redesigns came
later and **have not been measured**. §4.5 explains what that leaves unproven.

---

### 4.1 How the numbers were taken

The runner is [`scripts/dev/lighthouse-run.mjs`](scripts/dev/lighthouse-run.mjs),
added in `f3a5ec1`. Its settings, verbatim:

```js
/** Lighthouse's own mobile 4G preset: 1.6 Mbps down, 150ms RTT, 4x CPU. */
const config = {
  extends: 'lighthouse:default',
  settings: {
    formFactor: 'mobile',
    screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
    throttlingMethod: 'simulate',
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      requestLatencyMs: 562.5,
      downloadThroughputKbps: 1638.4,
      uploadThroughputKbps: 675,
      cpuSlowdownMultiplier: 4,
    },
    onlyCategories: ['performance'],
  },
};
```

It runs each path several times and reports the **median**. The reason is in
the file header:

> a single Lighthouse run on a laptop moves by 10-20% on its own, which is wide
> enough to invent an improvement that is not there.

Both sessions used five runs. In session 4 the old and new builds were **served
side by side at the same time** on two ports, so both sets of runs saw the same
machine load. Measuring "before" and then "after" an hour apart would compare
two different states of the laptop as much as two builds.

Two properties of the setup matter for everything below:

- **`throttlingMethod: 'simulate'`.** Lighthouse loads the page unthrottled and
  then *models* what a 4G phone would have seen. The numbers come from that
  model, not from a real slow connection. They are good for comparing two builds
  and not reliable as absolute predictions.
- **The local server does not compress.** [`src/server.ts`](src/server.ts) has no
  compression middleware, and `compression` is not in `package.json`. See §4.5.

---

### 4.2 The LCP phase model

Largest Contentful Paint is one number, but it is the sum of four consecutive
phases. Each phase has a different cause and a different fix, so the single
number alone doesn't tell you what to change.

```
navigation start
│
├── TTFB ─────────── until the first byte of the HTML arrives
│
├── Load Delay ───── until the browser *starts* requesting the LCP resource
│
├── Load Time ────── until that resource has finished downloading
│
└── Render Delay ─── until the element is actually painted
                                                         = LCP
```

| Phase | What makes it long | What shortens it |
|---|---|---|
| TTFB | Slow server, far-away region, heavy SSR work | Caching, a closer region, less work per request |
| Load Delay | The resource is found late: lazy, set from JS, or buried in CSS | `preload`, no `lazy`, `fetchpriority="high"`, put it in the HTML |
| Load Time | The resource is big, or the connection is slow | Smaller files, `f_auto`, a correct `srcset` |
| Render Delay | The resource is ready but the main thread is busy, or rendering is blocked | Less JS on the main thread, smaller hydration cost, no render-blocking resources |

Text LCP elements have no load phases. Their LCP is TTFB plus render delay,
which is why `/` and `/vehicles` behaved so differently in session 4 (§4.3).

This project's real phase numbers, for the LCP element on `/vehicles` (the first
vehicle card image), across three builds:

| Phase | Before splitting | After splitting (`13f61b9`+`bdddb97`) | Session-5 baseline | After lazy fix (`a3a171d`) |
|---|---|---|---|---|
| TTFB | — | — | 458 ms | 456 ms |
| Load Delay | 4163 ms | 1794 ms | 4226 ms | **335 ms** |
| Load Time | 2221 ms | 270 ms | 2537 ms | **176 ms** |
| Render Delay | 560 ms | **5604 ms** | 539 ms | **3827 ms** |
| **LCP** | 7777 ms | 8023 ms | 8401 ms | **5631 ms** |

TTFB was not recorded in the session-4 report, so those cells are blank rather
than guessed.

Look at the "Render Delay" row. Every improvement in the network phases was
partly given back as render delay. That pattern runs through the rest of this
part.

Note also that the session-5 baseline (8401 ms) is not the session-4 result
(8023 ms), even though no code changed between them that affects `/vehicles`.
The two sessions ran at different times on the same laptop. **That 5% gap is the
measurement noise floor**, and any difference smaller than it should be read as
no difference.

---

### 4.3 Bundle splitting: FCP improved, TBT got worse, and it was still right

#### What changed

Before `13f61b9`, `firebase.config.ts` imported the Firestore and Auth SDKs
eagerly, and `AnalyticsService` is injected by the public layout, so both SDKs
were in the initial chunk on every page. The commit moved every SDK import behind
`import()` (§0.7).

From the commit message:

> Initial chunk 959.24 kB -> 415.40 kB raw, 243.90 kB -> 106.69 kB transfer,
> which also puts it back under the 500 kB budget.

Firestore (557.97 kB raw) and Auth (128.83 kB raw) became separate lazy chunks.
The budget is the one in [`angular.json`](angular.json):
`"maximumWarning": "500kB"` for the initial bundle.

#### The measurements

Median of 5, mobile 4G, both builds served at once:

| `/` | before | after | change |
|---|---|---|---|
| Performance score | 61 | 73 | +12 |
| LCP | 7279 ms | 4613 ms | −2666 ms (−37%) |
| **TBT** | **54 ms** | **161 ms** | **+107 ms** |
| FCP | 6017 ms | 3466 ms | −2551 ms (−42%) |

| `/vehicles` | before | after | change |
|---|---|---|---|
| Performance score | 61 | 67 | +6 |
| LCP | 7777 ms | 8023 ms | +246 ms (within noise) |
| **TBT** | **62 ms** | **148 ms** | **+86 ms** |
| FCP | 5870 ms | 3536 ms | −2334 ms (−40%) |

Total JavaScript downloaded went **up**, from 902 kB to 949 kB. Splitting code
into chunks adds some duplication and loader code, about 47 kB here.

The session-4 instruction was: *"If the refactor doesn't measurably improve LCP
or TBT, say so — don't keep it for its own sake."* Measured against that: TBT got
worse on both pages, and LCP improved on one page only. That is a partial pass,
and the session report said so.

#### Why FCP improved

Before the split, the browser had to download, parse and run about 960 kB of
JavaScript before it could paint the first frame. Firestore was part of that
work, and on a 4× slower CPU the work happened *before* first paint. Moving
Firestore out of the initial chunk removed it from the path to first paint, so
FCP dropped by about 2.5 seconds on both pages.

The session-4 trace confirmed the order: **first paint at 452 ms, Firestore chunk
requested at 517 ms**, after the paint, not before it.

#### Why TBT got worse

Total Blocking Time is not "all the blocking work on the page". It counts only
long tasks (anything over 50 ms, minus the first 50 ms) that happen **between
FCP and Time to Interactive**.

Before the split, the Firestore work ran *before* FCP, outside that window, so
TBT did not count it at all, while it delayed FCP by 2.5 seconds. After the
split, FCP happens early, and the Firestore chunk is parsed later, *inside* the
window. The work didn't grow. It moved into the part of the timeline that TBT
measures.

This is why the two metrics moved in opposite directions. It is mostly a
bookkeeping change, and the total JS increase shows that no work was actually
removed.

#### The part the commit message doesn't show

The lazy import **on its own made `/` worse**, not better. With only `13f61b9`,
LCP on `/` was **7703 ms**, up from 7279 ms. The visit counter was the one public
caller that needed Firestore, and it ran right after render, so the 558 kB chunk
now downloaded and parsed exactly while the page was hydrating.

`bdddb97` fixed that by waiting for `requestIdleCallback` before loading the SDK
(with a 5-second timeout and a 2-second `setTimeout` fallback where the API is
missing, as in `analytics.service.ts`). That change is what took `/` from
7703 ms to 4613 ms.

The general point: **splitting code only helps if the split-off code is also
loaded later.** A lazy chunk that is requested immediately is an eager chunk with
an extra network request.

#### Why `/` improved and `/vehicles` didn't

At the time of session 4 the two pages had different LCP elements.

- On `/`, the LCP element was **hero text**. Text needs no download, so its LCP
  depends on when the main thread can render it. Removing 550 kB from the path to
  first render moved it directly.
- On `/vehicles`, the LCP element was a **card image**. The split cut its load
  delay (4163 → 1794 ms) and load time (2221 → 270 ms) exactly as intended, but
  render delay rose from 560 ms to 5604 ms. The image was ready long before the
  busy main thread could paint it, and the net result was no change.

(The load-time drop from 2221 to 270 ms is larger than a smaller bundle alone
would explain. Under simulated throttling, a smaller initial download frees the
modelled connection sooner. It is a modelling effect as much as a real one; see
§4.5.)

#### Why it was still the right call

The decision was to keep the split, for three reasons that don't rely on
Lighthouse's arithmetic:

1. **Every visitor downloads 107 kB of JavaScript before anything runs, instead
   of 244 kB.** That is a transfer-size fact, not a model output, and it matters
   most on the prepaid mobile data plans common among this site's audience.
2. **FCP improved about 40% on both pages**, well above the noise floor.
3. **TBT stayed under 200 ms**, Lighthouse's "good" threshold for mobile. It got
   worse, but it didn't cross the line where it starts to count against the page.

It is still a judgement call. The session report offered
`git revert 13f61b9 bdddb97` as a clean undo, and that remains true.

---

### 4.4 Fixing the lazy LCP image moved the bottleneck; it didn't remove it

Part 3 §3.6 covers the defect. This section is about what the numbers say
afterwards.

Session 5, `/vehicles`, median of 5:

| | before | after | change |
|---|---|---|---|
| Performance score | 68 | 71 | +3 |
| **LCP** | **8401 ms** | **5631 ms** | **−2770 ms (−33%)** |
| TBT | 113 ms | 119 ms | +6 ms (noise) |
| FCP | 3326 ms | 3317 ms | no change |

With the phases from §4.2:

```
before   TTFB 458 │ Load Delay 4226 ─────────────── │ Load 2537 ──────── │ Render 539 ─ │  = 8401
after    TTFB 456 │ 335 │ 176 │ Render Delay 3827 ────────────────────────── │            = 5631
```

The lazy attribute was worth about 3.9 seconds of load delay. Removing it let the
image start downloading almost immediately and finish in 176 ms. **But render
delay went from 539 ms to 3827 ms.** The image now arrives long before the page
can paint it.

What that means:

- **LCP on `/vehicles` is now limited by the main thread, not by the network.**
  Another network optimisation (preconnect, a smaller image, a CDN change) cannot
  improve this number much, because none of them shortens render delay.
- The main thread is busy with the initial JavaScript: parsing and running the
  415 kB chunk under a 4× CPU slowdown, then hydrating the page. The phase data
  shows that the paint waits. **The session didn't record a trace attributing the
  delay to specific tasks**, so "hydration is the cause" is the likely
  explanation, not a proven one.
- The next lever is less JavaScript on the main thread before the first paint of
  the grid: smaller hydration (for example `@defer` on the filter panel, or
  incremental hydration), or removing Firestore from the public site entirely
  (CLAUDE.md §7, the REST visit counter). None of these was measured.

The general lesson from §3.6 applies: **once a fix works, check which phase is
now largest, because that phase needs a different kind of fix.**

---

### 4.5 What these numbers do not prove

Performance numbers are easy to over-read. Everything below limits what Part 4
can claim.

**The test server did not compress.** Lighthouse saw 902 kB and 949 kB of
JavaScript on the wire. Vercel serves the same files gzip- or brotli-compressed,
closer to the 244 kB and 107 kB transfer sizes the build reports. So the
absolute download times are pessimistic, and **the FCP improvement will be
smaller in production** than measured here, because the bytes it removed are
cheaper over a compressed connection. The direction of the change holds, but the
size is overstated.

**TTFB is not production TTFB.** 458 ms is Lighthouse's model of a 150 ms-RTT
connection to a local server. Production adds a Vercel function (possibly a cold
start) and a Firestore round trip from Vercel's region to the Firestore region
(§0.3). Neither was measured. On a cold start, TTFB could plausibly exceed every
other phase combined.

**The images were placeholders.** Sessions 4 and 5 both ran before the first
Cloudinary upload (session 6). Every vehicle and hero image was a small
`placehold.co` PNG from an external host. The 176 ms load time in §4.4 is the
load time of a placeholder, not of a Cloudinary-transformed photograph of a truck.

**Nothing after session 5 was measured.** That includes:

- the admin build (it is lazy and client-rendered, so it shouldn't affect public
  pages, but that was not checked);
- the real Cloudinary images and their `srcset`;
- the art-directed mobile hero with two `preload` links (`139a937` onward);
- the third category section on `/vehicles` (`8687e3c`);
- the footer's new dependency on `settings/showroom` (`da6cf43`).

Some of these could have regressed LCP on `/` specifically. The hero changed
three times after its last measurement.

**Simulated throttling is a model.** It is consistent, which makes it good for
comparing builds, but it isn't a phone. A mid-range Android on a real Egyptian 4G
network behaves differently: variable latency, background load, thermal limits.

**One machine, one browser engine.** All runs used headless Chrome on the same
Windows laptop. Safari (the browser in §3.9) was never measured.

**There is no field data.** Chrome UX Report data needs real traffic, which the
site didn't have. Every number here is lab data. Google ranks on field data.

**Only two pages.** The vehicle details page, the page that carries the WhatsApp
button, was never run through Lighthouse.

What the numbers *do* support:

- The initial transfer size fell from 244 kB to 107 kB. That comes from the build
  output, not from a model.
- The lazy LCP defect cost about 3.9 seconds of load delay under simulated 4G.
  The size of that effect is far beyond the noise.
- On `/vehicles`, after `a3a171d`, the main thread is the limiting factor, not the
  network.
- Code splitting shifted JavaScript work past first paint rather than removing
  it.

To make these claims about production, the next measurement should be taken
against the deployed Vercel URL, on the details page as well as `/` and
`/vehicles`, with a performance trace saved for the render-delay analysis.

---

## PART 5 — What is still wrong

This part lists what a careful reviewer would find. It is ordered by
consequence, not by how easy each item is to fix.

---

### 5.1 What a senior reviewer would flag first

**1. There are no tests.** `package.json` defines `"test": "ng test"`. The
repository contains **zero** `.spec.ts` files. Every correctness claim in this
book comes from manual or scripted checks of the running app, and none of it runs
again automatically.

This matters more than usual here, because several Part 3 bugs are exactly the
kind a small test catches:

| Bug | The test that would have caught it |
|---|---|
| §3.2 guard | A guard test: sign in, then navigate. About 15 lines. |
| §3.4 pipe | A component test rendering a card with `priceOnRequest: true`. |
| §3.7 `NaN` | A unit test for `countByCategory` with one vehicle per category. |
| §3.1 `PendingTasks` | An SSR test asserting the rendered HTML contains a vehicle title. |

The biggest gap is the **security rules**. `firestore.rules` is the only security
boundary in the system (§2.1), and it has no tests. The Firebase emulator
supports rules unit tests (`@firebase/rules-unit-testing`) that check things like
"an anonymous client cannot set `views` to 2" or "a signed-in user without an
`admins` doc cannot create a vehicle". Every claim about the rules in §0.8 is
based on reading them, not on running them.

**2. Image uploads are open to anyone, and the IDs needed to clean up are thrown
away.** §0.15, §0.17, §2.6. Anyone can upload to `qzbv9p86` with the public
preset. Every uploaded asset's `public_id` is dropped, so deleted vehicles leave
their images in Cloudinary permanently, and replacing the hero leaves the old
image behind too. The fix is one signed-upload endpoint and a `publicIds` field
on `Vehicle`. That needs a server, which this project doesn't have.

**3. Vehicle writes are not validated on the server.** §2.4. The rule for
`vehicles` checks *who* is writing, never *what* they write. Any signed-in admin
(or any code running with that session) can store a malformed document, and
`toVehicle()` has to defend the read path against it. That's acceptable with one
trusted writer and becomes a real problem as soon as there are two.

**4. The README is still the Angular CLI default.** [`README.md`](README.md) is
the 59-line file `ng new` generates ("This project was generated using Angular
CLI version 21.2.24…"). The original brief's last section, §17, required a
handover README covering routes, collections, environment values, Cloudinary and
Firebase setup, run and deploy commands, and "the exact list of real showroom
values the owner still needs to supply." **That README was never written.** Part
0 of this book covers most of it, but this book is internal, and the owner (or
whoever takes over the project) needs its own document.

**5. Missing and sold vehicles return HTTP 200 (soft 404s).**
`VehicleService.getPublic()` returns `null` for a missing, sold or hidden vehicle,
and the details page shows its empty state. Nothing in `src/app` sets a response
status: there's no `RESPONSE_INIT` and no `status = 404`. Nothing sets a
`noindex` robots meta tag either. The results:

- Google indexes sold vehicles' URLs as live pages with "not found" content,
  which Search Console reports as soft 404s.
- A vehicle link the owner pasted into WhatsApp before the sale still unfurls
  with whatever preview the platform cached, then opens an empty page.

The fix is to inject `RESPONSE_INIT` on the server, set `status: 404` when the
vehicle is `null`, and add `noindex`.

**6. The API-key and Cloudinary referrer restrictions are unverified.** §0.2,
§0.15. Both are console settings that take minutes. Nothing in the repository or
the session record shows either was applied.

---

### 5.2 Known debt already recorded in CLAUDE.md

[`CLAUDE.md`](CLAUDE.md) §7 lists two items. They are repeated here with their
current status.

**The `transfer-codec.ts` timestamp substitute.** Transferred `createdAt` and
`updatedAt` values are `TransferredTimestamp` instances, not SDK `Timestamp`s.
`instanceof Timestamp` is false for them and `toInstant()` doesn't exist. CLAUDE.md
calls this *"safe while nothing reads `createdAt` / `updatedAt` on a transferred
document."* That is still true today, as far as the templates show, but nothing
enforces it. The first person to write `vehicle.createdAt.toDate()` in a public
template will get the substitute and it will work. The first to write
`instanceof Timestamp`, or to pass a transferred vehicle back into a Firestore
write, will not. There is no test for this either (§5.1 item 1).

Note that `toVehicle()` in `vehicle.service.ts` *does* use
`data['createdAt'] instanceof fs.Timestamp`. That's safe, because it runs on
freshly read Firestore data and never on transferred data, but it's exactly the
kind of check that would silently fail if someone reused it on the client.

**The visit counter keeps Firestore on the public site.** About 558 kB (raw) is
downloaded by every first-time visitor to add 1 to two counters. `bdddb97` pushed
the download past first paint, but §4.3 shows that the parse cost still lands in
the TBT window. A `fetch` to the Firestore REST `commit` endpoint with an
`increment` field transform would remove the SDK from the public site entirely.
Not done.

---

### 5.3 Defects found while writing this book

These were found by reading the code for this book. None has been fixed. This
book changes no source file.

**A misplaced doc comment in `environment.ts`.** Two JSDoc blocks sit on top of
each other above `siteUrl`:

```ts
  /**
   * Fallback only. The live number comes from `settings/showroom` so the owner
   * can change it without a deploy — never read this from a component.
   */
  /**
   * Last-resort origin for canonical URLs and the sitemap. …
   */
  siteUrl: 'https://al-andalus-vehicles.vercel.app',
```

The first block describes `whatsappNumber`, which comes later in the file with no
comment of its own. Editors and TypeScript attach only the nearest JSDoc, so the
warning *"never read this from a component"* is attached to nothing. It is the
one rule about `whatsappNumber` that CLAUDE.md treats as a hard requirement.

**The `UploadedImage` JSDoc is wrong.** It says *"Only `secureUrl` and `publicId`
are stored in Firestore."* `publicId` isn't stored anywhere (§0.17).

**`srcset` requests upscaled images.** `CloudinaryService.transform()` adds
`w_N` without `c_limit`, so a request for `w_1600` from a narrower source
upscales it. §0.14 shows the measured result: a larger file with no added
detail. The fix is to add `c_limit` to the transformation string.

**The vehicle card depends on an unenforced data rule.** §3.4. The card shows
`vehicle().price | egpPrice` and relies on `priceOnRequest: true` always meaning
`price === null`. The form keeps that rule. Firestore doesn't. `seo.service.ts`
and `whatsapp.service.ts` both check `priceOnRequest` explicitly; the card
doesn't.

**`/sitemap.xml` and `/robots.txt` trust the request's host header.** In
[`src/server.ts`](src/server.ts), `originOf()` builds the origin from
`x-forwarded-host` or `host`, and both routes are Express handlers registered
*before* the Angular engine. As far as this file shows, those routes are not
covered by the `security.allowedHosts` check from §0.19. A request with a forged
host gets a sitemap full of URLs on the forged host. The sitemap response is
marked `Cache-Control: public, max-age=600`. Vercel's CDN includes the host in
its cache key, which probably limits this to the attacker's own response. That
is an assumption about Vercel, not a verified fact. The fix is to validate the
host against the same allowlist or use `environment.siteUrl`.

**The sitemap query is a second copy of `listPublic()`.** `server.ts` creates a
separate Firebase app (`al-andalus-sitemap`) and runs its own
`where('status', 'in', …)` + `orderBy('createdAt', 'desc')` query. Any change to
the public-visibility rule now has to be made in two places, and the second place
is outside `src/app`.

**Unhashed static files are cached for a year.** `express.static(browserDistFolder, { maxAge: '1y' })`
applies to everything in the browser output, including `favicon.ico` and the five
fonts under `public/fonts/`, which have fixed names. If a font file is ever
replaced, returning visitors keep the old one for up to a year. On Vercel, static
files may be served by the platform with its own headers rather than by this
Express handler. Which one applies in production wasn't checked.

**The daily analytics docs are written but never read.** Every visit writes to
`analytics/daily_YYYY-MM-DD`. Nothing in `src/app` reads a daily doc; the
dashboard reads only `analytics/total`. The daily IDs also use each *visitor's*
local timezone (`dailyDocumentId()` uses `getFullYear()` / `getMonth()` /
`getDate()`), so a daily breakdown built later would mix timezones. Right now
this is one extra write per visit for data nobody uses.

**The comments disagree on the SDK size.** `firebase.config.ts` says *"roughly
460kB of Firestore and Auth"*, `transfer-codec.ts` says *"~460kB of Firestore"*,
and CLAUDE.md §7 and `analytics.service.ts` say *"~550kB"*. The build reported
557.97 kB raw for the Firestore chunk alone. The 460 figure is wrong.

**CLAUDE.md is partly out of date.**
- §5 *Images* still says `loading="lazy"` *"everywhere except the hero"*. Since
  `a3a171d`, the first cards of the first grid section are eager, and the first
  card has `fetchpriority="high"`.
- §1 still describes the stock as *"نص نقل / ربع نقل pickups"*. `248c5f1` renamed
  the label to ربع نقل and added a minibus category, which CLAUDE.md doesn't
  mention.

Because CLAUDE.md is loaded at the start of every session, stale statements in it
are more dangerous than stale statements anywhere else: they get followed.

**A leftover test upload in Cloudinary.** `al-andalus/e2c4bnvfv001wth5izij`,
uploaded during the session-6 end-to-end check, was never deleted. It has to be
removed from the Cloudinary console, because the app can't delete assets (§0.17).

**Every admin failure shows the same message.** Every failed write shows
`حصلت مشكلة، حاول تاني`. A permission failure (missing `admins/{uid}`, §0.20), a
network failure and a malformed document all look identical to the owner. The
Firebase error code is available in the `catch` block and is discarded.

---

### 5.4 Paths that were never exercised

These are cases where the code may well be correct, but nobody has run it.

- **A signed-in user who isn't an admin.** §2.3 describes what *should* happen
  (the dashboard loads, stats show 0, every save fails with a generic toast).
  Nobody has signed in with such an account.
- **Firestore unreachable during SSR.** `transfer-cache.service.ts` releases its
  pending task in `.finally()`, so a failed read shouldn't hang the render (§3.1).
  The error-state path of a server-rendered page has never been triggered.
- **An upload that fails or is cancelled partway.** `CloudinaryService.upload()`
  handles `error` and `abort`, and the form has per-file progress. Nobody has
  tested a dropped connection mid-upload, or pressing save while an upload is
  still running.
- **Two admin sessions editing the same vehicle.** `update()` uses `updateDoc`
  with no version check. The last write wins silently. There's only one admin
  today, but the owner using a phone and a laptop at once counts as two sessions.
- **`npm run seed -- --force`.** It appends. Running it twice doubles the sample
  inventory, and there's no teardown (§0.10).
- **Production SSR on the live domain.** `allowedHosts` includes `.vercel.app`,
  and the SSR checks in §0.19 were run locally. The session record doesn't show
  the same `curl` check being run against the deployed URL. Adding a custom domain
  without adding it to `allowedHosts` would silently fall back to client
  rendering.
- **The final mobile hero on a real phone.** §3.9 exists because emulation at
  390×844 missed a real-iOS bug. The final version (`1e3da03`) was checked at
  390×664 and 390×844, which is the right fix to the method, but still emulation.
  The session record doesn't show a real-device check after it.
- **Accessibility.** The spec requires focus rings, 44 px touch targets and
  `role="status"` on toasts, and the code follows those rules. No automated
  accessibility audit (axe, or Lighthouse's accessibility category, which the
  runner turns off with `onlyCategories: ['performance']`) and no screen-reader
  test was run.
- **Browsers other than Chromium.** Every automated check used headless Chrome.
  Safari was seen only through one user-provided screenshot. Firefox was never
  used.

---

### 5.5 What the process got wrong

Part 1 argues the phased approach worked. These are its weaknesses, stated as
plainly.

**No session had "look at everything" as its scope.** §3.10's footer placeholder
stayed in place for nine sessions because each session was scoped to something
else. A single scope-free walkthrough of the running site before handover would
have caught it in a minute. None was scheduled.

**Verification checked the targets it was given, and the targets were sometimes
wrong.** 390×844 was the specified viewport, and it isn't what an iPhone shows
(§3.9). The lesson isn't that the checks were weak. The checks were
precise, and precision about the wrong viewport gave false confidence.

**Placeholders were allowed without a way to track them.** CLAUDE.md §6 says to
create "clearly-marked placeholders and keep going". The footer's placeholders
were plain Arabic sentences, not marked in any way a tool could find (§3.10).
The rule was reasonable. The follow-through was missing.

**The brief's final section was never done.** §17's README was the last item in
the specification, and it was skipped (§5.1 item 4).

**Performance measurement stopped too early.** It ended at session 5, before real
images, before the hero redesigns and before deployment. Part 4's claims are
bounded by that.

---

### 5.6 Suggested order of work

In rough order of value for effort, for whoever picks this up:

1. **Write the handover README** (brief §17). Owner-facing; blocks handover.
2. **Delete the leftover Cloudinary asset**, and **set referrer restrictions** on
   the Firebase API key and in Cloudinary. Minutes each.
3. **Fix the `environment.ts` and `UploadedImage` comments**, and bring
   **CLAUDE.md** up to date. Minutes; stops future sessions acting on wrong
   instructions.
4. **Return 404 plus `noindex`** for missing and sold vehicles.
5. **Add `c_limit`** to the delivery transformation.
6. **Add Firestore rules tests** with the emulator, then unit tests for the guard,
   `countByCategory` and the price pipe.
7. **Validate the sitemap host** against the allowlist.
8. **Measure again, against production**, including the details page, with a
   saved trace.
9. **Replace the visit counter with a REST `commit`** and remove Firestore from
   the public bundle (CLAUDE.md §7).
10. **Add a signed-upload endpoint and store `publicId`**, so deleting a vehicle
    can delete its images. This is the first item that needs a server, and it's
    where this project's serverless design runs out (§2.6, §2.9).
