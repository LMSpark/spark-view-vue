# Generate/Iterate 重构方案

> **文档版本**: v1.0 · 2026-04-09
> **状态**: 待实施
> **前置文档**: [AI_CODE_CHANGE_PROTOCOL.md](./AI_CODE_CHANGE_PROTOCOL.md)

---

## 一、问题陈述

### 1.1 现状：两条隔离的 AI 路径

| 维度 | Generate/Iterate（页面生成） | Stills（结构化编辑） |
|------|------|------|
| 端点 | `POST /api/ai/chat/stream-page` | `/api/ai/sessions/*`（v3 统一入口；`/api/stills/*` 已下线） |
| 调用方式 | 纯 Chat Completion（无 tools） | Function Calling + 工具回路 |
| 会话管理 | **无**（每次请求无状态） | 有（StillsSessionService，滑动窗口 30 条） |
| 约束知识 | 500 行 system-prompt.txt 一次性注入 | ~2000 行 catalog（paramsSchema + usageRules + failureModes） |
| 禁猜机制 | **无** | `先查再执行`（capabilities → actionSpec → 执行） |
| Prompt 管理 | 后端构建 | 前端构建 |
| 收敛率 | **~67%** | N/A（不同场景） |

**核心问题**：Generate/Iterate 完全无法利用 catalog 中的 ~2000 行系统契约知识。LLM 只能依赖 system-prompt.txt 猜测配置格式，导致错误率高、收敛率低。

### 1.2 目标

```
┌─ 统一架构 (/api/ai/sessions/*) ─────────────────────────┐
│                                                          │
│  后端（通信层）                                           │
│  ├── API Key 持有 + LLM HTTP 转发                        │
│  ├── SSE 流式透传                                        │
│  ├── 会话状态存储 + 滑动窗口                              │
│  └── Function Calling 参数转发                            │
│                                                          │
│  前端（智能层）                                           │
│  ├── System Prompt 构建（按阶段拆分）                     │
│  ├── FC Tools 定义（查询型 + 生成型）                     │
│  ├── 三阶段编排（pagedata → rule+script → css）          │
│  ├── 双重校验（tool 层 + 语义层）                         │
│  └── Iterate 反馈构建                                    │
│                                                          │
│  收敛率目标：>90%                                        │
└──────────────────────────────────────────────────────────┘
```

---

## 二、架构决策记录（Q1–Q10）

### Q1 后端角色定位

**决策**：后端降级为**纯通信层**。

| 后端保留 | 前端接管 |
|---------|---------|
| API Key 持有 | System prompt 构建 |
| LLM HTTP 转发 | Phase 拆分 & 消息组装 |
| SSE 流式透传 | 响应解析 |
| **会话管理** | 文件校验 |
| **滑动窗口** | Iterate 反馈构建 |

### Q2 阶段架构

**决策**：**数据先行，三阶段重排序**。

```
旧：Phase 1 (rule.json + style.css) → Phase 2 (pagedata.json + script.js)
新：Phase 1 (pagedata.json)         → Phase 2 (rule.json + script.js)  → Phase 3 (style.css)
```

**理由**：
- 数据模型（表、列、关系、视图）是 UI 和逻辑的基础，先设计才能让后续阶段引用正确
- 每阶段走独立会话轮次，充分利用后端会话 + 滑动窗口

### Q3 Iterate 粒度

**决策**：**阶段内循环 + 允许回溯**（C）。

```
Phase 1 ← iterate 循环 ← 校验失败 → 重试
  ↓ 通过
Phase 2 ← iterate 循环 ← 校验失败 → 重试
  ↓ 连续 N 轮失败 → 回溯 Phase 1
Phase 3 ← iterate 循环
  ↓ 通过
完成
```

- 单阶段内独立校验 + iterate，通过即进入下阶段
- 连续失败 N 轮允许回溯到上一阶段修正数据结构
- 示例：Phase 2 发现 dataKey 引用了不存在的表 → 回溯 Phase 1 补表

