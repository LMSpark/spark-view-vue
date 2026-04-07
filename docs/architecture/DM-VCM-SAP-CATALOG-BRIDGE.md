# DM: VCM → SAP Catalog 自动桥接方案

> **状态**: 待审阅  
> **日期**: 2026-04-07  
> **范围**: sparkCatalogPlugin 输出扩展 → 后端持久化 → Stills Session 注入 → Action 校验 → Prompt 补充

---

## 1. 现状分析

### 1.1 VCM 提取管线（已就绪）

```
sparkCatalogPlugin (Vite build)
  ├─ vue-component-meta 类型提取
  ├─ supplement.ts 手动覆盖
  ├─ infer-binding.ts 绑定推断
  └─ 输出:
      ├─ packages/spark-ai/src/catalog/component-catalog.json    (136 组件完整 API)
      └─ packages/spark-ai/src/catalog/component-props-catalog.ts (TS 常量 + 查询函数)
```

### 1.2 SAP/Stills 引擎（已就绪）

- 53 个 action（dataset/blueprint/pageconfig/meta 四个 domain）
- `rule.addComponent(type, props, children)` 当前 **零校验** — 任意 type/props 均可通过
- `stills.actionSpec` 可查询单组件 spec，但 Stills session **不持有 catalog 引用**
- Post-generation `validateWithCatalog()` 是唯一校验点（不在 Stills 执行链中）

### 1.3 断裂带

| 能力 | VCM 已提取 | SAP 实际消费 |
|------|-----------|-------------|
| 组件类型注册表 | ✅ 136 组件 | ❌ 无校验 |
| Props schema | ✅ name/type/required/default | ❌ 无校验 |
| Binding descriptors | ✅ selfResolving/dataContainer 等 | ❌ 仅 post-gen |
| Nesting rules | ✅ allowedChildren/forbiddenChildren | ❌ 仅 post-gen |

---

## 2. 设计决策摘要

| # | 决策项 | 选项 |
|---|--------|------|
| Q1 | 核心目标 | BUILD 生成专用 SAP Catalog TS/JSON |
| Q2 | 消费阶段 | Stills action 执行时实时校验 |
| Q3 | 校验严格度 | 硬拒绝（@@error + fix） |
| Q4 | Props 校验深度 | 检查未知 prop 名 |
| Q5 | 交付格式 | TS 常量 + Markdown prompt 双输出 |
| Q6 | Catalog 内容 | type + category + props(name/type/required) |
| Q7 | 新 Stills action | catalog.query（智能分层） |
| Q8 | 构建集成 | sparkCatalogPlugin 内新增输出 |
| Q9 | 后端同步 | 新增 SAP 专用上传端点 |
| Q10 | HMR | 跟随现有 sparkCatalogPlugin HMR 策略 |
| Q11 | 矛盾调和 | catalog 包含 props 名称+类型+required |
| Q12 | catalog.query 返回 | 智能分层（全列表/过滤/单组件 spec） |
| Q13 | 后端与 session 关系 | 上传到后端 → session 从后端拉取 |

---

