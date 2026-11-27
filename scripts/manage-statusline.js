#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  DEFAULT_CONFIG,
  DEFAULT_USER_CONFIG_PATH,
  loadConfig,
  loadSettings,
  renderStatusLine,
  stripAnsi,
} = require("./statusline-renderer");
const {
  PLUGIN_NAME,
  PRESET_NAMES,
  WIDGET_META,
  readUserConfigRaw,
  writeUserConfig,
  applyPreset,
  addWidget,
  removeWidget,
  moveWidget,
  setConfigValue,
  validateConfig,
  inspectInstallation,
  installPlugin,
  uninstallPlugin,
  resolvePreviewPayload,
  renderSingleWidgetSample,
} = require("./statusline-meta");
const { resolveLocale, createTranslator } = require("./statusline-i18n");
const { runTui } = require("./statusline-tui");
const { VALID_LAUNCH_MODES, normalizeLaunchMode, launchTuiExternal } = require("./statusline-launcher");

function parseCliArgs(argv) {
  const positionals = [];
  const flags = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--") && arg !== "-h") {
      positionals.push(arg);
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      flags.help = true;
      continue;
    }
    const eqIdx = arg.indexOf("=");
    if (eqIdx > 2) {
      const k = arg.slice(2, eqIdx);
      const v = arg.slice(eqIdx + 1);
      flags[k] = v;
      continue;
    }
    const k = arg.slice(2);
    if (
      k === "lang" ||
      k === "preset" ||
      k === "scenario" ||
      k === "width" ||
      k === "scheme" ||
      k === "at" ||
      k === "config"
    ) {
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        flags[k] = argv[++i];
      } else {
        flags[k] = true;
      }
    } else if (k === "open" || k === "open-ui") {
      if (
        i + 1 < argv.length &&
        !argv[i + 1].startsWith("--") &&
        VALID_LAUNCH_MODES.includes(argv[i + 1].toLowerCase())
      ) {
        flags[k] = argv[++i];
      } else {
        flags[k] = true;
      }
    } else if (k === "set") {
      // Accepts --set path=val OR --set path val
      if (i + 1 < argv.length) {
        const next = argv[++i];
        if (next.includes("=") || i + 1 >= argv.length) {
          flags.set = next;
        } else {
          flags.set = `${next}=${argv[++i]}`;
        }
      } else {
        flags.set = true;
      }
    } else {
      flags[k] = true;
    }
  }

  return { flags, positionals };
}

function getTranslator(flags, configPath) {
  const cfg = loadConfig(configPath);
  const locale = resolveLocale({
    cliLang: typeof flags.lang === "string" ? flags.lang : undefined,
    configLocale: cfg.locale,
  });
  return { locale, t: createTranslator(locale), config: cfg };
}

function printHelp(t) {
  const lines = [
    t("cli.title"),
    "",
    t("cli.usage"),
    "",
    t("cli.commandsHeading"),
    t("cli.cmd.ui"),
    t("cli.cmd.uiOpen"),
    t("cli.cmd.install"),
    t("cli.cmd.uninstall"),
    t("cli.cmd.reset"),
    t("cli.cmd.presets"),
    t("cli.cmd.preset"),
    t("cli.cmd.preview"),
    t("cli.cmd.gallery"),
    t("cli.cmd.watch"),
    t("cli.cmd.show"),
    t("cli.cmd.add"),
    t("cli.cmd.remove"),
    t("cli.cmd.move"),
    t("cli.cmd.set"),
    t("cli.cmd.doctor"),
    "",
    t("cli.optionsHeading"),
    t("cli.opt.help"),
    t("cli.opt.preview"),
    t("cli.opt.width"),
    t("cli.opt.scheme"),
    t("cli.opt.plain"),
    t("cli.opt.force"),
    t("cli.opt.open"),
  ];
  console.log(lines.join("\n"));
}

function effectivePreviewConfig(baseConfig, flags) {
  let cfg = baseConfig;
  if (typeof flags.preset === "string") {
    const pCfg = applyPreset(cfg, flags.preset);
    if (pCfg) cfg = pCfg;
  }
  if (typeof flags.scheme === "string") {
    cfg = { ...cfg, colorScheme: flags.scheme };
  }
  if (flags.plain) {
    cfg = { ...cfg, colorScheme: "none" };
  }
  return cfg;
}

