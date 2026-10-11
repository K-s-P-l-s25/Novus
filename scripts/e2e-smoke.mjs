// End-to-end smoke test for the M1 shell, run against the real app.
//   node scripts/e2e-smoke.mjs webdriver <path-to-app>   (Linux/Windows via tauri-driver on :4444)
//   node scripts/e2e-smoke.mjs cdp <port>                (WebView2 or Android WebView DevTools)
// Checks: every room is reachable from the navigation, the CSP blocks an external and an
// inline script, and IPC works (Settings → About shows app_info). Exit code 0 = pass.

const [mode, target] = process.argv.slice(2);
if (!["webdriver", "cdp"].includes(mode) || !target) {
  console.error("usage: e2e-smoke.mjs webdriver <app> | cdp <port>");
  process.exit(2);
}

// Runs inside the page. Must be self-contained.
const pageTest = async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const h1 = () => document.querySelector("h1")?.textContent?.trim() ?? "";
  const expected = {
    "/": "Gatehouse",
    "/vaults": "Vaults",
    "/craft": "Craft Room",
    "/journey": "Journey",
    "/shop": "Shop & Inventory",
    "/profile": "Profile",
    "/settings": "Settings",
    "/more": "More",
  };
  const waitFor = async (pred, ms = 3000) => {
    for (let t = 0; t < ms; t += 50) {
      if (pred()) return true;
      await sleep(50);
    }
    return false;
  };
  for (let i = 0; i < 100 && !document.querySelector('nav[aria-label="Rooms"]'); i++)
    await sleep(100);
  const navLinks = () => [...document.querySelectorAll('nav[aria-label="Rooms"] a')];
  const goto = async (href) => {
    let link = navLinks().find((a) => a.getAttribute("href") === href);
    if (!link) {
      navLinks()
        .find((a) => a.getAttribute("href") === "/more")
        ?.click();
      await waitFor(() => h1() === "More");
      link = [...document.querySelectorAll("main a")].find((a) => a.getAttribute("href") === href);
    }
    if (!link) return false;
    link.click();
    return waitFor(() => h1() === expected[href]);
  };

  const layout = navLinks().length === 5 ? "mobile" : "desktop";
  const rooms = {};
  for (const href of ["/vaults", "/craft", "/journey", "/shop", "/profile", "/settings", "/"]) {
    rooms[href] = (await goto(href)) ? "ok" : `FAIL (h1="${h1()}")`;
  }

  // IPC: Settings → About renders app_info from Rust.
  await goto("/settings");
  [...document.querySelectorAll("a")]
    .find((a) => a.getAttribute("href") === "/settings/about")
    ?.click();
  await waitFor(() => document.querySelector('[data-testid="about"]'), 5000);
  const about = document.querySelector('[data-testid="about"]')?.textContent ?? "";

  // CSP: an external script must not load and must raise a violation.
  const violations = [];
  document.addEventListener("securitypolicyviolation", (e) =>
    violations.push(`${e.violatedDirective} ${e.blockedURI}`),
  );
  const external = await new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://example.com/kaisen-csp-probe.js";
    s.onload = () => resolve("LOADED");
    s.onerror = () => resolve("blocked");
    document.head.appendChild(s);
    setTimeout(() => resolve("blocked (no load event)"), 3000);
  });
  window.__kaisenInline = false;
  const inline = document.createElement("script");
  inline.textContent = "window.__kaisenInline = true";
  document.head.appendChild(inline);
  await sleep(200);

  return {
    url: location.href,
    layout,
    rooms,
    about,
    csp: { external, inlineRan: window.__kaisenInline, violations },
  };
};

const source = `(${pageTest.toString()})()`;

async function viaWebDriver(app) {
  const base = "http://127.0.0.1:4444";
  const call = async (method, path, body) => {
    const r = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await r.json()).value;
  };
  const { sessionId } = await call("POST", "/session", {
    capabilities: { alwaysMatch: { "tauri:options": { application: app } } },
  });
  try {
    return await call("POST", `/session/${sessionId}/execute/async`, {
      script: `const done = arguments[arguments.length - 1]; ${source}.then(done, (e) => done({ error: String(e) }));`,
      args: [],
    });
  } finally {
    await call("DELETE", `/session/${sessionId}`);
  }
}

async function viaCdp(port) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // The WebView exists before the app page has loaded; evaluating too early fails with
  // "Execution context was destroyed". Wait for the app URL, then retry if a load is in flight.
  const isAppUrl = (url) => /^(https?:\/\/tauri\.localhost|tauri:\/\/localhost)/.test(url ?? "");
  let lastError = "no DevTools page target";
  for (let attempt = 0; attempt < 60; attempt++) {
    let page;
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl && isAppUrl(t.url));
    } catch {
      /* DevTools not up yet */
    }
    if (page) {
      const result = await evaluate(page.webSocketDebuggerUrl);
      if (!result?.error?.includes("Execution context was destroyed")) return result;
      lastError = result.error;
    }
    await sleep(1000);
  }
  return { error: lastError };
}

async function evaluate(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.send(
    JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression: source, awaitPromise: true, returnByValue: true },
    }),
  );
  const msg = await new Promise((res) => {
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id === 1) res(m);
    };
  });
  ws.close();
  return msg.result?.result?.value ?? { error: JSON.stringify(msg) };
}

const report = mode === "webdriver" ? await viaWebDriver(target) : await viaCdp(target);
console.log(JSON.stringify(report, null, 2));

const failures = [];
if (report.error) failures.push(report.error);
for (const [href, v] of Object.entries(report.rooms ?? {}))
  if (v !== "ok") failures.push(`room ${href}: ${v}`);
if (!/Platform/.test(report.about ?? "")) failures.push("About did not render app_info");
if (report.csp?.external === "LOADED") failures.push("CSP allowed an external script");
if (report.csp?.inlineRan) failures.push("CSP allowed an inline script");
if (!report.csp?.violations?.some((v) => v.startsWith("script-src")))
  failures.push("no script-src CSP violation reported");

console.log(failures.length ? `E2E FAIL\n- ${failures.join("\n- ")}` : "E2E PASS");
process.exit(failures.length ? 1 : 0);