## 3. 目标架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│ BUILD PHASE (sparkCatalogPlugin)                                        │
│                                                                         │
│ vue-component-meta + supplement.ts                                      │
│           ↓                                                             │
│ component-catalog.json (完整 VCM，136 组件)                              │
│           ↓ 裁剪                                                        │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 新增输出 ①: sap-catalog.json                                        │ │
│ │ {                                                                   │ │
│ │   version: "1.0.0",                                                │ │
│ │   buildTime: "ISO",                                                │ │
│ │   componentCount: 136,                                             │ │
│ │   registry: { containers: [...], fields: [...], groups: [...] },   │ │
│ │   components: {                                                    │ │
│ │     "r-table": {                                                   │ │
│ │       category: "container",                                       │ │
│ │       description: "数据表格容器",                                   │ │
│ │       props: [                                                     │ │
│ │         { name: "dataKey", type: "string", required: false },      │ │
│ │         { name: "border", type: "boolean", required: false },      │ │
│ │         ...                                                        │ │
│ │       ]                                                            │ │
│ │     },                                                             │ │
│ │     ...                                                            │ │
│ │   }                                                                │ │
│ │ }                                                                  │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 新增输出 ②: sap-catalog-prompt.md                                  │ │
│ │ ## 可用组件目录                                                      │ │
│ │ | type | category | description | props |                          │ │
│ │ |------|----------|-------------|-------|                          │ │
│ │ | r-table | container | 数据表格 | dataKey, border, stripe, ... |  │ │
│ │ ...                                                                │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 新增输出 ③: sap-catalog.ts (TS 常量)                                │ │
│ │ export const SAP_CATALOG: SapCatalog = { ... }                     │ │
│ │ export type SapCatalog = { ... }                                   │ │
│ │ export type SapComponentEntry = { ... }                            │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ UPLOAD PHASE (build-all.mjs Step 4.5)                                   │
│                                                                         │
│ POST /api/sap/catalog                                                   │
│   body: sap-catalog.json                                                │
│   → SapCatalogService.updateCatalog(json)                              │
│   → persist: data/sap-catalog.json                                     │
│   → cache: in-memory SapCatalog                                        │
│                                                                         │
│ (与现有 POST /api/ai/component-metadata 并行)                           │
└─────────────────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ RUNTIME: Stills Session 初始化                                          │
│                                                                         │
│ Frontend createStillsSession():                                         │
│   ① GET /api/sap/catalog → SapCatalog JSON                             │
│   ② session.catalog = parsed SapCatalog                                │
│                                                                         │
│ Backend StillsSessionService.createSession():                           │
│   ① sapCatalogService.getCatalog() → SapCatalog                       │
│   ② inject catalog prompt into system prompt                           │
└─────────────────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ RUNTIME: Stills Action 消费                                             │
│                                                                         │
│ rule.addComponent(type, props, children):                               │
│   validate:                                                             │
│     ① type 在 session.catalog.components 中不存在                       │
│       → @@error UNKNOWN_COMPONENT { fix: "可用容器: ..., 可用字段: ..." }│
│     ② props 中有 session.catalog.components[type].props 未声明的 key   │
│       → @@error UNKNOWN_PROP { fix: "r-table 合法 props: dataKey, ..." }│
│                                                                         │
│ catalog.query(params?):                                                 │
│   无参数 → 全组件列表 (type + category + description)                   │
│   { type: "r-table" } → 单组件完整 spec (props 全量)                    │
│   { category: "field" } → 该分类下所有组件摘要                          │
│                                                                         │
│ rule.updateComponent(type, props):                                      │
│   同 addComponent 的 type/props 校验逻辑                                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 变更清单

### 4.1 前端变更

#### 4.1.1 sparkCatalogPlugin 新增 SAP 输出

**文件**: `packages/vite-plugin-spark-catalog/src/json-catalog-generator.ts`

**变更**: 在 `generateCatalog()` 末尾，从完整 catalog 裁剪出 SAP 版本并写入 3 个文件。

```typescript
// 新增函数: trimToSapCatalog(fullCatalog) → SapCatalog
function trimToSapCatalog(catalog: ComponentCatalog): SapCatalog {
  const components: Record<string, SapComponentEntry> = {}
  for (const [type, entry] of Object.entries(catalog.components)) {
    components[type] = {
      category: entry.category,
      description: entry.description,
      props: entry.props.map(p => ({
        name: p.name,
        type: p.type,
        required: p.required,
      })),
    }
  }
  return {
    version: '1.0.0',
    buildTime: catalog.buildTime,
    componentCount: Object.keys(components).length,
    registry: catalog.registry,
    components,
  }
}

// 新增函数: generateSapPrompt(sapCatalog) → Markdown string
function generateSapPrompt(catalog: SapCatalog): string {
  // 生成 Markdown 表格 + 分类索引
}
```

**输出文件**:

| 输出 | 路径 | 用途 |
|------|------|------|
| `sap-catalog.json` | `packages/spark-ai/src/catalog/sap-catalog.json` | 运行时数据（后端上传 + 前端 fallback） |
| `sap-catalog-prompt.md` | `packages/spark-ai/src/catalog/sap-catalog-prompt.md` | LLM 系统提示补充段 |
| `sap-catalog.ts` | `packages/spark-ai/src/catalog/sap-catalog.ts` | TypeScript 类型 + 常量导出 |

#### 4.1.2 SAP Catalog 类型定义

**文件**: `packages/spark-ai/src/catalog/sap-catalog-types.ts`（新增）

