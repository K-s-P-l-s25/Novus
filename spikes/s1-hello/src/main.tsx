import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";

type Ping = { echo: string; platform: string; rust_ms: number };

function App() {
  const [result, setResult] = useState<string>("not run");

  async function ping() {
    const t0 = performance.now();
    try {
      const r = await invoke<Ping>("spike_ping", { msg: "hello from TS" });
      const rtt = (performance.now() - t0).toFixed(1);
      setResult(`PASS · echo="${r.echo}" · platform=${r.platform} · round-trip ${rtt} ms`);
    } catch (e) {
      setResult(`FAIL · ${String(e)}`);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>KAISEN · spike S1</h1>
      <button style={{ minHeight: 48, minWidth: 160, fontSize: 18 }} onClick={ping}>
        invoke() round-trip
      </button>
      <p data-testid="result">{result}</p>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);
