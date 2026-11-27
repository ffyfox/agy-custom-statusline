#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const {
  DEFAULT_CONFIG,
  DEFAULT_USER_CONFIG_PATH,
  loadConfig,
  loadSettings,
  mergeConfig,
  renderStatusLine,
  visibleWidth,
  truncateAnsi,
  stripAnsi,
} = require("./statusline-renderer");
const {
  COLOR_SCHEMES,
  STATUS_LOCALES,
  WIDGET_META,
  WIDGET_META_MAP,
  PRESET_NAMES,
  cloneJson,
  readUserConfigRaw,
  writeUserConfig,
  applyPreset,
  addWidget,
  removeWidget,
  moveWidget,
  setConfigValue,
  inspectInstallation,
  installPlugin,
  resolvePreviewPayload,
  renderSingleWidgetSample,
} = require("./statusline-meta");
const { resolveLocale, createTranslator } = require("./statusline-i18n");

const SCENARIOS = ["normal", "alert", "narrow", "gallery"];

function repeatChar(ch, count) {
  return count > 0 ? ch.repeat(count) : "";
}

function padRightAnsi(str, targetCols) {
  const clipped = visibleWidth(str) > targetCols ? truncateAnsi(str, targetCols) : str;
  const w = visibleWidth(clipped);
  const pad = Math.max(0, targetCols - w);
  return clipped + " ".repeat(pad);
}

function horizontalBoxRule(leftCh, rightCh, titleText, totalCols) {
  const inner = Math.max(4, totalCols - 2);
  if (!titleText) {
    return `${leftCh}${repeatChar("─", inner)}${rightCh}`;
  }
  const label = ` ${titleText} `;
  const clippedLabel = visibleWidth(label) > inner - 2 ? truncateAnsi(label, inner - 2) : label;
  const rem = Math.max(0, inner - 1 - visibleWidth(clippedLabel));
  return `${leftCh}─${clippedLabel}${repeatChar("─", rem)}${rightCh}`;
}

function boxTop(titleText, totalCols) {
  return horizontalBoxRule("┌", "┐", titleText, totalCols);
}

function boxDivider(titleText, totalCols) {
  return horizontalBoxRule("├", "┤", titleText, totalCols);
}

function boxBottom(totalCols) {
  const inner = Math.max(4, totalCols - 2);
  return `└${repeatChar("─", inner)}┘`;
}

function appendWidgetSummaryLines(bodyLines, widgetId, sample, width, t) {
  const shownSample = sample || `\x1b[2m${t("gallery.unavailable")}\x1b[0m`;
  bodyLines.push(boxLine(`\x1b[2m${t(`widget.${widgetId}.desc`)}\x1b[0m`, width));
  bodyLines.push(boxLine(`\x1b[2m${t("tui.detailSample")}:\x1b[0m ${shownSample}`, width));
}