```typescript
export interface SapCatalog {
  version: string
  buildTime: string
  componentCount: number
  registry: {
    containers: string[]
    fields: string[]
    groups: string[]
    meta: string[]
  }
  components: Record<string, SapComponentEntry>
}

export interface SapComponentEntry {
  category: 'container' | 'field' | 'group' | 'meta'
  description: string
  props: SapPropEntry[]
}

export interface SapPropEntry {
  name: string
  type: string
  required: boolean
}
```

#### 4.1.3 IStillSession 扩展

**文件**: `packages/spark-ai/src/stills/types.ts`

```typescript
// 新增字段
interface IStillSession {
  // ... 现有字段 ...
  catalog: SapCatalog | null  // Stills action 可通过 session.catalog 访问
}
```

#### 4.1.4 Session 工厂 — catalog 注入

**文件**: `packages/spark-ai/src/stills/domain.ts`

```typescript
// createSession() 扩展
export function createSession(options?: {
  catalog?: SapCatalog  // 外部注入 catalog
}): IStillSession {
  return {
    // ... 现有初始化 ...
    catalog: options?.catalog ?? null,
  }
}
```

#### 4.1.5 rule.addComponent / rule.updateComponent — 校验增强

**文件**: `packages/spark-ai/src/stills/pageconfig-domain.ts`

```typescript
// rule.addComponent 的 validate 函数增强
validate(params, session) {
  // ... 现有参数校验 ...

  // 新增: catalog 校验
  if (session.catalog) {
    const catalog = session.catalog

    // 1. 类型存在性硬校验
    const entry = catalog.components[params.type]
    if (!entry) {
      const candidates = findSimilarTypes(params.type, catalog)
      return `未知组件类型 "${params.type}"。` +
        (candidates.length > 0
          ? `相似组件: ${candidates.join(', ')}。`
          : `可用容器: ${catalog.registry.containers.join(', ')}; 可用字段: ${catalog.registry.fields.join(', ')}`)
    }

    // 2. Props 名称校验
    if (params.props && entry.props.length > 0) {
      const validPropNames = new Set(entry.props.map(p => p.name))
      const unknownProps = Object.keys(params.props)
        .filter(k => !validPropNames.has(k))
      if (unknownProps.length > 0) {
        return `组件 "${params.type}" 不支持 props: ${unknownProps.join(', ')}。` +
          `合法 props: ${entry.props.map(p => p.name).join(', ')}`
      }
    }
  }

  return null // 校验通过
},
```

#### 4.1.6 新增 catalog.query action

**文件**: `packages/spark-ai/src/stills/meta-methods.ts`（扩展）

```typescript
// 新增 catalog domain action
{
  action: 'catalog.query',
  type: 'describe' as const,
  description: '查询可用组件目录。无参数返回全量列表；指定 type 返回单组件详情；指定 category 返回分类列表。',
  paramsSchema: { type: '可选，组件类型', category: '可选，container|field|group|meta' },
  example: { category: 'field' },
  
  validate(params) { return null },
  
  execute(session, params) {
    if (!session.catalog) {
      return { ok: false, code: 'NO_CATALOG', msg: 'SAP Catalog 未加载', fix: '请确认构建时已生成并上传 sap-catalog.json' }
    }
    const catalog = session.catalog

    // 模式 1: 单组件 spec
    if (params.type) {
      const entry = catalog.components[params.type]
      if (!entry) return { ok: false, code: 'NOT_FOUND', msg: `组件 "${params.type}" 不在目录中` }
      return { ok: true, data: { type: params.type, ...entry }, summary: `${params.type} (${entry.category}): ${entry.props.length} props` }
    }

    // 模式 2: 按 category 过滤
    if (params.category) {
      const types = catalog.registry[params.category] ?? []
      const list = types.map(t => ({
        type: t,
        description: catalog.components[t]?.description ?? '',
      }))
      return { ok: true, data: { category: params.category, count: list.length, components: list }, summary: `${params.category}: ${list.length} 组件` }
    }

    // 模式 3: 全量列表
    const list = Object.entries(catalog.components).map(([type, e]) => ({
      type,
      category: e.category,
      description: e.description,
    }))
    return { ok: true, data: { total: list.length, components: list }, summary: `共 ${list.length} 个可用组件` }
  },
}
```

#### 4.1.7 前端 Session 初始化 — 从后端拉取 catalog

**文件**: `packages/spark-ai/src/stills/domain.ts` 或调用层