### Q4 Catalog 知识注入

**决策**：**Function Calling 工具模式**（E）。

**核心原则**——提示词强制 "不查即不能生成"：
- Generate/Iterate 统一走 FC，catalog 注册为 tools
- 提示词层面禁止 LLM 猜测/假设
- 强制工作流：`queryCapabilities` → `queryActionSpec` → `emit*`
- 与 Stills 的 `先查再执行` 模式完全对齐

**好处**：
1. 减少 system prompt token 开销（不一次性注入全部约束）
2. LLM 只看当前阶段需要的约束
3. 自然形成"不查就不能做"的守卫

### Q5 FC Tools 设计

**决策**：**查询型 + 生成型 tools**（B），系统预置 DataSet / SparkNode 实例。

| 类别 | Tools | 说明 |
|------|-------|------|
| 查询型 | `queryCapabilities` | 返回当前阶段可用能力列表 |
| 查询型 | `queryActionSpec` | 返回指定能力的 Schema + usageRules + failureModes |
| 查询型 | `queryComponentCatalog` | 返回组件元数据（props/events/slots） |
| 生成型 | `emitPagedata` | 提交 pagedata.json 产物 |
| 生成型 | `emitRuleJson` | 提交 rule.json 产物 |
| 生成型 | `emitScriptJs` | 提交 script.js 产物 |
| 生成型 | `emitStyleCss` | 提交 style.css 产物 |

- LLM 通过 tool call 结构化提交产物（非 assistant message 文本输出）
- 产物格式由 tool 的 paramsSchema 约束，减少格式错误
- 提示词中告知 LLM"系统已创建一个 DataSet 实例和一个 SparkNode 实例"

### Q6 校验器角色

**决策**：**双重校验**（C）。

| 校验层 | 触发时机 | 内容 | 反馈方式 |
|--------|---------|------|---------|
| **tool 层** | `emit*` tool 被调用时 | JSON Schema 校验 + 格式检查 | tool result（error/success），LLM 立即自修正 |
| **语义层** | 阶段完成后 | 交叉引用（dataKey→table、relation→column）、autoCurrentFirst、isPrimaryKey、__init__ 存在性 | 下一轮 iterate 的 user message |

### Q7 Generate vs Iterate 的 Tool 集

**决策**：**tool 集不变，上下文走 message**（C）。

- Generate 和 Iterate 注册同一套 tools
- Iterate 时上一轮产物 + 校验错误列表注入到 user message 中
- 区别仅在消息内容：Generate 是"从零创建"，Iterate 是"基于产物+错误修正"

### Q8 后端会话 API

**决策**：**统一会话管理**（C），新路径 `/api/ai/sessions/*`。

- 合并 Stills 和 Generate/Iterate 到同一套会话体系
- 通过 `mode: 'generate' | 'stills'` 区分行为
- Stills 现有 `/api/stills/*` 端点已下线，统一收敛到 `/api/ai/sessions/*`

### Q9 System Prompt 处理

**决策**：**前端接管 + 按阶段拆分**（C）。

- 废弃后端 `system-prompt.txt`，前端 `page-system-prompt.ts` 成为唯一 SSoT
- 重构为多段导出：

| 导出名 | 注入阶段 | 内容来源 |
|--------|---------|---------|
| `GENERATE_BASE_PROMPT` | 所有阶段 | 角色定义 + "禁止猜测"硬约束 + FC 工作流指令 |
| `DATA_PHASE_PROMPT` | Phase 1 | pagedata.json 规则（表、列、关系、视图、聚合、treeConfig） |
| `UI_PHASE_PROMPT` | Phase 2 | rule.json + script.js 规则（SparkNode、dataKey、组件、沙箱变量） |
| `STYLE_PHASE_PROMPT` | Phase 3 | style.css 规则 |
| `CROSS_CONSISTENCY_PROMPT` | 阶段后校验反馈时 | 交叉一致性规则（9 条） |

