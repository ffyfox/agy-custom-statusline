English | [简体中文](./README.zh-CN.md)

# Custom Status Line (`custom-statusline`)

A modular, zero-dependency, JSON-configurable status line plugin for **Antigravity CLI (`agy`)**. It matches the official built-in status line layout and all 8 official color palettes out of the box, while giving you 19 widgets, 5 presets, a real-color interactive terminal configurator (`--ui`), a guided `/statusline-config` skill, and JSON Schema autocomplete.

## Features

- **1:1 Official Default Parity**: Matches built-in spacing, colors, narrow-terminal compaction, and Orchestrator planner/effort formatting (`Orchestrator · Gemini 4 Neon · high`).
- **19 Configurable Widgets**: All 6 built-in widgets plus 13 extended widgets (`context`, `context_extra` cache hit rate/tokens/`>200k`, 6 `quota` single & `5h|weekly` paired modes, `git`, `cwd`, `state`, `artifacts`, `queued`, `sandbox`, `cost`, `title`, `confirm`, `conversation_id`).
- **5 Ready-to-Use Presets**: `official`, `minimal`, `balanced`, `hud`, and `developer`.
- **Interactive Terminal Configurator (`--ui`)**: Full-screen ANSI true-color live preview, scenario switcher (normal / alert / narrow / gallery), theme cycling, per-widget option editor, EN/ZH live toggle (`G`), auto-save (reloads in `agy` within ~300 ms), one-key session snapshot undo (`U`), and `--ui --open` overlay/window launching.
- **Guided `/statusline-config` Skill**: Type `/statusline-config` inside `agy` for an interactive step-by-step assistant that can launch `--ui` directly, inspect your setup, preview changes, and edit safely.
- **JSON Schema Support**: Ships `schemas/statusline.schema.json` for editor validation and autocomplete in `~/.gemini/antigravity-cli/statusline.config.json`.

## Quick Start

### 1. Install the Plugin

```bash
agy plugin install https://github.com/ffyfox/agy-custom-statusline
```

### 2. Activate in Antigravity CLI

`agy` uses `~/.gemini/antigravity-cli/settings.json` to launch custom status lines. Activate it with either:

- **Inside `agy`**: Run `/statusline-config` and follow the guided prompt.
- **From your terminal**:
  ```bash
  node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --install
  ```
  > Safe by default: `--install` never overwrites an existing external `statusLine.command` (unless `--force` is passed) and never overwrites an existing `statusline.config.json`.

### 3. Customize Visually or via Presets

```bash
# Open the interactive terminal configurator (auto-saves + Undo with U)
node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --ui

# Or auto-open in a terminal overlay / new window (works from /statusline-config too)
node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --ui --open overlay

# Preview all 5 built-in presets, then apply one
node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --presets
node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --preset balanced

# Browse all 19 widgets rendered with live ANSI colors
node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --gallery
```

## Presets

| Preset | Left Side | Right Side | Best For |
| :--- | :--- | :--- | :--- |
| `official` | `vim`, `shortcuts` | `tasks`, `subagents`, `mode`, `model` | 1:1 official built-in look |
| `minimal` | `vim`, `confirm`, `git` | `context` (`%`), `mode`, `model` | Clean 80-col narrow terminals |
| `balanced` | `vim`, `confirm`, `queued`, `cwd`, `git` | `context` (`%`), `quota` (`5h\|weekly`), `tasks`, `subagents`, `mode`, `model` | Everyday default coding workflow |
| `hud` | `vim`, `confirm`, `queued`, `cwd`, `git` | `context` (`bar_percent` 6), `quota` (`5h\|weekly` `bar_percent` 5), `tasks`, `subagents`, `mode`, `model` | Dual progress-bar dashboard view |
| `developer` | `vim`, `confirm`, `queued`, `cwd`, `git` | `context` (`tokens`), `context_extra` (`cache%`, `>200k`), `quota` (`5h\|weekly`), `tasks`, `subagents`, `mode`, `model` | High-density engineering telemetry |

> Note: Applying a preset updates `left`/`right` layout and resets per-widget options (`widgets.*`) to defaults, while preserving your `colorScheme`, `separator`, `leftSeparator`, `locale`, and `statusLocale`.

## Interactive TUI (`--ui`) Shortcuts

| Key | Action (Main View) |
| :--- | :--- |
| `↑` / `↓` (`j` / `k`) | Move cursor across Left, Right, and Available widgets |
| `Space` | Toggle widget on/off |
| `←` / `→` (`x`) | Move widget between Left and Right sides |
| `[` / `]` (`Shift+↑` / `Shift+↓`) | Reorder widget within its side |
| `Enter` | Open options sub-panel for selected widget |
| `P` | Open Preset Picker with live previews |
| `T` | Cycle color theme (`auto`, `light`, `dark`, `solarized *`, `colorblind *`, `tokyo night`, `terminal`, `none`) |
| `L` | Cycle status line text language (`en` → `zh` → `auto`, saved to `statusLocale`) |
| `V` | Cycle live preview scenario (`normal`, `alert`, `narrow`, `gallery`) |
| `G` | Toggle UI language live (`EN` ↔ `中文`, saved to `locale`) |
| `I` | Activate plugin in `settings.json` (only shown when unconfigured/disabled) |
| `U` | Undo all changes made in this session (restores exact snapshot) |
| `Q` / `Esc` | Quit cleanly (changes are already auto-saved) |

