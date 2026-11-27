#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const HOME_DIR = os.homedir();
const CLI_DIR = path.join(HOME_DIR, ".gemini", "antigravity-cli");
const AGY_SETTINGS_PATH = path.join(CLI_DIR, "settings.json");
const DEFAULT_USER_CONFIG_PATH = path.join(CLI_DIR, "statusline.config.json");
const DEFAULT_LAST_PAYLOAD_PATH = path.join(
  CLI_DIR,
  "plugin_data",
  "custom-statusline",
  "last-payload.json"
);

function resolveLastPayloadPath(customPath) {
  if (typeof customPath === "string" && customPath.trim()) return customPath.trim();
  if (typeof process.env.STATUSLINE_LAST_PAYLOAD_PATH === "string" && process.env.STATUSLINE_LAST_PAYLOAD_PATH.trim()) {
    return process.env.STATUSLINE_LAST_PAYLOAD_PATH.trim();
  }
  return DEFAULT_LAST_PAYLOAD_PATH;
}

const EFFORT_LEVELS = new Set(["minimal", "low", "medium", "high", "xhigh", "max"]);
const STATUS_LOCALES = ["en", "zh", "auto"];

function resolveStatusLocale(config, env = process.env) {
  const raw = typeof config?.statusLocale === "string" ? config.statusLocale.trim().toLowerCase() : "en";
  if (raw === "zh") return "zh";
  if (raw === "auto") {
    const sysLang = env?.LC_ALL || env?.LC_MESSAGES || env?.LANG || "";
    return /^zh/i.test(String(sysLang)) ? "zh" : "en";
  }
  return "en";
}

const DEFAULT_CONFIG = {
  version: 1,
  locale: "auto",
  statusLocale: "en",
  colorScheme: "auto",
  separator: " · ",
  leftSeparator: " · ",
  left: ["vim", "shortcuts"],
  right: ["tasks", "subagents", "mode", "model"],
  widgets: {
    vim: { enabled: true },
    shortcuts: { enabled: true, text: "? for shortcuts" },
    tasks: { enabled: true, showCommandHint: true },
    subagents: { enabled: true, includeCompleted: false },
    mode: { enabled: true, uppercase: false },
    model: {
      enabled: true,
      orchestratorStyle: "official",
      showEffort: true,
    },
    context: {
      enabled: true,
      format: "percent",
      prefix: "ctx ",
      barWidth: 8,
      showWhenZero: true,
      warnAtPercent: 60,
      criticalAtPercent: 85,
    },
    context_extra: {
      enabled: true,
      showCacheRate: true,
      showCacheTokens: false,
      showExceeds200k: true,
      cachePrefix: "cache ",
      exceeds200kText: ">200k",
      showPlaceholder: true,
    },
    quota: {
      enabled: true,
      bucket: "gemini-5h",
      format: "percent",
      metric: "remaining",
      prefix: "quota ",
      barWidth: 6,
      showReset: "none",
      warnBelowPercent: 30,
      criticalBelowPercent: 10,
    },
    git: {
      enabled: true,
      showDirty: true,
      maxLength: 28,
    },
    cwd: {
      enabled: true,
      style: "basename",
    },
    state: {
      enabled: true,
      hideWhenIdle: true,
    },
    artifacts: { enabled: true },
    queued: { enabled: true },
    sandbox: { enabled: true, onlyWhenEnabled: true },
    cost: { enabled: true, decimals: 2 },
    title: {
      enabled: true,
      maxLength: 24,
      prefix: "",
    },
    confirm: {
      enabled: true,
      text: "confirm!",
    },
    conversation_id: {
      enabled: true,
      length: 8,
      prefix: "",
    },
  },
};

// Official palettes for built-in CLI color schemes
const PALETTES = {
  light: {
    fg: "#202124",
    secondary: "#3c4043",
    subtle: "#5f6368",
    muted: "#80868b",
    blue: "#1967d2",
    green: "#188038",
    orange: "#e37400",
    purple: "#9334e6",
    red: "#c5221f",
  },
  "solarized light": {
    fg: "#073642",
    secondary: "#586e75",
    subtle: "#657b83",
    muted: "#839496",
    blue: "#268bd2",
    green: "#859900",
    orange: "#cb4b16",
    purple: "#d33682",
    red: "#dc322f",
  },
  "colorblind-friendly light": {
    fg: "#202124",
    secondary: "#3c4043",
    subtle: "#5f6368",
    muted: "#80868b",
    blue: "#1967d2",
    green: "#1967d2",
    orange: "#e8710a",
    purple: "#1967d2",
    red: "#c5221f",
  },
  dark: {
    fg: "#e8eaed",
    secondary: "#bdc1c6",
    subtle: "#9aa0a6",
    muted: "#80868b",
    blue: "#8ab4f8",
    green: "#81c995",
    orange: "#f9ab00",
    purple: "#d7aefb",
    red: "#f28b82",
  },
  "solarized dark": {
    fg: "#eee8d5",
    secondary: "#93a1a1",
    subtle: "#839496",
    muted: "#657b83",
    blue: "#268bd2",
    green: "#859900",
    orange: "#cb4b16",
    purple: "#d33682",
    red: "#dc322f",
  },
  "colorblind-friendly dark": {
    fg: "#e8eaed",
    secondary: "#bdc1c6",
    subtle: "#9aa0a6",
    muted: "#80868b",
    blue: "#8ab4f8",
    green: "#8ab4f8",
    orange: "#f9ab00",
    purple: "#8ab4f8",
    red: "#f28b82",
  },
  "tokyo night": {
    fg: "#c0caf5",
    secondary: "#9aa5ce",
    subtle: "#7e86ad",
    muted: "#787c99",
    blue: "#7aa2f7",
    green: "#9ece6a",
    orange: "#ff9e64",
    purple: "#bb9af7",
    red: "#f7768e",
  },
  terminal: {
    fg: null,
    secondary: 7,
    subtle: 8,
    muted: 8,
    blue: 4,
    green: 2,
    orange: 3,
    purple: 5,
    red: 1,
  },
};

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJsonSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function mergeConfig(base, override) {
  const result = cloneJson(base);
  if (!isPlainObject(override)) return result;

  for (const key of Object.keys(override)) {
    const val = override[key];
    if (val === undefined || key === "$schema") continue;
    if (key === "left" || key === "right") {
      if (Array.isArray(val)) {
        result[key] = val.filter((item) => typeof item === "string" && item.trim() !== "");
      }
      continue;
    }
    if (key === "widgets" && isPlainObject(val)) {
      for (const wName of Object.keys(val)) {
        if (isPlainObject(val[wName])) {
          result.widgets[wName] = isPlainObject(result.widgets[wName])
            ? { ...result.widgets[wName], ...val[wName] }
            : { ...val[wName] };
        }
      }
      continue;
    }
    if (isPlainObject(val) && isPlainObject(result[key])) {
      result[key] = { ...result[key], ...val };
    } else {
      result[key] = val;
    }
  }
  return result;
}

