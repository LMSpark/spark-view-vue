# ai-coding-kit — AI 编码准则与检查脚本（可拷贝底板）

> 本文件夹是可整体拷贝到其他项目根目录的 AI 编码赋能层底板，包含 AI 编码标准文档和配套的代码规则检查脚本。
> 拷贝到目标项目后，按 [接入步骤](#接入步骤) 调整即可生效。

## 文件夹定位

- **AI 编码标准**（`AGENTS.md`）：定义 AI 助手如何读代码、提问、写方案、实施、验证和沉淀知识，与具体项目解耦
- **检查脚本**（`verify-*.mjs` + `verifier-common.mjs`）：把标准中的硬门禁落地为可执行校验，接入 CI 或本地 `verify` 流程
- 本文件夹是底板快照；SPARK 本仓库以 `tools/` 下的脚本和根 `AGENTS.md` 为准，两边的脚本不自动同步

## 文件清单

### 标准文档

| 文件 | 用途 |
|------|------|
| `AGENTS.md` | AI 编码标准主体：第 0 章治理优先级、第 1 章 7 阶段代码修改协议、第 2 章代码生成行为规范、第 3 章跨会话委派协议 EPSS、附录 A 接入配置、附录 B 接入步骤 |

### 检查脚本

| 文件 | 用途 | 通用性 |
|------|------|--------|
| `verifier-common.mjs` | 脚本公共工具：文件遍历、TS 源码解析、违规输出、CLI 参数解析。所有 verify 脚本依赖它 | ✅ 通用，可直接用 |
| `verify-ai-codegen-rules.mjs` | 检查 AI 代码生成硬门禁：interface 使用、class 命名字典分层、函数签名参数数、公共面导出数、机械命名后缀。规则对应 `AGENTS.md` 第 2 章 | ⚠️ 规则通用，脚本顶部配置块（`includeRoots`、`interfaceAllowlist`、`publicSurfaceAllowlist` 等）需按目标项目调整 |
| `verify-docs.mjs` | 检查文档治理：markdown 文件名 kebab-case、目录注册、域名模型 .dm 头部、低信号词 | ⚠️ 规则通用，脚本顶部配置块（`legacyMarkdownAllowlist`、`registeredDocPrefixes`）需按目标项目调整 |
| `verify-architecture.mjs` | 检查包间依赖方向、框架无关包禁导框架（vue/element-plus 等） | ❌ SPARK 专属参考实现，目标项目需删除或重写 |
| `verify-dependency-catalog.mjs` | 检查 pnpm workspace catalog 版本管理 | ❌ SPARK 专属参考实现，目标项目需删除或重写 |
| `verify-pages-config.mjs` | 检查 SPARK pages 配置 manifest | ❌ SPARK 专属，目标项目需删除 |
| `verify-workflow-designs.mjs` | 检查 SPARK workflow 设计稿 | ❌ SPARK 专属，目标项目需删除 |
| `verify-ai-model-spec.mjs` | 检查业务模型 class 是否继承 `SparkAIModel`、`toJson()` 协议 | ❌ SPARK 专属，目标项目需删除或改为检查自己的基类协议 |
| `verify-ai-model-schema.mjs` | 对业务模型 `toJson()` 输出运行 JSON Schema Draft 2020-12 合规审计（可选深度验证） | ❌ SPARK 专属，目标项目需删除或改造 |

## 接入步骤

1. **拷贝**：将整个 `ai-coding-kit/` 文件夹复制到目标项目根目录
2. **调整标准文档**：按 `AGENTS.md` [附录 A](AGENTS.md#附录-a接入配置) 把示例命令和目录改为目标项目实际值
3. **清理脚本**：删除 6 个 SPARK 专属脚本（`verify-architecture.mjs`、`verify-dependency-catalog.mjs`、`verify-pages-config.mjs`、`verify-workflow-designs.mjs`、`verify-ai-model-spec.mjs`、`verify-ai-model-schema.mjs`），或按目标项目架构重写
4. **调整通用脚本配置**：打开 `verify-ai-codegen-rules.mjs` 和 `verify-docs.mjs`，修改脚本顶部的配置块：
   - `includeRoots` / `includeFiles`：改为目标项目的源码目录
   - `interfaceAllowlist` / `publicSurfaceAllowlist`：清空或改为目标项目的例外项
   - `legacyMarkdownAllowlist` / `registeredDocPrefixes`：改为目标项目的文档目录前缀和历史文件白名单
5. **配置 package.json**：在目标项目 `package.json` 的 `scripts` 中加入 verify 入口，例如：
   ```json
   {
     "scripts": {
       "verify:ai-codegen": "node ai-coding-kit/verify-ai-codegen-rules.mjs",
       "verify:docs": "node ai-coding-kit/verify-docs.mjs",
       "verify:rules": "pnpm run verify:ai-codegen && pnpm run verify:docs",
       "verify": "pnpm run typecheck && pnpm run lint && pnpm run verify:rules"
     }
   }
   ```
6. **入口引用**：在目标项目根目录的 `AGENTS.md`（或 `.cursor/rules`、`CLAUDE.md` 等 AI 入口文件）顶部加一行：`> AI 编码标准见 ai-coding-kit/AGENTS.md，修改任何代码前必须先读。`
7. **按需追加项目特有门禁**：若有项目特有的硬门禁，追加到 `AGENTS.md` 2.13 节末尾，并在 `verify-ai-codegen-rules.mjs` 中补对应检查逻辑

完成以上步骤后，目标项目的 AI 编码流程与检查门禁即与本底板对齐。

## 依赖

检查脚本依赖 `typescript` 包（用于 TS 源码解析）。目标项目需已安装 `typescript`，或单独安装：

```bash
pnpm add -D typescript
# 或 npm install -D typescript
```

## 维护说明

- 本文件夹是底板快照，与 SPARK 本仓库 `tools/` 下的脚本不自动同步
- SPARK 本仓库迭代脚本后，如需更新底板，手动把 `tools/` 下对应脚本覆盖到 `ai-coding-kit/`
- 底板演进时，优先保持 `verifier-common.mjs`、`verify-ai-codegen-rules.mjs`、`verify-docs.mjs` 的通用性，SPARK 专属逻辑不渗入这三个文件
