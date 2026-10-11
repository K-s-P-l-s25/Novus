#!/usr/bin/env bash
# Installs a debug APK on a running emulator/device and runs scripts/e2e-smoke.mjs over DevTools.
# Usage: scripts/android-smoke.sh <apk> <application-id>
set -euo pipefail
apk="$1"; app_id="$2"
adb wait-for-device
adb install -r "$apk"
adb shell am start -W -n "$app_id/.MainActivity"
sock=""
for _ in $(seq 1 30); do
  sock=$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | head -1 || true)
  [ -n "$sock" ] && break
  sleep 2
done
[ -n "$sock" ] || { echo "no WebView DevTools socket (is this a debug build?)"; exit 1; }
adb forward tcp:9223 "localabstract:$sock"
node scripts/e2e-smoke.mjs cdp 9223
