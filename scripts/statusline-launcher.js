"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const VALID_LAUNCH_MODES = ["auto", "overlay", "window", "split"];
const WINDOW_TITLE = "Custom Status Line";

/**
 * Normalize raw `--open` / `--open-ui` mode argument into an internal target mode.
 * Returns null if invalid.
 */
function normalizeLaunchMode(rawMode) {
  if (rawMode === true || rawMode === undefined || rawMode === null || rawMode === "") {
    return "overlay";
  }
  const lower = String(rawMode).trim().toLowerCase();
  if (!lower || lower === "auto") return "overlay";
  if (lower === "overlay" || lower === "window" || lower === "split") return lower;
  return null;
}

/**
 * Quote a single argument for POSIX shells using single quotes.
 */
function quoteShellArg(arg) {
  return `'${String(arg).replace(/'/g, "'\\''")}'`;
}

function isExecutableFile(filePath, platform) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (platform === "win32") return true;
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pure-Node PATH lookup to check whether an executable exists.
 */
function commandExists(bin, env = process.env, platform = process.platform) {
  if (!bin || typeof bin !== "string") return false;
  if (bin.includes("/") || bin.includes("\\")) {
    return isExecutableFile(bin, platform);
  }
  const pathVar = (env && (env.PATH || env.Path)) || "";
  if (!pathVar) return false;

  const sep = platform === "win32" ? ";" : ":";
  const dirs = pathVar.split(sep).filter(Boolean);
  const exts =
    platform === "win32"
      ? String((env && env.PATHEXT) || ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .filter(Boolean)
      : [""];

  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, platform === "win32" && ext && !bin.toLowerCase().endsWith(ext.toLowerCase()) ? `${bin}${ext}` : bin);
      if (isExecutableFile(candidate, platform)) return true;
    }
  }
  return false;
}

/**
 * Clone environment for child terminal spawning and clear TERM=dumb inherited from non-interactive runners.
 */
function buildCleanSpawnEnv(baseEnv = process.env) {
  const copy = { ...(baseEnv || {}) };
  if (copy.TERM === "dumb") {
    delete copy.TERM;
  }
  return copy;
}

/**
 * Build CLI arguments for spawning the interactive `--ui` subprocess.
 */
function buildUiChildArgs({ manageScriptPath, configPath, cliLang } = {}) {
  const args = [manageScriptPath || path.resolve(__dirname, "manage-statusline.js"), "--ui"];
  if (cliLang && typeof cliLang === "string") {
    args.push("--lang", cliLang);
  }
  if (configPath && typeof configPath === "string") {
    args.push("--config", configPath);
  }
  return args;
}

/**
 * Build a copy-pasteable shell command as fallback when auto-launch is unavailable.
 */
function buildFallbackCommand({ nodePath = process.execPath, manageScriptPath, configPath, cliLang } = {}) {
  const args = buildUiChildArgs({ manageScriptPath, configPath, cliLang });
  return [nodePath, ...args].map(quoteShellArg).join(" ");
}

