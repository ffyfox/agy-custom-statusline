"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const {
  DEFAULT_CONFIG,
  DEFAULT_USER_CONFIG_PATH,
  DEFAULT_LAST_PAYLOAD_PATH,
  AGY_SETTINGS_PATH,
  PALETTES,
  STATUS_LOCALES,
  WIDGET_RENDERERS,
  loadSettings,
  mergeConfig,
  resolvePalette,
  resolveStatusLocale,
  makeStyler,
  resolveLastPayloadPath,
} = require("./statusline-renderer");

const PLUGIN_NAME = "custom-statusline";
const PLUGIN_ROOT = path.resolve(__dirname, "..");
const RENDERER_PATH = path.resolve(__dirname, "statusline-renderer.js");
const SCHEMA_PATH = path.resolve(PLUGIN_ROOT, "schemas", "statusline.schema.json");
const SCHEMA_URI = pathToFileURL(SCHEMA_PATH).href;
const CONFIG_JSON_PATH = path.join(os.homedir(), ".gemini", "config", "config.json");

const COLOR_SCHEMES = ["auto", "none", ...Object.keys(PALETTES)];
const LOCALES = ["auto", "en", "zh"];
const ALL_QUOTA_BUCKETS = [
  "gemini-5h",
  "gemini-weekly",
  "3p-5h",
  "3p-weekly",
  "gemini-5h+weekly",
  "3p-5h+weekly",
];

const WIDGET_META = [
  {
    id: "vim",
    category: "builtin",
    defaultSide: "left",
    options: [{ key: "enabled", type: "boolean", default: true }],
  },
  {
    id: "shortcuts",
    category: "builtin",
    defaultSide: "left",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "text", type: "string", default: "? for shortcuts" },
    ],
  },
  {
    id: "tasks",
    category: "builtin",
    defaultSide: "right",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "showCommandHint", type: "boolean", default: true },
    ],
  },
  {
    id: "subagents",
    category: "builtin",
    defaultSide: "right",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "includeCompleted", type: "boolean", default: false },
    ],
  },
  {
    id: "mode",
    category: "builtin",
    defaultSide: "right",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "uppercase", type: "boolean", default: false },
    ],
  },
  {
    id: "model",
    category: "builtin",
    defaultSide: "right",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "orchestratorStyle", type: "enum", values: ["official", "both", "model_only"], default: "official" },
      { key: "showEffort", type: "boolean", default: true },
    ],
  },
  {
    id: "context",
    category: "extended",
    defaultSide: "right",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "format", type: "enum", values: ["percent", "bar", "bar_percent", "tokens"], default: "percent" },
      { key: "prefix", type: "string", default: "ctx " },
      { key: "barWidth", type: "integer", min: 3, max: 32, step: 1, default: 8 },
      { key: "showWhenZero", type: "boolean", default: true },
      { key: "warnAtPercent", type: "number", min: 0, max: 100, step: 5, default: 60 },
      { key: "criticalAtPercent", type: "number", min: 0, max: 100, step: 5, default: 85 },
    ],
  },
  {
    id: "context_extra",
    category: "extended",
    defaultSide: "right",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "showCacheRate", type: "boolean", default: true },
      { key: "showCacheTokens", type: "boolean", default: false },
      { key: "showExceeds200k", type: "boolean", default: true },
      { key: "cachePrefix", type: "string", default: "cache " },
      { key: "exceeds200kText", type: "string", default: ">200k" },
      { key: "showPlaceholder", type: "boolean", default: true },
    ],
  },
  {
    id: "quota",
    category: "extended",
    defaultSide: "right",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "bucket", type: "enum", values: ALL_QUOTA_BUCKETS, default: "gemini-5h" },
      { key: "format", type: "enum", values: ["percent", "bar", "bar_percent"], default: "percent" },
      { key: "metric", type: "enum", values: ["remaining", "used"], default: "remaining" },
      { key: "prefix", type: "string", default: "quota " },
      { key: "barWidth", type: "integer", min: 3, max: 32, step: 1, default: 6 },
      { key: "showReset", type: "enum", values: ["none", "5h", "weekly", "both"], default: "none" },
      { key: "warnBelowPercent", type: "number", min: 0, max: 100, step: 5, default: 30 },
      { key: "criticalBelowPercent", type: "number", min: 0, max: 100, step: 5, default: 10 },
    ],
  },
  {
    id: "git",
    category: "extended",
    defaultSide: "left",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "showDirty", type: "boolean", default: true },
      { key: "maxLength", type: "integer", min: 5, max: 80, step: 2, default: 28 },
    ],
  },
  {
    id: "cwd",
    category: "extended",
    defaultSide: "left",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "style", type: "enum", values: ["basename", "short"], default: "basename" },
    ],
  },
  {
    id: "state",
    category: "extended",
    defaultSide: "right",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "hideWhenIdle", type: "boolean", default: true },
    ],
  },
  {
    id: "artifacts",
    category: "extended",
    defaultSide: "right",
    options: [{ key: "enabled", type: "boolean", default: true }],
  },
  {
    id: "queued",
    category: "extended",
    defaultSide: "left",
    options: [{ key: "enabled", type: "boolean", default: true }],
  },
  {
    id: "sandbox",
    category: "extended",
    defaultSide: "right",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "onlyWhenEnabled", type: "boolean", default: true },
    ],
  },
  {
    id: "cost",
    category: "extended",
    defaultSide: "right",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "decimals", type: "integer", min: 0, max: 6, step: 1, default: 2 },
    ],
  },
  {
    id: "title",
    category: "extended",
    defaultSide: "left",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "maxLength", type: "integer", min: 4, max: 80, step: 2, default: 24 },
      { key: "prefix", type: "string", default: "" },
    ],
  },
  {
    id: "confirm",
    category: "extended",
    defaultSide: "left",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "text", type: "string", default: "confirm!" },
    ],
  },
  {
    id: "conversation_id",
    category: "extended",
    defaultSide: "right",
    options: [
      { key: "enabled", type: "boolean", default: true },
      { key: "length", type: "integer", min: 0, max: 36, step: 2, default: 8 },
      { key: "prefix", type: "string", default: "" },
    ],
  },
];

