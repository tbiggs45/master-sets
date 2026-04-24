# Master Sets — Pending Work

> Current state: Phase 1 complete. The app is a WKWebView shell (`ContentView.swift`) loading
> `index.html` (React + Supabase JS SDK + Tailwind via CDN). Storage is `localStorage` via a
> `window.storage` polyfill. Supabase URL/anon key and scan endpoint are injected by Swift at
> document start. A Node.js scan proxy (`backend/server.js`) exists locally but is not deployed.
> No entitlements file, no Info.plist privacy keys, no provisioning profile, and no Apple
> Developer account linkage exist yet.

---

## 1. Apple Developer Account Setup

**Status: Not started. Nothing in the Xcode project references a team ID or signing identity.**

- [ ] Enroll in the Apple Developer Program at developer.apple.com ($99/year) if not already enrolled
- [ ] In Xcode → Signing & Capabilities, set the **Team** to your enrolled Apple ID
- [ ] Decide on a permanent **bundle identifier** (e.g. `com.yourname.master-sets`) — this cannot be changed after App Store submission without losing reviews/ratings
- [ ] Register the App ID in the Apple Developer portal with the capabilities you will need:
  - [ ] Sign In with Apple
  - [ ] Push Notifications (future)
- [ ] Generate a **Distribution Certificate** (Apple Distribution) via Xcode or the developer portal
- [ ] Create an **App Store provisioning profile** linked to your bundle ID and distribution cert
- [ ] In Xcode Build Settings, confirm `CODE_SIGN_STYLE = Automatic` and select your team — Xcode will manage profiles automatically once signed in
- [ ] Create the app record in **App Store Connect** (Apps → +) with the same bundle ID before submitting any build

### TestFlight

- [ ] In App Store Connect, add yourself (and any testers) under the **TestFlight** tab as internal testers
- [ ] Archive the app in Xcode (Product → Archive) and upload to App Store Connect via the Organizer
- [ ] Fill in the **What to Test** field before distributing each build
- [ ] For external testers (public link), submit for Beta App Review — Apple reviews the first external build; subsequent builds with no capability changes skip review

---

## 2. App Store Submission Requirements

### Privacy Manifest (required as of Spring 2024)

