# spark-ai 架构全景

> 自动生成于 2026-03-22，基于 14 个源文件（~4500+ 行）的完整代码审计。

---

## 目录

- [1. 模块依赖关系](#1-模块依赖关系)
- [2. AIPageLoop 主循环](#2-aipageloop-主循环)
- [3. SSE 流式处理](#3-sse-流式处理)
- [4. Response Pipeline（7 处理器）](#4-response-pipeline7-处理器)
- [5. Config Validation 校验](#5-config-validation-校验)
- [6. Design Session 状态机](#6-design-session-状态机)
- [7. 端到端数据流](#7-端到端数据流)

---

## 1. 模块依赖关系

14 个源文件的 import 方向 + 外部依赖一览。

```mermaid
graph TB
    subgraph "spark-ai 包架构"
        IDX["index.ts<br/>统一导出入口"]
        LOOP["ai-loop.ts<br/>核心引擎 ~950行"]
        PIPE["response-pipeline.ts<br/>7处理器管线 ~660行"]
        VALID["config-validator.ts<br/>4类校验 ~320行"]
        PROTO["protocol.ts<br/>SSE协议解析 ~300行"]
        DS["design-session.ts<br/>提案提取+提示词 ~400行"]
        SS["session-state.ts<br/>双通道状态机 ~960行"]
        SK["skill-catalog.ts<br/>14+设计模式 ~400行"]
        NAV["nav-register.ts<br/>导航注册"]
        PC["page-cache.ts<br/>缓存管理"]
        SC["shared-constants.ts<br/>DATAKEY_RE / HTML_TYPES"]
        DP["design-prompt.ts<br/>系统提示词"]
        NP["nav-planner-prompt.ts<br/>导航提示词"]
        CPC["component-props-catalog.ts<br/>组件Props字典"]
    end

    subgraph "外部依赖"
        SU["spark-utils<br/>createRequest / NavNode"]
        BE["Java 后端<br/>Spring Boot 8080"]
    end

    IDX --> LOOP & PIPE & VALID & PROTO & DS & SS & SK & NAV & PC

    LOOP -->|"validateGeneratedConfig"| VALID
    LOOP -->|"clearPageCache"| PC
    LOOP -->|"registerPageNavigation"| NAV
    LOOP -->|"StreamCallbacks"| PROTO
    LOOP -->|"createRequest"| SU

    PIPE -->|"extractProposals / resolveComponentQuery"| DS
    PIPE -->|"resolveSkillQuery"| SK
    PIPE -->|"DATAKEY_RE / HTML_TYPES"| SC
    PIPE -->|"getRegisteredTableNames"| SS

    VALID -->|"DATAKEY_RE / HTML_TYPES"| SC

    DS -->|"extractBlocks / stripBlocks"| PROTO
    DS -->|"COMPONENT_PROPS_CATALOG"| CPC
    DS -->|"DESIGN_SYSTEM_PROMPT"| DP

    SS -.->|"type-only: ProposalType"| DS
    SK -.->|"type-only: ProposalType"| DS

    NAV -->|"createRequest / NavNode"| SU

    LOOP -->|"HTTP POST / SSE"| BE
    NAV -->|"HTTP POST"| BE
```

### 依赖规则

| 层级 | 模块 | 可依赖 |
|------|------|--------|
| **零依赖** | `protocol.ts`, `page-cache.ts`, `shared-constants.ts`, `design-prompt.ts`, `nav-planner-prompt.ts`, `component-props-catalog.ts` | 无内部依赖 |
| **基础层** | `design-session.ts` | protocol, component-props-catalog, design-prompt |
| **基础层** | `session-state.ts`, `skill-catalog.ts` | design-session (type-only) |
| **管线层** | `response-pipeline.ts` | design-session, skill-catalog, session-state, shared-constants |
| **管线层** | `config-validator.ts` | shared-constants |
| **引擎层** | `ai-loop.ts` | config-validator, page-cache, nav-register, protocol, spark-utils |

---

## 2. AIPageLoop 主循环

4 个入口点 → `_callAI` / `_callAIStream` → 统一 `_postProcess` 后处理 → 自动迭代守卫。

```mermaid
flowchart TD
    START(["用户调用"])

    subgraph "入口点"
        GEN["generate(prompt, pageId)"]
        ITER["iterate(prompt, pageId, files)"]
        GS["generateStream(prompt, pageId, cb)"]
        IS["iterateStream(prompt, pageId, files, cb)"]
    end

    START --> GEN & ITER & GS & IS

    subgraph "_callAI — 同步路径"
        INJ["注入 skillCatalog → system prompt"]
        POST["http.post('/api/ai/chat')<br/>mode: generate | iterate"]
        RESP["AIResponse { files, explanation, needsIteration }"]
    end

    GEN & ITER --> INJ --> POST --> RESP

    subgraph "_callAIStream — 流式路径"
        FETCH["fetch('/api/ai/chat/stream-page')"]
        SSE["consumeSSEStream()"]
        EVENTS["事件: delta / reasoning / phase<br/>usage / result / done / error"]
        FINAL["finalResult → AIResponse"]
    end

    GS & IS --> FETCH --> SSE --> EVENTS --> FINAL

    subgraph "_postProcess — 统一后处理"
        PP1["① withValidationReport(files)"]
        PP2["② onResponseProcessed?.(resp)"]
        PP3{"resp.files 存在？"}
        PP4["③ writePageFiles → PUT /__batch"]
        PP5{"generate 且 autoRegisterNav?"}
        PP6["④ registerPageNavigation"]
        PP7["⑤ onFilesUpdated?.(resp)"]
    end

    RESP & FINAL --> PP1 --> PP2 --> PP3
    PP3 -->|是| PP4 --> PP5
    PP3 -->|否| PP7
    PP5 -->|是| PP6 --> PP7
    PP5 -->|否| PP7

    subgraph "自动迭代守卫"
        AUTO{"needsIteration 且非自动迭代中?"}
        SET["setAutoIterating(true)"]
        TMO["setTimeout 超时保护"]
        CALL["iterate() 递归"]
        DONE["setAutoIterating(false)"]
    end

    PP7 --> AUTO
    AUTO -->|触发| SET --> TMO --> CALL --> DONE
    AUTO -->|不触发| END(["流程结束"])
    DONE --> END
```

### 构造器选项

| 选项 | 类型 | 说明 |
|------|------|------|
| `aiEndpoint` | `string` | AI 后端地址 |
| `onFilesUpdated` | `(resp) => void` | 文件写入后回调 |
| `onError` | `(err) => void` | 错误回调（始终触发，不受 DEV 守卫） |
| `logCollectDelay` | `number` | 日志收集延迟 ms |
| `skillCatalog` | `string` | 技能目录文本 |
| `includeGlobalDiagnostics` | `boolean` | 是否包含全局诊断 |
| `autoRegisterNav` | `boolean` | generate 后自动注册导航 |
| `onNavigationRegistered` | `(pageId) => void` | 导航注册成功回调 |
| `autoIterateTimeout` | `number` | 自动迭代超时 ms |
| `onResponseProcessed` | `(resp) => void` | Pipeline 挂接点 |

### 全局配置

```typescript
configureAILoopHttp({
  getHeaders: () => ({ Authorization, 'X-Tenant-Id', 'X-Project-Id' }),
  getPageApiUrl: (pageId) => `/api/tenants/.../pages-config/${pageId}`,
  getNavApiUrl: () => `/api/tenants/.../navigation/nodes`,
})
```

---

## 3. SSE 流式处理

`_callAIStream` 替换端点为 `/chat/stream-page`，通过 `consumeSSEStream` 逐块解析。

```mermaid
sequenceDiagram
    participant UI as 前端 UI
    participant Loop as AIPageLoop
    participant BE as Java 后端
    participant SSE as consumeSSEStream

    UI->>Loop: generateStream(prompt, pageId, callbacks)
    Loop->>Loop: 替换 /chat → /chat/stream-page
    Loop->>BE: fetch(POST, ReadableStream)
    BE-->>Loop: Response.body

    Loop->>SSE: consumeSSEStream(reader, callbacks)
    activate SSE

    loop 每个 SSE 事件
        SSE->>SSE: TextDecoder 解析 event: / data:

        alt event: delta
            SSE-->>UI: onDelta(text) — 实时文本
        else event: reasoning
            SSE-->>UI: onReasoning(text) — 推理过程
        else event: phase
            SSE-->>UI: onPhase(name) — 阶段标识
        else event: usage
            SSE-->>UI: onUsage(tokenUsage) — Token统计
        else event: result
            SSE->>SSE: JSON.parse → 暂存 finalResult
        else event: error
            SSE-->>UI: onError(msg)
            SSE->>SSE: throw Error
        else event: done
            SSE->>SSE: 结束读取
        end
    end

    deactivate SSE

    alt finalResult 存在
        SSE-->>Loop: return AIResponse
    else 无 result
        SSE-->>Loop: throw "Stream ended without result"
    end

    Loop->>Loop: _postProcess(response)
    Loop-->>UI: 完成
```

### StreamCallbacks

| 回调 | 触发时机 |
|------|---------|
| `onDelta(text)` | 每个 delta 文本片段 |
| `onReasoning(text)` | 推理 token |
| `onPhase(name)` | 阶段切换 |
| `onUsage(usage)` | Token 用量 |
| `onError(msg)` | 错误事件 |

---

## 4. Response Pipeline（7 处理器）

`createStandardPipeline()` 创建标准管线，处理器按顺序串行执行。

```mermaid
flowchart TD
    IN(["pipeline.execute(rawContent, messageId, session?)"])
    CTX["PipelineContext 初始化"]

    subgraph P1["P1 BlockExtractor"]
        P1A["extractBlocks() — @@type:name...@@end"]
        P1OUT["产出: proposals[] / queries[]<br/>clarifyBlocks[] / compareBlocks[]<br/>skillQueryRequests[] / cleanContent"]
    end

    subgraph P2["P2 ProposalValidator"]
        P2A{"提案 type ∈<br/>data-model / ui-structure<br/>api-config / dict-entry?"}
        P2B["JSON.parse(content)"]
        P2ERR["→ validationErrors: json-syntax"]
    end

    subgraph P3["P3 SchemaChecker"]
        P3A["递归 walkNodes() — ui-structure 提案"]
        P3B["检查: 组件 type ∉ HTML_TYPES 且无合法前缀 → warning"]
        P3C["检查: dataKey ∉ DATAKEY_RE → error"]
    end

    subgraph P4["P4 QueryResolver"]
        P4A["resolveComponentQuery(components)<br/>→ COMPONENT_PROPS_CATALOG"]
        P4OUT["→ metadata.resolvedProps"]
    end

    subgraph P5["P5 SkillQueryProcessor"]
        P5A["resolveSkillQuery(queryType, targets)"]
        P5OUT["→ metadata.skillQueryResults"]
    end

    subgraph P6["P6 RegistryValidator"]
        P6A{"session 存在?"}
        P6B["validateDataModel — 重复表名"]
        P6C["validateViewPlan — 表名须在名册A"]
        P6D["validateUiStructure — dataKey/field 校验"]
        P6E["validateInteraction — 函数引用 + 声明提取"]
        P6F["validateStyle — CSS 类交叉检查"]
        P6G["→ discoveredFunctions[]"]
    end

    subgraph P7["P7 AutoResponder"]
        P7A["props-injection ← resolvedProps"]
        P7B["query-response ← skillQueryResults"]
        P7C["validation-feedback ← validationErrors"]
        P7OUT["→ autoMessages[]"]
    end

    OUT(["返回 PipelineContext"])

    IN --> CTX --> P1A --> P1OUT
    P1OUT --> P2A
    P2A -->|是| P2B
    P2B -->|失败| P2ERR
    P2A & P2ERR --> P3A
    P3A --> P3B & P3C
    P3B & P3C --> P4A --> P4OUT --> P5A --> P5OUT --> P6A
    P6A -->|是| P6B & P6C & P6D & P6E & P6F
    P6E --> P6G
    P6A -->|否| P7A
    P6B & P6C & P6D & P6F & P6G --> P7A
    P7A & P7B & P7C --> P7OUT --> OUT
```

### PipelineContext 字段

| 字段 | 来源 | 说明 |
|------|------|------|
| `rawContent` | 输入 | AI 原始回复 |
| `messageId` | 输入 | 消息 ID |
| `cleanContent` | P1 | 去除 @@ 块后的纯文本 |
| `proposals` | P1 | 结构化提案列表 |
| `queries` | P1 | 组件 Props 查询请求 |
| `clarifyBlocks` | P1 | 追问块 |
| `compareBlocks` | P1 | 方案对比块 |
| `skillQueryRequests` | P1 | 技能查询请求 |
| `discoveredFunctions` | P6 | interaction 中发现的函数名 |
| `validationErrors` | P2-P6 | 累积校验错误 |
| `autoMessages` | P7 | 待发送自动回复 |
| `metadata` | P4-P5 | 中间数据 |
| `session?` | 注入 | 设计会话状态 |

---

## 5. Config Validation 校验

`validateGeneratedConfig(files)` 在 `_postProcess` 第一步执行，返回 `ConfigValidationReport`。

```mermaid
flowchart TD
    IN(["validateGeneratedConfig(files)"])

    subgraph "输入解析"
        RULE["JSON.parse(rule.json) → ruleJson"]
        PD["JSON.parse(pagedata.json) → pageDataJson"]
        SCR["extractScriptFunctions(script.js)<br/>3种模式: function / 箭头 / 表达式<br/>→ scriptFunctions: Set"]
        TBL["extractTableNames(pageDataJson)<br/>→ tableNames: Set"]
        NODES["collectRuleNodes(ruleJson)<br/>递归收集 → RuleNodeSnapshot[]"]
    end

    IN --> RULE & PD & SCR
    PD --> TBL
    RULE --> NODES

    subgraph "① component 检查"
        C1["rule.json 无效 JSON → error"]
        C2["组件 type 不在 HTML_TYPES 且无合法前缀 → warning"]
        C3["r-* 使用废弃 name 属性 → warning"]
    end

    subgraph "② dataKey 检查"
        D1["pagedata.json 无效 JSON → warning"]
        D2["dataKey 不匹配 DATAKEY_RE → error"]
        D3["dataKey 引用表名不在 pagedata → error"]
    end

    subgraph "③ render 检查"
        R1["Render* 组件未在 script.js 定义 → error"]
    end

    subgraph "④ handler 检查"
        H1["on.event 函数未在 script.js 定义 → error"]
    end

    subgraph "⑤ 交叉检查"
        X1["使用 @currentRow 但未声明<br/>highlightCurrentRow → warning"]
    end

    NODES --> C1 & C2 & C3 & R1 & H1 & X1
    TBL --> D1 & D2 & D3
    SCR --> R1 & H1

    subgraph "输出"
        RPT["ConfigValidationReport<br/>valid: errors === 0<br/>summary: { total, errors, warnings, byCategory }<br/>issues: ConfigValidationIssue[]"]
    end

    C1 & C2 & C3 & D1 & D2 & D3 & R1 & H1 & X1 --> RPT
```

### 检查清单速查

| 类别 | 检查项 | 级别 |
|------|--------|------|
| component | rule.json 无效 JSON | error |
| component | 未知组件 type | warning |
| component | r-* 使用废弃 `name`（应为 `field`） | warning |
| component | @currentRow 缺少 highlightCurrentRow | warning |
| dataKey | pagedata.json 无效 JSON | warning |
| dataKey | dataKey 格式不匹配 | error |
| dataKey | dataKey 引用不存在的表 | error |
| render | Render* 函数未定义 | error |
| handler | 事件处理函数未定义 | error |

---

## 6. Design Session 状态机

### 双通道步骤推进（A1→A4→B1→B6）

```mermaid
stateDiagram-v2
    direction LR

    state "Pass A — 数据建模" as PassA {
        A1: A1 需求摸底
        A2: A2 技能扫描
        A3: A3 数据建模<br/>→ data-model
        A4: A4 名册A锁定<br/>→ data-model<br/>🔒 lockDataRegistry()

        A1 --> A2
        A2 --> A3
        A3 --> A4
    }

    state "Pass B — UI 设计" as PassB {
        B1: B1 视图规划 → view-plan
        B2: B2 UI 设计 → ui-structure
        B3: B3 交互设计 → interaction
        B4: B4 API 配置 → api-config
        B5: B5 样式打磨 → style
        B6: B6 全量校验<br/>runFullValidation()

        B1 --> B2
        B2 --> B3
        B3 --> B4
        B4 --> B5
        B5 --> B6
    }

    [*] --> A1
    A4 --> B1: 名册A必须已锁定
    B6 --> [*]
```

### 三大名册 + 提案写入

```mermaid
flowchart TD
    subgraph "名册"
        DR["📋 DataRegistry — 名册A<br/>tables: Record‹string, RegistryTable›<br/>  columns / relations / aggregates<br/>lockedAt: string | null"]
        VR["📋 ViewRegistry — 名册B-1<br/>views: Record‹string, RegistryView›<br/>  tableName / viewId / purpose / origin"]
        UR["📋 UIRegistry — 名册B-2<br/>componentIds / functionNames<br/>cssClassesDefined / cssClassesReferenced"]
    end

    subgraph "applyProposalToSession"
        DM["data-model → parseTableDef<br/>→ registerTable"]
        VP["view-plan → Markdown 表格解析<br/>→ registerView"]
        UI["ui-structure → walkUiNodes<br/>→ componentIds + cssRefs"]
        IA["interaction → 正则提取函数<br/>→ functionNames"]
        ST["style → 正则提取 .class<br/>→ cssClassesDefined"]
    end

    DM -->|写入| DR
    VP -->|写入| VR
    UI & IA & ST -->|追加| UR

    subgraph "级联校验"
        CI["checkCascadeImpact()<br/>锁定后修改 → 扫描依赖图<br/>→ 过滤 Pass B 提案<br/>→ CascadeImpact[]"]
    end

    DR -->|修改已锁定表| CI

    subgraph "B6 全量校验"
        FV["runFullValidation()<br/>① CSS 引用未定义<br/>② CSS 定义未引用<br/>③ 视图引用不存在的表<br/>④ 孤立视图"]
    end

    UR & VR & DR --> FV
```

### PersistedDesignSession 结构

```typescript
interface PersistedDesignSession {
  version: 1
  currentPass: 'A' | 'B'
  currentStep: DesignStep          // A1 | A2 | ... | B6
  dataRegistry: DataRegistry       // 名册A
  viewRegistry: ViewRegistry       // 名册B-1
  uiRegistry: UIRegistry           // 名册B-2
  acceptedProposals: AcceptedProposalSnapshot[]
  dependencyGraph: Record<string, string[]>  // 'Table.col' → [proposalId]
}
```

### 步骤推进规则

- `advanceStep(session)` — 沿 A1→…→B6 顺序前进，最后一步返回 `null`
- `canAdvanceTo(session, target)` — 不允许倒退；进入 Pass B 需名册 A 已锁定
- `serializeSession / deserializeSession` — JSON 持久化 + 版本/结构校验
- `buildSessionContextPrompt(session)` — 动态 Markdown 摘要注入 AI 系统提示词尾部

---

## 7. 端到端数据流

从用户 prompt 到页面渲染再到自动迭代的完整闭环。

```mermaid
flowchart TD
    USER(["👤 用户输入 prompt"])

    subgraph "① AIPageLoop"
        GEN["generate / generateStream"]
        SKILL["注入 skillCatalog"]
    end

    subgraph "② AI 后端"
        BE["Spring Boot<br/>/api/ai/chat<br/>/api/ai/chat/stream-page"]
        LLM["LLM（GPT-4o 等）"]
    end

    subgraph "③ 响应"
        RAW["AIResponse<br/>{ files, explanation, needsIteration }"]
    end

    subgraph "④ _postProcess"
        V["① validateGeneratedConfig"]
        RP["② ResponsePipeline（7 处理器）"]
        WF["③ writePageFiles → /__batch"]
        NR["④ registerPageNavigation → /nodes"]
        CB["⑤ onFilesUpdated → 前端路由"]
    end

    subgraph "⑤ 热更新"
        SSE2["SSE /api/events 文件变更"]
        CLR["clearPageCache()"]
        RLD["页面 reload"]
        LOG["PageLogCollector 日志收集"]
    end

    subgraph "⑥ 自动迭代"
        CHK{"needsIteration?"}
        ITER["iterate() + logs + 文件快照"]
    end

    USER --> GEN --> SKILL --> BE --> LLM --> BE --> RAW

    RAW --> V --> RP --> WF --> NR --> CB

    WF -->|SSE 广播| SSE2 --> CLR --> RLD --> LOG

    CB --> CHK
    CHK -->|是| ITER -->|循环| BE
    CHK -->|否| DONE(["✅ 完成"])

    LOG -.->|日志注入| ITER
```

### 关键集成点

| 集成点 | API | 用途 |
|--------|-----|------|
| `configureAILoopHttp()` | 应用启动 | 注入 auth headers + 多租户 URL 工厂 |
| `setConfigLoader(loader)` | page-cache | 注入 FileLoader 清缓存 |
| `onResponseProcessed` | 构造器 | 挂接 ResponsePipeline |
| `onFilesUpdated` | 构造器 | 路由导航到新页面 |
| `onNavigationRegistered` | 构造器 | 刷新侧边栏导航 |
| `setupHotReload()` | 应用层 | SSE → clearPageCache → reload |
| `PageLogCollector` | 全局 | 收集运行时日志 → 下次迭代注入 |

---

## 协议格式参考

### 通用块协议

```
@@type:name
payload content
@@end
```

正则: `BLOCK_RE = /^@@(\w+):([\w-]+)\s*$([\s\S]*?)^@@end\s*$/gm`

### 工具块协议

```
@@type:action#id
payload content
@@end
```

正则: `TOOL_BLOCK_RE = /@@(\w+):([\w.]+)#([\w-]+)\n([\s\S]*?)\n@@end/g`

### ProposalType 枚举（10 种）

`data-model` · `view-plan` · `ui-structure` · `interaction` · `style` · `api-config` · `db-schema` · `dict-entry` · `function-plan` · `navigation`

---

## 文件索引

| 文件 | 行数 | 职责 |
|------|------|------|
| `ai-loop.ts` | ~950 | 核心引擎：4 入口 + `_postProcess` + 自动迭代 + 全局配置 |
| `response-pipeline.ts` | ~660 | 7 处理器管线 + `createStandardPipeline()` |
| `session-state.ts` | ~960 | 双通道状态机 + 三名册 + 级联校验 + 序列化 |
| `design-session.ts` | ~400 | 提案提取 + 组件查询 + 追问/对比块 + 提示词构建 |
| `skill-catalog.ts` | ~400 | 14+ 设计模式目录 + `resolveSkillQuery` |
| `config-validator.ts` | ~320 | 4 类校验 + highlightCurrentRow 交叉检查 |
| `protocol.ts` | ~300 | SSE 协议解析 + `extractFirstJsonObject` 括号深度匹配 |
| `shared-constants.ts` | ~30 | `DATAKEY_RE` / `HTML_TYPES`(48) / `VALID_TYPE_PREFIXES` |
| `nav-register.ts` | ~80 | 导航注册 + `configureNavRegister` |
| `page-cache.ts` | ~60 | `setConfigLoader` / `clearPageCache` / `clearAllCache` |
| `design-prompt.ts` | — | `DESIGN_SYSTEM_PROMPT` 常量 |
| `nav-planner-prompt.ts` | — | `NAV_PLANNER_SYSTEM_PROMPT` 常量 |
| `component-props-catalog.ts` | — | `COMPONENT_PROPS_CATALOG` 字典 |
| `index.ts` | ~200 | 统一公共 API 导出 |