const WIDGET_META_MAP = Object.fromEntries(WIDGET_META.map((m) => [m.id, m]));
const ALL_WIDGET_IDS = WIDGET_META.map((m) => m.id);

const PRESETS = {
  official: {
    id: "official",
    left: ["vim", "shortcuts"],
    right: ["tasks", "subagents", "mode", "model"],
    widgets: {},
  },
  minimal: {
    id: "minimal",
    left: ["vim", "confirm", "git"],
    right: ["context", "mode", "model"],
    widgets: {
      context: { format: "percent" },
    },
  },
  balanced: {
    id: "balanced",
    left: ["vim", "confirm", "queued", "cwd", "git"],
    right: ["context", "quota", "tasks", "subagents", "mode", "model"],
    widgets: {
      cwd: { style: "basename" },
      context: { format: "percent" },
      quota: { bucket: "gemini-5h+weekly" },
    },
  },
  hud: {
    id: "hud",
    left: ["vim", "confirm", "queued", "cwd", "git"],
    right: ["context", "quota", "tasks", "subagents", "mode", "model"],
    widgets: {
      cwd: { style: "basename" },
      context: { format: "bar_percent", barWidth: 6 },
      quota: { bucket: "gemini-5h+weekly", format: "bar_percent", barWidth: 5 },
    },
  },
  developer: {
    id: "developer",
    left: ["vim", "confirm", "queued", "cwd", "git"],
    right: ["context", "context_extra", "quota", "tasks", "subagents", "mode", "model"],
    widgets: {
      cwd: { style: "basename" },
      context: { format: "tokens" },
      context_extra: {
        enabled: true,
        showCacheRate: true,
        showCacheTokens: false,
        showExceeds200k: true,
        cachePrefix: "cache ",
        exceeds200kText: ">200k",
        showPlaceholder: true,
      },
      quota: { bucket: "gemini-5h+weekly" },
    },
  },
};

const PRESET_NAMES = Object.keys(PRESETS);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function writeJsonAtomic(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let existingMode = null;
  try {
    existingMode = fs.statSync(filePath).mode & 0o777;
  } catch {
    // File does not exist yet
  }
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    const writeOpts = existingMode !== null ? { encoding: "utf8", mode: existingMode } : "utf8";
    fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2) + "\n", writeOpts);
    if (existingMode !== null && process.platform !== "win32") {
      fs.chmodSync(tmpPath, existingMode);
    }
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

function readJsonObjectOrEmpty(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch (err) {
    if (err && err.code === "ENOENT") return {};
    throw err;
  }
}

