#!/usr/bin/env bash
# Runs inside the Android emulator job. Evidence goes to stdout.
set -euxo pipefail
adb wait-for-device
adb shell getprop ro.build.version.release
adb shell getprop ro.product.cpu.abi

echo "=== S2 on emulator (x86_64) ==="
adb push s2-x86_64 /data/local/tmp/s2
adb shell chmod 755 /data/local/tmp/s2
adb shell /data/local/tmp/s2

echo "=== S6 on emulator (x86_64, indicative only — not a phone) ==="
adb push s6-x86_64 /data/local/tmp/s6
adb shell chmod 755 /data/local/tmp/s6
adb shell /data/local/tmp/s6 3

echo "=== S1 on emulator ==="
adb install -r s1.apk
adb shell am start -W -n dev.alexreid.kaisen.spike1/.MainActivity
sleep 15
SOCK=$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | head -1)
echo "devtools socket: $SOCK"
adb forward tcp:9222 "localabstract:$SOCK"
node spikes/ci/cdp_ping.mjs 9222