### Q10 迁移策略

**决策**：**测试驱动**（D）。

1. 先用 `iterate-ai-dataset-quality.ts` 对接新架构验证收敛率
2. 目标：收敛率从 ~67% 提升到 >90%
3. 通过后再迁移前端 UI 面板
4. 旧端点在测试验证期间保留可用

---

## 三、系统架构

### 3.1 整体流程

```
用户输入需求
    ↓
前端 GenerateOrchestrator
    ├── 构建 systemPrompt = GENERATE_BASE_PROMPT + DATA_PHASE_PROMPT
    ├── 定义 tools = [queryCapabilities, queryActionSpec, queryComponentCatalog, emitPagedata, ...]
    ├── POST /api/ai/sessions (创建会话, mode='generate')
    │
    ├── Phase 1: pagedata.json ─────────────────────────────
    │   ├── POST /api/ai/sessions/{id}/turn
    │   │   └── LLM → queryCapabilities() → 返回能力列表
    │   ├── POST /api/ai/sessions/{id}/append (tool result)
    │   ├── POST /api/ai/sessions/{id}/turn
    │   │   └── LLM → queryActionSpec('DataSet.tables') → 返回 Schema
    │   ├── POST /api/ai/sessions/{id}/append (tool result)
    │   ├── POST /api/ai/sessions/{id}/turn
    │   │   └── LLM → emitPagedata({...}) → tool 层 Schema 校验
    │   │       ├── pass → tool result: success
    │   │       └── fail → tool result: error + 错误详情 → LLM 自修正
    │   ├── 阶段后语义校验
    │   │   ├── pass → 进入 Phase 2
    │   │   └── fail → 错误注入 user message → iterate 循环
    │   └── 连续 N 轮失败 → 终止
    │
    ├── Phase 2: rule.json + script.js ─────────────────────
    │   ├── POST /api/ai/sessions/{id}/append (切换阶段指令 + UI_PHASE_PROMPT)
    │   ├── 同上循环：query* → emit* → 校验
    │   ├── 交叉校验（dataKey 引用 vs Phase 1 pagedata）
    │   │   └── 发现缺失表 → 回溯 Phase 1 (maxBacktracks=1)
    │   └── pass → 进入 Phase 3
    │
    └── Phase 3: style.css ─────────────────────────────────
        ├── POST /api/ai/sessions/{id}/append (切换阶段指令 + STYLE_PHASE_PROMPT)
        ├── query* → emitStyleCss → 校验
        └── pass → DELETE /api/ai/sessions/{id} → 完成
```

### 3.2 后端会话层

```
                    ┌──────────────────────────┐
                    │   AiSessionController    │
                    │   /api/ai/sessions/*     │
                    └─────────┬────────────────┘
                              │
                    ┌─────────▼────────────────┐
                    │   StillsSessionService   │
                    │   (重命名/扩展)           │
                    ├──────────────────────────┤
                    │ ConcurrentHashMap<       │
                    │   sessionId,             │
                    │   Session {              │
                    │     systemPrompt         │
                    │     windowSize           │
                    │     conversation[]       │
                    │     tools[]              │ ← 新增：FC tools 定义
                    │     mode                 │ ← 新增：'generate'|'stills'
                    │     lastActiveTime       │
                    │   }                      │
                    │ >                        │
                    ├──────────────────────────┤
                    │ createSession()          │
                    │ executeTurn()            │ ← 支持 SSE 流式
                    │ appendMessage()          │
                    │ getConversation()        │
                    │ destroySession()         │
                    │ buildWindowedMessages()  │ ← 滑动窗口裁剪
                    └─────────┬────────────────┘
                              │
                    ┌─────────▼────────────────┐
                    │   OpenAI API             │
                    │   /v1/chat/completions   │
                    │   (tools + stream)       │
                    └──────────────────────────┘
```

### 3.3 前端智能层