function readUserConfigRaw(configPath = DEFAULT_USER_CONFIG_PATH) {
  try {
    const rawText = fs.readFileSync(configPath, "utf8");
    try {
      const parsed = JSON.parse(rawText);
      if (!isPlainObject(parsed)) {
        return { exists: true, parseError: "Root JSON value must be an object", data: null, rawText };
      }
      return { exists: true, parseError: null, data: parsed, rawText };
    } catch (parseErr) {
      return { exists: true, parseError: parseErr.message, data: null, rawText };
    }
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return { exists: false, parseError: null, data: null, rawText: null };
    }
    return { exists: false, parseError: err.message, data: null, rawText: null };
  }
}

function withSchemaFirst(configObj) {
  const merged = mergeConfig(DEFAULT_CONFIG, configObj);
  const ordered = {
    $schema: SCHEMA_URI,
    version: merged.version,
    locale: merged.locale,
    statusLocale: merged.statusLocale,
    colorScheme: merged.colorScheme,
    separator: merged.separator,
    leftSeparator: merged.leftSeparator,
    left: merged.left,
    right: merged.right,
    widgets: merged.widgets,
  };
  return ordered;
}

function writeUserConfig(configObj, configPath = DEFAULT_USER_CONFIG_PATH) {
  const ordered = withSchemaFirst(configObj);
  writeJsonAtomic(configPath, ordered);
  return ordered;
}

function applyPreset(currentConfig, presetName, options = {}) {
  const key = String(presetName || "").trim().toLowerCase();
  const preset = PRESETS[key];
  if (!preset) return null;

  const base = cloneJson(DEFAULT_CONFIG);
  if (!options.resetLocale && currentConfig) {
    if (LOCALES.includes(currentConfig.locale)) base.locale = currentConfig.locale;
    if (STATUS_LOCALES.includes(currentConfig.statusLocale)) base.statusLocale = currentConfig.statusLocale;
  }
  if (!options.resetAppearance && currentConfig) {
    if (COLOR_SCHEMES.includes(currentConfig.colorScheme)) base.colorScheme = currentConfig.colorScheme;
    if (typeof currentConfig.separator === "string") base.separator = currentConfig.separator;
    if (typeof currentConfig.leftSeparator === "string") base.leftSeparator = currentConfig.leftSeparator;
  }

  return mergeConfig(base, {
    left: preset.left,
    right: preset.right,
    widgets: preset.widgets,
  });
}

function addWidget(config, side, widgetId, atIndex) {
  if (side !== "left" && side !== "right") {
    return { ok: false, errorKey: "mutate.invalidSide", params: { side, expected: "left, right" } };
  }
  if (!WIDGET_META_MAP[widgetId]) {
    return {
      ok: false,
      errorKey: "mutate.unknownWidget",
      params: { widget: widgetId, list: ALL_WIDGET_IDS.join(", ") },
    };
  }
  const next = mergeConfig(DEFAULT_CONFIG, config);
  next.left = next.left.filter((id) => id !== widgetId);
  next.right = next.right.filter((id) => id !== widgetId);
  const arr = side === "left" ? next.left : next.right;
  const idx =
    Number.isInteger(atIndex) && atIndex >= 0
      ? Math.min(atIndex, arr.length)
      : arr.length;
  arr.splice(idx, 0, widgetId);
  if (!isPlainObject(next.widgets[widgetId])) next.widgets[widgetId] = {};
  next.widgets[widgetId].enabled = true;
  return { ok: true, config: next, index: idx };
}

function removeWidget(config, side, widgetId) {
  if (side !== "left" && side !== "right" && side !== "both") {
    return {
      ok: false,
      errorKey: "mutate.invalidSide",
      params: { side, expected: "left, right, both" },
    };
  }
  if (!WIDGET_META_MAP[widgetId]) {
    return {
      ok: false,
      errorKey: "mutate.unknownWidget",
      params: { widget: widgetId, list: ALL_WIDGET_IDS.join(", ") },
    };
  }
  const next = mergeConfig(DEFAULT_CONFIG, config);
  const beforeL = next.left.length;
  const beforeR = next.right.length;
  if (side === "left" || side === "both") {
    next.left = next.left.filter((id) => id !== widgetId);
  }
  if (side === "right" || side === "both") {
    next.right = next.right.filter((id) => id !== widgetId);
  }
  const changed = next.left.length !== beforeL || next.right.length !== beforeR;
  return { ok: true, config: next, changed };
}

