# KAISEN — Master Document · Personal Edition

**Architecture & Technical Design · Feature Technical Principles · Prototype Build Pack**

|  |  |
|---|---|
| **Owner** | Property of Alex Reid & KAISEN Ltd — **Not for distribution** |
| **Edition** | Personal Edition v2.0 (single user, no commercial rollout) |
| **Date** | 2 October 2026 |
| **Targets** | Windows 10/11 (x64) and Android (arm64, API 26+) |
| **Stack** | Supabase · Tauri v2 + Vite · Tailwind CSS · Rust (primary) · TypeScript (secondary) |
| **Source documents** | KAISEN Master Document v1.0 (Parts I and III), *Features (Draft)* PDF |

---

## 0. How to use this document with Claude Code

This file is written to be read by both a human and a coding agent. Every schema, command signature, and acceptance test is explicit so an agent can build from it milestone by milestone.

1. Create the repo. Put **`CLAUDE.md`** (supplied alongside this file) in the repo root and this file at **`docs/SPEC.md`**.
2. Open Claude Code in the repo and paste the kickoff prompt below.
3. Work **one milestone per session** (Part III, §35). Ask the agent to finish the milestone's acceptance tests before moving on.
4. When you change a decision, edit `docs/SPEC.md` first, then tell the agent to re-read it.

### Kickoff prompt (paste as the first message)

```text
You are building KAISEN, a personal, offline-first, end-to-end-encrypted note/quest app
for Windows and Android using Tauri v2 + Vite + React + Tailwind (TypeScript frontend),
Rust backend, and Supabase as the only cloud service.

Read CLAUDE.md and docs/SPEC.md fully before writing code. They are the source of truth.
Rules: follow the milestone order in SPEC §35; do not add dependencies outside the
allow-list in SPEC §2.3 without asking; all writes go through the Rust repository layer
(SPEC §6.5); never log plaintext user content or key material.

Start with Milestone M0 (risk spikes). For each spike, create a throwaway branch,
report the result in docs/SPIKES.md (pass/fail, evidence, decision), and stop for my review.
```

### Legend used throughout

| Marker | Meaning |
|---|---|
| ◆ **SPEC** | Comes from your feature PDF or your stated requirements. Committed scope. |
| ★ **SUGGESTION S##** | Added by me. **Not committed.** Every suggestion is collected in §34 so you can accept or reject each. |
| ⚠ **RISK** | Known technical risk or uncertainty. Each has a spike or mitigation. |
| 🔒 **SECURITY** | A security-relevant rule the build must satisfy. |
| ✅ **ACCEPTANCE** | A testable statement that defines "done". |

---

## Contents

**Project Brief** — scope, constraints, assumptions to confirm

**PART I — Architecture & Technical Design**
1. System overview
2. Final stack and dependency allow-list
3. Repository layout
4. Identity, 2FA (Proton Authenticator) and sessions
5. Encryption architecture
6. Local data layer
7. Sync engine (Windows ⇄ Android, offline editing)
8. Supabase backend
9. Connectivity and offline behaviour
10. OTA updates and release pipeline
11. Platform specifics: Windows and Android
12. Security hardening checklist
13. Performance and reliability targets

**PART II — Feature Technical Principles**
14. Feature conventions, app shell and navigation
15. Gatehouse (home)
16. Vault system
17. Library shell, files, tags, trash
18. Notes (rich text)
19. Canvas (standard and Advanced)
20. Codex (code snippets)
21. Board (Kanban)
22. Craft Room (templates)
23. Quests
24. Shop and Inventory
25. Journey (Quests, Timeline, Analytics)
26. Profile
27. Settings, shortcuts, accessibility
28. Search and command palette
29. Theme system
30. Export, import and backup
31. In-app roadmap and feedback
32. Notifications
33. Interconnectivity (events, edges, transactions, cascades, repair)
34. Registry of suggestions (★)

**PART III — Prototype Build Pack**
35. Milestones and acceptance tests
36. Test strategy
- Appendix A — Local SQLite schema (`0001_core.sql`, `0002_suggested.sql`)
- Appendix B — Supabase SQL (`0001_sync.sql`)
- Appendix C — Rust command surface
- Appendix D — Configuration files (Cargo, npm, Tauri, capabilities, CSP)
- Appendix E — Release workflow skeleton
- Appendix F — Sync scenario test list

---

# PROJECT BRIEF

## B1. Scope

| In scope | Out of scope (removed from the business edition) |
|---|---|
| One user (you), two or more of your own devices | Billing, pricing tiers, Subscribe-to-Own, Paddle |
| Windows + Android, fully editable offline, automatic sync | Teams, sharing, multi-user vaults |
| End-to-end encryption, Supabase 2FA with Proton Authenticator | Analytics, error-monitoring SaaS, email campaigns |
| Over-the-air updates when you push code | Code-signing certificates for distribution, app stores |
| All features in your PDF (Library, Craft Room, Quests, Shop, Journey, Profile, Settings) | Hiring plan, marketing, support desk, revenue model |

## B2. Hard constraints ◆ SPEC

1. Cloud = **Supabase only** (Auth, Postgres, Storage, Realtime). No other hosted service.
2. Client = **Tauri v2 + Vite + Tailwind CSS**. Primary language **Rust**, secondary **TypeScript**.
3. **Windows and Android must sync and be fully editable offline.**
4. **2FA via Proton Authenticator** (standard TOTP, enforced server-side).
5. **Encryption** of data at rest on device and in the cloud.
6. **OTA updates** when the codebase is edited and pushed.
7. **No AI features whatsoever.**
8. Data model keyed to a single immutable **user UUID** (Supabase `auth.users.id`).

## B3. Assumptions and open questions (please confirm)

| # | Item | What I assumed | Why it matters |
|---|---|---|---|
| Q1 | **React** | Your new stack line says "Tauri + Vite". I kept **React** as the UI layer (it was in your original stack). | TipTap, tldraw and dnd-kit are React libraries. Dropping React changes the editor and canvas choices. |
| Q2 | **File types** | Your PDF says "five different file types" but lists four: Note, Canvas, Kanban Board, Codex. I implement **four**. | Is there a fifth? |
| Q3 | **Export formats** | The PDF has a blank "export as ()". I propose Markdown, HTML, plain text, JSON, PDF (see §30). | Confirm the list. PDF on Android is non-trivial. |
| Q4 | **Template "visibility"** | With one user, I reinterpret *visibility* as **Shown / Hidden** in quick-create menus. | The business edition meant shared/private. |
| Q5 | **Android floor** | API 26 (Android 8.0) minimum, arm64 devices. | Affects the Keystore and notification APIs. |
| Q6 | **Windows ARM** | Not targeted. x64 only. | Easy to add later. |
| Q7 | **Canvas licence** | ⚠ My v1.0 document called tldraw "MIT". I should correct that: current tldraw SDK versions use a custom licence and show a watermark without a licence key. A free non-commercial tier exists, but **verify at tldraw.dev before committing** (spike S5). | A licence surprise late in the build is expensive. Canvas is wrapped behind an interface so it can be swapped. |
| Q8 | **Journey "Timeline"** | You asked for suggestions. I propose a Quest-Log vertical journey (§25.3) as ★ S14. | Choose the minimal list timeline or the richer journey map. |

## B4. Corrections to my earlier documents

| Earlier statement | Correction |
|---|---|
| PowerSync as the sync engine | Dropped. It requires queryable plaintext columns, which defeats end-to-end encryption, and it is outside your "just Supabase" stack. A custom sync engine over one Supabase table replaces it (§7). |
| `tauri-plugin-sql` for SQLite | Dropped. The Rust core owns the database directly (rusqlite + SQLCipher). The plugin does not give you SQLCipher or a controlled write path. |
| End-to-end encryption as a "v2 feature" | Promoted to **v1 default**. For one user there is no key-sharing problem, so it is cheap to do now and painful to retrofit. |
| tldraw "MIT-licensed" | See Q7. |
| "Semantic search with a local model" suggestion | Withdrawn. It conflicts with your "no AI whatsoever" rule. |

---

# PART I — ARCHITECTURE & TECHNICAL DESIGN

## 1. System overview

### 1.1 Architecture at a glance

```text
┌──────────────────────── WINDOWS (Tauri v2) ────────────────────────┐   ┌──────────────── ANDROID (Tauri v2) ────────────────┐
│  WebView2: React + TS + Tailwind  (UI, editors, network orchestration) │   │  System WebView: same React app, mobile layout      │
│        ▲  invoke()/events (IPC, typed)                              │   │        ▲  invoke()/events                           │
│        ▼                                                            │   │        ▼                                            │
│  Rust core: services · repo · crypto · HLC · merge · FTS · export   │   │  Rust core: identical crate                         │
│        ▼                                                            │   │        ▼                                            │
│  SQLCipher DB (kaisen.db, AES-256)  +  encrypted attachment files   │   │  SQLCipher DB + encrypted attachment files          │
└───────────────┬─────────────────────────────────────────────────────┘   └──────────────────┬──────────────────────────────────┘
                │  HTTPS (ciphertext only)                                                    │
                ▼                                                                             ▼
        ┌────────────────────────────── SUPABASE ───────────────────────────────┐
        │ Auth (+TOTP MFA, AAL2)  ·  Postgres: sync_records, user_keys (RLS)     │
        │ Storage: attachments (private, encrypted blobs) · releases (public)    │
        │ Realtime: "something changed" nudges                                   │
        └───────────────────────────────────────────────────────────────────────┘
                ▲
                │ CI uploads signed builds + latest.json
        ┌───────┴───────────┐
        │ Your dev machine  │  git push → build Windows + Android → publish
        └───────────────────┘
```

### 1.2 Responsibility split (the single most important design rule)

| Concern | Lives in | Why |
|---|---|---|
| Database, migrations, queries | **Rust** | One trusted owner of data. Same code on both platforms. |
| Encryption, key handling, hashing | **Rust** | Memory-safe, `zeroize`, keys never enter JavaScript. |
| Cross-feature transactions (complete quest → gold → next recurrence) | **Rust** | Atomic, testable without a UI, identical on both platforms. |
| Sync merge logic, HLC clock, conflict copies | **Rust** | Deterministic, unit- and property-testable. |
| Full-text search, export, backup | **Rust** | Needs plaintext + DB access. |
| UI, rich editors, charts, drag and drop | **TypeScript/React** | Where the ecosystem is. |
| Auth session, MFA UI, network calls to Supabase, Realtime | **TypeScript** (`supabase-js`) | Battle-tested auth/MFA/realtime; one session owner. |
| Moving ciphertext between Rust and Supabase | **TypeScript (opaque bytes)** | 🔒 Plaintext and keys never cross into the network layer. |

> ◆ **SPEC** — Primary language Rust, secondary TypeScript. In this design Rust holds all business logic and security. TypeScript is a thin UI and transport layer.

### 1.3 Data flow for any user action

```text
UI event → invoke("quest_complete") → Rust command (validate) → Service (one SQLite transaction)
   → repo.write(): row update + outbox entry + search reindex + domain events
   → commit → emit "kaisen://changed" → TanStack Query invalidates → UI re-renders
   → (background) sync loop: outbox → encrypt → supabase push → pull → decrypt → merge
```

---

## 2. Final stack and dependency allow-list

### 2.1 Stack ◆ SPEC

| Layer | Choice | Notes |
|---|---|---|
| Shell | **Tauri v2** | Windows and Android targets from one codebase. |
| Build | **Vite** | React + TypeScript template. |
| Styling | **Tailwind CSS** | v4 CSS-first config (`@theme`) driven by CSS variables (§29). |
| Primary language | **Rust** | Cargo workspace, `src-tauri`. |
| Secondary language | **TypeScript** | Strict mode. |
| Cloud | **Supabase** | Auth, Postgres, Storage, Realtime. |
| Local DB | **SQLite + SQLCipher** via `rusqlite` | Owned by Rust. |

### 2.2 Why not the other options I earlier suggested

| Dropped | Reason |
|---|---|
| PowerSync / ElectricSQL | Need plaintext columns; outside "just Supabase"; E2EE incompatible. |
| Paddle, Sentry, Plausible, Resend | Business-only services. Errors go to a local log file (§12). |
| Zod | Rust `serde` validates at the IPC boundary. Types are generated from Rust (★ S09). |
| `tauri-plugin-sql` | Rust owns the DB. |

### 2.3 Dependency allow-list

> The agent may only add dependencies from this table without asking. "Library" means code bundled into the app; it is not a service.

**Frontend (npm)**

| Package | Purpose | Status |
|---|---|---|
| `react`, `react-dom`, `react-router` | UI and routing | Required |
| `@tauri-apps/api` + plugins (Appendix D) | IPC and native APIs | Required |
| `@supabase/supabase-js` | Auth, MFA, REST, Realtime, Storage | Required |
| `@tanstack/react-query` | Cache and invalidation over `invoke()` | Required (it is in your original stack; it now caches local Rust queries, not network data) |
| `zustand` | Small UI state (modals, sidebar, active vault) | Required |
| `@tiptap/*` (react, pm, starter-kit, extensions) | Notes editor | Required |
| `tldraw` (or fallback, see Q7) | Canvas | Required, **licence gate at M0** |
| `@codemirror/*` | Codex editor | Required |
| `@dnd-kit/*` | Drag and drop (Board, lists, builders) | Required |
| `clsx`, `tailwind-merge` | Class composition | Required |
| `fractional-indexing` or Rust equivalent | Order keys (§6.6) | Required (one of the two) |
| `recharts` | Analytics charts | Optional (hand-rolled SVG is acceptable) |
| `canvas-confetti` | Quest completion effect | Optional |
| `vitest`, `@testing-library/react`, `eslint`, `prettier`, `typescript` | Dev tooling | Required (dev) |

**Rust (Cargo)**

| Crate | Purpose |
|---|---|
| `tauri` v2 + plugins: `dialog`, `notification`, `clipboard-manager`, `opener`, `os`; desktop-only: `updater`, `process` (restart after update), `global-shortcut`; mobile-only: `biometric` (phase 2). The `fs` plugin is deliberately **not** used: Rust does all file I/O, so the WebView has no filesystem access | Shell and native APIs |
| `rusqlite` with features `bundled-sqlcipher-vendored-openssl`, `functions`, `backup` | Encrypted SQLite |
| `argon2`, `chacha20poly1305`, `hkdf`, `sha2`, `rand`, `zeroize`, `subtle` | Cryptography |
| `uuid` (features `v4`, `v5`, `v7`) | Identifiers |
| `serde`, `serde_json`, `base64`, `thiserror`, `anyhow`, `tracing`, `tracing-appender` | Plumbing and logging |
| `regex` | Regex search and custom SQL function |
| `fractional_index` | Order keys |
| `rrule` | Recurring quests |
| `time` or `chrono` | Dates, local-day computation |
| `zip` | Markdown/backup archives |
| `proptest` (dev) | Sync convergence property tests |
| `ts-rs` (★ S09) | Generate TypeScript types from Rust structs |

### 2.4 ★ Suggestions on the stack

> ★ **SUGGESTION S09 — Generate TypeScript types from Rust.** Annotate IPC structs with `#[derive(TS)]` (`ts-rs`) and emit to `src/types/generated/`. One source of truth, no drift, no Zod needed.
>
> ★ **SUGGESTION S10 — Pin everything.** Commit `Cargo.lock` and `package-lock.json`. Update dependencies on a schedule (monthly), not ad hoc, because Tauri plugins and `rusqlite` features are version-sensitive.

---

## 3. Repository layout

```text
kaisen/
├─ CLAUDE.md                      # agent rules (root)
├─ docs/
│  ├─ SPEC.md                     # this document
│  └─ SPIKES.md                   # M0 results
├─ package.json  vite.config.ts  tsconfig.json  index.html
├─ src/                           # TypeScript / React
│  ├─ app/                        # shell, router, providers, layouts (desktop + mobile)
│  ├─ features/
│  │  ├─ gatehouse/  vaults/  library/  notes/  canvas/  codex/  board/
│  │  ├─ craft/  quests/  journey/  shop/  profile/  settings/  search/
│  ├─ lib/
│  │  ├─ ipc.ts                   # typed invoke wrappers (one function per command)
│  │  ├─ supabase.ts              # client + storage adapter (§4.4)
│  │  ├─ sync.ts                  # network orchestration only (§7)
│  │  ├─ updater.ts               # UpdateService abstraction (§10)
│  │  └─ events.ts                # listens to Rust events → query invalidation
│  ├─ styles/                     # tokens.css, tailwind entry
│  └─ types/generated/            # ts-rs output (do not edit)
├─ src-tauri/
│  ├─ Cargo.toml  tauri.conf.json  build.rs
│  ├─ capabilities/               # default.json  desktop.json  mobile.json
│  ├─ migrations/                 # 0001_core.sql  0002_suggested.sql ...
│  ├─ gen/android/                # generated by `tauri android init`
│  └─ src/
│     ├─ lib.rs  main.rs          # thin; logic in lib
│     ├─ state.rs  error.rs  events.rs
│     ├─ crypto/  { kdf.rs aead.rs keys.rs vault.rs }
│     ├─ db/      { open.rs migrate.rs hlc.rs repo.rs ids.rs order.rs }
│     ├─ entities/ { vault.rs file.rs note.rs canvas.rs codex.rs board.rs
│     │             quest.rs shop.rs template.rs tag.rs link.rs attachment.rs settings.rs }
│     ├─ services/ { quest_service.rs shop_service.rs board_service.rs
│     │             template_service.rs vault_service.rs search_service.rs
│     │             export_service.rs backup_service.rs }
│     ├─ sync/    { outbox.rs apply.rs merge.rs repair.rs cursor.rs }
│     └─ commands/ (one file per feature; thin wrappers only)
├─ supabase/
│  └─ migrations/ 0001_sync.sql
├─ scripts/  release.mjs  bump-version.mjs
└─ .github/workflows/ release.yml
```

---

## 4. Identity, 2FA (Proton Authenticator) and sessions

### 4.1 Model

- Identity = Supabase Auth user. Its `auth.users.id` (UUID) is **the user ID** that owns every row (◆ SPEC).
- Login = **email + password + TOTP** (second factor). TOTP is an open standard (RFC 6238). **Proton Authenticator** is a free, open-source TOTP app available on Android and Windows that works offline and offers end-to-end encrypted sync and backup. Supabase needs nothing Proton-specific: you enrol the factor and scan or type the secret into Proton Authenticator.
- Supabase TOTP MFA is free and enabled on all projects by default.
- Enforcement is **server-side**: a *restrictive* RLS policy requires the JWT claim `aal = 'aal2'`, so a stolen password alone cannot read or write any data (§8, Appendix B).

### 4.2 Hardening the Supabase project (one-time, before first release)

| Step | Setting |
|---|---|
| 1 | Create your user in the dashboard (Authentication → Users → *Add user*, auto-confirm). |
| 2 | **Disable new sign-ups** (Authentication settings → turn off "Allow new users to sign up"). The app is single-user; this closes the front door permanently. |
| 3 | Disable all OAuth providers and anonymous sign-ins. |
| 4 | Set a long JWT expiry only if you need it; default (1 hour) is fine since refresh is automatic. |
| 5 | Enable leaked-password protection if available on your plan; use a unique 16+ character password in a password manager regardless. |
| 6 | Confirm MFA enrol/challenge/verify are enabled (default). |
| 7 | Region: choose the nearest EU region (you are in the UK). |

### 4.3 Flows

**First run on first device**

```text
1. Sign in (email+password)                       → session at aal1
2. Enrol TOTP: mfa.enroll({factorType:'totp'})    → QR + secret
3. Add to Proton Authenticator (scan on phone, or paste the secret/URI on Windows)
4. mfa.challengeAndVerify(code)                   → session upgraded to aal2
5. Create master passphrase                       → Rust: generate DEK, wrap, upload user_keys (§5)
6. Show recovery key, require confirmation
7. Open local DB, persist session (encrypted), first sync
```

**Daily use**

```text
Open app → unlock with master passphrase (or biometrics, ★ S02) → local data available OFFLINE immediately
        → in background: restore session from encrypted local store → refresh token → sync
```

**New device**

```text
Sign in → TOTP (aal2) → fetch user_keys → master passphrase (or recovery key) → unwrap DEK → init DB → initial pull
```

**Session expired / revoked** → sign in + TOTP again. The local data stays readable and editable the whole time; only sync is paused.

> ✅ **ACCEPTANCE** — With the phone in airplane mode, after unlocking, you can create, edit and delete notes, complete quests, and move Board cards. No network error is shown as a blocking dialog; a small "Offline" indicator appears.

### 4.4 Code: enrolment, login, session storage (TypeScript)

```ts
// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";
import { ipc } from "./ipc";

// Session lives in Rust's encrypted store, never in localStorage.
// Before unlock (first login), buffer in memory; flush after keys_unlock().
const mem = new Map<string, string>();
let unlocked = false;
export const sessionStorageAdapter = {
  getItem: async (k: string) => (unlocked ? await ipc.secureKvGet(k) : mem.get(k) ?? null),
  setItem: async (k: string, v: string) => (unlocked ? ipc.secureKvSet(k, v) : void mem.set(k, v)),
  removeItem: async (k: string) => (unlocked ? ipc.secureKvDelete(k) : void mem.delete(k)),
};
export async function flushSessionToSecureStore() {
  unlocked = true;
  for (const [k, v] of mem) await ipc.secureKvSet(k, v);
  mem.clear();
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,   // public by design; RLS protects data
  { auth: { storage: sessionStorageAdapter, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
);
```

