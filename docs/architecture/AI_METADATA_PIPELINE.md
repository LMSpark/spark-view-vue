# AI 组件元数据管线 & 脱离前端方案

> 最后更新：2026-03 · 随 `refactor(spark-component): remove old AST extractor` 提交

## 1. 管线总览

```
┌─────────────────────── Vite Build Time ───────────────────────────┐
│                                                                    │
│  .vue 源码                                                        │
│      │                                                            │
│      ▼                                                            │
│  ┌──────────────────────────┐   ┌───────────────────────────┐     │
│  │ sparkCatalogPlugin       │   │ sparkComponentsPlugin     │     │
│  │ (vite-plugin-spark-      │   │ (tools/vite-plugin-spark- │     │
│  │  catalog)                │   │  components.ts)           │     │
│  │                          │   │                           │     │
│  │ ① generateJsonCatalog()  │   │ ① ComponentAnalyzer.scan()│     │
│  │    └─ VCM extraction     │   │ ② parseSkillMeta()       │     │
│  │    └─ supplement merge   │   │ ③ VCM extraction         │     │
│  │    └─ schema validation  │   │ ④ buildPromptMarkdown()  │     │
│  │                          │   │                           │     │
│  │ ② generatePropsCatalog() │   │                           │     │
│  │    └─ legacy flat text   │   │                           │     │
│  └──────────┬───────────────┘   └──────────┬────────────────┘     │
│             │                               │                      │
│             ▼                               ▼                      │
│  component-catalog.json          spark-component-metadata.json     │
│  component-props-catalog.ts      (dist/, writeBundle 阶段)        │
│  (spark-ai/src/, configResolved) │                                │
│                                  │                                │
└──────────────────────────────────┼────────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ upload-component-metadata.mjs│
                    │ POST /api/ai/component-      │
                    │      metadata                │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  Java Backend (Runtime)      │
                    │  ComponentMetadataService    │
                    │                              │
                    │  @PostConstruct: loadFromFile│
                    │  → data/component-metadata   │
                    │    .json                     │
                    │                              │
                    │  内存缓存:                    │
                    │  • skillPromptIndex (简表)   │
                    │  • skillPromptCompact (中等) │
                    │  • skillPromptFull (完整)    │
                    │  • skillPromptByType (按类型)│
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  AiPageService               │
                    │  buildSystemPrompt()          │
                    │                              │
                    │  BASE_SYSTEM_PROMPT           │
                    │  + skillPromptIndex           │
                    │  + detectRelevantSkillTypes() │
                    │  + getSkillPromptForTypes()   │
                    │                              │
                    │  两阶段 AI 生成:             │
                    │  Phase-1 → rule.json+style   │
                    │  Phase-2 → pagedata+script   │
                    └──────────────────────────────┘
```

## 2. 关键产物

### 2.1 `component-catalog.json`（结构化 SSoT）

由 `generateJsonCatalog()` 产出，写入 `packages/spark-ai/src/component-catalog.json`。

```jsonc
{
  "version": "2.0.0",
  "buildTime": "2026-03-23T...",
  "componentCount": 43,
  "registry": {                     // 按分类索引
    "containers": ["r-table", ...],
    "fields": ["r-text", ...],
    "groups": ["r-column-group"],
    "meta": [...]                   // override-only 无 .vue 源的组件
  },
  "components": {                   // 每个组件完整条目
    "r-table": {
      "type": "r-table",
      "category": "container",
      "source": "vcm+override",    // 数据来源标记
      "props": [ { "name": "dataKey", "type": "string", ... } ],
      "emits": [ { "name": "row-click", "type": "..." } ],
      "exposed": [],
      "slots": [ { "name": "default" } ],
      "capabilities": { "provides": ["FIELD_CONTEXT", "DATA_SOURCE"], ... },
      "rootFields": { "dataKey": "string", ... },
      "notes": "..."
    }
  },
  "constraints": { ... }           // 平台约束（DataKey 格式、容器规则等）
}
```