function escapeAppleScriptString(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function addKittyLaunchPlans(plans, { launchType, methodPrefix, modeUsed, env, which, nodePath, childArgs }) {
  if (!env.KITTY_LISTEN_ON || !which("kitty")) return;
  const baseArgs = [
    "@",
    "--to",
    env.KITTY_LISTEN_ON,
    "launch",
    `--type=${launchType}`,
    "--cwd=current",
    "--title",
    WINDOW_TITLE,
    "--",
    nodePath,
    ...childArgs,
  ];
  if (env.KITTY_WINDOW_ID) {
    // `--match` selects tabs; match the tab containing the active `window_id` explicitly.
    const matchedArgs = [
      "@",
      "--to",
      env.KITTY_LISTEN_ON,
      "launch",
      `--type=${launchType}`,
      "--match",
      `window_id:${env.KITTY_WINDOW_ID}`,
      "--cwd=current",
      "--title",
      WINDOW_TITLE,
      "--",
      nodePath,
      ...childArgs,
    ];
    plans.push({
      id: `${methodPrefix}-matched`,
      modeUsed,
      sync: true,
      cmd: "kitty",
      args: matchedArgs,
    });
  }
  plans.push({
    id: methodPrefix,
    modeUsed,
    sync: true,
    cmd: "kitty",
    args: baseArgs,
  });
}

function appendDesktopWindowPlans(plans, { env, platform, which, nodePath, childArgs, shellCmd }) {
  if (platform === "linux" && (env.WAYLAND_DISPLAY || env.DISPLAY)) {
    if (env.KITTY_LISTEN_ON && which("kitty")) {
      plans.push({
        id: "kitty-os-window",
        modeUsed: "window",
        sync: true,
        cmd: "kitty",
        args: [
          "@",
          "--to",
          env.KITTY_LISTEN_ON,
          "launch",
          "--type=os-window",
          "--cwd=current",
          "--title",
          WINDOW_TITLE,
          "--",
          nodePath,
          ...childArgs,
        ],
      });
    }

    const linuxTerminals = [
      ["kitty", ["--title", WINDOW_TITLE, "--", nodePath, ...childArgs]],
      ["konsole", ["-e", nodePath, ...childArgs]],
      ["ghostty", ["-e", nodePath, ...childArgs]],
      ["alacritty", ["--title", WINDOW_TITLE, "-e", nodePath, ...childArgs]],
      ["wezterm", ["start", "--", nodePath, ...childArgs]],
      ["foot", ["-T", WINDOW_TITLE, nodePath, ...childArgs]],
      ["gnome-terminal", ["--", nodePath, ...childArgs]],
      ["xfce4-terminal", ["-x", nodePath, ...childArgs]],
      ["xdg-terminal-exec", [nodePath, ...childArgs]],
      ["x-terminal-emulator", ["-e", nodePath, ...childArgs]],
      ["xterm", ["-e", nodePath, ...childArgs]],
    ];

    for (const [bin, args] of linuxTerminals) {
      if (which(bin)) {
        plans.push({
          id: `linux-${bin}`,
          modeUsed: "window",
          sync: false,
          cmd: bin,
          args,
        });
      }
    }
    return;
  }

  if (platform === "darwin") {
    const escaped = escapeAppleScriptString(shellCmd);
    if (env.TERM_PROGRAM === "iTerm.app") {
      plans.push({
        id: "macos-iterm2",
        modeUsed: "window",
        sync: true,
        cmd: "osascript",
        args: [
          "-e",
          `tell application "iTerm" to create window with default profile command "${escaped}"`,
          "-e",
          'tell application "iTerm" to activate',
        ],
      });
    }
    plans.push({
      id: "macos-terminal",
      modeUsed: "window",
      sync: true,
      cmd: "osascript",
      args: [
        "-e",
        `tell application "Terminal" to do script "${escaped}"`,
        "-e",
        'tell application "Terminal" to activate',
      ],
    });
    return;
  }

  if (platform === "win32") {
    if (which("wt")) {
      plans.push({
        id: "win-wt",
        modeUsed: "window",
        sync: false,
        cmd: "wt",
        args: ["new-tab", "--title", WINDOW_TITLE, "--", nodePath, ...childArgs],
      });
    }
    plans.push({
      id: "win-cmd",
      modeUsed: "window",
      sync: false,
      cmd: "cmd.exe",
      args: ["/c", "start", WINDOW_TITLE, nodePath, ...childArgs],
    });
  }
}

/**
 * Build ordered launch candidate plans without side effects.
 */
function resolveLaunchPlans(options = {}) {
  const mode = normalizeLaunchMode(options.mode);
  if (!mode) return [];

  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const which = options.which || ((bin) => commandExists(bin, env, platform));
  const nodePath = options.nodePath || process.execPath;
  const manageScriptPath = options.manageScriptPath || path.resolve(__dirname, "manage-statusline.js");
  const childArgs = buildUiChildArgs({
    manageScriptPath,
    configPath: options.configPath,
    cliLang: options.cliLang,
  });
  const shellCmd = [nodePath, ...childArgs].map(quoteShellArg).join(" ");
  const ctx = { env, platform, which, nodePath, childArgs, shellCmd };
  const plans = [];

  if (mode === "overlay") {
    addKittyLaunchPlans(plans, { launchType: "overlay", methodPrefix: "kitty-overlay", modeUsed: "overlay", ...ctx });
    if (env.TMUX && which("tmux")) {
      plans.push({
        id: "tmux-popup",
        modeUsed: "overlay",
        sync: false,
        cmd: "tmux",
        args: ["display-popup", "-E", "-w", "90%", "-h", "85%", "-T", WINDOW_TITLE, shellCmd],
      });
      plans.push({
        id: "tmux-split",
        modeUsed: "split",
        sync: true,
        cmd: "tmux",
        args: ["split-window", "-h", shellCmd],
      });
    }
    if (env.ZELLIJ && which("zellij")) {
      plans.push({
        id: "zellij-floating",
        modeUsed: "overlay",
        sync: false,
        cmd: "zellij",
        args: ["run", "--floating", "--close-on-exit", "--name", WINDOW_TITLE, "--", nodePath, ...childArgs],
      });
    }
    if (env.WEZTERM_PANE && which("wezterm")) {
      plans.push({
        id: "wezterm-split",
        modeUsed: "split",
        sync: true,
        cmd: "wezterm",
        args: ["cli", "split-pane", "--right", "--", nodePath, ...childArgs],
      });
    }
    appendDesktopWindowPlans(plans, ctx);
    return plans;
  }

  if (mode === "split") {
    addKittyLaunchPlans(plans, { launchType: "window", methodPrefix: "kitty-split", modeUsed: "split", ...ctx });
    if (env.TMUX && which("tmux")) {
      plans.push({
        id: "tmux-split",
        modeUsed: "split",
        sync: true,
        cmd: "tmux",
        args: ["split-window", "-h", shellCmd],
      });
    }
    if (env.WEZTERM_PANE && which("wezterm")) {
      plans.push({
        id: "wezterm-split",
        modeUsed: "split",
        sync: true,
        cmd: "wezterm",
        args: ["cli", "split-pane", "--right", "--", nodePath, ...childArgs],
      });
    }
    if (env.ZELLIJ && which("zellij")) {
      plans.push({
        id: "zellij-split",
        modeUsed: "split",
        sync: false,
        cmd: "zellij",
        args: ["run", "--close-on-exit", "--name", WINDOW_TITLE, "--", nodePath, ...childArgs],
      });
    }
    appendDesktopWindowPlans(plans, ctx);
    return plans;
  }

  // mode === "window"
  appendDesktopWindowPlans(plans, ctx);
  if (env.TMUX && which("tmux")) {
    plans.push({
      id: "tmux-window",
      modeUsed: "window",
      sync: true,
      cmd: "tmux",
      args: ["new-window", "-n", "statusline", shellCmd],
    });
  }
  if (env.WEZTERM_PANE && which("wezterm")) {
    plans.push({
      id: "wezterm-window",
      modeUsed: "window",
      sync: true,
      cmd: "wezterm",
      args: ["cli", "spawn", "--new-window", "--", nodePath, ...childArgs],
    });
  }
  return plans;
}

/**
 * Execute a single launch plan candidate.
 */
function executePlan(plan, cleanEnv, cwd = process.cwd()) {
  if (plan.sync) {
    const res = spawnSync(plan.cmd, plan.args, {
      cwd,
      env: cleanEnv,
      encoding: "utf8",
      timeout: 3000,
    });
    if (!res.error && res.status === 0) {
      return Promise.resolve({ ok: true, error: "" });
    }
    const errText =
      (res.error && res.error.message) ||
      (res.stderr && String(res.stderr).trim()) ||
      `exit ${res.status}`;
    return Promise.resolve({ ok: false, error: errText });
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    let child;
    try {
      child = spawn(plan.cmd, plan.args, {
        cwd,
        env: cleanEnv,
        detached: true,
        stdio: "ignore",
      });
    } catch (err) {
      finish({ ok: false, error: err.message || String(err) });
      return;
    }

    child.once("error", (err) => {
      finish({ ok: false, error: err.message || String(err) });
    });

    child.once("exit", (code) => {
      finish({ ok: code === 0, error: code === 0 ? "" : `exit ${code}` });
    });

    timer = setTimeout(() => {
      try {
        child.unref();
      } catch {
        // ignore
      }
      finish({ ok: true, error: "" });
    }, 150);
    if (typeof timer.unref === "function") timer.unref();
  });
}

