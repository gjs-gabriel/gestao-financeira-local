/**
 * Splash “Inicializando…” — UI mínima, sem jargão técnico.
 */

import http from "node:http";

/**
 * @param {string} host
 * @param {number} port
 * @param {() => object} getState
 */
export function createSplashServer(host, port, getState) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${host}:${port}`);

    if (url.pathname === "/api/state") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(getState()));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(splashHtml());
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

function splashHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gestão Financeira</title>
  <style>
    :root {
      --bg0: #0c1f1c;
      --bg1: #12352f;
      --fg: #f3f7f5;
      --muted: #a9c0b8;
      --ok: #3dcf9a;
      --warn: #e6b35c;
      --fail: #e86a6a;
      --pending: #6f8f86;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; height: 100%;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: var(--fg);
      background:
        radial-gradient(900px 500px at 20% -10%, #1b4d44 0%, transparent 55%),
        linear-gradient(160deg, var(--bg0), var(--bg1));
    }
    main {
      min-height: 100%;
      display: grid;
      place-items: center;
      padding: 2rem;
    }
    .card {
      width: min(420px, 100%);
      text-align: left;
    }
    .brand {
      font-size: 1.65rem;
      font-weight: 650;
      letter-spacing: -0.02em;
      margin: 0 0 0.35rem;
    }
    .msg {
      color: var(--muted);
      margin: 0 0 1.5rem;
      min-height: 1.4em;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.75rem;
    }
    li {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      font-size: 0.98rem;
    }
    .dot {
      width: 0.85rem;
      height: 0.85rem;
      border-radius: 999px;
      background: var(--pending);
      flex: 0 0 auto;
    }
    .dot.ok { background: var(--ok); }
    .dot.warn { background: var(--warn); }
    .dot.fail { background: var(--fail); }
    .dot.pending {
      animation: pulse 1.1s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.35; }
      50% { opacity: 1; }
    }
    .detail {
      margin-top: 1.25rem;
      color: var(--fail);
      font-size: 0.85rem;
      white-space: pre-wrap;
    }
    .foot {
      margin-top: 1.75rem;
      color: var(--muted);
      font-size: 0.78rem;
    }
  </style>
</head>
<body>
  <main>
    <div class="card">
      <h1 class="brand" id="title">Gestão Financeira</h1>
      <p class="msg" id="message">Inicializando…</p>
      <ul>
        <li><span class="dot pending" id="c-app"></span><span>Aplicativo</span></li>
        <li><span class="dot pending" id="c-ai"></span><span>Assistente local</span></li>
        <li><span class="dot pending" id="c-security"></span><span>Segurança</span></li>
      </ul>
      <p class="detail" id="detail" hidden></p>
      <p class="foot">Seus dados permanecem neste computador.</p>
    </div>
  </main>
  <script>
    const map = { app: "c-app", ai: "c-ai", security: "c-security" };
    let redirected = false;
    async function tick() {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        const s = await res.json();
        document.getElementById("title").textContent = s.title || "Gestão Financeira";
        document.getElementById("message").textContent = s.message || "";
        const detail = document.getElementById("detail");
        if (s.detail) {
          detail.hidden = false;
          detail.textContent = s.detail;
        } else {
          detail.hidden = true;
        }
        for (const [k, id] of Object.entries(map)) {
          const el = document.getElementById(id);
          const st = (s.checks && s.checks[k]) || "pending";
          el.className = "dot " + st;
        }
        if (s.phase === "ready" && s.redirectUrl && !redirected) {
          redirected = true;
          setTimeout(() => { location.href = s.redirectUrl; }, 600);
        }
      } catch (_) {}
    }
    tick();
    setInterval(tick, 400);
  </script>
</body>
</html>`;
}