function runProbeSync(cmd, args, env) {
  return execFileSync(cmd, args, {
    timeout: 400,
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
    env,
  });
}

function detectExternalTerminalColumns(env = process.env, execFn = runProbeSync) {
  if (!env) return null;

  // 1. Kitty remote control (KITTY_LISTEN_ON + optional KITTY_WINDOW_ID)
  if (env.KITTY_LISTEN_ON) {
    try {
      const raw = execFn("kitty", ["@", "--to", env.KITTY_LISTEN_ON, "ls"], env);
      const osWins = JSON.parse(raw);
      if (Array.isArray(osWins)) {
        const targetId = env.KITTY_WINDOW_ID !== undefined ? Number(env.KITTY_WINDOW_ID) : NaN;
        let focusedCols = null;
        for (const osWin of osWins) {
          for (const tab of osWin?.tabs || []) {
            for (const win of tab?.windows || []) {
              const cols = Number(win?.columns);
              if (!Number.isInteger(cols) || cols <= 20) continue;
              if (Number.isInteger(targetId) && Number(win?.id) === targetId) {
                return cols;
              }
              if (win?.is_focused && tab?.is_focused !== false && osWin?.is_focused !== false) {
                focusedCols = cols;
              }
            }
          }
        }
        if (focusedCols !== null) return focusedCols;
      }
    } catch {
      // fall through
    }
  }

  // 2. tmux active pane width
  if (env.TMUX) {
    try {
      const args = env.TMUX_PANE
        ? ["display-message", "-t", env.TMUX_PANE, "-p", "#{pane_width}"]
        : ["display-message", "-p", "#{pane_width}"];
      const raw = execFn("tmux", args, env);
      const cols = Number(String(raw || "").trim());
      if (Number.isInteger(cols) && cols > 20) return cols;
    } catch {
      // fall through
    }
  }

  // 3. WezTerm active pane width
  if (env.WEZTERM_PANE !== undefined && String(env.WEZTERM_PANE).trim() !== "") {
    try {
      const raw = execFn("wezterm", ["cli", "list", "--format", "json"], env);
      const panes = JSON.parse(raw);
      if (Array.isArray(panes)) {
        const targetPane = String(env.WEZTERM_PANE).trim();
        const match = panes.find((p) => String(p?.pane_id) === targetPane) || panes.find((p) => p?.is_active);
        const cols = Number(match?.size?.cols);
        if (Number.isInteger(cols) && cols > 20) return cols;
      }
    } catch {
      // fall through
    }
  }

  return null;
}

function resolvePreviewWidth(flags, indentCols = 2, fallbackCols = 120, io = {}) {
  const explicit = Number(flags.width);
  if (Number.isInteger(explicit) && explicit > 10) return explicit;
  const env = io.env || process.env;
  const stdout = io.stdout || process.stdout;
  const term = String(env?.TERM || "").trim().toLowerCase();
  const isDumbTerm = term === "dumb";
  const ttyCols = !isDumbTerm && stdout && stdout.isTTY ? Number(stdout.columns) : NaN;
  if (Number.isInteger(ttyCols) && ttyCols > indentCols + 20) {
    return ttyCols - indentCols;
  }
  const detectFn = io.detectExternalCols || detectExternalTerminalColumns;
  const extCols = detectFn(env);
  if (Number.isInteger(extCols) && extCols > 20) {
    const chatMargin = Math.max(0, indentCols) + 6;
    return Math.max(24, extCols - chatMargin);
  }
  return fallbackCols;
}

