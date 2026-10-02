# KAISEN — M0 risk spikes

Results for SPEC §35 M0. Each spike that needed code has its own throwaway branch; the code there is not product code and will not be merged.

**Where these were run:** a Linux x86_64 cloud container (4 vCPU, no GPU). It has **no Windows machine, no Android device, no Android NDK** (the NDK download from Google is blocked by the network policy) **and no Supabase project**. So a spike's pass condition is only marked PASS when the evidence fully meets it. Otherwise it is PARTIAL or NOT RUN, with the exact steps left for you.

| Spike | Status | Branch | Decision needed from you |
|---|---|---|---|
| S1 Tauri on Windows + Android | **PARTIAL**: invoke round-trip passes on Linux. Windows and phone not run. | `spike/s1-hello` | No. Run it on both devices. |
| S2 SQLCipher + FTS5 trigram | **PARTIAL**: full pass on Linux x86_64. Windows cross-build compiles. Android not built (no NDK). | `spike/s2-sqlcipher` | No. Run it on Windows and build for Android. |
| S3 Supabase TOTP + `aal2` | **NOT RUN**: needs your project and Proton Authenticator. Probe script is ready. | `spike/s3-supabase-aal2` | No |
| S4 Updates | **NOT RUN**: desk research only. Option A as written does not exist off the shelf. | none | **Yes**: choose Android A (custom) or B (Obtainium) |
| S5 Canvas (tldraw) | **FAIL (licence gate)** under KAISEN's constraints. Touch test not run. | none | **Yes**: approve a fallback dependency |
| S6 Argon2id speed | **PARTIAL**: desktop numbers taken. Phone binary built and runs under qemu, but no phone timing yet. | `spike/s6-argon2` | No. Run the phone binary. |
| S7 Misc feasibility | **PARTIAL**: notification scheduling checked in the plugin source. PDF and Back button need a device. | none | Small: see the Windows reminders note |

Versions checked on 2 Oct 2026: `tauri` 2.12.1, `tauri-build` 2.7.1, `@tauri-apps/cli`/`api` 2.12.1, `rusqlite` 0.40.2 (SQLite 3.51.3, SQLCipher 4.14.0 community), `argon2` 0.6.0, `tauri-plugin-notification` 2.5.1, `tauri-plugin-updater` 2.13.1, `@supabase/supabase-js` 2.117.2, `tldraw` 5.5.1, React 19.3.0, Vite 8.3.2, TypeScript 7.0.2.
⚠ crates.io also carries **Tauri 3.0.0-alpha**. The spec says Tauri v2, so pins must stay on `2.x` (`=2.12.1`). A plain `cargo add tauri` would choose 2.x today, but `cargo info` shows the alpha.

---

## S1: Tauri v2 hello-world with `invoke()` round-trip

**Pass condition:** a hello-world with an `invoke()` round-trip runs on both Windows and a physical Android phone.

**Evidence (Linux only):** `spikes/s1-hello` is Vite + React + Tauri 2.12.1 with one command, `spike_ping`. It builds with `tauri build --no-bundle`. I drove it under Xvfb with `tauri-driver` + WebKitWebDriver (`webdriver_smoke.py`):

```text
url: tauri://localhost
before: not run
after:  PASS · echo="ST morf olleh" · platform=linux · round-trip 4.0 ms
```

**Not done:** Windows (WebView2) and the phone. **Your steps** (from `spikes/s1-hello`, on the `spike/s1-hello` branch):

```text
npm ci
npm run tauri dev                         # Windows: press the button, expect "PASS · … platform=windows"
npm run tauri android init                # needs Android Studio, SDK, NDK, JDK 17 (SPEC §11.3)
npm run tauri android dev                 # phone over USB debugging: expect "platform=android"
```

**Decision:** none yet. If both devices show PASS, M1 starts from this layout.

---

## S2: rusqlite + SQLCipher + FTS5 trigram