/**
 * Attempt to launch the `--ui` configurator in an overlay/popup, split, or desktop terminal window.
 */
async function launchTuiExternal(options = {}) {
  const requestedMode = normalizeLaunchMode(options.mode);
  const env = options.env || process.env;
  const nodePath = options.nodePath || process.execPath;
  const manageScriptPath = options.manageScriptPath || path.resolve(__dirname, "manage-statusline.js");
  const fallbackCommand = buildFallbackCommand({
    nodePath,
    manageScriptPath,
    configPath: options.configPath,
    cliLang: options.cliLang,
  });

  if (!requestedMode) {
    return {
      ok: false,
      reason: "invalid_mode",
      errors: [`Invalid mode: ${options.mode}`],
      fallbackCommand,
    };
  }

  const plans = resolveLaunchPlans({
    ...options,
    mode: requestedMode,
    env,
    nodePath,
    manageScriptPath,
  });
  if (plans.length === 0) {
    return {
      ok: false,
      reason: "no_terminal",
      errors: [],
      fallbackCommand,
    };
  }

  const cleanEnv = buildCleanSpawnEnv(env);
  const cwd = options.cwd || process.cwd();
  const executor = options.executor || ((p) => executePlan(p, cleanEnv, cwd));
  const errors = [];

  for (const plan of plans) {
    const res = await executor(plan);
    if (res && res.ok) {
      return {
        ok: true,
        method: plan.id,
        mode: plan.modeUsed,
        fallbackCommand,
      };
    }
    errors.push(`${plan.id}: ${(res && res.error) || "failed"}`);
  }

  return {
    ok: false,
    reason: "launch_failed",
    errors,
    fallbackCommand,
  };
}

module.exports = {
  VALID_LAUNCH_MODES,
  normalizeLaunchMode,
  quoteShellArg,
  commandExists,
  buildCleanSpawnEnv,
  buildUiChildArgs,
  buildFallbackCommand,
  resolveLaunchPlans,
  executePlan,
  launchTuiExternal,
};