function runPreview(flags, configPath, t) {
  const settings = loadSettings();
  const baseConfig = loadConfig(configPath);
  const cfg = effectivePreviewConfig(baseConfig, flags);

  const reqScenario = typeof flags.scenario === "string" ? flags.scenario.toLowerCase() : "all";
  const scenarios =
    reqScenario === "normal" || reqScenario === "alert" || reqScenario === "narrow"
      ? [reqScenario]
      : ["normal", "alert", "narrow"];
  const rawWidth = Number(flags.width);
  const explicitWidth = Number.isInteger(rawWidth) && rawWidth > 10 ? rawWidth : undefined;

  const source =
    typeof flags.preset === "string"
      ? t("preview.preset", { name: flags.preset })
      : t("preview.userConfig");
  console.log(t("preview.title", { source }));

  for (const sc of scenarios) {
    const targetWidth = sc === "narrow" ? explicitWidth : resolvePreviewWidth(flags, 2, 120);
    const { payload } = resolvePreviewPayload(sc, targetWidth, {
      settings,
      preferLive: sc === "normal",
    });
    const rendered = renderStatusLine(payload, { config: cfg, settings });
    const shown = flags.plain ? stripAnsi(rendered) : rendered;
    console.log(`\n  [${t(`scenario.${sc}`, { width: payload.terminal_width })}]`);
    console.log(`  ${shown}`);
    if (!flags.plain) {
      console.log(`  [${t("preview.plainLabel")}] ${stripAnsi(rendered)}`);
    }
  }
}

function runPresetsList(flags, configPath, t) {
  const settings = loadSettings();
  const baseConfig = loadConfig(configPath);
  const schemeOverride = flags.plain ? "none" : typeof flags.scheme === "string" ? flags.scheme : undefined;
  const { payload } = resolvePreviewPayload("normal", resolvePreviewWidth(flags, 4, 120), {
    settings,
    preferLive: false,
  });

  console.log(t("preset.listTitle"));
  console.log(`  ${t("preset.resetNote")}`);
  for (const name of PRESET_NAMES) {
    let cfg = applyPreset(baseConfig, name);
    if (schemeOverride) cfg = { ...cfg, colorScheme: schemeOverride };
    const line = renderStatusLine(payload, { config: cfg, settings });
    const shown = flags.plain ? stripAnsi(line) : line;
    console.log(`\n  • ${name} — ${t(`preset.${name}.name`)}`);
    console.log(`    ${t(`preset.${name}.desc`)}`);
    console.log(`    ${shown}`);
    if (!flags.plain) {
      console.log(`    [${t("preview.plainLabel")}] ${stripAnsi(line)}`);
    }
  }
}

function runGallery(flags, configPath, t) {
  const settings = loadSettings();
  let cfg = loadConfig(configPath);
  if (typeof flags.scheme === "string") cfg = { ...cfg, colorScheme: flags.scheme };
  if (flags.plain) cfg = { ...cfg, colorScheme: "none" };

  const { payload } = resolvePreviewPayload("gallery", undefined, {
    settings,
    preferLive: false,
  });
  console.log(t("gallery.title", { count: WIDGET_META.length }));
  console.log("");

  for (const meta of WIDGET_META) {
    const side = cfg.left.includes(meta.id)
      ? t("gallery.sideLeft")
      : cfg.right.includes(meta.id)
      ? t("gallery.sideRight")
      : t("gallery.sideOff");
    const sampleRaw = renderSingleWidgetSample(meta.id, cfg, settings, payload);
    const sample = sampleRaw ? (flags.plain ? stripAnsi(sampleRaw) : sampleRaw) : t("gallery.unavailable");
    const optNames = meta.options.filter((o) => o.key !== "enabled").map((o) => o.key).join(", ");
    console.log(`  ${meta.id.padEnd(16)} [${side}]  ${sample}`);
    console.log(`    ${t(`widget.${meta.id}.name`)} — ${t(`widget.${meta.id}.desc`)}${optNames ? ` (${optNames})` : ""}`);
  }
}

function runShow(flags, configPath, t) {
  const info = inspectInstallation({ configPath });
  const cfg = loadConfig(configPath);
  if (flags.json) {
    console.log(JSON.stringify({ installation: info, config: cfg }, null, 2));
    return;
  }
  console.log(t("show.title", { path: info.configPath }));
  console.log(`  ${t("show.install")} ${t(`show.status.${info.settingsStatus}`)}`);
  if (info.currentCommand) {
    console.log(`    command: ${info.currentCommand}`);
  }
  console.log(`  ${t("show.left", { list: cfg.left.join(", ") || "(empty)" })}`);
  console.log(`  ${t("show.right", { list: cfg.right.join(", ") || "(empty)" })}`);
  console.log(`  ${t("show.scheme", { scheme: cfg.colorScheme })}`);
  console.log(`  ${t("show.locale", { locale: cfg.locale || "auto" })}`);
  console.log(`  ${t("show.statusLocale", { statusLocale: cfg.statusLocale || "en" })}`);
  console.log(`  ${t("show.seps", { leftSep: JSON.stringify(cfg.leftSeparator), rightSep: JSON.stringify(cfg.separator) })}`);
}