## CLI Reference

Add `--lang zh` or `--lang en` to any command to force output language.

```bash
# Lifecycle & Setup
manage-statusline.js --install [--force]
manage-statusline.js --uninstall [--force]
manage-statusline.js --reset-config
manage-statusline.js --doctor [--json]

# Visual Preview & Discovery
manage-statusline.js --ui
manage-statusline.js --ui --open [overlay|window|split]
manage-statusline.js --preview [--scenario normal|alert|narrow|all] [--width N] [--scheme NAME] [--plain]
manage-statusline.js --gallery [--scheme NAME] [--plain]
manage-statusline.js --presets [--scheme NAME] [--plain]
manage-statusline.js --watch [--scenario normal|alert|narrow] [--scheme NAME]
manage-statusline.js --show [--json]

# Atomic Configuration Mutations
manage-statusline.js --preset <official|minimal|balanced|hud|developer>
manage-statusline.js --add <left|right> <widget> [--at <index>]
manage-statusline.js --remove <left|right|both> <widget>
manage-statusline.js --move <left|right> <widget> <index>
manage-statusline.js --set <path>=<value>   # e.g. quota.bucket=3p-5h+weekly, colorScheme=tokyo night
```

## Widget Catalog (19 Widgets)

| Widget | Category | Description | Key Options |
| :--- | :---: | :--- | :--- |
| `vim` | Built-in | `-- INSERT --`, `-- VISUAL --`, `-- V-LINE --` | `enabled` |
| `shortcuts` | Built-in | `? for shortcuts` hint | `text` |
| `tasks` | Built-in | Running tasks (`%d task(s) · /tasks`) | `showCommandHint` |
| `subagents` | Built-in | Running subagents (`%d subagent(s)`) | `includeCompleted` |
| `mode` | Built-in | Execution cycle mode (`auto`, `plan`, etc.) | `uppercase` |
| `model` | Built-in | Model / Orchestrator & reasoning effort | `orchestratorStyle` (`official`\|`both`\|`model_only`), `showEffort` |
| `context` | Extended | Context usage with warn/critical colors | `format` (`percent`\|`bar`\|`bar_percent`\|`tokens`), `prefix`, `barWidth`, `showWhenZero`, `warnAtPercent`, `criticalAtPercent` |
| `context_extra` | Extended | Prompt cache hit rate/tokens & `>200k` badge | `showCacheRate`, `showCacheTokens`, `showExceeds200k`, `cachePrefix`, `exceeds200kText`, `showPlaceholder` |
| `quota` | Extended | Model quota (`88%`, `█████░`, or `█████░ 88%`) | `bucket` (`gemini-5h`, `gemini-weekly`, `3p-5h`, `3p-weekly`, `gemini-5h+weekly`, `3p-5h+weekly`), `format` (`percent`\|`bar`\|`bar_percent`), `barWidth`, `metric` (`remaining`\|`used`), `showReset` (`none`\|`5h`\|`weekly`\|`both`), thresholds |
| `git` | Extended | Fast `.git/HEAD` branch + dirty `*` flag | `showDirty`, `maxLength` |
| `cwd` | Extended | Current directory name or `~/path` | `style` (`basename`\|`short`) |
| `state` | Extended | Agent runtime state (`working`, `tool_use`, …) | `hideWhenIdle` |
| `artifacts` | Extended | Artifact count when > 0 | `enabled` |
| `queued` | Extended | Queued input count in orange when > 0 | `enabled` |
| `sandbox` | Extended | Terminal sandbox status | `onlyWhenEnabled` |
| `cost` | Extended | Estimated session USD spend | `decimals` |
| `title` | Extended | Conversation title (CJK width-aware truncation) | `maxLength`, `prefix` |
| `confirm` | Extended | Bold orange alert during pending confirmation | `text` |
| `conversation_id` | Extended | Short or full conversation UUID | `length`, `prefix` |

## Configuration File (`~/.gemini/antigravity-cli/statusline.config.json`)

User preferences live outside the plugin directory so updates never overwrite your setup, and changes apply live within ~300 ms. Running `--install`, `--preset`, `--set`, or `--ui` automatically populates the `$schema` `file://` URI pointing to your installed `schemas/statusline.schema.json` for editor validation and autocomplete:

```json
{
  "version": 1,
  "locale": "auto",
  "statusLocale": "en",
  "colorScheme": "auto",
  "separator": " · ",
  "leftSeparator": " · ",
  "left": ["vim", "confirm", "queued", "cwd", "git"],
  "right": ["context", "quota", "tasks", "subagents", "mode", "model"]
}
```

## Troubleshooting

Run the built-in diagnostics anytime:

```bash
node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --doctor
```

## Development & Testing

```bash
# Run the portable zero-dependency verification suite
node test/verify.js

# Validate plugin manifest, skill structure, and permissions with agy
agy plugin validate --strict .
```

## License

Released under the [MIT](./LICENSE) License.