function boxLine(content, totalCols) {
  const inner = Math.max(2, totalCols - 4);
  return `│ ${padRightAnsi(content, inner)} │`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function createState(options = {}) {
  const configPath = options.configPath || process.env.STATUSLINE_CONFIG || DEFAULT_USER_CONFIG_PATH;
  const settingsPath = options.settingsPath || process.env.AGY_SETTINGS_PATH;
  const configJsonPath = options.configJsonPath;

  const raw = readUserConfigRaw(configPath);
  const loadedConfig = loadConfig(configPath);
  const settings = options.settings || loadSettings(settingsPath);
  const locale = resolveLocale({
    cliLang: options.cliLang,
    configLocale: loadedConfig.locale,
    env: options.env || process.env,
  });

  const installInfo = options.installInfo || inspectInstallation({ configPath, settingsPath, configJsonPath });

  return {
    configPath,
    settingsPath,
    configJsonPath,
    snapshotPath: options.snapshotPath,
    config: cloneJson(loadedConfig),
    settings,
    locale,
    snapshot: {
      existed: raw.exists,
      rawText: raw.rawText,
      config: cloneJson(loadedConfig),
    },
    installInfo,
    view: "main", // "main" | "options" | "presets" | "externalConfirm"
    mainCursor: 0,
    mainScroll: 0,
    selectedWidgetId: null,
    optsCursor: 0,
    presetCursor: 0,
    editingString: null, // { optionKey, value }
    scenarioIndex: 0,
    toast: "",
    shouldExit: false,
  };
}

function getGroupedRows(config) {
  const rows = [];
  const left = Array.isArray(config.left) ? config.left : [];
  const right = Array.isArray(config.right) ? config.right : [];
  const activeSet = new Set();

  for (let i = 0; i < left.length; i++) {
    const id = left[i];
    if (!WIDGET_META_MAP[id]) continue;
    activeSet.add(id);
    rows.push({ type: "widget", id, side: "left", sideIndex: i });
  }
  for (let i = 0; i < right.length; i++) {
    const id = right[i];
    if (!WIDGET_META_MAP[id]) continue;
    activeSet.add(id);
    rows.push({ type: "widget", id, side: "right", sideIndex: i });
  }
  for (const meta of WIDGET_META) {
    if (!activeSet.has(meta.id)) {
      rows.push({ type: "widget", id: meta.id, side: "available", sideIndex: -1 });
    }
  }
  return rows;
}

function findRowIndexById(rows, widgetId) {
  const idx = rows.findIndex((r) => r.id === widgetId);
  return idx >= 0 ? idx : 0;
}

function persistConfig(state, t, customToast) {
  state.config = writeUserConfig(state.config, state.configPath);
  state.toast = customToast || t("tui.saved");
}

function restoreSnapshot(state, t) {
  if (state.snapshot.existed && typeof state.snapshot.rawText === "string") {
    fs.mkdirSync(path.dirname(state.configPath), { recursive: true });
    const tmp = `${state.configPath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, state.snapshot.rawText, "utf8");
    fs.renameSync(tmp, state.configPath);
    state.config = mergeConfig(DEFAULT_CONFIG, loadConfig(state.configPath));
  } else if (!state.snapshot.existed && fs.existsSync(state.configPath)) {
    fs.unlinkSync(state.configPath);
    state.config = cloneJson(state.snapshot.config);
  } else {
    state.config = writeUserConfig(state.snapshot.config, state.configPath);
  }
  state.locale = resolveLocale({
    configLocale: state.config.locale,
    env: process.env,
  });
  state.toast = t("tui.restored");
}

function getWidgetOptionsWithMeta(widgetId) {
  const meta = WIDGET_META_MAP[widgetId];
  return meta ? meta.options : [];
}

function stepNumberOption(val, opt, delta) {
  const step = opt.step || 1;
  const next = val + delta * step;
  const min = opt.min !== undefined ? opt.min : -Infinity;
  const max = opt.max !== undefined ? opt.max : Infinity;
  const clamped = Math.max(min, Math.min(max, next));
  return opt.type === "integer" ? Math.round(clamped) : Math.round(clamped * 100) / 100;
}

function cycleEnumOption(val, opt, dir = 1) {
  const vals = opt.values || [];
  if (vals.length === 0) return val;
  const idx = vals.indexOf(val);
  const start = idx >= 0 ? idx : 0;
  return vals[(start + dir + vals.length) % vals.length];
}

function handleStringEditKey(state, str, key, t) {
  const kName = key?.name || "";
  if (kName === "escape") {
    state.editingString = null;
    return true;
  }
  if (kName === "return" || kName === "enter") {
    const { optionKey, value } = state.editingString;
    const res = setConfigValue(state.config, `${state.selectedWidgetId}.${optionKey}`, value);
    if (res.ok) {
      state.config = res.config;
      persistConfig(state, t);
    }
    state.editingString = null;
    return true;
  }
  if (kName === "backspace") {
    const chars = Array.from(state.editingString.value);
    chars.pop();
    state.editingString.value = chars.join("");
    return true;
  }
  if (str && !key?.ctrl && !key?.meta) {
    // Filter control characters
    const printable = Array.from(str).filter((ch) => {
      const cp = ch.codePointAt(0);
      return cp >= 0x20 && cp !== 0x7f;
    }).join("");
    if (printable) {
      state.editingString.value += printable;
    }
  }
  return true;
}

function handleOptionsKey(state, str, key, t) {
  if (state.editingString) {
    return handleStringEditKey(state, str, key, t);
  }
  const kName = key?.name || "";
  const lower = typeof str === "string" ? str.toLowerCase() : "";
  const opts = getWidgetOptionsWithMeta(state.selectedWidgetId);

  if (kName === "escape" || kName === "backspace" || lower === "b") {
    state.view = "main";
    return true;
  }
  if (lower === "q") {
    state.shouldExit = true;
    return true;
  }
  if (lower === "u") {
    restoreSnapshot(state, t);
    return true;
  }
  if (opts.length === 0) return false;

  if (kName === "up" || lower === "k") {
    state.optsCursor = (state.optsCursor - 1 + opts.length) % opts.length;
    return true;
  }
  if (kName === "down" || lower === "j") {
    state.optsCursor = (state.optsCursor + 1) % opts.length;
    return true;
  }

  const opt = opts[clamp(state.optsCursor, 0, opts.length - 1)];
  const currentVal =
    state.config?.widgets?.[state.selectedWidgetId]?.[opt.key] !== undefined
      ? state.config.widgets[state.selectedWidgetId][opt.key]
      : opt.default;

  if (opt.type === "string") {
    if (kName === "return" || kName === "enter" || kName === "space" || str === " ") {
      state.editingString = {
        optionKey: opt.key,
        value: typeof currentVal === "string" ? currentVal : String(currentVal || ""),
      };
      return true;
    }
    return false;
  }

  let nextVal;
  let changed = false;

  if (opt.type === "boolean") {
    if (kName === "space" || str === " " || kName === "return" || kName === "enter" || kName === "left" || kName === "right") {
      nextVal = !currentVal;
      changed = true;
    }
  } else if (opt.type === "enum") {
    if (kName === "right" || kName === "space" || str === " " || kName === "return" || kName === "enter") {
      nextVal = cycleEnumOption(currentVal, opt, 1);
      changed = true;
    } else if (kName === "left") {
      nextVal = cycleEnumOption(currentVal, opt, -1);
      changed = true;
    }
  } else if (opt.type === "integer" || opt.type === "number") {
    if (kName === "right" || str === "+" || str === "=") {
      nextVal = stepNumberOption(Number(currentVal), opt, 1);
      changed = nextVal !== currentVal;
    } else if (kName === "left" || str === "-") {
      nextVal = stepNumberOption(Number(currentVal), opt, -1);
      changed = nextVal !== currentVal;
    }
  }

  if (changed) {
    const res = setConfigValue(state.config, `${state.selectedWidgetId}.${opt.key}`, nextVal);
    if (res.ok) {
      state.config = res.config;
      persistConfig(state, t);
    }
    return true;
  }
  return false;
}

function handlePresetKey(state, str, key, t) {
  const kName = key?.name || "";
  const lower = typeof str === "string" ? str.toLowerCase() : "";
  if (kName === "escape" || lower === "p") {
    state.view = "main";
    return true;
  }
  if (kName === "up" || lower === "k") {
    state.presetCursor = (state.presetCursor - 1 + PRESET_NAMES.length) % PRESET_NAMES.length;
    return true;
  }
  if (kName === "down" || lower === "j") {
    state.presetCursor = (state.presetCursor + 1) % PRESET_NAMES.length;
    return true;
  }
  if (kName === "return" || kName === "enter" || kName === "space" || str === " ") {
    const presetName = PRESET_NAMES[state.presetCursor];
    state.config = applyPreset(state.config, presetName);
    persistConfig(state, t, t("tui.presetApplied", { name: presetName }));
    state.mainCursor = 0;
    state.mainScroll = 0;
    state.view = "main";
    return true;
  }
  return false;
}

function handleExternalConfirmKey(state, str, key, t) {
  const kName = key?.name || "";
  const lower = typeof str === "string" ? str.toLowerCase() : "";
  if (lower === "y" || kName === "return" || kName === "enter") {
    installPlugin({
      force: true,
      configPath: state.configPath,
      settingsPath: state.settingsPath,
      configJsonPath: state.configJsonPath,
    });
    state.installInfo = inspectInstallation({
      configPath: state.configPath,
      settingsPath: state.settingsPath,
      configJsonPath: state.configJsonPath,
    });
    state.toast = t("tui.installed");
    state.view = "main";
    return true;
  }
  if (lower === "n" || kName === "escape") {
    state.view = "main";
    return true;
  }
  return false;
}

function handleKey(state, str, key = {}) {
  const t = createTranslator(state.locale);

  if (key?.ctrl && key?.name === "c") {
    state.shouldExit = true;
    return true;
  }

  if (state.view === "options") {
    return handleOptionsKey(state, str, key, t);
  }
  if (state.view === "presets") {
    return handlePresetKey(state, str, key, t);
  }
  if (state.view === "externalConfirm") {
    return handleExternalConfirmKey(state, str, key, t);
  }

  const rows = getGroupedRows(state.config);
  state.mainCursor = clamp(state.mainCursor, 0, Math.max(0, rows.length - 1));
  const currentRow = rows[state.mainCursor];
  const kName = key?.name || "";
  const lower = typeof str === "string" ? str.toLowerCase() : "";

  if (lower === "q" || kName === "escape") {
    state.shouldExit = true;
    return true;
  }

  if (kName === "up" && !key?.shift) {
    state.mainCursor = (state.mainCursor - 1 + rows.length) % rows.length;
    return true;
  }
  if (kName === "down" && !key?.shift) {
    state.mainCursor = (state.mainCursor + 1) % rows.length;
    return true;
  }
  if (str === "k") {
    state.mainCursor = (state.mainCursor - 1 + rows.length) % rows.length;
    return true;
  }
  if (str === "j") {
    state.mainCursor = (state.mainCursor + 1) % rows.length;
    return true;
  }

  if (kName === "space" || str === " ") {
    if (!currentRow) return false;
    const id = currentRow.id;
    if (currentRow.side === "available") {
      const targetSide = WIDGET_META_MAP[id]?.defaultSide || "right";
      const res = addWidget(state.config, targetSide, id);
      if (res.ok) {
        state.config = res.config;
        persistConfig(state, t);
        state.mainCursor = findRowIndexById(getGroupedRows(state.config), id);
      }
    } else {
      const res = removeWidget(state.config, currentRow.side, id);
      if (res.ok) {
        state.config = res.config;
        persistConfig(state, t);
        state.mainCursor = findRowIndexById(getGroupedRows(state.config), id);
      }
    }
    return true;
  }

  if (kName === "left" || kName === "right" || lower === "x") {
    if (!currentRow) return false;
    const id = currentRow.id;
    let targetSide = "left";
    if (kName === "left") {
      targetSide = "left";
    } else if (kName === "right") {
      targetSide = "right";
    } else {
      targetSide = currentRow.side === "left" ? "right" : "left";
    }
    if (currentRow.side === targetSide) return false;
    const res = addWidget(state.config, targetSide, id);
    if (res.ok) {
      state.config = res.config;
      persistConfig(state, t);
      state.mainCursor = findRowIndexById(getGroupedRows(state.config), id);
    }
    return true;
  }

  if (str === "[" || str === "K" || (kName === "up" && key?.shift)) {
    if (!currentRow || currentRow.side === "available") return false;
    const targetIdx = Math.max(0, currentRow.sideIndex - 1);
    if (targetIdx === currentRow.sideIndex) return false;
    const res = moveWidget(state.config, currentRow.side, currentRow.id, targetIdx);
    if (res.ok) {
      state.config = res.config;
      persistConfig(state, t);
      state.mainCursor = findRowIndexById(getGroupedRows(state.config), currentRow.id);
    }
    return true;
  }

  if (str === "]" || str === "J" || (kName === "down" && key?.shift)) {
    if (!currentRow || currentRow.side === "available") return false;
    const arr = currentRow.side === "left" ? state.config.left : state.config.right;
    const targetIdx = Math.min(arr.length - 1, currentRow.sideIndex + 1);
    if (targetIdx === currentRow.sideIndex) return false;
    const res = moveWidget(state.config, currentRow.side, currentRow.id, targetIdx);
    if (res.ok) {
      state.config = res.config;
      persistConfig(state, t);
      state.mainCursor = findRowIndexById(getGroupedRows(state.config), currentRow.id);
    }
    return true;
  }

  if (kName === "return" || kName === "enter") {
    if (!currentRow) return false;
    state.selectedWidgetId = currentRow.id;
    state.optsCursor = 0;
    state.editingString = null;
    state.view = "options";
    return true;
  }

  if (lower === "p") {
    state.view = "presets";
    return true;
  }

  if (lower === "t") {
    const idx = COLOR_SCHEMES.indexOf(state.config.colorScheme);
    const nextScheme = COLOR_SCHEMES[(Math.max(0, idx) + 1) % COLOR_SCHEMES.length];
    state.config.colorScheme = nextScheme;
    persistConfig(state, t);
    return true;
  }

  if (lower === "v") {
    state.scenarioIndex = (state.scenarioIndex + 1) % SCENARIOS.length;
    return true;
  }

  if (lower === "g") {
    state.locale = state.locale === "zh" ? "en" : "zh";
    state.config.locale = state.locale;
    const nextT = createTranslator(state.locale);
    persistConfig(state, nextT, nextT("tui.langSwitched"));
    return true;
  }

  if (lower === "l") {
    const cur = state.config.statusLocale || "en";
    const idx = STATUS_LOCALES.indexOf(cur);
    const nextVal = STATUS_LOCALES[(Math.max(0, idx) + 1) % STATUS_LOCALES.length];
    state.config.statusLocale = nextVal;
    persistConfig(state, t, t("tui.statusLocaleSwitched", { value: nextVal }));
    return true;
  }

  if (lower === "u") {
    restoreSnapshot(state, t);
    return true;
  }

  if (lower === "i") {
    const info = inspectInstallation({
      configPath: state.configPath,
      settingsPath: state.settingsPath,
      configJsonPath: state.configJsonPath,
    });
    state.installInfo = info;
    if (info.settingsStatus === "external") {
      state.view = "externalConfirm";
      return true;
    }
    installPlugin({
      force: true,
      configPath: state.configPath,
      settingsPath: state.settingsPath,
      configJsonPath: state.configJsonPath,
    });
    state.installInfo = inspectInstallation({
      configPath: state.configPath,
      settingsPath: state.settingsPath,
      configJsonPath: state.configJsonPath,
    });
    state.toast = t("tui.installed");
    return true;
  }

  return false;
}

function buildDisplayEntries(rows, t) {
  const entries = [];
  let lastSide = "";
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.side !== lastSide) {
      lastSide = r.side;
      const heading =
        r.side === "left"
          ? t("tui.leftSection")
          : r.side === "right"
          ? t("tui.rightSection")
          : t("tui.availableSection");
      entries.push({ kind: "header", label: heading });
    }
    entries.push({ kind: "widget", row: r, rowIndex: i });
  }
  return entries;
}

function renderFrame(state, cols = 100, rowsCount = 28) {
  const width = Math.max(54, cols);
  const height = Math.max(18, rowsCount);
  const t = createTranslator(state.locale);
  const lines = [];

  // 1. Header line
  const langTag = state.locale === "zh" ? "[中文]" : "[EN]";
  const titleBadge = `\x1b[1m${t("tui.title")}\x1b[0m \x1b[36m${langTag}\x1b[0m`;
  const toastStr = state.toast ? `\x1b[32m${state.toast}\x1b[0m` : "";
  lines.push(padRightAnsi(`${titleBadge}${toastStr ? "  " + toastStr : ""}`, width));

  // Optional install warning banner
  const needsInstallBanner =
    state.installInfo?.settingsStatus === "missing" || state.installInfo?.settingsStatus === "disabled";
  if (needsInstallBanner) {
    const msg =
      state.installInfo.settingsStatus === "disabled"
        ? t("tui.disabledWarn")
        : t("tui.notInstalledWarn");
    lines.push(padRightAnsi(`\x1b[33m⚠ ${msg}\x1b[0m`, width));
  }

  // 2. Pinned Live Preview Box
  const innerCols = Math.max(20, width - 4);
  const scenario = SCENARIOS[state.scenarioIndex % SCENARIOS.length];
  const simWidth = scenario === "narrow" ? Math.min(48, innerCols) : innerCols;
  const { payload: samplePayload } = resolvePreviewPayload(scenario, simWidth, {
    settings: state.settings,
    snapshotPath: state.snapshotPath,
    preferLive: scenario === "normal",
  });
  const renderedStatus = renderStatusLine(samplePayload, {
    config: state.config,
    settings: state.settings,
  });

  const scenarioLabel = t(`scenario.${scenario}`, { width: simWidth });
  const metaLine = `\x1b[2m${t("tui.schemeLabel")}: ${state.config.colorScheme}   |   ${t("tui.statusLocaleLabel")}: ${state.config.statusLocale || "en"}   |   ${t("tui.scenarioLabel")}: ${scenarioLabel}\x1b[0m`;

  lines.push(boxTop(t("tui.previewHeading"), width));
  lines.push(boxLine(renderedStatus, width));
  lines.push(boxLine(metaLine, width));
  lines.push(boxBottom(width));

  // Footer lines count (2 lines for key legend)
  const footerLines = [];
  if (state.view === "options") {
    if (state.editingString) {
      footerLines.push(padRightAnsi(`\x1b[36m${t("tui.editingHint")}\x1b[0m`, width));
    } else {
      footerLines.push(padRightAnsi(`\x1b[2m${t("tui.keysOpts")}\x1b[0m`, width));
    }
  } else if (state.view === "presets") {
    footerLines.push(padRightAnsi(`\x1b[2m${t("tui.keysPreset")}\x1b[0m`, width));
  } else if (state.view === "externalConfirm") {
    footerLines.push(padRightAnsi(`\x1b[2m${t("tui.keysExternal")}\x1b[0m`, width));
  } else {
    const keyHint = needsInstallBanner
      ? `${t("tui.keysMain")} · ${t("tui.keysMainInstall")}`
      : t("tui.keysMain");
    footerLines.push(padRightAnsi(`\x1b[2m${keyHint}\x1b[0m`, width));
  }

  const bodyBudget = Math.max(6, height - lines.length - footerLines.length);

  // 3. Body View
  const bodyLines = [];
  if (state.view === "options") {
    const wId = state.selectedWidgetId;
    const opts = getWidgetOptionsWithMeta(wId);
    const { payload: optsGalleryPayload } = resolvePreviewPayload("gallery", undefined, {
      settings: state.settings,
      snapshotPath: state.snapshotPath,
      preferLive: false,
    });
    const optSample = renderSingleWidgetSample(wId, state.config, state.settings, optsGalleryPayload) || "";

    bodyLines.push(boxTop(t("tui.optsHeading", { widget: `${wId} (${t(`widget.${wId}.name`)})` }), width));
    appendWidgetSummaryLines(bodyLines, wId, optSample, width, t);
    bodyLines.push(boxDivider("", width));

    const maxOptRows = Math.max(2, bodyBudget - 5);
    if (opts.length === 0) {
      bodyLines.push(boxLine(t("tui.noOptions"), width));
    } else {
      let maxLabelWidth = 0;
      let maxValWidth = 8;
      for (const opt of opts) {
        const label = `${opt.key} (${t(`opt.${opt.key}`)})`;
        const lw = visibleWidth(label);
        if (lw > maxLabelWidth) maxLabelWidth = lw;
        const rawVal =
          state.config?.widgets?.[wId]?.[opt.key] !== undefined
            ? state.config.widgets[wId][opt.key]
            : opt.default;
        let vw;
        if (state.editingString && state.editingString.optionKey === opt.key) {
          vw = visibleWidth(` ${state.editingString.value}_ `);
        } else if (opt.type === "boolean") {
          vw = 7;
        } else {
          vw = visibleWidth(JSON.stringify(rawVal));
        }
        if (vw > maxValWidth) maxValWidth = vw;
      }
      const valReserve = Math.min(Math.max(12, maxValWidth), Math.max(12, Math.floor(innerCols * 0.35)));
      const maxAvailableLabel = Math.max(16, innerCols - 4 - valReserve);
      const labelColWidth = Math.min(maxLabelWidth, maxAvailableLabel);

      const start = Math.max(0, Math.min(state.optsCursor - Math.floor(maxOptRows / 2), Math.max(0, opts.length - maxOptRows)));
      const slice = opts.slice(start, start + maxOptRows);
      for (let i = 0; i < slice.length; i++) {
        const opt = slice[i];
        const actualIdx = start + i;
        const selected = actualIdx === state.optsCursor;
        const pointer = selected ? "\x1b[36m▸\x1b[0m" : " ";
        const rawVal =
          state.config?.widgets?.[wId]?.[opt.key] !== undefined
            ? state.config.widgets[wId][opt.key]
            : opt.default;
        let valText = JSON.stringify(rawVal);
        if (state.editingString && state.editingString.optionKey === opt.key) {
          valText = `\x1b[43;30m ${state.editingString.value}_ \x1b[0m`;
        } else if (opt.type === "boolean") {
          valText = rawVal ? "\x1b[32m[true]\x1b[0m" : "\x1b[31m[false]\x1b[0m";
        } else {
          valText = `\x1b[33m${valText}\x1b[0m`;
        }
        const optLabel = `${opt.key} (${t(`opt.${opt.key}`)})`;
        const leftPart = `${pointer} ${padRightAnsi(optLabel, labelColWidth)}  ${valText}`;
        bodyLines.push(boxLine(leftPart, width));
      }
    }
    while (bodyLines.length < bodyBudget - 1) {
      bodyLines.push(boxLine("", width));
    }
    bodyLines.push(boxBottom(width));
  } else if (state.view === "presets") {
    bodyLines.push(boxTop(t("tui.presetHeading"), width));
    const innerRowsBudget = Math.max(2, bodyBudget - 2);
    const showHint = innerRowsBudget >= 5;
    const showHintDivider = showHint && innerRowsBudget >= 12;
    if (showHint) {
      bodyLines.push(boxLine(`\x1b[2m${t("tui.presetHint")}\x1b[0m`, width));
      if (showHintDivider) {
        bodyLines.push(boxDivider("", width));
      }
    }
    const usedHeaderRows = (showHint ? 1 : 0) + (showHintDivider ? 1 : 0);
    const maxVisiblePresets = Math.max(1, Math.floor((innerRowsBudget - usedHeaderRows) / 2));
    const clampedCursor = clamp(state.presetCursor, 0, Math.max(0, PRESET_NAMES.length - 1));
    state.presetCursor = clampedCursor;
    const start = clamp(
      clampedCursor - Math.floor(maxVisiblePresets / 2),
      0,
      Math.max(0, PRESET_NAMES.length - maxVisiblePresets)
    );
    const end = Math.min(PRESET_NAMES.length, start + maxVisiblePresets);
    const { payload: galleryPayload } = resolvePreviewPayload("normal", Math.max(20, innerCols - 4), {
      settings: state.settings,
      snapshotPath: state.snapshotPath,
      preferLive: false,
    });
    for (let i = start; i < end; i++) {
      const pName = PRESET_NAMES[i];
      const selected = i === clampedCursor;
      const pointer = selected ? "\x1b[36m▸\x1b[0m" : " ";
      const title = `${pointer} \x1b[1m${pName}\x1b[0m — ${t(`preset.${pName}.name`)}: ${t(`preset.${pName}.desc`)}`;
      bodyLines.push(boxLine(title, width));
      const pCfg = applyPreset(state.config, pName);
      const pRender = renderStatusLine(galleryPayload, { config: pCfg, settings: state.settings });
      bodyLines.push(boxLine(`    ${pRender}`, width));
    }
    while (bodyLines.length < bodyBudget - 1) {
      bodyLines.push(boxLine("", width));
    }
    bodyLines.push(boxBottom(width));
  } else if (state.view === "externalConfirm") {
    bodyLines.push(boxTop(t("tui.externalHeading"), width));
    bodyLines.push(boxLine("", width));
    bodyLines.push(boxLine(`\x1b[33m${t("tui.externalBody")}\x1b[0m`, width));
    bodyLines.push(boxLine(`  \x1b[36m${state.installInfo?.currentCommand || ""}\x1b[0m`, width));
    bodyLines.push(boxLine("", width));
    bodyLines.push(boxLine(t("tui.externalConfirm"), width));
    while (bodyLines.length < bodyBudget - 1) {
      bodyLines.push(boxLine("", width));
    }
    bodyLines.push(boxBottom(width));
  } else {
    // Main view
    const rows = getGroupedRows(state.config);
    const currentRow = rows[clamp(state.mainCursor, 0, Math.max(0, rows.length - 1))] || null;
    const showDetail = Boolean(currentRow) && bodyBudget >= 9;
    const detailHeight = showDetail ? 3 : 0;
    const entries = buildDisplayEntries(rows, t);
    const selectedEntryIdx = Math.max(
      0,
      entries.findIndex((e) => e.kind === "widget" && e.rowIndex === state.mainCursor)
    );

    const listRowsBudget = Math.max(3, bodyBudget - 2 - detailHeight);
    if (selectedEntryIdx < state.mainScroll + 1) {
      state.mainScroll = Math.max(0, selectedEntryIdx - 1);
    } else if (selectedEntryIdx >= state.mainScroll + listRowsBudget) {
      state.mainScroll = Math.max(0, selectedEntryIdx - listRowsBudget + 1);
    }
    state.mainScroll = clamp(state.mainScroll, 0, Math.max(0, entries.length - listRowsBudget));

    const visibleEntries = entries.slice(state.mainScroll, state.mainScroll + listRowsBudget);
    const { payload: galleryPayload } = resolvePreviewPayload("gallery", undefined, {
      settings: state.settings,
      snapshotPath: state.snapshotPath,
      preferLive: false,
    });

    const rawSampleById = new Map();
    let maxSampleVisible = 0;
    for (const r of rows) {
      const rawSample = renderSingleWidgetSample(r.id, state.config, state.settings, galleryPayload) || "";
      rawSampleById.set(r.id, rawSample);
      const w = visibleWidth(rawSample || "--");
      if (w > maxSampleVisible) maxSampleVisible = w;
    }

    const idWidth = 15;
    const remCols = Math.max(16, innerCols - 6 - idWidth - 1);
    const nameReserve = innerCols < 64 ? 0 : Math.min(18, Math.max(12, Math.floor(remCols * 0.28)));
    const maxAvailableSample = nameReserve > 0 ? Math.max(18, remCols - nameReserve - 1) : remCols;
    // +1 inside sampleWidth plus the separator space before descCol keeps 2 spaces after the longest sample.
    const sampleWidth = Math.min(Math.max(20, maxSampleVisible + 1), maxAvailableSample);

    bodyLines.push(boxTop(`${t("tui.leftSection")} / ${t("tui.rightSection")}`, width));
    for (const entry of visibleEntries) {
      if (entry.kind === "header") {
        bodyLines.push(boxLine(`\x1b[1;34m── ${entry.label} ──\x1b[0m`, width));
        continue;
      }
      const r = entry.row;
      const isSelected = entry.rowIndex === state.mainCursor;
      const pointer = isSelected ? "\x1b[36m▸\x1b[0m" : " ";
      const badge =
        r.side === "left"
          ? "\x1b[32m[L]\x1b[0m"
          : r.side === "right"
          ? "\x1b[35m[R]\x1b[0m"
          : "\x1b[2m[ ]\x1b[0m";
      const idCol = padRightAnsi(r.id, idWidth);
      const sample = rawSampleById.get(r.id) || `\x1b[2m--\x1b[0m`;
      const sampleCol = padRightAnsi(sample, sampleWidth);
      if (nameReserve > 0) {
        const descCol = padRightAnsi(`\x1b[2m${t(`widget.${r.id}.name`)}\x1b[0m`, nameReserve);
        bodyLines.push(boxLine(`${pointer} ${badge} ${idCol} ${sampleCol} ${descCol}`, width));
      } else {
        bodyLines.push(boxLine(`${pointer} ${badge} ${idCol} ${sampleCol}`, width));
      }
    }
    while (bodyLines.length < bodyBudget - 1 - detailHeight) {
      bodyLines.push(boxLine("", width));
    }
    if (showDetail) {
      bodyLines.push(boxDivider(t("tui.detailHeading", { widget: `${currentRow.id} (${t(`widget.${currentRow.id}.name`)})` }), width));
      appendWidgetSummaryLines(bodyLines, currentRow.id, rawSampleById.get(currentRow.id), width, t);
    }
    bodyLines.push(boxBottom(width));
  }

  return [...lines, ...bodyLines.slice(0, bodyBudget), ...footerLines].slice(0, height);
}

function runTui(options = {}) {
  const stdin = process.stdin;
  const stdout = process.stdout;
  const preliminaryLocale = resolveLocale({
    cliLang: options.cliLang,
    configLocale: loadConfig(options.configPath).locale,
  });
  const prelimT = createTranslator(preliminaryLocale);

  if (!stdin.isTTY || !stdout.isTTY) {
    process.stderr.write(`${prelimT("tui.nonTty")}\n`);
    return 1;
  }

  const state = createState(options);
  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();

  let cleanedUp = false;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      stdin.setRawMode(false);
    } catch {
      // ignore
    }
    stdin.pause();
    stdout.write("\x1b[?25h\x1b[?1049l");
  }

  function draw() {
    const cols = stdout.columns || 100;
    const rows = stdout.rows || 28;
    const frame = renderFrame(state, cols, rows);
    stdout.write("\x1b[H\x1b[2J" + frame.join("\n"));
  }

  return new Promise((resolve) => {
    const onKeypress = (str, key) => {
      try {
        handleKey(state, str, key);
      } catch (err) {
        state.toast = err.message || String(err);
      }
      if (state.shouldExit) {
        stdin.removeListener("keypress", onKeypress);
        stdout.removeListener("resize", draw);
        process.removeListener("SIGINT", onSignal);
        process.removeListener("SIGTERM", onSignal);
        cleanup();
        resolve(0);
        return;
      }
      draw();
    };

    const onSignal = () => {
      stdin.removeListener("keypress", onKeypress);
      stdout.removeListener("resize", draw);
      cleanup();
      resolve(0);
    };

    stdout.write("\x1b[?1049h\x1b[?25l");
    stdin.on("keypress", onKeypress);
    stdout.on("resize", draw);
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    draw();
  });
}

module.exports = {
  SCENARIOS,
  padRightAnsi,
  boxLine,
  boxDivider,
  createState,
  getGroupedRows,
  handleKey,
  renderFrame,
  runTui,
};
