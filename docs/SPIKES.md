# KAISEN — M0 risk spikes

Results for SPEC §35 M0. Each spike that needed code has its own throwaway branch; the code there is not product code and will not be merged.

**Where these were run:** a Linux x86_64 cloud container (4 vCPU, no GPU). It has **no Windows machine, no Android device, no Android NDK** (the NDK download from Google is blocked by the network policy) **and no Supabase project**. So a spike's pass condition is only marked PASS when the evidence fully meets it. Otherwise it is PARTIAL or NOT RUN, with the exact steps left for you.

**Second pass (2 Oct 2026): GitHub Actions.** To get real Windows and Android evidence without your devices, S1, S2 and S6 were also run in CI on the throwaway branch `spike/m0-ci` (workflow `m0-spikes`): a `windows-latest` runner (Windows, MSVC, WebView2 153), and an `ubuntu-latest` runner with Android NDK 29.0.14206865 plus an Android 14 (API 34) x86_64 emulator. Green run: https://github.com/K-s-P-l-s25/Novus/actions/runs/36998817562. An emulator is not your phone, so phone-only items are still marked as yours.

| Spike | Status | Branch | Decision needed from you |
|---|---|---|---|
| S1 Tauri on Windows + Android | **PASS on Windows and the Android emulator** (and Linux). Physical phone not run. | `spike/s1-hello`, `spike/m0-ci` | No. Optional: install the APK on your phone |
| S2 SQLCipher + FTS5 trigram | **PASS on Windows (MSVC), Android emulator and Linux**; arm64 Android build compiles with the NDK. Not run on a physical arm64 phone. | `spike/s2-sqlcipher`, `spike/m0-ci` | No. Optional: run the arm64 binary on your phone |
| S3 Supabase TOTP + `aal2` | **NOT RUN**: needs your project and Proton Authenticator. Probe script is ready. | `spike/s3-supabase-aal2` | No |
| S4 Updates | **NOT RUN** (needs devices). Android mechanism **decided: Obtainium**. | none | Decided 2 Oct |
| S5 Canvas (tldraw) | **FAIL (licence gate)**. **Decided: Canvas deferred.** | none | Decided 2 Oct |
| S6 Argon2id speed | **PARTIAL**: Windows, Linux and emulator numbers taken. **Phone timing still needed**; an emulator can't stand in for it. | `spike/s6-argon2` | **Yes**: run the phone binary (one `adb` command) |
| S7 Misc feasibility | **PARTIAL**: notification scheduling checked in the plugin source. PDF and Back button need a device. | none | Windows reminders decided 2 Oct |

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

**Evidence (CI, `spike/m0-ci`):** the CI drives the button through the WebView's DevTools protocol (`spikes/ci/cdp_ping.mjs`).

```text
Windows (windows-latest, WebView2 153, release build):
  target url: http://tauri.localhost/
  S1 result: PASS · echo="ST morf olleh" · platform=windows · round-trip 10.2 ms
Android 14 emulator (API 34, x86_64, debug APK from `tauri android build --apk --target aarch64 --target x86_64`):
  target url: http://tauri.localhost/
  S1 result: PASS · echo="ST morf olleh" · platform=android · round-trip 21.0 ms
```

Findings: Tauri refuses to build an Android package at version `0.0.0` (it needs at least `0.0.1`). On Windows the DevTools port must be set through the window's `additionalBrowserArgs`, because the `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` environment variable is ignored when Tauri passes its own arguments. Both matter for M1's CI and for debugging.

**Not done:** a physical phone. The universal debug APK (arm64 + x86_64) is in the run's `android-spike-binaries` artifact (https://github.com/K-s-P-l-s25/Novus/actions/runs/36998817562), so you can sideload it without build tools and press the button. Or build it yourself (from `spikes/s1-hello`, on the `spike/s1-hello` branch):

```text
npm ci
npm run tauri dev                         # Windows: press the button, expect "PASS · … platform=windows"
npm run tauri android init                # needs Android Studio, SDK, NDK, JDK 17 (SPEC §11.3)
npm run tauri android dev                 # phone over USB debugging: expect "platform=android"
```

**Decision:** **pass** for M0 purposes: the Tauri v2 + Vite + React layout works on both target platforms. M1 starts from this layout. A run on your phone remains a nice-to-have confirmation.

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

**Evidence (CI, `spike/m0-ci`):**

```text
Windows (x86_64-pc-windows-msvc, Strawberry Perl, COMPILER=msvc-1951):
  sqlite 3.51.3 · SQLCipher 4.14.0 community (openssl) · ENABLE_FTS5 = true
  trigram 'getUs' -> rowid 1 · 'xyzq' -> 0 · marker in file = false · plain header = false
  wrong key = rejected · no key = rejected · right key = 1 row · RESULT = PASS
Android (NDK 29.0.14206865, clang-21, API 26 target):
  aarch64-linux-android: ELF 64-bit pie, ARM aarch64, interpreter /system/bin/linker64  (built)
  x86_64-linux-android on the API 34 emulator: same checks as above · RESULT = PASS
```

