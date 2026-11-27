#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const PLUGIN_DIR = path.resolve(__dirname, "..");
const RENDERER_PATH = path.join(PLUGIN_DIR, "scripts", "statusline-renderer.js");
const MANAGE_PATH = path.join(PLUGIN_DIR, "scripts", "manage-statusline.js");
const SCHEMA_PATH = path.join(PLUGIN_DIR, "schemas", "statusline.schema.json");
const PLUGIN_MANIFEST_PATH = path.join(PLUGIN_DIR, "plugin.json");

const renderer = require(RENDERER_PATH);
const meta = require(path.join(PLUGIN_DIR, "scripts", "statusline-meta.js"));
const tui = require(path.join(PLUGIN_DIR, "scripts", "statusline-tui.js"));
const launcher = require(path.join(PLUGIN_DIR, "scripts", "statusline-launcher.js"));
const manage = require(MANAGE_PATH);

function runCli(args, extraEnv = {}) {
  return spawnSync(process.execPath, [MANAGE_PATH, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

// 1. Plugin manifest, Schema JSON & default config validation
const manifest = JSON.parse(fs.readFileSync(PLUGIN_MANIFEST_PATH, "utf8"));
assert.strictEqual(manifest.name, "custom-statusline");
assert.match(manifest.version, /^\d+\.\d+\.\d+/);
assert.strictEqual(manifest.license, "MIT");
assert.strictEqual(typeof manifest.repository, "string");
assert.ok(manifest.repository.startsWith("https://"));
assert.strictEqual(fs.existsSync(path.join(PLUGIN_DIR, manifest.logo)), true);
assert.strictEqual(fs.existsSync(path.join(PLUGIN_DIR, "skills", "statusline-config", "SKILL.md")), true);

const schemaObj = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
assert.strictEqual(schemaObj.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.strictEqual(schemaObj.$defs.widgetId.enum.length, 19);
assert.deepStrictEqual(schemaObj.properties.statusLocale.enum, ["en", "zh", "auto"]);
assert.deepStrictEqual(schemaObj.properties.widgets.properties.context.properties.format.enum, [
  "percent",
  "bar",
  "bar_percent",
  "tokens",
]);
assert.deepStrictEqual(schemaObj.properties.widgets.properties.quota.properties.bucket.enum, meta.ALL_QUOTA_BUCKETS);
assert.strictEqual(meta.ALL_QUOTA_BUCKETS.length, 6);
assert.deepStrictEqual(schemaObj.properties.widgets.properties.quota.properties.showReset.enum, [
  "none",
  "5h",
  "weekly",
  "both",
]);

const defaultValidation = meta.validateConfig(meta.withSchemaFirst(renderer.DEFAULT_CONFIG));
assert.deepStrictEqual(defaultValidation, { ok: true, errors: [], warnings: [] });

// 2. All 5 presets pass validateConfig, reset widget options, preserve appearance/locale, and guard alert visibility
assert.deepStrictEqual(meta.PRESET_NAMES, ["official", "minimal", "balanced", "hud", "developer"]);
for (const pName of meta.PRESET_NAMES) {
  const cfg = meta.withSchemaFirst(meta.applyPreset(renderer.DEFAULT_CONFIG, pName));
  const v = meta.validateConfig(cfg);
  assert.deepStrictEqual(v, { ok: true, errors: [], warnings: [] }, `Preset ${pName} failed validation`);
}
const customPrePreset = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  locale: "zh",
  colorScheme: "tokyo night",
  separator: " | ",
  leftSeparator: " / ",
  widgets: { git: { maxLength: 12 }, context: { prefix: "mem " } },
});
const afterBalanced = meta.applyPreset(customPrePreset, "balanced");
assert.strictEqual(afterBalanced.locale, "zh");
assert.strictEqual(afterBalanced.colorScheme, "tokyo night");
assert.strictEqual(afterBalanced.separator, " | ");
assert.strictEqual(afterBalanced.leftSeparator, " / ");
assert.strictEqual(afterBalanced.widgets.git.maxLength, 28);
assert.strictEqual(afterBalanced.widgets.context.prefix, "ctx ");
assert.strictEqual(afterBalanced.widgets.quota.bucket, "gemini-5h+weekly");

assert.strictEqual(meta.buildSamplePayload("normal").terminal_width, 120);
assert.strictEqual(meta.buildSamplePayload("narrow").terminal_width, 48);

// detectExternalTerminalColumns & resolvePreviewWidth unit checks
const mockKittyLs = JSON.stringify([
  {
    is_focused: true,
    tabs: [
      {
        is_focused: true,
        windows: [
          { id: 10, columns: 70, is_focused: false },
          { id: 12, columns: 162, is_focused: true },
        ],
      },
    ],
  },
]);
assert.strictEqual(
  manage.detectExternalTerminalColumns(
    { KITTY_LISTEN_ON: "unix:/tmp/kitty-1", KITTY_WINDOW_ID: "10" },
    () => mockKittyLs
  ),
  70
);
assert.strictEqual(
  manage.detectExternalTerminalColumns(
    { KITTY_LISTEN_ON: "unix:/tmp/kitty-1" },
    () => mockKittyLs
  ),
  162
);
assert.strictEqual(
  manage.detectExternalTerminalColumns(
    { TMUX: "/tmp/tmux-1000/default,1,0", TMUX_PANE: "%3" },
    (_cmd, args) => {
      assert.ok(args.includes("-t") && args.includes("%3"));
      return "94\n";
    }
  ),
  94
);
assert.strictEqual(
  manage.detectExternalTerminalColumns(
    { WEZTERM_PANE: "7" },
    () => JSON.stringify([{ pane_id: 7, is_active: true, size: { cols: 112 } }])
  ),
  112
);
assert.strictEqual(manage.detectExternalTerminalColumns({}), null);
assert.strictEqual(
  manage.detectExternalTerminalColumns(
    { KITTY_LISTEN_ON: "unix:/tmp/kitty-bad" },
    () => {
      throw new Error("socket unavailable");
    }
  ),
  null
);

assert.strictEqual(
  manage.resolvePreviewWidth({}, 4, 120, {
    env: { TERM: "dumb" },
    stdout: { isTTY: true, columns: 80 },
    detectExternalCols: () => 162,
  }),
  152
);
assert.strictEqual(
  manage.resolvePreviewWidth({}, 4, 120, {
    env: { TERM: "dumb" },
    stdout: { isTTY: true, columns: 80 },
    detectExternalCols: () => 70,
  }),
  60
);
assert.strictEqual(
  manage.resolvePreviewWidth({}, 4, 120, {
    env: { TERM: "dumb" },
    stdout: { isTTY: true, columns: 80 },
    detectExternalCols: () => null,
  }),
  120
);
assert.strictEqual(
  manage.resolvePreviewWidth({}, 4, 120, {
    env: { TERM: "xterm-kitty" },
    stdout: { isTTY: true, columns: 160 },
    detectExternalCols: () => {
      throw new Error("should not probe external terminal on real TTY");
    },
  }),
  156
);
assert.strictEqual(
  manage.resolvePreviewWidth({ width: "90" }, 4, 120, {
    env: { TERM: "dumb" },
    stdout: { isTTY: true, columns: 80 },
  }),
  90
);

for (const [pName, width] of [
  ["minimal", 96],
  ["balanced", 96],
  ["hud", 96],
  ["minimal", 120],
  ["balanced", 120],
  ["hud", 120],
  ["developer", 120],
]) {
  const cfg = meta.applyPreset(renderer.DEFAULT_CONFIG, pName);
  const alertPlain = renderer.stripAnsi(renderer.renderStatusLine(meta.buildSamplePayload("alert", width), { config: cfg, settings: {} }));
  assert.ok(alertPlain.includes("confirm!"), `Preset ${pName} truncated confirm! at width ${width}: ${alertPlain}`);
}

// 3. Renderer tests: all 19 widgets, all 6 quota buckets, confirm guard, CJK truncation
const fullSample = meta.buildSamplePayload("gallery", 200);
assert.strictEqual(fullSample.conversation_id, "12345678-1234-4123-8123-123456789abc");
for (const wId of meta.ALL_WIDGET_IDS) {
  const sample = meta.renderSingleWidgetSample(wId, renderer.DEFAULT_CONFIG, { colorScheme: "light" }, fullSample);
  assert.ok(sample && renderer.stripAnsi(sample).length > 0, `Widget ${wId} returned empty sample`);
}
for (const bucket of meta.ALL_QUOTA_BUCKETS) {
  const cfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
    left: ["quota"],
    right: [],
    widgets: { quota: { bucket } },
  });
  const plain = renderer.stripAnsi(renderer.renderStatusLine(fullSample, { config: cfg, settings: {} }));
  assert.ok(plain.startsWith("quota "), `Bucket ${bucket} failed: ${plain}`);
}