function loadConfig(configPath) {
  const resolved = configPath || process.env.STATUSLINE_CONFIG || DEFAULT_USER_CONFIG_PATH;
  const userCfg = readJsonSafe(resolved);
  return mergeConfig(DEFAULT_CONFIG, userCfg);
}

function loadSettings(settingsPath) {
  return readJsonSafe(settingsPath || process.env.AGY_SETTINGS_PATH || AGY_SETTINGS_PATH) || {};
}

function hexToRgb(hex) {
  if (typeof hex !== "string" || !hex.startsWith("#")) return null;
  let clean = hex.slice(1);
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  if (clean.length !== 6) return null;
  const n = parseInt(clean, 16);
  if (!Number.isFinite(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function resolvePalette(config, settings) {
  if (process.env.NO_COLOR || config.colorScheme === "none") {
    return null;
  }
  let schemeName = typeof config.colorScheme === "string" ? config.colorScheme.trim().toLowerCase() : "auto";
  if (!schemeName || schemeName === "auto") {
    const fromSettings = settings && typeof settings.colorScheme === "string" ? settings.colorScheme.trim().toLowerCase() : "";
    schemeName = fromSettings || "terminal";
  }
  return PALETTES[schemeName] || PALETTES.terminal;
}

function makeStyler(palette) {
  if (!palette) {
    return (text) => String(text);
  }
  return function style(text, role = "subtle", options = {}) {
    const str = String(text);
    if (!str) return "";
    const codes = [];
    if (options.bold) codes.push("1");
    if (options.dim) codes.push("2");
    const color = palette[role] !== undefined ? palette[role] : palette.subtle;
    if (typeof color === "number") {
      codes.push(`38;5;${color}`);
    } else if (typeof color === "string") {
      const rgb = hexToRgb(color);
      if (rgb) {
        codes.push(`38;2;${rgb[0]};${rgb[1]};${rgb[2]}`);
      }
    }
    if (codes.length === 0) return str;
    return `\x1b[${codes.join(";")}m${str}\x1b[0m`;
  };
}

// Strip ANSI CSI and OSC sequences
const ANSI_RE = /(?:\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))/g;

function stripAnsi(str) {
  return String(str).replace(ANSI_RE, "");
}

function isWideCodePoint(cp) {
  return (
    cp >= 0x1100 &&
    (cp <= 0x115f ||
      cp === 0x2329 ||
      cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0x303e) ||
      (cp >= 0x3040 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe19) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1f64f) ||
      (cp >= 0x1f900 && cp <= 0x1f9ff) ||
      (cp >= 0x20000 && cp <= 0x3fffd))
  );
}

function charDisplayWidth(cp) {
  if (cp === 0 || (cp >= 0x00 && cp < 0x20) || (cp >= 0x7f && cp < 0xa0)) return 0;
  // Combining diacritical marks & variation selectors
  if (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xfe20 && cp <= 0xfe2f) ||
    (cp >= 0xe0100 && cp <= 0xe01ef)
  ) {
    return 0;
  }
  return isWideCodePoint(cp) ? 2 : 1;
}

function visibleWidth(str) {
  const plain = stripAnsi(str);
  let w = 0;
  for (const ch of plain) {
    const cp = ch.codePointAt(0);
    w += charDisplayWidth(cp);
  }
  return w;
}

function truncateAnsi(str, maxCols) {
  if (maxCols <= 0) return "";
  if (visibleWidth(str) <= maxCols) return str;
  const targetCols = maxCols > 1 ? maxCols - 1 : 0;
  let out = "";
  let w = 0;
  let hasAnsi = false;
  let i = 0;
  const src = String(str);
  while (i < src.length) {
    if (src[i] === "\x1b") {
      ANSI_RE.lastIndex = i;
      const m = ANSI_RE.exec(src);
      if (m && m.index === i) {
        out += m[0];
        hasAnsi = true;
        i += m[0].length;
        continue;
      }
    }
    const cp = src.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    const cw = charDisplayWidth(cp);
    if (w + cw > targetCols) break;
    out += ch;
    w += cw;
    i += ch.length;
  }
  if (maxCols >= 1) {
    out += "…";
  }
  if (hasAnsi) {
    out += "\x1b[0m";
  }
  return out;
}