function runDoctor(flags, configPath, t) {
  const info = inspectInstallation({ configPath });
  const checks = [];

  if (info.configExists) {
    checks.push({ id: "configExists", level: "ok", message: t("doctor.check.configExists", { path: info.configPath }) });
  } else {
    checks.push({ id: "configExists", level: "warn", message: t("doctor.check.configMissing", { path: info.configPath }) });
  }

  if (info.configExists) {
    if (info.configParseError) {
      checks.push({ id: "configSyntax", level: "fail", message: t("doctor.check.configParseError", { err: info.configParseError }) });
    } else {
      checks.push({ id: "configSyntax", level: "ok", message: t("doctor.check.configSyntax") });
      if (info.hasSchema) {
        checks.push({ id: "schemaPresent", level: "ok", message: t("doctor.check.schemaPresent") });
      } else {
        checks.push({ id: "schemaPresent", level: "warn", message: t("doctor.check.schemaMissing") });
      }
      if (info.validation?.errors?.length) {
        for (const err of info.validation.errors) {
          checks.push({ id: "schemaValidation", level: "fail", message: err });
        }
      } else {
        checks.push({ id: "schemaValidation", level: "ok", message: t("doctor.check.schemaValidation") });
      }
      for (const warn of info.validation?.warnings || []) {
        if (warn.includes("$schema")) continue;
        checks.push({ id: "schemaWarning", level: "warn", message: warn });
      }
    }
  }

  if (info.rendererExecutable) {
    checks.push({ id: "renderer", level: "ok", message: t("doctor.check.rendererOk") });
  } else {
    checks.push({ id: "renderer", level: "fail", message: t("doctor.check.rendererMissing", { path: info.rendererPath }) });
  }

  if (info.settingsStatus === "configured") {
    checks.push({ id: "settingsHook", level: "ok", message: t("doctor.check.settingsConfigured") });
  } else if (info.settingsStatus === "external") {
    checks.push({ id: "settingsHook", level: "warn", message: t("doctor.check.settingsExternal", { cmd: info.currentCommand }) });
  } else if (info.settingsStatus === "disabled") {
    checks.push({ id: "settingsHook", level: "warn", message: t("doctor.check.settingsDisabled") });
  } else {
    checks.push({ id: "settingsHook", level: "warn", message: t("doctor.check.settingsMissing") });
  }

  if (info.pluginRegistered) {
    checks.push({ id: "pluginRegistered", level: "ok", message: t("doctor.check.pluginRegistered", { path: info.configJsonPath }) });
  } else {
    checks.push({ id: "pluginRegistered", level: "warn", message: t("doctor.check.pluginNotRegistered", { path: info.configJsonPath }) });
  }

  const errors = checks.filter((c) => c.level === "fail").length;
  const warnings = checks.filter((c) => c.level === "warn").length;

  if (flags.json) {
    console.log(JSON.stringify({ ok: errors === 0, errors, warnings, checks, installation: info }, null, 2));
  } else {
    console.log(t("doctor.title"));
    for (const c of checks) {
      const tag = c.level === "ok" ? t("doctor.ok") : c.level === "warn" ? t("doctor.warn") : t("doctor.fail");
      console.log(`  [${tag}] ${c.message}`);
    }
    console.log(`\n${t("doctor.summary", { errors, warnings })}`);
  }
  return errors === 0 ? 0 : 1;
}