```typescript
// 调用层示例 (前端 Stills 编排器)
async function initStillsSession(): Promise<IStillSession> {
  let catalog: SapCatalog | null = null
  try {
    const res = await fetch('/api/sap/catalog')
    if (res.ok) {
      catalog = await res.json()
    }
  } catch {
    // catalog 不可用时不阻塞 session 创建
    console.warn('[Stills] SAP Catalog 加载失败，组件校验不可用')
  }
  return createSession({ catalog })
}
```

#### 4.1.8 spark-ai/src/index.ts — 导出扩展

```typescript
// 新增导出
export type { SapCatalog, SapComponentEntry, SapPropEntry } from './catalog/sap-catalog-types'
export { SAP_CATALOG } from './catalog/sap-catalog'
```

### 4.2 后端变更

#### 4.2.1 SapCatalogService（新增）

**文件**: `spark-ai-server/src/main/java/com/spark/ai/sap/SapCatalogService.java`

```java
@Service
public class SapCatalogService {
    private static final String CATALOG_FILE = "data/sap-catalog.json";
    private volatile String rawCatalog = null;

    @PostConstruct
    public void loadFromFile() {
        // 启动时从 data/sap-catalog.json 加载（如果存在）
    }

    public void updateCatalog(String json) {
        // 验证 JSON 有效性 → 持久化到文件 → 更新内存缓存
    }

    public String getCatalog() {
        return rawCatalog;
    }

    public boolean hasCatalog() {
        return rawCatalog != null;
    }
}
```

#### 4.2.2 SapController 端点扩展

**文件**: `spark-ai-server/src/main/java/com/spark/ai/controller/SapController.java`

```java
// 新增端点
@PostMapping("/api/sap/catalog")
public ResponseEntity<Map<String, Object>> uploadCatalog(@RequestBody String body) {
    sapCatalogService.updateCatalog(body);
    return ResponseEntity.ok(Map.of("status", "ok", "componentCount", ...));
}

@GetMapping("/api/sap/catalog")
public ResponseEntity<String> getCatalog() {
    if (!sapCatalogService.hasCatalog()) {
        return ResponseEntity.notFound().build();
    }
    return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_JSON)
            .body(sapCatalogService.getCatalog());
}
```

#### 4.2.3 StillsSessionService — catalog prompt 注入

**文件**: `spark-ai-server/src/main/java/com/spark/ai/sap/StillsSessionService.java`

```java
// createSession() 扩展: 将 sap-catalog-prompt.md 追加到 system prompt
public String createSession(String systemPrompt, ...) {
    String catalogPrompt = sapCatalogService.getCatalogPrompt();
    if (catalogPrompt != null) {
        systemPrompt = systemPrompt + "\n\n" + catalogPrompt;
    }
    // ... 现有逻辑 ...
}
```

### 4.3 构建管线变更

#### 4.3.1 build-all.mjs — 新增上传步骤

**文件**: `scripts/build-all.mjs`

```javascript
// Step 4 (现有): POST metadata
// Step 4.5 (新增): POST SAP catalog
const sapCatalogPath = path.resolve('packages/spark-ai/src/catalog/sap-catalog.json')
if (fs.existsSync(sapCatalogPath)) {
  const sapCatalog = fs.readFileSync(sapCatalogPath, 'utf-8')
  await fetch(`http://localhost:${port}/api/sap/catalog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: sapCatalog,
  })
  console.log('✅ SAP Catalog uploaded')
}
```

---

## 5. 数据流完整时序

```
pnpm run build
  │
  ├─ Step 1-2: Maven build + Java 启动
  │
  ├─ Step 3: vite build
  │   └─ sparkCatalogPlugin:
  │       ├─ component-catalog.json (完整 VCM，136 组件)     ← 现有
  │       ├─ component-props-catalog.ts (TS 常量)             ← 现有
  │       ├─ sap-catalog.json (裁剪版)                        ← 新增
  │       ├─ sap-catalog.ts (TS 常量 + 类型)                 ← 新增
  │       └─ sap-catalog-prompt.md (AI 提示文本)              ← 新增
  │
  ├─ Step 4: POST /api/ai/component-metadata                  ← 现有
  │
  ├─ Step 4.5: POST /api/sap/catalog                          ← 新增
  │   └─ SapCatalogService.updateCatalog()
  │       ├─ persist → data/sap-catalog.json
  │       └─ cache → memory
  │
  └─ Step 5: taskkill