**Pass condition:** `PRAGMA key` works; `pragma_compile_options` shows FTS5; a trigram table matches a substring; the encrypted file is unreadable in a hex viewer. This must hold on Windows **and** Android arm64.

**Evidence (Linux x86_64, `cargo run` in `spikes/s2-sqlcipher`, features `bundled-sqlcipher-vendored-openssl, functions, backup`):**

```text
sqlite_version   = 3.51.3
cipher_version   = 4.14.0 community
cipher_provider  = openssl
ENABLE_FTS5      = true
trigram 'getUs'  -> rowid 1          (matches "getUserById")
trigram 'xyzq'   -> 0 rows
marker in file   = false             (hex scan for SECRET-MARKER-7f3a)
plain header     = false             (no "SQLite format 3" header)
first 32 bytes   = ebeba678301eba226cf4a9d0dc286dfba4b7310334881061ce1e9187f906981e
wrong key read   = rejected
no key read      = rejected
right key read   = 1 row(s)
RESULT           = PASS
```

The first build took about 90 s, most of it compiling OpenSSL. A cross-build for `x86_64-pc-windows-gnu` (mingw) also **compiled and linked** (an 11 MB PE32+ exe). I did not run it, and the real Windows target is MSVC.

**Not done:**
- **Android arm64.** The NDK cannot be downloaded in this container, so I could not test the cross-compile of vendored OpenSSL with the NDK clang. This is the main risk §5.9 names, and it is still open.
- **Windows MSVC.** Run `cargo run` in `spikes/s2-sqlcipher` on Windows. `openssl-src` needs **Perl** on Windows (Strawberry Perl); put that in `DEV_SETUP.md`.
- **Android steps:** `rustup target add aarch64-linux-android`; set `ANDROID_NDK_HOME`; build with `cargo build --target aarch64-linux-android` using the NDK's `aarch64-linux-android26-clang` as `CC_aarch64_linux_android` and as the linker. Then `adb push` and run, or run it in the S1 app. If that fails, the fallbacks are a Linux CI runner and then SQLite3 Multiple Ciphers.

**Findings to carry into M4:**
1. When decryption fails, SQLCipher writes its own lines to stderr, for example `ERROR CORE sqlcipher_page_cipher: hmac check failed for pgno=1`. They contain no content or keys, but they bypass `tracing`. M4 should set `PRAGMA cipher_log_level = NONE`, or route the output into our logger.
2. The bundled build has `ENABLE_LOAD_EXTENSION` compiled in. rusqlite leaves extension loading off unless the `load_extension` feature is enabled, and we don't enable it. Keep it that way (security checklist §12).

**Decision:** keep `bundled-sqlcipher-vendored-openssl` for now. Make the final call after the Android build.

---

## S3: Supabase TOTP and the restrictive `aal2` policy

**Pass condition:** enrol with **Proton Authenticator**, verify, and prove that the restrictive `aal2` policy blocks an `aal1` session.

**Status:** not run. There is no Supabase project or account access from here, and TOTP enrolment needs your authenticator.

**Prepared on `spike/s3-supabase-aal2`:**
- `spikes/s3-supabase/supabase/migrations/0001_sync.sql`: Appendix B.1, copied verbatim.
- `spikes/s3-supabase/probe.mjs`: signs in with your password and asserts `aal1`. Then it checks that `select` on `sync_records` and `user_keys` returns 0 rows, and that a direct insert and `sync_push` are both rejected. Next it enrols TOTP if you have no factor yet (it prints the `otpauth://` URI for Proton Authenticator) and asks for a code. Finally it asserts `aal2`, pushes a probe row through `sync_push`, reads it back and deletes it.

**Your steps:** create the project in an EU region. Do the §4.2 steps 1–3, but **leave sign-ups on** until you have also made the throwaway second user for the §8.2 cross-user test. Run the migration in the SQL editor, then:

```text
cd spikes/s3-supabase && npm ci
SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… KAISEN_EMAIL=… KAISEN_PASSWORD=… npm run probe
```

Paste the output into this section. The probe prints the TOTP secret once in your terminal, so store it in your offline backup (§4.4) and don't paste that line here.