function runWatch(flags, configPath, t) {
  const dir = path.dirname(configPath);
  const fileName = path.basename(configPath);
  fs.mkdirSync(dir, { recursive: true });
  const scenario = typeof flags.scenario === "string" ? flags.scenario : "normal";
  const settings = loadSettings();

  const renderOnce = (isUpdate) => {
    const raw = readUserConfigRaw(configPath);
    if (raw.exists && raw.parseError) {
      console.error(t("watch.parseError", { err: raw.parseError }));
      return;
    }
    const cfg = effectivePreviewConfig(loadConfig(configPath), flags);
    const rawWidth = Number(flags.width);
    const explicitWidth = Number.isInteger(rawWidth) && rawWidth > 10 ? rawWidth : undefined;
    const watchWidth =
      scenario === "narrow" ? explicitWidth : resolvePreviewWidth(flags, 2, 120);
    const { payload } = resolvePreviewPayload(scenario, watchWidth, {
      settings,
      preferLive: scenario === "normal",
    });
    const rendered = renderStatusLine(payload, { config: cfg, settings });
    if (isUpdate) {
      console.log(`\n${t("watch.updated", { time: new Date().toLocaleTimeString() })}`);
    }
    console.log(`  ${flags.plain ? stripAnsi(rendered) : rendered}`);
  };

  console.log(
    t("watch.started", {
      path: configPath,
      scenario,
      scheme: flags.scheme || loadConfig(configPath).colorScheme,
    })
  );
  renderOnce(false);

  let timer = null;
  const watcher = fs.watch(dir, (_eventType, changedName) => {
    if (changedName && changedName !== fileName) return;
    clearTimeout(timer);
    timer = setTimeout(() => renderOnce(true), 120);
  });

  return new Promise((resolve) => {
    const stop = () => {
      clearTimeout(timer);
      watcher.close();
      resolve(0);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function main() {
  const { flags, positionals } = parseCliArgs(process.argv.slice(2));
  const configPath =
    (typeof flags.config === "string" && flags.config) ||
    process.env.STATUSLINE_CONFIG ||
    DEFAULT_USER_CONFIG_PATH;
  const { locale, t } = getTranslator(flags, configPath);

  if (flags.help || Object.keys(flags).length === 0) {
    printHelp(t);
    return 0;
  }

  if (flags["open-ui"] !== undefined || (flags.ui && flags.open !== undefined)) {
    const rawMode = flags["open-ui"] !== undefined ? flags["open-ui"] : flags.open;
    const mode = normalizeLaunchMode(rawMode);
    if (!mode) {
      console.error(t("launch.invalidMode", { mode: rawMode, allowed: VALID_LAUNCH_MODES.join(", ") }));
      return 1;
    }
    const res = await launchTuiExternal({
      mode,
      configPath,
      cliLang: typeof flags.lang === "string" ? flags.lang : undefined,
      manageScriptPath: __filename,
    });
    if (flags.json) {
      console.log(JSON.stringify(res, null, 2));
      return res.ok ? 0 : 1;
    }
    if (res.ok) {
      console.log(t("launch.opened", { method: res.method }));
      return 0;
    }
    console.error(t("launch.failed", { reason: res.reason, cmd: res.fallbackCommand }));
    return 1;
  }

  if (flags.ui) {
    return runTui({
      configPath,
      cliLang: typeof flags.lang === "string" ? flags.lang : undefined,
    });
  }

  if (flags.install) {
    const res = installPlugin({ configPath, force: Boolean(flags.force) });
    if (res.status === "blocked_external") {
      console.error(t("install.blockedExternal", { path: res.settingsPath, cmd: res.currentCommand }));
      return 1;
    }
    console.log(t("install.done", { name: PLUGIN_NAME }));
    console.log(t("install.settings", { path: res.settingsPath }));
    console.log(t(res.createdConfig ? "install.configCreated" : "install.configKept", { path: res.configPath }));
    console.log(t("install.pluginState", { path: res.configJsonPath }));
    return 0;
  }

  if (flags.uninstall) {
    const res = uninstallPlugin({ force: Boolean(flags.force) });
    if (res.status === "blocked_external") {
      console.error(t("uninstall.blockedExternal", { path: res.settingsPath, cmd: res.currentCommand }));
      return 1;
    }
    console.log(t(res.status === "removed" ? "uninstall.done" : "uninstall.none", { path: res.settingsPath }));
    return 0;
  }

  if (flags["reset-config"]) {
    writeUserConfig(DEFAULT_CONFIG, configPath);
    console.log(t("reset.done", { path: configPath }));
    return 0;
  }

  if (flags.presets) {
    runPresetsList(flags, configPath, t);
    return 0;
  }

  if (flags.preset !== undefined && !flags.preview) {
    const presetName = typeof flags.preset === "string" ? flags.preset.trim().toLowerCase() : "";
    const cur = loadConfig(configPath);
    const next = applyPreset(cur, presetName);
    if (!next) {
      console.error(t("preset.unknown", { name: presetName, list: PRESET_NAMES.join(", ") }));
      return 1;
    }
    writeUserConfig(next, configPath);
    console.log(t("preset.applied", { name: presetName, path: configPath }));
    console.log(`  ${t("preset.resetNote")}`);
    const settings = loadSettings();
    const { payload } = resolvePreviewPayload("normal", resolvePreviewWidth(flags, 2, 120), {
      settings,
      preferLive: true,
    });
    const rendered = renderStatusLine(payload, { config: next, settings });
    console.log(`  ${flags.plain ? stripAnsi(rendered) : rendered}`);
    return 0;
  }

  if (flags.preview) {
    runPreview(flags, configPath, t);
    return 0;
  }

  if (flags.gallery) {
    runGallery(flags, configPath, t);
    return 0;
  }

  if (flags.watch) {
    return runWatch(flags, configPath, t);
  }

  if (flags.show) {
    runShow(flags, configPath, t);
    return 0;
  }

  if (flags.doctor) {
    return runDoctor(flags, configPath, t);
  }

  if (flags.add) {
    const side = positionals[0];
    const widgetId = positionals[1];
    const atIndex = flags.at !== undefined ? Number(flags.at) : undefined;
    const res = addWidget(loadConfig(configPath), side, widgetId, atIndex);
    if (!res.ok) {
      console.error(t(res.errorKey, res.params));
      return 1;
    }
    writeUserConfig(res.config, configPath);
    console.log(t("mutate.added", { widget: widgetId, side, index: res.index }));
    return 0;
  }

  if (flags.remove) {
    const side = positionals[0];
    const widgetId = positionals[1];
    const res = removeWidget(loadConfig(configPath), side, widgetId);
    if (!res.ok) {
      console.error(t(res.errorKey, res.params));
      return 1;
    }
    if (res.changed) {
      writeUserConfig(res.config, configPath);
      console.log(t("mutate.removed", { widget: widgetId, side }));
    } else {
      console.log(t("mutate.notPresent", { widget: widgetId, side }));
    }
    return 0;
  }

  if (flags.move) {
    const side = positionals[0];
    const widgetId = positionals[1];
    const targetIdx = Number(positionals[2]);
    if (!Number.isInteger(targetIdx)) {
      console.error(t("err.invalidInt", { path: "index", value: positionals[2] }));
      return 1;
    }
    const res = moveWidget(loadConfig(configPath), side, widgetId, targetIdx);
    if (!res.ok) {
      console.error(t(res.errorKey, res.params));
      return 1;
    }
    writeUserConfig(res.config, configPath);
    console.log(t("mutate.moved", { widget: widgetId, side, index: res.index }));
    return 0;
  }

  if (flags.set !== undefined) {
    if (typeof flags.set !== "string" || !flags.set.includes("=")) {
      console.error(t("mutate.setUsage"));
      return 1;
    }
    const eq = flags.set.indexOf("=");
    const dotPath = flags.set.slice(0, eq).trim();
    const rawVal = flags.set.slice(eq + 1);
    const res = setConfigValue(loadConfig(configPath), dotPath, rawVal);
    if (!res.ok) {
      console.error(t(res.errorKey, res.params));
      return 1;
    }
    writeUserConfig(res.config, configPath);
    console.log(t("mutate.setDone", { path: res.normalizedPath, value: JSON.stringify(res.value) }));
    return 0;
  }

  printHelp(t);
  return locale ? 0 : 0;
}

if (require.main === module) {
  Promise.resolve(main())
    .then((code) => {
      process.exit(Number.isInteger(code) ? code : 0);
    })
    .catch((err) => {
      console.error(err?.message || String(err));
      process.exit(1);
    });
}

module.exports = {
  detectExternalTerminalColumns,
  resolvePreviewWidth,
};