```ts
// src/features/profile/mfa.ts
export async function enrolTotp() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Proton Authenticator" });
  if (error) throw error;
  // data.id (factorId), data.totp.qr_code (SVG), data.totp.secret, data.totp.uri
  return data;
}
export async function verifyEnrol(factorId: string, code: string) {
  return supabase.auth.mfa.challengeAndVerify({ factorId, code });
}
export async function loginWithTotp(email: string, password: string, code: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    const { data: f } = await supabase.auth.mfa.listFactors();
    const factor = f!.totp[0];
    const { error: e2 } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (e2) throw e2;
  }
}
```

> 🔒 **SECURITY** — Enrol the TOTP secret in **two** places: Proton Authenticator with its encrypted backup/sync switched on, **and** a printed or offline copy of the secret in a safe. Supabase has no built-in TOTP recovery codes; losing the authenticator with no backup locks you out of the cloud (local data would remain). You can enrol a second TOTP factor as a backup (`mfa.enroll` can be called again).

### 4.5 Local app lock

- Cold start always requires the **master passphrase** (Phase 1).
- **Auto-lock**: configurable (default 5 minutes after the app goes to background on Android, 15 minutes idle on Windows). Locking zeroes the DEK and closes the database.
- ★ **S02** adds biometric/OS-credential convenience unlock; ★ **S03** adds an instant "panic lock" shortcut.

---

## 5. Encryption architecture

### 5.1 Layers

| Layer | Protects against | Mechanism |
|---|---|---|
| L1 — Device at rest | Lost phone, stolen laptop, malware reading the file | **SQLCipher** (AES-256) whole-database encryption + encrypted attachment files |
| L2 — Cloud at rest and in transit | Supabase breach, insider access, network attacker | **Client-side end-to-end encryption** (XChaCha20-Poly1305) of every synced record and file before upload, plus TLS |
| L3 — Protected vaults | Someone using your unlocked app, shoulder-surfing, device handed over | **Per-vault key** from a vault password; vault titles and contents are ciphertext even inside the database |
| L4 — Account | Credential stuffing, phishing | Password + TOTP, restrictive `aal2` RLS, sign-ups disabled |

### 5.2 Key hierarchy

```text
Master passphrase (you) ──Argon2id(salt, params)──► KEK (32 bytes, never stored)
Recovery key (random 256-bit, shown once) ─────────► KEK_r (32 bytes)

DEK (random 256-bit, generated once on first device)
   ├─ wrapped by KEK   → user_keys.wrapped_dek_pass      (stored in Supabase; useless without passphrase)
   └─ wrapped by KEK_r → user_keys.wrapped_dek_recovery  (stored in Supabase; useless without recovery key)

DEK ──HKDF-SHA256──► sub-keys (domain-separated)
   ├─ "kaisen/db/v1"     → SQLCipher raw key (local database)
   ├─ "kaisen/sync/v1"   → encrypts every sync_records payload
   ├─ "kaisen/blob/v1"   → encrypts attachment files (local + Storage)
   ├─ "kaisen/backup/v1" → encrypts backup archives
   └─ "kaisen/kv/v1"     → encrypts the stored Supabase session

Vault key (random 256-bit per protected vault)
   └─ wrapped by Argon2id(vault password) → vaults.wrapped_key (synced inside the vault record)
```

**Properties worth knowing**

- Changing the master passphrase re-wraps the DEK only. No data is re-encrypted.
- The Supabase password and the master passphrase are **different secrets** serving different purposes. Supabase never sees the master passphrase.
- Forgetting the master passphrase *and* losing the recovery key = **unrecoverable cloud data**, by design.

### 5.3 Algorithms and parameters

| Item | Choice | Notes |
|---|---|---|
| KDF | Argon2id, `m = 64 MiB, t = 3, p = 1` | Parameters stored in `user_keys.kdf_params`. ⚠ Benchmark on your phone (spike S6); reduce `m` to 32 MiB if unlock exceeds ~1.5 s. Every device reads params from the server. |
| AEAD | XChaCha20-Poly1305 (24-byte random nonce) | Output format `nonce(24) ‖ ciphertext+tag`. |
| Sub-keys | HKDF-SHA256 with the labels above | Compromise of one purpose does not expose another. |
| SQLCipher key | Raw 256-bit key via `PRAGMA key = "x'<hex>'"` | Skips SQLCipher's internal PBKDF2 because the key is already uniformly random. |
| Randomness | `OsRng` | Never `thread_rng` for keys or nonces. |
| Memory | `zeroize` on all key material; `Zeroizing<[u8; 32]>` wrappers | DEK lives only in Rust memory while unlocked. |

### 5.4 Binding ciphertext to its record (anti-swap, anti-replay)

Every sync payload is sealed with **AAD** (additional authenticated data):

```text
AAD = "kaisen|" + entity + "|" + record_id + "|" + hlc + "|" + payload_v
```

A malicious or buggy server cannot move one record's ciphertext onto another record, nor attach an old payload to a newer clock, without authentication failing. Replaying an *older whole record* is neutralised by the last-write-wins clock check (§7.4).

### 5.5 Code sketch (Rust, reference only — the agent verifies against current crate APIs)

```rust
// src-tauri/src/crypto/aead.rs
use chacha20poly1305::{aead::{Aead, KeyInit, Payload}, Key, XChaCha20Poly1305, XNonce};
use rand::{rngs::OsRng, RngCore};

pub fn seal(key: &[u8; 32], aad: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let mut nonce = [0u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let ct = cipher.encrypt(XNonce::from_slice(&nonce), Payload { msg: plaintext, aad })
        .map_err(|_| CryptoError::Seal)?;
    let mut out = nonce.to_vec();
    out.extend_from_slice(&ct);
    Ok(out)
}

pub fn open(key: &[u8; 32], aad: &[u8], blob: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if blob.len() < 24 + 16 { return Err(CryptoError::Malformed); }
    let (nonce, ct) = blob.split_at(24);
    XChaCha20Poly1305::new(Key::from_slice(key))
        .decrypt(XNonce::from_slice(nonce), Payload { msg: ct, aad })
        .map_err(|_| CryptoError::Open)
}
```

```rust
// src-tauri/src/crypto/kdf.rs
use argon2::{Algorithm, Argon2, Params, Version};
use hkdf::Hkdf;
use sha2::Sha256;
use zeroize::Zeroizing;

pub struct KdfParams { pub m_kib: u32, pub t: u32, pub p: u32 }

pub fn derive_kek(pass: &str, salt: &[u8], k: &KdfParams) -> Result<Zeroizing<[u8; 32]>, CryptoError> {
    let params = Params::new(k.m_kib, k.t, k.p, Some(32)).map_err(|_| CryptoError::Kdf)?;
    let mut out = Zeroizing::new([0u8; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(pass.as_bytes(), salt, &mut *out).map_err(|_| CryptoError::Kdf)?;
    Ok(out)
}

pub fn subkey(dek: &[u8; 32], label: &str) -> Zeroizing<[u8; 32]> {
    let mut out = Zeroizing::new([0u8; 32]);
    Hkdf::<Sha256>::new(None, dek).expand(label.as_bytes(), &mut *out).expect("32 bytes is valid");
    out
}
```

### 5.6 What Supabase can and cannot see

| Visible to Supabase | Not visible (ciphertext) |
|---|---|
| Your account email, MFA factor existence | All titles, note/canvas/code content, quest text, shop items, tags, settings |
| Record IDs, entity type names (e.g. `note_content`), sizes, timestamps, deleted flag | Attachment names and contents (blobs are encrypted; names live in encrypted records) |
| Approximate usage patterns (how often you sync) | Which vaults are protected, vault names |

> ★ **SUGGESTION S01 — Hide entity names.** Replace the plaintext `entity` column with an HMAC-derived tag so the server cannot even count your notes versus quests. Cost: the pull query cannot filter by entity (fine, you pull everything). Low value for one user; listed for completeness.

### 5.7 Protected vaults (L3) — precise behaviour

- Vault password → Argon2id → KEK_v. A random 256-bit **vault key** is wrapped by KEK_v and stored in `vaults.wrapped_key`; `vaults.key_check` holds a sealed constant to verify the password.
- For files in a protected vault: `files.title`, note/canvas/codex/board content, comments and card text are stored as `enc:` + base64 ciphertext sealed with the vault key. They are then sealed again by L2 for sync.
- **Search**: protected-vault content is **never** written to the persistent FTS index. While a vault is unlocked, Rust builds a temporary in-memory index for it (SQLite `temp` schema). Locking drops it.
- **Metadata not hidden** by L3: IDs, tags, links, timestamps, file kind. These are still covered by L1 and L2.
- ⚠ **No password recovery for a vault password.** The UI requires a typed confirmation at vault creation.
- Locking a vault zeroes its key from memory. Switching to another vault, backgrounding the app on Android, or the global auto-lock all lock protected vaults.

### 5.8 Threat model summary

| Threat | Mitigation | Residual risk |
|---|---|---|
| Phone stolen, locked | Android FBE + L1 + passphrase | Weak passphrase → enforce length and a strength estimate (★ S12) |
| Phone stolen, unlocked, app open | Auto-lock, L3 vaults, ★ S03 panic lock | Window before auto-lock |
| Malware reading app files | SQLCipher, encrypted attachments | Malware with memory access while unlocked |
| Supabase breach / insider | E2EE (L2): server holds only ciphertext | Metadata in §5.6 |
| Password phished | TOTP + restrictive `aal2` RLS | Phished TOTP in real time; use unique password, check URLs |
| Malicious server tampering | AEAD + AAD binding; clock check | Server can delete or withhold data (availability) |
| Lost both devices and recovery key | Backups (§30), second device, cloud copy | If passphrase also lost, data is unrecoverable by design |
| XSS inside WebView | Strict CSP, no remote content, no `eval`, sanitise imported HTML | Compromised dependency (pin and audit, ★ S10) |
| Supply-chain on update | Updater signature verified against pinned public key (§10) | Compromise of your signing key: keep it offline and backed up |

### 5.9 ⚠ Build risks specific to encryption

| Risk | Detail | Mitigation |
|---|---|---|
| SQLCipher on Android | `bundled-sqlcipher-vendored-openssl` cross-compiles OpenSSL; painful on a Windows host. | Spike S2. Fallback: build Android in WSL2 or on a Linux CI runner. Second fallback: evaluate SQLite3 Multiple Ciphers (no OpenSSL). |
| FTS5 in SQLCipher build | Need FTS5 and the `trigram` tokenizer (SQLite ≥ 3.34). | Spike S2 checks `pragma_compile_options` and creates a trigram table. |
| Argon2 speed on phones | Memory-hard KDF can be slow. | Spike S6; tune `m` per §5.3. |

---

## 6. Local data layer

### 6.1 Engine and pragmas

- `rusqlite` + SQLCipher, **WAL** journal, `synchronous = NORMAL`, `foreign_keys = ON`, `busy_timeout = 5000`.
- Prototype concurrency: **one connection behind a `Mutex`** (simple, correct). Add a read-only pool later only if a profile shows contention.
- Database file in the OS app-data directory (`app_data_dir`), attachments in `app_data_dir/att/<id>` as encrypted files.

### 6.2 Identifiers

| Kind | Format | Used for |
|---|---|---|
| Random IDs | **UUIDv7** (time-ordered, generated in Rust) | Files, quests, cards, vaults… |
| Deterministic IDs | **UUIDv5** from a fixed namespace + a natural key | Taggings, links, settings, ledger entries for quest completion, recurring quest occurrences |

Deterministic IDs are what make two offline devices converge without coordination: the same logical fact produces the same row ID on both, so a sync merges them into one row instead of duplicating it.

### 6.3 Common columns (every synced table)

| Column | Type | Meaning |
|---|---|---|
| `id` | TEXT PK | UUID |
| `hlc` | TEXT NOT NULL | Hybrid logical clock of the last write (sortable string) |
| `created_at`, `updated_at` | INTEGER | Unix ms (informational; **not** used for conflict resolution) |
| `deleted_at` | INTEGER NULL | Tombstone (sync-level delete) |

Some tables also carry `trashed_at` (user-visible Trash, restorable) which is separate from `deleted_at` (tombstone).

### 6.4 Hybrid Logical Clock (HLC)

Device clocks drift. Last-write-wins on raw timestamps would let a phone with a fast clock overwrite everything. The HLC fixes that.

```text
format:   {wall_ms:013d}-{counter:05d}-{device8}      e.g.  0001790000000-00002-a1b2c3d4
compare:  plain string comparison (zero-padded, so lexicographic = chronological)
tick():   wall = max(now_ms, last_wall); if wall == last_wall then counter += 1 else counter = 0
observe(remote): last_wall = max(last_wall, remote.wall)  (called when applying remote records)
```

```rust
// src-tauri/src/db/hlc.rs  (sketch)
pub struct Hlc { last_wall: i64, counter: u32, device8: String }
impl Hlc {
    pub fn tick(&mut self, now_ms: i64) -> String {
        let wall = now_ms.max(self.last_wall);
        self.counter = if wall == self.last_wall { self.counter + 1 } else { 0 };
        self.last_wall = wall;
        format!("{:013}-{:05}-{}", wall, self.counter, self.device8)
    }
    pub fn observe(&mut self, remote: &str) {
        if let Some(w) = remote.get(0..13).and_then(|s| s.parse::<i64>().ok()) {
            self.last_wall = self.last_wall.max(w);
        }
    }
}
```

HLC state persists in `meta` (`hlc_state`) so it never goes backwards after a restart.

### 6.5 The single write path 🔒

> **Rule: no code outside `db/repo.rs` may issue `INSERT`, `UPDATE` or `DELETE` on a synced table.** The repository guarantees every write is also queued for sync and indexed. This is how every feature is sync-correct by construction.

```rust
// db/repo.rs (sketch)
pub fn write(tx: &Transaction, ctx: &mut Ctx, op: Op) -> Result<()> {
    let hlc = ctx.clock.tick(now_ms());
    match op {
        Op::Upsert { entity, id, row } => {
            let base = existing_hlc(tx, entity, &id)?;      // None for new rows
            upsert_row(tx, entity, &id, &row, &hlc)?;        // sets hlc, updated_at
            outbox_upsert(tx, entity, &id, &hlc, base.as_deref(), "upsert")?;
            ctx.reindex.push((entity, id.clone()));          // search_service processes after row writes
        }
        Op::Delete { entity, id } => {                       // tombstone
            tombstone_row(tx, entity, &id, &hlc)?;
            outbox_upsert(tx, entity, &id, &hlc, existing_hlc(tx, entity, &id)?.as_deref(), "delete")?;
            ctx.reindex.push((entity, id));
        }
    }
    Ok(())
}
```

Outbox rows are **coalesced** per `(entity, id)`: a later write updates `hlc`/`op` but keeps the original `base_hlc` (the version last known to the server). The payload is built at push time from the current row, so each record is sent at most once per sync.

### 6.6 Ordering without renumbering: fractional order keys

Lists you can reorder (vaults, files, Board columns and cards, quests, checklist items, snippets) use a string `sort_key` generated between two neighbours (fractional indexing). Moving an item changes **one** row, so two devices reordering different items never conflict and reorders merge cleanly.

### 6.7 Time, days and timezones

- Timestamps are UTC milliseconds.
- Anything day-based (streaks, "completed today", ledger per day) also stores a `day TEXT` (`YYYY-MM-DD`) computed in the **device's local timezone at write time**. This avoids a streak shifting when you travel or when two devices are in different zones.

### 6.8 Migrations 🔒

- Forward-only numbered SQL files in `src-tauri/migrations/`, embedded with `include_str!`, applied in a transaction at startup, tracked by `meta.schema_version`.
- **Before applying any migration**, copy the DB file to `kaisen.db.bak-<oldversion>` (keep the last 2).
- A new app version must refuse to open a DB with a *higher* schema version than it knows.
- Schema and sync payload versions are separate (`payload_v`, §7.9).

### 6.9 Table inventory

Full DDL is in **Appendix A**. Summary:

| Group | Tables | Synced? |
|---|---|---|
| Structure | `vaults`, `files`, `tags`, `taggings`, `links`, `attachments`, `devices`, `settings` | Yes |
| Content | `note_content`, `canvas_content`, `codex_snippets`, `board_columns`, `board_cards`, `card_items`, `comments` | Yes |
| Craft | `templates` | Yes |
| Quest and economy | `quests`, `quest_items`, `time_entries`, `gold_ledger`, `shop_items`, `inventory_events` | Yes |
| Local only | `meta`, `outbox`, `sync_conflicts`, `attachment_state`, `device_settings`, `shortcuts`, `view_state`, `secure_kv`, `search_map` + `search_index` (FTS5) | No |

---

## 7. Sync engine (Windows ⇄ Android, offline editing)

### 7.1 Principles

1. The **local database is the source of truth for the UI**. The UI never waits for the network.
2. All writes go through the repository, which also writes an **outbox** entry (same transaction).
3. The cloud holds **one generic table of encrypted records**. The server never needs to understand your data.
4. Merge happens **on the client, in Rust**, with deterministic rules per entity type.
5. Network I/O is done by TypeScript (`supabase-js`); Rust prepares and consumes **opaque ciphertext batches**.
6. The protocol is **idempotent**: replaying any batch any number of times is harmless.

### 7.2 Cloud record shape

```text
sync_records(user_id, entity, id, hlc, deleted, payload_v, payload(base64), server_seq, updated_at)
PK (user_id, entity, id)
```

`payload` = `base64( nonce ‖ XChaCha20-Poly1305( sync_subkey, aad, canonical_json(row) ) )`. Deleted records carry no payload. See Appendix B for SQL.

### 7.3 Sync cycle

```text
sync():
  1. PULL   loop: rows = select where server_seq > cursor - OVERLAP order by server_seq limit 500
                  rust.sync_apply_remote(rows)  → decrypt, merge, repair, reindex, emit events
                  cursor = max(server_seq)      until fewer than 500 returned
  2. PUSH   loop: batch = rust.sync_outbox_batch(100)   → [{entity,id,hlc,deleted,payload_v,payload}]
                  acks  = supabase.rpc("sync_push", {rows: batch})
                  rust.sync_mark_pushed(acks)   → delete outbox rows whose hlc is unchanged
                  until batch empty
  3. If any push was rejected (server had a newer hlc) → go to 1 (max 3 rounds)
  4. Attachments: upload pending blobs, download needed blobs
```

**Triggers**: app start (after unlock), return to foreground, connectivity regained, 60 s timer while foregrounded, after a local write (debounced 3 s), and a Realtime nudge from the other device. A single in-flight sync (mutex) at all times.

**Cursor overlap**: Postgres sequences can commit out of order. Pulling from `cursor − 100` and applying idempotently removes any chance of missing a row.

**Backoff**: on error, exponential backoff (2 s → 5 min, jitter). Failures never block local editing.

### 7.4 Merge rules per entity ◆ design

| Strategy | Entities | Rule |
|---|---|---|
| **LWW row** | `vault`, `file`, `template`, `quest`, `quest_item`, `shop_item`, `tag`, `setting`, `device`, `board_column`, `board_card`, `card_item`, `comment`, `attachment` | Higher HLC wins. Equal → no-op. |
| **Append-only** | `gold_entry`, `inventory_event`, `time_entry` | Rows are immutable. The merge is a **set union** by ID. Balances are always `SUM()` over the union. |
| **Deterministic-ID union** | `tagging`, `link` | Same logical edge = same ID on every device. Add/remove are LWW on that single row (a remove is a tombstone; re-add resurrects with a newer HLC). |
| **Document with conflict copy** | `note_content`, `canvas_content`, `codex_snippet` | LWW picks the main version; if both devices edited since the last sync, the **loser is saved as a "conflict copy"** instead of discarded. |

**Concurrent-edit detection (documents):** an outbox entry stores `base_hlc`, the version this device last knew the server had. When a remote record for the same ID arrives with `remote.hlc != base_hlc`, **both sides changed**.

```text
apply(remote):
  hlc_clock.observe(remote.hlc)
  local   = row(entity,id)
  pending = outbox(entity,id)
  if local is None:                 insert remote (or tombstone)
  elif remote.hlc  > local.hlc:
       if pending and remote.hlc != pending.base_hlc and entity is Document:
            save LOCAL content as conflict copy;   overwrite with remote;   drop pending
       else overwrite local with remote;           drop pending (LWW rows)
  elif remote.hlc  < local.hlc:
       if pending and remote.hlc != pending.base_hlc and entity is Document:
            save REMOTE content as conflict copy   # local stays main, will push
       else ignore
  else: no-op
  post-apply: referential repair (§33.5), search reindex, emit events
```

**Conflict copy** = a new file in the same vault titled `"<title> (conflict <date> <device>)"`, linked to the original by a `link` of kind `conflict_of`, plus a row in local `sync_conflicts`. A small banner appears ("1 sync conflict saved as a copy"). ★ **S06** adds a dedicated Conflict Inbox screen.

### 7.5 Why this is safe for your data model

| Scenario | Outcome |
|---|---|
| Edit the same note on both devices offline | Newer wins, older saved as conflict copy. Nothing is lost. |
| Complete the same quest on both devices offline | Ledger entry ID is deterministic (`uuid_v5("quest-complete", quest_id, occurrence)`), so the union has **one** reward. |
| Buy shop items on both devices offline | Both purchases stand (union). Balance can go **negative**; purchases are blocked until it recovers. Accepted trade-off. |
| Reorder different Board cards on each device | Separate rows, separate fractional keys → both reorders apply. |
| Create tag "work" on both devices | Two rows with the same name merge at apply time (lower ID canonical, taggings re-pointed). |
| Delete a Board column on one device while the other adds a card to it | Orphan repair moves the card to the first column (§33.5). |
| One device's clock is a day fast | HLC ordering is used, not wall time; the fast clock cannot overwrite newer edits indefinitely. |