---

## S4: Updates (Windows updater, Android mechanism)

**Pass condition:** a Windows updater round-trip from a Supabase Storage `latest.json`; choose the Android mechanism (A/B/C of §10.4) and show one update that keeps data.

**Status:** not run. It needs Windows, a phone, a signing key pair and your Supabase Storage. Desk findings:

- **Windows:** `tauri-plugin-updater` **2.13.1** is current and desktop-only, as the spec assumes. Nothing found that contradicts §10.3.
- **Android option A, off-the-shelf plugin: does not do what §10.4 says.** `tauri-plugin-android-update` 0.3.0 (MIT-0) only checks `latest.json` and then **opens the release page in the browser**. It does not download, verify or install the APK. It also makes its HTTP calls from **Rust via `reqwest`**, which breaks CLAUDE.md rule 3 (network I/O in TypeScript), and `reqwest`, `semver` and `log` are not on the allow-list.
- **Option A done properly** means our own small Kotlin plugin in `src-tauri/gen/android`. TypeScript downloads the APK, Rust checks the SHA-256 from `latest.json`, and Kotlin checks that the APK's signing certificate matches the installed app and then hands it to `PackageInstaller`. It needs `REQUEST_INSTALL_PACKAGES` plus a `FileProvider`. This adds no new crate or npm package, but it is roughly 100–150 lines of Kotlin, not 60.
- **Option B (Obtainium)** needs no code. It works best with a GitHub-style releases page, so it favours the "public releases-only repo" host in §10.2.
- **Option C** (`tauri-plugin-hot-update` 0.1.1) is still a 0.1 community plugin and stays ★ S08.

**Decision needed:** **A-custom** (Kotlin plugin, one-tap in-app update, lives in M17) or **B** (Obtainium, zero code, needs a public releases page). I recommend **B for the prototype** and **A-custom at M17**. The demo that an update keeps data can then be done with B as soon as signed APKs exist.

---

## S5: Canvas engine (tldraw licence and touch)

**Pass condition:** tldraw licence terms confirmed for personal use; pinch, pan and long-press acceptable on the phone; otherwise pick the fallback.

