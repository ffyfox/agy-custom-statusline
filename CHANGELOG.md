# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-27

### Added

- **Official `agy` parity**: 1:1 reproduction of the built-in Antigravity CLI status line layout, spacing, 8 official color palettes, narrow-terminal compaction, and Orchestrator planner/effort formatting (`Orchestrator · <Planner> · <effort>`).
- **19 configurable widgets**: All 6 built-in widgets (`vim`, `shortcuts`, `tasks`, `subagents`, `mode`, `model`) plus 13 extended widgets (`context`, `context_extra`, `quota`, `git`, `cwd`, `state`, `artifacts`, `queued`, `sandbox`, `cost`, `title`, `confirm`, `conversation_id`).
- **`context` & `quota` flexible views**:
  - `context.format`: `percent`, `bar`, `bar_percent`, and `tokens` with warn/critical thresholds and narrow-terminal fallback.
  - `quota.bucket`: 6 single and `5h|weekly` paired modes (`gemini-5h`, `gemini-weekly`, `3p-5h`, `3p-weekly`, `gemini-5h+weekly`, `3p-5h+weekly`) with `percent` / `bar` / `bar_percent` formats and per-bucket `showReset` (`none` | `5h` | `weekly` | `both`).
- **5 ready-to-use presets**: `official`, `minimal`, `balanced`, `hud`, and `developer`.
- **Interactive terminal configurator (`--ui`)**: Full-screen ANSI true-color live preview, scenario switcher (`normal`, `alert`, `narrow`, `gallery`), theme cycling (`T`), status line language cycling (`L`), UI language toggle (`G`), per-widget option editor, auto-save, session snapshot undo (`U`), and `--ui --open` overlay/window launcher.
- **Optional status line localization (`statusLocale`)**: Independent `en` | `zh` | `auto` status line text localization that preserves user-customized labels and prefixes.
- **Guided setup & diagnostics**: Bundled `/statusline-config` skill, `--install` / `--uninstall` safety guards, `--doctor` diagnostics, throttled live payload snapshot mirroring for accurate previews, and JSON Schema (`schemas/statusline.schema.json`).
- **Verification & CI**: Zero-dependency portable verification suite (`test/verify.js`) and GitHub Actions workflow.