Apple now requires a `PrivacyInfo.xcprivacy` file for apps that use certain APIs. Master Sets
uses camera access, `localStorage` (accessed via WKWebView's JavaScript bridge), and makes
network requests to Anthropic, Supabase, and the Pokémon TCG API.

- [ ] Create `Master Sets/Master Sets/PrivacyInfo.xcprivacy` and add it to the Xcode target
- [ ] Declare the following in the privacy manifest:
  - `NSPrivacyAccessedAPITypes` → `NSPrivacyAccessedAPICategoryUserDefaults` (reason: app reads/writes `UserDefaults` for API key and backend URL)
  - Camera usage (covered by `NSCameraUsageDescription` in Info.plist — see below)
  - Network access to third-party domains: `api.anthropic.com`, `*.supabase.co`, `api.pokemontcg.io`, `images.pokemontcg.io`, CDN hosts for React/Babel/Tailwind
- [ ] Declare whether user data is collected and linked to identity (select **No** if collection only goes to user's own Supabase account)

### Info.plist Privacy Keys

The project has no explicit `Info.plist` yet (Xcode 16 generates it from build settings). The
following keys **must** be present before any TestFlight or App Store build:

- [ ] `NSCameraUsageDescription` — **Missing.** Required because the app opens the device camera to scan cards. Example string: `"Master Sets uses your camera to scan Pokémon cards and identify them automatically."`
- [ ] `NSPhotoLibraryUsageDescription` — Add if users can pick card images from Photos. Example string: `"Master Sets can read a photo from your library to identify a card."`
- [ ] `NSPhotoLibraryAddUsageDescription` — Add only if the app saves images to Photos (likely not needed)

To add these: in Xcode select the Master Sets target → Info tab → add the rows, **or** add an
`Info.plist` file to the target with these keys and values.

### App Store Connect Listing

- [ ] Write an **app description** (up to 4000 chars) covering collection tracking, card scanning, price lookups, and cloud sync
- [ ] Write a short **promotional text** (up to 170 chars, can be updated without a new submission)
- [ ] Write **keywords** (100 chars, comma-separated) — e.g. `pokemon,tcg,card,collection,binder,scan,price,pokedex`
- [ ] Capture **screenshots** for every required device size:
  - iPhone 6.9" (iPhone 16 Pro Max) — required
  - iPhone 6.7" (iPhone 15 Plus) — required
  - iPad 13" — required if the app supports iPad
  - Use the Xcode simulator + XcodeBuildMCP `screenshot` tool or SimulatorKit
- [ ] Set the **age rating** — likely 4+ (no objectionable content); complete the age rating questionnaire in App Store Connect
- [ ] Set **primary category**: Games → Card Games, or Utilities → Reference (Utilities is the safer choice for a collection tracker)
- [ ] Set **secondary category**: Reference or Entertainment
- [ ] Set **support URL** and **marketing URL** (required fields)
- [ ] Confirm **price**: Free or paid; if free with no IAP, mark accordingly
- [ ] Set **copyright** line (e.g. `© 2026 Your Name`)

### Review Guidelines Compliance

- [ ] Camera permission must be requested at the point of use (when the user first taps Scan), not at app launch — verify the JS scan flow does this
- [ ] The app must work in **Demo Mode** without any personal account — it currently does (demo seed data is loaded automatically)
- [ ] Confirm no private API usage (only WKWebView, AVFoundation camera via browser API — should be fine)
- [ ] The Supabase anon key is embedded in `ContentView.swift` — this is acceptable (anon keys are public by design); ensure Supabase RLS policies protect user data

---

## 3. Sign In with Apple

**Status: Supabase JS auth exists in the React layer, but there is no native Apple auth bridge.
The `com.apple.developer.applesignin` entitlement is not present.**

Apps that offer any third-party login (Supabase email/OAuth) **must** also offer Sign In with
Apple per App Store Review Guideline 4.8. This is a hard requirement.

### Entitlement

- [ ] In Xcode → Signing & Capabilities → + Capability → **Sign In with Apple** — this auto-creates a `.entitlements` file and adds `com.apple.developer.applesignin = [Default]`
- [ ] Verify the entitlement file (`Master Sets.entitlements`) appears in the PBXBuildFile section of `project.pbxproj` (it will if added via Xcode UI)
- [ ] Enable **Sign In with Apple** on the App ID in the Apple Developer portal

### Native → JS Bridge

The current architecture injects credentials into the WKWebView via `WKUserScript`. The same
pattern should be used for Apple auth tokens.

- [ ] Add `ASAuthorizationController` flow in `ContentView.swift` (or a new `AppleAuthManager.swift`):
  1. User taps "Sign in with Apple" button (triggered from JS via `window.webkit.messageHandlers.appleSignIn.postMessage({})`)
  2. Swift presents the `ASAuthorizationAppleIDRequest` sheet
  3. On success, Swift receives `identityToken` (JWT) and `authorizationCode`
  4. Swift calls `webView.evaluateJavaScript("window.handleAppleSignIn('\(identityToken)')")`
- [ ] In the JS layer, `window.handleAppleSignIn(token)` calls `supabase.auth.signInWithIdToken({ provider: 'apple', token })`
- [ ] Register a `WKScriptMessageHandler` named `appleSignIn` in the WKWebView configuration so JS can trigger the native sheet
- [ ] Test the full round-trip: native sheet → token → Supabase session → JS UI update
- [ ] In the JS UI, hide any "Sign in with Apple" button that opens the browser OAuth flow — route it through the native bridge instead

---

## 4. iCloud Sync

**Status: All collection data is stored in `localStorage` inside the WKWebView sandbox.
This data is NOT backed up to iCloud and is siloed per device.**

### Current Storage

The `window.storage` polyfill in `index.html` wraps `localStorage`. Data keys include:
- `collection` — the full card collection JSON object
- `demoSeedVersion` — seed version guard
- `anthropic_api_key` / `scan_backend_url` — stored in native `UserDefaults`, not `localStorage`

### Option A — Supabase as Sync Layer (Recommended)

Supabase is already integrated. This approach requires no additional Apple entitlements.

- [ ] Design Supabase table schema (see Section 6 for details)
- [ ] On user sign-in: read `localStorage` collection, diff against Supabase, upload any cards missing from the server (migration)
- [ ] On app launch (authenticated): fetch collection from Supabase, write into `localStorage` as the local cache
- [ ] On any add/remove/quantity change: write to `localStorage` immediately (optimistic) and queue an upsert to Supabase
- [ ] Handle conflict resolution: use `scannedAt` / `updatedAt` timestamps, last-write-wins
- [ ] On sign-out: clear the local `localStorage` collection OR keep it as a local-only cache

### Option B — CloudKit (more effort, no backend)

- [ ] Add **iCloud** capability in Xcode → Signing & Capabilities → iCloud → CloudKit
- [ ] Create a CloudKit container (`iCloud.com.yourname.master-sets`) in the developer portal
- [ ] Store the collection as a `CKRecord` per card, synced via `NSPersistentCloudKitContainer` or direct `CKDatabase` calls
- [ ] Bridge CloudKit reads/writes to the JS layer via `evaluateJavaScript`
- **Not recommended** — Supabase is already partially wired in and works on Android/web too if you ever expand

### Migration Path (localStorage → Supabase)

- [ ] On first successful Supabase sign-in, read the full `collection` key from `localStorage`
- [ ] POST each card to the Supabase `cards` table using the JS Supabase client
- [ ] Show a one-time "Syncing your collection…" banner during migration
- [ ] After upload, set a `localStorage` flag (`cloudMigrated = true`) to skip on subsequent launches

---

## 5. Camera / Scan Without API Key

**Status: The app currently requires either a backend URL or an Anthropic API key before scanning works. Demo Mode skips scanning entirely. This is a major friction point for regular users.**

### The Problem

- Cold-launch users see a `key.slash.fill` icon (yellow) indicating no scan is configured
- Tapping the icon presents `APIKeyEntryView` asking for a backend URL or API key
- Most users will not have either — they will bounce

### Solution: Deploy the Backend and Bundle the URL

`backend/server.js` is a Node.js HTTP server that proxies image data to Anthropic's API. It is
ready to deploy — it only needs `ANTHROPIC_API_KEY` set as an environment variable and a
public HTTPS URL.

#### Step 1 — Deploy the Backend

- [ ] **Option A — Render.com (free tier):** Create a new Web Service, connect the repo, set root to `Master Sets/backend`, set `Build Command: npm install`, set `Start Command: node server.js`, add env var `ANTHROPIC_API_KEY=sk-ant-…`. Free tier spins down after inactivity (cold start ~15s). Suitable for TestFlight.
- [ ] **Option B — Railway.app:** Similar setup, slightly faster cold starts, $5/month hobby plan after free trial.
- [ ] **Option C — Cloudflare Workers:** Rewrite `server.js` as a Worker (uses `fetch` not `http` module — requires ~30 min of adaptation). Zero cold starts, generous free tier. Best long-term choice.
- [ ] Set `ALLOWED_ORIGIN` env var to your app's bundle ID or `*` — the WKWebView loads from `file://` so CORS is a non-issue in practice, but be explicit
- [ ] Confirm `/health` endpoint returns `{ ok: true, anthropicConfigured: true }` after deploy

#### Step 2 — Bundle the Default URL in the App

- [ ] In `ContentView.swift`, change the default value for `backendURL`:
  ```swift
  @State private var backendURL: String = UserDefaults.standard.string(forKey: "scan_backend_url")
      ?? "https://your-deployed-backend.onrender.com"
  ```
- [ ] This means scanning works immediately for all users with no setup
- [ ] The `APIKeyEntryView` can remain as an override for power users / self-hosters
- [ ] Update the placeholder text in `APIKeyEntryView` from `http://127.0.0.1:8787` to the live URL

#### Step 3 — Rate Limiting and Abuse Prevention

- [ ] Add a simple token bucket or per-IP rate limiter in `server.js` (e.g. 10 scans/min per IP)
- [ ] Consider requiring a Supabase JWT in the `Authorization` header so only authenticated users can hit the scan endpoint — reject anonymous scan requests to protect your Anthropic quota

---

## 6. Pending API Tasks

### Pokémon TCG API

- [ ] Register for a free API key at `pokemontcg.io/sign-up` — unauthenticated requests are rate-limited to ~1,000 requests/day; authenticated requests get 20,000+/day
- [ ] Inject the TCG API key via `ContentView.swift` the same way the Supabase keys are injected:
  ```swift
  let tcgKeyScript = WKUserScript(
      source: "window.POKEMONTCG_API_KEY = '\(tcgAPIKey)';",
      injectionTime: .atDocumentStart,
      forMainFrameOnly: true
  )
  ```
- [ ] Store the TCG key as a build-time constant in `ContentView.swift` (same pattern as `Supabase` enum) — it is not secret

### Supabase — Tables and RLS

- [ ] Create the following tables in your Supabase project (`guelnthdpipgvraylwom`):

  **`cards` table**
  ```sql
  create table cards (
    id          text not null,
    user_id     uuid references auth.users not null,
    name        text not null,
    set_id      text,
    set_name    text,
    number      text,
    rarity      text,
    image_url   text,
    market_price numeric,
    quantity    int not null default 1,
    scanned_at  timestamptz default now(),
    updated_at  timestamptz default now(),
    primary key (id, user_id)
  );
  ```

  **`profiles` table** (optional, for display name / preferences)
  ```sql
  create table profiles (
    id          uuid references auth.users primary key,
    display_name text,
    created_at  timestamptz default now()
  );
  ```

- [ ] Enable Row Level Security on all tables:
  ```sql
  alter table cards enable row level security;
  create policy "Users see own cards" on cards
    for all using (auth.uid() = user_id);
  ```
- [ ] Enable the **Apple** OAuth provider in Supabase Dashboard → Authentication → Providers → Apple — requires your Apple Services ID, Team ID, and private key

### Anthropic API

- [ ] The scan backend (`server.js`) already handles server-side proxying — this is the correct pattern; do not expose the Anthropic key client-side
- [ ] Monitor Anthropic usage in the console; set a spend limit / alert threshold
- [ ] Current model in `server.js`: `claude-sonnet-4-20250514` — verify this model ID remains valid; update if Anthropic deprecates it

---

## 7. Push Notifications (Future)

**Status: No APNs entitlement configured. Low priority — skip for TestFlight.**

- [ ] Add **Push Notifications** capability in Xcode → Signing & Capabilities
- [ ] Enable Push Notifications on the App ID in the developer portal
- [ ] Register for APNs in `Master SetsApp.swift` using `UNUserNotificationCenter`
- [ ] Upload the APNs key (`.p8` file) to Supabase Dashboard → Settings → Edge Functions (for server-triggered notifications)
- [ ] Design notification payloads for:
  - New Pokémon TCG set release alerts
  - Price spike alerts on cards in the user's collection
  - Collection value milestones
- [ ] Store the APNs device token in the `profiles` table after registration
- [ ] Implement a Supabase Edge Function or cron job that queries `pokemontcg.io` for new sets and fans out notifications

---

## 8. Before First TestFlight Build — Checklist

This is the minimum required to get a build into TestFlight and into testers' hands.

### Blocking (TestFlight will be rejected or crash without these)

- [ ] **Apple Developer account enrolled** and team set in Xcode Signing & Capabilities
- [ ] **Bundle ID registered** in the developer portal
- [ ] **`NSCameraUsageDescription`** added to Info.plist — Apple will reject any build that uses camera APIs without this key
- [ ] **Sign In with Apple capability** added (required by App Store guidelines 4.8 since the app has Supabase auth)
- [ ] **App icon** — Assets.xcassets has app icon images already; verify the 1024×1024 PNG (`app-icon-1024.png`) has no alpha channel (App Store Connect rejects icons with transparency)
- [ ] **Deployment target** set to a reasonable minimum — iOS 16.4+ recommended (that is when `WKWebView.isInspectable` was added; the `#if DEBUG` guard already handles this gracefully)
- [ ] **Archive succeeds** — run Product → Archive with no errors before uploading

### Strongly Recommended Before Sharing with Testers

- [ ] **Backend deployed** and default `backendURL` hardcoded in `ContentView.swift` so scanning works out of the box
- [ ] **`NSPhotoLibraryUsageDescription`** added if the scan flow allows image picker (check the JS scan implementation)
- [ ] **Demo Mode works end-to-end** — the `demoSeedVersion = v3` data seeds automatically; verify cards display, images load, and the collection value calculates correctly
- [ ] **Supabase `cards` table and RLS created** so that signed-in testers can actually sync their data
- [ ] **Pokémon TCG API key** registered and injected to avoid hitting the unauthenticated rate limit during testing
- [ ] **Privacy manifest** (`PrivacyInfo.xcprivacy`) created — technically required for App Store submission but does not block TestFlight internal distribution
- [ ] **App tested on a physical device** — WKWebView camera access, safe area insets, and localStorage persistence all behave differently on a real device vs. simulator

### Nice to Have Before External TestFlight

- [ ] Screenshots captured for App Store Connect listing
- [ ] App description and keywords written
- [ ] `ALLOWED_ORIGIN` on the scan backend tightened (not `*`)
- [ ] Per-user scan rate limiting on the backend
- [ ] Supabase Apple OAuth provider configured so Sign In with Apple round-trips correctly
