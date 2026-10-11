# KAISEN — Supabase setup (one time)

SPEC §4.2, §8 and Appendix B. Supabase is KAISEN's only cloud service and only ever sees ciphertext (SPEC §5.6). Takes about 15 minutes in the Supabase dashboard.

## 1. Create the project
1. https://supabase.com → **New project**, name `kaisen`, region **London (eu-west-2)**.
2. Generate a strong **database password** and keep it in your password manager. The app never uses it.
3. The free plan is fine. Free projects pause after about a week of no use; opening the app regularly prevents that (SPEC §8.3).

## 2. Lock down sign-in (Authentication → Sign In / Providers)
- **Allow new users to sign up: Off.** KAISEN has a single user.
- **Anonymous sign-ins: Off.** Leave all OAuth providers disabled.
- **Email** provider: enabled (password sign-in).
- If your plan has **leaked password protection** (Authentication → Attack Protection), turn it on.

## 3. Two-factor (Authentication → Multi-Factor)
- **TOTP: Enabled** (the default).
- Do **not** enrol a factor here. KAISEN's setup wizard enrols Proton Authenticator.

## 4. Users (Authentication → Users → Add user → Create new user)
| User | Purpose | Notes |
|---|---|---|
| Your email | Your real account | Unique 16+ character password from your password manager. Tick **Auto Confirm User** |
| `rls-test@…` (any address) | Throwaway account for the security check below | Any strong password, **Auto Confirm**. Delete it after M3 is accepted |

Adding users here still works with sign-ups switched off.

## 5. Schema and security rules (SQL Editor → New query)
Paste the whole of [`supabase/migrations/0001_sync.sql`](../supabase/migrations/0001_sync.sql) and click **Run**. It creates:
- `sync_records` (encrypted records) and `user_keys` (your wrapped data key).
- Row Level Security on both tables. A row must belong to the signed-in user **and** the session must have passed TOTP (`aal2`). The `aal2` part is a *restrictive* policy, so a stolen password alone reads nothing.
- The `sync_push` function, and the `attachments` (private) and `releases` (public) storage buckets.
- Realtime publication for `sync_records`.

## 6. Values the app needs (Project Settings → API Keys / Data API)
| Value | Where it goes | Secret? |
|---|---|---|
| Project URL `https://<ref>.supabase.co` | `.env` → `VITE_SUPABASE_URL`, and the CSP in `src-tauri/tauri.conf.json` | No |
| Publishable key `sb_publishable_…` | `.env` → `VITE_SUPABASE_PUBLISHABLE_KEY` | No (public by design; RLS protects data) |

Copy `.env.example` to `.env` and fill both in. `.env` is git-ignored. For CI-built installers, add the same two values as GitHub repository secrets (`Settings → Secrets and variables → Actions`).

**Never** put these in the app, the repo or a chat: the **service_role / secret key**, the **database password**, your **account password**, or your **TOTP secret/QR code**.

## 7. First run of the app
Start the app (`npm run tauri dev`, or the installer):
1. **Sign in** with your real account.
2. **Set up two-factor:** scan the QR code with Proton Authenticator on your phone, or paste the setup key on Windows, then enter the 6-digit code. Also keep an **offline copy of the setup key**: Supabase has no TOTP recovery codes (SPEC §4.4).
3. **Create your master passphrase.** It is not your Supabase password and never leaves the device.
4. **Save the recovery key** shown once, and type its last group to confirm.

On your second device, the same steps find your existing encrypted key row and ask for the **same master passphrase** instead of creating a new one.

## 8. Security check (M3 acceptance, SPEC §8.2)
Run with the **throwaway** user only:

```text
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
TEST_EMAIL=rls-test@... TEST_PASSWORD='...' node scripts/supabase-rls-check.mjs
```

It proves three things:
- A password-only session reads and writes nothing.
- After TOTP the user sees only their own rows.
- Writing as another user is refused.

It enrols TOTP for the throwaway user itself and prints that user's setup key so you can re-run it. Delete the throwaway user afterwards.