function moveWidget(config, side, widgetId, targetIndex) {
  if (side !== "left" && side !== "right") {
    return { ok: false, errorKey: "mutate.invalidSide", params: { side, expected: "left, right" } };
  }
  if (!WIDGET_META_MAP[widgetId]) {
    return {
      ok: false,
      errorKey: "mutate.unknownWidget",
      params: { widget: widgetId, list: ALL_WIDGET_IDS.join(", ") },
    };
  }
  const next = mergeConfig(DEFAULT_CONFIG, config);
  const arr = side === "left" ? next.left : next.right;
  const oldIdx = arr.indexOf(widgetId);
  if (oldIdx === -1) {
    return { ok: false, errorKey: "mutate.notPresent", params: { widget: widgetId, side } };
  }
  arr.splice(oldIdx, 1);
  const clamped = Math.max(0, Math.min(arr.length, targetIndex));
  arr.splice(clamped, 0, widgetId);
  return { ok: true, config: next, index: clamped };
}

function coerceOptionValue(spec, rawValue, dotPath) {
  const strVal = typeof rawValue === "string" ? rawValue.trim() : String(rawValue);
  if (spec.type === "boolean") {
    if (rawValue === true || rawValue === false) return { ok: true, value: rawValue };
    const low = strVal.toLowerCase();
    if (low === "true" || low === "1" || low === "yes" || low === "on") return { ok: true, value: true };
    if (low === "false" || low === "0" || low === "no" || low === "off") return { ok: true, value: false };
    return { ok: false, errorKey: "err.invalidBoolean", params: { path: dotPath, value: rawValue } };
  }
  if (spec.type === "integer") {
    const n = Number(strVal);
    if (!Number.isInteger(n) || strVal === "") {
      return { ok: false, errorKey: "err.invalidInt", params: { path: dotPath, value: rawValue } };
    }
    if ((spec.min !== undefined && n < spec.min) || (spec.max !== undefined && n > spec.max)) {
      return {
        ok: false,
        errorKey: "err.outOfRange",
        params: { path: dotPath, value: n, min: spec.min ?? "-∞", max: spec.max ?? "∞" },
      };
    }
    return { ok: true, value: n };
  }
  if (spec.type === "number") {
    const n = Number(strVal);
    if (!Number.isFinite(n) || strVal === "") {
      return { ok: false, errorKey: "err.invalidNumber", params: { path: dotPath, value: rawValue } };
    }
    if ((spec.min !== undefined && n < spec.min) || (spec.max !== undefined && n > spec.max)) {
      return {
        ok: false,
        errorKey: "err.outOfRange",
        params: { path: dotPath, value: n, min: spec.min ?? "-∞", max: spec.max ?? "∞" },
      };
    }
    return { ok: true, value: n };
  }
  if (spec.type === "enum") {
    if (!spec.values.includes(rawValue)) {
      const lowered = strVal.toLowerCase();
      const matched = spec.values.find((v) => v.toLowerCase() === lowered);
      if (matched !== undefined) return { ok: true, value: matched };
      return {
        ok: false,
        errorKey: "err.invalidEnum",
        params: { path: dotPath, value: rawValue, allowed: spec.values.join(", ") },
      };
    }
    return { ok: true, value: rawValue };
  }
  return { ok: true, value: typeof rawValue === "string" ? rawValue : String(rawValue) };
}

const TOP_LEVEL_OPTION_SPECS = {
  locale: { type: "enum", values: LOCALES },
  statusLocale: { type: "enum", values: STATUS_LOCALES },
  colorScheme: { type: "enum", values: COLOR_SCHEMES },
  separator: { type: "string" },
  leftSeparator: { type: "string" },
};