function stripEffortSuffix(rawName) {
  if (typeof rawName !== "string") return { base: "", extractedEffort: "" };
  const trimmed = rawName.trim();
  if (!trimmed) return { base: "", extractedEffort: "" };
  const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(trimmed);
  if (!m) return { base: trimmed, extractedEffort: "" };

  const inner = m[2].trim();
  const lower = inner.toLowerCase();
  if (EFFORT_LEVELS.has(lower)) {
    return { base: m[1].trim(), extractedEffort: lower };
  }
  const thinkingMatch = /^([a-z]+)\s+thinking$/i.exec(inner);
  if (thinkingMatch && EFFORT_LEVELS.has(thinkingMatch[1].toLowerCase())) {
    return { base: m[1].trim(), extractedEffort: thinkingMatch[1].toLowerCase() };
  }
  return { base: trimmed, extractedEffort: "" };
}

function formatModelEffort(rawName, explicitEffort, showEffort) {
  const { base, extractedEffort } = stripEffortSuffix(rawName);
  const eff =
    typeof explicitEffort === "string" && explicitEffort.trim()
      ? explicitEffort.trim().toLowerCase()
      : extractedEffort;
  if (!base) return "";
  if (showEffort && eff) {
    return { base, effort: eff, text: `${base} · ${eff}` };
  }
  return { base, effort: "", text: base };
}

function shortenModelName(rawName) {
  const { base, extractedEffort } = stripEffortSuffix(rawName);
  if (!base) return "";
  const cleaned = base
    .replace(/^Gemini\s+\S+\s+/i, "")
    .replace(/^Claude\s+/i, "");
  if (extractedEffort) {
    const code = extractedEffort === "xhigh" ? "XH" : extractedEffort[0].toUpperCase();
    return `${cleaned}(${code})`;
  }
  return cleaned;
}

function formatTokenCount(n) {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

const ZH_VIM_LABELS = {
  INSERT: "-- 插入 --",
  VISUAL: "-- 可视 --",
  "VISUAL LINE": "-- 行可视 --",
};
const ZH_MODE_LABELS = {
  auto: "自动",
  plan: "规划",
  "accept-edits": "自动编辑",
  "best-of-n": "多路优选",
};
const ZH_STATE_LABELS = {
  idle: "空闲",
  working: "运行中",
  tool_use: "调用工具",
  reviewing: "审阅中",
  authenticating: "认证中",
  initializing: "初始化",
  error: "出错",
};

function resolveLocalizedText(configuredVal, defaultEnVal, zhVal, statusLang) {
  const raw = typeof configuredVal === "string" ? configuredVal : defaultEnVal;
  if (statusLang === "zh" && raw === defaultEnVal) return zhVal;
  return raw;
}

function formatCountdown(seconds, statusLang = "en") {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const totalMin = Math.ceil(seconds / 60);
  const days = Math.floor(totalMin / 1440);
  if (statusLang === "zh") {
    if (days > 0) {
      const remHours = Math.floor((totalMin % 1440) / 60);
      return remHours > 0 ? `${days}天${remHours}时` : `${days}天`;
    }
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours > 0) return mins > 0 ? `${hours}时${mins}分` : `${hours}时`;
    return `${mins}分`;
  }
  if (days > 0) {
    const remHours = Math.floor((totalMin % 1440) / 60);
    return remHours > 0 ? `${days}d${remHours}h` : `${days}d`;
  }
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
  return `${mins}m`;
}