```
packages/spark-ai/src/generate/
├── generate-orchestrator.ts       ← 三阶段编排器（核心循环）
├── generate-tools-catalog.ts      ← FC tools 定义（7 个 tool）
├── generate-validators.ts         ← 双重校验器（tool 层 + 语义层）
├── ../session-backend.ts          ← SessionBackend 统一实现（generate/stills 共用）
└── index.ts                       ← 模块入口

packages/spark-ai/src/prompts/
└── page-system-prompt.ts          ← 拆分为 5 段导出（改造）
```

---

## 四、统一会话 API 设计

### 4.1 端点清单

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| `POST` | `/api/ai/sessions` | 创建会话 | `{systemPrompt, userPrompt, windowSize?, tools?, mode}` |
| `POST` | `/api/ai/sessions/{id}/turn` | 执行一轮 LLM 对话 | `{stream?}` |
| `POST` | `/api/ai/sessions/{id}/append` | 追加消息 | `{messages: [{role, content, tool_call_id?}]}` |
| `GET` | `/api/ai/sessions/{id}/conversation` | 获取完整对话记录 | — |
| `DELETE` | `/api/ai/sessions/{id}` | 销毁单个会话 | — |
| `DELETE` | `/api/ai/sessions` | 批量销毁 | `{sessionIds: []}` |

### 4.2 与旧端点映射

> 说明：右列均为历史端点，当前已下线（GONE），仅用于迁移对照。

| 新路径 | 旧路径 |
|--------|--------|
| `POST /api/ai/sessions` | `POST /api/stills/session`（已下线） |
| `POST /api/ai/sessions/{id}/turn` | `POST /api/stills/turn`（已下线） |
| `POST /api/ai/sessions/{id}/append` | `POST /api/stills/append`（已下线） |
| `GET /api/ai/sessions/{id}/conversation` | `POST /api/stills/conversation`（已下线） |
| `DELETE /api/ai/sessions/{id}` | `POST /api/stills/destroy`（已下线） |
| `DELETE /api/ai/sessions` | `POST /api/stills/destroy-batch`（已下线） |

### 4.3 会话数据结构

```java
class Session {
    String systemPrompt;            // system 角色消息
    int windowSize;                 // 滑动窗口大小（消息条数，默认 30）
    String mode;                    // "generate" | "stills"
    List<Tool> tools;               // FC tools 定义（JSON Schema）
    List<Message> conversation;     // 对话历史（不含 system prompt）
    long lastActiveTime;            // 最后活跃时间
}
```

### 4.4 滑动窗口算法（沿用现有逻辑）

```
if conversation.size <= windowSize:
    输出 = [system] + 全量 conversation
else:
    输出 = [system]
         + conversation[0]              ← 首条用户消息（原始需求）
         + 最近 (windowSize - 1) 条     ← 保留最新上下文
         + 确保起始是 assistant          ← 保持 role 配对
```

---

## 五、FC Tools 详细定义

### 5.1 查询型 Tools

#### `queryCapabilities`

```json
{
  "name": "queryCapabilities",
  "description": "查询当前阶段可用的系统能力列表。在生成任何配置前必须先调用此工具。",
  "parameters": {
    "type": "object",
    "properties": {
      "phase": {
        "type": "string",
        "enum": ["data", "ui", "style"],
        "description": "当前生成阶段"
      }
    },
    "required": ["phase"]
  }
}
```

**返回示例**（Phase = data）：
```json
{
  "capabilities": [
    { "id": "DataSet.tables", "summary": "创建和配置数据表" },
    { "id": "DataSet.columns", "summary": "定义列（含 computeExpression 计算列）" },
    { "id": "DataSet.relations", "summary": "配置表间关系" },
    { "id": "DataSet.views", "summary": "配置视图（含 aggregates 聚合）" },
    { "id": "DataSet.treeConfig", "summary": "树形数据配置" }
  ]
}
```

#### `queryActionSpec`