function setConfigValue(config, dotPath, rawValue) {
  const cleanPath = String(dotPath || "").trim().replace(/^widgets\./, "");
  if (!cleanPath) {
    return { ok: false, errorKey: "err.invalidPath", params: { path: dotPath } };
  }

  const next = mergeConfig(DEFAULT_CONFIG, config);

  if (TOP_LEVEL_OPTION_SPECS[cleanPath]) {
    const res = coerceOptionValue(TOP_LEVEL_OPTION_SPECS[cleanPath], rawValue, cleanPath);
    if (!res.ok) return res;
    next[cleanPath] = res.value;
    return { ok: true, config: next, normalizedPath: cleanPath, value: res.value };
  }

  const parts = cleanPath.split(".");
  if (parts.length !== 2) {
    return { ok: false, errorKey: "err.invalidPath", params: { path: dotPath } };
  }
  const [wId, optKey] = parts;
  const meta = WIDGET_META_MAP[wId];
  if (!meta) {
    return { ok: false, errorKey: "err.invalidPath", params: { path: dotPath } };
  }
  const optSpec = meta.options.find((o) => o.key === optKey);
  if (!optSpec) {
    return { ok: false, errorKey: "err.invalidPath", params: { path: dotPath } };
  }
  const res = coerceOptionValue(optSpec, rawValue, `${wId}.${optKey}`);
  if (!res.ok) return res;

  if (!isPlainObject(next.widgets[wId])) next.widgets[wId] = {};
  next.widgets[wId][optKey] = res.value;
  return { ok: true, config: next, normalizedPath: `widgets.${wId}.${optKey}`, value: res.value };
}

const ALLOWED_TOP_KEYS = new Set([
  "$schema",
  "version",
  "locale",
  "statusLocale",
  "colorScheme",
  "separator",
  "leftSeparator",
  "left",
  "right",
  "widgets",
]);