// Quota bar & bar_percent format tests (single, paired, used metric, missing data, showReset, compact fallback)
const qSingleBarCfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  left: ["quota"],
  right: [],
  widgets: { quota: { bucket: "gemini-5h", format: "bar", barWidth: 6 } },
});
const qSingleBarPlain = renderer.stripAnsi(renderer.renderStatusLine(meta.buildSamplePayload("normal", 120), { config: qSingleBarCfg, settings: {} }));
assert.strictEqual(qSingleBarPlain, "quota █████░");

const qPairedBarCfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  left: ["quota"],
  right: [],
  widgets: { quota: { bucket: "gemini-5h+weekly", format: "bar", barWidth: 5 } },
});
const qPairedBarPlain = renderer.stripAnsi(renderer.renderStatusLine(meta.buildSamplePayload("normal", 120), { config: qPairedBarCfg, settings: {} }));
assert.strictEqual(qPairedBarPlain, "quota ████░ | ███░░");

const qSingleBarPctCfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  left: ["quota"],
  right: [],
  widgets: { quota: { bucket: "gemini-5h", format: "bar_percent", barWidth: 6 } },
});
const qSingleBarPctPlain = renderer.stripAnsi(renderer.renderStatusLine(meta.buildSamplePayload("normal", 120), { config: qSingleBarPctCfg, settings: {} }));
assert.strictEqual(qSingleBarPctPlain, "quota █████░ 82%");

const qPairedBarPctCfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  left: ["quota"],
  right: [],
  widgets: { quota: { bucket: "gemini-5h+weekly", format: "bar_percent", barWidth: 5 } },
});
const qPairedBarPctPlain = renderer.stripAnsi(renderer.renderStatusLine(meta.buildSamplePayload("normal", 120), { config: qPairedBarPctCfg, settings: {} }));
assert.strictEqual(qPairedBarPctPlain, "quota ████░ 82% | ███░░ 64%");

// Tight terminal width triggers quota compact fallback (bar_percent -> percent)
const qCompactTrigger = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  left: ["cwd"],
  right: ["quota"],
  widgets: { quota: { bucket: "gemini-5h+weekly", format: "bar_percent", barWidth: 5 } },
});
const qCompactOut = renderer.stripAnsi(renderer.renderStatusLine(meta.buildSamplePayload("normal", 26), { config: qCompactTrigger, settings: {} }));
assert.ok(qCompactOut.includes("quota 82%|64%"), `Quota compact fallback failed: ${qCompactOut}`);

// Single bar compacts to percent when right side overflows
const qSingleCompactTrigger = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  left: ["cwd"],
  right: ["quota"],
  widgets: { quota: { bucket: "gemini-5h", format: "bar", barWidth: 6 } },
});
const qSingleCompactOut = renderer.stripAnsi(renderer.renderStatusLine(meta.buildSamplePayload("normal", 20), { config: qSingleCompactTrigger, settings: {} }));
assert.ok(qSingleCompactOut.includes("quota 82%"), `Single quota bar compact fallback failed: ${qSingleCompactOut}`);

// metric: "used" with bar_percent
const qUsedBarPctCfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  left: ["quota"],
  right: [],
  widgets: { quota: { bucket: "gemini-5h", format: "bar_percent", metric: "used", barWidth: 6 } },
});
const qUsedBarPctPlain = renderer.stripAnsi(renderer.renderStatusLine(meta.buildSamplePayload("normal", 120), { config: qUsedBarPctCfg, settings: {} }));
assert.strictEqual(qUsedBarPctPlain, "quota █░░░░░ 18%");

// Missing quota bucket stays "--%" (no empty bar)
const noQuotaPayload = { ...meta.buildSamplePayload("normal", 120), quota: {} };
for (const fmt of ["bar", "bar_percent"]) {
  const missingQCfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
    left: ["quota"],
    right: [],
    widgets: { quota: { bucket: "gemini-5h", format: fmt, barWidth: 6 } },
  });
  assert.strictEqual(renderer.stripAnsi(renderer.renderStatusLine(noQuotaPayload, { config: missingQCfg, settings: {} })), "quota --%");
}

// Exact 6 quota buckets (no weekly+5h legacy orderings) & strict rejection of legacy values
assert.deepStrictEqual(meta.ALL_QUOTA_BUCKETS, [
  "gemini-5h",
  "gemini-weekly",
  "3p-5h",
  "3p-weekly",
  "gemini-5h+weekly",
  "3p-5h+weekly",
]);
assert.strictEqual(
  meta.validateConfig({ widgets: { quota: { bucket: "gemini-weekly+5h" } } }).ok,
  false
);
assert.strictEqual(
  meta.validateConfig({ widgets: { quota: { bucket: "3p-weekly+5h" } } }).ok,
  false
);
assert.strictEqual(
  meta.validateConfig({ widgets: { quota: { showReset: true } } }).ok,
  false
);
assert.strictEqual(
  meta.validateConfig({ widgets: { quota: { showReset: false } } }).ok,
  false
);
assert.strictEqual(meta.validateConfig({ statusLocale: "fr" }).ok, false);

// showReset 4-enum tests ("none" | "5h" | "weekly" | "both") across single & paired buckets and bar/percent formats
const normal120 = meta.buildSamplePayload("normal", 120);
const pairedResetExpected = {
  none: "quota 82%|64%",
  "5h": "quota 82% (4h12m)|64%",
  weekly: "quota 82%|64% (5d)",
  both: "quota 82% (4h12m)|64% (5d)",
};
for (const [mode, exp] of Object.entries(pairedResetExpected)) {
  const cfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
    left: ["quota"],
    right: [],
    widgets: { quota: { bucket: "gemini-5h+weekly", format: "percent", showReset: mode } },
  });
  assert.strictEqual(renderer.stripAnsi(renderer.renderStatusLine(normal120, { config: cfg, settings: {} })), exp);
}

const pairedBarResetCfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  left: ["quota"],
  right: [],
  widgets: { quota: { bucket: "3p-5h+weekly", format: "bar_percent", barWidth: 5, showReset: "weekly" } },
});
assert.strictEqual(
  renderer.stripAnsi(renderer.renderStatusLine(normal120, { config: pairedBarResetCfg, settings: {} })),
  "quota █████ 95% | ████░ 88% (6d)"
);

const qResetBar5hCfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  left: ["quota"],
  right: [],
  widgets: { quota: { bucket: "gemini-5h", format: "bar", barWidth: 6, showReset: "5h" } },
});
assert.strictEqual(renderer.stripAnsi(renderer.renderStatusLine(normal120, { config: qResetBar5hCfg, settings: {} })), "quota █████░ (4h12m)");

const qResetSingleWeeklyMismatchCfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  left: ["quota"],
  right: [],
  widgets: { quota: { bucket: "gemini-5h", format: "bar", barWidth: 6, showReset: "weekly" } },
});
assert.strictEqual(
  renderer.stripAnsi(renderer.renderStatusLine(normal120, { config: qResetSingleWeeklyMismatchCfg, settings: {} })),
  "quota █████░"
);

// context.format ("percent" | "bar" | "bar_percent" | "tokens")
const ctxPureBarCfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  left: [],
  right: ["context"],
  widgets: { context: { format: "bar", barWidth: 8 } },
});
assert.strictEqual(
  renderer.stripAnsi(renderer.renderStatusLine(normal120, { config: ctxPureBarCfg, settings: {} })).trim(),
  "ctx █░░░░░░░"
);
const ctxPureBarCompactCfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  left: ["cwd", "git"],
  right: ["context", "model"],
  widgets: { context: { format: "bar", barWidth: 8 } },
});
const ctxPureBarNarrow = renderer.stripAnsi(
  renderer.renderStatusLine(meta.buildSamplePayload("normal", 42), { config: ctxPureBarCompactCfg, settings: {} })
);
assert.ok(ctxPureBarNarrow.includes("ctx 14%"), `Expected context pure bar compact fallback: ${ctxPureBarNarrow}`);

const ctxBarPctCfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  left: [],
  right: ["context"],
  widgets: { context: { format: "bar_percent", barWidth: 8 } },
});
assert.strictEqual(
  renderer.stripAnsi(renderer.renderStatusLine(normal120, { config: ctxBarPctCfg, settings: {} })).trim(),
  "ctx █░░░░░░░ 14%"
);

// statusLocale ("en" | "zh" | "auto") & preservation on applyPreset
const zhStatusCfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  statusLocale: "zh",
  left: ["vim", "shortcuts", "confirm", "queued"],
  right: ["context", "context_extra", "quota", "artifacts", "sandbox", "state", "tasks", "subagents", "mode"],
  widgets: { quota: { bucket: "gemini-5h+weekly", format: "percent", showReset: "both" } },
});
const zhAlertOut = renderer.stripAnsi(
  renderer.renderStatusLine(meta.buildSamplePayload("gallery", 220), { config: zhStatusCfg, settings: {} })
);
for (const expectedTok of [
  "-- 插入 -- ? 快捷键",
  "待确认!",
  "2 排队",
  "上下文 88%",
  "缓存 72% >200k",
  "配额 8% (30分)|24% (2天)",
  "3 产物",
  "沙箱开",
  "调用工具",
  "2 任务 · /tasks",
  "1 子代理",
  "自动",
]) {
  assert.ok(zhAlertOut.includes(expectedTok), `Missing ZH status line token '${expectedTok}' in: ${zhAlertOut}`);
}

// User-customized prefix/text MUST NOT be overwritten when statusLocale === "zh"
const zhCustomOverrideCfg = renderer.mergeConfig(renderer.DEFAULT_CONFIG, {
  statusLocale: "zh",
  left: ["shortcuts", "confirm"],
  right: ["context", "context_extra", "quota"],
  widgets: {
    shortcuts: { text: "help?" },
    confirm: { text: "ACT!" },
    context: { prefix: "CTX ", format: "percent" },
    context_extra: { cachePrefix: "C:" },
    quota: { prefix: "Q:", bucket: "gemini-5h" },
  },
});
const zhCustomOut = renderer.stripAnsi(
  renderer.renderStatusLine(meta.buildSamplePayload("alert", 200), { config: zhCustomOverrideCfg, settings: {} })
);
for (const expectedCustom of ["help?", "ACT!", "CTX 88%", "C:72%", "Q:8%"]) {
  assert.ok(zhCustomOut.includes(expectedCustom), `Custom override '${expectedCustom}' clobbered in zh mode: ${zhCustomOut}`);
}

const zhPresetPreserved = meta.applyPreset(zhStatusCfg, "balanced");
assert.strictEqual(zhPresetPreserved.statusLocale, "zh");

const oldLcAll = process.env.LC_ALL;
try {
  process.env.LC_ALL = "zh_CN.UTF-8";
  assert.strictEqual(renderer.resolveStatusLocale({ statusLocale: "auto" }), "zh");
  process.env.LC_ALL = "en_US.UTF-8";
  assert.strictEqual(renderer.resolveStatusLocale({ statusLocale: "auto" }), "en");
} finally {
  if (oldLcAll === undefined) delete process.env.LC_ALL;
  else process.env.LC_ALL = oldLcAll;
}

// Verify hud preset uses dual bars (context bar_percent + paired quota bar_percent) without state
const hudPresetCfg = meta.applyPreset(renderer.DEFAULT_CONFIG, "hud");
assert.strictEqual(hudPresetCfg.left.includes("state"), false);
assert.strictEqual(hudPresetCfg.right.includes("state"), false);
assert.strictEqual(hudPresetCfg.widgets.context.format, "bar_percent");
assert.strictEqual(hudPresetCfg.widgets.context.barWidth, 6);
assert.strictEqual(hudPresetCfg.widgets.quota.bucket, "gemini-5h+weekly");
assert.strictEqual(hudPresetCfg.widgets.quota.format, "bar_percent");
assert.strictEqual(hudPresetCfg.widgets.quota.barWidth, 5);
for (const w of [96, 120]) {
  const hudSample = {
    ...meta.buildSamplePayload("normal", w),
    cwd: "/tmp/demo",
    workspace: { current_dir: "/tmp/demo", project_dir: "/tmp/demo" },
  };
  const hudLine = renderer.stripAnsi(renderer.renderStatusLine(hudSample, { config: hudPresetCfg, settings: {} }));
  assert.ok(hudLine.includes("ctx █░░░░░ 14%") && hudLine.includes("quota ████░ 82% | ███░░ 64%"), `HUD preset @${w} missing dual bars: ${hudLine}`);
}
const confirmOff = renderer.renderStatusLine(
  { ...fullSample, tool_confirmation_pending: false },
  { config: renderer.mergeConfig(renderer.DEFAULT_CONFIG, { left: ["confirm"], right: [] }), settings: {} }
);
assert.strictEqual(confirmOff, "");
const cjkTrunc = renderer.truncateAnsi("你好世界Testing", 8);
assert.ok(renderer.visibleWidth(cjkTrunc) <= 8);

// 4. CLI tests in isolated temp dir
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "custom-statusline-test-"));
const tmpCfgPath = path.join(tmpDir, "statusline.config.json");
const tmpSettingsPath = path.join(tmpDir, "settings.json");
const tmpGlobalCfgPath = path.join(tmpDir, "config.json");
const tmpSnapshotPath = path.join(tmpDir, "last-payload.json");
const env = {
  STATUSLINE_CONFIG: tmpCfgPath,
  AGY_SETTINGS_PATH: tmpSettingsPath,
  STATUSLINE_LAST_PAYLOAD_PATH: tmpSnapshotPath,
};