```json
{
  "name": "queryActionSpec",
  "description": "查询指定能力的详细操作指南，包括参数 Schema、使用规则、常见失败模式。",
  "parameters": {
    "type": "object",
    "properties": {
      "capabilityId": {
        "type": "string",
        "description": "能力 ID，如 DataSet.tables、SparkNode.dataKey"
      }
    },
    "required": ["capabilityId"]
  }
}
```

**返回示例**（capabilityId = DataSet.relations）：
```json
{
  "capabilityId": "DataSet.relations",
  "paramsSchema": {
    "parentTable": "string (必须是已存在的表名)",
    "childTable": "string (必须是已存在的表名)",
    "parentField": "string (必须是 parentTable 的列名)",
    "childField": "string (必须是 childTable 的列名)"
  },
  "usageRules": [
    "parentField 通常是父表的主键列",
    "childField 必须存在于 childTable 的 columns 定义中",
    "父表必须设置 autoCurrentFirst: true",
    "父表的主键列必须标记 isPrimaryKey: true"
  ],
  "failureModes": [
    { "symptom": "级联不触发", "cause": "父表缺少 autoCurrentFirst", "fix": "在父表视图中设置 autoCurrentFirst: true" },
    { "symptom": "currentRow 总是 null", "cause": "缺少 isPrimaryKey", "fix": "在主键列设置 isPrimaryKey: true" }
  ]
}
```

#### `queryComponentCatalog`

```json
{
  "name": "queryComponentCatalog",
  "description": "查询已注册组件的元数据（props、events、描述）。",
  "parameters": {
    "type": "object",
    "properties": {
      "componentType": {
        "type": "string",
        "description": "组件类型（如 r-table、r-form、el-table-column）。传 '*' 获取全部组件列表。"
      }
    },
    "required": ["componentType"]
  }
}
```

### 5.2 生成型 Tools

#### `emitPagedata`

```json
{
  "name": "emitPagedata",
  "description": "提交 pagedata.json 配置。调用前必须先 queryCapabilities 和 queryActionSpec。",
  "parameters": {
    "type": "object",
    "properties": {
      "content": {
        "type": "object",
        "description": "pagedata.json 的完整内容",
        "properties": {
          "dataSetName": { "type": "string" },
          "tables": { "type": "object" },
          "tableRelations": { "type": "array" }
        },
        "required": ["dataSetName", "tables"]
      }
    },
    "required": ["content"]
  }
}
```

#### `emitRuleJson`

```json
{
  "name": "emitRuleJson",
  "description": "提交 rule.json 配置。调用前必须先 queryCapabilities 和 queryActionSpec。",
  "parameters": {
    "type": "object",
    "properties": {
      "content": {
        "type": "object",
        "description": "rule.json 的完整内容（SparkNode 树）"
      }
    },
    "required": ["content"]
  }
}
```

#### `emitScriptJs`

```json
{
  "name": "emitScriptJs",
  "description": "提交 script.js 内容。",
  "parameters": {
    "type": "object",
    "properties": {
      "content": {
        "type": "string",
        "description": "script.js 的完整文本内容"
      }
    },
    "required": ["content"]
  }
}
```

#### `emitStyleCss`

```json
{
  "name": "emitStyleCss",
  "description": "提交 style.css 内容。",
  "parameters": {
    "type": "object",
    "properties": {
      "content": {
        "type": "string",
        "description": "style.css 的完整文本内容"
      }
    },
    "required": ["content"]
  }
}
```

---

## 六、阶段化 System Prompt 设计

### 6.1 GENERATE_BASE_PROMPT（所有阶段公共）