### 7.6 Realtime

`supabase-js` subscribes to `postgres_changes` on `sync_records` filtered by `user_id`. A change event only **triggers a pull**; the payload is ignored. Without Realtime (offline, or channel dropped) the 60 s timer still converges.

### 7.7 Attachments (images, files)

- Metadata row `attachment` syncs like any record. The blob is encrypted with the `kaisen/blob/v1` sub-key (`nonce ‖ ciphertext`) and stored locally in `att/<id>`.
- Upload to Storage path `{user_id}/{attachment_id}` (immutable; never overwritten).
- Local `attachment_state(id, local_path, uploaded, downloaded)` drives two queues. Downloads are **lazy** (on first view) with an optional "download all on Wi-Fi" setting.
- Size cap per file (default 25 MB) to protect free-tier storage and mobile data.

### 7.8 Tombstones

Deleted records stay as tombstones (payload removed) so deletions propagate. A tombstone older than 180 days **and** acknowledged by every known device (`devices.last_seen_at` newer than the tombstone) can be purged by a maintenance task (★ S13).

### 7.9 Version skew

Each payload carries `payload_v`. If a pulled record has `payload_v` greater than this build supports, sync **pauses** with a persistent "Update required" banner, and the updater is triggered (§10). This prevents an old build on one device from mis-merging data written by a newer build on the other.

### 7.10 ⚠ Sync risks and mitigations

| Risk | Mitigation |
|---|---|
| Bug causes data loss | Property tests simulate two devices with random operations and random sync order and assert **convergence** (Appendix F). Nightly local backup before first sync after an upgrade. |
| Supabase free tier pauses an idle project | Use the app at least weekly, or upgrade; verify current limits on the Supabase pricing page. The other device and local backups still hold your data. |
| Large initial sync on mobile | Paged pulls of 500, progress indicator, resumable via cursor. |
| Realtime flakiness on mobile networks | Timer-based pull remains the safety net. |

---

## 8. Supabase backend

### 8.1 What is used

| Component | Use |
|---|---|
| **Auth** | Email/password, TOTP MFA, sign-ups disabled |
| **Postgres** | `sync_records`, `user_keys` (both RLS-protected, `aal2` required) |
| **Storage** | `attachments` (private, per-user folder policy) and `releases` (public read, for OTA artifacts) |
| **Realtime** | `sync_records` change nudges |
| **Edge Functions** | **None needed** |
| **Service role key** | Only in your CI secrets (uploads release artifacts). **Never** in the app. |

### 8.2 Security rules (all in Appendix B)

- RLS enabled on every table; an owner policy (`user_id = auth.uid()`) **and** a *restrictive* policy requiring `aal = 'aal2'`.
- Storage policies mirror this for the `attachments` bucket.
- The app ships only the **publishable** key (formerly "anon"); it is public by design and harmless with RLS.
- ✅ **ACCEPTANCE** — With a valid password-only (`aal1`) session, `select` on `sync_records` returns zero rows and inserts are rejected. With a second Supabase user's session, you cannot read the first user's rows (test with a throwaway second user created before disabling sign-ups, then delete it).

### 8.3 Free-tier awareness ⚠

Verify current limits on Supabase's pricing page before relying on them. Items to check: database size, storage size, egress, **project pausing after inactivity**, and backup availability. Because the data is E2EE and replicated on two devices plus local backups (§30), a pause or quota issue is an inconvenience, not a data-loss event.

---

## 9. Connectivity and offline behaviour

### 9.1 States

| State | Indicator | Behaviour |
|---|---|---|
| **Synced** | Green dot | Outbox empty, last pull succeeded |
| **Syncing** | Animated dot | Cycle in progress |
| **Pending** | Amber dot + count | Local changes waiting (offline or retrying) |
| **Offline** | Grey dot | No connectivity; everything works locally |
| **Needs sign-in** | Amber banner | Session expired or revoked; sign in + TOTP; local editing unaffected |
| **Update required** | Persistent banner | Remote data newer than this build (§7.9) |
| **Error** | Red dot, tap for details | Last error and next retry time |

### 9.2 Feature availability offline

| Works fully offline | Needs network |
|---|---|
| Everything in the Library, Craft Room, Quests, Shop, Journey, Settings, search, export, backup | First login and MFA, new-device setup, sync, uploading/downloading attachments not yet cached, update checks, Supabase account management |

### 9.3 Connectivity detection

Use `navigator.onLine` as a hint only; the real test is whether the last sync call succeeded. On Android, trigger a sync on `visibilitychange` (foreground) and on the `online` event. Never show a blocking modal for a network failure.

---

## 10. OTA updates and release pipeline

### 10.1 What "OTA" can mean here

| Update type | Windows | Android |
|---|---|---|
| **Full app update** (Rust and UI) | ✅ Official `tauri-plugin-updater` (desktop-only, signed) | ⚠ The official updater plugin does **not** support mobile. Use an Android-specific path (below). |
| **UI-only hot update** (swap web assets without reinstalling) | Possible via a community plugin | Possible via a community plugin; Rust/native changes still need a full APK |

### 10.2 Update artifacts host

Default: **Supabase Storage public bucket `releases`** (keeps you inside "just Supabase" and keeps your source repo private).

```text
releases/latest.json                           ← updater manifest (public)
releases/windows/kaisen_<ver>_x64-setup.exe  + .sig
releases/android/kaisen_<ver>_arm64.apk
```

Alternative: a separate **public** GitHub repo containing release binaries only (no source). Convenient for GitHub-native tools; choose whichever you prefer. Binaries contain no secrets (the publishable key is public by design).

### 10.3 Windows

- `tauri-plugin-updater` with a **Tauri updater key pair** (`tauri signer generate`). The **public key** is in `tauri.conf.json`; the **private key and password** live only in CI secrets and an offline backup.
- Build with `bundle.createUpdaterArtifacts = true`, target `nsis`.
- Manifest format (static JSON, served from `releases/latest.json`):

```json
{
  "version": "0.4.2",
  "notes": "Fixes board drag on touch; adds timeline filters.",
  "pub_date": "2026-10-02T12:00:00Z",
  "platforms": {
    "windows-x86_64": { "signature": "<contents of .sig>", "url": "https://<ref>.supabase.co/storage/v1/object/public/releases/windows/kaisen_0.4.2_x64-setup.exe" }
  },
  "android": { "version": "0.4.2", "url": "https://<ref>.supabase.co/storage/v1/object/public/releases/android/kaisen_0.4.2_arm64.apk", "sha256": "<hex>" },
  "min_payload_v": 1
}
```

(The `android` block is **our own extension** read by our code, not by the Tauri updater.)

- Personal-use signing: you do **not** need an EV code-signing certificate. Windows SmartScreen may show a one-time warning on first install; the updater's own signature check is what protects updates.
- UX: silent check on launch and every 6 hours; non-blocking banner "Update 0.4.2 ready — Restart"; install mode `passive`.

### 10.4 Android (decision deferred to spike S4)

Three viable mechanisms, in order of preference:

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. In-app APK update** | `UpdateService` reads `latest.json`, downloads the APK, verifies **SHA-256 and the APK signature** (same keystore), then hands it to Android's package installer. A community crate/plugin (e.g. `tauri-plugin-android-update`) or ~60 lines of Kotlin can do the install step. | Feels like OTA; one tap | Android shows its "install unknown apps" permission once; ⚠ plugin maturity must be checked |
| **B. Obtainium** | Free open-source Android app that watches a release page and installs updates | Zero code | Works best with GitHub-style release pages (so favours the public-releases-repo option) |
| **C. Frontend hot-update plugin** | `tauri-plugin-hot-update` swaps the web bundle with rollback protection | Instant UI fixes without reinstall | ⚠ New community plugin (0.1.x). Rust changes still need Option A or B. |

