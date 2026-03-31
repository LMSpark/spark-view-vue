# AI 交互架构设计 — 配置化 · 自动化 · 分层验证 · 企业审核

> **状态**: 架构设计（尚未实现）  
> **创建日期**: 2026-03-13  
> **分支**: `feat/ai-server-config-management`

---

## 目录

1. [现状分析](#1-现状分析)
2. [SPARK vs Copilot — 结构性优势](#2-spark-vs-copilot--结构性优势)
3. [目标架构 — 五层交互体系](#3-目标架构--五层交互体系)
4. [ResponsePipeline（响应处理管线）](#4-responsepipeline响应处理管线)
5. [语义验证层（5 级递进）](#5-语义验证层5-级递进)
6. [企业数据资源审核层](#6-企业数据资源审核层)
7. [交互定界符协议（`@@type:name`）](#7-交互定界符协议typename)
8. [状态机扩展](#8-状态机扩展)
9. [实施路线图](#9-实施路线图)
10. [关键文件索引](#10-关键文件索引)

---

## 1. 现状分析

### 1.1 两条独立 AI 通道

| 维度 | AiChatPanel（页面生成） | AiDesignStudio（协作设计） |
|------|------------------------|--------------------------|
| **端点** | `POST /api/ai/chat`（非流式） | `POST /api/ai/chat/stream`（SSE 流式） |
| **后端服务** | `AiPageService`（二阶段生成 + 验证 + 重试） | `AiStreamService`（纯透传，零验证） |
| **前端入口** | `AiChatPanel.vue` + `ai-loop.ts`（AIPageLoop） | `AiDesignStudio.vue` + `useDesignSession.ts` |
| **自动迭代** | ✅ 3 轮，5s 日志收集延迟 | ❌ 一次性生成，无错误反馈循环 |
| **验证机制** | 后端：JSON 语法 + 截断检测 + 括号平衡 + `__init__` | 前端：仅 `@@proposal:name` 块提取 |

### 1.2 AiChatPanel 生成流程

```
用户输入需求
  ↓
handleSend() → readPageFiles()（已有页面时追加上下文）
  ↓
AIPageLoop.generate() / iterate()
  ↓ POST /api/ai/chat
AiPageService.processRequest()
  ├─ Phase 1: rule.json + style.css
  │    └─ callPhase() × 3 次盲目重试（⚠️ 无 error feedback）
  │    └─ validatePhaseFiles()
  ├─ Phase 2: pagedata.json + script.js
  │    └─ callPhase() × 3 次盲目重试
  │    └─ validatePhaseFiles()
  └─ needsIteration? → 追加验证反馈到对话 → 再次 callPhase()（仅此路径有反馈）
  ↓
writePageFiles() → POST /api/pages-config/{pageId}/__batch
  ↓
SSE 通知 → 前端热更新 → 5s 日志收集
  ↓
hasRenderErrors()? → 自动 iterate（最多 3 轮）
```

### 1.3 AiDesignStudio 设计流程

```
用户输入设计目标
  ↓
useAiChat.send() → POST /api/ai/chat/stream（SSE）
  ↓
AiStreamService.doStream() — 纯透传，零验证
  ↓
前端流式接收 → watch(isStreaming) 结束后
  ├─ extractBlocks() — @@proposal / @@query 块提取
  ├─ resolveQueries() — 解析 @@query 块
  └─ resolveComponentQuery() → 自动注入 Props 信息（AUTO_QUERY_PREFIX 防递归）
  ↓
用户 Accept/Reject 各 Proposal
  ↓
handleGenerate() → buildGenerationPrompt()（聚合所有已采纳 Proposal）
  ↓
一次性 POST /api/ai/chat → 无自动迭代 → 写入页面文件
```

### 1.4 已识别的 7 个缺陷

| # | 缺陷 | 影响 |
|---|------|------|
| 1 | **`callPhase()` 盲目重试** | 后端 Phase 重试 3 次用相同对话，不告知 LLM 上次错误 |
| 2 | **设计模式无自动迭代** | `handleGenerate()` 一次性生成，无错误反馈循环 |
| 3 | **前端零 JSON 验证** | AI 返回的 proposal 内容未做任何结构校验 |
| 4 | **硬编码处理逻辑** | Proposal 提取、Query 注入分散在 `watch` 回调中，不便扩展 |
| 5 | **无结构化反馈** | 验证错误以纯文本拼接，LLM 难以精准修复 |
| 6 | **SSE 无断线重连** | 网络抖动导致设计模式流式中断无恢复 |
| 7 | **流式无取消机制** | 用户无法中止正在进行的 AI 响应 |

---

## 2. SPARK vs Copilot — 结构性优势

### 2.1 根本差异

| 维度 | SPARK（配置交互） | Copilot（代码交互） |
|------|------------------|-------------------|
| 输出格式 | **4 个标准化文件**（rule.json / pagedata.json / script.js / style.css），schema 固定 | 任意结构代码，无固定 schema |
| 验证成本 | JSON Schema 校验 + DataKey 格式 + 组件注册表 = **机器可验证** | 需运行 linter/compiler/test = **高成本验证** |
| 迭代效率 | 错误定位精确（"table X 不存在"/"dataKey 格式错误"） | 错误模糊（编译错误可能跨文件连锁） |
| Token 消耗 | 仅传标准化配置结构 | 完整代码文件 + AST 上下文 |

### 2.2 Token 效率对比（估算）

```
典型 CRUD 页面：
  SPARK: rule.json(~2KB) + pagedata.json(~1.5KB) + script.js(~0.8KB) + style.css(~0.3KB) ≈ 4.6KB
  Copilot: Vue SFC(~8KB) + store(~3KB) + API(~2KB) + types(~1.5KB) + test(~4KB) ≈ 18.5KB+

比率: 约 1:4 ~ 1:5（SPARK 的token消耗仅为 Copilot 的 1/4 ~ 1/5）
```

### 2.3 可审核性

SPARK 的标准化格式天然支持**自动化审核**：

- **rule.json**: 组件类型可查注册表、dataKey 格式可正则校验、嵌套规则可静态分析
- **pagedata.json**: 表结构可比对企业数据目录、列类型可校验、关系定义可交叉验证
- **script.js**: 函数签名可检测、禁用 API 可静态扫描、`__init__` 存在性可断言
- **style.css**: 选择器规范可正则检查

Copilot 生成的自由格式代码无法做到这种低成本、高覆盖的自动审核。

---

## 3. 目标架构 — 五层交互体系

```
┌─────────────────────────────────────────────────────────┐
│  Layer 5: Enterprise Data Resource Catalog              │
│  ──────────────────────────────────────                  │
│  EnterpriseDataCatalog（表 / 字典 / 命名规范 / 敏感字段）│
│  ↓ 提供验证基准 + 查询数据                                │
├─────────────────────────────────────────────────────────┤
│  Layer 4: Query Protocol（扩展查询协议）                  │
│  ──────────────────────────────────────                  │
│  component-props / component-example / db-schema /       │
│  dict-list / datakey-help / api-template / relation-tpl  │
│  ↓ AI 主动查询 → 系统自动响应                             │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Validation Pipeline（语义验证管线）              │
│  ──────────────────────────────────────                  │
│  JSON 语法 → DataKey 格式 → 表交叉引用 → 组件类型 →       │
│  脚本引用 → Schema 完整性                                 │
│  ↓ 自动生成 ValidationFeedback                           │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Review Gate（审核节点）                         │
│  ──────────────────────────────────────                  │
│  审核节点 A: 数据资源审核（DB 变更 / 字典 / 命名 / 安全）  │
│  审核节点 B: UI 合规审核（组件 / DataKey / 脱敏 / 必填）   │
│  ↓ ReviewChecklist → 人工/自动审批                       │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Generate + Iterate Loop（生成迭代循环）         │
│  ──────────────────────────────────────                  │
│  二阶段生成 → 写入文件 → 热更新 → 日志收集 →              │
│  错误反馈 → 自动迭代（最多 3 轮）                         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. ResponsePipeline（响应处理管线）

### 4.1 管线架构

将当前 `watch(isStreaming)` 中散落的处理逻辑重构为 **6 个可插拔处理器** 的管线：

```
AI 原始响应
  ↓
┌────────────────┐
│ BlockExtractor  │ → 提取 @@proposal / @@query / @@review 定界块
└──────┬─────────┘
       ↓
┌──────────────────┐
│ ProposalValidator │ → JSON 语法校验（proposal payload 若为 JSON）
└──────┬───────────┘
       ↓
┌──────────────┐
│ SchemaChecker │ → DataKey 格式 / 表引用 / 组件类型 语义校验
└──────┬───────┘
       ↓
┌──────────────┐
│ QueryResolver │ → 解析 @@query 块，查目录返回组件/数据信息
└──────┬───────┘
       ↓
┌──────────────┐
│ AutoResponder │ → 组装自动回复消息（Props 注入 / 验证反馈）
└──────┬───────┘
       ↓
┌──────────────┐
│ StateUpdater  │ → 更新设计会话状态机（phase / proposals / checklist）
└──────────────┘
```

### 4.2 核心接口设计

```typescript
/** 管线上下文 — 在处理器之间共享 */
interface PipelineContext {
  rawContent: string                    // AI 原始响应文本
  proposals: DesignProposal[]           // 提取的 proposal 列表
  queries: ComponentQuery[]             // 提取的 query 列表
  validationErrors: ValidationFeedback[] // 累积的验证错误
  autoMessages: AutoMessage[]           // 待发送的自动回复
  reviewItems: ReviewChecklistItem[]    // 审核清单条目
  metadata: Record<string, unknown>     // 扩展数据（处理器间通信）
}

/** 处理器接口 */
interface ResponseProcessor {
  name: string
  /** 返回 true 继续管线，false 中断 */
  process(ctx: PipelineContext): boolean | Promise<boolean>
}

/** 验证反馈（结构化，非纯文本） */
interface ValidationFeedback {
  severity: 'error' | 'warning' | 'info'
  proposalTitle: string
  checkType: 'json-syntax' | 'datakey-format' | 'table-reference'
            | 'component-type' | 'script-reference' | 'schema'
  message: string
  /** 给 LLM 的修复建议 */
  suggestion?: string
  /** 定位到 proposal 内容的行号（近似） */
  line?: number
}

/** 自动回复消息 */
interface AutoMessage {
  type: 'props-injection' | 'validation-feedback' | 'query-response'
  content: string
  /** 来源 query/validation 的 ID */
  sourceId?: string
}

/** 组件查询（已实现） */
interface ComponentQuery {
  type: string    // 'component-props' | 'component-example' | 'db-schema' | 'dict-list' | ...
  target: string  // 查询目标（组件名 / 表名 / 字典名）
}
```

### 4.3 管线执行器

```typescript
class ResponsePipeline {
  private processors: ResponseProcessor[] = []

  use(processor: ResponseProcessor): this {
    this.processors.push(processor)
    return this
  }

  async execute(rawContent: string): Promise<PipelineContext> {
    const ctx: PipelineContext = {
      rawContent,
      proposals: [],
      queries: [],
      validationErrors: [],
      autoMessages: [],
      reviewItems: [],
      metadata: {},
    }
    for (const proc of this.processors) {
      const shouldContinue = await proc.process(ctx)
      if (!shouldContinue) break
    }
    return ctx
  }
}

// 使用示例
const pipeline = new ResponsePipeline()
  .use(new BlockExtractorProcessor())
  .use(new ProposalValidatorProcessor())
  .use(new SchemaCheckerProcessor(enterpriseCatalog))
  .use(new QueryResolverProcessor(componentCatalog, enterpriseCatalog))
  .use(new AutoResponderProcessor())
  .use(new StateUpdaterProcessor(designSession))
```

---

## 5. 语义验证层（5 级递进）

### 5.1 验证级别

| Level | 检查项 | 适用文件 | 示例 |
|-------|--------|---------|------|
| **L1 JSON 语法** | `JSON.parse()` 成功 | rule.json, pagedata.json | `SyntaxError: Unexpected token` |
| **L2 DataKey 格式** | `isDataKey()` 正则校验 | rule.json（dataKey 属性） | `"Users.rows"` → 旧格式已废弃 |
| **L3 表交叉引用** | rule.json 中 dataKey 引用的表名 ∈ pagedata.json.tables | rule.json ↔ pagedata.json | `dataKey:"Orders@rows"` 但 pagedata 无 Orders 表 |
| **L4 组件类型** | `type` ∈ 组件注册表 | rule.json | `type: "spark-table"` → 应为 `"r-table"` |
| **L5 脚本引用** | Render* 函数在 script.js 中有定义 | rule.json ↔ script.js | rule 引用 `RenderAddBtn` 但 script 只定义了 `RenderAddButton` |

### 5.2 跨文件一致性检查清单

```
[L3] ∀ dataKey in rule.json:
     parseDataKey(dk).tableName ∈ pagedata.tables

[L3] ∀ relation in pagedata.relations:
     relation.parentTable ∈ pagedata.tables
     relation.childTable  ∈ pagedata.tables

[L4] ∀ rule in rule.json:
     rule.type ∈ componentRegistry ∪ HTML_NATIVE_TAGS

[L5] ∀ rule.type == "Render*" in rule.json:
     "function " + rule.type + "(" 存在于 script.js

[L5] rule.json 中 on* 事件引用的函数名 存在于 script.js
```

### 5.3 验证反馈格式（给 LLM）

```json
{
  "validationErrors": [
    {
      "severity": "error",
      "checkType": "table-reference",
      "proposalTitle": "数据模型设计",
      "message": "rule.json 中 dataKey 'Orders@rows' 引用了表 'Orders'，但 pagedata.json 未定义该表",
      "suggestion": "在 pagedata.json 的 tables 中添加 'Orders' 表定义，或修改 dataKey 为已有表名"
    },
    {
      "severity": "warning",
      "checkType": "component-type",
      "proposalTitle": "UI 结构设计",
      "message": "组件类型 'el-input' 建议替换为 SPARK 字段组件 'r-text'",
      "suggestion": "将 type 改为 'r-text'，它支持 DataView 双向绑定和容器上下文感知"
    }
  ]
}
```

---

## 6. 企业数据资源审核层

### 6.1 设计背景

AI 生成页面时可能涉及：
- **新增/修改数据库表**：需评估对现有数据模型的影响
- **新增/修改字典项**：需确保字典编码一致性
- **涉及敏感字段**：身份证、手机号、银行卡需脱敏
- **命名规范**：表名/字段名/字典编码需符合企业规范

这些变更不能仅靠 AI 自主决定，需要**人工审核节点**。

### 6.2 审核节点 A — 数据资源审核

**触发时机**: AI 采纳了 `data-model` 或 `db-schema` 类型的 proposal 后

**检查维度**:

| 检查项 | 自动/人工 | 说明 |
|--------|----------|------|
| 表是否已存在 | 自动 | 查 EnterpriseDataCatalog，已存在则 warning |
| 字段命名规范 | 自动 | camelCase / snake_case + 长度限制 |
| 必要字段完整 | 自动 | 主键、创建时间、更新时间、创建人等 |
| 敏感字段标记 | 自动 | 匹配 sensitivePatterns（手机/身份证/邮箱/银行卡） |
| 字典引用合法 | 自动 | 引用的字典编码 ∈ 企业字典目录 |
| 索引建议 | 自动 | 外键字段、高频查询字段 |
| DDL 生成预览 | 自动 | 输出 CREATE TABLE / ALTER TABLE SQL |
| **影响评估** | **人工** | 对现有数据的影响范围、迁移方案 |

### 6.3 审核节点 B — UI 合规审核

**触发时机**: AI 采纳了 `ui-structure` 类型的 proposal 后

**检查维度**:

| 检查项 | 自动/人工 | 说明 |
|--------|----------|------|
| 组件类型合法 | 自动 | type ∈ 注册表 |
| DataKey 交叉引用 | 自动 | 引用的表名 ∈ pagedata.tables |
| 敏感字段脱敏 | 自动 | 身份证/手机号字段需配置 `masked: true` |
| 必填字段验证规则 | 自动 | 标记为 required 的字段需有 `validate` |
| 权限字段检查 | 自动 | 涉及权限的字段需配合 `_perm` 快照 |
| **UX 审核** | **人工** | 布局合理性、交互流畅度 |

### 6.4 核心类型定义

```typescript
/** 审核清单条目 */
interface ReviewChecklistItem {
  id: string
  category: 'db-change' | 'dict-change' | 'naming' | 'security' | 'consistency' | 'ux'
  severity: 'blocker' | 'warning' | 'info'
  description: string
  status: 'pending' | 'approved' | 'rejected' | 'auto-passed'
  /** 审核人反馈 */
  feedback?: string
  /** 关联的 proposal ID */
  relatedProposalId?: string
  /** 自动修复建议（可一键应用） */
  autoFixSuggestion?: string
}

/** 企业数据目录 */
interface EnterpriseDataCatalog {
  tables: Record<string, {
    tableName: string
    /** 物理表名（数据库） */
    physicalName?: string
    columns: Array<{
      name: string
      type: string
      nullable: boolean
      comment?: string
      /** 关联字典编码 */
      dictCode?: string
    }>
    primaryKey: string[]
    indexes?: Array<{ name: string; columns: string[]; unique: boolean }>
    comment?: string
  }>
  dictionaries: Record<string, {
    code: string
    name: string
    items: Array<{ value: string | number; label: string }>
  }>
  /** 命名规范（正则） */
  namingConventions: {
    tableName: RegExp     // e.g. /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
    columnName: RegExp    // e.g. /^[a-z][a-zA-Z0-9]*$/
    dictCode: RegExp      // e.g. /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/
  }
  /** 敏感字段模式 */
  sensitivePatterns: Array<{
    pattern: RegExp        // e.g. /phone|mobile|tel/i
    maskType: 'phone' | 'idcard' | 'email' | 'bankcard'
  }>
}

/** 扩展的 ProposalType（新增 3 种） */
type ProposalType =
  | 'data-model'       // 数据模型设计（pagedata.json）
  | 'ui-structure'     // UI 结构设计（rule.json）
  | 'interaction'      // 交互逻辑（script.js）
  | 'style'            // 样式（style.css）
  | 'api-config'       // API 配置
  | 'db-schema'        // 🆕 数据库表变更（DDL）
  | 'dict-entry'       // 🆕 字典变更
  | 'review-checklist' // 🆕 自动生成的审核清单
```

### 6.5 审核流程

```
AI 输出 Proposal（data-model / db-schema / ui-structure / ...）
  ↓
ResponsePipeline 处理（基于 @@type:name 定界符协议）
  ↓ BlockExtractor → ProposalValidator → SchemaChecker
  ↓
自动生成 ReviewChecklistItem[]
  ↓
  ┌─ severity == 'blocker' 且 status == 'pending'?
  │    ├─ YES → 🚫 阻断：必须人工审批后才能继续
  │    └─ NO  →
  │
  ├─ severity == 'warning'?
  │    ├─ 自动检查通过 → status = 'auto-passed'
  │    └─ 自动检查未通过 → status = 'pending'，显示 warning 面板
  │
  └─ severity == 'info'?
       → status = 'auto-passed'，仅记录
  ↓
审核面板 UI
  ├─ ✅ Approve → status = 'approved'
  ├─ ❌ Reject → status = 'rejected' + feedback
  └─ 💬 Discuss → 追加到 AI 对话（带结构化审核反馈）
  ↓
所有 blocker 已 approved + 无 rejected?
  ↓ YES
进入 Generate Loop（Layer 1）
```

---

## 7. 扩展查询协议

### 7.1 当前已实现

| Query Type | 目标 | 数据来源 |
|-----------|------|---------|
| `component-props` | SPARK 组件 Props 信息 | `componentPropsCatalog.ts` 静态目录 |

### 7.2 规划扩展

| Query Type | 目标 | 数据来源 | 优先级 |
|-----------|------|---------|--------|
| `component-example` | 组件配置示例 | 静态示例库 / pages-config 已有页面 | P2 |
| `db-schema` | 企业数据库表结构 | EnterpriseDataCatalog | P3 |
| `dict-list` | 企业字典项列表 | EnterpriseDataCatalog | P3 |
| `datakey-help` | DataKey 格式帮助 + 当前页面可用 DataKey | pagedata.json 动态解析 | P2 |
| `api-template` | API 端点配置模板 | 后端 Swagger / 静态模板 | P3 |
| `relation-template` | DataRelation 配置模板 | 静态模板 | P2 |

### 7.3 查询协议格式

AI 在响应中嵌入 `<query>` 标签请求信息：

```xml
<!-- AI 请求组件 Props -->
<query type="component-props" target="r-table" />

<!-- AI 请求数据库表结构 -->
<query type="db-schema" target="sys_user" />

<!-- AI 请求字典列表 -->
<query type="dict-list" target="gender" />

<!-- AI 请求 DataKey 帮助（当前页面上下文） -->
<query type="datakey-help" target="Orders" />
```

系统自动响应格式（注入到对话中）：

```
[AUTO-QUERY-RESPONSE: component-props for r-table]
## r-table Props
- dataKey: string — DataKey 绑定（如 "Users@rows"）
- ...

请基于以上 Props 信息继续设计。
```

---

## 8. 状态机扩展

### 8.1 当前状态

```
idle → discussing → ready → generating → applied
```

### 8.2 扩展后状态

```
idle
  ↓ 用户发起设计目标
discussing
  ↓ AI 返回 proposal
  ↓ ResponsePipeline 处理
validating
  ├─ 验证通过 → correcting（有 warning）/ ready（无错误）
  └─ 验证失败
correcting
  ↓ 自动发送 ValidationFeedback 给 AI
  ↓ AI 修正 proposal
  → 回到 validating
ready
  ↓ 用户确认
reviewing
  ↓ 审核清单展示
  ├─ 全部 approved → generating
  ├─ 有 rejected → discussing（带审核反馈）
  └─ 有 pending blocker → 等待审批
generating
  ↓ 二阶段生成
verifying
  ↓ 日志收集 + 错误检测
  ├─ 无错误 → applied
  └─ 有错误 → iterating
iterating
  ↓ 错误反馈给 AI → 重新生成
  ├─ 修复成功 → applied
  └─ 超过 3 轮 → failed（需人工介入）
applied
  ↓ 页面已生效
```

### 8.3 状态转换表

| 当前状态 | 事件 | 目标状态 | 动作 |
|---------|------|---------|------|
| `idle` | 用户输入 | `discussing` | 发送到 AI |
| `discussing` | AI 响应完成 | `validating` | 运行 ResponsePipeline |
| `validating` | 全部通过 | `ready` | 展示"可生成"按钮 |
| `validating` | 有 warning | `correcting` | 自动发送反馈 |
| `validating` | 有 error | `correcting` | 自动发送反馈 |
| `correcting` | AI 修正响应 | `validating` | 重新验证 |
| `ready` | 用户确认 | `reviewing` | 展示审核清单 |
| `reviewing` | 全部 approved | `generating` | 开始生成 |
| `reviewing` | 有 rejected | `discussing` | 审核反馈注入对话 |
| `generating` | 文件写入完成 | `verifying` | 启动日志收集 |
| `verifying` | 无错误 | `applied` | 完成 |
| `verifying` | 有错误 | `iterating` | 发送错误反馈 |
| `iterating` | 修复成功 | `applied` | 完成 |
| `iterating` | 超过 3 轮 | `failed` | 需人工介入 |

---

## 9. 实施路线图

### P0 — 类型系统基础

**范围**: 扩展类型定义，为后续实现奠基

- [ ] `ProposalType` 扩展：新增 `'db-schema' | 'dict-entry' | 'review-checklist'`
- [ ] `ReviewChecklistItem` 接口定义
- [ ] `ValidationFeedback` 接口定义
- [ ] `PipelineContext` / `ResponseProcessor` 接口定义
- [ ] `EnterpriseDataCatalog` 接口定义
- [ ] 状态机扩展类型（`DesignPhase` 新增 `'validating' | 'correcting' | 'reviewing' | ...`）

**产出文件**: `src/composables/useDesignSession.ts`（类型区域）

### P1 — 验证管线

**范围**: ResponsePipeline 核心 + JSON/DataKey/组件类型 验证

- [ ] `ResponsePipeline` 类实现
- [ ] `BlockExtractorProcessor`（基于 `@@type:name ... @@end` 定界符协议，替换旧 XML 标签提取）
- [ ] `ProposalValidatorProcessor`（JSON.parse 校验 proposal payload 中的 JSON 内容）
- [ ] `SchemaCheckerProcessor`（L2 DataKey 格式 + L4 组件类型校验）
- [ ] `AutoResponderProcessor`（组装 ValidationFeedback → 自动消息）
- [ ] `StateUpdaterProcessor`（更新 phase / proposals）
- [ ] 替换 `watch(isStreaming)` 中的散落逻辑为管线调用

**产出文件**: `src/composables/responsePipeline.ts`（新建）

### P2 — 审核清单 UI

**范围**: 审核面板组件 + 审批流程

- [ ] `ReviewChecklist.vue` 组件（清单展示 + Approve/Reject/Discuss 按钮）
- [ ] 审核状态持久化（sessionStorage / 对话级别）
- [ ] "Discuss" 操作：将审核反馈结构化注入 AI 对话
- [ ] 阻断逻辑：有 pending blocker 时禁用"生成"按钮
- [ ] `AiDesignStudio.vue` 集成审核面板

**产出文件**: `src/components/ReviewChecklist.vue`（新建）

### P3 — 企业资源层

**范围**: EnterpriseDataCatalog 接入 + 数据库/字典查询协议

- [ ] `EnterpriseDataCatalog` 数据加载（API 接口 / 静态配置）
- [ ] `QueryResolverProcessor` 扩展：支持 `db-schema` / `dict-list` 查询类型
- [ ] `SchemaCheckerProcessor` 扩展：L3 表交叉引用（对比企业目录）
- [ ] 敏感字段自动检测 + 脱敏提示
- [ ] DDL 预览生成
- [ ] DESIGN_SYSTEM_PROMPT 更新：新增查询类型声明

**产出文件**: `src/composables/enterpriseCatalog.ts`（新建）

### P4 — 生成迭代循环

**范围**: 设计模式完整闭环

- [ ] `AiDesignStudio` 的 `handleGenerate()` 接入自动迭代循环（复用 AiChatPanel 的迭代逻辑）
- [ ] SSE 断线重连机制
- [ ] 流式取消（AbortController）
- [ ] L5 脚本引用校验（rule.json 中 Render* ↔ script.js 函数定义）
- [ ] 后端 `callPhase()` 盲目重试改为带 error feedback 的智能重试（需后端配合）

---

## 10. 关键文件索引

### 前端 — 已有文件

| 文件 | 职责 |
|------|------|
| `src/composables/useDesignSession.ts` | 设计会话状态管理、Prompt 构建、Proposal/Query 提取 |
| `src/composables/componentPropsCatalog.ts` | 组件 Props 静态目录（25 个组件） |
| `src/composables/useAiChat.ts` | 通用 AI 对话 composable（SSE 流式） |
| `src/components/AiDesignStudio.vue` | 协作设计模式 UI |
| `src/components/AiChatPanel.vue` | 页面生成模式 UI |
| `packages/spark-app/src/ai/ai-loop.ts` | AIPageLoop、PageLogCollector、文件写入 |

### 前端 — 规划新建文件

| 文件 | 职责 | 阶段 |
|------|------|------|
| `src/composables/responsePipeline.ts` | ResponsePipeline + 6 个处理器 | P1 |
| `src/components/ReviewChecklist.vue` | 审核清单面板 | P2 |
| `src/composables/enterpriseCatalog.ts` | 企业数据目录接入 | P3 |

### 后端（只读参考，禁止修改）

| 文件 | 职责 |
|------|------|
| `AiPageService.java` | 二阶段生成 + 验证 + 重试 |
| `AiStreamService.java` | SSE 流式透传 |
| `AiChatController.java` | REST 端点 |
| `system-prompt.txt` | 后端系统提示词 |

---

## 附录 A: pagedata.json 标准结构

```jsonc
{
  "dataset": {
    "dataSetName": "PageDS",
    "tables": {
      "TableName": {
        "tableName": "TableName",
        "columns": [
          { "name": "id", "type": "string" },
          { "name": "name", "type": "string" },
          { "name": "total", "type": "number", "computeExpression": "price * qty" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": "1", "name": "示例" }
            ],
            "aggregates": {
              "total": { "type": "sum" }
            }
          }
        },
        "api": {
          "list": { "url": "/api/table-name", "method": "GET" }
        }
      }
    },
    "relations": [
      {
        "parentTable": "Parent",
        "childTable": "Child",
        "parentField": "id",
        "childField": "parentId"
      }
    ]
  }
}
```

## 附录 B: rule.json 标准结构

```jsonc
[
  {
    "type": "div",
    "style": { "padding": "16px" },
    "children": [
      {
        "type": "r-table",
        "name": "ordersTable",
        "dataKey": "Orders@rows",
        "props": {
          "border": true,
          "stripe": true,
          "highlightCurrentRow": true
        },
        "children": [
          { "type": "r-text", "name": "orderId", "props": { "label": "订单号" } },
          { "type": "r-number", "name": "amount", "props": { "label": "金额" } },
          {
            "type": "r-select",
            "name": "status",
            "props": {
              "label": "状态",
              "options": [
                { "value": "pending", "label": "待处理" },
                { "value": "done", "label": "已完成" }
              ]
            }
          }
        ]
      }
    ]
  }
]
```

## 附录 C: 4 文件交叉引用关系图

```
rule.json                         pagedata.json
┌──────────────────────┐         ┌──────────────────────┐
│ type: "r-table"      │         │ tables:              │
│ dataKey: "Orders@rows"├────────►│   Orders:            │
│ children:            │   引用   │     columns: [...]   │
│   r-text  name:"id"  ├─┐      │     views.default:   │
│   r-number name:"amt"│ │      │       rows: [...]    │
│   RenderCustom       │ │      │   Items:             │
└──────────────────────┘ │      │     columns: [...]   │
                         │      └──────────────────────┘
                         │
                         │      script.js
                         │      ┌──────────────────────┐
                         │      │ function __init__(){} │
                         └──────►function RenderCustom()│
                          引用   │   return h(...)      │
                                │ function handleXxx() │
                                └──────────────────────┘
                                         │
                                         │ 读取
                                         ▼
                                style.css
                                ┌──────────────────────┐
                                │ .custom-class { ... } │
                                └──────────────────────┘
```

## 附录 D: `@@type:name` 协议 vs XML 标签 vs 裸 JSON 对比

### 为什么不用 XML 标签？

| 问题 | XML `<proposal>` | `@@` 定界符 |
|------|-----------------|------------|
| LLM 闭合错误 | `</proposal>` 须匹配标签名，LLM 偶尔写成 `</Proposal>` 或 `</table>` | `@@end` 固定字符串，**零拼写风险** |
| payload 转义 | JSON 中 `<` `>` 需要 `&lt;` `&gt;`，LLM 经常忘记 | payload 原样保留，**零转义** |
| Markdown 冲突 | `<proposal>` 可能被 Markdown 渲染器误认为 HTML 标签吞掉 | `@@` 前缀不被任何渲染器误解 |
| 属性解析 | `<proposal type="..." title="..." stage="...">` 属性顺序/引号不稳定 | `@@type:name` 固定二段式，无属性 |
| 解析器复杂度 | 需处理属性提取、自闭合、嵌套、命名空间 | 一个正则 `/^@@(\w+):([\w-]+)\s*$([\s\S]*?)^@@end\s*$/gm` 搞定 |
| 流式边界检测 | 需维护标签栈匹配开闭标签 | 行首 `@@` / `@@end` 检测，无需栈 |

### 为什么不用裸 JSON？

| 问题 | 裸 JSON | `@@` 定界符 |
|------|---------|------------|
| 多提案分隔 | 多个 JSON 对象靠括号深度追踪分隔，错误率高 | 每个块有显式开/闭定界符 |
| 非 JSON payload | 不支持（script.js 是 JavaScript，style.css 是 CSS） | payload 可以是任意格式 |
| 块类型标记 | 需在 JSON 内部约定 `{ "type": "proposal", ... }` | type 在定界符上，payload 纯净 |

### 为什么不迁移 rule.json / pagedata.json 为 XML？

详见内部评估（2026-03-13），核心结论：

1. **LLM Token 效率**：JSON 约为 XML 的 65-80%（SPARK 对 Copilot 的 token 优势从 1:4~1:5 缩减到 1:3~1:4）
2. **pagedata.json 反模式**：XML 不区分数据类型（所有属性值为字符串），`total: 100`(number) 变成 `total="100"`(string)
3. **迁移成本极高**：涉及旧 bindRules 链（现已移除）、parsePageData、AiPageService、system-prompt、所有页面配置、全部测试
4. **现有验证链重写**：JSON.parse + 括号平衡已稳定运行，XML parser + DTD/XSD 从零开始

**最终决策**：页面配置保持 JSON，AI 交互协议使用 `@@type:name` 定界符（两者互补）。