**消费方**：
- `generatePropsCatalog()` → 降格为 `COMPONENT_PROPS_CATALOG` 扁平文本
- `spark-ai` 包的 `design-session.ts` → 设计会话引擎直接查询

### 2.2 `spark-component-metadata.json`（运行时元数据）

由 `sparkComponentsPlugin` 的 `writeBundle()` 产出，写入 `dist/spark-component-metadata.json`。

```jsonc
{
  "version": "1.1.0",
  "buildTime": "...",
  "componentCount": 43,
  "skillCount": 18,
  "apiCount": 35,
  "components": [ { "type": "r-table", "api": {...}, ... } ],
  "skills": [ { "type": "r-table", "description": "...", "provides": [...] } ],
  "skillPrompts": {
    "index":   "| type | 描述 |\n...",   // 最短，系统 prompt 默认注入
    "compact": "### `r-table`\n...",     // 中等详情
    "full":    "### `r-table`\n..."      // 完整 inputSchema/example
  }
}
```

**消费方**: Java 后端 `ComponentMetadataService` → `AiPageService.buildSystemPrompt()`

### 2.3 `component-props-catalog.ts`（编译时生成）

由 `generatePropsCatalog()` 产出，写入 `packages/spark-ai/src/component-props-catalog.ts`。

导出三个变量：
1. `COMPONENT_CATALOG: ComponentCatalog` — 结构化目录
2. `COMPONENT_PROPS_CATALOG: Record<string, string>` — 扁平文本（兼容旧代码）
3. `COMPONENT_REGISTRY` — 按分类映射

## 3. 数据提取引擎

### VCM（vue-component-meta）— 唯一引擎

旧的手写 AST 解析器 `extract-component-api.ts` 已完全移除（2026-03）。

当前唯一提取引擎：`extract-component-api-vcm.ts`，基于 `vue-component-meta@2.2.12`。

```
tsconfig.catalog.json → createChecker() → per-component extraction
                                           ├─ props（含类型、默认值、required）
                                           ├─ emits（含参数签名）
                                           ├─ exposed methods
                                           ├─ slots
                                           ├─ capabilities（provide/consume 信息）
                                           └─ hasIndexSignature
```

**为什么移除 AST 方案**：
- VCM 基于 TypeScript 编译器，类型推断精度远超正则/AST 解析
- 旧方案只从 JSDoc 注释提取文本描述，缺少运行时类型信息
- `generateLegacyCatalogRecord(catalog)` 可从 VCM 结构化数据等价生成扁平文本，无需二次提取

## 4. 两阶段 AI 页面生成

### Phase-1：UI 层（rule.json + style.css）

LLM 接收系统提示词（含组件目录）+ 用户需求，输出：
- `rule.json` — 组件树（type/dataKey/props/children/事件处理函数名）
- `style.css` — 页面样式

### Phase-2：数据层（pagedata.json + script.js）

基于 Phase-1 产出作为上下文，LLM 输出：
- `pagedata.json` — DataSet 定义（tables/columns/relations/views/aggregates）
- `script.js` — 沙箱脚本（`__init__`、事件处理函数）

### 自动迭代

Phase-2 返回 `needsIteration=true` 时，自动追加一轮迭代（action=iterate），最多 1 轮。

## 5. 脱离前端方案

### 5.1 当前已具备的独立性

Java 后端**运行时完全不依赖前端**：

1. `ComponentMetadataService.loadFromFile()` 在 `@PostConstruct` 从 `data/component-metadata.json` 加载
2. 只要该 JSON 文件存在，AI 生成功能即可工作
3. 前端构建仅负责"提取 → 上传"，后端无需 Vite 运行

**问题**：当前提取必须通过 Vite 构建触发（`sparkComponentsPlugin.writeBundle()`），增加了一次完整前端构建的依赖。

### 5.2 方案：独立 CLI 提取脚本

`json-catalog-generator.ts` 本身是纯 Node.js 模块（无 Vue 运行时依赖），可以直接作为 CLI 入口。

