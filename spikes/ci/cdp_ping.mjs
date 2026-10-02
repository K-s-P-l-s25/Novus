// Clicks the S1 button through the Chrome DevTools Protocol and prints the result.
// Works for WebView2 (Windows, --remote-debugging-port) and Android WebView (adb forward).
// Usage: node cdp_ping.mjs [port]   (Node 22+, uses the global WebSocket)
const port = process.argv[2] ?? "9222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 60 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  } catch { /* not up yet */ }
  if (!target) await sleep(1000);
}
if (!target) { console.error("no DevTools page target"); process.exit(1); }
console.log(`target url: ${target.url}`);

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const expression = `(async () => {
  for (let i = 0; i < 100 && !document.querySelector('button'); i++) await new Promise(r => setTimeout(r, 100));
  document.querySelector('button').click();
  for (let i = 0; i < 100; i++) {
    const t = document.querySelector('[data-testid=result]').textContent;
    if (t !== 'not run') return t;
    await new Promise(r => setTimeout(r, 100));
  }
  return 'timeout';
})()`;
ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
const msg = await new Promise((res) => { ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) res(m); }; });
ws.close();
const text = msg.result?.result?.value ?? JSON.stringify(msg);
console.log(`S1 result: ${text}`);
process.exit(String(text).startsWith("PASS") ? 0 : 1);