```

```
pnpm run dev (HMR)
  │
  ├─ .vue 文件变更
  │   └─ sparkCatalogPlugin HMR handler:
  │       ├─ 重建 component-catalog.json                       ← 现有
  │       └─ 重建 sap-catalog.json + sap-catalog.ts + prompt   ← 新增（搭车现有 HMR）
  │
  └─ 无自动上传到后端（dev 模式正常，前端可 fallback 到 import）
```

```
前端 Stills Session 初始化:
  │
  ├─ GET /api/sap/catalog
  │   ├─ 200 → session.catalog = parsed SapCatalog
  │   └─ 404 → session.catalog = null (校验降级，不阻塞)
  │
  └─ AI 执行 rule.addComponent("r-table", { dataKey: "Users@rows", border: true })
      │
      ├─ validate():
      │   ├─ "r-table" ∈ catalog.components → ✅
      │   ├─ props.dataKey ∈ r-table.props → ✅  
      │   ├─ props.border ∈ r-table.props → ✅
      │   └─ 通过
      │
      └─ execute(): 正常添加节点
```

```
错误路径示例:
  │
  ├─ AI: @@request:rule.addComponent#r42
  │  {"type": "my-custom-grid", "props": {"data": []}}
  │  @@end
  │
  └─ validate():
      └─ "my-custom-grid" ∉ catalog.components
          → @@error:rule.addComponent#r42
            {
              "code": "UNKNOWN_COMPONENT",
              "msg": "未知组件类型 \"my-custom-grid\"",
              "fix": "可用容器: r-table, r-form, r-detail, r-tree, ...; 可用字段: r-text, r-select, ..."
            }
            @@end
      → AI 读取 fix → 修正为 "r-table" → 重试
```

---

## 6. 文件变更索引

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/vite-plugin-spark-catalog/src/json-catalog-generator.ts` | **修改** | 新增 `trimToSapCatalog()` + `generateSapPrompt()` + 写入 3 个文件 |
| `packages/spark-ai/src/catalog/sap-catalog-types.ts` | **新增** | SapCatalog / SapComponentEntry / SapPropEntry 类型 |
| `packages/spark-ai/src/catalog/sap-catalog.json` | **自动生成** | build 产物（git-ignored 或 git-tracked 待定） |
| `packages/spark-ai/src/catalog/sap-catalog.ts` | **自动生成** | TS 常量导出 |
| `packages/spark-ai/src/catalog/sap-catalog-prompt.md` | **自动生成** | Markdown prompt 文本 |
| `packages/spark-ai/src/index.ts` | **修改** | 新增 SAP Catalog 导出 |
| `packages/spark-ai/src/stills/types.ts` | **修改** | IStillSession 新增 `catalog` 字段 |
| `packages/spark-ai/src/stills/domain.ts` | **修改** | createSession() 接受 catalog 参数 |
| `packages/spark-ai/src/stills/pageconfig-domain.ts` | **修改** | rule.addComponent / updateComponent 增加 catalog 校验 |
| `packages/spark-ai/src/stills/meta-methods.ts` | **修改** | 新增 `catalog.query` action |
| `spark-ai-server/.../sap/SapCatalogService.java` | **新增** | SAP Catalog 持久化 + 缓存 |
| `spark-ai-server/.../controller/SapController.java` | **修改** | 新增 POST/GET /api/sap/catalog |
| `spark-ai-server/.../sap/StillsSessionService.java` | **修改** | session 创建时注入 catalog prompt |
| `scripts/build-all.mjs` | **修改** | Step 4.5: POST sap-catalog.json |
| `data/sap-catalog.json` | **自动生成** | 后端持久化文件 |

---

## 7. 影响范围与风险评估

### 7.1 向后兼容

- `session.catalog = null` 时所有校验跳过 — **完全向后兼容**
- 现有 53 个 action 零影响（仅 `rule.addComponent` / `rule.updateComponent` 增加可选校验）
- 现有测试无需修改（session.catalog 默认为 null）

### 7.2 风险项

| 风险 | 概率 | 缓解 |
|------|------|------|
| catalog 未加载时 action 静默跳过校验 | 低 | 日志 warn + session.describe 展示 catalog 状态 |
| VCM 提取遗漏组件导致误拒绝 | 中 | supplement.ts 兜底 + catalog.query 可发现 |
| sap-catalog.json 过大影响 session 初始化 | 低 | 裁剪后 ~50-80KB（136 组件 × props 列表） |
| HMR 重建 catalog 慢 | 低 | 与现有 sparkCatalogPlugin HMR 一致（已验证可接受） |