**所需步骤**：

```
┌──────────────────────────────────────────────────┐
│  独立提取（无需 Vite）                            │
│                                                    │
│  node scripts/extract-metadata.mjs                │
│    ↓                                              │
│  ① getOrCreateChecker('tsconfig.catalog.json')    │
│  ② extractComponentApiVcm() per component         │
│  ③ buildPromptMarkdown(skills, 'index'|'compact') │
│  ④ 组装 spark-component-metadata.json             │
│  ⑤ 可选: POST /api/ai/component-metadata         │
└──────────────────────────────────────────────────┘
```

**核心依赖链**（均为 Node.js 可直接运行）：
- `vue-component-meta` — 类型提取（依赖 TypeScript + `tsconfig.catalog.json`）
- `glob` — 文件扫描
- `node:fs` / `node:path` — 文件操作

**不需要的依赖**：
- Vite（无需 dev server / build）
- Vue 运行时（VCM 只做静态分析）
- 浏览器环境

### 5.3 实施路径

| 阶段 | 内容 | 状态 |
|------|------|------|
| **已完成** | 旧 AST 方案移除，统一 VCM 引擎 | ✅ |
| **已完成** | `json-catalog-generator.ts` 纯 Node.js（无 Vite 依赖） | ✅ |
| **已完成** | `upload-component-metadata.mjs` 独立上传脚本 | ✅ |
| **已完成** | Java 后端启动时自动从文件加载元数据 | ✅ |
| **待实现** | 独立 CLI 脚本 `scripts/extract-metadata.mjs` — 整合扫描+提取+上传 | ⬜ |
| **待实现** | CI/CD 集成 — 组件变更时自动提取并上传，无需完整前端构建 | ⬜ |

### 5.4 最小可行方案

无需创建新脚本，当前已可通过组合现有模块实现独立运行：

```bash
# Step 1: 提取并生成 JSON（纯 Node.js，无需 Vite）
node -e "
  const { generateJsonCatalog } = require('./packages/vite-plugin-spark-catalog/src/json-catalog-generator')
  const catalog = generateJsonCatalog(process.cwd(), {
    outputPath: 'dist/component-catalog.json'
  })
  console.log('Extracted', catalog.componentCount, 'components')
"

# Step 2: 上传到后端（已有脚本）
node scripts/upload-component-metadata.mjs
```

> **注意**：Step 1 需要 `tsx` 或 `ts-node` 因为源码是 TypeScript。实际 CLI 脚本应编译为 JS 或使用 `tsx` 运行。

## 6. 文件索引

| 文件 | 职责 |
|------|------|
| `tools/vite-plugin-spark-components.ts` | Vite 插件：扫描+VCM 提取 → metadata JSON |
| `packages/vite-plugin-spark-catalog/src/plugin.ts` | Vite 插件：JSON catalog → props TS |
| `packages/vite-plugin-spark-catalog/src/json-catalog-generator.ts` | 核心：VCM 提取 → component-catalog.json |
| `packages/vite-plugin-spark-catalog/src/catalog-generator.ts` | 降格：JSON → 扁平文本 TS 文件 |
| `packages/vite-plugin-spark-catalog/src/extract-component-api-vcm.ts` | VCM 提取引擎 |
| `packages/vite-plugin-spark-catalog/src/prompt-generator.ts` | Skill prompt 生成（三精度 + legacy 转换） |
| `packages/vite-plugin-spark-catalog/src/supplement.ts` | 手写补充数据（override/addendum） |
| `scripts/upload-component-metadata.mjs` | 上传脚本：metadata JSON → Java 后端 |
| `spark-ai-server/.../ComponentMetadataService.java` | 后端：接收/持久化/查询元数据 |
| `spark-ai-server/.../AiPageService.java` | 后端：构建系统提示词 + 两阶段 AI 生成 |
| `tsconfig.catalog.json` | VCM 类型检查器配置 |