function findGitDir(startDir, stopDir) {
  let dir = startDir;
  const stopNorm = stopDir ? path.resolve(stopDir) : null;
  for (let depth = 0; depth < 32 && dir; depth++) {
    const dotGit = path.join(dir, ".git");
    try {
      const stat = fs.statSync(dotGit);
      if (stat.isDirectory()) {
        return { root: dir, gitDir: dotGit };
      }
      if (stat.isFile()) {
        const content = fs.readFileSync(dotGit, "utf8").trim();
        const m = /^gitdir:\s*(.+)$/i.exec(content);
        if (m) {
          const target = path.isAbsolute(m[1]) ? m[1] : path.resolve(dir, m[1]);
          return { root: dir, gitDir: target };
        }
      }
    } catch {
      // keep walking up
    }
    if (stopNorm && path.resolve(dir) === stopNorm) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readGitBranchFast(gitDir) {
  try {
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (head.startsWith("ref:")) {
      return head.replace(/^ref:\s*refs\/heads\//, "").replace(/^ref:\s*/, "");
    }
    return head.slice(0, 7);
  } catch {
    return "";
  }
}

function checkGitDirty(repoRoot) {
  try {
    const out = execFileSync("git", ["-C", repoRoot, "status", "--porcelain", "-uno"], {
      timeout: 250,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

const DEFAULT_QUOTA_BUCKET = "gemini-5h";
const ALLOWED_QUOTA_BUCKETS = new Set([
  "gemini-5h",
  "gemini-weekly",
  "3p-5h",
  "3p-weekly",
]);
const PAIRED_QUOTA_BUCKETS = {
  "gemini-5h+weekly": ["gemini-5h", "gemini-weekly"],
  "3p-5h+weekly": ["3p-5h", "3p-weekly"],
};

function getQuotaBucket(payload, bucketKey) {
  const q = payload && isPlainObject(payload.quota) ? payload.quota : null;
  if (!q) return null;
  const entry = q[bucketKey];
  if (!isPlainObject(entry) || entry.disabled === true) return null;
  const frac = Number(entry.remaining_fraction);
  if (!Number.isFinite(frac)) return null;
  const clamped = Math.max(0, Math.min(1, frac));
  return {
    key: bucketKey,
    remainingPct: clamped * 100,
    usedPct: (1 - clamped) * 100,
    resetInSeconds: Number(entry.reset_in_seconds),
  };
}

const WIDGET_RENDERERS = {
  vim(payload, _opts, style, ctx) {
    const mode = payload?.vim?.mode;
    if (!mode || mode === "NORMAL") return null;
    const statusLang = ctx?.statusLang === "zh" ? "zh" : "en";
    let label = "";
    let role = "blue";
    if (mode === "INSERT") {
      label = "-- INSERT --";
      role = "green";
    } else if (mode === "VISUAL") {
      label = "-- VISUAL --";
      role = "purple";
    } else if (mode === "VISUAL LINE") {
      label = "-- V-LINE --";
      role = "purple";
    } else {
      return null;
    }
    if (statusLang === "zh" && ZH_VIM_LABELS[mode]) {
      label = ZH_VIM_LABELS[mode];
    }
    return {
      full: style(label, role, { bold: true }),
      joinWithSpace: true,
    };
  },

  shortcuts(_payload, opts, style, ctx) {
    const statusLang = ctx?.statusLang === "zh" ? "zh" : "en";
    const text = resolveLocalizedText(opts.text, "? for shortcuts", "? 快捷键", statusLang);
    if (!text) return null;
    return { full: style(text, "muted") };
  },

  tasks(payload, opts, style, ctx) {
    const count = Number(payload?.task_count);
    if (!Number.isFinite(count) || count <= 0) return null;
    const statusLang = ctx?.statusLang === "zh" ? "zh" : "en";
    const n = Math.floor(count);
    const short = statusLang === "zh" ? `${n} 任务` : `${n} task(s)`;
    const fullText = opts.showCommandHint !== false ? `${short} · /tasks` : short;
    return {
      full: style(fullText, "subtle"),
      compact: style(short, "subtle"),
    };
  },

  subagents(payload, opts, style, ctx) {
    const subs = Array.isArray(payload?.subagents) ? payload.subagents : [];
    const active = opts.includeCompleted
      ? subs
      : subs.filter((s) => s && s.status === "running");
    if (active.length <= 0) return null;
    const statusLang = ctx?.statusLang === "zh" ? "zh" : "en";
    const label = statusLang === "zh" ? `${active.length} 子代理` : `${active.length} subagent(s)`;
    return { full: style(label, "subtle") };
  },

  mode(payload, opts, style, ctx) {
    const raw = typeof payload?.cycle_mode === "string" ? payload.cycle_mode.trim().toLowerCase() : "";
    if (!raw) return null;
    const statusLang = ctx?.statusLang === "zh" ? "zh" : "en";
    const colorMap = {
      plan: "blue",
      auto: "orange",
      "accept-edits": "purple",
      "best-of-n": "green",
    };
    const role = colorMap[raw] || "subtle";
    const baseText = statusLang === "zh" && ZH_MODE_LABELS[raw] ? ZH_MODE_LABELS[raw] : raw;
    const text = opts.uppercase ? baseText.toUpperCase() : baseText;
    return { full: style(text, role) };
  },

  model(payload, opts, style, ctx) {
    const settings = ctx.settings || {};
    const statusLang = ctx?.statusLang === "zh" ? "zh" : "en";
    const m = payload && isPlainObject(payload.model) ? payload.model : null;
    const agentName = typeof payload?.agent?.name === "string" ? payload.agent.name.trim() : "";
    const showEffort = opts.showEffort !== false;
    const orchStyle = opts.orchestratorStyle || "official";

    if (!m && payload?.agent_state === "initializing") {
      return { full: style(statusLang === "zh" ? "(初始化中...)" : "(initializing...)", "muted") };
    }

    const rawDisplay =
      (m && typeof m.display_name === "string" && m.display_name.trim()) ||
      (m && typeof m.id === "string" && m.id.trim()) ||
      "";
    const settingsModel = typeof settings.model === "string" ? settings.model.trim() : "";
    const isOrchestrator =
      rawDisplay.startsWith("Orchestrator") ||
      (!rawDisplay && settingsModel.startsWith("Orchestrator")) ||
      (!!settings.orchestrator && settingsModel.startsWith("Orchestrator"));

    const renderModelText = (text) => {
      if (!text) return "";
      const parts = text.split(" · ");
      if (parts.length <= 1) return style(text, "subtle");
      return parts.map((p) => style(p, "subtle")).join(style(" · ", "muted"));
    };

    let fullText = "";
    let compactText = "";

    if (isOrchestrator) {
      const planner = typeof settings?.orchestrator?.planner === "string" ? settings.orchestrator.planner.trim() : "";
      const executor = typeof settings?.orchestrator?.executor === "string" ? settings.orchestrator.executor.trim() : "";

      if (orchStyle === "both" && planner && executor) {
        fullText = `Orchestrator · ${shortenModelName(planner)} → ${shortenModelName(executor)}`;
        compactText = "Orchestrator";
      } else {
        let subDisplay = "";
        if (rawDisplay && !rawDisplay.startsWith("Orchestrator")) {
          const fmt = formatModelEffort(rawDisplay, m?.effort, showEffort);
          subDisplay = fmt ? fmt.text : rawDisplay;
        } else if (planner) {
          const fmt = formatModelEffort(planner, "", showEffort);
          subDisplay = fmt ? fmt.text : planner;
        }

        if (orchStyle === "model_only" && subDisplay) {
          fullText = subDisplay;
          compactText = stripEffortSuffix(planner || rawDisplay).base || subDisplay;
        } else if (subDisplay) {
          fullText = `Orchestrator · ${subDisplay}`;
          compactText = "Orchestrator";
        } else {
          fullText = "Orchestrator · Default (Gemini Pro)";
          compactText = "Orchestrator";
        }
      }
    } else if (rawDisplay) {
      const fmt = formatModelEffort(rawDisplay, m?.effort, showEffort);
      fullText = fmt ? fmt.text : rawDisplay;
      compactText = fmt ? fmt.base : rawDisplay;
    }

    if (!fullText) return null;

    if (agentName) {
      const fullAgent = `${style(agentName, "blue")} ${style(`(${fullText})`, "subtle")}${style(" · ", "muted")}${style("/agents", "muted")}`;
      const compactAgent = `${style(agentName, "blue")}${style(" · ", "muted")}${style("/agents", "muted")}`;
      return { full: fullAgent, compact: compactAgent };
    }

    return {
      full: renderModelText(fullText),
      compact: compactText && compactText !== fullText ? renderModelText(compactText) : undefined,
    };
  },

  context(payload, opts, style, ctx) {
    const cw = payload && isPlainObject(payload.context_window) ? payload.context_window : null;
    if (!cw) return null;
    const statusLang = ctx?.statusLang === "zh" ? "zh" : "en";
    const size = Number(cw.context_window_size);
    const inTok = Number(cw.total_input_tokens);
    const outTok = Number(cw.total_output_tokens);
    const usedTokens =
      (Number.isFinite(inTok) ? inTok : 0) + (Number.isFinite(outTok) ? outTok : 0);

    let pct = Number(cw.used_percentage);
    if (!Number.isFinite(pct)) {
      if (Number.isFinite(size) && size > 0) {
        pct = (usedTokens / size) * 100;
      } else {
        return null;
      }
    }
    pct = Math.max(0, Math.min(100, pct));
    if (pct === 0 && opts.showWhenZero === false) return null;

    const pctStr = `${Math.round(pct)}%`;
    const prefix = resolveLocalizedText(opts.prefix, "ctx ", "上下文 ", statusLang);

    const warnAt = Number.isFinite(Number(opts.warnAtPercent)) ? Number(opts.warnAtPercent) : 60;
    const critAt = Number.isFinite(Number(opts.criticalAtPercent)) ? Number(opts.criticalAtPercent) : 85;
    let role = "subtle";
    if (pct >= critAt) role = "red";
    else if (pct >= warnAt) role = "orange";

    const compactText = `${prefix}${pctStr}`;
    const format = opts.format || "percent";

    if (format === "bar" || format === "bar_percent") {
      const barWidth = Number.isInteger(opts.barWidth) && opts.barWidth > 2 ? opts.barWidth : 8;
      const filled = Math.max(0, Math.min(barWidth, Math.round((pct / 100) * barWidth)));
      const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
      const fullText = format === "bar" ? `${prefix}${bar}` : `${prefix}${bar} ${pctStr}`;
      return {
        full: style(fullText, role),
        compact: style(compactText, role),
      };
    }

    if (format === "tokens" && Number.isFinite(size) && size > 0) {
      const tokStr = `${formatTokenCount(usedTokens)}/${formatTokenCount(size)}`;
      return {
        full: style(`${prefix}${pctStr} (${tokStr})`, role),
        compact: style(compactText, role),
      };
    }

    return { full: style(compactText, role) };
  },

  context_extra(payload, opts, style, ctx) {
    const statusLang = ctx?.statusLang === "zh" ? "zh" : "en";
    const showCacheRate = opts.showCacheRate !== false;
    const showCacheTokens = Boolean(opts.showCacheTokens);
    const showExceeds200k = opts.showExceeds200k !== false;
    const cachePrefix = resolveLocalizedText(opts.cachePrefix, "cache ", "缓存 ", statusLang);
    const exceeds200kText =
      typeof opts.exceeds200kText === "string" ? opts.exceeds200kText : ">200k";
    const showPlaceholder = opts.showPlaceholder !== false;

    const fullParts = [];
    const compactParts = [];

    if (showCacheRate || showCacheTokens) {
      const usage =
        payload &&
        isPlainObject(payload.context_window) &&
        isPlainObject(payload.context_window.current_usage)
          ? payload.context_window.current_usage
          : null;

      let renderedCacheFull = "";
      let renderedCacheCompact = "";

      if (usage) {
        const rawInput = Number(usage.input_tokens);
        const rawCacheRead = Number(usage.cache_read_input_tokens);
        const rawCacheCreate = Number(usage.cache_creation_input_tokens);
        const hasInput = Number.isFinite(rawInput) && rawInput >= 0;
        const hasCacheRead = Number.isFinite(rawCacheRead) && rawCacheRead >= 0;
        const hasCacheCreate = Number.isFinite(rawCacheCreate) && rawCacheCreate >= 0;
        if (hasInput || hasCacheRead || hasCacheCreate) {
          const inputTokens = hasInput ? rawInput : 0;
          const cacheRead = hasCacheRead ? rawCacheRead : 0;
          const cacheCreate = hasCacheCreate ? rawCacheCreate : 0;
          const totalInput = inputTokens + cacheCreate + cacheRead;
          if (totalInput > 0) {
            const pct = Math.max(0, Math.min(100, Math.round((cacheRead / totalInput) * 100)));
            const pctStr = `${pct}%`;
            const tokStr = formatTokenCount(cacheRead);
            if (showCacheRate && showCacheTokens) {
              renderedCacheFull = style(`${cachePrefix}${pctStr} (${tokStr})`, "subtle");
              renderedCacheCompact = style(`${cachePrefix}${pctStr}`, "subtle");
            } else if (showCacheRate) {
              renderedCacheFull = style(`${cachePrefix}${pctStr}`, "subtle");
              renderedCacheCompact = renderedCacheFull;
            } else {
              renderedCacheFull = style(`${cachePrefix}${tokStr}`, "subtle");
              renderedCacheCompact = renderedCacheFull;
            }
          }
        }
      }

      if (!renderedCacheFull && showPlaceholder) {
        const placeholder = showCacheRate ? "--%" : "--";
        renderedCacheFull = style(`${cachePrefix}${placeholder}`, "subtle");
        renderedCacheCompact = renderedCacheFull;
      }

      if (renderedCacheFull) {
        fullParts.push(renderedCacheFull);
        compactParts.push(renderedCacheCompact);
      }
    }

    if (showExceeds200k && payload?.exceeds_200k_tokens === true && exceeds200kText) {
      const badge = style(exceeds200kText, "orange");
      fullParts.push(badge);
      compactParts.push(badge);
    }

    if (fullParts.length === 0) return null;
    const fullText = fullParts.join(" ");
    const compactText = compactParts.join(" ");
    return {
      full: fullText,
      compact: compactText !== fullText ? compactText : undefined,
    };
  },

  quota(payload, opts, style, ctx) {
    const statusLang = ctx?.statusLang === "zh" ? "zh" : "en";
    const requested = typeof opts.bucket === "string" ? opts.bucket.trim() : "";
    const prefix = resolveLocalizedText(opts.prefix, "quota ", "配额 ", statusLang);
    const metric = opts.metric === "used" ? "used" : "remaining";
    const format =
      opts.format === "bar" || opts.format === "bar_percent" ? opts.format : "percent";
    const barWidth =
      Number.isInteger(opts.barWidth) && opts.barWidth > 2 ? opts.barWidth : 6;
    const resetMode =
      opts.showReset === "5h" || opts.showReset === "weekly" || opts.showReset === "both"
        ? opts.showReset
        : "none";
    const warnBelow = Number.isFinite(Number(opts.warnBelowPercent)) ? Number(opts.warnBelowPercent) : 30;
    const critBelow = Number.isFinite(Number(opts.criticalBelowPercent)) ? Number(opts.criticalBelowPercent) : 10;

    const renderValue = (bucketKey) => {
      const bucket = getQuotaBucket(payload, bucketKey);
      if (!bucket) {
        return { fullText: "--%", compactText: "--%", role: "subtle" };
      }
      let role = "subtle";
      if (bucket.remainingPct <= critBelow) role = "red";
      else if (bucket.remainingPct <= warnBelow) role = "orange";

      const pct = metric === "used" ? bucket.usedPct : bucket.remainingPct;
      const val = Math.round(pct);
      const wantReset =
        resetMode === "both" ||
        (resetMode === "5h" && bucketKey.endsWith("-5h")) ||
        (resetMode === "weekly" && bucketKey.endsWith("-weekly"));
      const resetPart =
        wantReset && Number.isFinite(bucket.resetInSeconds) && bucket.resetInSeconds > 0
          ? ` (${formatCountdown(bucket.resetInSeconds, statusLang)})`
          : "";
      const compactText = `${val}%${resetPart}`;
      if (format === "bar" || format === "bar_percent") {
        const filled = Math.max(0, Math.min(barWidth, Math.round((pct / 100) * barWidth)));
        const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
        const fullText =
          format === "bar" ? `${bar}${resetPart}` : `${bar} ${val}%${resetPart}`;
        return { fullText, compactText, role };
      }
      return { fullText: compactText, compactText, role };
    };

    const pair = PAIRED_QUOTA_BUCKETS[requested];
    if (pair) {
      const values = pair.map((key) => renderValue(key));
      const prefixStyled = prefix ? style(prefix, "subtle") : "";
      const fullSep = style(format === "bar" || format === "bar_percent" ? " | " : "|", "subtle");
      const compactSep = style("|", "subtle");
      const full = `${prefixStyled}${values.map((v) => style(v.fullText, v.role)).join(fullSep)}`;
      const compact = `${prefixStyled}${values.map((v) => style(v.compactText, v.role)).join(compactSep)}`;
      return {
        full,
        compact: compact !== full ? compact : undefined,
      };
    }

    const bucketKey = ALLOWED_QUOTA_BUCKETS.has(requested) ? requested : DEFAULT_QUOTA_BUCKET;
    const single = renderValue(bucketKey);
    const full = style(`${prefix}${single.fullText}`, single.role);
    const compact = style(`${prefix}${single.compactText}`, single.role);
    return {
      full,
      compact: compact !== full ? compact : undefined,
    };
  },

  git(payload, opts, style) {
    const startDir = payload?.workspace?.current_dir || payload?.cwd;
    const stopDir = payload?.workspace?.project_dir;
    let branch = typeof payload?.vcs?.branch === "string" ? payload.vcs.branch.trim() : "";
    let dirty = Boolean(payload?.vcs?.dirty);

    if (!branch && startDir) {
      const found = findGitDir(startDir, stopDir);
      if (found) {
        branch = readGitBranchFast(found.gitDir);
        if (branch && opts.showDirty !== false && payload?.vcs?.dirty === undefined) {
          dirty = checkGitDirty(found.root);
        }
      }
    }
    if (!branch) return null;

    const maxLen = Number.isInteger(opts.maxLength) && opts.maxLength > 4 ? opts.maxLength : 28;
    const shownBranch = branch.length > maxLen ? `${branch.slice(0, maxLen - 1)}…` : branch;
    const star = opts.showDirty !== false && dirty ? style("*", "orange") : "";
    return {
      full: `${style(shownBranch, "blue")}${star}`,
    };
  },

  cwd(payload, opts, style) {
    const dir = payload?.workspace?.current_dir || payload?.cwd;
    if (typeof dir !== "string" || !dir.trim()) return null;
    const clean = dir.replace(/\/+$/, "") || "/";
    let label = clean;
    if (opts.style !== "short") {
      label = path.basename(clean) || clean;
    } else if (clean.startsWith(HOME_DIR)) {
      label = "~" + clean.slice(HOME_DIR.length);
    }
    return { full: style(label, "subtle") };
  },

  state(payload, opts, style, ctx) {
    const st = typeof payload?.agent_state === "string" ? payload.agent_state.trim() : "";
    if (!st || (opts.hideWhenIdle !== false && st === "idle")) return null;
    const statusLang = ctx?.statusLang === "zh" ? "zh" : "en";
    const roleMap = {
      idle: "green",
      working: "blue",
      tool_use: "purple",
      reviewing: "orange",
      authenticating: "orange",
      initializing: "muted",
      error: "red",
    };
    const label = statusLang === "zh" && ZH_STATE_LABELS[st] ? ZH_STATE_LABELS[st] : st;
    return { full: style(label, roleMap[st] || "subtle") };
  },

  artifacts(payload, _opts, style, ctx) {
    const count = Number(payload?.artifact_count);
    if (!Number.isFinite(count) || count <= 0) return null;
    const statusLang = ctx?.statusLang === "zh" ? "zh" : "en";
    const n = Math.floor(count);
    return { full: style(statusLang === "zh" ? `${n} 产物` : `${n} artifact(s)`, "subtle") };
  },

  queued(payload, _opts, style, ctx) {
    const count = Number(payload?.pending_input_count);
    if (!Number.isFinite(count) || count <= 0) return null;
    const statusLang = ctx?.statusLang === "zh" ? "zh" : "en";
    const n = Math.floor(count);
    return { full: style(statusLang === "zh" ? `${n} 排队` : `${n} queued`, "orange") };
  },

  sandbox(payload, opts, style, ctx) {
    const enabled = Boolean(payload?.sandbox?.enabled);
    if (!enabled && opts.onlyWhenEnabled !== false) return null;
    const statusLang = ctx?.statusLang === "zh" ? "zh" : "en";
    if (statusLang === "zh") {
      return {
        full: enabled ? style("沙箱开", "green") : style("沙箱关", "muted"),
      };
    }
    return {
      full: enabled ? style("sandbox ON", "green") : style("sandbox off", "muted"),
    };
  },

  cost(payload, opts, style) {
    const usd = Number(payload?.cost?.total_usd);
    if (!Number.isFinite(usd) || usd <= 0) return null;
    const dec = Number.isInteger(opts.decimals) && opts.decimals >= 0 ? opts.decimals : 2;
    return { full: style(`$${usd.toFixed(dec)}`, "subtle") };
  },

  title(payload, opts, style) {
    const raw =
      typeof payload?.conversation_title === "string"
        ? payload.conversation_title.replace(/\s+/g, " ").trim()
        : "";
    if (!raw) return null;
    const maxLen = Number.isInteger(opts.maxLength) && opts.maxLength >= 4 ? opts.maxLength : 24;
    const prefix = typeof opts.prefix === "string" ? opts.prefix : "";
    const shown = truncateAnsi(raw, maxLen);
    const compactShown = visibleWidth(shown) > 12 ? truncateAnsi(raw, 12) : shown;
    return {
      full: style(`${prefix}${shown}`, "subtle"),
      compact: compactShown !== shown ? style(`${prefix}${compactShown}`, "subtle") : undefined,
    };
  },

  confirm(payload, opts, style, ctx) {
    if (payload?.tool_confirmation_pending !== true) return null;
    const statusLang = ctx?.statusLang === "zh" ? "zh" : "en";
    const rawText = typeof opts.text === "string" && opts.text.trim() ? opts.text : "confirm!";
    const text = statusLang === "zh" && rawText === "confirm!" ? "待确认!" : rawText;
    return { full: style(text, "orange", { bold: true }) };
  },

  conversation_id(payload, opts, style) {
    const raw =
      (typeof payload?.conversation_id === "string" && payload.conversation_id.trim()) ||
      (typeof payload?.session_id === "string" && payload.session_id.trim()) ||
      "";
    if (!raw) return null;
    const prefix = typeof opts.prefix === "string" ? opts.prefix : "";
    const rawLen = opts.length === undefined ? 8 : Number(opts.length);
    let shown = raw;
    if (Number.isInteger(rawLen) && rawLen > 0 && raw.length > rawLen) {
      shown = raw.slice(0, rawLen);
    } else if (!Number.isInteger(rawLen) || rawLen < 0) {
      shown = raw.slice(0, 8);
    }
    return { full: style(`${prefix}${shown}`, "subtle") };
  },
};

function renderSideItems(widgetNames, payload, config, style, ctx, sepStr) {
  const items = [];
  for (const rawName of widgetNames) {
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name || !WIDGET_RENDERERS[name]) continue;
    const opts = isPlainObject(config.widgets[name]) ? config.widgets[name] : { enabled: true };
    if (opts.enabled === false) continue;
    const rendered = WIDGET_RENDERERS[name](payload, opts, style, ctx);
    if (rendered && rendered.full) {
      items.push({ ...rendered, name, useCompact: false });
    }
  }
  return {
    items,
    join: () => {
      if (items.length === 0) return "";
      let out = items[0].useCompact && items[0].compact ? items[0].compact : items[0].full;
      for (let i = 1; i < items.length; i++) {
        const prev = items[i - 1];
        const curr = items[i];
        const text = curr.useCompact && curr.compact ? curr.compact : curr.full;
        const sep = prev.joinWithSpace ? " " : style(sepStr, "muted");
        out += sep + text;
      }
      return out;
    },
  };
}

function renderStatusLine(payload, options = {}) {
  const config = options.config || loadConfig(options.configPath);
  const settings = options.settings || loadSettings(options.settingsPath);
  const palette = resolvePalette(config, settings);
  const style = makeStyler(palette);
  const statusLang = resolveStatusLocale(config);
  const ctx = { config, settings, statusLang };

  const leftList = Array.isArray(config.left) ? config.left : [];
  const rightList = Array.isArray(config.right) ? config.right : [];
  const leftSep = typeof config.leftSeparator === "string" ? config.leftSeparator : " · ";
  const rightSep = typeof config.separator === "string" ? config.separator : " · ";

  const leftGroup = renderSideItems(leftList, payload, config, style, ctx, leftSep);
  const rightGroup = renderSideItems(rightList, payload, config, style, ctx, rightSep);

  const termWidth = Number(payload?.terminal_width);
  const width = Number.isFinite(termWidth) && termWidth > 0 ? Math.floor(termWidth) : 0;

  let leftText = leftGroup.join();
  let rightText = rightGroup.join();

  if (width > 0) {
    const totalFits = () => {
      const lw = visibleWidth(leftText);
      const rw = visibleWidth(rightText);
      if (lw > 0 && rw > 0) return lw + 1 + rw <= width;
      return Math.max(lw, rw) <= width;
    };

    if (!totalFits()) {
      for (let i = rightGroup.items.length - 1; i >= 0 && !totalFits(); i--) {
        if (rightGroup.items[i].compact) {
          rightGroup.items[i].useCompact = true;
          rightText = rightGroup.join();
        }
      }
      for (let i = leftGroup.items.length - 1; i >= 0 && !totalFits(); i--) {
        if (leftGroup.items[i].compact) {
          leftGroup.items[i].useCompact = true;
          leftText = leftGroup.join();
        }
      }
    }

    const lw = visibleWidth(leftText);
    const rw = visibleWidth(rightText);
    if (lw > 0 && rw > 0) {
      if (lw + 1 + rw > width) {
        const maxLeft = width - rw - 1;
        if (maxLeft >= 4) {
          leftText = truncateAnsi(leftText, maxLeft);
        } else {
          leftText = "";
          if (rw > width) {
            rightText = truncateAnsi(rightText, width);
          }
        }
      }
    } else if (lw > width) {
      leftText = truncateAnsi(leftText, width);
    } else if (rw > width) {
      rightText = truncateAnsi(rightText, width);
    }
  }

  const finalLeftW = visibleWidth(leftText);
  const finalRightW = visibleWidth(rightText);

  if (finalLeftW > 0 && finalRightW > 0) {
    const gap = width > 0 ? Math.max(1, width - finalLeftW - finalRightW) : 2;
    return leftText + " ".repeat(gap) + rightText;
  }
  if (finalRightW > 0) {
    const pad = width > 0 ? Math.max(0, width - finalRightW) : 0;
    return " ".repeat(pad) + rightText;
  }
  return leftText;
}

function readStdinText() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

function recordLivePayloadSnapshot(payload, options = {}) {
  if (process.env.STATUSLINE_DISABLE_SNAPSHOT === "1" && !options.force) return false;
  if (!isPlainObject(payload) || Object.keys(payload).length === 0) return false;

  const snapshotPath = resolveLastPayloadPath(options.snapshotPath);
  const minIntervalMs = Number.isFinite(options.minIntervalMs) ? options.minIntervalMs : 2000;
  const now = Date.now();
  const tmpPath = `${snapshotPath}.${process.pid}.tmp`;

  try {
    if (minIntervalMs > 0) {
      try {
        const stat = fs.statSync(snapshotPath);
        if (now - stat.mtimeMs < minIntervalMs) return false;
      } catch {
        // file does not exist yet
      }
    }
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(tmpPath, JSON.stringify({ saved_at: now, payload }), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmpPath, snapshotPath);
    return true;
  } catch {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup error
    }
    return false;
  }
}

async function main() {
  const rawText = await readStdinText();
  let payload = {};
  if (rawText && rawText.trim()) {
    try {
      const parsed = JSON.parse(rawText);
      if (isPlainObject(parsed)) payload = parsed;
    } catch {
      payload = {};
    }
  }

  const config = loadConfig();
  const settings = loadSettings();

  let line = "";
  try {
    line = renderStatusLine(payload, { config, settings });
  } catch {
    line = "";
  }

  process.stdout.write(`${line}\n`);
  recordLivePayloadSnapshot(payload);
}

if (require.main === module) {
  main()
    .catch(() => {})
    .finally(() => {
      process.exit(0);
    });
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_USER_CONFIG_PATH,
  DEFAULT_LAST_PAYLOAD_PATH,
  AGY_SETTINGS_PATH,
  PALETTES,
  STATUS_LOCALES,
  DEFAULT_QUOTA_BUCKET,
  ALLOWED_QUOTA_BUCKETS,
  PAIRED_QUOTA_BUCKETS,
  WIDGET_RENDERERS,
  loadConfig,
  loadSettings,
  mergeConfig,
  resolvePalette,
  resolveStatusLocale,
  makeStyler,
  resolveLastPayloadPath,
  recordLivePayloadSnapshot,
  renderStatusLine,
  stripAnsi,
  visibleWidth,
  truncateAnsi,
  stripEffortSuffix,
  formatModelEffort,
};