**Evidence: licence text shipped in `tldraw@5.5.1`** (`LICENSE.md` points to the tldraw SDK licence; the quotes below are from the package's `DOCS.md`):
- "The tldraw SDK requires a license key to work in production. Without a valid key, the SDK runs in development mode only."
- In production with no key, "the SDK logs errors to the console and, after five seconds, stops rendering the editor."
- **Hobby** licence (non-commercial): "keep the 'made with tldraw' watermark visible. They're discretionary: we review each request."
- "Trial and hobby licenses ping tldraw's servers with the license ID, license type, SDK version, build environment, and deployment URL."
- Commercial licence: annual and paid, through sales.

**Assessment against KAISEN's constraints:**
- A hobby key would **phone home to tldraw.com**. That conflicts with "Supabase is the only cloud service" (B2.1) and with the CSP `connect-src`, which allows only Supabase (Appendix D.3). The CSP would block the ping; whether tldraw then degrades is unknown.
- The hobby licence is discretionary and keeps the watermark.
- tldraw counts a non-HTTPS origin as "development", and Tauri serves over `http://tauri.localhost` on Windows and Android by default, so it might run without a key. **I am not recommending that**: it is a detection detail, not a grant, and the licence terms still apply.

**Result:** **FAIL** on the licence gate for tldraw as specified. The touch test was not run; it should be done with whichever engine is chosen.

**Fallbacks, already named in §19.2 but not on the §2.3 allow-list. Your approval is needed:**

| Package | Version | Licence | Covers |
|---|---|---|---|
| `@excalidraw/excalidraw` | 0.18.1 | MIT | Freehand, shapes, arrows with bindings, images (standard canvas) |
| `@xyflow/react` (React Flow) | 12.12.0 | MIT | Node graphs, Start/Trigger nodes, sequence view (Advanced mode) |

**Decision needed:** (a) approve Excalidraw and/or React Flow; or (b) apply for a tldraw hobby licence and accept the watermark and the phone-home ping (which needs a CSP and spec change); or (c) buy a commercial licence. I recommend **(a): Excalidraw for the standard canvas, with React Flow added only if Advanced mode needs it**. Either way the `CanvasEngine` interface in §19.2 stays. Once decided, I'll update §2.3, §19 and Q7 in the spec and run the touch test with S1's shell.

---

## S6: Argon2id unlock time

**Pass condition:** unlock on the phone takes ≤ 1.5 s with the chosen `m`; record the parameters.

**Evidence (desktop, Linux x86_64 container, `argon2` 0.6.0 with LTO, 7 runs each):**

| m (KiB) | t | p | median ms | min / max ms |
|---|---|---|---|---|
| 65536 (spec default) | 3 | 1 | **175** | 149 / 178 |
| 32768 (spec fallback) | 3 | 1 | 73 | 64 / 79 |
| 65536 | 2 | 1 | 119 | 103 / 131 |
| 19456 | 2 | 1 | 18 | 18 / 25 |

The arm64 binary was checked under qemu-user only to prove it runs. Emulated timings mean nothing.

**Your steps (phone).** The branch has a static arm64 binary, `spikes/s6-argon2/bin/spike-s6-argon2-android-arm64` (musl, no NDK needed; sha256 `8d7a64aa…f759`):

```text
adb push spikes/s6-argon2/bin/spike-s6-argon2-android-arm64 /data/local/tmp/s6
adb shell chmod 755 /data/local/tmp/s6
adb shell /data/local/tmp/s6 7
```

On Windows, run `spikes\s6-argon2\bin\spike-s6-argon2.exe 7` (sha256 `a7147778…2ac7`), or `cargo run --release` from source.

**Decision rule:** if the phone's median for `65536/3/1` is ≤ 1.2 s (leaving about 300 ms for unwrap, DB open and first query inside §13's 2 s target), keep the spec default. Otherwise use `32768/3/1`. The params live in `user_keys.kdf_params`, so this can be changed later.

---

## S7: Misc feasibility

**Scheduled local notifications.** I checked the source of `tauri-plugin-notification` 2.5.1:
- **Android: supported.** It uses `AlarmManager`. Without the exact-alarm permission it falls back to an inexact `set`, or to `setAndAllowWhileIdle` when `allowWhileIdle` is set, which matches §32 ("avoid exact-alarm permission"). Its manifest declares `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` and `WAKE_LOCK`, and it re-arms after a reboot through a boot receiver.
- **Windows: not supported.** The plugin source says: "Scheduling is only implemented on mobile; the desktop implementation delivers the notification immediately and ignores the schedule." So Windows reminders need a Rust-side timer that fires `show()` while the app (or its tray) is running. Reminders won't fire while the app is closed on Windows. **§32 should say so**, and I'll change it if you agree.
- Not yet tested on a device: the permission prompt on Android 13+ and delivery under Doze.

**PDF export on Android:** not run (needs a device). Android System WebView does not implement `window.print()` (from what I know; not verified here), so this needs a native `PrintManager` bridge in Kotlin, or the §18.11 fallback (Windows-only PDF, with HTML/Markdown share on Android). I recommend the fallback for the prototype.

**Android Back button:** not run (needs a device). Test it in the S1 app as part of the device run.

---

## Other changes made in this session

- The project is renamed **ARU → KAISEN** throughout `CLAUDE.md` and the spec. That includes HKDF labels (`kaisen/db/v1` …), CSS tokens (`--kaisen-*`), events (`kaisen://changed`), file names (`kaisen.db`, `.kaisenback`), the bundle identifier (`dev.alexreid.kaisen`) and the owner line ("Alex Reid & KAISEN Ltd"). If the company name should stay as it was, say so.
- `SPEC.md` moved to `docs/SPEC.md`, the path that `CLAUDE.md` and spec §0 already reference.