So vendored OpenSSL **does** cross-compile with the NDK. That was the main risk in §5.9, and it no longer needs the WSL2 or SQLite3 Multiple Ciphers fallbacks. On Windows the MSVC build of OpenSSL takes about 7 minutes from cold; a CI cache will matter.

**Not done:** running the arm64 binary on a physical phone. It is `s2-aarch64` in the same CI artifact: `adb push s2-aarch64 /data/local/tmp/s2 && adb shell chmod 755 /data/local/tmp/s2 && adb shell /data/local/tmp/s2`.

**DEV_SETUP notes for M1:** Windows needs Strawberry Perl on `PATH` ahead of Git's msys Perl. Android needs `CC_<target>`, `AR_<target>`, `CARGO_TARGET_<TARGET>_LINKER` and `ANDROID_NDK_ROOT` pointing at the NDK's clang (see `.github/workflows/m0-spikes.yml` on `spike/m0-ci`).

**Findings to carry into M4:**
1. When decryption fails, SQLCipher writes its own lines to stderr, for example `ERROR CORE sqlcipher_page_cipher: hmac check failed for pgno=1`. They contain no content or keys, but they bypass `tracing`. M4 should set `PRAGMA cipher_log_level = NONE`, or route the output into our logger.
2. The bundled build has `ENABLE_LOAD_EXTENSION` compiled in. rusqlite leaves extension loading off unless the `load_extension` feature is enabled, and we don't enable it. Keep it that way (security checklist §12).

**Decision:** **keep `bundled-sqlcipher-vendored-openssl`**. It builds and passes on all three platforms, so no fallback is needed.

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

**Decision (2 Oct 2026, yours):** **Obtainium**, on condition it is secure and not a hassle. APKs go to GitHub Releases on a public binaries-only repo (`kaisen-releases`), which Obtainium tracks natively. Security rests on Android's same-signing-key rule, so the keystore is the secret that matters. Setup is a one-time ~5 minutes on the phone; after that an update is notification → tap → install. Written into SPEC §10.2, §10.4, §10.5, §10.6, M17, Appendix D.5 and E. The demo that an update keeps data still needs signed APKs and the phone.

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

**Decision (2 Oct 2026, yours):** **leave Canvas out for now.** No canvas engine is added. SPEC §19 is marked deferred, M13 is skipped, and Q7, §2.3, §17.4, §35.2 and Appendix D are updated. The schema keeps the `canvas` kind and `canvas_content` reserved, so Canvas can return without a migration. The fallbacks above stay on record for then.

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

**More evidence (CI, `spike/m0-ci`):**

| Where | m=65536 t=3 | m=32768 t=3 | m=65536 t=2 | m=19456 t=2 |
|---|---|---|---|---|
| Windows runner (x86_64), 7 runs | **96 ms** | 45 ms | 64 ms | 17 ms |
| Android 14 emulator (x86_64 on a shared runner), 3 runs | **343 ms** | 160 ms | 260 ms | 100 ms |

The emulator runs on the CI machine's x86 CPU, not phone hardware, so its numbers only show that the code runs on Android. The arm64 binary was checked under qemu-user only to prove it runs. Neither tells us about your phone.

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
- **Windows: not supported.** The plugin source says: "Scheduling is only implemented on mobile; the desktop implementation delivers the notification immediately and ignores the schedule." So Windows reminders need a Rust-side timer that fires `show()` while the app (or its tray) is running. Reminders won't fire while the app is closed on Windows. **Decided 2 Oct 2026:** SPEC §32.2 and §11.1 now say so.
- Not yet tested on a device: the permission prompt on Android 13+ and delivery under Doze.

**PDF export on Android:** not run (needs a device). Android System WebView does not implement `window.print()` (from what I know; not verified here), so this needs a native `PrintManager` bridge in Kotlin, or the §18.11 fallback (Windows-only PDF, with HTML/Markdown share on Android). I recommend the fallback for the prototype.

**Android Back button:** not run (needs a device). Test it in the S1 app as part of the device run.

---

## Other changes made in this session

- The project is renamed **ARU → KAISEN** throughout `CLAUDE.md` and the spec. That includes HKDF labels (`kaisen/db/v1` …), CSS tokens (`--kaisen-*`), events (`kaisen://changed`), file names (`kaisen.db`, `.kaisenback`), the bundle identifier (`dev.alexreid.kaisen`) and the owner line ("Alex Reid & KAISEN Ltd"). If the company name should stay as it was, say so.
- `SPEC.md` moved to `docs/SPEC.md`, the path that `CLAUDE.md` and spec §0 already reference.