```
你是 SPARK 页面配置生成器。

## 环境
系统已为你预置了一个空的 DataSet 实例和一个 SparkNode 根节点实例。
你需要通过工具调用来查询系统能力并生成配置。

## 强制工作流（违反即失败）
1. 【查能力】调用 queryCapabilities 获取当前阶段的能力列表
2. 【查指南】对你需要使用的每个能力调用 queryActionSpec 获取精确的 Schema 和规则
3. 【查组件】如需了解组件可用 props，调用 queryComponentCatalog
4. 【生成】通过 emit* 工具调用提交产物

## 禁止事项（底线）
- ❌ 禁止在未调用 queryCapabilities 前就生成任何配置
- ❌ 禁止假设字段名、关系配置、列属性——必须查 queryActionSpec 后按返回的 Schema 生成
- ❌ 禁止在 assistant 文本消息中输出 JSON 配置——必须通过 emit* 工具调用提交
- ❌ 禁止使用未在 queryComponentCatalog 中列出的组件类型
```

### 6.2 DATA_PHASE_PROMPT（Phase 1）

从 `system-prompt.txt` 的 `## pagedata.json` 节段提取并增强：
- 表结构规则（tableName、columns 定义、rows 格式）
- 列属性规则（isPrimaryKey、autoCurrentFirst、computeExpression 计算列）
- 关系规则（tableRelations、parentField/childField 合法字段）
- 视图规则（views.default 必须存在、aggregates 聚合配置）
- treeConfig 规则（idField、parentIdField、treeMode）
- DataSet wrapper 规则（外层必须有 dataSetName + tables）

### 6.3 UI_PHASE_PROMPT（Phase 2）

从 `system-prompt.txt` 的 `## rule.json` + `## script.js` 节段提取：
- SparkNode 三段式结构（type + props + children）
- dataKey 格式规则（`table@field`、`table@viewId@field`）
- 组件优先级（r-* 容器优先于 el-* 原生组件）
- script.js 沙箱变量（$dataSet、$page、$route 等）
- __init__ 入口函数必须存在
- 禁止使用的 API（ElMessage、window.xxx、import 语句）

### 6.4 STYLE_PHASE_PROMPT（Phase 3）

style.css 规则：
- CSS 作用域建议
- 布局模式（flex/grid）
- 响应式断点

### 6.5 CROSS_CONSISTENCY_PROMPT（阶段后校验反馈时注入）

从 `system-prompt.txt` 的 `## 跨文件一致性` 节段提取的 9 条交叉检查规则：
- dataKey 引用的表/视图必须存在于 pagedata.json
- script.js 中 $dataSet.getView() 的表名必须存在
- relation 的 parentField/childField 必须存在于对应表的 columns
- 等等

---

## 七、双重校验器设计

### 7.1 Tool 层校验（即时反馈）

在 `emitPagedata` 等 tool 的执行函数中内置：

| 检查项 | emitPagedata | emitRuleJson | emitScriptJs | emitStyleCss |
|--------|:-----------:|:------------:|:------------:|:------------:|
| JSON 结构有效 | ✅ | ✅ | — | — |
| dataSetName 存在 | ✅ | — | — | — |
| tables 非空 | ✅ | — | — | — |
| 每表有 tableName + columns | ✅ | — | — | — |
| views.default 存在 | ✅ | — | — | — |
| SparkNode type 字段存在 | — | ✅ | — | — |
| CSS 语法基本检查 | — | — | — | ✅ |

**失败时**：tool 返回 `{"success": false, "errors": [...], "hint": "..."}`，LLM 立即自修正。

### 7.2 语义层校验（阶段后检查）

复用 `iterate-ai-dataset-quality.ts` 中的 ~40 条检查规则：

| 类别 | 检查项举例 |
|------|----------|
| **数据完整性** | 父表有 autoCurrentFirst、主键列有 isPrimaryKey、relation 字段存在于表列定义中 |
| **跨文件引用** | dataKey 引用的 table 存在于 pagedata、script 中 getView 的 tableName 合法 |
| **组件合规** | 使用 r-* 而非裸 el-*、未使用禁止组件列表中的组件 |
| **脚本合规** | __init__ 存在、未使用 ElMessage/ElMessageBox、未使用 import 语句 |
| **交叉一致性** | rule.json 中 dataKey 字段引用的表在 pagedata.json 中定义 |

