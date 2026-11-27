---
name: statusline-config
description: Guided interactive setup, preset switching, widget toggling/reordering, live terminal preview, and troubleshooting for the Antigravity CLI (agy) status line. Trigger whenever the user asks to configure, customize, preview, diagnose, or reset their CLI status line.
---

# Custom Status Line Guided Configuration

This skill guides users step-by-step through setting up, customizing, previewing, and troubleshooting the Antigravity CLI (`agy`) TUI status line via the `custom-statusline` plugin.

## Core Rules

1. **Follow the user's language**: Reply in the same language the user is speaking (e.g. Chinese or English), and pass `--lang zh` or `--lang en` to CLI commands accordingly.
2. **Never hardcode user home directories**: Resolve `MANAGE_SCRIPT` relative to this `SKILL.md` (`../../scripts/manage-statusline.js`), falling back to `~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js` only if needed.
3. **Explain options in plain language before asking**: Never assume the user knows JSON keys or internal field names. Explain what each option displays and how it behaves before asking via `ask_question`.
4. **Confirm one topic at a time and mutate atomically**: Use `manage-statusline.js` commands (`--install`, `--preset`, `--add`, `--remove`, `--move`, `--set`, `--reset-config`) instead of fragile manual JSON edits.
5. **Never silently overwrite an external command**: If `settings.json` already points to a third-party/wrapper `statusLine.command` (`settingsStatus: "external"`), explain what it currently points to and ask confirmation before passing `--force`.
6. **Live hot reload**: `agy` refreshes the status line automatically within ~300 ms whenever `~/.gemini/antigravity-cli/statusline.config.json` changes — no restart required.

---

## Guided Workflow

### Step 1: Diagnose & Inspect Current State

Resolve the helper script path and run `--doctor --json` and `--show --json` first:

```bash
MANAGE="$(cd "$(dirname "<SKILL_DIR>/../..")" && pwd)/scripts/manage-statusline.js"
node "$MANAGE" --doctor --json --lang <en|zh>
node "$MANAGE" --show --json --lang <en|zh>
```

Check `installation.settingsStatus`:
- **`missing` or `disabled`**: Explain cleanly that `custom-statusline` is installed as a plugin, but `~/.gemini/antigravity-cli/settings.json` is not yet hooked up to render it (or `statusLine.enabled` is `false`). Ask via `ask_question` whether to activate it right now, then run `node "$MANAGE" --install`.
- **`external`**: Mention that `settings.json` currently points to an external wrapper/custom command (`currentCommand`) while user layout preferences still live in `~/.gemini/antigravity-cli/statusline.config.json`. Continue reading/editing `statusline.config.json` normally without overwriting `settings.json` unless the user explicitly asks to switch directly to `--install --force`.
- **`configured`**: Active and healthy.

### Step 2: Show Current Preview & Present Choices

Run a plain-text preview (plus note the terminal TUI option):

```bash
node "$MANAGE" --preview --plain --scenario normal --lang <en|zh>
```

Show the user:
1. What their status line currently renders (left side vs. right side).
2. Mention they can either let you launch the real-color interactive keyboard editor directly right now in an overlay/window, or run `node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --ui --open` anytime.
3. Use `ask_question` to ask what direction they want next (explain each option plainly before asking):
   - **Launch the interactive visual configurator** — pops open a real-color keyboard editor right in an overlay/window, auto-saves live within ~300 ms, and returns straight back to `agy` when you press `Q`
   - **Apply a built-in preset** (`official`, `minimal`, `balanced`, `hud`, `developer`)
   - **Add or remove widgets** (browse the 19-widget gallery)
   - **Reorder or move widgets** between left and right sides
   - **Tune widget options / appearance** (quota bucket, context format, cache metrics, color scheme, separators)
   - **Diagnose, reset, or uninstall**

### Step 3: Execute Focused Guided Changes

- **Interactive Visual Configurator**: ONLY run this after the user explicitly selects this option (never spawn an overlay/window unprompted):
  ```bash
  node "$MANAGE" --ui --open --json --lang <en|zh>
  ```
  - If JSON output has `"ok": true`: tell the user which `method` opened the configurator, remind them every change auto-saves within ~300 ms, `U` restores the pre-session snapshot, and pressing `Q` returns straight back to `agy`.
  - If `"ok": false`: display `fallbackCommand` from the JSON output and explain the `Ctrl+Z` → run command → `Q` → `fg` workflow so they can launch it cleanly without leaving the session.

