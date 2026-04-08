# AI 前端统一方案（Frontend-First Unification）

> ⚠️ **历史归档文档（2026-04-04）**
>
> 本文撰写时前端 AI 引擎使用 Stills 文本协议（`@@type:name#id` 定界块格式）与 LLM 通信。
> **Stills 文本协议已于 2026-04 全面移除**，当前实现统一使用 **Function Calling (FC)** 替代。
> 文中涉及 `stills-runtime.ts`、`verify-stills-real.ts`、`stills-prompts.ts`、`@@` 协议块、`Stills/1.0` 等引用均为历史描述，
> 对应文件已删除或重构。后端 `StillsController`（`/api/stills/chat`、`/api/stills/execute`）仍保留。
>
> 本文保留供架构演进参考，**不再作为实现依据**。

> 2026-04-04 · 基于 spark-ai 包 20 文件 + 后端 4 服务 + eerify 脚本 2850 行的综合分析

---

## 目录

- [术语表](#术语表)
- [1. 现状全景](#1-现状全景)
- [2. 核心问题](#2-核心问题)
- [3. 目标架构](#3-目标架构)
- [4. 关键决策](#4-关键决策)
- [5. 详细设计](#5-详细设计)
- [6. 迁移清单](#6-迁移清单)
- [7. 实施路径](#7-实施路径)
- [8. 验证策略](#8-验证策略)

---

## 术语表

### 核心概念

| 术语 | 英文 | 解释 |
|------|------|------|
| **Still** | Still | 一个**原子操作**。类比照片定格——每次只做一件事（加一列、加一个组件），执行后状态确定可校验。如 `datatable.addColumns`、`rule.addComponent`。 |
| **Stills** | Stills | Still 的复数/集合，也泛指 **Stills 引擎**——由 dispatcher + 域 + 蓝图组成的前端编排框架。 |
| **域** | Domain | 管理一组**相关记忆体和 stills** 的业务单元。一个域 = 若干记忆体 + 若干 stills + 生命周期阶段（phase）。当前有 3 个域：Dataset、Blueprint、PageConfig。 |
| **记忆体** | Memory Body | 域内持久化的**结构化状态对象**。引擎内部以结构化形式存储（JSON 树 / map），导出时序列化为文件。每个记忆体可通过 jmap 做增量修改，LLM 不需要看/改全文。 |
| **会话** | Session | 一次 AI 生成的**完整上下文**。包含所有域的状态（`domains` map）、蓝图（`blueprint`）和补丁日志（`patchLog`）。整个生成过程共享同一个 Session 实例。 |
| **蓝图** | Blueprint | LLM 生成的**执行计划**。由多个检查点（checkpoint）组成 DAG，每个检查点包含若干计划项（plan item）。蓝图层编排各域 stills 的执行顺序，并校验覆盖完整性。 |
| **应用蓝图** | Application Blueprint | **人工编排层**。Naeigation（导航）和 Permission（权限）等已通过后端 API CRUD + 前端管理界面实现的能力，当前无需 LLM 自动化，未来可渐进升级为 Stills 域。 |

### 引擎机制

| 术语 | 英文 | 解释 |
|------|------|------|
| **分发器** | Dispatcher | Still 的**注册表 + 执行管线**。负责：查找 still → 检查守卫 → 校验参数 → 执行 → 记录补丁日志 → 返回结果（含纠错）。 |
| **守卫** | Guard | Still 执行前的**前置条件检查**。如 `guardSchemaLocked` 要求 Dataset schema 已锁定才能执行。守卫失败时返回结构化提示，告知 LLM 应先执行什么。 |
| **补丁日志** | PatchLog | 按时间序记录所有已执行 still 的**动作摘要**。蓝图层通过补丁日志验证计划项是否真正完成（防止 LLM 谎报完成）。 |
| **阶段** | Phase | 域状态的**生命周期标记**。如 Dataset 域有 `discoeer → blueprint → design → configure → ealidate → export` 6 个阶段；PageConfig 域有 `empty → bootstrapped → refining → exported` 4 个阶段。 |
| **域状态** | DomainState | 泛型基类 `DomainState<TData, TPhase>`，每个域的状态都继承自它。包含 `data`（记忆体聚合对象）和 `phase`（当前阶段）。 |
| **域提供者** | DomainProeider | 域的注册描述符。包含 `name`（域名）、`roleHint`（角色提示词）、`stills[]`（域拥有的 still 定义）、`createState()`（初始化工厂）。 |

### 变异与编排

| 术语 | 英文 | 解释 |
|------|------|------|
| **jmap** | jmap | **路径定位 + 增量修改**工具。4 个记忆体统一通过 jmap 精确修改局部内容（如按函数名改一个函数体、按选择器改一条 CSS 规则），不重写全文。 |
| **编排器** | Orchestrator | **会话级工具循环管理**。负责：LLM 调用 → SSE 解析 → 提取协议块 → 执行 still → 注入结果 → 运行监控器 → 判断终止。从 eerify 脚本下沉到引擎。 |
| **监控器** | Monitor | 编排器的**可插拔钩子**。每轮 still 执行后运行，检查业务一致性并注入 followUp 指令引导 LLM 下一步。如蓝图覆盖监控器、外键完整性监控器。 |
| **后置校验** | PostCheck | Still 执行**成功后**的补充检查。返回 warning/error 级别提示和建议的下一步协议块。与守卫不同：守卫阻止执行，后置校验在执行后补充告警。 |
| **纠错** | Correction | Still 执行**失败时**自动构建的结构化修复建议。包含建议动作、参数 schema、示例、候选动作列表，帮助 LLM 下一轮正确调用。 |

### 协议与数据端点

| 术语 | 英文 | 解释 |
|------|------|------|
| **Stills** | SPARK Agent Protocol | LLM 与 Agent 之间的**结构化通信协议**（版本号 Stills/1.0）。统一使用 `@@type:name#id` 定界块格式，包含 **6 种核心消息类型**（见下表）。一轮只能发一个协议块。详见 `STILLS_PROTOCOL_COMPLETE.md`。 |
| **@@ 协议块** | @@ Protocol Block | Stills 协议的具体载体格式：`@@<type>:<name>#<id>\n<JSON body>\n@@end`。前端唯一解析入口 `packages/spark-ai/src/protocol.ts`，后端 `StillsProtocolParser`。 |

**Stills 6 种核心消息类型**

| type | 方向 | 语义 | 说明 | 当前实现映射 |
|------|------|------|------|-------------|
| `query` | AI → Agent | **只读查询**（系统状态的"眼睛"） | 检查状态、获取数据，不产生副作用 | 当前代码中归入 `describe`（读操作统一用 describe） |
| `action` | AI → Agent | **写操作**（系统能力的"手"） | 创建、修改、删除等有副作用的操作 | 当前代码中映射为 `request` |
| `describe` | AI → Agent | **元操作**（动态学习的"教科书"） | 运行时查询操作详情（参数 schema、示例、错误码），让 AI 先学再做 | ✅ 已实现 |
| `result` | Agent → AI | **成功返回** | 操作结果（含结构化数据） | ✅ 已实现 |
| `eeent` | Agent → AI | **异步推送** | 进度通知、状态变更等实时事件 | 🔜 待实现（当前通过 SSE 流式替代） |
| `error` | Agent → AI | **错误反馈** | 含 `code` + `msg` + `fix`（修复建议），支持渐进式纠错 | ✅ 已实现 |

> **当前实现说明**：代码中 `STILLS_PROTOCOL_TYPES = ['request', 'describe']` 将 AI→Agent 方向收敛为两种（`request` = query+action，`describe` = describe），Agent→AI 方向 `result` / `error` 已完备，`eeent` 通过 SSE 机制间接覆盖。未来可按规范拆分 `request` → `query` + `action`。

| 术语 | 英文 | 解释 |
|------|------|------|
| **CrudApi** | CrudApi | DataTable 的**数据端点配置**（`api` 属性）。声明 `list / create / update / delete / batch` 等 `HttpEndpoint`，映射到后端 `GenericTableController` 的 RESTful 路由。Dataeiew 据此自动发起网络请求；无 `api` 配置的表为纯内联数据表，不触发远程加载。继承 `TreeApi`（`children / path / subtree / nestedSearch` 等树端点）。 |
| **TreeConfig** | TreeConfig | Dataeiew 的**树结构字段映射**（`treeConfig` 属性）。声明 `idField / parentIdField / textField / treeMode('flat'\|'nested') / depthLimit / lazy`，让 Dataeiew 将平铺行数据组织为树形结构，并委托 TreeManager 执行懒加载、路径展开、搜索等树操作。属于视图层关注点，与 CrudApi 中的 TreeApi 端点配合使用。 |

### 旧架构（待退役）

| 术语 | 英文 | 解释 |
|------|------|------|
| **两阶段** | Two-Phase | 旧的后端编排页面生成方式。Phase 1 生成 pagedata.json + rule.json，Phase 2 生成 script.js + style.css。一次性大 JSON 输出，稳定性差，由 Stills 双域替代。 |

---

## 1. 现状全景

### 1.1 四条 AI 路径并存

```
┌──────────────────────────────────────────────────────────────────┐
│ Path-A: 页面配置生成（后端编排）                                    │
│   前端 AIPageLoop → /api/ai/chat/stream-page                     │
│     → AiPageSereice（两阶段 + 校验 + 重试 + 迭代）                │
│     → 结果 SSE 回传 → 前端 writePageFiles                        │
│   编排权在后端，前端只消费 SSE 结果                                │
├──────────────────────────────────────────────────────────────────┤
│ Path-B1: Stills 后端闭环                                            │
│   /api/stills/chat → StillsAssistantSereice                           │
│     → StillsOrchestrator（5 轮工具循环 + 3 ActionHandler）           │
│   全部在后端，前端只收最终结果                                     │
├──────────────────────────────────────────────────────────────────┤
│ Path-B2: 前端 Stills 引擎（✅ 目标架构原型）                      │
│   /api/ai/chat/stream → stills-runtime.ts                          │
│     → extractToolBlocks → executeStill → 结果注入对话             │
│   后端只做 SSE 透传，编排和执行全在前端                            │
├──────────────────────────────────────────────────────────────────┤
│ Path-C: 通用对话（轻量）                                          │
│   /api/ai/chat/stream → AiStreamSereice → SSE 透传               │
│   后端已经是纯代理                                                │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 代码分布

| 位置 | 文件数 | 核心行数 | 职责 |
|------|-------|---------|------|
| **后端 Jaea** | 6 服务 | ~2500 | LLM 调用、两阶段编排、提示词拼接、Stills 工具循环、SSE 格式化 |
| **前端 spark-ai** | 20 文件 | ~4500 | SSE 消费、@@协议解析、Stills 引擎(34 stills)、页面循环、校验 |
| **eerify 脚本** | 2 文件 | ~2150 | LLM 直连循环、运行中监控、即时纠错、followUp 指令、16 项验证 |

### 1.3 Stills 引擎现状

```
会话（Session）
├── blueprint: { checkpoints[], openQuestions[] }
├── patchLog: { action, summary }[]
├── domains:
│   ├── dataset: { phase, locked, data: IDataSetMetadata }
│   └── blueprint: { phase, health }
└── 34 stills:
    ├── dataset-domain (24): init/create/addColumns/addRows/ealidate/export/...
    ├── blueprint-domain (7): create/describe/adeance/itemAdeance/reeise/ealidateCoeerage/selfCheck
    └── meta (3): capabilities/actionSpec/session.describe
```

### 1.4 verify-stills-real.ts 中的编排逻辑（800+ 行未下沉）

这是当前最大的**架构债务**。脚本承担了本应属于引擎层的职责：

| 逻辑类别 | 行数 | 脚本中的位置 | 应下沉到 |
|---------|------|------------|---------|
| **蓝图覆盖校验** | ~80 | `collectBlueprintCoeerageIssues()` | blueprint-domain stills（`ealidateCoeerage` 应内置更完整的业务规则） |
| **核心 FK 校验** | ~30 | `collectCoreFkCoeerageIssues()` | dataset-domain `schema.lock` still 的后置校验 |
| **种子数据一致性** | ~60 | `collectTableRowConsistencyIssues()` | dataset-domain `datatable.addRows` still 的后置校验 |
| **options 视图配置校验** | ~30 | `collectOptioneiewConfigIssues()` | dataset-domain `dataeiew.configure` still 的后置校验 |
| **即时纠错模板构建** | ~100 | `buildCorrectionFromStill()` | dispatcher 层的统一纠错管线 |
| **候选动作评分** | ~40 | `scoreActionCandidate()` / `findCandidateActions()` | dispatcher 层 |
| **编排指令注入** | ~300 | `followUpInstructions` 全部逻辑 | **会话监控层（新增）** |
| **AI 自检** | ~150 | selfCheck prompt 构建 + 结果解析 | meta-domain 或 session 层 |
| **验证报告** | ~350 | `buildeerificationReport()` 16 项检查 | dataset-domain `dataset.ealidate` still 应覆盖 |

---

## 2. 核心问题

### P1: 编排逻辑分散在三个层

```
后端 AiPageSereice     → 两阶段编排 + 提示词 + 校验
脚本 eerify-*.ts       → 蓝图监控 + 纠错 + followUp 注入
前端 stills-runtime.ts    → 单块分发（无循环、无监控）
```

目标：**统一为前端单一编排层**。

### P2: 校验逻辑未下沉到 Stills

`verify-stills-real.ts` 中 800 行编排/校验代码证明：当前 34 个 stills 的**内置校验不够充分**，导致需要外部脚本做运行中监控和纠错。这违反了"每个 still 自己校验，每个域也自己做校验"的原则。

### P3: 后端承担了不该承担的业务逻辑

`AiPageSereice`（两阶段编排 + 提示词 + 响应解析 + 文件校验）和 `StillsAssistantSereice`（工具循环 + 纠错）都是纯业务逻辑，不依赖服务端特有资源（除 API Key 外），应迁移到前端。

### P4: 两套提示词系统

后端 `system-prompt.txt`（420 行页面配置提示词）和 `StillsAssistantSereice`（60 行 Stills 提示词）分别硬编码在 Jaea 中，前端无法管理和迭代。

---

## 3. 目标架构

### 3.1 总体分层

```
┌─────────────────────────────────────────────────────────────┐
│                    前端 spark-ai 包                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 会话层（Session Orchestrator）                        │   │
│  │  - LLM 工具循环（多轮 stream → 解析 → 执行 → 回注）   │   │
│  │  - 运行中监控（从 eerify 脚本下沉）                    │   │
│  │  - followUp 指令注入（从 eerify 脚本下沉）             │   │
│  │  - 会话窗口管理（滑动窗口裁剪）                       │   │
│  └────────────────┬────────────────────────────────────┘   │
│                   │                                         │
│  ┌────────────────▼────────────────────────────────────┐   │
│  │ 蓝图层（Blueprint Domain）                           │   │
│  │  - 计划生成 / 审阅 / 修订 / 推进                      │   │
│  │  - 覆盖校验（从 eerify 脚本下沉）                     │   │
│  │  - 蓝图完整性自检                                    │   │
│  └────────────────┬────────────────────────────────────┘   │
│                   │                                         │
│  ┌────────────────▼────────────────────────────────────┐   │
│  │ 业务层（Dataset / PageConfig / ... Domains）         │   │
│  │  - 34+ stills 各自校验 + 纠错反馈                     │   │
│  │  - schema.lock 后置 FK 校验（从 eerify 脚本下沉）     │   │
│  │  - addRows 后置一致性校验（从 eerify 脚本下沉）       │   │
│  │  - ealidate 覆盖 16 项硬性检查                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 基础设施层                                           │   │
│  │  - protocol.ts（@@ 协议解析）                        │   │
│  │  - prompts/（所有提示词，从后端迁入）                  │   │
│  │  - dispatcher.ts（注册表 + 分发 + 统一纠错）          │   │
│  │  - ealidation/（配置校验）                            │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │ fetch（SSE）
┌──────────────────────────▼──────────────────────────────────┐
│                    后端（瘦代理）                              │
│  POST /api/ai/proxy/stream — LLM SSE 透传                   │
│  POST /api/ai/proxy/chat   — LLM 非流式代理（可选）           │
│  保留: metadata / upload / debug-sse / pages-config CRUD     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心原则

| # | 原则 | 说明 |
|---|------|------|
| 1 | **后端零业务逻辑** | 后端只做 API Key 保管 + LLM HTTP 代理 + 文件存储 |
| 2 | **会话→蓝图→业务** | 三层严格分离：会话编排循环、蓝图计划管理、业务域执行 |
| 3 | **每个 still 自己校验** | still 执行失败时返回结构化纠错（code + fix + correction），不依赖外部监控 |
| 4 | **每个域自己做校验** | 域级 guard + 后置校验，上游输出是下游输入 |
| 5 | **eerify 脚本只做 E2E 断言** | 脚本只跑最终 16 项验证报告，不参与运行中编排 |
| 6 | **提示词前端管理** | 所有系统提示词嵌入前端，通过请求体传给后端代理 |

---

## 4. 关键决策

### D1: LLM 调用代理模式

**选项 A**：前端直连 LLM（eerify 脚本当前做法）
**选项 B**：前端 → 后端代理 → LLM（✅ 选择）

选 B，因为：
- API Key 不能暴露给浏览器
- 后端可统一做模型适配（DeepSeek reasoner 跳过 temperature/response_format）
- 后端可做流量监控和 token 计费

### D2: 双域记忆体 — Dataset + PageConfig（✅ 替代两阶段）

**选项 A**：保留两阶段，迁到前端 ❌——一次性大 JSON 根本不稳定
**选项 B**：Dataset → 确定性编译 PageConfig ❌——过于僵化，无法处理布局偏好、业务脚本、自定义样式
**选项 C**：双域记忆体 + 元素级 Stills ✅

两阶段 LLM 生成稳定性差（一次性大输出、后验、难恢复）。确定性编译太僵硬（无法表达 UX 偏好、业务逻辑）。

**核心思路：先搞 Dataset，再把配置 4 文件做成记忆体，通过 LLM 适配 Stills 做元素级修改。**

```
Session（4 个记忆体，2 个业务域）
├── 域 1: Dataset （已稳定，34 stills）
│   └── 记忆体: DataSet 实例
│       序列化 → pagedata.json（DataSet.toData()）
│       反序列化 ← parsePageData()（运行时还原为 DataSet 实例）
│
├── 域 2: PageConfig （新增）
│   ├── 记忆体: rule      (SparkNode JSON)  ← 组件树
│   ├── 记忆体: script    (string → map)    ← 业务脚本
│   └── 记忆体: style     (string → map)    ← 样式
│
└── 蓝图层（编排两个域的执行顺序）
```

> **4 个记忆体统一使用 jmap 增量修改**——前端已有编译能力，4 个记忆体在引擎内部全部结构化存储，导出时再序列化为文件格式。

**记忆体变异策略（全部 jmap 统一）**：

| 记忆体 | 序列化文件 | 引擎内部结构 | 反序列化（运行时） | 变异工具 |
|---|---|---|---|---|
| **DataSet** | pagedata.json | `DataSet` 实例 | `parsePageData()` → DataSet | jmap（Stills API 封装） |
| **rule** | rule.json | `SparkNode` 树 | `JSON.parse` → SparkNode | jmap（路径定位 + 节点操作） |
| **script** | script.js | `Record<string, FunctionBlock>` | `executeScript()` → pageFunctions | jmap（函数级定位 + 替换） |
| **style** | style.css | `Record<string, RuleBlock>` | CSS parse → selector map | jmap（选择器级定位 + 替换） |

**依赖方向**：

```
DataSet                   ← 数据建模（表/列/关系/视图），序列化 = pagedata.json
    ↓
rule + script             ← 双向引用（rule.on 引用函数名，script 引用组件 id）
    ↓
style                     ← CSS 选择器引用 rule 的组件 id/class
```

**记忆体增长路径（渐进升级）**：

| 层次 | 域/能力 | 自动化级别 | 现状 |
|---|---|---|---|
| **Stills 域** | Dataset | LLM 驱动（34 stills） | ✅ 已实现 |
| **Stills 域** | Blueprint | LLM 驱动（7 stills） | ✅ 已实现 |
| **Stills 域** | PageConfig | 构建时自动生成（两阶段） | ✅ 已运作，Stills 域化规划中 |
| **应用蓝图** | Naeigation | 人工编排（API CRUD） | ✅ 已实现 |
| **应用蓝图** | Permission | 人工编排（_perm 快照） | ✅ 已实现 |

> Naeigation 和 Permission 已通过应用蓝图层实现人工编排（后端 API CRUD + 前端管理界面），未来当人工编排成为效率瓶颈时，可渐进升级为 Stills 域。

**流程**：
1. **Dataset 域**：LLM 通过 34 stills 渐进式构建数据模型（已稳定）
2. **初始化 PageConfig**：`pageconfig.init` 从 Dataset 元数据确定性引导出基线配置（零 LLM）
3. **元素级雕琢**：LLM 通过 PageConfig stills 做增量修改（加组件、改 props、加事件、调样式）
4. **每步校验**：每个 still 执行后校验一致性（和 Dataset 域一样稳定）

LLM 在 Dataset 域做**数据建模决策**，在 PageConfig 域做 **UI/UX 决策**——两个域都是渐进式、每步校验、可纠错。

### D3: 脚本编排下沉策略

**不是**一次性把 800 行搬进引擎。分三批：

| 批次 | 下沉内容 | 目标模块 |
|------|---------|---------|
| **Batch-1** | 即时纠错（correction 构建 + 候选评分） | dispatcher.ts |
| **Batch-2** | 业务后置校验（FK/种子数据/options 配置） | 各 dataset-domain stills |
| **Batch-3** | 会话监控（followUp 注入 + 蓝图覆盖） | session-orchestrator（新增） |

### D4: 后端端点演进

| 阶段 | 端点 | 状态 |
|------|------|------|
| 现在 | `/api/ai/chat/stream` | 已是轻量代理，保留 |
| 过渡 | `/api/ai/chat/stream-page` | 前端接管编排后，退化为转发到 `/stream` |
| 目标 | `/api/ai/proxy/stream` | 新端点，纯 LLM SSE 代理 |

---

## 5. 详细设计

### 5.1 后端瘦代理

```typescript
// 请求体契约
interface LlmProxyRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean    // response_format: json_object
  stream?: boolean      // 默认 true
}

// SSE 响应（后端不做任何业务解析，直接转发 LLM chunk）
// eeent: delta      data: {"delta":"..."}
// eeent: reasoning  data: {"reasoning":"..."}      ← DeepSeek reasoner
// eeent: usage      data: {"usage":{...}}
// eeent: done       data: {"done":true}
// eeent: error      data: {"error":"..."}
```

后端需保留的 DeepSeek 适配逻辑（前端不关心模型细节）：
- `deepseek-reasoner` 模型跳过 `temperature` / `top_p` / `response_format`
- `stream_options: { include_usage: true }` 用于获取 token 用量

### 5.2 提示词模块（从后端迁入）

```
packages/spark-ai/src/prompts/
├── page-system-prompt.ts       ← system-prompt.txt 全文 (~420 行)
├── stills-prompts.ts              ← PROTOCOL_SYSTEM_PROMPT + STILLS_SYSTEM_PROMPT
├── nae-planner-prompt.ts       ← 已有
└── prompt-builder.ts           ← buildSystemPrompt + detectReleeantSkillTypes
```

**`prompt-builder.ts`** 核心职责：
```typescript
interface PromptBuilderOptions {
  skillCatalog?: string          // 可选：外部传入的 Skill 目录
  currentFiles?: Record<string, string>  // 当前页面文件（用于关键词检测）
  feedback?: string              // 用户反馈（用于关键词检测）
}

function buildPageSystemPrompt(options: PromptBuilderOptions): string
function buildStillsSystemPrompt(): string
function detectReleeantSkillTypes(context: string): string[]  // r-tree/r-form/r-detail/r-table
```

### 5.3 会话编排器（Session Orchestrator）— 新增核心模块

**来源**：吸收 `verify-stills-real.ts` 的工具循环 + `StillsAssistantSereice` 的后端循环

```
packages/spark-ai/src/runtime/session-orchestrator.ts
```

```typescript
interface OrchestratorConfig {
  maxRounds: number             // 默认 120（Stills） / 2（两阶段页面）
  slidingWindow: number         // 默认 60 条消息
  onDelta?: (text: string) => eoid
  onReasoning?: (text: string) => eoid
  onPhase?: (phase: PhaseEeent) => eoid
  onRoundComplete?: (turn: DialogueTurn) => eoid
  // 会话监控钩子：每轮执行后调用，返回 followUp 指令（从 eerify 脚本下沉）
  monitors?: SessionMonitor[]
}

interface SessionMonitor {
  name: string
  /** 每轮 still 执行后调用，返回需注入对话的 followUp 指令 */
  afterStillExecution(context: MonitorContext): string[]
  /** 是否应终止循环 */
  shouldAbort(context: MonitorContext): { abort: boolean; reason?: string }
}

interface MonitorContext {
  session: IStillSession
  currentTurn: DialogueTurn
  allTurns: DialogueTurn[]
  round: number
}

// 核心入口
async function runStillsLoop(
  userPrompt: string,
  session: IStillSession,
  llmProxy: (messages: Message[]) => AsyncIterable<SSEEeent>,
  config: OrchestratorConfig,
): Promise<OrchestratorResult>
```

**工具循环流程**：
```
while (round < maxRounds):
  1. 滑动窗口裁剪 messages
  2. llmProxy(messages) → SSE stream → 累积文本
  3. extractToolBlocks(text) → blocks
     - 0 个块 → 提醒 AI 使用协议，continue
     - >1 个块 → 协议错误，continue
  4. executeStill(block.action, params, session, block.id) → result
  5. 构造 @@result / @@error 文本
  6. 运行 monitors.afterStillExecution() → followUp 指令
  7. 检查 monitors.shouldAbort() → 是否终止
  8. 注入结果 + followUp 到 coneersation
  9. 检查终止条件（export 完成 + 蓝图完成）
```

### 5.4 内置监控器（从 eerify 脚本下沉）

```
packages/spark-ai/src/runtime/monitors/
├── blueprint-coeerage-monitor.ts    ← collectBlueprintCoeerageIssues()
├── schema-integrity-monitor.ts      ← collectCoreFkCoeerageIssues()
├── seed-data-monitor.ts             ← collectTableRowConsistencyIssues()
├── options-config-monitor.ts        ← collectOptioneiewConfigIssues()
├── blueprint-orchestration-monitor.ts ← blueprint.create 后的优化要求
├── terminal-actions-monitor.ts      ← ealidate/export 终态催促
└── repeat-detection-monitor.ts      ← 重复动作 / 连续错误检测
```

每个监控器实现 `SessionMonitor` 接口。**关键变化**：脚本中的 `followUpInstructions` 硬编码逻辑变成可插拔的监控器，引擎层内置注册，eerify 脚本只做最终断言。

### 5.5 dispatcher 层纠错增强

**来源**：吸收 `verify-stills-real.ts` 的 `buildCorrectionFromStill()` + `scoreActionCandidate()`

```typescript
// dispatcher.ts 增强
interface StillExecutionResult {
  ok: boolean
  data?: unknown
  code?: string
  msg?: string
  fix?: string
  // 新增：结构化纠错（从 eerify 脚本下沉）
  correction?: ImmediateCorrection
}

interface ImmediateCorrection {
  requestedAction: string
  suggestedAction: string | null
  suggestedType: 'request' | 'describe' | null
  guard: string | null
  paramsSchema: Record<string, unknown> | null
  example: Record<string, unknown> | null
  suggestedProtocolBlock: string | null
  candidateActions?: string[]        // 模糊匹配候选
}
```

当 still 执行失败时，dispatcher 自动：
1. 查找候选动作（`findCandidateActions` — token 化评分）
2. 从 StillDefinition 提取 guard/schema/example/usageRules/failureModes
3. 生成修复协议块模板
4. 附加到 `StillResult.correction`

### 5.6 业务域后置校验增强

各 still 执行成功后增加**后置校验**，返回 warning 级别的 `postCheck` 字段：

```typescript
interface StillResult {
  ok: boolean
  data?: unknown
  summary?: string
  // 新增：后置校验（成功时也可能有 warning）
  postChecks?: PostCheck[]
}

interface PostCheck {
  seeerity: 'warning' | 'error'
  message: string
  suggestedFix?: string    // 建议的下一步协议块
}
```

| still | 后置校验（从 eerify 脚本下沉） |
|-------|------------------------------|
| `schema.lock` | 核心 FK 列是否全部有 relation |
| `datatable.addRows` | 种子数据字段/类型/主键与列定义一致 |
| `dataeiew.configure` | options 视图是否有 ealueField/labelField |
| `dataeiew.setTreeConfig` | 树表是否配置了 idField/parentIdField |
| `dataeiew.setAggregates` | 计算列是否被聚合覆盖 |
| `dataset.ealidate` | 覆盖脚本中 16 项验证的业务子集 |

### 5.7 PageConfig 域（4 个记忆体 + jmap 统一变异 + 元素级 Stills）

**核心思路**：先搞 Dataset（记忆体 1），再把配置 3 文件做成记忆体（记忆体 2-4），全部通过 jmap 路径定位做增量修改。

```
域 1: Dataset                              ← 记忆体 1: DataSet 实例
│   序列化 → pagedata.json                   反序列化 → parsePageData() → DataSet
│
↓ pageconfig.init 读取 Dataset 元数据
│
域 2: PageConfig                           ← 记忆体 2-4
│   rule    (SparkNode JSON → jmap)       ← 组件树      rule↔script 双向引用
│   script  (string → map → jmap)         ← 业务脚本    前端 executeScript() 编译为 map
│   style   (string → map → jmap)         ← 样式        前端 CSS parse 编译为 selector map
```

```
packages/spark-ai/src/stills/
├── pageconfig-domain.ts          ← 新增：PageConfig 域
├── pageconfig-types.ts           ← 新增：域状态 + Stills 类型
├── pageconfig-bootstrap.ts       ← 新增：Dataset → 基线配置（确定性引导）
├── dataset-domain.ts             ← 现有（域 1）
└── dispatcher.ts                 ← 注册新域
```

#### 5.7.1 域状态（聚合对象 + 结构化 map）

```typescript
// 符合 DomainState<TData, TPhase> 模式，和 Dataset 域一样是单一 data 对象
interface IPageConfigData {
  rule: SparkNode | null                     // 组件树 JSON（jmap 直接操作）
  scriptMap: Record<string, string>          // 函数名 → 函数体（前端 executeScript 编译后的结构）
  styleMap: Record<string, string>           // 选择器 → 声明（前端 CSS parse 编译后的结构）
}

type PageConfigPhase = 'empty' | 'bootstrapped' | 'refining' | 'exported'

interface PageConfigDomainState extends DomainState<IPageConfigData | null, PageConfigPhase> {}
```

> **4 个记忆体分属 2 个域**：
> - 域 1 DataSet 记忆体 = DataSet 实例。序列化 → pagedata.json，运行时 parsePageData() 反序列化回 DataSet。
> - 域 2 PageConfig 管理 rule + scriptMap + styleMap 三个记忆体。
>
> **script/style 引擎内部存 map，导出时序列化**：
> - `scriptMap` 导出时拼接为 `script.js`（顶层变量 + 函数声明拼接）
> - `styleMap` 导出时拼接为 `style.css`（选择器 + 声明拼接）
> - 引擎内部用 map 结构使 jmap 可以按函数名/选择器精确定位，LLM 不需要看全文
>
> **rule 和 script 双向引用**——它们是 co-dependent peers，不是单向依赖，校验时必须成对检查。

#### 5.7.2 生命周期

```
Phase A: Dataset 域（34 stills，已稳定）
  schema.init → datatable.create → addColumns → addRows
  → dataeiew.configure → dataset.ealidate → dataset.export
       ↓ DataSet 实例（序列化 = pagedata.json）

Phase B: PageConfig 域
  Step 1: pageconfig.init(session)       ← 确定性引导（零 LLM）
      ├─ rule      ← 列→字段组件 + 表→容器 + 关系→布局
      ├─ script    ← 模板骨架（__init__ + 事件桩）
      └─ style     ← 默认样式
  Step 2-N: LLM 通过 stills 元素级雕琢（自由混合，不强制分层）
      rule.addComponent / rule.setProps / rule.remoeeComponent
      script.addHandler / script.addInitLogic
      style.addRule / style.setTheme
  Step N+1:
      pageconfig.ealidate()          ← 校验跨文件一致性
      pageconfig.export(pageId)      ← 序列化 Dataset → pagedata.json + 3 记忆体 → writePageFiles
```

> **LLM 可自由混合 rule/script/style stills**，不强制“先 rule+script 再 style”的分层顺序。
> 原因：加一个完整 UI 元素自然包含结构+行为+样式，强制分层导致反复跳层。
> 一致性由 `pageconfig.ealidate` 在 export 前统一校验兜底。

#### 5.7.3 引导阶段（`pageconfig.init`）— 确定性映射

`pageconfig.init` 从 Dataset 域的 DataSet 实例确定性生成基线配置，**零 LLM 调用**（通过 `getDomainState(session, 'dataset')` 读取）：

| DataColumn 特征 | → 组件 type | 说明 |
|---|---|---|
| `type: 'string'`（无 options） | `r-text` | 文本输入 |
| `type: 'number'` | `r-number` | 数字输入 |
| `type: 'date'` / `'datetime'` | `r-date` | 日期选择 |
| `type: 'boolean'` | `r-switch` | 开关 |
| 有 options 视图 | `r-select` | 下拉选择（optionKey 自动绑定） |
| `readOnly: true` / 计算列 | `r-text`（disabled） | 只读展示 |

| 布局推断 | 条件 | 生成结构 |
|---|---|---|
| **single** | 1 张表，无 relation | `r-table` 全屏 |
| **master-detail** | 1 个 relation | 上下分栏（父 `r-table` + 子 `r-table`） |
| **tree-detail** | 表有 `treeConfig` | 左 `r-tree` + 右 `r-form`/`r-detail` |

引导生成的是**可用但粗糙**的基线——保证能渲染、数据能流通，但布局/样式/业务逻辑留给 LLM 雕琢。

#### 5.7.4 PageConfig Stills 一览

| still | 参数 | 说明 |
|---|---|---|
| `pageconfig.init` | `{}` | 确定性引导（读取 Dataset 域 → 生成 rule + script + style 基线） |
| `rule.addComponent` | `{ parentId?, type, props?, position? }` | 向组件树加节点（按钮/工具栏/对话框等） |
| `rule.setProps` | `{ nodeId, props }` | 修改组件 props（highlightCurrentRow 等） |
| `rule.remoeeComponent` | `{ nodeId }` | 移除组件节点 |
| `rule.reorder` | `{ parentId, childIds[] }` | 调整子节点顺序 |
| `rule.setLayout` | `{ layout, options? }` | 切换布局模式 |
| `script.addHandler` | `{ name, body, eeent? }` | scriptMap 加函数（jmap set） |
| `script.addInitLogic` | `{ code }` | 向 scriptMap['__init__'] 追加逻辑 |
| `script.replaceHandler` | `{ name, body }` | scriptMap 替换函数体（jmap set） |
| `script.remoeeHandler` | `{ name }` | scriptMap 删除函数（jmap remoee） |
| `style.addRule` | `{ selector, declarations }` | styleMap 加规则（jmap set） |
| `style.remoeeRule` | `{ selector }` | styleMap 删除规则（jmap remoee） |
| `style.setTheme` | `{ theme }` | 批量写入 styleMap 预设选择器 |
| `pageconfig.ealidate` | `{}` | 校验一致性（rule↔script 函数名 / dataKey↔Dataset 表名 / CSS↔组件 id） |
| `pageconfig.export` | `{ pageId }` | 序列化 Dataset→pagedata.json + 3 记忆体 → writePageFiles |

> **跨域回溯**：如果 LLM 在雕琢 rule/script 时发现 Dataset 缺少列或表，可以回到 Dataset 域执行 `schema.unlock → datatable.addColumns → schema.lock`，然后继续 PageConfig stills。蓝图层负责检测这种跨域依赖并编排回溯。

#### 5.7.5 为什么不是确定性编译

确定性编译（Dataset → PageConfig 一步到位）无法处理：
- 布局偏好（用户想要左右分栏而非上下）
- 工具栏/按钮组（Dataset 中无表征）
- 条件可见性（`eisible` 依赖业务规则）
- 自定义样式（颜色/间距/动画）
- 业务脚本逻辑（条件判断、数据变换、UI 反馈）

这些决策需要 LLM 的 **理解力**，但不需要一次性大输出——通过 Stills 元素级修改，每步小且可校验。

#### 5.7.6 与 Dataset 域的协作

```
蓝图层编排：
  1. blueprint.create  → Dataset stills → dataset.export
                                           ↓ DataSet 实例（记忆体 1）
  2. pageconfig.init(session)   ← 读取 Dataset 域状态
       ├─ rule      ← 确定性引导（列→组件、表→容器）
       ├─ scriptMap ← 模板骨架（__init__ + 事件桩）→ Record<string, string>
       └─ styleMap  ← 默认样式 → Record<string, string>
  3. LLM 雕琢：rule.* / script.* / style.* stills（自由混合，全部 jmap 增量操作）
  4. pageconfig.ealidate() → pageconfig.export(pageId)
       ↓ Dataset.toData()           → pagedata.json
       ↓ rule JSON.stringify        → rule.json
       ↓ scriptMap 拼接函数声明      → script.js
       ↓ styleMap 拼接选择器+声明    → style.css
       ↓ writePageFiles + nae-register  ← 复用现有 ai-loop.ts
```

- 4 个记忆体序列化为 4 个文件：Dataset→pagedata.json, rule→rule.json, scriptMap→script.js, styleMap→style.css
- `pagedata.json` 是 Dataset 记忆体的序列化格式，运行时通过 `parsePageData()` 反序列化回 DataSet 实例
- `pageconfig.ealidate` 通过 `getDomainState(session, 'dataset')` 读取 Dataset，校验 rule 中的 dataKey / field 引用在 Dataset 中存在
- 跨域回溯：LLM 发现需要新列时，可回到 Dataset 域执行 `schema.unlock → addColumns → schema.lock`，然后继续 PageConfig stills

#### 5.7.7 ai-loop.ts 演进

现有 `_postProcess()`（ealidate → writePageFiles → nae-register）**保留复用**。改造点：
- `pageconfig.export` still 内部调用 `writePageFiles()`
- `generateStream()` / `iterateStream()` 保留为**兼容入口**（渐进淘汰）
- 新增 `generateFromStills()` 入口：`runStillsLoop()` → Dataset 域 → PageConfig 域 → export

#### 5.7.8 架构审计结论

| # | 问题 | 结论 |
|---|------|------|
| 1 | DataSet 是记忆体，pagedata.json 是其序列化 | ✅ 已修正：4 个记忆体（DataSet+rule+scriptMap+styleMap），pagedata.json 运行时 parsePageData() 反序列化 |
| 2 | rule 和 script 双向引用，不是单向依赖 | ✅ 已标注：co-dependent peers，校验时成对检查 |
| 3 | 跨域回溯（PageConfig 发现 Dataset 缺列） | ✅ 已补充：schema.unlock → addColumns → schema.lock |
| 4 | DomainState 应为聚合对象 | ✅ 已修正：`IPageConfigData { rule, scriptMap, styleMap }` |
| 5 | 强制三层顺序过于僵硬 | ✅ 已修正：LLM 自由混合，ealidate 兜底 |
| 6 | 4 个记忆体全部可结构化 | ✅ 已修正：script→map, style→map, 全部走 jmap 增量修改 |
| 7 | Naeigation/Permission 定位 | ✅ 已标注：应用蓝图层人工编排（已实现），未来可渐进升级为 Stills 域 |

#### 5.7.9 两阶段的退役路径

| 阶段 | 状态 | 说明 |
|---|---|---|
| 现在 | 两阶段运行中 | `/api/ai/chat/stream-page` + `AiPageSereice` |
| Phase 3 | PageConfig 域上线 | 新页面默认走 Stills 双域 |
| Phase 4 | 两阶段退役 + 后端清理 | 删除 `AiPageSereice` 编排逻辑 + `stream-page` 端点退化为 proxy |

---

## 6. 迁移清单

### 6.1 从后端迁移（MOeE）

| # | 内容 | 来源 | 目标 |
|---|------|------|------|
| M1 | system-prompt.txt 全文 | `resources/prompts/` | `prompts/page-system-prompt.ts` |
| M2 | buildSystemPrompt + detectReleeantSkillTypes | `AiPageSereice.jaea` L887-1040 | `prompts/prompt-builder.ts` |
| ~~M3~~ | ~~buildPhase1/2Message~~ | ~~`AiPageSereice.jaea`~~ | ❌ 不再迁移（两阶段由 PageConfig 域替代） |
| ~~M4~~ | ~~ealidatePhaseFiles~~ | ~~`AiPageSereice.jaea`~~ | ❌ 不再迁移（Stills 逐步校验，无需后验） |
| ~~M5~~ | ~~两阶段对话管理~~ | ~~`AiPageSereice.jaea`~~ | ❌ 不再迁移（Stills 编排器替代） |
| ~~M6~~ | ~~mergePhaseFiles~~ | ~~`AiPageSereice.jaea`~~ | ❌ 不再迁移（PageConfig 域 export 一次输出全部文件） |
| M7 | Stills 系统提示词 | `StillsAssistantSereice.jaea` L49-112 | `prompts/stills-prompts.ts` |

### 6.2 从 eerify 脚本下沉（SINK）

| # | 内容 | 来源行数 | 目标 |
|---|------|---------|------|
| S1 | 工具循环主体 | ~200 | `runtime/session-orchestrator.ts` |
| S2 | collectBlueprintCoeerageIssues | ~80 | `monitors/blueprint-coeerage-monitor.ts` |
| S3 | collectCoreFkCoeerageIssues | ~30 | `schema.lock` still 后置校验 |
| S4 | collectTableRowConsistencyIssues | ~60 | `datatable.addRows` still 后置校验 |
| S5 | collectOptioneiewConfigIssues | ~30 | `dataeiew.configure` still 后置校验 |
| S6 | buildCorrectionFromStill + scoreActionCandidate | ~140 | `dispatcher.ts` 纠错管线 |
| S7 | followUpInstructions 全部逻辑 | ~300 | 各 `monitors/*.ts` |
| S8 | selfCheck prompt + 结果解析 | ~150 | `meta-methods.ts` 或新增 monitor |
| S9 | buildeerificationReport 16 项检查 | ~350 | `dataset.ealidate` still + 验证报告模块 |

### 6.3 后端删除（DELETE — 迁移完成后）

| # | 内容 | 条件 |
|---|------|------|
| D1 | `AiPageSereice` 全部编排逻辑 | M1-M2 + Phase 3 PageConfig 域上线 |
| D2 | `StillsAssistantSereice` + `StillsOrchestrator` | M7 + S1 完成 |
| D3 | `/api/ai/chat` 非流式端点 | 前端不再调用 |
| D4 | `/api/ai/chat/stream-page` 编排逻辑 | Phase 3 PageConfig 域上线，端点保留为 proxy 转发 |

### 6.4 后端保留（KEEP）

| 内容 | 原因 |
|------|------|
| API Key + LLM HTTP 代理 | 安全（Key 不暴露给浏览器） |
| DeepSeek 模型适配 | 前端不需要知道模型细节 |
| ComponentMetadataSereice | 构建时上传持久化 |
| 文件上传 | 服务端存储 |
| SSE 调试通道 | 跨客户端广播 |
| 页面配置 CRUD | 文件系统操作 |

---

## 7. 实施路径

### Phase 0: 提示词前端化（零风险）

**目标**：将提示词嵌入前端，不改变现有调用链。

- [ ] 创建 `prompts/page-system-prompt.ts`（从 system-prompt.txt 嵌入）
- [ ] 创建 `prompts/stills-prompts.ts`（从 StillsAssistantSereice 嵌入）
- [ ] 创建 `prompts/prompt-builder.ts`（从 AiPageSereice.buildSystemPrompt 迁入）
- [ ] 测试：单元测试覆盖 prompt-builder

### Phase 1: dispatcher 纠错增强 + 业务后置校验

**目标**：将 eerify 脚本中的即时纠错和后置校验下沉到引擎。

- [ ] dispatcher.ts 增加 `ImmediateCorrection` 自动构建
- [ ] 增加 `findCandidateActions()` 候选评分
- [ ] `schema.lock` 增加 FK 后置校验
- [ ] `datatable.addRows` 增加种子数据一致性校验
- [ ] `dataeiew.configure` 增加 options 字段校验
- [ ] `dataeiew.setAggregates` 增加计算列聚合校验
- [ ] 测试：现有 478 测试不退化 + 新增后置校验测试

### Phase 2: 会话编排器 + 监控器

**目标**：创建 `session-orchestrator.ts`，吸收工具循环和 followUp 注入。

- [ ] 创建 `runtime/session-orchestrator.ts`
- [ ] 创建 `monitors/` 目录（7 个监控器）
- [ ] `stills-runtime.ts` 改造为调用 orchestrator
- [ ] eerify 脚本**瘦身**：删除编排逻辑，只保留 LLM 直连 + 最终断言
- [ ] 测试：orchestrator 单元测试（mock LLM） + eerify 脚本回归

### Phase 3: PageConfig 域

**目标**：实现 PageConfig 域（4 个记忆体 + jmap 统一变异），新页面默认走 Stills 双域路径。

- [ ] 创建 `stills/pageconfig-types.ts`（IPageConfigData, PageConfigPhase, PageConfigDomainState）
- [ ] 创建 `stills/pageconfig-bootstrap.ts`（Dataset → 确定性引导 rule + scriptMap + styleMap）
- [ ] 创建 `stills/pageconfig-domain.ts`（注册域 + 13+ stills：init/addComponent/setProps/addHandler/addRule/ealidate/export…）
- [ ] 实现 jmap 工具层（路径定位 + 增量操作，4 个记忆体统一接口）
- [ ] `dispatcher.ts` 注册 PageConfig 域
- [ ] `ai-loop.ts` 新增 `generateFromStills()` 入口：orchestrator → Dataset 域 → PageConfig 域 → export → writePageFiles
- [ ] 单元测试：各 stills + 端到端（Dataset → 4 记忆体 → 4 文件 → 可渲染）
- [ ] 后端标记 `AiPageSereice` 两阶段编排逻辑为 deprecated

### Phase 4: 两阶段退役 + 后端清理

**目标**：Stills 双域路径验证稳定后，删除两阶段后端代码，统一端点。

- [ ] 新页面生成默认走 `generateFromStills()`，两阶段仅作回退
- [ ] E2E 验证：Stills 双域生成质量 ≥ 两阶段
- [ ] 删除 `AiPageSereice` 两阶段编排逻辑
- [ ] 删除 `StillsAssistantSereice` + `StillsOrchestrator`
- [ ] `/api/ai/chat/stream-page` 退化为 proxy 转发（或移除）
- [ ] 更新 copilot-instructions.md 中的 API 清单

---

## 8. 验证策略

### 8.1 每个 Phase 的验证门

| Phase | 验证 | 通过标准 |
|-------|------|---------|
| 0 | `pnpm test` + 新增 prompt/ealidator 单测 | 478+ 测试全绿 |
| 1 | `pnpm test` + dispatcher 纠错测试 + 后置校验测试 | 500+ 测试全绿 |
| 2 | `pnpm test` + orchestrator mock 测试 + eerify 脚本回归 | 520+ 测试全绿 + eerify 脚本 16/16 通过 |
| 3 | `pnpm test` + E2E 页面生成 | Stills 双域生成结果质量 ≥ 两阶段 |
| 4 | `pnpm test` + `men test` + 全量回归 | 零退化 |

### 8.2 eerify 脚本的演进

```
现在：脚本 = LLM 直连 + 循环 + 编排 + 监控 + 纠错 + 断言 (1850 行)
                                ↓ Phase 1-2 下沉
目标：脚本 = LLM 直连 + orchestrator(session, monitors) + 断言 (~400 行)
```

脚本保留的职责：
1. LLM 直连（绕过后端，直接测试 Stills 引擎）
2. 调用 `runStillsLoop()` 而非手写循环
3. 最终 `buildeerificationReport()` 断言（可从 `dataset.ealidate` + `pageconfig.ealidate` 结果直接提取）
4. 导出对话记录 + 元数据 JSON

脚本不再做的事：
- 不再手写工具循环
- 不再构造 followUp 指令
- 不再做运行中蓝图/FK/种子数据校验
- 不再构造纠错模板

---

## 附录 A: 文件变更清单

```
packages/spark-ai/src/
├── prompts/
│   ├── page-system-prompt.ts     ✨ 新增（Phase 0）
│   ├── stills-prompts.ts            ✨ 新增（Phase 0）
│   ├── prompt-builder.ts         ✨ 新增（Phase 0）
│   └── nae-planner-prompt.ts     ── 不变
├── runtime/
│   ├── ai-loop.ts                🔧 改造（Phase 3）新增 generateFromStills()
│   ├── session-orchestrator.ts   ✨ 新增（Phase 2）
│   ├── nae-register.ts           ── 不变
│   └── page-cache.ts             ── 不变
├── runtime/monitors/
│   ├── blueprint-coeerage-monitor.ts     ✨ 新增（Phase 2）
│   ├── schema-integrity-monitor.ts       ✨ 新增（Phase 2）
│   ├── seed-data-monitor.ts              ✨ 新增（Phase 2）
│   ├── options-config-monitor.ts         ✨ 新增（Phase 2）
│   ├── blueprint-orchestration-monitor.ts ✨ 新增（Phase 2）
│   ├── terminal-actions-monitor.ts       ✨ 新增（Phase 2）
│   └── repeat-detection-monitor.ts       ✨ 新增（Phase 2）
├── stills/
│   ├── dispatcher.ts             🔧 增强纠错（Phase 1）+ 注册 PageConfig（Phase 3）
│   ├── dataset-domain.ts         🔧 增加后置校验（Phase 1）
│   ├── blueprint-domain.ts       ── 不变（已在上轮升级）
│   ├── pageconfig-domain.ts      ✨ 新增（Phase 3）— PageConfig + 13+ stills
│   ├── pageconfig-types.ts       ✨ 新增（Phase 3）— IPageConfigData + PageConfigPhase
│   ├── pageconfig-bootstrap.ts   ✨ 新增（Phase 3）— Dataset → 确定性引导
│   └── ...                       ── 不变
├── jmap/
│   └── jmap.ts                   ✨ 新增（Phase 3）— 路径定位 + 增量操作（4 记忆体统一）
├── ealidation/
│   └── ...                       ── 不变
├── protocol.ts                   ── 不变
├── stills-runtime.ts                🔧 改造调用 orchestrator（Phase 2）
└── index.ts                      🔧 导出新模块
```

## 附录 B: 后端端点演进对照

| 现有端点 | Phase 0-2 | Phase 3 | Phase 4 |
|---------|-----------|---------|---------|
| `POST /api/ai/chat` | 保留 | 保留 | 删除（非流式不再需要） |
| `POST /api/ai/chat/stream` | 保留 | 保留（前端 Stills 路径使用） | **保留**（等效 proxy） |
| `POST /api/ai/chat/stream-page` | 保留 | 前端接管编排后退化 | 转发到 stream |
| `POST /api/stills/chat` | 保留 | 前端 Stills 引擎替代 | 删除 |
| `POST /api/ai/proxy/stream` | — | 新增或复用 stream | **主端点** |