**失败时**：错误列表 + CROSS_CONSISTENCY_PROMPT 注入到 user message 作为下一轮 iterate 反馈。

---

## 八、编排器核心逻辑

### 8.1 接口定义

```typescript
interface GenerateOrchestratorConfig {
  maxIterationsPerPhase: number   // 单阶段最大 iterate 轮次（默认 3）
  maxBacktracks: number           // 最大回溯次数（默认 1）
  slidingWindow: number           // 后端滑动窗口大小（默认 30）
  componentMetadata?: unknown     // 组件元数据
}

interface GenerateResult {
  pagedata: object | null         // pagedata.json
  rule: object | null             // rule.json
  script: string | null           // script.js
  style: string | null            // style.css
  phases: PhaseResult[]           // 各阶段结果
  totalRounds: number             // 总轮次
  backtracks: number              // 回溯次数
  converged: boolean              // 是否收敛
}

interface PhaseResult {
  phase: 'data' | 'ui' | 'style'
  iterations: number
  toolCalls: ToolCallRecord[]
  validationErrors: string[]
  success: boolean
}
```

### 8.2 伪代码

```typescript
async function runGenerate(
  userPrompt: string,
  config: GenerateOrchestratorConfig,
  backend: SessionBackend
): Promise<GenerateResult> {

  // 创建会话
  const sessionId = await backend.createSession(
    GENERATE_BASE_PROMPT + DATA_PHASE_PROMPT,
    userPrompt,
    config.slidingWindow,
    generateTools,
    'generate'
  )

  const result: GenerateResult = { ... }
  let backtracks = 0

  // Phase 1: pagedata.json
  const phase1 = await runPhase(sessionId, 'data', config, backend)
  if (!phase1.success) return failResult(result)
  result.pagedata = phase1.output

  // Phase 2: rule.json + script.js
  await backend.appendMessages(sessionId, [
    { role: 'user', content: `进入 Phase 2。\n${UI_PHASE_PROMPT}\n\n当前 pagedata.json:\n${JSON.stringify(result.pagedata)}` }
  ])

  const phase2 = await runPhase(sessionId, 'ui', config, backend)

  // 回溯检查
  if (!phase2.success && phase2.needsBacktrack && backtracks < config.maxBacktracks) {
    backtracks++
    // 回溯到 Phase 1 修正 pagedata
    await backend.appendMessages(sessionId, [
      { role: 'user', content: `Phase 2 校验发现数据层问题，需要回溯修正 pagedata。\n错误:\n${phase2.validationErrors.join('\n')}` }
    ])
    // 重新运行 Phase 1 + Phase 2 ...
  }

  result.rule = phase2.outputs.rule
  result.script = phase2.outputs.script

  // Phase 3: style.css
  await backend.appendMessages(sessionId, [
    { role: 'user', content: `进入 Phase 3。\n${STYLE_PHASE_PROMPT}` }
  ])
  const phase3 = await runPhase(sessionId, 'style', config, backend)
  result.style = phase3.output

  // 清理
  await backend.destroySession(sessionId)

  result.converged = phase1.success && phase2.success && phase3.success
  return result
}
```

---

## 九、实施步骤

### Step 1：后端 — 统一会话 API

| 文件 | 动作 | 说明 |
|------|------|------|
| 新建 `AiSessionController.java` | 创建 | `/api/ai/sessions/*` 统一端点 |
| `StillsSessionService.java` | 改造 | 添加 SSE 流式 turn + tools 参数存储与转发 |
| `StillsController.java` | 改造 | 旧 `/api/stills/*` 统一返回下线语义（GONE） |

### Step 2：前端 — FC Tools 定义

| 文件 | 动作 |
|------|------|
| 新建 `packages/spark-ai/src/generate/generate-tools-catalog.ts` | 7 个 tool 定义 |
| 知识来源：`dataset-crud-tool-stills-catalog.ts` + `spark-node-tree-tool-catalog.ts` | 提取能力列表和操作指南 |

