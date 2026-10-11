# CLAUDE.md — KAISEN (personal edition)

Property of Alex Reid & KAISEN Ltd. Not for distribution.

## What this is
KAISEN is a **personal, offline-first, end-to-end-encrypted** note / canvas / code / board / quest app for **Windows and Android**, single user, no commercial features. The full specification is **`docs/SPEC.md`**. Read the relevant sections before coding. If code and spec disagree, stop and ask; do not silently diverge.

## Stack (fixed)
- Tauri v2 + Vite + React + TypeScript (strict) + Tailwind CSS
- Rust core (primary language): all business logic, crypto, database, sync merge
- Supabase is the **only** cloud service (Auth + TOTP MFA, Postgres, Storage, Realtime)
- Local DB: SQLite + SQLCipher via `rusqlite`, owned by Rust

## Non-negotiable rules
1. **Single write path.** Only `src-tauri/src/db/repo.rs` may INSERT/UPDATE/DELETE synced tables. Every write also creates an outbox entry (SPEC §6.5).
2. **Keys never leave Rust.** No key, passphrase or plaintext content in logs, error messages, JS, or Supabase. Use `Zeroizing` for key material.
3. **Network I/O is TypeScript, data/crypto/merge is Rust.** TS moves opaque ciphertext batches; it never decrypts (SPEC §1.2, §7).
4. **Offline first.** The UI reads and writes the local DB only. Network failure must never block editing or show a blocking dialog.
5. **Deterministic IDs** (UUIDv5) for taggings, links, settings, quest-completion ledger entries and recurring-quest occurrences (SPEC §6.2). Append-only for ledger, inventory events and time entries.
6. **No SQL foreign keys on synced tables.** Use services and the repair pass (SPEC §33.5).
7. **No AI features.** Not in the app, not in suggestions.
8. **Dependencies:** only those in SPEC §2.3. Ask before adding anything else. Pin exact versions.
9. **Platform split:** desktop-only plugins (updater, global-shortcut) go in `capabilities/desktop.json`; never grant them on Android.
10. **Suggestions (★ S##) are not committed scope.** Do not implement them unless I say so.

## Workflow
- Work through milestones in **SPEC §35 order** (M0 spikes first). One milestone per session.
- Before coding a milestone: restate its acceptance items, list files you will touch.
- After coding: run `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `npm run typecheck`, `npm run lint`, `npm test`. Fix everything.
- Write the tests named in the milestone (sync simulator scenarios are SPEC Appendix F).
- Commit in small conventional commits (`feat:`, `fix:`, `security:`, `docs:`, `chore:`). Never commit secrets, `.env`, keystores or signing keys.
- If a spike or decision changes the design, update `docs/SPEC.md` in the same change.

## Commands
```text
npm install
npm run tauri dev                  # Windows desktop dev
npm run tauri android dev          # Android device/emulator
npm run tauri build -- --bundles nsis
npm run tauri android build -- --apk --target aarch64
cargo test --manifest-path src-tauri/Cargo.toml
```

## Code conventions
- Rust: `thiserror` for typed errors; commands are thin (validate → service → events); no `unwrap()` outside tests; `tracing` with IDs and counts only.
- TypeScript: strict; no `any`; generated types from Rust live in `src/types/generated/` (do not edit); one `ipc.ts` function per command.
- Styling: Tailwind utilities with theme tokens (`bg-bg`, `text-text`, `border-border`, …). **Never hard-code colours.**
- Every list has an empty state; every destructive action has an undo toast; touch targets ≥ 48 dp; respect reduce-motion.
- UI adapts: desktop (≥768 px) rail + panes; mobile single column + bottom tabs.

## Where things live
`src-tauri/src/{crypto,db,entities,services,sync,commands}` · `src/features/*` · `src/lib/{ipc,supabase,sync,updater,events}.ts` · `src-tauri/migrations/*.sql` · `supabase/migrations/*.sql`
