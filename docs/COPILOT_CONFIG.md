# GitHub Copilot 配置指南

本文档为当前 **Spark View** 仓库提供 Copilot 使用建议与项目级配置示例，类似于 `claude.md` 之类的说明文件。

---

## 1. 全局设置

Copilot 的大多数选项通过 VS Code 设置（`settings.json`）进行控制。打开设置：

- **快捷键**：`Ctrl + ,` 或 通过命令面板输入 `Preferences: Open Settings`。
- 搜索关键词 `copilot` 或 `Github Copilot` 来查看可用配置项。

### 常用示例

```json
{
  "github.copilot.enable": true,                     // 全局开/关
  "github.copilot.advanced": {
    "inlineSuggest": true,                           // 使用内联建议
    "enableTabStops": true                           // 按 Tab 接受建议
  },
  "github.copilot.suggestionDelay": 100              // 建议延迟（毫秒）
}
```

> ⚠️ 实际设置名称会随着扩展版本而变化，上述只是常见示例，请在设置界面确认最新字段。


## 2. 按语言控制

可以配置 Copilot 针对特定语言启用或禁用，适用于避免在某些文件类型中出现太多噪音。

在工作区的 `.vscode/settings.json` 中添加：

```json
{
  "github.copilot.enable": {
    "*": true,             // 默认启用
    "markdown": false,     // Markdown 中关闭
    "plaintext": false     // 纯文本关闭
  }
}
```

如果要仅在 TypeScript、Vue、测试文件中开启，可像下面这样写：

```json
{
  "github.copilot.enable": {
    "typescript": true,
    "javascript": true,
    "vue": true,
    "json": false,
    "html": false
  }
}
```


## 3. 项目级文件示例

当前仓库在 `.vscode/settings.json` 中的默认内容如下（目前仅包含 Markdown 相关配置）：

```jsonc
{
  // 完全禁用 Markdown Lint（可选）
  "markdownlint.run": "onSave",
  ...
}
```

可以在同一文件附加 Copilot 条目：

```jsonc
{
  "github.copilot.enable": {
    "*": true,
    "markdown": false,
    "plaintext": false
  },
  "github.copilot.advanced.inlineSuggest": true
}
```

保存后 VS Code 会立即应用。


## 4. 常用 Copilot 命令

| 命令名                          | 作用说明                                |
|--------------------------------|-----------------------------------------|
| `Copilot: Enable`             | 启用 Copilot（即使全局被禁用）          |
| `Copilot: Disable`            | 暂时禁用 Copilot                        |
| `Copilot: Open Settings`      | 直接打开 Copilot 扩展设置页             |
| `Copilot: Accept Suggestion`  | 手动接受当前建议                        |
| `Copilot: Next Suggestion`    | 查看下一个建议                          |
| `Copilot: Previous Suggestion`| 查看上一个建议                          |

可在命令面板 (F1) 中输入 `Copilot:` 快速访问。


## 5. 认证与代理

- Copilot 依赖 GitHub 帐号登录，首次安装后会弹出授权页面。
- 若使用本地代理或 `copilot-cli`，需在环境变量中设置 `GITHUB_TOKEN`。
- 本仓库没有特殊凭据配置，仅依赖开发者各自的 GitHub 账号。


## 6. 团队协作 & 版本控制

若希望团队共享相同的 Copilot 设置，可将 `.vscode/settings.json` 添加到版本控制，或者创建一个模板文件（例如 `docs/codis/copilot-settings.example.json`），并在 README 中提醒开发者复制到 `.vscode`。

```bash
cp docs/copilot-settings.example.json .vscode/settings.json
```


## 7. 项目约定 ✅

本仓库除 Copilot 设置外本身还有若干开发约定，了解这些有助于你更高效地使用 Copilot 生成符合规范的代码：

- **提交范围**：commit 说明必须包含 scope，例如 `feat(spark-data): ...`/`fix(spark-component): ...`。
- **包结构**：每个子包在 `packages/` 目录下独立维护，类型路径别名如 `@spark-view/spark-utils`。
- **组件注册**：使用 `Spark.register()` 或 `Spark.createRegister()` 进行统一管理，类型名为 `kebab-case`。
- **测试**：跑 Vitest 仅需 `pnpm run test`，单测时可加 `-t` 指定用例。
- **脚本**：项目有预定义任务如 `dev`、`build`、`lint`、`typecheck`，Copilot 里可直接写 `pnpm run` 的命令片段。
- **文档**：所有新功能请在 `docs/guides/` 或 `docs/architecture/` 下补充文档。

将这些内容保留在团队共享的文档有助于 Copilot 输出更加契合项目风格。


## 8. 额外建议

- 若 Copilot 建议过于冗长，可通过设置 `github.copilot.inlineSuggest.enableTabStops` 等参数调整。
- 本项目以 TypeScript / Vue 为主，建议保持 Copilot 在这些语言中启用，其它文本类文件可视需要关闭。
- 在测试文件或生成代码片段时，使用 Copilot 可以加快开发，但应始终进行审查。

---

> 该文档即类似于 `claude.md` 样的配置说明，便于团队在仓库内共享。根据扩展更新，建议定期检查 Copilot 发布说明并更新本文件。

```json
// 此处附加一个可复制的最小工作区设置示例
{
  "github.copilot.enable": {
    "*": true,
    "markdown": false,
    "plaintext": false
  },
  "github.copilot.advanced.inlineSuggest": true,
  "github.copilot.suggestionDelay": 100
}
```