**Recommendation:** ship Option **A** (or **B** if A's plugin fails the spike) for full updates. Treat **C** as ★ **S08** after the app is stable.

Android requirements regardless of option:

- **Always sign release APKs with the same keystore.** A different key means Android refuses the update and you must uninstall (losing local data until you re-sync). Back up the keystore and its password in two places.
- Keep `applicationId` constant. Increase `versionCode` every release (derive from semver).
- Release builds use `tauri android build --apk --target aarch64`.

### 10.5 Release flow: "push code → devices update"

```text
you: bump version (scripts/bump-version.mjs) → git push main
CI (.github/workflows/release.yml):
   gate:    skip unless package/tauri version > version in releases/latest.json
   windows: build NSIS + updater artifacts, sign with TAURI_SIGNING_PRIVATE_KEY
   android: build signed APK (keystore from secrets)
   publish: upload artifacts to Supabase Storage `releases/`, then upload new latest.json LAST
devices: check latest.json → show banner → install
```

Uploading `latest.json` **last** guarantees devices never see a manifest pointing at a file that is not there yet. Skeleton workflow: Appendix E.

Alternative with no CI: `scripts/release.mjs` builds locally on your Windows machine (Android SDK installed) and uploads with the service role key from a local `.env` that is never committed.

### 10.6 Updates and the database

- Migrations run on first launch of the new version (§6.8) after an automatic DB backup.
- A device that has not updated keeps working locally; if the other device writes a newer `payload_v`, sync pauses until it updates (§7.9).
- ✅ **ACCEPTANCE** — Publish version N+1 with a new migration. Windows updates, relaunches, migrates and syncs. Android installs the APK, keeps local data (same keystore), migrates and syncs. Rolling back is not supported; fix forward.

---

## 11. Platform specifics: Windows and Android

### 11.1 Capability matrix

| Capability | Windows | Android | Plugin / approach |
|---|---|---|---|
| Updater | ✅ | ❌ (custom §10.4) | `updater` desktop-only |
| Global quick-capture hotkey | ✅ | ❌ | `global-shortcut` desktop-only |
| System tray | ✅ | ❌ | Tauri tray API |
| Keyboard shortcuts in app | ✅ | Limited (hardware keyboards) | In-app handler |
| Biometric unlock | ❌ (use Windows Hello via ★ S02 research) | ✅ | `biometric` mobile-only |
| File dialogs | ✅ | ✅ (system picker) | `dialog` |
| Notifications | ✅ | ✅ (verify scheduling support) | `notification` |
| Share into app ("Share to KAISEN") | ❌ | ✅ via Android intent | Custom Kotlin plugin (★ S05) |
| Secure screen (block screenshots) | ❌ | ✅ via `FLAG_SECURE` | Custom Kotlin (★ S04) |
| Window state (size, position) | ✅ | n/a | Desktop capability file |

Use **separate capability files** with the `platforms` field so desktop-only permissions are never granted on Android (`capabilities/desktop.json`, `capabilities/mobile.json`, Appendix D).

### 11.2 Adaptive layout

| | Desktop (≥ 768 px wide) | Mobile (< 768 px) |
|---|---|---|
| Navigation | Left rail with room icons | Bottom tab bar (Gatehouse, Library, Journey, Shop, More) |
| Library | 3 panes: vault tree / file list / editor, collapsible right sidebar | Single column; file list → editor → bottom sheet for document settings |
| Formatting | Floating toolbar on selection (default) | **Bottom bar above the keyboard** (default) |
| Dialogs | Centred modals | Full-screen sheets or bottom sheets |
| Drag and drop | Pointer drag | Long-press to pick up; "Move to…" menu as accessible fallback |
| Shortcuts | Full hotkey map | Optional on hardware keyboards |

Rules: minimum touch target **48 dp**; respect safe-area insets (status bar, gesture bar, keyboard) via `env(safe-area-inset-*)` and `visualViewport`; handle the Android **Back** button (close sheet → leave editor → previous room → exit prompt).

### 11.3 Android build prerequisites (agent: put these in `docs/DEV_SETUP.md`)

| Need | Notes |
|---|---|
| Android Studio + SDK + **NDK** | Set `ANDROID_HOME`, `NDK_HOME` |
| JDK 17 | Set `JAVA_HOME` |
| Rust targets | `rustup target add aarch64-linux-android x86_64-linux-android` (add `armv7`/`i686` only if needed) |
| Init | `npm run tauri android init` once; commit `src-tauri/gen/android` |
| Run on device | `npm run tauri android dev` (USB debugging) |
| ⚠ SQLCipher/OpenSSL | See §5.9; WSL2 or Linux CI is the escape hatch |

### 11.4 Android lifecycle

The OS can kill the app at any time. Safe because: every write is a SQLite transaction, the outbox is persisted, the HLC state is persisted, and sync is resumable. Autosave debounce is 800 ms **and** the editor flushes on `visibilitychange` (hidden).

---

## 12. Security hardening checklist 🔒

| # | Rule | Verify by |
|---|---|---|
| 1 | Strict CSP; no remote scripts, no `eval`, `connect-src` limited to your Supabase host (Appendix D) | Manual review + attempt to load external script fails |
| 2 | Tauri capabilities are least-privilege and platform-split | Review `capabilities/*.json` |
| 3 | Every Tauri command validates its inputs (IDs, sizes, enums) and returns typed errors | Unit tests with malformed input |
| 4 | Keys exist only as `Zeroizing<[u8;32]>` in Rust; never serialised to JS, logs, or crash output | Code review; grep for key types in `commands/` |
| 5 | **No plaintext user content in logs.** Log IDs, counts, durations, error codes only | Test: create a note containing "SECRET-MARKER", grep logs |
| 6 | Local log file only (`tracing-appender`, rotated, 7 days) with an in-app "Export diagnostics" that excludes content | Manual |
| 7 | Service role key never in the app bundle or repo | `git grep service_role` returns nothing in `src/` and `src-tauri/` |
| 8 | Imported HTML/Markdown is sanitised before rendering | Test with `<script>` and `onerror` payloads |
| 9 | Clipboard: copying from protected vaults auto-clears after 30 s (★ S11) | Manual |
| 10 | Dependencies pinned and audited (`cargo audit`, `npm audit`) before each release | CI step |
| 11 | Release signing keys backed up offline in two places | Checklist before first release |
| 12 | DB and attachment key material zeroised on lock | Test: after lock, any DB command returns `Locked` |
| 13 | Backups are encrypted (§30) | Open a backup file in a hex editor: no plaintext |

---

## 13. Performance and reliability targets

| Metric | Target (mid-range Android, 2020 Windows laptop) |
|---|---|
| Unlock → first interactive screen | < 2.0 s Android, < 1.0 s Windows |
| Open a 10,000-word note | < 300 ms to editable |
| Keystroke latency in editors | No dropped frames; save is debounced and never blocks typing |
| Search across 50,000 records | < 150 ms for first results |
| Sync of 100 changed records | < 3 s on 4G |
| Initial sync of 10,000 records | Under 2 minutes, resumable |
| Database size expectation | ≈ 50–200 MB for heavy personal use excluding attachments |
| Crash safety | No data loss after force-kill at any point (transactions + WAL) |

---

# PART II — FEATURE TECHNICAL PRINCIPLES

Every feature section follows the same shape so the agent and you can scan quickly: **Purpose → Data → Rust services and commands → UI → Interconnections → Sync → Security → Offline and mobile → Edge cases → Acceptance**. Suggestions are always in a separate ★ block.

## 14. Feature conventions, app shell and navigation

### 14.1 Rooms and routes ◆ SPEC

| Room | Route | Notes |
|---|---|---|
| Gatehouse (home) | `/` | Referenced by your spec ("pin to Gatehouse"); contents proposed in §15 |
| Vault selection | `/vaults` | Shown **before** entering the Library (◆) |
| Library | `/library/:vaultId` and `/library/:vaultId/f/:fileId` | Notes, Canvas, Codex, Board |
| Craft Room | `/craft` and `/craft/:templateId` | Templates |
| Journey | `/journey?tab=quests\|timeline\|analytics` | Quests live here |
| Shop & Inventory | `/shop?tab=inventory\|shop` | Inventory is the **first** tab (◆) |
| Profile | `/profile` | |
| Settings | `/settings/:section` | |
| System | `/setup`, `/auth`, `/unlock`, `/recover` | First run, sign-in, passphrase unlock, recovery |

### 14.2 IPC contract

- One Rust command per user-meaningful operation; names are `snake_case` (`quest_complete`). TypeScript wrappers live in `src/lib/ipc.ts`, one function per command, typed from generated types (★ S09).
- Commands return `Result<T, AppError>`. `AppError` is a serialisable enum: `Locked`, `NotFound`, `Validation{field,msg}`, `LimitReached{what}`, `Conflict`, `Crypto`, `Io`, `Internal{id}`. The UI maps these to toasts; `Internal` shows a short ID that matches a log line.
- Commands are **thin**: validate → open transaction → call a service → commit → emit events.

### 14.3 Events and cache invalidation

After every commit Rust emits `kaisen://changed` with the set of touched entities. `src/lib/events.ts` maps entities to TanStack Query keys:

| Entity touched | Query keys invalidated |
|---|---|
| `vault` | `["vaults"]` |
| `file`, `note_content`, `canvas_content`, `codex_snippet` | `["files", vaultId]`, `["file", id]`, `["recent"]`, `["gatehouse"]` |
| `board_column`, `board_card`, `card_item` | `["board", fileId]` |
| `quest`, `quest_item`, `time_entry` | `["quests"]`, `["quest", id]`, `["timeline"]`, `["analytics"]`, `["gatehouse"]` |
| `gold_entry`, `inventory_event`, `shop_item` | `["gold"]`, `["shop"]`, `["inventory"]`, `["analytics"]` |
| `tag`, `tagging` | `["tags"]`, plus keys of the tagged entity |
| `link` | `["links", entityId]`, `["backlinks", fileId]` |
| `template` | `["templates"]`, `["gatehouse"]` |
| `setting` | `["settings"]` (also re-applies theme) |
| `device` | `["devices"]` |

Remote changes applied by sync emit the **same** event, so the UI updates identically whether a change is local or came from your other device.

### 14.4 Action registry (shared by palette, shortcuts and menus)

A single registry `actions: { id, title, group, defaultAccelerator, when, run }` powers the command palette, the keyboard shortcut system and any menus. Adding a feature means registering its actions once; the shortcut remapper (§27) and palette (§28) pick them up automatically.

### 14.5 UX rules ◆ ("easy to use", "modern and appealing")

- Every list has an **empty state** with one clear call to action.
- Destructive actions: soft-delete with an **Undo toast** (10 s). Permanent deletion needs a typed confirmation.
- No spinner longer than 300 ms without a skeleton.
- All motion respects "Reduce motion".
- One primary action per screen; `+` is always in the same position per room (bottom-right on mobile, top bar on desktop).

---

## 15. Gatehouse (home)

> ◆ **SPEC** references it: templates can be "pinned to Gatehouse". ★ **S34** is my proposal for its contents because the PDF never defines it.

**Purpose**: the home screen after unlock: a read-only dashboard plus quick actions. (Vault selection stays a separate step before entering the Library.)

**Data**: no tables of its own. One aggregate query `gatehouse_summary()`.

**Widgets (★ S34)**

| Widget | Source | Interaction |
|---|---|---|
| Today's quests (side quests due today + active recurring) | `quests` | Tap to complete; long-press for details |
| Active main quests with progress | `quests` | Opens in Journey |
| Pinned templates ("Quick create") | `templates.pinned_gatehouse` | Creates a file from the template |
| Recent files | `view_state.last_opened` | Opens file |
| Gold balance and streak | `gold_ledger`, quests | Opens Shop / Analytics |
| Sync and update status | sync state, updater | Opens diagnostics (★ S07) |
| Ideas board shortcut | ★ S29 | Quick add idea |

**Acceptance** ✅: Gatehouse renders from cached queries in < 200 ms, works offline, and updates live when a quest is completed on the other device.

---

## 16. Vault system

### 16.1 Purpose ◆ SPEC
Organise files inside **vaults**, **optionally password-protected**, **up to 10**, chosen on a selection page **before** entering the Library.

### 16.2 Data
`vaults(id, name, icon, color, sort_key, protected, kdf_salt, wrapped_key, key_check, + common)`. Files reference `vault_id`. See Appendix A.

### 16.3 Rust services and commands

| Command | Behaviour |
|---|---|
| `vault_list()` | Active vaults ordered by `sort_key` with file counts and lock state |
| `vault_create(name, icon, color, password?)` | Enforces limit of 10; if password, generates vault key and wraps it |
| `vault_update(id, patch)` | Rename, recolour, reorder (new `sort_key`) |
| `vault_set_password(id, new, old?)` | Adds, changes or removes protection. **Removing or adding protection re-encrypts every file in the vault inside one transaction** (progress events for large vaults) |
| `vault_unlock(id, password)` | Verifies `key_check`, keeps the vault key in memory |
| `vault_lock(id)` / `vault_lock_all()` | Zeroises key(s), drops the temporary search index (§28) |
| `vault_delete(id)` | Moves vault and files to Trash (restorable 30 days) |

### 16.4 UI
- **Vault selection page**: grid of cards (icon, name, colour accent, file count, lock badge). `+` card appears only if fewer than 10 vaults. Long-press/right-click for rename, recolour, protect, delete. Drag to reorder.
- Entering a protected vault shows a password sheet (biometric shortcut with ★ S02). Wrong passwords are rate-limited locally (exponential delay) — this protects against casual guessing, not offline attack (Argon2id does that).
- Creation flow for protected vaults shows a **non-recoverable password warning** and requires typing the vault name to confirm.

### 16.5 Interconnections
- Files, templates (default vault), Quick Capture destination, search (protected content excluded from the persistent index), export (protected vaults require unlock), auto-lock (§4.5).

### 16.6 Sync
LWW row. The synced vault record contains the **wrapped vault key** and salt so the other device can unlock with the same password.

### 16.7 Security 🔒
See §5.7. Vault keys never leave Rust. Wrapped keys are sealed again by L2 for sync.

### 16.8 Edge cases
| Case | Behaviour |
|---|---|
| Both devices create a vault offline → 11 vaults | Allowed on merge; UI flags "over limit" and blocks further creation until you delete one |
| Device A sets a password while B edits a file in that vault offline | B's edit arrives as plaintext. On apply, if the vault is protected, Rust encrypts the incoming content with the vault key **only if unlocked**; otherwise it is queued in `pending_reencrypt` and handled at next unlock, and the file is shown as "needs unlock" |
| Change password on A, B still has old wrapped key | LWW on the vault row; B receives the new wrapped key; B's cached unlocked key is dropped if `key_check` changes |

### 16.9 Acceptance ✅
- Cannot create an 11th vault locally.
- A protected vault's titles and content are unreadable in the SQLite file (verified with a hex search for a known marker string).
- Locking removes vault content from search results immediately.
- Protected vault created on Windows is unlockable on Android with the same password after sync.

---

## 17. Library shell, files, tags, trash

### 17.1 Purpose ◆ SPEC
"Your knowledge base packed with features": choose among file types, organise within vaults, intuitive writing interface, collapsible right sidebar for document settings.

### 17.2 Data
`files` (shared index for all four kinds), plus per-kind content tables. `tags`, `taggings`, `links`, `attachments`, local `view_state`.

```text
files.kind ∈ {note, canvas, codex, board}
files(id, vault_id, kind, title, icon, color, pinned, content_enc, sort_key, trashed_at, + common)
```

The shared index lets search, tags, quest links, templates and Trash treat every kind uniformly. Opening a file loads the kind-specific content lazily (React `lazy()` per editor) so the app starts fast.

### 17.3 Commands

| Command | Notes |
|---|---|
| `file_create(vault_id, kind, title?, template_id?, field_values?)` | Creates index row + empty content row (or instantiates a template, §22) |
| `file_list(vault_id, filter, sort, cursor)` | Filter by kind, tag, quest, pinned, trashed; paged |
| `file_get_meta(id)` | Index row, tags, linked quests, backlinks count |
| `file_update_meta(id, patch)` | Title, icon, colour, pin |
| `file_move(id, to_vault_id)` | If protection differs between vaults, content is re-encrypted/decrypted accordingly |
| `file_duplicate(id)` | Copies content; does not copy quest links; adds " (copy)" |
| `file_trash(ids)` / `file_restore(ids)` / `file_purge(ids)` | Trash is restorable; purge writes tombstones |
| `recent_files(limit)` | From `view_state.last_opened` (per device, local) |

### 17.4 UI
- **Desktop**: left rail → vault name + file list (grouped Pinned / Recent / All) → editor → collapsible right sidebar.
- **Mobile**: file list screen → editor screen; right sidebar becomes a bottom sheet ("Document settings").
- File list row: kind icon, title, tag chips, quest chip, updated time. Sort: updated, created, title, manual (drag).
- **New file** sheet: Note, Canvas, Codex, Board, plus "From template…".
- **Right sidebar** (shared frame; each kind contributes tabs): *Properties* (tags, icon, colour, vault, created/updated), *Outline* (Notes ToC), *Comments* (Notes), *Links* (backlinks and outgoing, assigned quests), *History* (★ S15), *Export*.

### 17.5 Tags
- A single global tag table shared by files, quests, Board cards and Codex snippets (◆ "tracking and analytics utilize a tagging system").
- Tag CRUD with colour; rename; **merge tags** (re-point taggings then tombstone the source); filter chips everywhere.
- Taggings use deterministic IDs (`uuid_v5(tag_id, entity, record_id)`), so adding the same tag on two devices merges.

### 17.6 Trash
30-day retention; a startup job purges older items by writing tombstones. Restoring a file restores its content and links.

### 17.7 Interconnections
Quests (assignment chip and header), Craft Room (save as template), Search (index on every write), Export, Board (cards can attach files), Notes (backlinks), Sync (outbox on every write).

> No nested folders are in your spec; vaults + tags + pinning + search cover organisation. Nesting can be added later with a nullable `parent_id`.

### 17.8 Acceptance ✅
- Creating each file kind produces exactly one `files` row and one content row, and two outbox entries.
- Trash → Restore round-trips content and tags.
- Moving a file between a protected and an unprotected vault leaves no plaintext (protected → unprotected is the reverse; verified both ways).

---

## 18. Notes (rich text)

### 18.1 Purpose ◆ SPEC
"A rich text editor with every formatting feature under the sun": headings, text colours, **highlights with custom colours**, **comments**, **backlinks**, quest tracking, **table of contents**, **word count**, **file uploads/embeds**, exports. Formatting controls appear **as a bottom bar or floating on selection** (user's choice), with document settings in a **collapsible right sidebar**.

### 18.2 Why TipTap
ProseMirror-based, schema-driven, stores as plain JSON, extensible for every KAISEN-specific feature, works in Android WebView, has React bindings. Document JSON is stored in `note_content.doc`.

### 18.3 Formatting inventory ◆

| Group | Features | TipTap approach |
|---|---|---|
| Text | Bold, italic, underline, strikethrough, subscript, superscript, inline code, clear formatting | StarterKit + Underline + Subscript + Superscript |
| Style | Headings H1–H6, paragraph, **text colour**, **font family**, **font size**, **line height**, alignment | TextStyle + Color + FontFamily + custom FontSize/LineHeight + TextAlign |
| Highlights | **Multiple highlight colours, user-defined palette** | Highlight (multicolor) + palette stored in `settings["editor.highlight_palette"]` |
| Lists | Bullet, ordered, **task list**, indent/outdent | StarterKit + TaskList/TaskItem |
| Blocks | Blockquote, horizontal rule, **callout blocks**, **tables** (merge/split, header row), code block with language | Custom Callout node, Table extensions, CodeBlockLowlight |
| Links | External links, **backlinks `[[…]]`**, anchors to headings | Link + custom Backlink node |
| Media | **Images**, file attachments, embeds (YouTube-style URL embed is optional) | Custom Image/Attachment nodes backed by `attachments` |
| Review | **Comments** on selections, resolve/unresolve | Custom Comment mark + `comments` table |
| Structure | **Table of contents**, word/character count, reading time, focus mode | Heading scan; CharacterCount |
| Entry | **Markdown shortcuts**, **slash menu** (`/`), emoji picker, paste cleanup | Input rules + Suggestion + paste handler |
| Navigation | In-document find and replace | Custom search plugin |

### 18.4 Data and save pipeline

```text
editor update ─(debounce 800 ms, flush on blur/hidden)─►
  note_save(file_id, doc_json, plain_text, word_count, link_targets[], attachment_ids[])
     Rust (one transaction):
       1. encrypt content if vault protected
       2. repo.write(note_content)               → outbox
       3. diff links: kind='backlink' src=file → add/remove rows (deterministic IDs)
       4. diff attachment references → mark attachments in use
       5. search reindex (skipped if protected)
       6. files.updated_at touch
```

`plain_text` is produced by the editor (`editor.getText()`); Rust stores it only for unprotected content to rebuild the FTS index without parsing JSON.

### 18.5 Backlinks ◆
- Typing `[[` opens a popover (TipTap Suggestion) calling `file_search_titles(query)`; selecting inserts a **Backlink node** `{targetId, cachedTitle}`.
- Display uses the **live title** (looked up by ID), so renaming a note updates every link. A deleted target renders as "Missing note".
- The **Links** tab shows *Outgoing links* and *Backlinks* (reverse lookup on `links` where `dst = this file`).
- ★ **S16**: a backlink **graph view** from the same `links` data.

### 18.6 Comments ◆
- Select text → Add comment. A `comment` mark holds `commentId`; the thread body lives in `comments(file_id, anchor, body, resolved)`.
- Sidebar **Comments** tab lists threads sorted by position; clicking scrolls to the anchor; resolving greys out the highlight.
- Comments are separate synced rows, so adding comments on two devices does not conflict.

### 18.7 Table of contents ◆
Computed from heading nodes, shown in the **Outline** tab; click scrolls; collapsible levels; also insertable as an in-document block (auto-updating).

### 18.8 File uploads and embeds ◆
- Insert via picker (Windows dialog / Android system picker) or paste/drag. The file is encrypted into `att/<id>`, an `attachment` row is written, and the node references `attachment_id`.
- Images render through a Rust command `attachment_read(id)` → `Blob` URL (revoked on unmount). The WebView never receives a direct file path.
- Non-image files render as an attachment card (name, size, open/export).
- A per-file attachment list in the sidebar shows storage used.

### 18.9 Toolbars ◆
- **Bottom bar**: fixed above the keyboard, horizontally scrollable groups (Text, Paragraph, Insert, Review).
- **Floating**: appears near the selection (desktop default).
- Preference stored in `settings["editor.toolbar_mode"]` (`bottom` or `floating`), defaulting per platform; per-device override allowed via `device_settings`.

### 18.10 Quest tracking ◆
A note can be **assigned to quests** (`links` kind `quest_file`). The header shows quest chips with progress; clicking opens the quest. Completing a quest does not alter the note.

### 18.11 Export ◆ (formats confirmed in Q3)
Markdown (`.md`, with front matter and `[[links]]`), HTML, plain text, JSON (native), PDF (Windows via print-to-PDF; Android PDF is a **⚠ risk**: fall back to HTML/Markdown share if the print path fails spike). Images are included as files in a zip.

### 18.12 Interconnections
Quests (assign, header chips), Craft Room (note → template; template → note with `{{tokens}}`), Search (title + body), Tags, Board (a card can attach a note), Export, Sync (conflict copy), Version history ★ S15, Theme (editor typography tokens).

### 18.13 Sync
Document with conflict copy (§7.4). Comments, links, attachments, tags are independent rows.

### 18.14 Security 🔒
Pasted HTML is filtered by the ProseMirror schema; imported Markdown/HTML is sanitised; links open via `opener` after a scheme allow-list (`https`, `http`, `mailto`); no `javascript:` or `file:` URLs. Protected-vault notes are sealed with the vault key on every save.

### 18.15 Offline and mobile
Fully offline. Mobile uses the bottom bar, long-press selection handles, and avoids autosave mid-IME composition. The editor is lazy-loaded; the extension set is trimmed on mobile if profiling requires (tables and math are the heaviest).

### 18.16 Edge cases
Very large documents (> 100k words): warn and offer split; paste of huge HTML: truncate with notice; two quick saves race: sequence numbers in `note_save` reject stale writes from the same device.

### 18.17 Suggestions ★ (separate)
> ★ **S15 Version history** — snapshot `doc` every 5 minutes of active editing and on significant size change into `note_history` (migration 0002); browse and restore from the **History** tab. Pruning: keep 24 hourly + 30 daily snapshots.
> ★ **S16 Backlink graph view** — force-directed graph from `links`.
> ★ **S25 CRDT merge (Yjs)** — replace conflict copies with true merges later; adds complexity and storage; only worth it if you actually hit conflicts.

### 18.18 Acceptance ✅
- Type 5,000 words with no UI jank; kill the app mid-typing; relaunch loses at most the last 800 ms.
- Editing the same note on both devices offline yields one main note and one conflict copy, and neither loses text.
- `[[` link survives rename of the target; deleted target shows "Missing note".
- A protected-vault note's text is absent from the DB file and from the FTS tables.

---

## 19. Canvas (standard and Advanced)

### 19.1 Purpose ◆ SPEC
Infinite mind map: draw shapes, connect written nodes into flows, arrange images as a mood board. **Advanced canvas** adds **variables, triggers and logic**, a **Start node**, **components** for reuse, and a **sequence view** on the side.

### 19.2 Engine choice and abstraction
tldraw is the primary candidate (infinite canvas, shapes, arrows with bindings, images, freehand, touch gestures, custom shapes). ⚠ **Licence gate (Q7/S5)**: confirm terms before committing. All app code talks to a thin `CanvasEngine` interface (`load(snapshot)`, `onChange(cb)`, `getSnapshot()`, `exportPng()`, `registerShapes()`, `getGraph()`), so the engine can be replaced (fallbacks: Excalidraw for drawing, React Flow for node graphs).

### 19.3 Data
`canvas_content(file_id, doc, mode, plain_text, adv_json, + common)`.

- `doc` = engine snapshot JSON (sealed if protected).
- `mode` ∈ `standard` | `advanced`.
- `adv_json` = `{ variables: [{id, name, type, initial}], components: [{id, name, shapeIds[]}], startShapeId }`.
- Per-device viewport (pan/zoom) lives in local `view_state`, **not** in the synced document, so scrolling on your phone never conflicts with your laptop.

### 19.4 Standard features ◆
Shapes (rectangle, ellipse, diamond, sticky/text node, arrow with labels, freehand), connectors that stay attached when nodes move, images (from picker, paste, drop) stored as attachments, grouping, alignment, colours from theme tokens, zoom to fit, minimap, undo/redo, export PNG/SVG.

Images use an **asset store adapter**: when the engine asks to store an asset, Rust encrypts it into `att/<id>`, writes an `attachment` row, and returns an `kaisen-att://<id>` reference that the adapter resolves to a Blob URL on render.

### 19.5 Advanced mode ◆

| Element | Representation | Behaviour |
|---|---|---|
| **Start node** | Custom shape, singleton | Exactly one per canvas; creating a second moves the marker; deletion warns |
| **Variable** | Entry in `adv_json.variables` (+ optional Variable chip shape) | Typed (`number`, `text`, `boolean`); shown in a Variables panel; chips on the canvas display the live name and initial value |
| **Trigger node** | Custom shape with `condition` and `effect` text fields | Visual design aid: conditions may reference variable names; **no code is executed** in the core design (★ S23 adds a simulator) |
| **Flow** | Arrows between nodes with optional labels (e.g. `HP < 0`) | Defines order for the sequence view |
| **Component** | A named group of shapes (`adv_json.components`) | Collapse/expand; "Save as template" sends it to the Craft Room (§22) as a `canvas-component` template; inserting a component **copies shapes with fresh IDs** |
| **Sequence view** | Right sidebar list | Derived from the graph (below) |

**Sequence algorithm (pure function, unit-tested in TypeScript or Rust):**

```text
1. Build directed graph from arrow bindings (edge label preserved).
2. Start at the Start node. If none: show "Add a Start node".
3. Depth-first walk; at a node with several outgoing edges, order branches by edge label, then by
   y then x position, and number them (1a, 1b …).
4. Keep a visited set. On revisiting a node, emit "↺ back to #n" and stop that path (no infinite loops).
5. A component is one entry that can expand into its internal steps.
6. Nodes unreachable from Start appear under "Unconnected".
7. Clicking an entry selects and centres that node; selecting a node highlights its entry.
```

### 19.6 Interconnections
Craft Room (canvas and component templates), Quests (assignment chip), Search (all text in shapes, labels, variable names), Attachments (images), Export (PNG/SVG/JSON), Theme (canvas background and default colours).

### 19.7 Sync
Single-blob **document with conflict copy**. Because canvases are edited in bursts and are large, conflicts are rare for one person; ★ **S24** (per-record sync) would remove the remaining risk at the cost of one sync record per shape.

### 19.8 Offline and mobile ⚠
Touch gestures (pinch zoom, two-finger pan, long-press to select) must be verified on the Android WebView (spike S5). Large boards may need shape virtualisation; set a soft cap (e.g. 2,000 shapes) with a warning.

### 19.9 Edge cases
Images missing locally (not yet downloaded): show a placeholder and queue download; engine upgrade changes snapshot schema → store `doc_v` and migrate on load; two Start nodes after a merge → keep the earlier one and mark the other as a plain node.

### 19.10 Suggestions ★
> ★ **S23 Flow simulator** — step through the sequence with a variable table, evaluating trigger conditions with a safe expression evaluator (e.g. Rust `evalexpr`). Turns Advanced canvas into a real game-logic sandbox.
> ★ **S24 Per-record canvas sync** — each shape its own record for fine-grained merges.

### 19.11 Acceptance ✅
- Draw, connect, move nodes; arrows stay attached; undo works; relaunch restores everything.
- Image added on Windows appears on Android after sync (blob downloaded lazily).
- Advanced mode: Start + three connected nodes with a loop produces a correct sequence list with a "back to" marker.
- Saving a component to the Craft Room and inserting it twice produces two independent copies.

---

## 20. Codex (code snippets)

### 20.1 Purpose ◆ SPEC
Create and manage code snippets with **syntax highlighting, line numbers, popular languages, advanced search so you never lose anything**.

### 20.2 Design decision
A **Codex file is a collection of snippets** (like a gist with tabs). A new Codex starts with one snippet. Each snippet is its own synced row, so edits to different snippets never conflict.

```text
codex_snippets(id, file_id, name, language, code, sort_key, content_enc, + common)
```

### 20.3 Editor (CodeMirror 6)
- Line numbers, active-line highlight, bracket matching and auto-close, code folding, indent guides, soft wrap toggle, tab size, find/replace (regex), multiple cursors on desktop.
- Languages loaded **on demand** (JavaScript/TypeScript, Python, Rust, SQL, HTML, CSS, JSON, Markdown, YAML, Shell, C/C++, Java, Kotlin, Go, PHP, C#). Language chosen by dropdown; guessed from snippet name extension.
- Theme generated from KAISEN tokens (§29) so the editor matches every theme.
- Copy button, "Download as file" (Windows save dialog / Android share), duplicate snippet, reorder tabs (drag).

### 20.4 Search ◆
- In-file: CodeMirror search (regex, case, whole word).
- Global: FTS5 trigram over `name + code` so partial identifiers match (`getUs` finds `getUserById`). Results show the matching line and open the snippet scrolled to it.

### 20.5 Interconnections
Tags (taggings on snippets), Quests (assign file), Search, Export (single file or zip), Craft Room (Codex template with starter code and `{{tokens}}`), Theme.

### 20.6 Sync and security
Snippet `code` is a document with conflict copy (copy = a new snippet named "… (conflict)" in the same Codex). Protected vault → ciphertext. The persistent search index excludes protected code.

### 20.7 Mobile ⚠
Soft keyboards lack Tab and symbols. Provide a collapsible symbol row (Tab, `{ } ( ) [ ] < > ; : " '`) — included in ★ S20.

### 20.8 Suggestions ★
> ★ **S20 Collections, tag filters and mobile symbol row** — tag/language filter sidebar in the Codex library view, "collections" via tags, and the mobile symbol row.

### 20.9 Acceptance ✅
Create three snippets in different languages; highlighting and line numbers correct; partial-identifier search finds the right snippet; editing two different snippets on two devices offline merges with no conflict copy.

---

## 21. Board (Kanban)

### 21.1 Purpose ◆ SPEC
All-in-one task tracker: columns and cards; **assign tasks to quests**, **tags**, **categories**, **attach other files**, **customise colours**, **descriptions and checklists**.

### 21.2 Data (row-per-thing, not one big JSON)
```text
board_columns(id, file_id, title, color, sort_key, is_done, is_archive, + common)
board_cards(id, file_id, column_id, title, description, color, sort_key, due_at, quest_id, archived_at, + common)
card_items(id, card_id, text, done, sort_key, + common)          -- checklist
taggings(entity='card')  links(kind='card_file')                   -- tags and attached files
```
Why rows: each card, column and checklist item merges independently, so reordering or editing different cards on two devices never conflicts.

"Categories" in your spec are implemented as **tags** (one tag system) plus **columns**; a dedicated category field would duplicate tags.

### 21.3 Commands
`board_get(file_id)`, `column_create/update/delete/move`, `card_create/update/delete`, `card_move(card_id, to_column_id, before_id?, after_id?)`, `card_item_*`, `card_link_quest(card_id, quest_id?)`, `card_attach_file(card_id, file_id)`.

`card_move` computes a new `sort_key` between neighbours, updates `column_id`, and runs the **Done-column hook** inside the same transaction: if the destination `is_done` and the card has a `quest_id`, emit `card.done` (§33.1).

### 21.4 Drag and drop (dnd-kit)
- Sensors: Pointer (desktop, 4 px activation), Keyboard (accessible reordering with announcements), **Touch with 250 ms long-press delay** on Android to avoid hijacking scroll.
- Columns scroll horizontally with snap on mobile; cards virtualised if a column exceeds 100 cards.
- Optimistic UI: update local state immediately, then `card_move`; on error revert and toast.
- **"Move to…" menu** on every card as the non-drag fallback (accessibility and mobile precision).

### 21.5 Card detail
Title, description (plain text with Markdown preview in the prototype; rich text optional later), checklist with progress "3/5", due date, colour (left border), tags, attached files (picker over library), linked quest (selector of active quests), archive.

### 21.6 Archive column ◆
A special far-right **Archive** (non-draggable). Moving a card there sets `archived_at`; hidden by default with a "Show archived" toggle; restoring clears it.

### 21.7 Quest linkage ◆ (details in §33)
- Card → quest is one-to-one (`quest_id`). A quest can have many cards.
- Quest progress for `track_mode='percent'` can be **derived** from linked cards: `done_cards / total_cards`.
- When the last linked card reaches a Done column, the app **offers** "Complete quest?" (setting: auto-complete without prompt).

### 21.8 Interconnections
Quests (progress, completion prompt, chips on cards), Library files (attachments, assignment), Tags and analytics, Craft Room (Board templates with columns/cards), Search (titles, descriptions, checklist text), Export (Markdown/CSV/JSON), Theme.

### 21.9 Sync
Row-level LWW. Concurrent edits to the **same card's title** → later HLC wins. Orphan handling when a column is deleted elsewhere (§33.5).

### 21.10 Suggestions ★
> ★ **S21 Swimlanes and WIP limits** — group the board horizontally by tag or quest; optional per-column limits with a soft warning.

### 21.11 Acceptance ✅
- Drag a card across columns on Windows and on Android (long-press); order persists and syncs.
- Moving a card with a linked quest into Done updates quest progress and shows the completion prompt.
- Deleting a column on one device while adding a card to it on the other results in the card appearing in the first column after sync, nothing lost.

---

## 22. Craft Room (templates)

### 22.1 Purpose ◆ SPEC
"Store and sort saved templates." Any library file can become a template, or build one directly in the Craft Room. Templates can be made from **any library file type, or quests**. Three views: **Build** (field editor), **Preview** (live render per target type), **Settings** (auto-fill date, require all fields, pin to Gatehouse, default emoji, colour, vault, visibility).

### 22.2 Data
```text
templates(id, name, target_kind, schema_json, scaffold, settings_json, emoji, color,
          default_vault_id, pinned_gatehouse, hidden, schema_v, + common)
target_kind ∈ { note, canvas, canvas_component, codex, board, quest }
```

`schema_json` — field definitions. `scaffold` — the content skeleton (TipTap JSON, canvas snapshot, code, board structure, or quest defaults) containing **tokens**. `settings_json` — behaviour flags.

### 22.3 Field types ◆ (type badge, label, required toggle, type-specific config)

| Type | Config | Produces |
|---|---|---|
| Text | placeholder, max length | Single-line string |
| Long text | rows, max length | Multi-line string |
| Select | options list (label, value), default | One option |
| Number | min, max, step, unit | Number |
| Date | default today?, format | Date |
| Checklist | default items | List of items |
| File link | allowed kinds | Reference to a library file |
| Quest link | main, side or any | Reference to a quest |

Validation lives in Rust (`template_validate(schema)`), so a malformed template can never be saved or instantiated: unique field IDs, `min ≤ max`, select has at least one option, etc.

### 22.4 Tokens and instantiation
- Tokens: `{{field_id}}` for user fields and built-ins `{{today}}`, `{{now}}`, `{{vault}}`, `{{title}}`.
- Instantiation (`template_instantiate(template_id, field_values, target_vault_id?)`):
  1. Validate values against the schema (required fields enforced when **Require all fields** is on).
  2. Deep-walk the scaffold JSON replacing tokens in string leaves only (never in structural keys).
  3. Assign **fresh IDs** to every node, card, column, shape and checklist item.
  4. Create the file (or quest) and its content in one transaction; apply default emoji, colour, vault.
  5. Record `links(kind='template_origin')` from the new file to the template (informational).
- A template is a **snapshot**: editing a template does not change files created earlier.

### 22.5 Build tab ◆
Draggable field rows (dnd-kit) showing type badge, label input, required/optional toggle, type-specific config panel; fields deletable individually; edits stay in a draft held in Zustand and are committed on **Save** (with an unsaved-changes guard).

### 22.6 Preview tab ◆
A live, read-only render of what would be created, populated with sample values:
- Note → read-only TipTap; Canvas → read-only canvas; Codex → read-only editor; Board → static columns/cards; **Quest → a quest card**.
- Preview is generated by the same `instantiate` path in a dry-run mode that **writes nothing** (returns the would-be content).

### 22.7 Settings tab ◆
| Setting | Behaviour |
|---|---|
| Auto-fill date | Date fields default to today (device-local) |
| Require all fields | Creation sheet blocks until every field has a value |
| Pin to Gatehouse | Appears in Gatehouse "Quick create" (§15) |
| Default emoji, colour, vault | Applied to created files; overridable in the creation sheet |
| **Visibility** (Q4) | **Shown** or **Hidden** in quick-create menus (hidden templates remain in the Craft Room) |

### 22.8 Library of templates
Grid or list with search, sort (name, recently used, created), filters (kind, tag, pinned, hidden). "Recently used" is derived from local `view_state` so using a template on one device does not generate sync churn.

### 22.9 Making a template from an existing file
`template_from_file(file_id)` serialises the content, **strips IDs and per-user data** (comments, backlink targets become plain text unless chosen), and opens the Build tab so you can mark spans as fields.

### 22.10 Interconnections
Library (create from template; save as template), Quests (quest templates; recurring quests from templates), Gatehouse (pinned), Canvas (component templates), Tags (templates can carry default tags), Vaults (default vault; protected vault target requires unlock), Search (templates are searchable).

### 22.11 Sync
LWW row per template (a template is edited in one place at a time, conflicts are unlikely).

### 22.12 Suggestions ★
> ★ **S31 Starter template pack** — ship a small set: Daily note, Meeting notes, Project Board, Bug snippet, Weekly review quest, Game-event flow (Advanced canvas).

### 22.13 Acceptance ✅
Create a Note template with a Date and a Select field; instantiate it twice → two independent notes with substituted values; Preview writes nothing to the DB (verified by outbox count); a malformed schema is rejected with a `Validation` error.

---

## 23. Quests

### 23.1 Purpose ◆ SPEC
"Enough with the boring to-do lists": **Main quests** for longer goals, **side quests** for daily to-dos. Quests attach to library files. Each quest has **custom gold** for completion. Tracking and analytics use **tags**. Metrics: **time-based (due date)**, **time tracking (hours/days)**, **simple check-off with percentage tracking**, **recurring daily quests**.

### 23.2 Data
```text
quests(id, series_id, kind[main|side], title, notes, status[active|completed|archived],
       gold_reward, due_at, track_mode[todo|checklist|percent|time], target_value, current_value,
       recurrence_json, occurrence_key, completed_at, completed_day, archived_at, sort_key, + common)
quest_items(id, quest_id, text, done, sort_key, + common)
time_entries(id, quest_id, started_at, ended_at, seconds, source[timer|manual|pomodoro], day, + common)
gold_ledger(id, amount, reason, ref_entity, ref_id, day, note, + common)       -- signed, append-only
taggings(entity='quest')   links(kind='quest_file')                              -- tags and assigned files
```

### 23.3 Metric semantics ◆

| Your metric | Implementation | Progress value |
|---|---|---|
| Time-based (due date) | `due_at` on any quest. Overdue is **derived** (`now > due_at` and active), never stored | Countdown and colour band |
| Time tracking (hours/days) | `track_mode='time'`, `target_value` in hours; `time_entries` | `sum(seconds)/3600 ÷ target` |
| Simple check-off with percentage | `track_mode='todo'` (single check) or `'checklist'` (items) | todo: 0 or 100 %; checklist: `done ÷ total` |
| Manual percentage | `track_mode='percent'`, `current_value` 0–100 (or derived from linked Board cards) | `current_value` |
| Recurring daily | `recurrence_json` (rule below) | Resets per occurrence |

A quest may combine a due date with any tracking mode.

### 23.4 Lifecycle

```text
create ──► active ──complete──► completed ──reopen──► active
              │                      
              └──archive──► archived ──restore──► active
```

Overdue and "due today" are **views over active quests**, not states.

### 23.5 Completion service (the core cross-feature transaction)

```text
quest_complete(quest_id):                                    -- one SQLite transaction
  q = quest(quest_id)
  if q.status != 'active' → return NoOp                      -- idempotent
  repo.write(quest: status='completed', completed_at=now, completed_day=local_day)
  if q.gold_reward > 0:
       id = uuid_v5(NS_LEDGER, "quest-complete:" + quest_id + ":" + q.occurrence_key)
       INSERT-IF-ABSENT gold_entry(id, +gold_reward, reason='quest', ref=quest_id, day=local_day)
  if q.recurrence_json:
       next = next_occurrence(q)                              -- e.g. tomorrow
       id   = uuid_v5(NS_QUEST, q.series_id + ":" + next.key) -- deterministic: no duplicates across devices
       INSERT-IF-ABSENT quest(copy of q with new due_at, status='active', occurrence_key=next.key)
  emit events: quest.completed, gold.earned, (quest.spawned)
```

Two devices completing the same quest offline produce the **same ledger ID and the same next-occurrence ID**, so the merged result has one reward and one next occurrence. Completion is **undoable for 10 s** (`quest_undo_complete` tombstones the ledger entry and restores `active`).

### 23.6 Recurrence
- Rule JSON: `{ "freq": "daily"|"weekly"|"monthly", "interval": 1, "byweekday": [1,3,5] }` (use the `rrule` crate for evaluation).
- **At most one active occurrence per series.** The next occurrence spawns on completion; a day-rollover job (`quests_roll_recurrence`, run on start/resume and at local midnight) spawns the current occurrence if the previous one was missed or archived. No pile-up of missed days.
- Editing a recurring quest asks: *this occurrence* or *this and future* (future = update the series template fields).

### 23.7 Time tracking
- `timer_start(quest_id)` writes a `time_entry` with `ended_at = NULL`; **only one running timer** app-wide (starting another stops the first).
- The running time is computed from `started_at`, so killing the app never loses time.
- `timer_stop` writes `ended_at`, `seconds`, `day`. A running timer is visible on the other device after sync; stopping it from either device is last-write-wins on that row.
- Manual entry (`time_entry_add`) for forgotten timers.

### 23.8 Gold ◆
- Per-quest custom `gold_reward` (integer ≥ 0). Balance = `SUM(amount)` over live ledger rows; there is no stored balance to drift.
- Ledger reasons: `quest`, `purchase`, `manual` (adjustment), `undo` is a tombstone, not a new reason.

### 23.9 Quest creation sheet ◆
Title, kind (main/side), notes, gold, due date/time, tracking mode and target, checklist items, tags, assigned files (picker), recurrence, reminder (§32). Quick-add: a single title field in Journey creates a side quest instantly.

### 23.10 Interconnections (summary; full matrix §33)
Library (assign files, header chips), Board (card ↔ quest, progress derivation), Gold ledger (reward), Shop (spending), Journey (timeline, analytics), Tags (analytics grouping), Templates (quest templates), Notifications (due reminders), Gatehouse (today's quests), Search (titles/notes).

### 23.11 Edge cases
| Case | Behaviour |
|---|---|
| Completing a quest with an unfinished checklist | Prompt: complete anyway (marks items done) or cancel |
| Quest deleted while files assigned | Links are tombstoned; files unaffected |
| Rolling DST/timezone change | Day boundaries use stored `completed_day`; due times are absolute instants |
| Reopening a completed quest | Tombstones its ledger entry (gold reversed) after confirmation |

### 23.12 Suggestions ★
> ★ **S18 Focus timer** — 25/5 Pomodoro cycles on a quest; each finished block logs a `time_entry` (`source='pomodoro'`).
> ★ **S19 Quest hierarchy** — nullable `parent_id`; side quests roll up into a main quest's progress.
> ★ **S30 Streak freezes / rest days** — skip days without breaking a streak.

### 23.13 Acceptance ✅
- Completing a quest awards exactly its gold once even if tapped twice, or completed on both devices offline.
- A daily quest completed today spawns exactly one occurrence for tomorrow; missing a day does not create two.
- A running timer started on Windows can be stopped on Android after sync and totals correctly.

---

## 24. Shop and Inventory

### 24.1 Purpose ◆ SPEC
Create items, spend quest gold, view and use what you own. Fully customisable shop (name, cost, icon/picture, description…). **Two tabs: Inventory first, Shop second.** RPG-style inventory with **hover for description breadcrumbs**; buying auto-adds to inventory; **dimmed if you can't afford it**.

### 24.2 Data
```text
shop_items(id, name, description, icon, cost, consumable, available, + common)    -- icon: emoji or attachment id
inventory_events(id, item_id, item_name, delta, reason[purchase|use|adjust], ledger_id, day, + common)
gold_ledger(...)                                                                  -- shared with quests
taggings(entity='item')                                                           -- optional categories
```
Quantity is **derived**: `SUM(delta)` per item. Events (not counters) so two offline devices merge by union. `item_name` is snapshotted so history stays readable if an item is later deleted.

### 24.3 Commands and services
| Command | Behaviour |
|---|---|
| `shop_item_create/update/delete` | Delete tombstones the item; owned quantity remains visible as "(removed)" |
| `shop_list()` | Items with `can_afford`, `deficit`, `owned_qty` |
| `shop_purchase(item_id, qty=1)` | One transaction: check balance ≥ cost×qty; add ledger `-cost×qty`; add inventory event `+qty` linked by `ledger_id` |
| `inventory_list()` | Owned items with quantities |
| `inventory_use(item_id)` | Event `delta −1`, `reason='use'`; toast "Used {item}" |
| `gold_balance()` | `SUM(amount)` |

### 24.4 UI
- **Inventory** (default tab): square RPG grid; each cell shows icon, quantity badge. **Desktop hover / mobile tap-and-hold** opens a tooltip card: name › category (tag) › description, quantity, "Use" button. Empty state: "Your bag is empty — visit the shop."
- **Shop**: same grid; each tile shows icon, name, cost with the gold icon. **Dimmed (50 %) and non-purchasable when unaffordable**, labelled "Need N more". Buying plays a coin-spend animation and the item appears in Inventory (badge on the tab).
- Item editor: name, description, icon (emoji picker or image), cost, consumable toggle, category tag. Purchase history list under Inventory (from ledger and events).

### 24.5 Offline concurrency
Two devices can both buy offline. After merge the balance may go **negative**; the UI shows a "debt" state and blocks purchases until the balance is positive again. This is accepted rather than adding a global lock.

### 24.6 Interconnections
Quests (gold source), Journey analytics (earned vs spent), Tags (categories), Attachments (item pictures), Gatehouse (balance), Search (item names), Export.

### 24.7 Suggestions ★
> ★ **S22 Limited stock and expiry** — `stock` and `available_until` on items for time-boxed rewards ("this treat expires Friday").

### 24.8 Acceptance ✅
Buying an item deducts gold and increments inventory atomically (kill the app mid-purchase: either both or neither); an unaffordable item is dimmed with the exact deficit; using a consumable decrements quantity; two offline purchases on two devices merge to the sum.

---

## 25. Journey (Quests, Timeline, Analytics)

### 25.1 Purpose ◆ SPEC
Track active quests, a **quest timeline**, and **analytics**, split into main and side. Three tabs at the top: **Quests** (with a **New quest** option), **Timeline/Journey**, **Analytics**. Timeline is **vertical scrolling** with an outline of all active quests.

### 25.2 Quests tab
- Two sections: **Main quests** (large cards: title, progress ring, due countdown, gold, linked files count) and **Side quests** (compact rows with check circles).
- Header: **+ New quest** (always visible), filter by tag/status/overdue, sort (due, manual, gold).
- Actions: tap circle to complete (animation + gold toast, 10 s undo), swipe/long-press for archive, drag to reorder (fractional keys), tap to open detail drawer (all fields, checklist, time log, linked files, linked Board cards).
- Running timer pill pinned at the top while a timer is active.

### 25.3 Timeline tab — recommended design (you asked for suggestions)

> ◆ **SPEC** requires a vertical scrolling timeline with an outline of active quests. The structure below is my **recommended minimal design**; the richer map is ★ S14.

```text
┌ Timeline ───────────────────────────────┐
│ Filters: [All ▾] [Tags ▾] [Overdue ○]   │
│                                         │
│ ▌ OVERDUE (2)                           │  red
│   ● Renew passport          Oct 1  ◆50  │
│ ▌ TODAY — Fri 2 Oct                     │
│   ● Write chapter 3         18:00  ◆80  │
│   ○ Gym                     daily  ◆10  │
│ ▌ UPCOMING                              │
│   ○ Ship v0.2               Oct 9  ◆300 │
│ ▌ NO DATE                               │
│ ───────────── PAST ──────────────────── │
│ ▌ Thu 1 Oct   ✔ Gym ◆10  ✔ Email ◆5    │
│ ▌ Wed 30 Sep  ✔ Plan sprint ◆40        │
└─────────────────────────────────────────┘
```

Behaviours: sticky section headers; "Today" anchor button; due colour bands (green → amber → red); completed history grouped by day with gold earned per day; tap opens the detail drawer; infinite scroll in the past (paged queries by `completed_day`); an **outline** (desktop right rail / mobile pull-down) lists active main quests with progress for quick jump.

### 25.4 Analytics tab ◆ (queries run locally in SQLite; no network)

| View | Chart | Query sketch (SQLite) |
|---|---|---|
| Quests completed per week | Line/bar | `SELECT strftime('%Y-W%W', completed_day) AS w, COUNT(*) FROM quests WHERE status='completed' AND deleted_at IS NULL AND completed_day >= :from GROUP BY w` |
| Gold earned vs spent per month | Stacked bar | `SELECT substr(day,1,7) m, SUM(CASE WHEN amount>0 THEN amount END) earned, SUM(CASE WHEN amount<0 THEN -amount END) spent FROM gold_ledger WHERE deleted_at IS NULL GROUP BY m` |
| Completion rate by tag | Horizontal bar | join `taggings` (entity `quest`) → `quests`; `COUNT(*) total, SUM(status='completed') done` per tag |
| Time logged by tag / quest | Donut + table | join `time_entries` → quest taggings; `SUM(seconds)/3600.0` |
| Consistency heatmap + streaks | 365-day grid | `SELECT completed_day, COUNT(*) FROM quests WHERE status='completed' … GROUP BY completed_day`; streak computed in Rust over the set of days |
| On-time ratio, overdue count | KPI tiles | `SUM(completed_at <= due_at)` over completed quests with a due date |
| Current balance + last entries | KPI + list | `SUM(amount)`; last 20 ledger rows |

All date windows take a **local-day parameter** from Rust (never `date('now')`, which is UTC). Range selector: 7 d / 30 d / 90 d / 1 y / all. Tapping a bar filters the Quests tab to that tag.

### 25.5 Interconnections
Reads from Quests, Time entries, Ledger, Tags. Writes nothing. Links into Library (via quest files) and Shop (balance tile).

### 25.6 Suggestions ★
> ★ **S14 Quest-Log journey map** — a vertical "path" where each main quest is a spine segment with milestone nodes (its checklist items or linked Board cards); side quests branch off as small leaves; the filled portion of the spine shows progress; a "you are here" marker sits at today. Gives the RPG feel your spec is going for.
> ★ **S26 Calendar view** — month grid toggle on the Timeline.

### 25.7 Acceptance ✅
Charts render offline from local data within 300 ms for 5,000 quests; filters by tag change all charts consistently; heatmap day boundaries match local time after changing device timezone.

---

## 26. Profile

### 26.1 Purpose ◆ SPEC
A Profile room. For a personal build it is your identity, security and devices page.

### 26.2 Contents
| Section | Content | Source |
|---|---|---|
| Identity | Display name, avatar (attachment), account email, user ID (UUID, copyable) | `settings`, Supabase |
| Progress | Gold balance, level/streak summary (read-only) | Ledger, quests |
| Security | **MFA factors** (list, add a second TOTP, remove — removal requires `aal2`), change master passphrase, **view/regenerate recovery key** (requires passphrase), auto-lock options, lock now | Supabase MFA API, Rust keys |
| Sessions | "Sign out other devices" (`signOut({scope:'others'})`), sign out this device | Supabase |
| Devices | Name, platform, app version, last seen, last sync — for each device that has synced | synced `device` records |
| Data | Counts, DB size, attachment storage, last backup, **Wipe this device**, **Wipe cloud data** | Rust, Supabase |

### 26.3 Device records
On each sync, a device writes its own `device` row (`name`, `platform`, `app_version`, `last_seen_at`, `last_sync_at`). Seeing the other device's version in the Profile also reveals **version skew** (§7.9).

### 26.4 Dangerous actions 🔒
- **Wipe this device**: deletes local DB, attachments and keys after typed confirmation; cloud untouched.
- **Wipe cloud data**: typed confirmation + current aal2; deletes the user's `sync_records`, `user_keys` and storage objects via RLS-scoped calls. Local data remains and can be re-uploaded (a fresh `user_keys` is created on next setup).
- Changing the master passphrase re-wraps the DEK and updates `user_keys` atomically (Supabase update succeeds before the local state commits; otherwise rollback).

### 26.5 Acceptance ✅
Adding a second TOTP factor works; "Sign out other devices" invalidates the other device's session (it then shows "Needs sign-in" while still editable offline); changing the passphrase on Windows lets Android unlock with the new passphrase after its next sync-and-lock.

---

## 27. Settings, shortcuts, accessibility

### 27.1 Principles ◆ SPEC
"Fully user customizable, within reason": hotkeys, accessibility, and more.

### 27.2 Storage model
| Store | Table | Scope |
|---|---|---|
| Account-wide preferences | `settings` (synced; ID = `uuid_v5("setting", key)`) | Follows you across devices (theme, editor defaults, highlight palette, gold display) |
| Device-specific | `device_settings` (local) | Auto-lock times, biometric toggle, toolbar mode override, window state, Wi-Fi-only downloads |
| Shortcuts | `shortcuts` (local) | Muscle memory is device-specific |

Deterministic IDs per key mean the same setting changed on two devices merges by LWW.

### 27.3 Categories
| Category | Settings |
|---|---|
| Appearance | Theme, accent, light/dark/system, font family and size, UI density, reduce motion |
| Editor | Toolbar mode, spell check, autosave interval, default highlight palette, page width, focus mode defaults |
| Keyboard shortcuts | Full remap table (below) |
| Library and vaults | Default vault, Trash retention, vault auto-lock, new-file defaults |
| Quests and shop | Gold icon/label, auto-complete quest when cards done, reminder defaults, recurrence rollover time |
| Sync and storage | Sync now, **Wi-Fi only** for attachments, max attachment size, force full re-sync (rebuild from cloud), sync diagnostics (★ S07) |
| Security | Auto-lock timers, lock on background, clipboard clearing (★ S11), secure screen (★ S04), biometrics (★ S02) |
| Accessibility | Reduce motion, high-contrast theme, larger touch targets, text scaling (follows system), screen-reader labels, dyslexia-friendly font option |
| Data | Export, backup, restore, import (★ S28), wipe |
| About | Version, schema version, payload version, update check, release notes, licences |

### 27.4 Default shortcut map (Windows; all remappable) ◆
| Action ID | Default | Action ID | Default |
|---|---|---|---|
| `palette.open` | Ctrl+K | `file.new` | Ctrl+N |
| `search.global` | Ctrl+Shift+F | `quest.new` | Ctrl+Shift+Q |
| `nav.gatehouse` … `nav.settings` | Ctrl+1 … Ctrl+7 | `sidebar.toggle` | Ctrl+\ |
| `focus.toggle` | F11 | `lock.now` | Ctrl+L |
| `editor.bold` etc. | Standard | `timer.toggle` | Ctrl+Shift+T |
| `quickcapture` (★ S17) | Ctrl+Alt+N (global) | `help.shortcuts` | Ctrl+/ |

The remap UI detects **conflicts**, offers "reset to default", and exports/imports a JSON map. Android exposes the same actions through the palette and, for hardware keyboards, the same accelerators.

### 27.5 Accessibility requirements ◆
- Text size follows system font scale (use `rem`).
- Contrast ≥ 4.5:1 for text in every preset theme (★ S32 adds an editor-side checker).
- Visible focus rings, logical tab order, ARIA labels on icon buttons, live regions for toasts and drag announcements (dnd-kit provides announcements).
- Touch targets ≥ 48 dp; no gesture is the *only* way to do something (always a menu or button).
- Reduce-motion disables confetti, parallax and animated charts.

### 27.6 Acceptance ✅
Changing the accent on Windows changes Android after sync; remapping `palette.open` takes effect without restart and the palette lists the new accelerator; with Reduce motion on, completing a quest shows no confetti.

---

## 28. Search and command palette

### 28.1 Purpose ◆ SPEC
"Advanced search, find anything anywhere in the app." Codex also needs advanced search.

### 28.2 Index design
```sql
search_map(rowid INTEGER PRIMARY KEY, entity TEXT, record_id TEXT, vault_id TEXT, UNIQUE(entity, record_id))
search_index  -- FTS5(title, body, tags, tokenize='trigram') ; rowid matches search_map.rowid
```
- `trigram` tokenizer gives **substring matching** (`getUs` → `getUserById`), ideal for code and partial words. Queries shorter than 3 characters fall back to `LIKE` on titles.
- The index is maintained by Rust (`search_service::reindex`) after each write, **not** by SQL triggers, because content is JSON/encrypted and needs extraction. It is fed from `plain_text` and for Board/Quest/Template from their fields.
- **Indexed**: note text, canvas text, code, Board titles/descriptions/checklists, quests, templates, shop items, tag names. **Never persisted**: protected-vault content (a temporary in-memory index exists only while that vault is unlocked, §5.7).
- Rebuild: `search_reindex_all()` (Settings → Data) for recovery or after a schema change.

### 28.3 Query features
| Feature | Behaviour |
|---|---|
| Ranking | `bm25` with title weighted above body; recent files get a mild boost |
| Filters | kind, vault, tag, date range, "assigned to quest" |
| Syntax | Plain terms; `"exact phrase"`; `-exclude`; `tag:work`; `in:codex`; `vault:Projects` |
| **Regex mode** | Toggle; uses a registered SQL function `regexp(pattern, text)` backed by the Rust `regex` crate; runs over FTS candidates first, then a bounded scan |
| Excerpts | `snippet()` with highlighted matches |
| Open at match | Notes: find-decoration scrolls to the first match; Codex: scrolls to the line; Board: opens the card |

### 28.4 Command palette ◆
`Ctrl+K` (desktop) or a search button (mobile) opens one input with **modes by prefix**:

| Prefix | Mode |
|---|---|
| (none) | Search files, quests, templates, items |
| `>` | Actions from the action registry (§14.4) |
| `#` | Tags |
| `@` | Vaults / jump to room |
| `?` | Help and shortcut list |

Results are grouped and keyboard-navigable; recent items shown on empty input.

### 28.5 Acceptance ✅
50,000 rows searched under 150 ms; partial identifier finds the code snippet; a locked vault's content never appears; regex mode finds `TODO\(\w+\)`; opening a result lands at the match.

---

## 29. Theme system

### 29.1 Purpose ◆ SPEC
"Fully customizable themes", "modern and appealing UI", light/dark support.

### 29.2 Architecture
All colours, radii and shadows come from **CSS custom properties** on `:root` / `[data-theme]`. Tailwind v4 maps them into utilities via `@theme inline`, so components never hard-code colours and a theme switch is a variable swap (no re-render of the React tree).

```css
/* src/styles/tokens.css  (agent: verify syntax against the installed Tailwind version) */
@import "tailwindcss";

@theme inline {
  --color-bg: var(--kaisen-bg);
  --color-surface: var(--kaisen-surface);
  --color-elevated: var(--kaisen-elevated);
  --color-accent: var(--kaisen-accent);
  --color-accent-fg: var(--kaisen-accent-fg);
  --color-text: var(--kaisen-text);
  --color-muted: var(--kaisen-text-muted);
  --color-border: var(--kaisen-border);
  --color-gold: var(--kaisen-gold);
  --color-danger: var(--kaisen-danger);
  --color-success: var(--kaisen-success);
  --radius-card: var(--kaisen-radius);
}

:root, [data-theme="midnight"] {
  --kaisen-bg: #0f1117;  --kaisen-surface: #171a23;  --kaisen-elevated: #1f2330;
  --kaisen-accent: #6c8cff; --kaisen-accent-fg: #0b0d14;
  --kaisen-text: #e6e8ef; --kaisen-text-muted: #9aa1b5; --kaisen-border: #2a2f40;
  --kaisen-gold: #f5b83d; --kaisen-danger: #ef5b5b; --kaisen-success: #38c172; --kaisen-radius: 14px;
}
[data-theme="dawn"] { --kaisen-bg:#fbf8f3; --kaisen-surface:#ffffff; --kaisen-elevated:#f3eee6; --kaisen-accent:#d9822b; --kaisen-accent-fg:#ffffff; --kaisen-text:#241f19; --kaisen-text-muted:#6f665a; --kaisen-border:#e4dccf; }
```

### 29.3 Tokens

| Token | Controls | User-editable |
|---|---|---|
| `--kaisen-bg`, `--kaisen-surface`, `--kaisen-elevated` | Window, cards/panels, modals/menus | Yes |
| `--kaisen-accent`, `--kaisen-accent-fg` | Primary actions and focus rings, text on accent | Yes |
| `--kaisen-text`, `--kaisen-text-muted` | Body and secondary text | Yes |
| `--kaisen-border` | Dividers, inputs | Yes |
| `--kaisen-gold` | Gold currency colour | Yes (default fixed gold) |
| `--kaisen-danger`, `--kaisen-success` | Destructive and success states | Preset only (semantic) |
| `--kaisen-radius` | Corner roundness (Sharp / Soft / Round) | Yes |
| Font family, base size, line height, density | Typography and spacing scale | Yes |

### 29.4 Presets and custom themes
Ship at least: **Midnight** (default dark), **Dawn** (light), **Forest**, **Void** (OLED black), **Parchment** (sepia, suits the quest aesthetic), **Slate**, and a **High contrast** theme. A **Theme editor** edits tokens with colour pickers and a live preview; custom themes are stored in `settings["theme.custom.<id>"]` (synced) and listed beside presets. "System" mode follows `prefers-color-scheme` and picks the user's chosen light/dark pair.

### 29.5 Applying themes to third-party surfaces
| Surface | Mechanism |
|---|---|
| TipTap | Typography classes using tokens; highlight colours independent of theme |
| CodeMirror | Theme extension generated from tokens (background, gutters, selection, syntax palette derived per light/dark) |
| Canvas | Default stroke/fill palette from tokens; engine theme set to light/dark |
| Charts | Series colours from a token-derived palette |
| Android system bars | Match `--kaisen-bg` (set meta `theme-color`; a native bridge may be needed for navigation-bar colour — verify in spike) |

### 29.6 Suggestions ★
> ★ **S32 Contrast checker** — theme editor warns when text/background pairs fall below 4.5:1 and offers an auto-fix.

### 29.7 Acceptance ✅
Switching themes changes every surface (editor, code, canvas, charts) within one frame; the choice syncs; the High contrast theme passes the 4.5:1 rule on all text pairs.

---

## 30. Export, import and backup

### 30.1 Export ◆ SPEC ("file exports")
| Scope | Formats | Notes |
|---|---|---|
| One file | Note: Markdown, HTML, plain text, JSON, PDF · Canvas: PNG, SVG, JSON · Codex: original source files (zip for several) · Board: Markdown, CSV, JSON | Attachments exported alongside (zip) |
| One vault | Folder of Markdown and files with front matter (title, tags, dates, quests), as a zip | Protected vaults require unlock |
| Everything | JSON dump + attachments (zip) | Plaintext warning dialog; this file is **not** encrypted |

Delivery: Windows save dialog; Android system document picker or share sheet.

PDF note ⚠: Windows can print-to-PDF from the WebView. Android PDF generation needs a native print path; if the spike fails, offer HTML/Markdown share instead and mark PDF as Windows-only.

### 30.2 Encrypted backup (★ S27 covers scheduling)
Manual backup is core because it is your last line of defence; scheduling is the suggestion.

```text
file: kaisen-YYYYMMDD-HHMM.kaisenback   (single file)
 ├─ header (plaintext JSON): format version, created_at, app version, schema version,
 │                           kdf params + salt + wrapped_dek_pass  (so the passphrase alone restores it)
 └─ body: sealed with HKDF("kaisen/backup/v1") :
          SQLite online-backup snapshot (consistent) + encrypted attachment files
```

- Snapshot via the SQLite **online backup API** (consistent while the app runs).
- **Restore** flow: pick file → passphrase → unwrap DEK from header → verify → make a safety backup of the current DB → replace → ask whether to **re-sync from cloud** (merge) or **overwrite cloud** (rare; typed confirmation).
- ✅ **ACCEPTANCE** — Restore on a clean install with only the backup file and passphrase reproduces all content; opening the file in a hex editor shows no plaintext marker strings.

### 30.3 Import
Not in your spec; useful for moving existing notes in. ★ **S28 Markdown/Obsidian import** — folder of `.md` files → notes in a chosen vault, `[[wikilinks]]` resolved to backlinks, front matter → tags, images → attachments. HTML is sanitised first.

---

## 31. In-app roadmap and feedback

◆ **SPEC** — "User guided roadmap, your feedback is everything." In a one-user build the "user" is you, so this becomes a lightweight idea pipeline.

| Piece | Design |
|---|---|
| **What's new** (core) | After an update, a one-time sheet shows the `notes` from `latest.json` |
| **Ideas board** (★ S29) | A special Board in a dedicated vault ("Dev") with columns *Ideas → Next → Building → Done*. A quick-add button (and Android share target ★ S05) captures an idea from anywhere. Cards link to quests ("build this") so roadmap work earns gold, which is a nice touch given the app's theme |
| **Bug report helper** (core) | "Export diagnostics" bundles app version, schema version, platform, sync state and a content-free log tail for pasting into an issue |

---

## 32. Notifications

### 32.1 Purpose
Quest reminders and sync/update notices, local only (no push server).

### 32.2 Design
- **Local notifications** via the Tauri notification plugin. Windows: toasts. Android: scheduled local notifications (⚠ verify scheduling APIs in the spike); request the `POST_NOTIFICATIONS` runtime permission on Android 13+. Avoid exact-alarm permission; a few minutes of imprecision is acceptable.
- A `reminders` pass runs after every sync and on every quest change: it **cancels and recreates** the scheduled set for active quests with a due time (offsets: at due, 15 min, 1 h, 1 day; per-quest and default in Settings), skipping quests completed or archived.
- Quiet hours (default 22:00–07:00) delay non-urgent reminders.
- 🔒 Notification text for quests in **protected vaults** (via assigned files) or marked private is generic ("A quest is due"), so nothing sensitive reaches the lock screen.

### 32.3 Edge cases
Device timezone changes → reschedule on resume; app not opened for days → Android may drop scheduled items after reboot, so reschedule on next launch and show a "missed" digest in the Gatehouse.

---

## 33. Interconnectivity

This section is the integration contract between features. When two features interact, they do it through one of four mechanisms and nowhere else: **(1)** the shared `links`/`taggings` edge tables, **(2)** a domain event handled inside a service transaction, **(3)** a shared derived value (gold balance, search index), or **(4)** the action registry.

### 33.1 Domain events (handled synchronously inside the originating transaction)

| Event | Emitted by | Consumers and effects | Idempotency |
|---|---|---|---|
| `file.created` / `file.updated` / `file.trashed` | Library, editors | Search reindex; `view_state.recent`; Gatehouse refresh | Reindex is replace-by-key |
| `note.saved` | Notes | Diff backlinks into `links`; mark attachments used; word count | Link IDs deterministic |
| `quest.completed` | Quest service | Gold entry; spawn next occurrence; Board progress refresh; analytics invalidation; reminder cancel | Ledger and occurrence IDs deterministic |
| `quest.reopened` | Quest service | Tombstone ledger entry; cancel next spawned occurrence if untouched | Tombstone is LWW |
| `card.moved` | Board service | If into Done column and `quest_id` set → `card.done` | Pure function of final state |
| `card.done` | Board service | Recompute quest progress (percent mode); offer "Complete quest?" (or auto-complete by setting) | Derived |
| `time.logged` | Quest service | Update derived quest progress (time mode); analytics | Rows immutable |
| `shop.purchased` | Shop service | Ledger debit + inventory event (same transaction) | Linked by `ledger_id` |
| `tag.merged` | Tag service | Re-point taggings; tombstone source tag; search reindex of affected rows | Deterministic tagging IDs |
| `vault.protection_changed` | Vault service | Re-encrypt files; drop/rebuild search entries; lock state | Transactional |
| `template.instantiated` | Template service | Create file/quest; `template_origin` link; "recently used" (local) | Fresh IDs |
| `sync.applied` | Sync | Referential repair (§33.5); reindex; emit changed set; reminders pass | Apply is idempotent |
| `settings.changed` | Settings | Re-apply theme/shortcuts; palettes; reminders defaults | LWW per key |

### 33.2 Edge catalogue (`links` table)

`links(id, kind, src_entity, src_id, dst_entity, dst_id, meta_json, + common)`, `id = uuid_v5(kind | src_id | dst_id)`.

| `kind` | From → To | Meaning and UI |
|---|---|---|
| `backlink` | note → file | `[[wikilink]]`; Links tab (both directions), graph (★ S16) |
| `quest_file` | quest → file | Quest assigned to a file; chip in file header, files list in quest |
| `card_file` | card → file | Board attachment |
| `template_origin` | file/quest → template | Informational provenance |
| `conflict_of` | file → file | Conflict copy points to its original |
| `attachment_use` | file → attachment | Reference count for orphan cleanup |

Tags use the separate `taggings` table (`tag_id`, `entity`, `record_id`) for the same reason: deterministic IDs and cheap reverse lookups.

### 33.3 Cross-feature transactions (all run in Rust, one SQLite transaction, one outbox batch)

| Transaction | Steps (all or nothing) |
|---|---|
| **Complete quest** | status → ledger entry → next occurrence → events (§23.5) |
| **Purchase item** | balance check → ledger debit → inventory event (§24.3) |
| **Instantiate template** | validate → substitute tokens → fresh IDs → create file + content (+ tags, default vault) → link |
| **Move file between vaults** | verify both vaults unlocked as needed → transform encryption → update `vault_id` → reindex |
| **Change vault protection** | derive keys → re-encrypt every file/comment/card text → update vault row → purge/rebuild search entries |
| **Merge tags** | move taggings → tombstone tag → reindex |
| **Restore from Trash** | clear `trashed_at` → restore dependent rows (links, taggings) → reindex |

### 33.4 Delete and cascade rules

| Deleting | Effect |
|---|---|
| Vault | To Trash with its files; purge tombstones everything inside |
| File | Content rows, comments, snippets, columns/cards/items tombstoned; `links` where the file is src or dst tombstoned; taggings tombstoned; quests remain (they only lose the assignment) |
| Quest | `quest_items`, `time_entries` kept for analytics **only if completed**; otherwise tombstoned; links/taggings tombstoned; gold already earned stays |
| Board column | Cards move to the first remaining column (or an auto-created "Recovered" column) |
| Shop item | Tombstoned; inventory events remain with snapshot names |
| Tag | Taggings tombstoned; entities remain |
| Template | Tombstoned; files created from it remain |
| Attachment | Blob deleted locally and in Storage only when no live `attachment_use` remains |

### 33.5 Referential repair after sync (runs inside `sync_apply_remote`)

Because two devices can create and delete related rows offline, and rows can arrive out of order, synced tables carry **no SQL foreign-key constraints** (Appendix A). A repair pass inside the apply transaction restores consistency:

| Detected | Repair |
|---|---|
| Card whose column is missing/tombstoned | Move to first live column of that board |
| `card_items` / `quest_items` / `comments` / `codex_snippets` whose parent is tombstoned | Tombstone child |
| `files` whose vault is tombstoned | Move to Trash |
| Taggings or links pointing at tombstoned targets | Tombstone edge |
| Duplicate tags (same name, case-insensitive) | Merge: lowest ID canonical, re-point taggings |
| Two Start nodes in one canvas | Keep earliest, demote the other |
| More than 10 live vaults | Allow; mark over-limit |
| Protected-vault content arrived as plaintext | Queue `pending_reencrypt` (§16.8) |

### 33.6 Interconnection matrix

| From ↓ / To → | Notes | Canvas | Codex | Board | Craft | Quests | Shop | Journey | Search | Tags | Vaults |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Notes** | backlinks | — | — | card attach | → template | assign | — | — | indexed | tagged | encrypted by vault |
| **Canvas** | — | components | — | — | component templates | assign | — | — | indexed | tagged | encrypted |
| **Codex** | — | — | — | card attach | → template | assign | — | — | indexed (trigram) | tagged | encrypted |
| **Board** | attach | attach | attach | — | → template | card ↔ quest | — | progress | indexed | tagged | encrypted |
| **Craft** | creates | creates | creates | creates | — | creates | — | — | indexed | default tags | default vault |
| **Quests** | files | files | files | cards | quest templates | recurrence | gold → | timeline, analytics | indexed | analytics groups | via files |
| **Shop** | — | — | — | — | — | gold ← | — | spend analytics | indexed | categories | — |

### 33.7 Build dependency graph (what must exist before what)

```text
Crypto + Keys ─► DB + Repo (outbox) ─► Sync ─► [every feature is then sync-correct by construction]
                       │
                       ├─► Vaults ─► Library/Files ─► Tags/Links ─► Notes ─► Search
                       │                                        ├─► Codex
                       │                                        ├─► Board ─┐
                       │                                        └─► Canvas │
                       └─► Quests ─► Gold ─► Shop                 Craft ◄───┘ (needs file kinds to template)
                                └─► Journey (needs quests + ledger + tags)
Settings/Theme: after the shell, before any polished UI.   Updates/Release: early skeleton, finalise last.
```

---

## 34. Registry of suggestions ★

> **Everything below is my addition — none of it is in your spec.** Accept, defer or reject each. "Rec." is my recommendation for the prototype.

| ID | Suggestion | Section | Effort | Value | Rec. |
|---|---|---|---|---|---|
| S01 | Hide entity names from the server (HMAC) | 5.6 | S | Low | Skip |
| S02 | Convenience unlock (biometrics on Android, OS credential store on Windows) | 4.5 | M | High | Phase 2 |
| S03 | Panic lock shortcut | 4.5 | S | Medium | Prototype |
| S04 | Android secure screen (block screenshots) for protected vaults | 11.1 | M | Medium | Later |
| S05 | Android "Share to KAISEN" intent (capture from other apps) | 11.1 | M | High | Phase 2 |
| S06 | Conflict Inbox screen | 7.4 | S | Medium | Prototype (basic) |
| S07 | Sync diagnostics screen | 27.3 | S | High | Prototype |
| S08 | UI-only hot update (no reinstall) | 10.4 | M | Medium | After stable |
| S09 | Generated TypeScript types from Rust (`ts-rs`) | 2.4 | S | High | Prototype |
| S10 | Pin and audit dependencies on a schedule | 2.4 | S | Medium | Prototype |
| S11 | Clipboard auto-clear for protected content | 12 | S | Medium | Later |
| S12 | Passphrase strength estimator | 4 | S | High | Prototype |
| S13 | Tombstone garbage collection | 7.8 | S | Low | Later |
| S14 | Quest-Log journey map (RPG-style timeline) | 25.6 | L | High (fits theme) | Phase 2 |
| S15 | Note version history | 18.17 | M | High | Phase 2 |
| S16 | Backlink graph view | 18.17 | M | Medium | Later |
| S17 | Windows global quick-capture hotkey | 27.4 | M | High | Phase 2 |
| S18 | Focus (Pomodoro) timer on quests | 23.12 | S | Medium | Later |
| S19 | Quest hierarchy (parent/child roll-up) | 23.12 | M | High | Phase 2 |
| S20 | Codex collections, tag filters, mobile symbol row | 20.8 | M | Medium | Later |
| S21 | Board swimlanes and WIP limits | 21.10 | M | Low | Later |
| S22 | Shop limited stock and expiry | 24.7 | S | Medium | Later |
| S23 | Advanced-canvas flow simulator | 19.10 | L | Medium | Later |
| S24 | Per-record canvas sync | 19.10 | L | Low | Skip unless conflicts occur |
| S25 | CRDT (Yjs) note merging | 18.17 | L | Low | Skip unless conflicts occur |
| S26 | Calendar view in Journey | 25.6 | M | Medium | Later |
| S27 | Scheduled encrypted backups | 30.2 | M | High | Phase 2 |
| S28 | Markdown/Obsidian import | 30.3 | M | Medium | Later |
| S29 | In-app Ideas board (roadmap/feedback) | 31 | S | Medium | Phase 2 |
| S30 | Streak freezes / rest days | 23.12 | S | Low | Later |
| S31 | Starter template pack | 22.12 | S | Medium | Prototype |
| S32 | Theme contrast checker | 29.6 | S | Medium | Later |
| S33 | Android home-screen widget (today's quests) | — | L | Medium | Skip for now |
| S34 | Gatehouse home dashboard contents | 15 | M | High | Prototype |

Effort: S ≈ under 1 day, M ≈ 1–3 days, L ≈ a week or more for a solo developer.

---

# PART III — PROTOTYPE BUILD PACK

## 35. Milestones and acceptance tests

### 35.1 How to run the milestones

- One milestone per Claude Code session. Start each with: *"Implement milestone Mx from docs/SPEC.md §35. Read the referenced sections first. Write the tests listed. Stop when all acceptance items pass and summarise what changed."*
- A milestone is **done** only when: tests pass (`cargo test`, `npm test`), `cargo clippy -D warnings` and `npm run typecheck` are clean, the acceptance items below are demonstrated, and `docs/SPEC.md` is updated if a decision changed.
- **Sync-first order**: the data layer, outbox and sync engine are built *before* the features, so every feature is correct on two devices from its first commit.

### 35.2 Release cut lines

| Release | Milestones | You can… |
|---|---|---|
| **Prototype v0.1** | M0–M7 | Write notes on Windows and Android, offline, encrypted, 2FA-protected, synced, searchable |
| **v0.2** | M8–M10 | Run the quest, gold, shop and Journey loop on both devices |
| **v0.3** | M11–M14 | Board, Codex, Canvas, Craft Room, Gatehouse |
| **v1.0 (personal)** | M15–M17 | Themes, shortcuts, notifications, backups, OTA updates, hardening |

### M0 — Risk spikes (throwaway branches; results in `docs/SPIKES.md`)

| Spike | Question | Pass condition |
|---|---|---|
| S1 | Does a Tauri v2 app run on Windows **and** a physical Android phone? | Hello-world with an `invoke()` round-trip on both |
| S2 | Can `rusqlite` + SQLCipher build for Windows and Android arm64, with FTS5 trigram? | `PRAGMA key` works; `SELECT * FROM pragma_compile_options` shows FTS5; a trigram table matches a substring; encrypted file unreadable in a hex viewer. If blocked: try WSL2/Linux CI for Android, then evaluate SQLite3 Multiple Ciphers |
| S3 | Supabase project with TOTP | Enrol with **Proton Authenticator**, verify, and prove the restrictive `aal2` policy blocks an `aal1` session |
| S4 | Updates | Windows updater round-trip from a Supabase Storage `latest.json`; choose the Android mechanism (A/B/C of §10.4) and demonstrate one update keeping data |
| S5 | Canvas | tldraw licence terms confirmed for personal use; pinch/pan/long-press acceptable on the phone; otherwise pick the fallback |
| S6 | Argon2id speed | Unlock time on the phone ≤ 1.5 s with chosen `m`; record parameters |
| S7 | Misc feasibility | Scheduled local notifications on Android; PDF export path on Android; Android WebView back-button handling |

### M1 — Skeleton and shell
**Build**: repo layout (§3), Tailwind tokens (§29), adaptive layout shell (desktop rail / mobile tabs), router with placeholder rooms, `AppState`, `AppError`, logging with the no-plaintext rule, action registry skeleton, capability files, CSP, `.env` handling, `ts-rs` pipeline (★ S09).
**Done when**: app runs on both platforms with all rooms navigable; CSP blocks an external script; `docs/DEV_SETUP.md` exists.

### M2 — Crypto and keys
**Build**: `crypto/` (KDF, AEAD, HKDF, `Zeroizing` types), key bootstrap/unlock/lock, recovery key, passphrase change, vector tests.
**Done when**: round-trip and tamper tests pass (wrong key, flipped bit, wrong AAD all fail); lock zeroes keys (`Locked` error afterwards); passphrase change keeps old data readable; recovery key unwraps DEK; strength estimator (★ S12) wired.

### M3 — Auth, MFA and key sync
**Build**: Supabase project hardened (§4.2), `supabase.ts` with sealed session adapter, first-run wizard (sign in → TOTP enrol with QR and manual secret → passphrase → recovery key), `user_keys` upload/fetch, unlock screen, auto-lock.
**Done when**: new-device flow works end-to-end; password-only session cannot read `sync_records`; after unlock the app starts offline with no network.

### M4 — Database, repository and base entities
**Build**: migrations runner with pre-migration backup, HLC, ID helpers, fractional keys, `repo.write` with outbox, entities and commands for vaults, files, tags, taggings, links, attachments, settings, devices, Trash.
**Done when**: grep proves no direct writes to synced tables outside `repo.rs`; each write produces exactly one coalesced outbox row; unit tests for HLC monotonicity across restarts and for fractional ordering.

### M5 — Sync engine
**Build**: `sync_outbox_batch`, `sync_mark_pushed`, `sync_apply_remote` (decrypt, merge per §7.4, repair §33.5), cursor handling, TS `sync.ts` (pull/push loops, triggers, backoff, Realtime), status UI, version-skew gate, attachment queues, device records.
**Done when**: **all Appendix F scenarios pass** in the two-device simulator, plus a property test (random ops on A and B, random sync interleavings) converges to identical state; manual test with real Windows + Android passes airplane-mode edit/merge.

### M6 — Library shell and Notes
**Build**: vault selection, vault protection, Library shell, file CRUD, TipTap with extensions (§18), autosave pipeline, backlinks, comments, ToC, word count, attachments/images, right sidebar frame, conflict copy UI (basic ★ S06).
**Done when**: §16.9, §17.8 and §18.18 acceptance items pass on both platforms.

### M7 — Search and command palette
**Build**: FTS index and reindex service, regex function, query parser, palette modes, protected-vault temporary index, filters, open-at-match.
**Done when**: §28.5 passes; performance target met on a generated 50,000-row database.

### M8 — Quests and gold
**Build**: quests, items, tags, assignments, recurrence + day rollover, timer, completion service, undo, gold ledger, quest sheets and cards.
**Done when**: §23.13 passes, including the two-device double-complete test.

### M9 — Shop and Inventory
**Build**: items, purchase and use services, inventory grid with tooltips, shop grid with dimming, history.
**Done when**: §24.8 passes, including the kill-mid-purchase atomicity test.

### M10 — Journey
**Build**: Quests tab (+ New quest), Timeline (§25.3), Analytics (§25.4), streak calculation, filters.
**Done when**: §25.7 passes.

### M11 — Board
**Build**: columns/cards/items, dnd-kit with touch, archive column, quest link, Done-column hook, card detail.
**Done when**: §21.11 passes on both platforms.

### M12 — Codex
**Build**: snippets, CodeMirror with lazy languages, search integration, download/share.
**Done when**: §20.9 passes.

### M13 — Canvas
**Build**: `CanvasEngine` wrapper, asset store adapter, autosave, Advanced mode shapes, variables panel, sequence view, component save/insert.
**Done when**: §19.11 passes.

### M14 — Craft Room and Gatehouse
**Build**: template schema and validation, Build/Preview/Settings tabs, instantiate/dry-run, template-from-file, Gatehouse widgets (★ S34), starter pack (★ S31).
**Done when**: §22.13 and §15 acceptance pass.

### M15 — Settings, themes, accessibility, shortcuts, notifications
**Build**: settings model (synced vs device), theme editor and presets, shortcut remapper, accessibility options, reminders (§32), What's-new sheet.
**Done when**: §27.6 and §29.7 pass; manual accessibility pass with TalkBack and keyboard-only on Windows.

### M16 — Export, backup, diagnostics
**Build**: exports (§30.1), encrypted backup/restore, "Export diagnostics", wipe device/cloud flows.
**Done when**: §30.2 acceptance passes; a restore on a clean emulator reproduces the data.

### M17 — OTA, release pipeline, hardening
**Build**: `UpdateService` (Windows updater, Android mechanism from S4), `latest.json` manifest tooling, CI workflow (Appendix E) or local release script, keystore and signing-key backups, security checklist (§12) executed.
**Done when**: §10.6 acceptance passes with a real N→N+1 update on both devices; every item in §12 is ticked with evidence.

---

## 36. Test strategy

| Layer | Tooling | What it proves |
|---|---|---|
| Rust unit | `cargo test` | Crypto vectors, HLC, ID derivation, fractional keys, recurrence, services |
| **Sync simulator** | Rust integration tests with two in-memory DBs and a fake server implementing `sync_push`/pull | Scenarios in Appendix F |
| **Property tests** | `proptest` | Random operations on devices A and B with random sync order always converge; ledger balance equals sum of union |
| Frontend unit | Vitest + Testing Library | Key components (palette, quest card, shop tile dimming), sequence algorithm, token substitution |
| Migration tests | Rust | Upgrading a fixture DB from each previous schema version succeeds and preserves rows |
| Security tests | Scripted | Hex-search DB and backup for marker strings; grep logs for markers; RLS tests with `aal1` and second user |
| Device checklist | Manual, `docs/DEVICE_CHECKLIST.md` | Airplane-mode editing, kill app mid-write, rotate screen, background/foreground, low storage, slow network, timezone change |
| Release test | Manual per release | N→N+1 update on both devices keeps data |

**Definition of Done for any change**: tests added or updated, no plaintext in logs, no new dependency outside the allow-list without approval, spec updated if behaviour changed.

---

# APPENDICES

## Appendix A — Local SQLite schema

> **Conventions.** IDs are UUID text. `*_at` are unix milliseconds (UTC). `day` is local `YYYY-MM-DD`. Every synced table carries the four **common columns** `hlc, created_at, updated_at, deleted_at`. **No SQL `FOREIGN KEY` constraints on synced tables**: rows can arrive out of order during sync, so integrity is enforced by services and the repair pass (§33.5). Adding a column to a synced table requires bumping `payload_v` (older builds pause sync until updated, §7.9).

### A.1 `src-tauri/migrations/0001_core.sql`

```sql
-- KAISEN local schema v1 (SQLCipher). Forward-only.

-- ───────── local-only (never synced) ─────────
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- keys: schema_version, device_id, hlc_state, pull_cursor, last_sync_at

CREATE TABLE outbox (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  entity     TEXT NOT NULL,
  record_id  TEXT NOT NULL,
  op         TEXT NOT NULL CHECK (op IN ('upsert','delete')),
  hlc        TEXT NOT NULL,
  base_hlc   TEXT,                     -- version last known to the server (NULL for new rows)
  created_at INTEGER NOT NULL,
  UNIQUE (entity, record_id)           -- coalesced: at most one pending entry per record
);

CREATE TABLE sync_conflicts (
  id TEXT PRIMARY KEY, entity TEXT NOT NULL, record_id TEXT NOT NULL,
  copy_record_id TEXT, detected_at INTEGER NOT NULL, resolved_at INTEGER
);

CREATE TABLE attachment_state (
  attachment_id TEXT PRIMARY KEY, local_path TEXT,
  uploaded INTEGER NOT NULL DEFAULT 0, downloaded INTEGER NOT NULL DEFAULT 0, last_error TEXT
);

CREATE TABLE pending_reencrypt (
  entity TEXT NOT NULL, record_id TEXT NOT NULL, vault_id TEXT NOT NULL,
  PRIMARY KEY (entity, record_id)
);

CREATE TABLE device_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE shortcuts       (action TEXT PRIMARY KEY, accelerator TEXT NOT NULL);
CREATE TABLE view_state (
  entity TEXT NOT NULL, record_id TEXT NOT NULL,
  last_opened INTEGER, state_json TEXT,       -- scroll, cursor, canvas viewport (per device)
  PRIMARY KEY (entity, record_id)
);
CREATE TABLE secure_kv (key TEXT PRIMARY KEY, value BLOB NOT NULL);   -- sealed with HKDF "kaisen/kv/v1"

-- ───────── structure (synced) ─────────
CREATE TABLE vaults (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, icon TEXT, color TEXT, sort_key TEXT NOT NULL,
  protected INTEGER NOT NULL DEFAULT 0,
  kdf_salt TEXT, wrapped_key TEXT, key_check TEXT,           -- only when protected
  trashed_at INTEGER,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,                                    -- logical FK vaults.id
  kind TEXT NOT NULL CHECK (kind IN ('note','canvas','codex','board')),
  title TEXT NOT NULL DEFAULT '',                            -- 'enc:<b64>' when vault protected
  icon TEXT, color TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  content_enc INTEGER NOT NULL DEFAULT 0,
  sort_key TEXT NOT NULL,
  trashed_at INTEGER,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX files_vault ON files (vault_id, deleted_at, trashed_at);
CREATE INDEX files_kind  ON files (kind, deleted_at);

CREATE TABLE tags (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX tags_name ON tags (name COLLATE NOCASE);        -- deliberately NOT unique (offline duplicates are merged)

CREATE TABLE taggings (                                      -- id = uuid_v5(tag_id | entity | record_id)
  id TEXT PRIMARY KEY, tag_id TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('file','quest','card','snippet','item','template')),
  record_id TEXT NOT NULL,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX taggings_tag    ON taggings (tag_id, deleted_at);
CREATE INDEX taggings_target ON taggings (entity, record_id, deleted_at);

CREATE TABLE links (                                         -- id = uuid_v5(kind | src_id | dst_id)
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('backlink','quest_file','card_file','template_origin','conflict_of','attachment_use')),
  src_entity TEXT NOT NULL, src_id TEXT NOT NULL,
  dst_entity TEXT NOT NULL, dst_id TEXT NOT NULL,
  meta_json TEXT,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX links_src ON links (src_entity, src_id, kind, deleted_at);
CREATE INDEX links_dst ON links (dst_entity, dst_id, kind, deleted_at);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY, file_id TEXT, name TEXT NOT NULL, mime TEXT, size INTEGER NOT NULL, sha256 TEXT,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);

CREATE TABLE settings (                                      -- id = uuid_v5("setting", key)
  id TEXT PRIMARY KEY, key TEXT NOT NULL, value_json TEXT NOT NULL,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX settings_key ON settings (key);

CREATE TABLE devices (                                       -- id = this device's id
  id TEXT PRIMARY KEY, name TEXT NOT NULL, platform TEXT NOT NULL, app_version TEXT NOT NULL,
  last_seen_at INTEGER, last_sync_at INTEGER,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);

-- ───────── content (synced) ─────────
CREATE TABLE note_content (                                  -- id = files.id
  id TEXT PRIMARY KEY,
  doc TEXT NOT NULL,                                         -- TipTap JSON, or 'enc:<b64>'
  plain_text TEXT NOT NULL DEFAULT '',                       -- empty when protected
  word_count INTEGER NOT NULL DEFAULT 0, doc_v INTEGER NOT NULL DEFAULT 1,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);

CREATE TABLE canvas_content (                                -- id = files.id
  id TEXT PRIMARY KEY,
  doc TEXT NOT NULL,                                         -- engine snapshot JSON, or 'enc:<b64>'
  mode TEXT NOT NULL DEFAULT 'standard' CHECK (mode IN ('standard','advanced')),
  adv_json TEXT,                                             -- variables, components, startShapeId
  plain_text TEXT NOT NULL DEFAULT '', doc_v INTEGER NOT NULL DEFAULT 1,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);

CREATE TABLE codex_snippets (
  id TEXT PRIMARY KEY, file_id TEXT NOT NULL, name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'plaintext', code TEXT NOT NULL DEFAULT '',   -- code may be 'enc:<b64>'
  sort_key TEXT NOT NULL, content_enc INTEGER NOT NULL DEFAULT 0,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX codex_file ON codex_snippets (file_id, deleted_at);

CREATE TABLE board_columns (
  id TEXT PRIMARY KEY, file_id TEXT NOT NULL, title TEXT NOT NULL, color TEXT,
  sort_key TEXT NOT NULL, is_done INTEGER NOT NULL DEFAULT 0, is_archive INTEGER NOT NULL DEFAULT 0,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX columns_file ON board_columns (file_id, deleted_at);

CREATE TABLE board_cards (
  id TEXT PRIMARY KEY, file_id TEXT NOT NULL, column_id TEXT NOT NULL,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', color TEXT,
  sort_key TEXT NOT NULL, due_at INTEGER, quest_id TEXT, archived_at INTEGER,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX cards_column ON board_cards (column_id, deleted_at, sort_key);
CREATE INDEX cards_quest  ON board_cards (quest_id, deleted_at);

CREATE TABLE card_items (
  id TEXT PRIMARY KEY, card_id TEXT NOT NULL, text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0, sort_key TEXT NOT NULL,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY, file_id TEXT NOT NULL, anchor TEXT NOT NULL,
  body TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX comments_file ON comments (file_id, deleted_at);

-- ───────── craft ─────────
CREATE TABLE templates (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('note','canvas','canvas_component','codex','board','quest')),
  schema_json TEXT NOT NULL, scaffold TEXT NOT NULL, settings_json TEXT NOT NULL DEFAULT '{}',
  emoji TEXT, color TEXT, default_vault_id TEXT,
  pinned_gatehouse INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0,
  schema_v INTEGER NOT NULL DEFAULT 1,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);

-- ───────── quests and economy ─────────
CREATE TABLE quests (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,                                   -- = id for non-recurring
  kind TEXT NOT NULL CHECK (kind IN ('main','side')),
  title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  gold_reward INTEGER NOT NULL DEFAULT 0 CHECK (gold_reward >= 0),
  due_at INTEGER,
  track_mode TEXT NOT NULL DEFAULT 'todo' CHECK (track_mode IN ('todo','checklist','percent','time')),
  target_value REAL, current_value REAL NOT NULL DEFAULT 0,
  recurrence_json TEXT, occurrence_key TEXT NOT NULL DEFAULT '',
  completed_at INTEGER, completed_day TEXT, archived_at INTEGER,
  sort_key TEXT NOT NULL,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX quests_status ON quests (status, due_at, deleted_at);
CREATE INDEX quests_done   ON quests (completed_day, deleted_at);
CREATE INDEX quests_series ON quests (series_id);

CREATE TABLE quest_items (
  id TEXT PRIMARY KEY, quest_id TEXT NOT NULL, text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0, sort_key TEXT NOT NULL,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);

CREATE TABLE time_entries (
  id TEXT PRIMARY KEY, quest_id TEXT NOT NULL,
  started_at INTEGER NOT NULL, ended_at INTEGER,             -- NULL = running
  seconds INTEGER NOT NULL DEFAULT 0, day TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'timer' CHECK (source IN ('timer','manual','pomodoro')),
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX time_quest ON time_entries (quest_id, deleted_at);

CREATE TABLE gold_ledger (                                   -- append-only; amount is signed
  id TEXT PRIMARY KEY, amount INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('quest','purchase','manual')),
  ref_entity TEXT, ref_id TEXT, day TEXT NOT NULL, note TEXT,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX ledger_day ON gold_ledger (day, deleted_at);

CREATE TABLE shop_items (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  icon TEXT, cost INTEGER NOT NULL CHECK (cost >= 0),
  consumable INTEGER NOT NULL DEFAULT 1, available INTEGER NOT NULL DEFAULT 1,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);

CREATE TABLE inventory_events (                              -- quantity = SUM(delta) per item
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL, item_name TEXT NOT NULL,
  delta INTEGER NOT NULL, reason TEXT NOT NULL CHECK (reason IN ('purchase','use','adjust')),
  ledger_id TEXT, day TEXT NOT NULL,
  hlc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX inv_item ON inventory_events (item_id, deleted_at);

-- ───────── search (local only, derived) ─────────
CREATE TABLE search_map (
  rowid INTEGER PRIMARY KEY, entity TEXT NOT NULL, record_id TEXT NOT NULL, vault_id TEXT,
  UNIQUE (entity, record_id)
);
CREATE VIRTUAL TABLE search_index USING fts5(title, body, tags, tokenize = 'trigram');
-- rowid of search_index = search_map.rowid. Maintained by Rust, never by triggers.
```

### A.2 `src-tauri/migrations/0002_suggested.sql` (★ optional, apply only for suggestions you accept)

```sql
-- ★ S15 Note version history (local per device; not synced to keep sync small)
CREATE TABLE note_history (
  id TEXT PRIMARY KEY, note_id TEXT NOT NULL, snapshot TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX note_history_note ON note_history (note_id, created_at DESC);

-- ★ S19 Quest hierarchy  (synced table change: bump payload_v)
ALTER TABLE quests ADD COLUMN parent_id TEXT;

-- ★ S22 Shop limited stock / expiry  (synced table change: bump payload_v)
ALTER TABLE shop_items ADD COLUMN stock INTEGER;
ALTER TABLE shop_items ADD COLUMN available_until INTEGER;
```

### A.3 Entity names (sync) ↔ tables, and the payload definition

| Sync `entity` | Table | Merge strategy (§7.4) |
|---|---|---|
| `vault` | `vaults` | LWW row |
| `file` | `files` | LWW row |
| `note_content` | `note_content` | Document + conflict copy |
| `canvas_content` | `canvas_content` | Document + conflict copy |
| `codex_snippet` | `codex_snippets` | Document + conflict copy |
| `board_column`, `board_card`, `card_item` | `board_columns`, `board_cards`, `card_items` | LWW row |
| `comment` | `comments` | LWW row |
| `template` | `templates` | LWW row |
| `quest`, `quest_item` | `quests`, `quest_items` | LWW row |
| `time_entry` | `time_entries` | Append-only |
| `gold_entry` | `gold_ledger` | Append-only |
| `shop_item` | `shop_items` | LWW row |
| `inventory_event` | `inventory_events` | Append-only |
| `tag` | `tags` | LWW row (+ duplicate-name merge) |
| `tagging`, `link` | `taggings`, `links` | Deterministic-ID union |
| `attachment` | `attachments` | LWW row |
| `setting` | `settings` | LWW row |
| `device` | `devices` | LWW row |

**Payload** = the row serialised as a JSON object with **sorted keys**, containing every column of the table (including `hlc`, `created_at`, `updated_at`, `deleted_at`). It is sealed with the `kaisen/sync/v1` sub-key and the AAD from §5.4, then base64-encoded. Each Rust entity module implements one trait so the sync code is generic:

```rust
pub trait Synced {
    const ENTITY: &'static str;            // e.g. "quest"
    const TABLE: &'static str;             // e.g. "quests"
    const STRATEGY: MergeStrategy;         // Lww | AppendOnly | DeterministicUnion | Document
    fn to_payload(row: &rusqlite::Row) -> Result<serde_json::Value>;
    fn apply(tx: &Transaction, payload: &serde_json::Value) -> Result<()>;   // upsert exact row
    fn plain_text_for_index(tx: &Transaction, id: &str) -> Result<Option<IndexDoc>>;
}
```

---

## Appendix B — Supabase SQL

### B.1 `supabase/migrations/0001_sync.sql`

```sql
-- ───────── sync table (one generic table of encrypted records) ─────────
create sequence if not exists public.sync_seq;

create table public.sync_records (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity     text not null check (entity ~ '^[a-z_]{1,40}$'),
  id         uuid not null,
  hlc        text collate "C" not null,            -- byte-order comparison, never locale-based
  deleted    boolean not null default false,
  payload_v  smallint not null default 1,
  payload    text check (payload is null or octet_length(payload) <= 4000000),
  server_seq bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, entity, id)
);
create index sync_records_pull on public.sync_records (user_id, server_seq);

create or replace function public.sync_records_stamp() returns trigger
language plpgsql as $$
begin
  new.server_seq := nextval('public.sync_seq');
  new.updated_at := now();
  return new;
end $$;

create trigger sync_records_stamp before insert or update on public.sync_records
for each row execute function public.sync_records_stamp();

-- ───────── key material (wrapped DEK; useless without passphrase or recovery key) ─────────
create table public.user_keys (
  user_id              uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  kdf                  text not null default 'argon2id',
  kdf_params           jsonb not null,                 -- {"m_kib":65536,"t":3,"p":1}
  salt                 text not null,                  -- base64
  wrapped_dek_pass     text not null,                  -- base64(nonce || ciphertext)
  wrapped_dek_recovery text,
  key_check            text not null,                  -- sealed constant to verify a candidate DEK
  version              smallint not null default 1,
  updated_at           timestamptz not null default now()
);

-- ───────── privileges ─────────
revoke all on public.sync_records, public.user_keys from anon;
grant select, insert, update, delete on public.sync_records, public.user_keys to authenticated;
grant usage on sequence public.sync_seq to authenticated;

-- ───────── RLS: owner + (restrictive) must have completed MFA ─────────
alter table public.sync_records enable row level security;
alter table public.user_keys    enable row level security;

create policy sync_owner on public.sync_records for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sync_aal2 on public.sync_records as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

create policy keys_owner on public.user_keys for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy keys_aal2 on public.user_keys as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

-- ───────── push RPC: last-write-wins by HLC, returns per-record acceptance ─────────
create or replace function public.sync_push(rows jsonb)
returns table (out_entity text, out_id uuid, out_accepted boolean, out_hlc text)
language plpgsql security invoker set search_path = public as $$
declare r jsonb;
begin
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 200 then
    raise exception 'invalid batch';
  end if;
  for r in select value from jsonb_array_elements(rows) loop
    insert into public.sync_records as s (entity, id, hlc, deleted, payload_v, payload)
    values (
      r->>'entity', (r->>'id')::uuid, r->>'hlc',
      coalesce((r->>'deleted')::boolean, false),
      coalesce((r->>'payload_v')::smallint, 1),
      case when coalesce((r->>'deleted')::boolean, false) then null else r->>'payload' end)
    on conflict (user_id, entity, id) do update
      set hlc = excluded.hlc, deleted = excluded.deleted,
          payload_v = excluded.payload_v, payload = excluded.payload
      where s.hlc < excluded.hlc;
    return query
      select s2.entity, s2.id, (s2.hlc = (r->>'hlc')), s2.hlc
      from public.sync_records s2
      where s2.user_id = auth.uid() and s2.entity = r->>'entity' and s2.id = (r->>'id')::uuid;
  end loop;
end $$;

revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;

-- ───────── wipe helper (storage objects are removed from the client via the Storage API) ─────────
create or replace function public.wipe_my_cloud_data() returns void
language sql security invoker as $$
  delete from public.sync_records where user_id = auth.uid();
  delete from public.user_keys    where user_id = auth.uid();
$$;
revoke all on function public.wipe_my_cloud_data() from public, anon;
grant execute on function public.wipe_my_cloud_data() to authenticated;

-- ───────── realtime nudges ─────────
alter publication supabase_realtime add table public.sync_records;

-- ───────── storage ─────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)      -- 25 MB
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('releases', 'releases', true)                       -- public read; written only by CI with the service role
on conflict (id) do nothing;

create policy attachments_owner on storage.objects for all to authenticated
  using      (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy attachments_aal2 on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'attachments' or (select auth.jwt() ->> 'aal') = 'aal2');
```

### B.2 Pull query (TypeScript)

```ts
const OVERLAP = 100;
const { data, error } = await supabase
  .from("sync_records")
  .select("entity,id,hlc,deleted,payload_v,payload,server_seq")
  .gt("server_seq", Math.max(0, cursor - OVERLAP))
  .order("server_seq", { ascending: true })
  .limit(500);
```

### B.3 Dashboard checklist (not expressible in SQL)

| Setting | Value |
|---|---|
| Allow new users to sign up | **Off** (after creating your user) |
| Anonymous sign-ins, OAuth providers | Off |
| MFA (TOTP) | On (default) |
| Realtime | Enabled for `sync_records` (publication statement above) |
| Region | Nearest EU region |
| Backups | Verify plan; rely on app backups (§30) either way |

---

## Appendix C — Rust command surface

> Commands return `Result<T, AppError>`. All except `keys_*`, `app_info` and `secure_kv_*` (pre-unlock) return `AppError::Locked` when keys are not loaded. Names are the contract between `src/lib/ipc.ts` and `src-tauri/src/commands/`.

| Group | Commands |
|---|---|
| **App** | `app_info() → {version, schema_version, payload_v, platform, device_id}` · `diagnostics_export() → path` |
| **Keys** (pre-unlock allowed) | `keys_status() → {has_keys, unlocked}` · `keys_bootstrap(passphrase) → {user_keys_row, recovery_key}` · `keys_unlock(passphrase, user_keys_row)` · `keys_unlock_recovery(recovery_key, user_keys_row)` · `keys_lock()` · `keys_change_passphrase(old, new) → user_keys_row` · `keys_regenerate_recovery(passphrase) → {user_keys_row, recovery_key}` |
| **Secure KV** | `secure_kv_get(key)` · `secure_kv_set(key, value)` · `secure_kv_delete(key)` |
| **Vaults** | `vault_list` · `vault_create` · `vault_update` · `vault_set_password` · `vault_unlock` · `vault_lock` · `vault_lock_all` · `vault_trash` · `vault_restore` · `vault_purge` |
| **Files** | `file_create` · `file_list` · `file_get_meta` · `file_update_meta` · `file_move` · `file_duplicate` · `file_trash` · `file_restore` · `file_purge` · `file_search_titles(q)` · `recent_files` · `view_state_get/set` |
| **Notes** | `note_open(id)` · `note_save(id, doc, plain_text, word_count, link_targets, attachment_ids)` · `comment_list/create/update/resolve/delete` |
| **Canvas** | `canvas_open(id)` · `canvas_save(id, doc, plain_text, adv_json?)` · `canvas_set_mode` |
| **Codex** | `codex_open(file_id)` · `snippet_create/update/delete/move` |
| **Board** | `board_get(file_id)` · `column_create/update/delete/move` · `card_create/update/delete` · `card_move` · `card_item_create/update/delete/move` · `card_link_quest` · `card_attach_file` |
| **Tags and links** | `tag_list/create/rename/recolor/merge/delete` · `tag_assign/unassign(entity, id, tag_id)` · `link_add/remove(kind, src, dst)` · `links_for(entity, id)` · `backlinks_for(file_id)` |
| **Attachments** | `attachment_add(path_or_bytes, file_id?) → id` · `attachment_read(id) → bytes` · `attachment_delete` · `attachment_queue_status` |
| **Templates** | `template_list/get/create/update/delete` · `template_validate(schema)` · `template_from_file(file_id)` · `template_instantiate(id, values, vault_id?, dry_run=false)` |
| **Quests** | `quest_list(filter)` · `quest_get` · `quest_create/update/archive/restore` · `quest_complete` · `quest_undo_complete` · `quest_reopen` · `quest_item_*` · `quest_link_file/unlink_file` · `quests_roll_recurrence` · `timer_start/stop` · `time_entry_add/delete` |
| **Economy** | `gold_balance` · `ledger_list(cursor)` · `shop_list` · `shop_item_create/update/delete` · `shop_purchase(item_id, qty)` · `inventory_list` · `inventory_use(item_id)` · `inventory_history` |
| **Journey** | `timeline_page(cursor, filters)` · `analytics(view, range, filters)` · `streaks()` |
| **Search** | `search(query, filters, mode)` · `search_reindex_all()` |
| **Settings** | `settings_get_all` · `settings_set(key, value)` · `device_settings_get/set` · `shortcuts_get/set/reset` |
| **Sync** | `sync_outbox_batch(limit) → records[]` · `sync_mark_pushed(acks)` · `sync_apply_remote(rows) → ApplyReport` · `sync_cursor_get/set` · `sync_status() → {pending, last_sync_at, conflicts}` · `sync_conflicts_list/resolve` · `sync_reset_from_cloud()` |
| **Export and backup** | `export_file(id, format) → path` · `export_vault(id, format) → path` · `export_all() → path` · `backup_create() → path` · `backup_restore(path, passphrase)` · `wipe_device()` |

---

## Appendix D — Configuration files

### D.1 `src-tauri/Cargo.toml` (dependency sketch — pin exact versions at M0)

```toml
[package]
name = "kaisen"
version = "0.1.0"
edition = "2021"

[lib]
name = "kaisen_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2" }

[dependencies]
tauri = { version = "2" }
tauri-plugin-dialog = "2"
tauri-plugin-notification = "2"
tauri-plugin-clipboard-manager = "2"
tauri-plugin-opener = "2"
tauri-plugin-os = "2"

rusqlite = { version = "*", features = ["bundled-sqlcipher-vendored-openssl", "functions", "backup"] }  # pin at M0

argon2 = "*"            # pin at M0
chacha20poly1305 = "*"
hkdf = "*"
sha2 = "*"
rand = "*"
zeroize = { version = "*", features = ["derive"] }
subtle = "*"
uuid = { version = "*", features = ["v4", "v5", "v7"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
base64 = "*"
thiserror = "*"
anyhow = "*"
tracing = "*"
tracing-appender = "*"
regex = "*"
fractional_index = "*"
rrule = "*"
time = { version = "*", features = ["local-offset", "formatting", "parsing"] }
zip = "*"
ts-rs = "*"             # ★ S09

[target.'cfg(any(target_os = "macos", windows, target_os = "linux"))'.dependencies]
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
tauri-plugin-global-shortcut = "2"      # ★ S17

# [target.'cfg(any(target_os = "android", target_os = "ios"))'.dependencies]
# tauri-plugin-biometric = "2"          # ★ S02 (phase 2)

[dev-dependencies]
proptest = "*"
```

> The filesystem plugin is intentionally **not** used. Rust reads and writes files itself, so the WebView has no filesystem access at all.

### D.2 `package.json` (shape)

```json
{
  "name": "kaisen",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "tauri": "tauri",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "types": "cargo test --manifest-path src-tauri/Cargo.toml export_bindings",
    "bump": "node scripts/bump-version.mjs",
    "release": "node scripts/release.mjs"
  },
  "dependencies": {
    "react": "*", "react-dom": "*", "react-router": "*",
    "@tauri-apps/api": "*", "@tauri-apps/plugin-dialog": "*", "@tauri-apps/plugin-notification": "*",
    "@tauri-apps/plugin-clipboard-manager": "*", "@tauri-apps/plugin-opener": "*", "@tauri-apps/plugin-os": "*",
    "@tauri-apps/plugin-updater": "*", "@tauri-apps/plugin-process": "*",
    "@supabase/supabase-js": "*", "@tanstack/react-query": "*", "zustand": "*",
    "@tiptap/react": "*", "@tiptap/pm": "*", "@tiptap/starter-kit": "*",
    "tldraw": "*", "@dnd-kit/core": "*", "@dnd-kit/sortable": "*", "@dnd-kit/utilities": "*",
    "@codemirror/state": "*", "@codemirror/view": "*", "@codemirror/language": "*", "@codemirror/search": "*",
    "clsx": "*", "tailwind-merge": "*", "fractional-indexing": "*"
  },
  "devDependencies": {
    "vite": "*", "@vitejs/plugin-react": "*", "typescript": "*", "tailwindcss": "*", "@tailwindcss/vite": "*",
    "@tauri-apps/cli": "*", "vitest": "*", "@testing-library/react": "*", "eslint": "*", "prettier": "*"
  }
}
```

(Individual TipTap, CodeMirror language and tldraw packages are added by their milestones. Replace every `*` with an exact pinned version at M0, ★ S10.)

### D.3 `src-tauri/tauri.conf.json` (excerpt)

```json
{
  "productName": "KAISEN",
  "version": "0.1.0",
  "identifier": "dev.alexreid.kaisen",
  "build": { "beforeDevCommand": "npm run dev", "devUrl": "http://localhost:1420",
             "beforeBuildCommand": "npm run build", "frontendDist": "../dist" },
  "app": {
    "windows": [{ "label": "main", "title": "KAISEN", "width": 1280, "height": 800, "minWidth": 960, "minHeight": 600 }],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: asset: http://asset.localhost; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' ipc: http://ipc.localhost https://<PROJECT_REF>.supabase.co wss://<PROJECT_REF>.supabase.co; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "createUpdaterArtifacts": true,
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico"]
  },
  "plugins": {
    "updater": {
      "pubkey": "<TAURI_UPDATER_PUBLIC_KEY>",
      "endpoints": ["https://<PROJECT_REF>.supabase.co/storage/v1/object/public/releases/latest.json"],
      "windows": { "installMode": "passive" }
    }
  }
}
```

> `style-src 'unsafe-inline'` is required by ProseMirror/tldraw dynamic styles. Revisit with nonces if the engines allow it. Never add `unsafe-eval` or remote script hosts.

### D.4 Capabilities (platform split)

`src-tauri/capabilities/default.json`

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Permissions common to all platforms",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "notification:default",
    "os:default",
    "clipboard-manager:allow-write-text",
    "opener:allow-open-url"
  ]
}
```

`src-tauri/capabilities/desktop.json`

```json
{
  "identifier": "desktop",
  "description": "Windows-only permissions",
  "windows": ["main"],
  "platforms": ["windows", "linux", "macOS"],
  "permissions": ["updater:default", "process:allow-restart", "global-shortcut:allow-register", "global-shortcut:allow-unregister"]
}
```

`src-tauri/capabilities/mobile.json`

```json
{
  "identifier": "mobile",
  "description": "Android-only permissions",
  "windows": ["main"],
  "platforms": ["android", "iOS"],
  "permissions": []
}
```

(Add `biometric:default` here for ★ S02. Scope `opener:allow-open-url` to `https`, `http` and `mailto` per the plugin's scope syntax.)

### D.5 Environment and secrets

`.env.example` (committed; real `.env` is git-ignored)

```text
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

CI/GitHub secrets (never in the repo, never in the app bundle):

```text
TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD
ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY            # used only by the publish step
```

---

## Appendix E — Release workflow skeleton

> Skeleton only. **Agent: verify current action versions, and follow Tauri's current Android signing documentation, before relying on this.** The publish step must upload `latest.json` **last**.

```yaml
# .github/workflows/release.yml
name: release
on:
  push:
    branches: [main]
    paths-ignore: ["docs/**", "**/*.md"]
concurrency: { group: release, cancel-in-progress: false }

jobs:
  gate:
    runs-on: ubuntu-latest
    outputs: { publish: "${{ steps.v.outputs.publish }}", version: "${{ steps.v.outputs.version }}" }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - id: v
        run: node scripts/should-publish.mjs      # compares tauri.conf.json version with live latest.json
        env: { SUPABASE_URL: "${{ secrets.SUPABASE_URL }}" }

  windows:
    needs: gate
    if: needs.gate.outputs.publish == 'true'
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with: { workspaces: src-tauri }
      - run: npm ci
      - run: npm test && cargo test --manifest-path src-tauri/Cargo.toml
      - run: npm run tauri build -- --bundles nsis
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
      - uses: actions/upload-artifact@v4
        with: { name: windows, path: "src-tauri/target/release/bundle/nsis/*" }

  android:
    needs: gate
    if: needs.gate.outputs.publish == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 17 }
      - uses: android-actions/setup-android@v3
      # TODO(agent): install the pinned NDK version, rust targets, decode ANDROID_KEYSTORE_BASE64 to a file,
      #              configure Gradle signing per Tauri docs, then:
      - run: npm ci
      - run: npm run tauri android build -- --apk --target aarch64
      - uses: actions/upload-artifact@v4
        with: { name: android, path: "src-tauri/gen/android/app/build/outputs/apk/**/release/*.apk" }

  publish:
    needs: [gate, windows, android]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
      - run: node scripts/publish-release.mjs     # uploads artifacts, computes sha256, writes latest.json LAST
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          VERSION: ${{ needs.gate.outputs.version }}
```

Android `versionCode` rule: `major*10000 + minor*100 + patch`, computed in `scripts/bump-version.mjs` and written to the Android Gradle config.

---

## Appendix F — Sync scenario test list

Each scenario is an automated test in the two-device simulator (devices **A** and **B**, a fake server implementing `sync_push` and pull semantics). **Expected** is the converged state after both devices sync to quiescence.

| # | Scenario | Expected |
|---|---|---|
| F1 | A creates a note offline, then syncs; B pulls | B has identical note |
| F2 | A and B both edit the same note offline, then sync in either order | One main note (newer HLC) + one conflict copy; no text lost; same on both devices |
| F3 | A edits note, B deletes it (to Trash) offline | Newer HLC wins; if edit wins the note is restored and untrashed, otherwise it is trashed; same on both |
| F4 | A and B complete the same quest offline | One completed quest, exactly one ledger entry, one next occurrence |
| F5 | A buys item (balance 50, cost 40) and B buys the same item offline | Two inventory events and two ledger debits; balance −30; purchases blocked until positive |
| F6 | A reorders Board card X, B reorders card Y offline | Both reorders applied; stable order |
| F7 | A deletes Board column C, B adds a card to C offline | Card moved to first live column; no orphan |
| F8 | A and B both create tag "Work" offline, tag different quests | One canonical tag; both taggings re-pointed |
| F9 | A adds tag T to file, B removes T from same file offline | LWW on the single deterministic tagging row; same on both |
| F10 | A's clock is 2 days fast, B edits later | B's later edit wins (HLC), not A's fast wall time |
| F11 | Push batch interrupted after server accepted but before client acknowledged | Re-push is a no-op; outbox cleared; no duplicate |
| F12 | Pull returns rows out of `server_seq` commit order (simulated overlap) | No row missed |
| F13 | A creates 3 vaults, B creates 8 (11 total) | All kept; over-limit flag; no further creation |
| F14 | A protects a vault with a password while B edits a file in it offline | B's edit re-encrypted at next unlock; no plaintext persists in A's DB |
| F15 | B runs an older build (`payload_v` lower than A's records) | B pauses sync with "Update required"; local editing continues; no corruption |
| F16 | Initial sync of 10,000 records interrupted at 40% | Resumes from cursor; end state identical |
| F17 | Attachment uploaded by A while B is offline; B comes online later | Metadata syncs; blob downloads on first view; AAD/tag verification passes |
| F18 | Property test: random sequences of 200 operations across A and B with random sync interleavings | A and B converge to identical state; ledger balance equals sum of union |
| F19 | Server returns a record with tampered ciphertext or swapped AAD | Rejected, logged as integrity error, other records still applied |
| F20 | Session expires mid-sync | Sync pauses with "Needs sign-in"; local edits continue and push after re-login |