### Step 3：前端 — 阶段化 Prompt

| 文件 | 动作 |
|------|------|
| 改造 `packages/spark-ai/src/prompts/page-system-prompt.ts` | 拆分为 5 段导出 |

### Step 4：前端 — 三阶段编排器

| 文件 | 动作 |
|------|------|
| 新建 `packages/spark-ai/src/generate/generate-orchestrator.ts` | 核心编排循环 |
| 复用 `packages/spark-ai/src/session-backend.ts` | SessionBackend HTTP 实现（generate/stills 统一） |

### Step 5：前端 — 双重校验器

| 文件 | 动作 |
|------|------|
| 新建 `packages/spark-ai/src/generate/generate-validators.ts` | tool 层 + 语义层校验 |
| 提取自 `scripts/iterate-ai-dataset-quality.ts` | ~40 条检查规则复用 |

### Step 6：测试脚本迁移 + 验证

| 文件 | 动作 |
|------|------|
| 改造 `scripts/iterate-ai-dataset-quality.ts` | 从直调 stream-page → 使用 generate-orchestrator |
| 验证目标 | 收敛率 >90%（当前 ~67%） |

---

## 十、完整文件清单

| 动作 | 文件路径 | 说明 |
|------|---------|------|
| **新建** | `spark-ai-server/.../controller/AiSessionController.java` | 统一会话端点 |
| **改造** | `spark-ai-server/.../stills/StillsSessionService.java` | SSE 流式 + tools 转发 + mode 字段 |
| **新建** | `packages/spark-ai/src/generate/generate-tools-catalog.ts` | 7 个 FC tool 定义 |
| **新建** | `packages/spark-ai/src/generate/generate-orchestrator.ts` | 三阶段编排器 |
| **新建** | `packages/spark-ai/src/generate/generate-validators.ts` | 双重校验器 |
| **改造** | `packages/spark-ai/src/session-backend.ts` | SessionBackend HTTP 统一实现 |
| **新建** | `packages/spark-ai/src/generate/index.ts` | 模块入口 |
| **改造** | `packages/spark-ai/src/prompts/page-system-prompt.ts` | 拆分为 5 段导出 |
| **改造** | `scripts/iterate-ai-dataset-quality.ts` | 对接新编排器 |
| **改造** | `spark-ai-server/.../controller/StillsController.java` | 旧端点下线返回 GONE |
| **保留** | `spark-ai-server/.../resources/prompts/system-prompt.txt` | 历史 stream-page 链路仍使用 |

---

## 十一、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| FC 多轮查询增加 token 开销和延迟 | 单次生成耗时增加 | queryCapabilities 返回精简列表；queryActionSpec 按需返回单个 action |
| LLM 不遵循"先查后做"约束 | 生成质量不稳定 | system prompt 硬性禁令 + tool 层校验兜底 + 场景模式示例 |
| 滑动窗口按条数可能超出 context window | LLM 响应质量下降 | 短期可接受（现有 Stills 已运行）；中期可加 token 估算 |
| 回溯导致无限循环 | 生成永不结束 | `maxBacktracks` 硬限制（默认 1） |
| 迁移期间两套端点并存 | 维护成本增加 | 强制统一到 `/api/ai/sessions`，旧端点仅保留下线响应 |

---

## 十二、成功标准

| 指标 | 当前 | 目标 |
|------|------|------|
| 单场景收敛率 | ~67% | **>90%** |
| 每次生成 LLM 调用轮次 | 2（Phase 1 + Phase 2） | 6-12（三阶段 × 查询+生成） |
| system prompt token 占用 | ~4000 tokens（全量注入） | ~1500 tokens（阶段裁剪）+ 按需查询 |
| 数据层错误率（autoCurrentFirst/isPrimaryKey 缺失） | ~30% | **<5%** |
| 交叉引用错误率（dataKey 引用不存在的表） | ~20% | **<5%** |
