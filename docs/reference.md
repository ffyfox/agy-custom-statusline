[← Back to README](../README.md) · English | [简体中文](./reference.zh-CN.md)

# Custom Status Line — Full Reference

Complete CLI commands, interactive TUI shortcuts, external launcher matrix, all 19 widgets, all 10 color schemes, configuration schema, environment variables, and troubleshooting for `custom-statusline`.

## Table of Contents

- [CLI Reference](#cli-reference)
- [Interactive TUI (`--ui`) & External Launcher (`--ui --open`)](#interactive-tui---ui--external-launcher---ui---open)
- [Widget Catalog (19 Widgets)](#widget-catalog-19-widgets)
- [Color Schemes (All 10 Values)](#color-schemes-all-10-values)
- [Configuration File & JSON Schema](#configuration-file--json-schema)
- [Environment Variables & Live Preview Snapshot](#environment-variables--live-preview-snapshot)
- [Troubleshooting, Upgrading & Uninstall](#troubleshooting-upgrading--uninstall)

---

## CLI Reference

> **Tip:** For everyday setup and customization, running `/statusline-config` inside `agy` is the easiest path — it handles both agent-guided configuration and one-click launching of the visual TUI without memorizing script paths. The CLI commands below are mainly for standalone terminal use, scripting, or troubleshooting.

Define a reusable variable in your shell (scripts are directly executable on Linux/macOS; on Windows run `node "$STATUSLINE" ...`):

```bash
STATUSLINE="$HOME/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js"
```

All commands accept `--lang <en|zh>` (CLI/TUI language), `--config <path>` (override config file path), and `-h` / `--help`.

```bash
# Lifecycle & Setup
"$STATUSLINE" --install [--force]
"$STATUSLINE" --uninstall [--force]
"$STATUSLINE" --reset-config
"$STATUSLINE" --doctor [--json]

# Visual Preview & Discovery
"$STATUSLINE" --ui
"$STATUSLINE" --ui --open [auto|overlay|window|split] [--json]   # alias: --open-ui
"$STATUSLINE" --preview [--preset NAME] [--scenario normal|alert|narrow|all] [--width N] [--scheme NAME] [--plain]
"$STATUSLINE" --gallery [--scheme NAME] [--plain]
"$STATUSLINE" --presets [--width N] [--scheme NAME] [--plain]
"$STATUSLINE" --watch [--scenario normal|alert|narrow] [--width N] [--scheme NAME] [--plain]
"$STATUSLINE" --show [--json]

# Atomic Configuration Mutations
"$STATUSLINE" --preset <official|minimal|balanced|hud|developer> [--plain]
"$STATUSLINE" --add <left|right> <widget> [--at <index>]
"$STATUSLINE" --remove <left|right|both> <widget>
"$STATUSLINE" --move <left|right> <widget> <index>
"$STATUSLINE" --set <path>=<value>
```

> **Quoting values with spaces:** In POSIX shells, values containing spaces (such as `tokyo night`, `solarized dark`, `colorblind-friendly dark`, or custom `separator` / `prefix` strings) **must be quoted**:
> ```bash
> "$STATUSLINE" --set quota.bucket=3p-5h+weekly
> "$STATUSLINE" --set "colorScheme=tokyo night"
> "$STATUSLINE" --set "separator= | "
> "$STATUSLINE" --set "context.prefix=ctx: "
> ```

---

## Interactive TUI (`--ui`) & External Launcher (`--ui --open`)

### Main View Shortcuts

| Key | Action |
| :--- | :--- |
| `↑` / `↓` (`j` / `k`) | Move cursor across Left, Right, and Available widgets |
| `Space` | Toggle selected widget on/off |
| `←` / `→` (`x`) | Move widget to Left or Right side (or toggle side with `x`) |
| `[` / `]` (`Shift+↑` / `Shift+↓`, `J` / `K`) | Reorder widget within its current side |
| `Enter` | Open options sub-panel for the selected widget |
| `P` | Open Preset Picker with live previews |
| `T` | Cycle all 10 `colorScheme` values |
| `L` | Cycle rendered status line language (`en` → `zh` → `auto`, saved to `statusLocale`) |
| `V` | Cycle live preview scenario (`normal`, `alert`, `narrow`, `gallery`) |
| `G` | Toggle CLI/TUI interface language live (`EN` ↔ `中文`, saved to `locale`) |
| `I` | Activate plugin in `settings.json` (banner shown when unconfigured/disabled; prompts confirmation if `external`) |
| `U` | Undo all changes made in this session (restores exact pre-session snapshot) |
| `Q` / `Esc` | Quit cleanly (changes are already auto-saved within ~300 ms) |

### Sub-Panel Shortcuts (`Enter` Options Editor & `P` Preset Picker)

| Key | Options Editor (`Enter`) | Preset Picker (`P`) |
| :--- | :--- | :--- |
| `↑` / `↓` (`j` / `k`) | Move between widget options | Move between the 5 presets |
| `Space` / `←` / `→` | Toggle boolean or cycle enum options | `Space` / `Enter`: apply preset |
| `+` / `-` (`=` / `-`, `←` / `→`) | Step integer / numeric values (e.g. thresholds, widths) | — |
| `Enter` | Edit string option (`Enter` save, `Esc` cancel, `Backspace` delete) | Apply highlighted preset |
| `Esc` / `Backspace` / `B` | Return to main view (`Esc` or `P` in Preset Picker) | Return to main view |
| `U` / `Q` | `U` restores pre-session snapshot · `Q` quits | `Esc` / `P` cancels |

### External Launcher (`--ui --open`) Terminal Support

`--ui --open [mode]` (or `--open-ui [mode]`) pops open `--ui` from inside `agy` or a script without disturbing your active session:

| Mode | Behavior |
| :--- | :--- |
| `auto` (default) / `overlay` | Prefers floating/overlay panes (Kitty overlay, tmux popup, Zellij floating), then splits, then desktop terminal windows |
| `split` | Opens an adjacent split pane (Kitty split, tmux split, WezTerm split, Zellij split), falling back to desktop windows |
| `window` | Opens a new OS/terminal window (Linux desktop terminals, macOS iTerm2/Terminal, Windows Terminal/`cmd.exe`, tmux/WezTerm window) |

Supported environments:
- **Multiplexers / Terminal APIs**: Kitty (`KITTY_LISTEN_ON`), tmux (`TMUX`), Zellij (`ZELLIJ`), WezTerm (`WEZTERM_PANE`).
- **Linux Desktop (Wayland / X11)**: `kitty`, `konsole`, `ghostty`, `alacritty`, `wezterm`, `foot`, `gnome-terminal`, `xfce4-terminal`, `xdg-terminal-exec`, `x-terminal-emulator`, `xterm`.
- **macOS**: iTerm2 (`osascript`), Terminal.app (`osascript`).
- **Windows**: Windows Terminal (`wt`), `cmd.exe`.
- **Headless / SSH fallback**: If no GUI or multiplexer popup is available, press `Ctrl+Z` inside `agy`, run `"$STATUSLINE" --ui`, press `Q` to quit, and run `fg` to return to `agy`.

---

## Widget Catalog (19 Widgets)

> Note: Every widget supports `enabled` (`boolean`, default `true`) under `widgets.<id>.enabled`.

| Widget | Category | Description | Options |
| :--- | :---: | :--- | :--- |
| `vim` | Built-in | `-- INSERT --`, `-- VISUAL --`, `-- V-LINE --` | `enabled` |
| `shortcuts` | Built-in | `? for shortcuts` hint on the left | `text` |
| `tasks` | Built-in | Running background tasks (`%d task(s) · /tasks`) | `showCommandHint` |
| `subagents` | Built-in | Active subagent count (`%d subagent(s)`) | `includeCompleted` |
| `mode` | Built-in | Execution cycle mode (`auto`, `plan`, `accept-edits`, `best-of-n`) | `uppercase` |
| `model` | Built-in | Active model / Orchestrator planner & reasoning effort | `orchestratorStyle` (`official` \| `both` \| `model_only`), `showEffort` |
| `context` | Extended | Context usage (`percent`, `bar`, `bar_percent`, or `tokens` e.g. `ctx 14% (149k/1.0M)`) with warn/critical colors | `format`, `prefix`, `barWidth`, `showWhenZero`, `warnAtPercent`, `criticalAtPercent` |
| `context_extra` | Extended | Prompt cache hit rate/tokens & `>200k` badge | `showCacheRate`, `showCacheTokens`, `showExceeds200k`, `cachePrefix`, `exceeds200kText`, `showPlaceholder` |
| `quota` | Extended | Model rate-limit quota in single or paired `5h\|weekly` modes (`82%\|64%`, `████░ 82% \| ███░░ 64%`) | `bucket` (`gemini-5h`, `gemini-weekly`, `3p-5h`, `3p-weekly`, `gemini-5h+weekly`, `3p-5h+weekly`), `format` (`percent` \| `bar` \| `bar_percent`), `metric` (`remaining` \| `used`), `prefix`, `barWidth`, `showReset` (`none` \| `5h` \| `weekly` \| `both`), `warnBelowPercent`, `criticalBelowPercent` |
| `git` | Extended | Fast `.git/HEAD` branch + dirty `*` marker | `showDirty`, `maxLength` |
| `cwd` | Extended | Current directory name or `~/path` | `style` (`basename` \| `short`) |
| `state` | Extended | Agent runtime state (`working`, `tool_use`, `reviewing`, `error`, …) | `hideWhenIdle` |
| `artifacts` | Extended | Created artifact count when > 0 | `enabled` |
| `queued` | Extended | Pending queued message count in orange when > 0 | `enabled` |
| `sandbox` | Extended | Terminal sandbox status (`sandbox ON` / `sandbox off`) | `onlyWhenEnabled` |
| `cost` | Extended | Estimated session USD spend when > 0 | `decimals` |
| `title` | Extended | Conversation title (CJK display-width-aware truncation) | `maxLength`, `prefix` |
| `confirm` | Extended | Bold orange alert badge during pending tool confirmation | `text` |
| `conversation_id` | Extended | Short prefix or full conversation UUID | `length` (`0` = full UUID), `prefix` |

---

## Color Schemes (All 10 Values)

Valid `colorScheme` values in `statusline.config.json` and `--set` / `--scheme`:

| Value | Description |
| :--- | :--- |
| `auto` | Default. Follows `colorScheme` in `~/.gemini/antigravity-cli/settings.json` (falls back to `terminal`) |
| `none` | Disables all ANSI color escapes (plain text output) |
| `light` | Official light palette |
| `solarized light` | Official Solarized Light palette |
| `colorblind-friendly light` | Official colorblind-friendly light palette |
| `dark` | Official dark palette |
| `solarized dark` | Official Solarized Dark palette |
| `colorblind-friendly dark` | Official colorblind-friendly dark palette |
| `tokyo night` | Official Tokyo Night palette |
| `terminal` | Uses standard terminal ANSI 16 palette colors |

---

## Configuration File & JSON Schema

User preferences live at `~/.gemini/antigravity-cli/statusline.config.json` (outside the plugin folder, so plugin updates never overwrite your setup) and reload automatically in `agy` within ~300 ms.

- Running `--install` or `--reset-config` initializes the **`official` default** layout (`left: ["vim", "shortcuts"]`, `right: ["tasks", "subagents", "mode", "model"]`).
- **`locale`** controls CLI diagnostics and `--ui` TUI language (`auto`, `en`, `zh`).
- **`statusLocale`** independently controls rendered status line labels (`en`, `zh`, `auto`). It translates built-in default labels (such as `ctx `, `quota `, `cache `, `confirm!`, `queued`, `tasks`, `subagents`, `mode`) while preserving any custom `prefix` or `text` you set.
- Running `--install`, `--preset`, `--set`, or `--ui` automatically writes `$schema` as a `file://` URI pointing to [schemas/statusline.schema.json](../schemas/statusline.schema.json) for editor validation and autocomplete.

Example (`balanced` preset with custom widget options):

```json
{
  "$schema": "file:///path/to/plugins/custom-statusline/schemas/statusline.schema.json",
  "version": 1,
  "locale": "auto",
  "statusLocale": "en",
  "colorScheme": "tokyo night",
  "separator": " · ",
  "leftSeparator": " · ",
  "left": ["vim", "confirm", "queued", "cwd", "git"],
  "right": ["context", "quota", "tasks", "subagents", "mode", "model"],
  "widgets": {
    "cwd": { "style": "basename" },
    "context": { "format": "percent", "warnAtPercent": 60, "criticalAtPercent": 85 },
    "quota": { "bucket": "gemini-5h+weekly", "showReset": "5h" }
  }
}
```

---

## Environment Variables & Live Preview Snapshot

| Variable | Purpose |
| :--- | :--- |
| `NO_COLOR` | Any non-empty value disables ANSI colors in rendered output |
| `STATUSLINE_CONFIG` | Overrides user config path (default: `~/.gemini/antigravity-cli/statusline.config.json`) |
| `STATUSLINE_LANG` | Overrides CLI/TUI language (`en` or `zh`) |
| `AGY_SETTINGS_PATH` | Overrides `agy` settings path (default: `~/.gemini/antigravity-cli/settings.json`) |
| `STATUSLINE_DISABLE_SNAPSHOT` | Set to `1` to disable live preview payload mirroring |
| `STATUSLINE_LAST_PAYLOAD_PATH` | Overrides snapshot storage path |

**Privacy & Snapshot Behavior:** During normal `agy` usage, the renderer mirrors the latest status payload (throttled to at most once every 2 seconds, file mode `0600`) to `~/.gemini/antigravity-cli/plugin_data/custom-statusline/last-payload.json`. This allows `--preview` and `--ui` to display your real active model, context usage, and quota instead of static dummy numbers. Set `STATUSLINE_DISABLE_SNAPSHOT=1` to opt out at any time.

---

## Troubleshooting, Upgrading & Uninstall

Run the built-in diagnostic check first:

```bash
"$STATUSLINE" --doctor
```

- **Plugin installed, but status line still looks built-in:** `agy plugin install` only stages the plugin; run `"$STATUSLINE" --install` (or `/statusline-config`) to wire `statusLine` in `~/.gemini/antigravity-cli/settings.json`. If `--doctor` says `statusLine.enabled` is `false`, re-run `--install` or `/statusline on`.
- **Existing external `statusLine.command` skipped:** `--install` protects custom wrappers by default. Inspect what is configured with `"$STATUSLINE" --show`, and pass `"$STATUSLINE" --install --force` only if you want `custom-statusline` to take over directly.
- **No colors rendered:** Check whether `NO_COLOR` is exported in your shell or `colorScheme` is set to `"none"`.
- **`--ui --open` fails over SSH / headless terminal:** Press `Ctrl+Z` inside `agy`, run `"$STATUSLINE" --ui`, press `Q` when finished, then run `fg` to return to `agy`.
- **Upgrading:** Re-run `agy plugin install https://github.com/ffyfox/agy-custom-statusline`. Your `~/.gemini/antigravity-cli/statusline.config.json` is stored outside the plugin directory and stays intact.
- **Clean Uninstall:** Run `"$STATUSLINE" --uninstall && agy plugin uninstall custom-statusline` to revert `agy` to its built-in status line (delete `~/.gemini/antigravity-cli/statusline.config.json` manually only if you no longer want to keep your preferences).
