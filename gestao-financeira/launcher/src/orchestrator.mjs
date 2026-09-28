/**
 * Orquestrador do Gestão Financeira.
 * Inicia App (Next standalone) + AI Runtime, health-check, abre navegador.
 */

import { spawn } from "node:child_process";
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

    this.splash = await createSplashServer(
      this.config.host,
      this.config.splashPort,
      () => this.splashState,
    );

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
      await this.startAppServer();
      await this.waitForHttp(
        `http://${this.config.host}:${this.config.appPort}/`,
        "Aplicativo",
      );
      this.updateSplash({
        message: "Aplicativo pronto",
        checks: { ...this.splashState.checks, app: "ok" },
      });

      this.updateSplash({ message: "Iniciando assistente local…" });
      await this.startAiRuntime();
      const aiOk = await this.waitForHttp(
        `http://${this.config.host}:${this.config.aiPort}/health`,
        "Assistente local",
        { optional: true },
      );
      this.updateSplash({
        message: aiOk
          ? "Assistente local pronto"
          : "Assistente local indisponível (app continua)",
        checks: {
          ...this.splashState.checks,
          ai: aiOk ? "ok" : "warn",
        },
      });

      const appUrl = `http://${this.config.host}:${this.config.appPort}/`;
      this.updateSplash({
        phase: "ready",
        message: "Abrindo Gestão Financeira…",
        checks: {
          app: "ok",
          ai: aiOk ? "ok" : "warn",
          security: "ok",
        },
        redirectUrl: appUrl,
      });

      await sleep(900);
      if (this.config.openBrowser) {
        openInBrowser(appUrl, this.config.browserAppMode);
      }

      this.log("launcher_ready", { app: appUrl, ai: aiOk });
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

  async startAppServer() {
    const serverJs = path.join(this.rootDir, this.config.paths.appServer);
    const node = process.execPath;

    if (!fs.existsSync(serverJs)) {
      const nextBin = path.join(
        this.rootDir,
        "node_modules",
        "next",
        "dist",
        "bin",
        "next",
      );
      if (fs.existsSync(nextBin)) {
        this.spawnChild(
          "app",
          node,
          [
            nextBin,
            "start",
            "--hostname",
            this.config.host,
            "--port",
            String(this.config.appPort),
          ],
          {
            ...process.env,
            ...this.config.env,
            PORT: String(this.config.appPort),
            HOSTNAME: this.config.host,
          },
        );
        return;
      }
      throw new Error(
        `Servidor do aplicativo não encontrado. Execute npm run package:windows.`,
      );
    }

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

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 1500 }, (res) => {
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
