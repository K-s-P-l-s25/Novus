# KAISEN — developer setup

How to build and run KAISEN on Windows and Android. SPEC §11.3 lists the Android prerequisites; this file holds the exact steps and the pitfalls found in M0/M1.

## Versions (pinned)

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22 LTS | `npm ci` uses the committed `package-lock.json` |
| Rust | stable (1.85 or newer) | MSVC toolchain on Windows |
| Tauri | **2.12.x** (`tauri` =2.12.3, `@tauri-apps/cli` 2.12.2) | Tauri **3.0 alpha** is also on crates.io/npm. Do not upgrade; the spec is Tauri v2 |
| TypeScript | **6.0.3** | Not 7.x: `typescript-eslint` supports only TypeScript below 6.1 |
| JDK | 17 | Android only |
| Android NDK | 29.x | Android only (CI used 29.0.14206865) |

## Windows 10/11 (x64)

1. Install **Visual Studio Build Tools** with the "Desktop development with C++" workload (MSVC + Windows SDK).
2. Install **Rust** with `rustup` (default host `x86_64-pc-windows-msvc`).
3. Install **Node.js 22**.
4. Install **Strawberry Perl** and make sure `C:\Strawberry\perl\bin` comes **before** Git's `usr\bin` in `PATH`. SQLCipher's bundled OpenSSL (from M4) is configured with Perl, and Git's msys Perl breaks the MSVC build. Check with `where perl`; the first hit must be Strawberry.
5. WebView2 is built into Windows 10/11. Nothing to install.

```text
npm ci
npm run tauri dev                        # desktop dev window with hot reload
npm run tauri build -- --bundles nsis    # installer in src-tauri/target/release/bundle/nsis/
```

The first build compiles a lot of Rust (a few minutes). From M4 on, the first build also compiles OpenSSL (about 7 minutes on MSVC).

## Android (arm64 phone, API 26+)

1. Install **Android Studio**, then in *SDK Manager* install: Android SDK Platform (latest), **NDK (Side by side)**, Android SDK Command-line Tools and Platform-Tools.
2. Install **JDK 17**. Android Studio's bundled JBR works.
3. Set the environment variables (PowerShell, user scope):

   ```powershell
   [Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
   [Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
   $ndk = Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\ndk" | Sort-Object Name -Descending | Select-Object -First 1
   [Environment]::SetEnvironmentVariable("NDK_HOME", $ndk.FullName, "User")
   ```

4. Add the Rust targets:

   ```text
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```

5. **Once:** generate the Android project and commit it (SPEC §11.3). The cloud environment that built M1 could not reach Google's SDK servers, so `src-tauri/gen/android` is not in the repo yet:

   ```text
   npm run tauri android init
   git add src-tauri/gen/android && git commit -m "chore: add generated Android project"
   ```

   Until then, CI generates it on the fly.

6. Phone: enable *Developer options → USB debugging*, connect it, and accept the prompt. Then:

   ```text
   npm run tauri android dev                                 # live dev build on the phone
   npm run tauri android build -- --apk --target aarch64     # release APK (signing: M17)
   ```

**Back button:** Tauri's default Android behaviour already goes back through the app's history and closes the app at the root. The fuller §11.2 order (close sheet → leave editor → previous room → exit prompt) comes with the first sheets and editors (M6), through `onBackButtonPress` from `@tauri-apps/api/app`.

**Version:** Tauri refuses to build an Android package at version `0.0.0`. Keep `version` ≥ 0.0.1 in `src-tauri/tauri.conf.json`.

## Environment (`.env`)

Copy `.env.example` to `.env` (git-ignored). Both values are public by design, because Row Level Security protects the data (SPEC §8.2). They are used from M3. Without them the app runs fully offline and sync stays off. Never put the service-role key, signing keys or keystores in `.env` or the repo.

## Everyday commands

```text
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run format:check     # prettier (npm run format to fix)
npm test                 # vitest
npm run types            # regenerate src/types/generated/ from Rust (ts-rs)
cargo fmt  --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

`cargo test` also regenerates the TypeScript types. CI fails if `src/types/generated/` is stale, so commit the regenerated files with the Rust change.

## End-to-end smoke test

`scripts/e2e-smoke.mjs` drives the **built** app. It clicks through every room, checks that the CSP blocks an external and an inline script, and checks that Settings → About shows data from Rust over IPC.

- **Linux** (and the cloud dev container): `npx tauri build --no-bundle`, start `tauri-driver` (`cargo install tauri-driver`, plus `webkit2gtk-driver`, and Xvfb if headless), then `npm run e2e -- webdriver src-tauri/target/release/kaisen`.
- **Windows / Android**: CI builds with the WebView DevTools port open and runs `npm run e2e -- cdp <port>` (see `.github/workflows/ci.yml` and `scripts/android-smoke.sh`). On Windows the port must be passed through the window's `additionalBrowserArgs`; the `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` variable is ignored because Tauri sets its own browser arguments.

## Logs

Rust writes a daily log file, keeping 7 files. The rule is IDs, counts and error codes only, never content (SPEC §12):

| Platform | Location |
|---|---|
| Windows | `%LOCALAPPDATA%\dev.alexreid.kaisen\logs\kaisen.YYYY-MM-DD.log` |
| Android | the app's private `logs/` directory (inside the app sandbox) |
| Linux | `~/.local/share/dev.alexreid.kaisen/logs/` |

Debug builds also log to stderr and honour `RUST_LOG`.

## CI

`.github/workflows/ci.yml` runs on every push except docs-only changes:

- **checks**: typecheck, lint, format, Vitest, rustfmt, clippy, cargo test, and the generated-types check.
- **windows**: release build plus the smoke test in WebView2.
- **android**: debug APK plus the smoke test on an Android 14 emulator.

The Windows and Android jobs use roughly 15–25 runner minutes each per push. Windows minutes count double on private repos.