- **Presets**: Run `node "$MANAGE" --presets --plain --lang <en|zh>` so the user sees all 5 presets side-by-side (`official`, `minimal`, `balanced`, `hud`, `developer`). Remind them that applying a preset updates the layout and resets widget options to defaults while keeping `colorScheme`, separators, and `locale`. Confirm choice via `ask_question`, then apply:
  ```bash
  node "$MANAGE" --preset <name>
  ```
- **Gallery & Adding/Removing Widgets**: Run `node "$MANAGE" --gallery --plain --lang <en|zh>` to list all 19 widgets with live sample values, then apply changes:
  ```bash
  node "$MANAGE" --add <left|right> <widget> [--at <index>]
  node "$MANAGE" --remove <left|right|both> <widget>
  node "$MANAGE" --move <left|right> <widget> <index>
  ```
- **Tuning Options & Appearance**: Explain allowed values in plain language first, confirm via `ask_question`, then apply:
  ```bash
  node "$MANAGE" --set <widget>.<option>=<value>
  node "$MANAGE" --set colorScheme=<palette>
  node "$MANAGE" --set locale=<auto|en|zh>
  node "$MANAGE" --set statusLocale=<en|zh|auto>
  ```

### Step 4: Verify & Summarize

After finishing edits, always run:

```bash
node "$MANAGE" --preview --plain --lang <en|zh>
node "$MANAGE" --doctor --json --lang <en|zh>
```

Present the updated preview (Normal / Alert / Narrow) and remind the user that the bottom status line of their running `agy` session updates automatically within ~300 ms.

---

## Reference Catalog (19 Widgets & Schema)

- Full JSON Schema: [`schemas/statusline.schema.json`](../../schemas/statusline.schema.json)
- Documentation: [`README.md`](../../README.md) · [`README.zh-CN.md`](../../README.zh-CN.md)

### Built-in Official Widgets
- `vim`: `-- INSERT --` / `-- VISUAL --` / `-- V-LINE --` (always space-joined to next left widget)
- `shortcuts`: `? for shortcuts` (`text`)
- `tasks`: `%d task(s) · /tasks` (`showCommandHint`)
- `subagents`: `%d subagent(s)` (`includeCompleted`)
- `mode`: `plan`, `auto`, `accept-edits`, `best-of-n` (`uppercase`)
- `model`: Model / Orchestrator & effort (`orchestratorStyle`: `official` | `both` | `model_only`, `showEffort`)

### Extended Widgets
- `context`: Context usage (`format`: `percent` | `bar` | `bar_percent` | `tokens`, `prefix`, `barWidth`, `showWhenZero`, `warnAtPercent`, `criticalAtPercent`)
- `context_extra`: Cache hit rate / hit tokens / `>200k` badge (`showCacheRate`, `showCacheTokens`, `showExceeds200k`, `cachePrefix`, `exceeds200kText`, `showPlaceholder`)
- `quota`: Model rate-limit quota (`bucket`: `gemini-5h`, `gemini-weekly`, `3p-5h`, `3p-weekly`, `gemini-5h+weekly`, `3p-5h+weekly`; `format`: `percent` | `bar` | `bar_percent`, `barWidth`, `metric`: `remaining` | `used`, `prefix`, `showReset`: `none` | `5h` | `weekly` | `both`, `warnBelowPercent`, `criticalBelowPercent`)
- `git`: Branch + dirty `*` (`showDirty`, `maxLength`)
- `cwd`: Directory label (`style`: `basename` | `short`)
- `state`: Agent state (`hideWhenIdle`)
- `artifacts`: Artifact count when > 0
- `queued`: Pending queued message count in orange when > 0
- `sandbox`: `sandbox ON` / `sandbox off` (`onlyWhenEnabled`)
- `cost`: Session USD estimate (`decimals`)
- `title`: Conversation title with CJK width-aware truncation (`maxLength`, `prefix`)
- `confirm`: Bold orange alert when `tool_confirmation_pending` is true (`text`)
- `conversation_id`: Short prefix or full conversation UUID (`length`, `prefix`)
