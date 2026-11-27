[English](./README.md) | 简体中文

# 自定义状态栏插件 (`custom-statusline`)

一个零外部依赖、模块化、可通过 JSON / 终端交互界面 / 斜杠引导向导自由定制的 **Antigravity CLI (`agy`)** 状态栏插件。开箱即 1:1 还原官方内置状态栏布局与 8 套官方色板，同时提供 **19 个组件**、**5 套精选预设**、**实时真彩交互配置器（`--ui`）**、**`/statusline-config` 对话引导向导** 与 **JSON Schema 智能提示**。

## 核心特性

- **1:1 还原官方默认体验**：间距、颜色、窄屏自适应折叠以及 Orchestrator 规划/执行模型展示均严格对齐 `agy` 原生逻辑。
- **19 个可组合组件**：涵盖全部 6 个官方组件与 13 个扩展组件（上下文占比/进度条、`context_extra` 缓存命中率/命中 token/`>200k` 徽章、6 种配额单双桶组合 `5h|周`、Git 分支与脏区标记、目录、运行状态、产物数、排队数、沙箱、费用、对话标题、工具确认提醒、对话 ID）。
- **5 套内置预设模板**：`official`（官方原版）、`minimal`（极简专注）、`balanced`（均衡日常）、`hud`（进度条仪表盘）、`developer`（高密度开发）。
- **交互式终端配置器（`--ui`）**：顶部固定实时真彩预览、底部完整选中组件详情栏、一键切换模拟场景与配色主题、中英文单键热切换（`G`）、逐项编辑组件子参数、按键即自动保存（`agy` 在 ~300 ms 内热更新），还支持按 `U` 一键还原快照与 `--ui --open` 自动浮层/新窗拉起。
- **`/statusline-config` 对话向导**：在 `agy` 里直接输入 `/statusline-config`，不仅能直接帮你弹起 `--ui` 交互界面，也可分步体检、预览并完成配置。
- **JSON Schema 智能校验**：内置 `schemas/statusline.schema.json`，直接打开个人配置 JSON 也能享受下拉补全与拼写校验。

## 快速上手

### 1. 安装插件

```bash
agy plugin install https://github.com/ffyfox/agy-custom-statusline
```

### 2. 启用状态栏挂载

`agy` 通过 `~/.gemini/antigravity-cli/settings.json` 中的 `statusLine` 字段启动自定义状态栏。你可以通过任意一种方式启用：

- **方式 A（最省事）**：在 `agy` 中直接输入 `/statusline-config`，按引导一键激活并选样式。
- **方式 B（命令行）**：
  ```bash
  node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --install
  ```
  > 安全防覆盖机制：若检测到 `settings.json` 已指向其他外部自定义命令，`--install` 默认不会覆盖（除非显式传入 `--force`）；同时绝不会覆盖你已有的 `statusline.config.json`。

### 3. 可视化调整或一键套用预设

```bash
# 打开交互式终端配置器（自动保存 + 按 U 一键还原快照）
node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --ui

# 或在浮层 / 新窗口中自动弹出（/statusline-config 向导内也可直接拉起）
node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --ui --open overlay

# 预览全部 5 套预设并套用其中一套
node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --presets
node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --preset balanced

# 真彩图鉴：查看全部 19 个组件的实际显示效果
node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --gallery
```

## 内置预设模板（5 套）

| 预设名 | 左侧显示区 | 右侧显示区 | 适用场景 |
| :--- | :--- | :--- | :--- |
| `official` | `vim`, `shortcuts` | `tasks`, `subagents`, `mode`, `model` | 1:1 官方原版观感 |
| `minimal` | `vim`, `confirm`, `git` | `context` (`%`), `mode`, `model` | 80 列窄屏极简专注 |
| `balanced` | `vim`, `confirm`, `queued`, `cwd`, `git` | `context` (`%`), `quota` (`5h\|周`), `tasks`, `subagents`, `mode`, `model` | 通用均衡日常主力 |
| `hud` | `vim`, `confirm`, `queued`, `cwd`, `git` | `context` (`6格进度条+%`), `quota` (`5h\|周` `5格进度条+%`), `tasks`, `subagents`, `mode`, `model` | 双进度条仪表盘风格 |
| `developer` | `vim`, `confirm`, `queued`, `cwd`, `git` | `context` (`token比例`), `context_extra` (`命中率`, `>200k`), `quota` (`5h\|周`), `tasks`, `subagents`, `mode`, `model` | 宽屏高密度工程监控 |

> 说明：套用预设会更新布局并重置各组件子参数（`widgets.*`）为默认值，同时保留你当前的配色主题（`colorScheme`）、分隔符、配置器语言（`locale`）与状态栏语言（`statusLocale`）。

## 交互式 TUI（`--ui`）快捷键一览

| 快捷键 | 功能说明（主列表视图） |
| :--- | :--- |
| `↑` / `↓`（`j` / `k`） | 在左侧、右侧与未启用组件之间移动光标 |
| `Space`（空格） | 一键开启 / 关闭当前组件 |
| `←` / `→`（`x`） | 将当前组件切换到左侧或右侧显示区 |
| `[` / `]`（`Shift+↑` / `Shift+↓`） | 调整当前组件在同侧区域内的前后顺序 |
| `Enter` | 进入当前组件的子参数详情页（逐项调整格式、阈值、文本等） |
| `P` | 打开预设选择器（直接预览 5 套预设效果，回车套用） |
| `T` | 循环切换 8 套官方配色主题（`auto`、`light`、`dark`、`tokyo night` 等） |
| `L` | 循环切换状态栏本身显示语言（`en` → `zh` → `auto`，保存到 `statusLocale`） |
| `V` | 切换顶部实时预览的模拟场景（常规 / 告警 / 窄屏 / 全样） |
| `G` | 实时切换界面语言（`中文` ↔ `English`），并记住到 `locale` 配置项 |
| `I` | 一键写入并激活 `settings.json`（仅在未接入或被停用时显示） |
| `U` | 撤销本次打开配置器以来的所有修改，瞬间恢复进入前快照 |
| `Q` / `Esc` | 退出配置器（所有更改均已实时自动保存） |