function validateConfig(rawConfig) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(rawConfig)) {
    errors.push("Root configuration must be a JSON object");
    return { ok: false, errors, warnings };
  }

  for (const key of Object.keys(rawConfig)) {
    if (!ALLOWED_TOP_KEYS.has(key)) {
      warnings.push(`Unknown top-level key '${key}'`);
    }
  }

  if (!rawConfig.$schema) {
    warnings.push("Missing $schema reference");
  }
  if (rawConfig.version !== undefined && rawConfig.version !== 1) {
    errors.push(`Unsupported version '${rawConfig.version}' (expected 1)`);
  }
  if (rawConfig.locale !== undefined && !LOCALES.includes(rawConfig.locale)) {
    errors.push(`Invalid locale '${rawConfig.locale}'`);
  }
  if (rawConfig.statusLocale !== undefined && !STATUS_LOCALES.includes(rawConfig.statusLocale)) {
    errors.push(`Invalid statusLocale '${rawConfig.statusLocale}'`);
  }
  if (rawConfig.colorScheme !== undefined && !COLOR_SCHEMES.includes(rawConfig.colorScheme)) {
    errors.push(`Invalid colorScheme '${rawConfig.colorScheme}'`);
  }
  if (rawConfig.separator !== undefined && typeof rawConfig.separator !== "string") {
    errors.push("separator must be a string");
  }
  if (rawConfig.leftSeparator !== undefined && typeof rawConfig.leftSeparator !== "string") {
    errors.push("leftSeparator must be a string");
  }

  const seen = new Set();
  for (const side of ["left", "right"]) {
    if (rawConfig[side] === undefined) continue;
    if (!Array.isArray(rawConfig[side])) {
      errors.push(`${side} must be an array of widget IDs`);
      continue;
    }
    for (const id of rawConfig[side]) {
      if (typeof id !== "string" || !WIDGET_META_MAP[id]) {
        errors.push(`Unknown widget '${id}' in ${side}`);
      } else if (seen.has(id)) {
        warnings.push(`Widget '${id}' appears multiple times across left/right`);
      } else {
        seen.add(id);
      }
    }
  }

  if (rawConfig.widgets !== undefined) {
    if (!isPlainObject(rawConfig.widgets)) {
      errors.push("widgets must be an object");
    } else {
      for (const [wId, wOpts] of Object.entries(rawConfig.widgets)) {
        const meta = WIDGET_META_MAP[wId];
        if (!meta) {
          warnings.push(`Unknown widgets.${wId} block`);
          continue;
        }
        if (!isPlainObject(wOpts)) {
          errors.push(`widgets.${wId} must be an object`);
          continue;
        }
        const optMap = Object.fromEntries(meta.options.map((o) => [o.key, o]));
        for (const [oKey, oVal] of Object.entries(wOpts)) {
          const spec = optMap[oKey];
          if (!spec) {
            warnings.push(`Unknown option widgets.${wId}.${oKey}`);
            continue;
          }
          if (spec.type === "boolean" && typeof oVal !== "boolean") {
            errors.push(`widgets.${wId}.${oKey} must be boolean`);
          } else if (spec.type === "string" && typeof oVal !== "string") {
            errors.push(`widgets.${wId}.${oKey} must be string`);
          } else if (spec.type === "enum" && !spec.values.includes(oVal)) {
            errors.push(`widgets.${wId}.${oKey} invalid enum value '${oVal}'`);
          } else if (spec.type === "integer") {
            if (!Number.isInteger(oVal) || (spec.min !== undefined && oVal < spec.min) || (spec.max !== undefined && oVal > spec.max)) {
              errors.push(`widgets.${wId}.${oKey} invalid integer '${oVal}'`);
            }
          } else if (spec.type === "number") {
            if (typeof oVal !== "number" || !Number.isFinite(oVal) || (spec.min !== undefined && oVal < spec.min) || (spec.max !== undefined && oVal > spec.max)) {
              errors.push(`widgets.${wId}.${oKey} invalid number '${oVal}'`);
            }
          }
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function quoteShellSingleArg(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function buildStatusLineSetting() {
  const nodeBin = process.execPath || "/usr/bin/node";
  return {
    type: "command",
    command: `${quoteShellSingleArg(nodeBin)} ${quoteShellSingleArg(RENDERER_PATH)}`,
    enabled: true,
    stack_with_default: false,
  };
}

function isOwnedCommand(cmd) {
  if (typeof cmd !== "string" || !cmd.trim()) return false;
  return cmd.includes(RENDERER_PATH) || cmd.includes("custom-statusline/scripts/statusline-renderer.js");
}

function inspectInstallation(paths = {}) {
  const configPath = paths.configPath || process.env.STATUSLINE_CONFIG || DEFAULT_USER_CONFIG_PATH;
  const settingsPath = paths.settingsPath || process.env.AGY_SETTINGS_PATH || AGY_SETTINGS_PATH;
  const configJsonPath = paths.configJsonPath || CONFIG_JSON_PATH;

  const settings = loadSettings(settingsPath);
  const sl = settings && isPlainObject(settings.statusLine) ? settings.statusLine : null;
  const currentCommand = sl && typeof sl.command === "string" ? sl.command : "";

  let settingsStatus = "missing";
  if (sl && currentCommand) {
    if (isOwnedCommand(currentCommand)) {
      settingsStatus = sl.enabled === false ? "disabled" : "configured";
    } else {
      settingsStatus = "external";
    }
  }

  const raw = readUserConfigRaw(configPath);
  const validation = raw.exists && !raw.parseError ? validateConfig(raw.data) : null;

  let pluginRegistered = false;
  try {
    const cfg = readJsonObjectOrEmpty(configJsonPath);
    pluginRegistered = cfg?.plugins?.[PLUGIN_NAME]?.enabled === true;
  } catch {
    pluginRegistered = false;
  }

  let rendererExecutable = false;
  try {
    fs.accessSync(RENDERER_PATH, fs.constants.R_OK);
    rendererExecutable = true;
  } catch {
    rendererExecutable = false;
  }

  return {
    pluginName: PLUGIN_NAME,
    configPath,
    settingsPath,
    configJsonPath,
    rendererPath: RENDERER_PATH,
    schemaPath: SCHEMA_PATH,
    schemaUri: SCHEMA_URI,
    settingsStatus,
    currentCommand,
    configExists: raw.exists,
    configParseError: raw.parseError,
    hasSchema: Boolean(raw.data && raw.data.$schema),
    validation,
    pluginRegistered,
    rendererExecutable,
    nodeVersion: process.version,
  };
}

function installPlugin(options = {}) {
  const configPath = options.configPath || process.env.STATUSLINE_CONFIG || DEFAULT_USER_CONFIG_PATH;
  const settingsPath = options.settingsPath || process.env.AGY_SETTINGS_PATH || AGY_SETTINGS_PATH;
  const configJsonPath = options.configJsonPath || CONFIG_JSON_PATH;
  const force = Boolean(options.force);

  const info = inspectInstallation({ configPath, settingsPath, configJsonPath });
  if (info.settingsStatus === "external" && !force) {
    return { status: "blocked_external", currentCommand: info.currentCommand, settingsPath };
  }

  let createdConfig = false;
  if (!fs.existsSync(configPath)) {
    writeUserConfig(DEFAULT_CONFIG, configPath);
    createdConfig = true;
  }

  const settings = readJsonObjectOrEmpty(settingsPath);
  settings.statusLine = buildStatusLineSetting();
  writeJsonAtomic(settingsPath, settings);

  const cfg = readJsonObjectOrEmpty(configJsonPath);
  if (!isPlainObject(cfg.plugins)) cfg.plugins = {};
  cfg.plugins[PLUGIN_NAME] = { enabled: true };
  writeJsonAtomic(configJsonPath, cfg);

  return {
    status: "installed",
    createdConfig,
    configPath,
    settingsPath,
    configJsonPath,
  };
}

function uninstallPlugin(options = {}) {
  const settingsPath = options.settingsPath || process.env.AGY_SETTINGS_PATH || AGY_SETTINGS_PATH;
  const force = Boolean(options.force);

  const settings = readJsonObjectOrEmpty(settingsPath);
  if (!settings.statusLine) {
    return { status: "none", settingsPath };
  }

  const cmd = isPlainObject(settings.statusLine) ? settings.statusLine.command || "" : "";
  if (cmd && !isOwnedCommand(cmd) && !force) {
    return { status: "blocked_external", currentCommand: cmd, settingsPath };
  }

  delete settings.statusLine;
  writeJsonAtomic(settingsPath, settings);
  return { status: "removed", settingsPath };
}

const DEFAULT_SAMPLE_MODEL = {
  id: "gemini-4-neon-high",
  display_name: "Gemini 4 Neon (High)",
  effort: "high",
};
const DEFAULT_LIVE_SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000;

function readLivePayloadSnapshot(options = {}) {
  const snapshotPath = resolveLastPayloadPath(options.snapshotPath);
  const maxAgeMs = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : DEFAULT_LIVE_SNAPSHOT_MAX_AGE_MS;
  try {
    const stat = fs.statSync(snapshotPath);
    const raw = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    if (!isPlainObject(raw?.payload) || Object.keys(raw.payload).length === 0) return null;
    const savedAt = Number.isFinite(raw.saved_at) ? raw.saved_at : stat.mtimeMs;
    if (maxAgeMs >= 0 && Date.now() - savedAt > maxAgeMs) return null;
    return cloneJson(raw.payload);
  } catch {
    return null;
  }
}

function resolveFallbackModel(settings, livePayload) {
  if (isPlainObject(livePayload?.model)) {
    const hasName =
      (typeof livePayload.model.display_name === "string" && livePayload.model.display_name.trim()) ||
      (typeof livePayload.model.id === "string" && livePayload.model.id.trim());
    if (hasName) return cloneJson(livePayload.model);
  }
  if (typeof settings?.model === "string" && settings.model.trim()) {
    const m = settings.model.trim();
    return { id: m, display_name: m };
  }
  return { ...DEFAULT_SAMPLE_MODEL };
}

function resolveFallbackMode(settings, livePayload) {
  if (typeof livePayload?.cycle_mode === "string" && livePayload.cycle_mode.trim()) {
    return livePayload.cycle_mode.trim();
  }
  if (typeof settings?.agentMode === "string" && settings.agentMode.trim()) {
    return settings.agentMode.trim();
  }
  return "auto";
}

function buildSamplePayload(scenario = "normal", widthOverride, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const settings = isPlainObject(opts.settings) ? opts.settings : null;
  const livePayload =
    isPlainObject(opts.livePayload) && Object.keys(opts.livePayload).length > 0 ? opts.livePayload : null;
  const preferLive = Boolean(opts.preferLive);

  if (preferLive && scenario === "normal" && livePayload) {
    const live = cloneJson(livePayload);
    if (Number.isInteger(widthOverride) && widthOverride > 10) {
      live.terminal_width = widthOverride;
    } else if (!Number.isInteger(live.terminal_width) || live.terminal_width <= 10) {
      live.terminal_width = 120;
    }
    return live;
  }

  const cwd = process.cwd();
  const base = {
    cwd,
    workspace: { current_dir: cwd, project_dir: cwd },
    model: resolveFallbackModel(settings, livePayload),
    cycle_mode: resolveFallbackMode(settings, livePayload),
    agent_state: "idle",
    terminal_width: 120,
    context_window: {
      total_input_tokens: 112000,
      total_output_tokens: 37000,
      context_window_size: 1048576,
      used_percentage: 14,
      current_usage: {
        input_tokens: 4200,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 101000,
      },
    },
    quota: {
      "gemini-5h": { remaining_fraction: 0.82, reset_in_seconds: 15120 },
      "gemini-weekly": { remaining_fraction: 0.64, reset_in_seconds: 432000 },
      "3p-5h": { remaining_fraction: 0.95, reset_in_seconds: 14400 },
      "3p-weekly": { remaining_fraction: 0.88, reset_in_seconds: 518400 },
    },
    vcs: { type: "git", branch: "main", dirty: true },
  };

  let payload = base;
  if (scenario === "narrow") {
    payload = { ...base, terminal_width: 48 };
  } else if (scenario === "alert" || scenario === "gallery") {
    payload = {
      ...base,
      vim: { mode: "INSERT" },
      agent_state: "tool_use",
      cycle_mode: resolveFallbackMode(settings, livePayload),
      task_count: 2,
      subagents: [{ id: "sub-1", status: "running" }],
      artifact_count: 3,
      pending_input_count: 2,
      tool_confirmation_pending: true,
      exceeds_200k_tokens: true,
      sandbox: { enabled: true },
      cost: { total_usd: 1.48 },
      conversation_title: "Refactor status line",
      conversation_id: "12345678-1234-4123-8123-123456789abc",
      context_window: {
        total_input_tokens: 185000,
        total_output_tokens: 41000,
        context_window_size: 262144,
        used_percentage: 88,
        current_usage: {
          input_tokens: 42000,
          cache_creation_input_tokens: 18000,
          cache_read_input_tokens: 158000,
        },
      },
      quota: {
        "gemini-5h": { remaining_fraction: 0.08, reset_in_seconds: 1800 },
        "gemini-weekly": { remaining_fraction: 0.24, reset_in_seconds: 172800 },
        "3p-5h": { remaining_fraction: 0.15, reset_in_seconds: 3600 },
        "3p-weekly": { remaining_fraction: 0.09, reset_in_seconds: 259200 },
      },
    };
  }

  if (Number.isInteger(widthOverride) && widthOverride > 10) {
    payload.terminal_width = widthOverride;
  }
  return payload;
}

function resolvePreviewPayload(scenario = "normal", widthOverride, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const livePayload =
    opts.livePayload !== undefined
      ? opts.livePayload
      : readLivePayloadSnapshot({ snapshotPath: opts.snapshotPath, maxAgeMs: opts.maxAgeMs });
  const preferLive = Boolean(opts.preferLive);
  const payload = buildSamplePayload(scenario, widthOverride, {
    settings: opts.settings || null,
    livePayload,
    preferLive,
  });
  const isLive = Boolean(
    preferLive && scenario === "normal" && isPlainObject(livePayload) && Object.keys(livePayload).length > 0
  );
  return { payload, isLive };
}

function renderSingleWidgetSample(widgetId, config, settings, payload) {
  const renderer = WIDGET_RENDERERS[widgetId];
  if (!renderer) return "";
  const palette = resolvePalette(config, settings);
  const style = makeStyler(palette);
  const opts = isPlainObject(config?.widgets?.[widgetId]) ? config.widgets[widgetId] : { enabled: true };
  const samplePayload = payload || buildSamplePayload("gallery", undefined, { settings });
  const out = renderer(samplePayload, opts, style, {
    config,
    settings,
    statusLang: resolveStatusLocale(config),
  });
  return out && out.full ? out.full : "";
}

module.exports = {
  PLUGIN_NAME,
  PLUGIN_ROOT,
  RENDERER_PATH,
  SCHEMA_PATH,
  SCHEMA_URI,
  CONFIG_JSON_PATH,
  DEFAULT_LAST_PAYLOAD_PATH,
  DEFAULT_SAMPLE_MODEL,
  COLOR_SCHEMES,
  LOCALES,
  STATUS_LOCALES,
  ALL_WIDGET_IDS,
  ALL_QUOTA_BUCKETS,
  WIDGET_META,
  WIDGET_META_MAP,
  PRESETS,
  PRESET_NAMES,
  cloneJson,
  isPlainObject,
  writeJsonAtomic,
  readJsonObjectOrEmpty,
  readUserConfigRaw,
  withSchemaFirst,
  writeUserConfig,
  applyPreset,
  addWidget,
  removeWidget,
  moveWidget,
  setConfigValue,
  validateConfig,
  buildStatusLineSetting,
  inspectInstallation,
  installPlugin,
  uninstallPlugin,
  readLivePayloadSnapshot,
  resolveFallbackModel,
  resolveFallbackMode,
  buildSamplePayload,
  resolvePreviewPayload,
  renderSingleWidgetSample,
};