### 7.3 测试策略

| 测试类型 | 覆盖内容 |
|----------|----------|
| 单元测试 | `trimToSapCatalog()` 裁剪正确性 |
| 单元测试 | `catalog.query` action 三种模式 |
| 单元测试 | `rule.addComponent` 校验：未知 type → @@error、未知 prop → @@error、合法 → 通过 |
| 单元测试 | `session.catalog = null` 时校验跳过 |
| 集成测试 | build-all.mjs → sap-catalog.json 生成 + 上传 |
| Java 单元测试 | SapCatalogService CRUD + 持久化 |
| Java 单元测试 | SapController POST/GET 端点 |

---

## 8. 实施顺序

```
Phase 1: 类型 + 裁剪 (纯前端, 无依赖)
  ├─ T1: 新增 sap-catalog-types.ts (类型定义)
  ├─ T2: json-catalog-generator.ts 新增 trimToSapCatalog() + generateSapPrompt()
  ├─ T3: 生成 sap-catalog.ts (TS 常量导出)
  └─ T4: spark-ai/src/index.ts 新增导出

Phase 2: Stills 消费 (前端 Stills 引擎)
  ├─ T5: IStillSession 新增 catalog 字段
  ├─ T6: createSession() 接受 catalog 参数
  ├─ T7: catalog.query action 实现
  ├─ T8: rule.addComponent / updateComponent 校验增强
  └─ T9: 单元测试 (catalog.query + rule 校验)

Phase 3: 后端 (Java)
  ├─ T10: SapCatalogService 新增
  ├─ T11: SapController 端点扩展
  ├─ T12: StillsSessionService prompt 注入
  └─ T13: Java 单元测试

Phase 4: 管线集成
  ├─ T14: build-all.mjs Step 4.5 上传
  └─ T15: 端到端验证
```

---

## 附录 A: sap-catalog.json 样例（裁剪后）

```json
{
  "version": "1.0.0",
  "buildTime": "2026-04-07T10:30:00.000Z",
  "componentCount": 136,
  "registry": {
    "containers": ["r-table", "r-form", "r-detail", "r-tree", "r-list", "r-tabs", "r-collapse", "r-dialog", "r-drawer", "r-steps", "r-section", "r-toolbar"],
    "fields": ["r-text", "r-number", "r-select", "r-date-picker", "r-checkbox", "r-radio", "r-switch", "r-textarea", "r-upload", "r-icon"],
    "groups": ["RendererFieldScope", "RendererListItemScope"],
    "meta": []
  },
  "components": {
    "r-table": {
      "category": "container",
      "description": "数据表格容器，通过 dataKey 绑定 DataView，自动驱动 el-table",
      "props": [
        { "name": "dataKey", "type": "string", "required": false },
        { "name": "children", "type": "SparkNode[]", "required": false },
        { "name": "border", "type": "boolean", "required": false },
        { "name": "stripe", "type": "boolean", "required": false },
        { "name": "highlightCurrentRow", "type": "boolean", "required": false }
      ]
    },
    "r-text": {
      "category": "field",
      "description": "文本输入字段",
      "props": [
        { "name": "field", "type": "string", "required": false },
        { "name": "label", "type": "string", "required": false },
        { "name": "placeholder", "type": "string", "required": false }
      ]
    }
  }
}
```

## 附录 B: sap-catalog-prompt.md 样例

```markdown
## 可用组件目录（SAP Catalog v1.0.0）

### 容器组件（containers）
| type | description | 常用 props |
|------|-------------|------------|
| r-table | 数据表格容器 | dataKey, border, stripe, highlightCurrentRow |
| r-form | 表单容器 | dataKey, labelWidth, rules |
| r-detail | 详情容器 | dataKey |
| r-tree | 树形容器 | dataKey, nodeKey, defaultExpandAll |

### 字段组件（fields）
| type | description | 常用 props |
|------|-------------|------------|
| r-text | 文本输入 | field, label, placeholder |
| r-number | 数字输入 | field, label, min, max |
| r-select | 下拉选择 | field, label, optionKey |
| r-date-picker | 日期选择 | field, label, type |

### 展示组件（groups）
| type | description | 常用 props |
|------|-------------|------------|

⚠️ **规则**: rule.addComponent 的 type 必须在上述列表中。未知类型将被拒绝。
```