## 命令行全参数指南

所有命令均自动识别系统语言，也可通过 `--lang zh` 或 `--lang en` 强制指定：

```bash
# 安装、恢复与健康体检
manage-statusline.js --install [--force]
manage-statusline.js --uninstall [--force]
manage-statusline.js --reset-config
manage-statusline.js --doctor [--json]

# 可视化配置与即时预览
manage-statusline.js --ui
manage-statusline.js --ui --open [overlay|window|split]
manage-statusline.js --preview [--scenario normal|alert|narrow|all] [--width 列数] [--scheme 主题] [--plain]
manage-statusline.js --gallery [--scheme 主题] [--plain]
manage-statusline.js --presets [--scheme 主题] [--plain]
manage-statusline.js --watch [--scenario normal|alert|narrow] [--scheme 主题]
manage-statusline.js --show [--json]

# 原子化修改（无需手改 JSON）
manage-statusline.js --preset <official|minimal|balanced|hud|developer>
manage-statusline.js --add <left|right> <组件名> [--at <位置>]
manage-statusline.js --remove <left|right|both> <组件名>
manage-statusline.js --move <left|right> <组件名> <位置>
manage-statusline.js --set <路径>=<值>   # 例：quota.bucket=3p-5h+weekly、colorScheme=tokyo night
```

## 全部 19 个组件清单

| 组件 ID | 分类 | 说明 | 主要可调参数 |
| :--- | :---: | :--- | :--- |
| `vim` | 官方 | `-- INSERT --`、`-- VISUAL --`、`-- V-LINE --` | `enabled` |
| `shortcuts` | 官方 | 左侧 `? for shortcuts` 提示（可移除） | `text` |
| `tasks` | 官方 | 后台任务计数（`%d task(s) · /tasks`） | `showCommandHint` |
| `subagents` | 官方 | 活跃子代理计数（`%d subagent(s)`） | `includeCompleted` |
| `mode` | 官方 | 执行模式（`auto`、`plan`、`accept-edits`、`best-of-n`） | `uppercase` |
| `model` | 官方 | 模型名称 / Orchestrator 调度与推理强度 | `orchestratorStyle`（`official`\|`both`\|`model_only`）、`showEffort` |
| `context` | 扩展 | 上下文窗口占用（支持橙红预警阈值） | `format`（`percent`\|`bar`\|`bar_percent`\|`tokens`）、`prefix`、`barWidth`、`showWhenZero`、`warnAtPercent`、`criticalAtPercent` |
| `context_extra` | 扩展 | Prompt 缓存命中率、命中 token 量及 `>200k` 橙标 | `showCacheRate`、`showCacheTokens`、`showExceeds200k`、`cachePrefix`、`exceeds200kText`、`showPlaceholder` |
| `quota` | 扩展 | 配额监控（纯百分比、纯进度条或进度条+%） | `bucket`（`gemini-5h`、`gemini-weekly`、`3p-5h`、`3p-weekly`、`gemini-5h+weekly`、`3p-5h+weekly`）、`format`（`percent`\|`bar`\|`bar_percent`）、`barWidth`、`metric`（`remaining`\|`used`）、`showReset`（`none`\|`5h`\|`weekly`\|`both`）、红橙阈值 |
| `git` | 扩展 | 快速读取 Git 分支名与未提交 `*` 标记 | `showDirty`、`maxLength` |
| `cwd` | 扩展 | 当前工作目录名或 `~/...` 短路径 | `style`（`basename`\|`short`） |
| `state` | 扩展 | Agent 当前执行状态（`working`、`tool_use` 等） | `hideWhenIdle` |
| `artifacts` | 扩展 | 产物计数（>0 时显示） | `enabled` |
| `queued` | 扩展 | 排队待发消息计数（>0 时橙色显示） | `enabled` |
| `sandbox` | 扩展 | 终端沙箱状态徽章 | `onlyWhenEnabled` |
| `cost` | 扩展 | 会话预估美元开销 | `decimals` |
| `title` | 扩展 | 当前对话标题（支持中文等宽字符精准截断） | `maxLength`、`prefix` |
| `confirm` | 扩展 | 等待工具确认时显示加粗橙色提醒 | `text` |
| `conversation_id` | 扩展 | 当前对话短 ID 或完整 UUID | `length`、`prefix` |

## 配置文件（`~/.gemini/antigravity-cli/statusline.config.json`）

个人偏好保存在插件目录之外，后续更新插件不会覆盖你的配置，且改动会在 ~300 ms 内热生效。执行 `--install`、`--preset`、`--set` 或 `--ui` 时，工具会自动写入指向本机已安装 `schemas/statusline.schema.json` 的 `$schema` `file://` URI，供编辑器提供补全与校验：

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

## 故障排查

遇到任何配置或显示疑问，直接运行健康体检命令即可定位问题：

```bash
node ~/.gemini/config/plugins/custom-statusline/scripts/manage-statusline.js --doctor --lang zh
```

## 开发与测试

```bash
# 运行零依赖便携测试套
node test/verify.js

# 使用 agy 严格校验插件清单、技能目录与脚本权限
agy plugin validate --strict .
```

## 开源协议

基于 [MIT](./LICENSE) 协议开源。
