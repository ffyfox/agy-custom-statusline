[← 返回 README](../README.zh-CN.md) · [English](./reference.md) | 简体中文

# 自定义状态栏插件 (`custom-statusline`) — 完整参考手册

本文档提供 `custom-statusline` 的全部命令行参数、交互式 TUI 快捷键、`--ui --open` 终端适配矩阵、19 个组件详细参数、10 个配色方案枚举、配置 Schema、环境变量及故障排查指南。

## 目录

- [命令行全参数指南](#命令行全参数指南)
- [交互式 TUI（`--ui`）与外部拉起（`--ui --open`）](#交互式-tui--ui与外部拉起--ui---open)
- [全部 19 个组件清单](#全部-19-个组件清单)
- [配色方案（全部 10 个枚举值）](#配色方案全部-10-个枚举值)
- [配置文件与 JSON Schema](#配置文件与-json-schema)
- [环境变量与实时预览快照](#环境变量与实时预览快照)
- [故障排查、升级与卸载](#故障排查升级与卸载)

---

## 命令行全参数指南

> **提示：** 日常配置最推荐的方式是直接在 `agy` 内运行 `/statusline-config`——既可让 Agent 对话引导完成激活、调参、体检或卸载，也能一键弹起可视化 TUI，无需记忆脚本路径。下方 CLI 命令主要供外部终端直接调用或脚本自动化使用。

先在当前 Shell 中定义一个便捷变量（Linux / macOS 下脚本已自带可执行权限；Windows 请用 `node "$STATUSLINE" ...`）：

```bash
STATUSLINE="$HOME/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js"
```

所有命令均自动识别系统语言，并支持 `--lang <en|zh>`、`--config <路径>` 与 `-h` / `--help`。

```bash
# 安装、恢复与健康体检
"$STATUSLINE" --install [--force]
"$STATUSLINE" --uninstall [--force]
"$STATUSLINE" --reset-config
"$STATUSLINE" --doctor [--json]

# 可视化配置与即时预览
"$STATUSLINE" --ui
"$STATUSLINE" --ui --open [auto|overlay|window|split] [--json]   # 别名：--open-ui
"$STATUSLINE" --preview [--preset 预设名] [--scenario normal|alert|narrow|all] [--width 列数] [--scheme 主题] [--plain]
"$STATUSLINE" --gallery [--scheme 主题] [--plain]
"$STATUSLINE" --presets [--width 列数] [--scheme 主题] [--plain]
"$STATUSLINE" --watch [--scenario normal|alert|narrow] [--width 列数] [--scheme 主题] [--plain]
"$STATUSLINE" --show [--json]

# 原子化修改（无需手改 JSON）
"$STATUSLINE" --preset <official|minimal|balanced|hud|developer> [--plain]
"$STATUSLINE" --add <left|right> <组件名> [--at <位置>]
"$STATUSLINE" --remove <left|right|both> <组件名>
"$STATUSLINE" --move <left|right> <组件名> <位置>
"$STATUSLINE" --set <路径>=<值>
```

> **含空格的参数值必须加引号：** 在 POSIX Shell 中，包含空格的值（如 `tokyo night`、`solarized dark`、`colorblind-friendly dark` 或带空格的 `separator` / `prefix`）**必须用引号包起来**，否则会被拆成两个参数导致校验失败：
> ```bash
> "$STATUSLINE" --set quota.bucket=3p-5h+weekly
> "$STATUSLINE" --set "colorScheme=tokyo night"
> "$STATUSLINE" --set "separator= | "
> "$STATUSLINE" --set "context.prefix=上下文 "
> ```

---

## 交互式 TUI（`--ui`）与外部拉起（`--ui --open`）

### 主列表视图快捷键

| 快捷键 | 功能说明 |
| :--- | :--- |
| `↑` / `↓`（`j` / `k`） | 在左侧、右侧与未启用组件之间移动光标 |
| `Space`（空格） | 一键开启 / 关闭当前组件 |
| `←` / `→`（`x`） | 将当前组件切换到左侧或右侧显示区（`x` 为左右对调） |
| `[` / `]`（`Shift+↑` / `Shift+↓`、`J` / `K`） | 调整当前组件在同侧区域内的前后顺序 |
| `Enter` | 进入当前组件的子参数详情页 |
| `P` | 打开预设选择器（直接预览 5 套预设效果） |
| `T` | 循环切换全部 10 个 `colorScheme` 配色方案 |
| `L` | 循环切换状态栏显示语言（`en` → `zh` → `auto`，写入 `statusLocale`） |
| `V` | 切换顶部实时预览的模拟场景（常规 / 告警 / 窄屏 / 全样） |
| `G` | 实时切换配置器界面语言（`中文` ↔ `English`，写入 `locale`） |
| `I` | 一键写入并激活 `settings.json`（仅在未接入或停用时提示；若已有外部命令会二次确认） |
| `U` | 撤销本次打开配置器以来的所有修改，瞬间恢复进入前快照 |
| `Q` / `Esc` | 退出配置器（所有更改均已实时自动保存，约 300 ms 生效） |

### 子面板快捷键（`Enter` 参数编辑页 & `P` 预设选择器）

| 按键 | 参数编辑页（`Enter`） | 预设选择器（`P`） |
| :--- | :--- | :--- |
| `↑` / `↓`（`j` / `k`） | 上下切换子参数 | 上下切换 5 套预设 |
| `Space` / `←` / `→` | 开关布尔值或循环切换枚举值 | `Space` / `Enter`：应用预设 |
| `+` / `-`（`=` / `-`、`←` / `→`） | 增减整数或数值阈值（如告警百分比、进度条宽度） | — |
| `Enter` | 进入文本编辑模式（`Enter` 保存、`Esc` 取消、`Backspace` 退格） | 应用当前高亮预设 |
| `Esc` / `Backspace` / `B` | 返回主列表视图 | 按 `Esc` 或 `P` 返回主列表 |
| `U` / `Q` | `U` 还原进入前快照 · `Q` 退出 | `Esc` / `P` 取消 |

### 外部拉起（`--ui --open`）终端兼容矩阵

`--ui --open [模式]`（别名 `--open-ui`）可在 `agy` 会话内直接弹出交互式配置器，关闭后无缝回到原会话：

| 模式 | 行为说明 |
| :--- | :--- |
| `auto`（默认）/ `overlay` | 优先使用浮层/弹窗（Kitty overlay、tmux popup、Zellij floating），其次分屏，最后新开桌面终端窗口 |
| `split` | 打开相邻分屏（Kitty split、tmux split、WezTerm split、Zellij split），不可用时回退桌面终端窗口 |
| `window` | 打开独立终端窗口（Linux 桌面终端、macOS iTerm2/Terminal、Windows Terminal/`cmd.exe`、tmux/WezTerm 新窗口） |

已适配环境：
- **终端复用器 / 终端控制协议**：Kitty（`KITTY_LISTEN_ON`）、tmux（`TMUX`）、Zellij（`ZELLIJ`）、WezTerm（`WEZTERM_PANE`）。
- **Linux 桌面环境（Wayland / X11）**：`kitty`、`konsole`、`ghostty`、`alacritty`、`wezterm`、`foot`、`gnome-terminal`、`xfce4-terminal`、`xdg-terminal-exec`、`x-terminal-emulator`、`xterm`。
- **macOS**：iTerm2（`osascript`）、Terminal.app（`osascript`）。
- **Windows**：Windows Terminal（`wt`）、`cmd.exe`。
- **无图形界面 / SSH 降级方案**：若当前环境无法自动弹窗，在 `agy` 中按 `Ctrl+Z` 挂起会话 → 执行 `"$STATUSLINE" --ui` → 调完按 `Q` 退出 → 输入 `fg` 即可恢复 `agy`。

---

## 全部 19 个组件清单

> 说明：全部 19 个组件均支持在 `widgets.<组件ID>.enabled` 中设置开关（默认 `true`）。

| 组件 ID | 分类 | 说明 | 可调参数 |
| :--- | :---: | :--- | :--- |
| `vim` | 官方 | `-- INSERT --`、`-- VISUAL --`、`-- V-LINE --` | `enabled` |
| `shortcuts` | 官方 | 左侧 `? for shortcuts` 提示（可移除或自定义文本） | `text` |
| `tasks` | 官方 | 后台任务计数（`%d task(s) · /tasks`） | `showCommandHint` |
| `subagents` | 官方 | 活跃子代理计数（`%d subagent(s)`） | `includeCompleted` |
| `mode` | 官方 | 执行模式（`auto`、`plan`、`accept-edits`、`best-of-n`） | `uppercase` |
| `model` | 官方 | 模型名称 / Orchestrator 调度与推理强度 | `orchestratorStyle`（`official` \| `both` \| `model_only`）、`showEffort` |
| `context` | 扩展 | 上下文窗口占用（支持 `percent`、`bar`、`bar_percent`、`tokens` 如 `ctx 14% (149k/1.0M)` 与橙红预警） | `format`、`prefix`、`barWidth`、`showWhenZero`、`warnAtPercent`、`criticalAtPercent` |
| `context_extra` | 扩展 | Prompt 缓存命中率、命中 token 量及 `>200k` 橙标 | `showCacheRate`、`showCacheTokens`、`showExceeds200k`、`cachePrefix`、`exceeds200kText`、`showPlaceholder` |
| `quota` | 扩展 | 模型配额监控，支持单桶或 `5h\|周` 双桶模式（如 `82%\|64%`、`████░ 82% \| ███░░ 64%`） | `bucket`（`gemini-5h`、`gemini-weekly`、`3p-5h`、`3p-weekly`、`gemini-5h+weekly`、`3p-5h+weekly`）、`format`（`percent` \| `bar` \| `bar_percent`）、`metric`（`remaining` \| `used`）、`prefix`、`barWidth`、`showReset`（`none` \| `5h` \| `weekly` \| `both`）、`warnBelowPercent`、`criticalBelowPercent` |
| `git` | 扩展 | 快速读取 `.git/HEAD` 分支名与未提交 `*` 标记 | `showDirty`、`maxLength` |
| `cwd` | 扩展 | 当前工作目录名或 `~/...` 短路径 | `style`（`basename` \| `short`） |
| `state` | 扩展 | Agent 运行状态（`working`、`tool_use`、`reviewing`、`error` 等） | `hideWhenIdle` |
| `artifacts` | 扩展 | 产物计数（>0 时显示） | `enabled` |
| `queued` | 扩展 | 排队待发消息计数（>0 时橙色显示） | `enabled` |
| `sandbox` | 扩展 | 终端沙箱状态徽章（`sandbox ON` / `sandbox off`） | `onlyWhenEnabled` |
| `cost` | 扩展 | 会话预估美元开销（>0 时显示） | `decimals` |
| `title` | 扩展 | 当前对话标题（支持中英文等宽字符精准截断） | `maxLength`、`prefix` |
| `confirm` | 扩展 | 等待人工批准工具调用时显示加粗橙色提醒 | `text` |
| `conversation_id` | 扩展 | 当前对话短前缀或完整 UUID | `length`（`0` 表示完整 UUID）、`prefix` |

---

## 配色方案（全部 10 个枚举值）

`colorScheme` 字段及 `--set` / `--scheme` 支持的完整枚举值：

| 枚举值 | 说明 |
| :--- | :--- |
| `auto` | 默认值，自动跟随 `~/.gemini/antigravity-cli/settings.json` 中的 `colorScheme`（未设置时回退到 `terminal`） |
| `none` | 禁用所有 ANSI 颜色转义符（纯文本显示） |
| `light` | 官方浅色主题 |
| `solarized light` | 官方 Solarized Light 主题 |
| `colorblind-friendly light` | 官方色觉友好浅色主题 |
| `dark` | 官方深色主题 |
| `solarized dark` | 官方 Solarized Dark 主题 |
| `colorblind-friendly dark` | 官方色觉友好深色主题 |
| `tokyo night` | 官方 Tokyo Night 主题 |
| `terminal` | 跟随终端自身的 16 色调色板 |

---

## 配置文件与 JSON Schema

个人偏好保存在 `~/.gemini/antigravity-cli/statusline.config.json`（位于插件目录之外，升级插件不会覆盖配置），修改后 `agy` 会在 ~300 ms 内热更新生效。

- 执行 `--install` 或 `--reset-config` 生成的初始配置为 **`official` 原版默认布局**（`left: ["vim", "shortcuts"]`、`right: ["tasks", "subagents", "mode", "model"]`）。
- **`locale`** 控制命令行提示与 `--ui` 配置器界面语言（`auto`、`en`、`zh`）。
- **`statusLocale`** 独立控制状态栏本体标签语言（`en`、`zh`、`auto`）：仅翻译内置默认标签（如 `ctx `、`quota `、`cache `、`confirm!`、`queued` 等），**会保留你自己自定义的 `prefix` 或 `text`**。
- 执行 `--install`、`--preset`、`--set` 或 `--ui` 时，工具会自动把 `$schema` 设为指向本机 [schemas/statusline.schema.json](../schemas/statusline.schema.json) 的 `file://` URI，提供编辑器自动补全与校验。

以下为 **`balanced` 预设 + 自定义子参数** 示例（非初始默认值）：

```json
{
  "$schema": "file:///path/to/plugins/custom-statusline/schemas/statusline.schema.json",
  "version": 1,
  "locale": "auto",
  "statusLocale": "zh",
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

## 环境变量与实时预览快照

| 环境变量 | 作用 |
| :--- | :--- |
| `NO_COLOR` | 设任意非空值时禁用状态栏 ANSI 颜色输出 |
| `STATUSLINE_CONFIG` | 覆盖个人配置文件路径（默认 `~/.gemini/antigravity-cli/statusline.config.json`） |
| `STATUSLINE_LANG` | 强制指定 CLI / TUI 语言（`en` 或 `zh`） |
| `AGY_SETTINGS_PATH` | 覆盖 `agy` 的 `settings.json` 路径 |
| `STATUSLINE_DISABLE_SNAPSHOT` | 设为 `1` 可关闭实时预览快照镜像 |
| `STATUSLINE_LAST_PAYLOAD_PATH` | 覆盖实时预览快照的保存路径 |

**隐私与实时快照说明：** `agy` 运行期间，渲染器会以最多每 2 秒一次的频率、按 `0600` 权限把最新状态 payload 镜像到 `~/.gemini/antigravity-cli/plugin_data/custom-statusline/last-payload.json`，以便 `--preview` 和 `--ui` 直接渲染你当前的真实模型、上下文与配额数据。若不需要此行为，随时设置 `STATUSLINE_DISABLE_SNAPSHOT=1` 即可关闭。

---

## 故障排查、升级与卸载

遇到问题先跑一次自带诊断体检：

```bash
"$STATUSLINE" --doctor --lang zh
```

- **已安装插件但状态栏还是官方原版：** `agy plugin install` 只负责安装插件文件，还需运行 `"$STATUSLINE" --install`（或在 `agy` 内执行 `/statusline-config`）来挂载 `settings.json`。若体检提示 `statusLine.enabled` 为 `false`，重新执行 `--install` 或在 `agy` 中运行 `/statusline on`。
- **提示检测到外部 `statusLine.command` 并跳过：** `--install` 默认不覆盖你原本的自定义包装脚本。可先用 `"$STATUSLINE" --show` 查看当前命令，确认要接管后再加 `--force`：`"$STATUSLINE" --install --force`。
- **终端里完全没有颜色：** 检查环境变量是否设置了 `NO_COLOR`，或配置里的 `colorScheme` 是否被设为 `"none"`。
- **SSH / 无桌面环境下 `--ui --open` 无法弹窗：** 在 `agy` 中按 `Ctrl+Z` 挂起 → 运行 `"$STATUSLINE" --ui` → 按 `Q` 退出 → 输入 `fg` 回到 `agy`。
- **升级插件：** 重新执行 `agy plugin install https://github.com/ffyfox/agy-custom-statusline`，个人配置 `statusline.config.json` 存放在插件目录外，不会被覆盖。
- **完整卸载：** 执行 `"$STATUSLINE" --uninstall && agy plugin uninstall custom-statusline` 即可恢复原生状态栏并卸载插件（如需连同个人配置一并清理，再手动删除 `~/.gemini/antigravity-cli/statusline.config.json`）。