try {
  // Help in EN & ZH
  for (const lang of ["en", "zh"]) {
    const r = runCli(["--help", "--lang", lang], env);
    assert.strictEqual(r.status, 0);
    assert.ok(r.stdout.includes("--ui") && r.stdout.includes("--open") && r.stdout.includes("--presets") && r.stdout.includes("--doctor"));
  }

  // Launcher unit & planner tests (no real UI spawned)
  const cleanedDumb = launcher.buildCleanSpawnEnv({ TERM: "dumb", PATH: "/usr/bin" });
  assert.strictEqual("TERM" in cleanedDumb, false);
  const keptKittyTerm = launcher.buildCleanSpawnEnv({ TERM: "xterm-kitty", PATH: "/usr/bin" });
  assert.strictEqual(keptKittyTerm.TERM, "xterm-kitty");

  const kittyOverlayPlans = launcher.resolveLaunchPlans({
    mode: "overlay",
    platform: "linux",
    env: { KITTY_LISTEN_ON: "unix:/tmp/kitty-1", KITTY_WINDOW_ID: "12", WAYLAND_DISPLAY: "wayland-1" },
    which: (b) => b === "kitty",
  });
  assert.strictEqual(kittyOverlayPlans[0].id, "kitty-overlay-matched");
  assert.ok(kittyOverlayPlans[0].args.includes("--type=overlay"));
  assert.ok(kittyOverlayPlans[0].args.includes("--match"));
  assert.ok(kittyOverlayPlans[0].args.includes("window_id:12"));
  assert.strictEqual(kittyOverlayPlans[0].args.includes("id:12"), false);

  const tmuxPlans = launcher.resolveLaunchPlans({
    mode: "overlay",
    platform: "linux",
    env: { TMUX: "/tmp/tmux-1000/default,123,0" },
    which: (b) => b === "tmux",
  });
  assert.strictEqual(tmuxPlans[0].id, "tmux-popup");
  assert.strictEqual(tmuxPlans[1].id, "tmux-split");

  const zellijPlans = launcher.resolveLaunchPlans({
    mode: "overlay",
    platform: "linux",
    env: { ZELLIJ: "0" },
    which: (b) => b === "zellij",
  });
  assert.strictEqual(zellijPlans[0].id, "zellij-floating");

  const wezPlans = launcher.resolveLaunchPlans({
    mode: "overlay",
    platform: "linux",
    env: { WEZTERM_PANE: "1" },
    which: (b) => b === "wezterm",
  });
  assert.strictEqual(wezPlans[0].id, "wezterm-split");

  const linuxWindowPlans = launcher.resolveLaunchPlans({
    mode: "window",
    platform: "linux",
    env: { KITTY_LISTEN_ON: "unix:/tmp/kitty-1", WAYLAND_DISPLAY: "wayland-1" },
    which: (b) => b === "kitty" || b === "konsole",
  });
  assert.strictEqual(linuxWindowPlans[0].id, "kitty-os-window");
  assert.ok(linuxWindowPlans.some((p) => p.id === "linux-konsole"));

  const darwinPlans = launcher.resolveLaunchPlans({
    mode: "overlay",
    platform: "darwin",
    env: { TERM_PROGRAM: "iTerm.app" },
    which: () => false,
  });
  assert.strictEqual(darwinPlans[0].id, "macos-iterm2");
  assert.strictEqual(darwinPlans[1].id, "macos-terminal");

  const winPlans = launcher.resolveLaunchPlans({
    mode: "overlay",
    platform: "win32",
    env: {},
    which: (b) => b === "wt",
  });
  assert.strictEqual(winPlans[0].id, "win-wt");
  assert.strictEqual(winPlans[1].id, "win-cmd");

  const headlessPlans = launcher.resolveLaunchPlans({
    mode: "overlay",
    platform: "linux",
    env: {},
    which: () => true,
  });
  assert.deepStrictEqual(headlessPlans, []);

  // Reject invalid --open mode on CLI
  const badOpen = runCli(["--ui", "--open=bogus", "--lang", "en"], env);
  assert.notStrictEqual(badOpen.status, 0);
  assert.ok(badOpen.stderr.includes("Invalid --open mode"));

  // Install fresh
  const instRes = meta.installPlugin({ configPath: tmpCfgPath, settingsPath: tmpSettingsPath, configJsonPath: tmpGlobalCfgPath });
  assert.strictEqual(instRes.status, "installed");
  assert.strictEqual(instRes.createdConfig, true);
  assert.strictEqual(fs.existsSync(tmpCfgPath), true);

  // Preserve existing file mode on atomic JSON writes (e.g. 0600 settings.json)
  if (process.platform !== "win32") {
    const modeTestPath = path.join(tmpDir, "mode-preserve.json");
    fs.writeFileSync(modeTestPath, "{}\n", { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(modeTestPath, 0o600);
    meta.writeJsonAtomic(modeTestPath, { ok: true });
    assert.strictEqual(fs.statSync(modeTestPath).mode & 0o777, 0o600);
  }

  // Guard against overwriting external command without --force
  fs.writeFileSync(tmpSettingsPath, JSON.stringify({ statusLine: { type: "command", command: "/usr/bin/other-bar", enabled: true } }));
  if (process.platform !== "win32") {
    fs.chmodSync(tmpSettingsPath, 0o600);
  }
  const blocked = meta.installPlugin({ configPath: tmpCfgPath, settingsPath: tmpSettingsPath, configJsonPath: tmpGlobalCfgPath, force: false });
  assert.strictEqual(blocked.status, "blocked_external");
  const blockedUninstall = meta.uninstallPlugin({ settingsPath: tmpSettingsPath, force: false });
  assert.strictEqual(blockedUninstall.status, "blocked_external");
  const forced = meta.installPlugin({ configPath: tmpCfgPath, settingsPath: tmpSettingsPath, configJsonPath: tmpGlobalCfgPath, force: true });
  assert.strictEqual(forced.status, "installed");
  if (process.platform !== "win32") {
    assert.strictEqual(fs.statSync(tmpSettingsPath).mode & 0o777, 0o600);
  }

  // CLI --presets, --preset, --preview, --gallery, --show, --doctor
  const noProbeEnv = { ...env, KITTY_LISTEN_ON: "", KITTY_WINDOW_ID: "", TMUX: "", WEZTERM_PANE: "" };
  const presetsZh = runCli(["--presets", "--plain", "--lang", "zh"], noProbeEnv);
  assert.strictEqual(presetsZh.status, 0);
  const presetsEn = runCli(["--presets", "--plain", "--lang", "en"], noProbeEnv);
  assert.strictEqual(presetsEn.status, 0);
  for (const pName of meta.PRESET_NAMES) {
    assert.ok(presetsZh.stdout.includes(pName), `ZH --presets missing ${pName}`);
    assert.ok(presetsEn.stdout.includes(pName), `EN --presets missing ${pName}`);
  }
  assert.ok(presetsZh.stdout.includes("套用预设会更新布局并重置各组件参数"), "ZH --presets missing resetNote");
  assert.ok(presetsEn.stdout.includes("updates layout and resets widget options"), "EN --presets missing resetNote");
  assert.ok(
    presetsZh.stdout.includes("quota ████░ 82% | ███░░ 64% · auto · Gemini 4 Neon · high"),
    `Non-TTY --presets fallback should render 120-col full hud preview with non-Orchestrator model:\n${presetsZh.stdout}`
  );
  assert.strictEqual(
    presetsZh.stdout.includes("Orchestrator · Default (Gemini Pro)"),
    false,
    "Should not render Orchestrator · Default (Gemini Pro) when unconfigured"
  );

  const removedFull = runCli(["--preset", "full", "--lang", "en"], env);
  assert.notStrictEqual(removedFull.status, 0);

  const applyDev = runCli(["--preset", "developer", "--lang", "en"], env);
  assert.strictEqual(applyDev.status, 0);
  assert.ok(applyDev.stdout.includes("developer"));
  assert.ok(applyDev.stdout.includes("updates layout and resets widget options"));

  const narrowPrev = runCli(["--preview", "--scenario", "narrow", "--plain", "--lang", "zh"], env);
  assert.strictEqual(narrowPrev.status, 0);
  assert.ok(narrowPrev.stdout.includes("宽度 48"), `Narrow scenario without --width should stay at 48:\n${narrowPrev.stdout}`);

  const prevRes = runCli(["--preview", "--scenario", "all", "--lang", "zh"], env);
  assert.strictEqual(prevRes.status, 0);
  assert.ok(prevRes.stdout.includes("quota ") && prevRes.stdout.includes("cache "));

  const galRes = runCli(["--gallery", "--plain", "--lang", "en"], env);
  assert.strictEqual(galRes.status, 0);
  assert.ok(galRes.stdout.includes("conversation_id") && galRes.stdout.includes("confirm"));

  const showJson = JSON.parse(runCli(["--show", "--json"], env).stdout);
  assert.ok(showJson.config.right.includes("quota"));
  assert.strictEqual(showJson.config.left.includes("context_extra"), false);
  assert.strictEqual(showJson.config.right.includes("context_extra"), true);
  assert.strictEqual(showJson.config.right.indexOf("context_extra"), showJson.config.right.indexOf("context") + 1);
  assert.strictEqual(showJson.config.widgets.context.format, "tokens");

  // Mutate CLI: --add, --move, --remove, --set (valid & invalid)
  assert.strictEqual(runCli(["--add", "left", "cost", "--at", "1"], env).status, 0);
  let cfgAfter = JSON.parse(fs.readFileSync(tmpCfgPath, "utf8"));
  assert.strictEqual(cfgAfter.left[1], "cost");

  assert.strictEqual(runCli(["--move", "left", "cost", "0"], env).status, 0);
  cfgAfter = JSON.parse(fs.readFileSync(tmpCfgPath, "utf8"));
  assert.strictEqual(cfgAfter.left[0], "cost");

  assert.strictEqual(runCli(["--remove", "left", "cost"], env).status, 0);
  cfgAfter = JSON.parse(fs.readFileSync(tmpCfgPath, "utf8"));
  assert.strictEqual(cfgAfter.left.includes("cost"), false);

  assert.strictEqual(runCli(["--set", "quota.bucket=3p-5h+weekly"], env).status, 0);
  assert.strictEqual(runCli(["--set", "quota.format=bar"], env).status, 0);
  assert.strictEqual(runCli(["--set", "quota.format=bar_percent"], env).status, 0);
  assert.strictEqual(runCli(["--set", "quota.barWidth=5"], env).status, 0);
  assert.strictEqual(runCli(["--set", "quota.showReset=5h"], env).status, 0);
  assert.strictEqual(runCli(["--set", "quota.showReset=weekly"], env).status, 0);
  assert.strictEqual(runCli(["--set", "quota.showReset=both"], env).status, 0);
  assert.strictEqual(runCli(["--set", "quota.showReset=none"], env).status, 0);
  assert.strictEqual(runCli(["--set", "context.format=bar"], env).status, 0);
  assert.strictEqual(runCli(["--set", "context.format=bar_percent"], env).status, 0);
  assert.strictEqual(runCli(["--set", "statusLocale=zh"], env).status, 0);
  assert.strictEqual(runCli(["--set", "colorScheme=tokyo night"], env).status, 0);
  cfgAfter = JSON.parse(fs.readFileSync(tmpCfgPath, "utf8"));
  assert.strictEqual(cfgAfter.widgets.quota.bucket, "3p-5h+weekly");
  assert.strictEqual(cfgAfter.widgets.quota.format, "bar_percent");
  assert.strictEqual(cfgAfter.widgets.quota.barWidth, 5);
  assert.strictEqual(cfgAfter.widgets.quota.showReset, "none");
  assert.strictEqual(cfgAfter.widgets.context.format, "bar_percent");
  assert.strictEqual(cfgAfter.statusLocale, "zh");
  assert.strictEqual(cfgAfter.colorScheme, "tokyo night");

  // Invalid --set rejected with non-zero exit
  const badSet = runCli(["--set", "quota.bucket=invalid_bucket"], env);
  assert.notStrictEqual(badSet.status, 0);
  assert.notStrictEqual(runCli(["--set", "quota.bucket=gemini-weekly+5h"], env).status, 0);
  assert.notStrictEqual(runCli(["--set", "quota.bucket=3p-weekly+5h"], env).status, 0);
  assert.notStrictEqual(runCli(["--set", "quota.showReset=true"], env).status, 0);
  assert.notStrictEqual(runCli(["--set", "quota.showReset=false"], env).status, 0);
  assert.notStrictEqual(runCli(["--set", "statusLocale=fr"], env).status, 0);
  const badQuotaFmt = runCli(["--set", "quota.format=invalid"], env);
  assert.notStrictEqual(badQuotaFmt.status, 0);
  const badQuotaBarW = runCli(["--set", "quota.barWidth=2"], env);
  assert.notStrictEqual(badQuotaBarW.status, 0);
  const badRange = runCli(["--set", "context.barWidth=99"], env);
  assert.notStrictEqual(badRange.status, 0);

  // Doctor on valid isolated setup
  const docOk = runCli(["--doctor", "--json"], env);
  assert.strictEqual(docOk.status, 0);
  const docObj = JSON.parse(docOk.stdout);
  assert.strictEqual(docObj.ok, true);
  assert.strictEqual(docObj.errors, 0);
  assert.strictEqual(docObj.installation.settingsStatus, "configured");

  // Reset config
  assert.strictEqual(runCli(["--reset-config"], env).status, 0);
  cfgAfter = JSON.parse(fs.readFileSync(tmpCfgPath, "utf8"));
  assert.deepStrictEqual(cfgAfter.left, ["vim", "shortcuts"]);

  // 5. Headless TUI verification across EN/ZH, views, width bounds, auto-save & Undo snapshot
  const preSnapshot = fs.readFileSync(tmpCfgPath, "utf8");
  const state = tui.createState({
    configPath: tmpCfgPath,
    settingsPath: tmpSettingsPath,
    configJsonPath: tmpGlobalCfgPath,
    snapshotPath: tmpSnapshotPath,
    cliLang: "en",
  });

  // Check frame dimensions across both languages and all 4 views at 54x18, 60x24, 77x43, 80x24, 120x36, 160x40
  for (const [cols, rows] of [[54, 18], [60, 24], [77, 43], [80, 24], [120, 36], [160, 40]]) {
    for (const lang of ["en", "zh"]) {
      state.locale = lang;
      for (const view of ["main", "options", "presets", "externalConfirm"]) {
        state.view = view;
        if (view === "options") state.selectedWidgetId = "quota";
        const frame = tui.renderFrame(state, cols, rows);
        assert.ok(frame.length <= rows, `Frame exceeded ${rows} rows in ${lang}/${view} (${cols}x${rows})`);
        for (const line of frame) {
          const w = renderer.visibleWidth(line);
          assert.ok(w <= cols, `Line width ${w} exceeded ${cols} cols in ${lang}/${view} (${cols}x${rows}): ${renderer.stripAnsi(line)}`);
        }
      }
    }
  }
  state.view = "main";
  state.locale = "en";

  // Verify Orchestrator model sample displays completely (no truncation) in main list (77x43 & 100x28), bottom detail bar (60x24), and options view
  const expectedModelSample = "Orchestrator · Gemini 4 Neon · xhigh";
  const orchState = tui.createState({
    configPath: tmpCfgPath,
    settingsPath: tmpSettingsPath,
    configJsonPath: tmpGlobalCfgPath,
    snapshotPath: tmpSnapshotPath,
    cliLang: "zh",
    settings: {
      colorScheme: "light",
      model: "Orchestrator (Neon)",
      orchestrator: {
        planner: "Gemini 4 Neon (xhigh)",
        executor: "Gemini 4 Flash",
      },
    },
  });
  const orchRows = tui.getGroupedRows(orchState.config);
  const modelRowIdx = orchRows.findIndex((r) => r.id === "model");
  assert.ok(modelRowIdx >= 0);
  orchState.mainCursor = modelRowIdx;

  for (const [cols, rows] of [[77, 43], [100, 28], [160, 40]]) {
    const plainLines = tui.renderFrame(orchState, cols, rows).map((l) => renderer.stripAnsi(l));
    const listRow = plainLines.find((l) => l.includes("[R] model"));
    assert.ok(listRow && listRow.includes(expectedModelSample), `Model list row truncated at ${cols}x${rows}: ${listRow}`);
    if (cols === 160) {
      assert.ok(
        listRow.includes(`${expectedModelSample}  模型与推理强度`),
        `Wide 160x40 main list row stretched gap instead of compact 2-space margin: ${listRow}`
      );
    }
    const detailSampleLine = plainLines.find((l) => l.includes("完整示例:") && l.includes(expectedModelSample));
    assert.ok(detailSampleLine, `Bottom detail bar missing full model sample at ${cols}x${rows}`);
  }
  const narrowLines = tui.renderFrame(orchState, 60, 24).map((l) => renderer.stripAnsi(l));
  assert.ok(
    narrowLines.some((l) => l.includes("完整示例:") && l.includes(expectedModelSample)),
    `Narrow 60x24 detail bar missing full model sample:\n${narrowLines.join("\n")}`
  );

  orchState.view = "options";
  orchState.selectedWidgetId = "model";
  const optLines = tui.renderFrame(orchState, 77, 43).map((l) => renderer.stripAnsi(l));
  assert.ok(
    optLines.some((l) => l.includes("完整示例:") && l.includes(expectedModelSample)),
    `Options view missing full model sample:\n${optLines.join("\n")}`
  );

  // Verify Level 1 (bottom) and Level 2 (top) both use unified row order: description first, full sample second
  orchState.locale = "zh";
  for (const [cols, rows] of [[77, 43], [160, 40]]) {
    orchState.view = "main";
    const mainPlain = tui.renderFrame(orchState, cols, rows).map((l) => renderer.stripAnsi(l));
    const mainDescIdx = mainPlain.findIndex((l) => l.includes("显示当前模型"));
    const mainSampleIdx = mainPlain.findIndex((l) => l.includes("完整示例:") && l.includes(expectedModelSample));
    assert.ok(mainDescIdx >= 0 && mainSampleIdx === mainDescIdx + 1, `Main view order mismatch at ${cols}x${rows}`);
    assert.strictEqual(mainSampleIdx, mainPlain.length - 3, `Main view summary should sit right above boxBottom at ${cols}x${rows}`);

    orchState.view = "options";
    orchState.selectedWidgetId = "model";
    const optsPlain = tui.renderFrame(orchState, cols, rows).map((l) => renderer.stripAnsi(l));
    const optsDescIdx = optsPlain.findIndex((l) => l.includes("显示当前模型"));
    const optsSampleIdx = optsPlain.findIndex((l) => l.includes("完整示例:") && l.includes(expectedModelSample));
    const firstOptIdx = optsPlain.findIndex((l) => l.includes("enabled"));
    assert.ok(optsDescIdx >= 0 && optsSampleIdx === optsDescIdx + 1, `Options view order mismatch at ${cols}x${rows}`);
    assert.ok(optsSampleIdx < firstOptIdx, `Options view summary should sit above option rows at ${cols}x${rows}`);
  }

  // Verify zero truncation on long option labels in both ZH (quota) and EN (subagents) at 77x43 and 160x40
  orchState.selectedWidgetId = "quota";
  orchState.locale = "zh";
  for (const [cols, rows] of [[77, 43], [160, 40]]) {
    const qLines = tui.renderFrame(orchState, cols, rows).map((l) => renderer.stripAnsi(l));
    assert.ok(
      qLines.some((l) => l.includes("warnBelowPercent (剩余低于多少变橙 (%))") && l.includes("30")),
      `quota warnBelowPercent truncated at ${cols}x${rows}:\n${qLines.join("\n")}`
    );
    assert.ok(
      qLines.some((l) => l.includes("criticalBelowPercent (剩余低于多少变红 (%))") && l.includes("10")),
      `quota criticalBelowPercent truncated at ${cols}x${rows}:\n${qLines.join("\n")}`
    );
  }
  orchState.selectedWidgetId = "subagents";
  orchState.locale = "en";
  for (const [cols, rows] of [[77, 43], [160, 40]]) {
    const sLines = tui.renderFrame(orchState, cols, rows).map((l) => renderer.stripAnsi(l));
    assert.ok(
      sLines.some((l) => l.includes("includeCompleted (Include completed subagents)")),
      `subagents includeCompleted truncated at ${cols}x${rows}:\n${sLines.join("\n")}`
    );
  }

  // Simulate keystrokes: move down to shortcuts, Space to disable, open options, test 'q'/'u' while editing, toggle G, then U undo
  tui.handleKey(state, "", { name: "down" }); // shortcuts
  tui.handleKey(state, " ", { name: "space" }); // disable shortcuts
  let disk = JSON.parse(fs.readFileSync(tmpCfgPath, "utf8"));
  assert.strictEqual(disk.left.includes("shortcuts"), false);

  // Move right / toggle language with G
  tui.handleKey(state, "g", { name: "g" });
  assert.strictEqual(state.locale, "zh");
  disk = JSON.parse(fs.readFileSync(tmpCfgPath, "utf8"));
  assert.strictEqual(disk.locale, "zh");

  // Open options for current widget
  tui.handleKey(state, "", { name: "return" });
  assert.strictEqual(state.view, "options");
  const editingWidget = state.selectedWidgetId;
  const widgetOpts = meta.WIDGET_META_MAP[editingWidget].options;
  const strOptIdx = widgetOpts.findIndex((o) => o.type === "string");
  if (strOptIdx >= 0) {
    state.optsCursor = strOptIdx;
    tui.handleKey(state, "", { name: "return" }); // start string edit
    assert.ok(state.editingString);
    // Typing q, u while editing MUST append text, NOT quit/undo
    tui.handleKey(state, "q", { name: "q" });
    tui.handleKey(state, "u", { name: "u" });
    assert.strictEqual(state.shouldExit, false);
    assert.ok(state.editingString.value.endsWith("qu"));
    tui.handleKey(state, "", { name: "escape" }); // cancel string edit
    assert.strictEqual(state.editingString, null);
    assert.strictEqual(state.view, "options");
  }
  tui.handleKey(state, "", { name: "escape" }); // back to main
  assert.strictEqual(state.view, "main");

  // Verify TUI presets view reset hint (EN/ZH) & scrolling at 54x18 for 5th preset (developer)
  state.view = "presets";
  state.locale = "en";
  const presetsFrameEn = tui.renderFrame(state, 80, 24).map((l) => renderer.stripAnsi(l));
  assert.ok(presetsFrameEn.some((l) => l.includes("Resets widget options; keeps theme, separators & locale.")));
  const widePresetsFrame = tui.renderFrame(state, 160, 40).map((l) => renderer.stripAnsi(l));
  assert.ok(
    widePresetsFrame.some((l) => l.includes("quota ████░ 82% | ███░░ 64% · auto · Gemini 4 Neon · high")),
    `160x40 TUI presets view still clamped or used wrong fallback model:\n${widePresetsFrame.join("\n")}`
  );
  assert.strictEqual(
    widePresetsFrame.some((l) => l.includes("Orchestrator · Default (Gemini Pro)")),
    false
  );
  state.locale = "zh";
  const presetsFrameZh = tui.renderFrame(state, 80, 24).map((l) => renderer.stripAnsi(l));
  assert.ok(presetsFrameZh.some((l) => l.includes("套用会重置各组件参数，保留配色、分隔符与语言。")));
  state.presetCursor = 4; // developer
  const tinyPresetsFrame = tui.renderFrame(state, 54, 18);
  assert.ok(tinyPresetsFrame.length <= 18, `Tiny 54x18 presets frame overflowed: ${tinyPresetsFrame.length}`);
  assert.ok(tinyPresetsFrame.some((l) => renderer.stripAnsi(l).includes("developer")), "54x18 presets frame did not scroll to developer");
  state.presetCursor = 0;
  state.view = "main";
  state.locale = "en";

  // Cycle preset via P overlay
  tui.handleKey(state, "p", { name: "p" });
  assert.strictEqual(state.view, "presets");
  tui.handleKey(state, "", { name: "down" }); // minimal
  tui.handleKey(state, "", { name: "return" });
  assert.strictEqual(state.view, "main");
  disk = JSON.parse(fs.readFileSync(tmpCfgPath, "utf8"));
  assert.deepStrictEqual(disk.left, ["vim", "confirm", "git"]);
  assert.deepStrictEqual(disk.right, ["context", "mode", "model"]);

  // Cycle statusLocale via L hotkey (en -> zh -> auto -> en) & verify live preview/gallery updates before U restore
  assert.strictEqual(state.config.statusLocale, "en");
  tui.handleKey(state, "l", { name: "l" });
  assert.strictEqual(state.config.statusLocale, "zh");
  disk = JSON.parse(fs.readFileSync(tmpCfgPath, "utf8"));
  assert.strictEqual(disk.statusLocale, "zh");
  const zhTuiFramePlain = tui.renderFrame(state, 160, 40).map((l) => renderer.stripAnsi(l)).join("\n");
  assert.ok(zhTuiFramePlain.includes("自动 · Gemini 4 Neon · high"), `TUI live preview did not switch status line to zh:\n${zhTuiFramePlain}`);
  assert.ok(zhTuiFramePlain.includes("-- 插入 --"), `TUI widget list sample did not switch to zh:\n${zhTuiFramePlain}`);
  const prevLocale = state.locale;
  state.locale = "en";
  const enOrderPlain = tui.renderFrame(state, 160, 40).map((l) => renderer.stripAnsi(l)).join("\n");
  assert.ok(
    /Theme: .*Status Lang: .*Scenario: /.test(enOrderPlain),
    `Expected EN metaLine order Theme -> Status Lang -> Scenario:\n${enOrderPlain}`
  );
  assert.ok(enOrderPlain.includes("L Status Lang"), `Expected 'L Status Lang' in EN footer:\n${enOrderPlain}`);
  state.locale = "zh";
  const zhOrderPlain = tui.renderFrame(state, 160, 40).map((l) => renderer.stripAnsi(l)).join("\n");
  assert.ok(
    /配色主题: .*状态栏语言: .*模拟场景: /.test(zhOrderPlain),
    `Expected ZH metaLine order 配色主题 -> 状态栏语言 -> 模拟场景:\n${zhOrderPlain}`
  );
  state.locale = prevLocale;
  tui.handleKey(state, "l", { name: "l" });
  assert.strictEqual(state.config.statusLocale, "auto");
  tui.handleKey(state, "l", { name: "l" });
  assert.strictEqual(state.config.statusLocale, "en");

  // Press U to restore pre-session snapshot cleanly!
  tui.handleKey(state, "u", { name: "u" });
  assert.strictEqual(fs.readFileSync(tmpCfgPath, "utf8"), preSnapshot);

  // Quit cleanly with Q
  tui.handleKey(state, "q", { name: "q" });
  assert.strictEqual(state.shouldExit, true);

  // 5b. Live payload snapshot capture, read, throttling, fallback & CLI/TUI parity tests
  const isolatedSnapPath = path.join(tmpDir, "snap-unit.json");
  assert.strictEqual(renderer.recordLivePayloadSnapshot({}, { snapshotPath: isolatedSnapPath }), false);
  const oldDisable = process.env.STATUSLINE_DISABLE_SNAPSHOT;
  process.env.STATUSLINE_DISABLE_SNAPSHOT = "1";
  assert.strictEqual(renderer.recordLivePayloadSnapshot({ model: { id: "x" } }, { snapshotPath: isolatedSnapPath }), false);
  if (oldDisable === undefined) delete process.env.STATUSLINE_DISABLE_SNAPSHOT;
  else process.env.STATUSLINE_DISABLE_SNAPSHOT = oldDisable;

  const liveSnapSample = {
    cwd: tmpDir,
    workspace: { current_dir: tmpDir, project_dir: tmpDir },
    model: { id: "claude-opus-5-5-high", display_name: "Claude Opus 5.5 (High)", effort: "high" },
    cycle_mode: "plan",
    agent_state: "idle",
    terminal_width: 120,
    context_window: {
      total_input_tokens: 20000,
      total_output_tokens: 5000,
      context_window_size: 1000000,
      used_percentage: 3,
      current_usage: { input_tokens: 2000, cache_creation_input_tokens: 0, cache_read_input_tokens: 10000 },
    },
    quota: {
      "gemini-5h": { remaining_fraction: 0.97, reset_in_seconds: 18000 },
      "gemini-weekly": { remaining_fraction: 0.91, reset_in_seconds: 400000 },
    },
    vcs: { type: "git", branch: "feat/snap", dirty: false },
  };
  assert.strictEqual(renderer.recordLivePayloadSnapshot(liveSnapSample, { snapshotPath: isolatedSnapPath, minIntervalMs: 5000 }), true);
  if (process.platform !== "win32") {
    assert.strictEqual(fs.statSync(isolatedSnapPath).mode & 0o777, 0o600);
  }
  // Throttled second write within minIntervalMs
  assert.strictEqual(renderer.recordLivePayloadSnapshot(liveSnapSample, { snapshotPath: isolatedSnapPath, minIntervalMs: 5000 }), false);

  const readBack = meta.readLivePayloadSnapshot({ snapshotPath: isolatedSnapPath, maxAgeMs: 60000 });
  assert.deepStrictEqual(readBack, liveSnapSample);
  assert.strictEqual(meta.readLivePayloadSnapshot({ snapshotPath: path.join(tmpDir, "missing.json") }), null);
  const staleSnapPath = path.join(tmpDir, "stale-snap.json");
  fs.writeFileSync(staleSnapPath, JSON.stringify({ saved_at: Date.now() - 120000, payload: liveSnapSample }));
  assert.strictEqual(meta.readLivePayloadSnapshot({ snapshotPath: staleSnapPath, maxAgeMs: 1000 }), null);
  const badSnapPath = path.join(tmpDir, "bad-snap.json");
  fs.writeFileSync(badSnapPath, "{not-json");
  assert.strictEqual(meta.readLivePayloadSnapshot({ snapshotPath: badSnapPath }), null);

  // resolvePreviewPayload with live snapshot
  const balancedCfg = meta.applyPreset(renderer.DEFAULT_CONFIG, "balanced");
  const liveNorm = meta.resolvePreviewPayload("normal", 118, { snapshotPath: isolatedSnapPath, preferLive: true, settings: {} });
  assert.strictEqual(liveNorm.isLive, true);
  assert.strictEqual(liveNorm.payload.terminal_width, 118);
  const liveNormPlain = renderer.stripAnsi(renderer.renderStatusLine(liveNorm.payload, { config: balancedCfg, settings: {} }));
  assert.ok(
    liveNormPlain.includes("ctx 3%") && liveNormPlain.includes("quota 97%|91%") && liveNormPlain.includes("plan · Claude Opus 5.5 · high"),
    `Expected live-mirrored preview, got: ${liveNormPlain}`
  );

  const presetSync = meta.resolvePreviewPayload("normal", 120, { snapshotPath: isolatedSnapPath, preferLive: false, settings: {} });
  assert.strictEqual(presetSync.isLive, false);
  const presetSyncPlain = renderer.stripAnsi(renderer.renderStatusLine(presetSync.payload, { config: balancedCfg, settings: {} }));
  assert.ok(
    presetSyncPlain.includes("ctx 14%") && presetSyncPlain.includes("quota 82%|64%") && presetSyncPlain.includes("plan · Claude Opus 5.5 · high"),
    `Expected sample values + synced live model/mode, got: ${presetSyncPlain}`
  );

  for (const sc of ["alert", "narrow"]) {
    const scRes = meta.resolvePreviewPayload(sc, undefined, { snapshotPath: isolatedSnapPath, preferLive: false, settings: {} });
    assert.strictEqual(scRes.payload.model.display_name, "Claude Opus 5.5 (High)");
    assert.strictEqual(scRes.payload.cycle_mode, "plan");
  }

  // Fallback without snapshot
  const noSnapOrch = meta.resolvePreviewPayload("normal", 120, {
    livePayload: null,
    preferLive: true,
    settings: { model: "Orchestrator (Neon)", orchestrator: { planner: "Gemini 4 Neon (xhigh)" } },
  });
  const noSnapOrchPlain = renderer.stripAnsi(
    renderer.renderStatusLine(noSnapOrch.payload, {
      config: renderer.DEFAULT_CONFIG,
      settings: { model: "Orchestrator (Neon)", orchestrator: { planner: "Gemini 4 Neon (xhigh)" } },
    })
  );
  assert.ok(noSnapOrchPlain.includes("Orchestrator · Gemini 4 Neon · xhigh"), `Expected configured orchestrator fallback: ${noSnapOrchPlain}`);

  const noSnapEmpty = meta.resolvePreviewPayload("normal", 120, { livePayload: null, preferLive: true, settings: {} });
  const noSnapEmptyPlain = renderer.stripAnsi(renderer.renderStatusLine(noSnapEmpty.payload, { config: renderer.DEFAULT_CONFIG, settings: {} }));
  assert.ok(noSnapEmptyPlain.includes("Gemini 4 Neon · high"), `Expected non-Orchestrator fallback: ${noSnapEmptyPlain}`);
  assert.strictEqual(noSnapEmptyPlain.includes("Orchestrator · Default (Gemini Pro)"), false);

  // CLI & TUI integration with populated tmpSnapshotPath
  fs.writeFileSync(tmpSettingsPath, JSON.stringify({ colorScheme: "dark" }));
  assert.strictEqual(renderer.recordLivePayloadSnapshot(liveSnapSample, { snapshotPath: tmpSnapshotPath, minIntervalMs: 0 }), true);
  runCli(["--preset", "balanced"], env);
  const cliLivePrev = runCli(["--preview", "--scenario", "normal", "--plain", "--lang", "en"], noProbeEnv);
  assert.strictEqual(cliLivePrev.status, 0);
  assert.ok(
    cliLivePrev.stdout.includes("ctx 3%") && cliLivePrev.stdout.includes("plan · Claude Opus 5.5 · high"),
    `CLI --preview failed to mirror snapshot:\n${cliLivePrev.stdout}`
  );
  const cliSyncPresets = runCli(["--presets", "--plain", "--lang", "en"], noProbeEnv);
  assert.strictEqual(cliSyncPresets.status, 0);
  assert.ok(
    cliSyncPresets.stdout.includes("quota ████░ 82% | ███░░ 64% · plan · Claude Opus 5.5 · high"),
    `CLI --presets failed to sync model/mode:\n${cliSyncPresets.stdout}`
  );

  const liveTuiState = tui.createState({
    configPath: tmpCfgPath,
    settingsPath: tmpSettingsPath,
    configJsonPath: tmpGlobalCfgPath,
    snapshotPath: tmpSnapshotPath,
    cliLang: "en",
  });
  const liveTuiMainPlain = tui.renderFrame(liveTuiState, 160, 40).map((l) => renderer.stripAnsi(l)).join("\n");
  assert.ok(
    liveTuiMainPlain.includes("ctx 3%") && liveTuiMainPlain.includes("plan · Claude Opus 5.5 · high"),
    `TUI top preview failed to mirror live snapshot:\n${liveTuiMainPlain}`
  );
  liveTuiState.view = "presets";
  const liveTuiPresetsPlain = tui.renderFrame(liveTuiState, 160, 40).map((l) => renderer.stripAnsi(l)).join("\n");
  assert.ok(
    liveTuiPresetsPlain.includes("quota ████░ 82% | ███░░ 64% · plan · Claude Opus 5.5 · high"),
    `TUI presets view failed to sync live model/mode:\n${liveTuiPresetsPlain}`
  );
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// 6. End-to-end statusline-renderer.js CLI stdin/stdout & snapshot smoke test
const e2eDir = fs.mkdtempSync(path.join(os.tmpdir(), "custom-statusline-e2e-"));
try {
  const e2eCfgPath = path.join(e2eDir, "statusline.config.json");
  const e2eSettingsPath = path.join(e2eDir, "settings.json");
  const e2eSnapPath = path.join(e2eDir, "last-payload.json");
  const e2eDisabledSnapPath = path.join(e2eDir, "disabled-payload.json");
  const e2eCfg = meta.applyPreset(renderer.DEFAULT_CONFIG, "balanced");
  fs.writeFileSync(e2eCfgPath, JSON.stringify(e2eCfg, null, 2));
  fs.writeFileSync(e2eSettingsPath, JSON.stringify({ colorScheme: "dark" }));

  const e2ePayload = {
    cwd: e2eDir,
    workspace: { current_dir: e2eDir, project_dir: e2eDir },
    model: { id: "gemini-4-neon-high", display_name: "Gemini 4 Neon (High)", effort: "high" },
    cycle_mode: "auto",
    agent_state: "idle",
    terminal_width: 120,
    context_window: {
      total_input_tokens: 90000,
      total_output_tokens: 15000,
      context_window_size: 1048576,
      used_percentage: 10.2,
      current_usage: { input_tokens: 4000, cache_creation_input_tokens: 0, cache_read_input_tokens: 96000 },
    },
    quota: {
      "gemini-5h": { remaining_fraction: 0.55, reset_in_seconds: 9000 },
      "gemini-weekly": { remaining_fraction: 0.89, reset_in_seconds: 300000 },
    },
    vcs: { type: "git", branch: "main", dirty: true },
  };

  const cliRenderRes = spawnSync(process.execPath, [RENDERER_PATH], {
    input: JSON.stringify(e2ePayload),
    encoding: "utf8",
    env: {
      ...process.env,
      STATUSLINE_CONFIG: e2eCfgPath,
      AGY_SETTINGS_PATH: e2eSettingsPath,
      STATUSLINE_LAST_PAYLOAD_PATH: e2eSnapPath,
    },
  });
  assert.strictEqual(cliRenderRes.status, 0);
  const cliPlain = renderer.stripAnsi(cliRenderRes.stdout.trim());
  const expectedCliPlain = renderer.stripAnsi(
    renderer.renderStatusLine(e2ePayload, { config: e2eCfg, settings: { colorScheme: "dark" } })
  );
  assert.ok(cliPlain.length > 0, "Renderer CLI stdout was empty");
  assert.strictEqual(cliPlain, expectedCliPlain, `Renderer CLI diverged:\n  got: ${cliPlain}\n  exp: ${expectedCliPlain}`);
  assert.strictEqual(fs.existsSync(e2eSnapPath), true, "Renderer CLI did not record live snapshot");
  const snapJson = JSON.parse(fs.readFileSync(e2eSnapPath, "utf8"));
  assert.deepStrictEqual(snapJson.payload, e2ePayload);

  const disabledRun = spawnSync(process.execPath, [RENDERER_PATH], {
    input: JSON.stringify(e2ePayload),
    encoding: "utf8",
    env: {
      ...process.env,
      STATUSLINE_CONFIG: e2eCfgPath,
      AGY_SETTINGS_PATH: e2eSettingsPath,
      STATUSLINE_LAST_PAYLOAD_PATH: e2eDisabledSnapPath,
      STATUSLINE_DISABLE_SNAPSHOT: "1",
    },
  });
  assert.strictEqual(disabledRun.status, 0);
  assert.strictEqual(fs.existsSync(e2eDisabledSnapPath), false, "Snapshot written despite STATUSLINE_DISABLE_SNAPSHOT=1");
} finally {
  fs.rmSync(e2eDir, { recursive: true, force: true });
}

console.log("ALL_CUSTOM_STATUSLINE_TESTS_PASSED");
