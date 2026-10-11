/**
 * Orquestrador do Gestão Financeira.
 * Inicia App (Next standalone) + AI Runtime, health-check, abre navegador.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSplashServer } from "./splash.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class GestaoFinanceiraOrchestrator {
  /**
   * @param {{ rootDir: string, config?: object }} opts
   */
  constructor(opts) {
    this.rootDir = opts.rootDir;
    this.config = opts.config ?? loadConfig(this.rootDir);
    this.children = [];
    this.splash = null;
    this.logStream = null;
    this.shuttingDown = false;
    this.splashState = {
      phase: "starting",
      title: this.config.appName || "Gestão Financeira",
      message: "Inicializando…",
      checks: { app: "pending", ai: "pending", security: "pending" },
    };
  }

  async run() {
    this.setupLogging();
    this.log("launcher_start", { root: this.rootDir, version: this.config.version });

    process.on("SIGINT", () => void this.shutdown("SIGINT"));
    process.on("SIGTERM", () => void this.shutdown("SIGTERM"));
    process.on("exit", () => this.killChildrenSync());

    const appUrl = `http://${this.config.host}:${this.config.appPort}/`;

    // Instância anterior viva e app respondendo → só reabre o navegador.
    if (await this.tryAttachToRunningInstance(appUrl)) {
      return;
    }

    try {
      this.splash = await createSplashServer(
        this.config.host,
        this.config.splashPort,
        () => this.splashState,
      );
    } catch (e) {
      if (e && e.code === "EADDRINUSE") {
        this.log("splash_port_busy", { splash: this.config.splashPort });
        await this.reclaimPort(this.config.splashPort);
        try {
          this.splash = await createSplashServer(
            this.config.host,
            this.config.splashPort,
            () => this.splashState,
          );
        } catch (e2) {
          this.log("splash_reclaim_failed", {
            error: e2 instanceof Error ? e2.message : String(e2),
          });
          // Último recurso: abrir o app se estiver saudável.
          if (await ping(appUrl)) {
            openInBrowser(appUrl, this.config.browserAppMode);
            await flushLog(this.logStream);
            return;
          }
          throw e2;
        }
      } else {
        throw e;
      }
    }

    this.updateSplash({
      phase: "starting",
      message: "Inicializando…",
      checks: { app: "pending", ai: "pending", security: "pending" },
    });

    openInBrowser(
      `http://${this.config.host}:${this.config.splashPort}/`,
      this.config.browserAppMode,
    );

    try {
      this.updateSplash({
        message: "Iniciando aplicativo…",
        checks: { ...this.splashState.checks, security: "ok" },
      });
      await this.ensureAppServer(appUrl);
      await this.waitForHttp(appUrl, "Aplicativo");
      this.updateSplash({
        message: "Aplicativo pronto — abrindo…",
        checks: { ...this.splashState.checks, app: "ok" },
      });

      // Não esperar a IA para liberar o app — senão o splash fica preso.
      this.updateSplash({
        phase: "ready",
        message: "Abrindo Gestão Financeira…",
        checks: {
          app: "ok",
          ai: "pending",
          security: "ok",
        },
        redirectUrl: appUrl,
      });
      await sleep(500);
      if (this.config.openBrowser) {
        openInBrowser(appUrl, this.config.browserAppMode);
      }
      this.log("launcher_ready", { app: appUrl, ai: "deferred" });

      void this.bootstrapAiInBackground();
      await this.waitUntilExit();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log("launcher_error", { error: msg });
      this.updateSplash({
        phase: "error",
        message: "Não foi possível iniciar. Seus dados permanecem seguros.",
        detail: msg,
        checks: {
          app: this.splashState.checks.app === "ok" ? "ok" : "fail",
          ai: this.splashState.checks.ai === "ok" ? "ok" : "fail",
          security: "ok",
        },
      });
      await sleep(12_000);
      await this.shutdown("error");
      process.exitCode = 1;
    }
  }

  /**
   * Se splash+app já estão no ar e respondem, reutiliza em vez de travar.
   * Se a porta está ocupada por processo morto/zumbi, libera e segue o boot.
   */
  async tryAttachToRunningInstance(appUrl) {
    const splashUrl = `http://${this.config.host}:${this.config.splashPort}/api/state`;
    const splashState = await getJson(splashUrl);
    const appOk = await ping(appUrl);

    if (splashState && appOk) {
      this.log("already_running_healthy", {
        splash: this.config.splashPort,
        app: this.config.appPort,
      });
      openInBrowser(appUrl, this.config.browserAppMode);
      await flushLog(this.logStream);
      return true;
    }

    if (splashState && !appOk) {
      this.log("stale_splash_reclaim", {
        splash: this.config.splashPort,
        app: this.config.appPort,
      });
      await this.reclaimPort(this.config.splashPort);
      await this.reclaimPort(this.config.appPort);
      return false;
    }

    // App escuta mas não responde (zumbi) — libera a porta.
    if (!appOk && (await portLooksTaken(this.config.appPort))) {
      this.log("stale_app_reclaim", { app: this.config.appPort });
      await this.reclaimPort(this.config.appPort);
    }

    return false;
  }

  async ensureAppServer(appUrl) {
    if (await ping(appUrl)) {
      this.log("app_already_up", { url: appUrl });
      return;
    }
    if (await portLooksTaken(this.config.appPort)) {
      this.log("app_port_busy_unhealthy", { port: this.config.appPort });
      await this.reclaimPort(this.config.appPort);
    }
    await this.startAppServer();
  }

  async bootstrapAiInBackground() {
    try {
      this.updateSplash({ message: "Iniciando assistente local…" });
      const ollamaOk = await this.ensureOllama();
      let aiOk = false;
      if (ollamaOk) {
        await this.startAiRuntime();
        aiOk = await this.waitForAiHealth();
      } else {
        this.log("ollama_unavailable");
      }
      this.updateSplash({
        message: aiOk
          ? "Assistente local pronto"
          : "Assistente local indisponível (app continua)",
        checks: {
          ...this.splashState.checks,
          ai: aiOk ? "ok" : "warn",
        },
      });
      this.log("ai_bootstrap_done", { ai: aiOk });
    } catch (e) {
      this.log("ai_bootstrap_error", {
        error: e instanceof Error ? e.message : String(e),
      });
      this.updateSplash({
        checks: { ...this.splashState.checks, ai: "warn" },
        message: "Assistente local indisponível (app continua)",
      });
    }
  }

  async reclaimPort(port) {
    const pids = await listListeningPids(port);
    for (const pid of pids) {
      if (pid === process.pid) continue;
      this.log("reclaim_kill", { port, pid });
      try {
        if (process.platform === "win32") {
          spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
          });
        } else {
          process.kill(pid, "SIGTERM");
        }
      } catch {
        /* ignore */
      }
    }
    await sleep(400);
  }

  async startAppServer() {
    const node = process.execPath;
    const packaged = path.join(this.rootDir, this.config.paths.appServer);
    const standalone = path.join(
      this.rootDir,
      ".next",
      "standalone",
      "server.js",
    );
    const serverJs = [packaged, standalone].find((p) => fs.existsSync(p));

    if (!serverJs) {
      throw new Error(
        "Servidor do aplicativo não encontrado. Execute npm run build (e, para o .exe, npm run package:windows).",
      );
    }

    // Com output:standalone, "next start" quebra — sempre usar server.js.
    this.spawnChild(
      "app",
      node,
      [serverJs],
      {
        ...process.env,
        ...this.config.env,
        PORT: String(this.config.appPort),
        HOSTNAME: this.config.host,
        NODE_ENV: "production",
      },
      path.dirname(serverJs),
    );
  }

  async ensureOllama() {
    const tagsUrl = "http://127.0.0.1:11434/api/tags";
    if (await ping(tagsUrl)) {
      this.log("ollama_already_up", { url: tagsUrl });
      return true;
    }
    const started = await this.startOllamaDetached();
    if (!started) {
      this.log("ollama_binary_missing");
      return false;
    }
    const deadline = Date.now() + this.config.healthTimeoutMs;
    while (Date.now() < deadline) {
      if (this.shuttingDown) return false;
      if (await ping(tagsUrl)) {
        this.log("ollama_ready", { url: tagsUrl });
        return true;
      }
      await sleep(this.config.healthPollMs);
    }
    this.log("ollama_timeout", { url: tagsUrl });
    return false;
  }

  /**
   * Sobe o app do Ollama (ou `ollama serve`) sem anexá-lo aos filhos.
   * Encerrar o launcher não mata o serviço do sistema.
   */
  async startOllamaDetached() {
    for (const target of ollamaLaunchTargets()) {
      if (path.isAbsolute(target.command) && !fs.existsSync(target.command)) {
        continue;
      }
      const ok = await spawnDetached(target.command, target.args);
      if (!ok) continue;
      this.log("ollama_spawn", {
        command: target.command,
        args: target.args.join(" "),
      });
      return true;
    }
    return false;
  }

  async waitForAiHealth() {
    const url = `http://${this.config.host}:${this.config.aiPort}/health`;
    const deadline = Date.now() + this.config.healthTimeoutMs;
    while (Date.now() < deadline) {
      if (this.shuttingDown) return false;
      const body = await getJson(url);
      if (body) {
        const ready = body.runtime === "ready" && body.modelReady === true;
        if (ready) {
          this.log("health_ok", {
            label: "Assistente local",
            url,
            model: body.model ?? null,
          });
          return true;
        }
        if (body.runtime === "ready" && body.modelReady === false) {
          this.log("health_ai_no_model", { url });
          return false;
        }
      }
      await sleep(this.config.healthPollMs);
    }
    this.log("health_optional_timeout", { label: "Assistente local", url });
    return false;
  }

  async startAiRuntime() {
    const entry = path.join(this.rootDir, this.config.paths.aiRuntime);
    if (!fs.existsSync(entry)) {
      // fallback monorepo
      const mono = path.join(this.rootDir, "local-ai-runtime", "src", "index.js");
      if (!fs.existsSync(mono)) {
        this.log("ai_runtime_missing", { entry });
        return;
      }
      this.spawnChild(
        "ai",
        process.execPath,
        [mono],
        {
          ...process.env,
          ...this.config.env,
          GF_AI_PORT: String(this.config.aiPort),
          GF_AI_HOST: this.config.host,
          GF_AI_ORIGINS: `http://${this.config.host}:${this.config.appPort},http://localhost:${this.config.appPort}`,
        },
        path.dirname(mono),
      );
      return;
    }

    this.spawnChild(
      "ai",
      process.execPath,
      [entry],
      {
        ...process.env,
        ...this.config.env,
        GF_AI_PORT: String(this.config.aiPort),
        GF_AI_HOST: this.config.host,
        GF_AI_ORIGINS: `http://${this.config.host}:${this.config.appPort},http://localhost:${this.config.appPort}`,
      },
      path.dirname(entry),
    );
  }

  spawnChild(name, command, args, env, cwd) {
    const proc = spawn(command, args, {
      cwd: cwd ?? this.rootDir,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stdout?.on("data", (buf) =>
      this.log(`${name}_out`, { line: String(buf).trim().slice(0, 400) }),
    );
    proc.stderr?.on("data", (buf) =>
      this.log(`${name}_err`, { line: String(buf).trim().slice(0, 400) }),
    );
    proc.on("exit", (code, signal) => {
      this.log(`${name}_exit`, { code, signal });
      this.children = this.children.filter((c) => c.proc !== proc);
    });
    this.children.push({ name, proc });
    this.log("spawn", { name, args: args.join(" ") });
  }

  async waitForHttp(url, label, opts = {}) {
    const deadline = Date.now() + this.config.healthTimeoutMs;
    while (Date.now() < deadline) {
      if (this.shuttingDown) return false;
      const ok = await ping(url);
      if (ok) {
        this.log("health_ok", { label, url });
        return true;
      }
      await sleep(this.config.healthPollMs);
    }
    if (opts.optional) {
      this.log("health_optional_timeout", { label, url });
      return false;
    }
    throw new Error(`${label} não respondeu a tempo.`);
  }

  updateSplash(partial) {
    this.splashState = {
      ...this.splashState,
      ...partial,
      checks: { ...this.splashState.checks, ...(partial.checks ?? {}) },
    };
  }

  async waitUntilExit() {
    while (!this.shuttingDown && this.children.length > 0) {
      await sleep(1000);
    }
  }

  async shutdown(reason) {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.log("launcher_shutdown", { reason });
    this.killChildrenSync();
    if (this.splash) {
      await new Promise((resolve) => this.splash.close(() => resolve()));
      this.splash = null;
    }
    this.logStream?.end();
  }

  killChildrenSync() {
    for (const child of [...this.children]) {
      try {
        if (process.platform === "win32" && child.proc.pid) {
          spawn("taskkill", ["/pid", String(child.proc.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
          });
        } else {
          child.proc.kill("SIGTERM");
        }
      } catch {
        /* ignore */
      }
    }
    this.children = [];
  }

  setupLogging() {
    const logsDir = path.join(this.rootDir, this.config.paths.logs);
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(path.join(this.rootDir, this.config.paths.data), {
      recursive: true,
    });
    const file = path.join(
      logsDir,
      `launcher-${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
    );
    this.logStream = fs.createWriteStream(file, { flags: "a" });
  }

  log(event, meta = {}) {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...meta,
    });
    this.logStream?.write(line + "\n");
    if (process.env.GF_LAUNCHER_VERBOSE === "1") console.info(line);
  }
}

export function loadConfig(rootDir) {
  const candidates = [
    path.join(rootDir, "config", "launcher.json"),
    path.join(rootDir, "launcher.json"),
    path.join(__dirname, "..", "..", "config", "launcher.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  }
  throw new Error("launcher.json não encontrado");
}

export function resolveInstallRoot() {
  if (process.env.GF_ROOT && fs.existsSync(process.env.GF_ROOT)) {
    return path.resolve(process.env.GF_ROOT);
  }
  const here = path.resolve(__dirname, "..", "..");
  if (fs.existsSync(path.join(here, "config", "launcher.json"))) return here;
  return process.cwd();
}

function openInBrowser(url, appMode) {
  if (process.platform === "win32") {
    if (appMode) {
      const candidates = [
        path.join(
          process.env.PROGRAMFILES || "C:\\Program Files",
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe",
        ),
        path.join(
          process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe",
        ),
        path.join(
          process.env.PROGRAMFILES || "C:\\Program Files",
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        ),
      ];
      for (const bin of candidates) {
        if (fs.existsSync(bin)) {
          spawn(bin, [`--app=${url}`], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
          }).unref();
          return;
        }
      }
    }
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(opener, [url], { detached: true, stdio: "ignore" }).unref();
}

function ollamaLaunchTargets() {
  const localApp = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
  const roots = [
    path.join(localApp, "Programs", "Ollama"),
    path.join(programFiles, "Ollama"),
  ];
  const targets = [];
  for (const root of roots) {
    targets.push({ command: path.join(root, "ollama app.exe"), args: [] });
  }
  targets.push({ command: "ollama", args: ["serve"] });
  for (const root of roots) {
    targets.push({ command: path.join(root, "ollama.exe"), args: ["serve"] });
  }
  return targets;
}

function spawnDetached(command, args) {
  return new Promise((resolve) => {
    let settled = false;
    const proc = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (ok) proc.unref();
      resolve(ok);
    };
    proc.once("error", () => finish(false));
    proc.once("spawn", () => finish(true));
  });
}

function getJson(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 1500 }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        if ((res.statusCode ?? 500) >= 500) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2500 }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function listListeningPids(port) {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve([]);
      return;
    }
    const result = spawnSync(
      "cmd",
      ["/c", `netstat -ano | findstr :${port}`],
      { encoding: "utf8", windowsHide: true },
    );
    const out = result.stdout || "";
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!/LISTENING/i.test(line)) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
    resolve([...pids]);
  });
}

async function portLooksTaken(port) {
  const pids = await listListeningPids(port);
  return pids.length > 0;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function flushLog(stream) {
  return new Promise((resolve) => {
    if (!stream) {
      resolve();
      return;
    }
    stream.end(resolve);
  });
}
