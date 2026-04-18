# DevSystem AI 全面助力方案

> 研究日期：2026-04-18
> 状态：方案规划

---

## 一、现状分析

### 1.1 现有 AI 能力架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           spark-ai-server (Backend)                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │ AiChatController│  │ StillsController│  │ PageConfigController + SSE     │  │
│  │  /api/ai/chat   │  │ /api/stills/*   │  │ /api/tenants/{t}/projects/{p}/ │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────────┬────────────────┘  │
└───────────┼─────────────────────┼──────────────────────────┼────────────────────┘
            │ SSE                 │ REST                     │ SSE + REST
            ▼                     ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         packages/spark-ai (Frontend)                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                           AI Loop (ai-loop.ts)                          │   │
│  │  • 两阶段页面生成 (rule.json + pagedata.json)                            │   │
│  │  • 自动迭代修复 (最多 3 轮)                                               │   │
│  │  • 配置结构化校验 (validateGeneratedConfig)                              │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    Stills 动作引擎 (53 个原子动作)                         │   │
│  │  • dataset-domain (24): datasetInit, datatableCreate, relationAdd ...   │   │
│  │  • blueprint-domain (8): blueprintCreate, blueprintAdvance ...          │   │
│  │  • pageconfig-domain (18): nodeTree 操作, script.js 编辑 ...            │   │
│  │  • meta (3): stillsCapabilities, catalogQuery, sessionDescribe          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │              Session Orchestrator (✅ 实现完成, ⏸️ 未接入)                 │   │
│  │  • 多轮工具循环编排                                                       │   │
│  │  • warnings → followUp 自动注入                                          │   │
│  │  • 终止条件检测 (export 完成 / 蓝图完成)                                   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Dev System (src/views/app/dev-system/)                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                  │
│  │  DevSiteTree    │  │  DevFileEditor  │  │  DevPreviewTab  │                  │
│  │  (导航树管理)    │  │  (配置文件编辑)  │  │  (实时预览)      │                  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                  │
│  ┌─────────────────┐  ┌─────────────────────────────────────────────────────┐   │
│  │  DevNodeProps   │  │  DevAiPanel (✅ 生成/修复, ⏸️ Stills 未接入)         │   │
│  │  (节点属性)      │  │  • 页面配置生成 (generate)                           │   │
│  └─────────────────┘  │  • 迭代修复 (iterate)                                │   │
│                       │  • 实时日志流 + 错误计数                              │   │
│                       │  • SSE 事件监听                                       │   │
│                       └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 功能状态矩阵

| 模块 | 状态 | 入口 | 说明 |
|------|------|------|------|
| **页面配置生成闭环** | ✅ 完整 | DevAiPanel | AIPageLoop + 两阶段 + 自动迭代 |
| **流式 SSE 生成** | ✅ 完整 | DevAiPanel | delta/reasoning/phase 事件 |
| **配置结构校验** | ✅ 完整 | AI Loop | validateGeneratedConfig |
| **导航自动注册** | ✅ 完整 | AI Loop | registerPageNavigation |
| **Dev 编辑器** | ✅ 完整 | DevFileEditor | 4 文件 + 版本 + 预览 |
| **Stills 动作引擎** | ✅ 完整 | 未接入 | 53 个原子动作已注册 |
| **会话编排器** | ✅ 实现 | 未接入 | runStillsLoop 未连线 |
| **Stills Backend** | 🔶 基础 | /api/stills/* | chat/execute/session |
| **组件目录投影** | ✅ 完整 | catalog-projections | FC/DevSystem 多角色 |

### 1.3 关键差距

1. **Stills 会话编排器未接入 DevAiPanel**
   - 当前：仅支持单轮生成/迭代
   - 目标：支持复杂多步任务（如：设计数据模型 → 生成表格 → 添加筛选）

2. **DevFileEditor 无 AI 辅助**
   - 当前：纯手动编辑
   - 目标：AI 代码补全、智能修复建议

3. **DataSet 设计无可视化**
   - 当前：手写 pagedata.json
   - 目标：AI 辅助设计表关系、字段类型

4. **错误诊断靠手动**
   - 当前：需点击"调试"按钮
   - 目标：预览错误自动发送 AI 诊断

---

## 二、整合方案

### 2.1 Phase 1: Stills 会话编排器接入 (高优先级)

**目标**：让 DevAiPanel 支持复杂多步 AI 任务

**当前状态**：
- `session-orchestrator.ts` 已实现完整循环逻辑
- `SessionBackend` 接口已定义，需实现 HTTP 客户端
- 后端 `StillsController` 已提供基础端点

**实施步骤**：

```
Step 1: 实现 SessionBackendImpl
────────────────────────────────
位置: packages/spark-ai/src/runtime/session-backend-impl.ts

接口方法:
- createSession() → POST /api/stills/session
- executeTurn()   → POST /api/stills/chat
- appendMessages()→ POST /api/stills/session/{id}/messages
- destroySession()→ DELETE /api/stills/session/{id}

Step 2: 扩展 DevAiPanel UI
─────────────────────────────
- 新增 "Stills 模式" 开关
- 支持蓝图可视化展示
- 显示多步执行进度

Step 3: 连线 runStillsLoop
─────────────────────────────
在 DevAiPanel 中:
- Stills 模式: 调用 runStillsLoop(session, backend, prompt)
- 普通模式: 保持现有 AI Loop
```

**关键文件**：

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `packages/spark-ai/src/runtime/session-backend-impl.ts` | 新增 | HTTP 客户端实现 |
| `packages/spark-ai/src/index.ts` | 修改 | 导出 runStillsLoop |
| `src/views/app/dev-system/DevAiPanel.vue` | 修改 | 增加 Stills 模式 |
| `spark-ai-server/.../StillsController.java` | 修改 | 补充缺失端点 |

**预期收益**：
- 支持复杂多步任务（如：一键生成完整 CRUD 模块）
- AI 自动根据上下文选择合适动作
- 蓝图规划 + 逐步执行 + 自检修复

---

### 2.2 Phase 2: DevFileEditor AI 增强 (中优先级)

**目标**：在配置编辑器中提供 AI 辅助能力

**方案 A：智能补全面板**

```vue
<!-- DevFileEditor.vue 扩展 -->
<template>
  <div class="editor-wrapper">
    <JsonTreeEditor v-model="content" @cursor-change="onCursorChange" />
    
    <!-- AI 补全悬浮面板 -->
    <AiCompletionPanel
      v-if="showCompletion"
      :context="cursorContext"
      :suggestions="aiSuggestions"
      @accept="applyCompletion"
    />
  </div>
</template>
```

**方案 B：AI 快捷命令**

在编辑器中支持 `/ai` 命令：
- `/ai fix` - 修复当前选中代码
- `/ai explain` - 解释当前配置块
- `/ai complete` - 补全缺失字段
- `/ai rewrite` - 按描述重写选中部分

**实现要点**：
- 利用 `projectFcDirectory` 获取组件类型定义
- 结合 `spark-node-component-catalog.ts` 提供属性补全
- 调用现有 AI Loop 的流式接口

---

### 2.3 Phase 3: DataSet 可视化设计模式 (中优先级)

**目标**：提供 AI 辅助的数据模型设计界面

**核心能力**（基于现有 Stills）：

```typescript
// dataset-domain 已提供 24 个动作
const datasetStills = [
  'dataset.init',           // 初始化数据集
  'datatable.create',       // 创建数据表
  'datatable.addColumns',   // 添加列
  'datatable.setApi',       // 配置 API
  'relation.add',           // 添加关联
  'dataview.create',        // 创建视图
  'dataview.configure',     // 配置视图
  'dataview.setAggregates', // 设置聚合
  // ... 等
]
```

**UI 方案**：

```
┌─────────────────────────────────────────────────────────────────┐
│                    DataSet 设计器                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┐  ┌─────────────────────────────┐   │
│  │     表结构可视化         │  │      AI 设计助手            │   │
│  │  ┌─────────┐             │  │                             │   │
│  │  │ users   │──────┐      │  │  💬 描述你的数据需求：       │   │
│  │  │ - id    │      │      │  │  ┌─────────────────────┐   │   │
│  │  │ - name  │      ▼      │  │  │ 用户订单系统，用户   │   │   │
│  │  │ - email │  ┌───────┐  │  │  │ 可以有多个订单...    │   │   │
│  │  └─────────┘  │orders │  │  │  └─────────────────────┘   │   │
│  │               │ - id  │  │  │  [🚀 生成数据模型]         │   │
│  │               │ - uid │  │  │                             │   │
│  │               └───────┘  │  │  📋 执行计划:               │   │
│  │                          │  │  1. ✅ dataset.init          │   │
│  │  [+ 添加表] [+ 添加关系]  │  │  2. ⏳ datatable.create x2  │   │
│  │                          │  │  3. ⬜ relation.add          │   │
│  └─────────────────────────┘  └─────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  [导出 pagedata.json]  [预览 DataView]  [应用到页面]            │
└─────────────────────────────────────────────────────────────────┘
```

**实现路径**：
1. 新建 `DevDataSetDesigner.vue` 组件
2. 集成 Stills 会话编排器
3. 可视化执行蓝图进度
4. 支持导出为 `pagedata.json`

---

### 2.4 Phase 4: 智能错误诊断 (低优先级)

**目标**：预览错误自动触发 AI 诊断

**当前流程**：
```
用户查看预览 → 发现错误 → 手动点击"调试" → AI 修复
```

**优化后**：
```
用户查看预览 → 系统检测错误 → 自动收集日志 → AI 诊断建议 → 一键修复
```

**实现方案**：

```typescript
// DevPreviewTab.vue 扩展
watch(renderErrors, (errors) => {
  if (errors.length > 0 && autoAiDiagnostics.value) {
    // 自动调用 AI 诊断
    const snapshot = collectLogSnapshot()
    const suggestion = await aiLoop.diagnose(snapshot)
    
    // 显示诊断建议浮层
    showDiagnosticsPanel(suggestion)
  }
})
```

---

## 三、技术实现细节

### 3.1 SessionBackendImpl 实现

```typescript
// packages/spark-ai/src/runtime/session-backend-impl.ts

import type { SessionBackend, LlmResponse, ToolDefinition, ToolCall } from './session-orchestrator'
import { getConfiguredHttp } from '../protocol'

export class SessionBackendImpl implements SessionBackend {
  private sessionIds = new Set<string>()
  private baseUrl: string

  constructor(baseUrl = '/api/stills') {
    this.baseUrl = baseUrl
  }

  async createSession(
    systemPrompt: string,
    userPrompt: string,
    windowSize: number,
    tools?: ToolDefinition[]
  ): Promise<string> {
    const http = getConfiguredHttp()
    const resp = await http.post<{ sessionId: string }>(`${this.baseUrl}/session`, {
      systemPrompt,
      userPrompt,
      windowSize,
      tools,
    })
    this.sessionIds.add(resp.sessionId)
    return resp.sessionId
  }

  async executeTurn(sessionId: string): Promise<LlmResponse | null> {
    const http = getConfiguredHttp()
    return http.post<LlmResponse>(`${this.baseUrl}/chat`, { sessionId })
  }

  async appendMessages(
    sessionId: string,
    messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: ToolCall[] }>
  ): Promise<void> {
    const http = getConfiguredHttp()
    await http.post(`${this.baseUrl}/session/${sessionId}/messages`, { messages })
  }

  async getConversation(sessionId: string): Promise<Array<{ role: string; content: string }>> {
    const http = getConfiguredHttp()
    return http.get<Array<{ role: string; content: string }>>(`${this.baseUrl}/session/${sessionId}/conversation`)
  }

  async destroySession(sessionId: string): Promise<void> {
    const http = getConfiguredHttp()
    await http.delete(`${this.baseUrl}/session/${sessionId}`)
    this.sessionIds.delete(sessionId)
  }

  async destroyAllSessions(): Promise<void> {
    const http = getConfiguredHttp()
    const ids = Array.from(this.sessionIds)
    if (ids.length > 0) {
      await http.post(`${this.baseUrl}/sessions/batch-destroy`, { sessionIds: ids })
    }
    this.sessionIds.clear()
  }
}
```

### 3.2 DevAiPanel Stills 模式扩展

```typescript
// DevAiPanel.vue 扩展

import { SessionBackendImpl } from '@spark-view/spark-ai'
import { runStillsLoop, createSession, registerAllStills } from '@spark-view/spark-ai'

const stillsMode = ref(false)
const stillsSession = ref<IStillSession | null>(null)
const backend = new SessionBackendImpl()

async function handleStillsMode(prompt: string) {
  // 初始化会话
  registerAllStills()
  stillsSession.value = createSession()
  
  // 运行循环
  const result = await runStillsLoop(stillsSession.value, backend, {
    systemPrompt: buildSystemPrompt(),
    userPrompt: prompt,
    onTurn: (turn) => {
      // 更新 UI 显示执行进度
      messages.value.push({
        id: Date.now(),
        role: 'assistant',
        content: formatTurnResult(turn),
        reasoning: turn.aiReasoning || '',
        streaming: false,
        phase: turn.phase,
        files: null,
      })
    },
    onComplete: (blueprint) => {
      // 显示完成状态 + 蓝图摘要
      showBlueprintSummary(blueprint)
    },
  })
  
  return result
}
```

---

## 四、实施优先级与时间线

| Phase | 模块 | 优先级 | 预估工时 | 依赖 |
|-------|------|--------|---------|------|
| **1** | Stills 会话编排器接入 | 🔴 高 | 3-5 天 | Backend 端点补充 |
| **2** | DevFileEditor AI 增强 | 🟡 中 | 2-3 天 | Phase 1 可选 |
| **3** | DataSet 可视化设计 | 🟡 中 | 4-6 天 | Phase 1 |
| **4** | 智能错误诊断 | 🟢 低 | 1-2 天 | 无 |

**建议实施顺序**：

```
Week 1: Phase 1 (Stills 编排器接入)
  - Day 1-2: SessionBackendImpl + Backend 端点补充
  - Day 3-4: DevAiPanel UI 扩展
  - Day 5: 集成测试 + 文档

Week 2: Phase 2 + Phase 4
  - Day 1-2: DevFileEditor AI 补全
  - Day 3: 智能错误诊断
  - Day 4-5: 回归测试

Week 3-4: Phase 3 (可选，视需求)
  - DataSet 可视化设计器
```

---

## 五、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Stills 后端端点不稳定 | Phase 1 延期 | 先用 Mock Backend 验证前端逻辑 |
| 多轮对话 token 消耗高 | 成本增加 | 实现滑动窗口裁剪 + 摘要压缩 |
| AI 生成质量不稳定 | 用户体验差 | 保留人工确认步骤，支持单步回滚 |
| DataSet 设计器复杂度高 | 开发周期长 | 先实现 CLI 版本验证，再做 UI |

---

## 六、验收标准

### Phase 1 验收

- [ ] Stills 模式开关可用
- [ ] 能完成 3 步以上的复杂任务（如：创建数据模型 + 生成表格 + 添加筛选）
- [ ] 蓝图进度可视化
- [ ] 单步可回滚

### Phase 2 验收

- [ ] `/ai fix` 命令可修复选中代码
- [ ] 组件类型自动补全
- [ ] 属性提示基于组件 catalog

### Phase 3 验收

- [ ] 可视化设计表结构和关系
- [ ] AI 理解自然语言生成数据模型
- [ ] 导出有效的 `pagedata.json`

### Phase 4 验收

- [ ] 预览错误自动触发诊断
- [ ] 诊断建议一键应用
- [ ] 误报率 < 10%

---

## 附录

### A. 相关文件路径

```
packages/spark-ai/
├── src/
│   ├── runtime/
│   │   ├── ai-loop.ts              # 页面生成闭环
│   │   ├── session-orchestrator.ts # 会话编排器 (✅ 已实现)
│   │   └── session-backend-impl.ts # HTTP 客户端 (待实现)
│   ├── stills/
│   │   ├── dataset-domain.ts       # 24 个 DataSet 动作
│   │   ├── blueprint-domain.ts     # 8 个蓝图动作
│   │   └── pageconfig-domain.ts    # 18 个配置动作
│   └── catalog/
│       ├── component-catalog.json  # 组件知识目录
│       └── catalog-projections.ts  # 目录投影

src/views/app/dev-system/
├── DevAiPanel.vue                  # AI 面板 (待扩展)
├── DevFileEditor.vue               # 配置编辑器 (待扩展)
├── DevPreviewTab.vue               # 实时预览 (待扩展)
└── DevDataSetDesigner.vue          # DataSet 设计器 (待新建)

spark-ai-server/
└── src/main/java/com/spark/ai/
    ├── controller/StillsController.java  # Stills 端点 (待补充)
    └── service/StillsSessionService.java # 会话管理 (待补充)
```

### B. 核心接口定义

```typescript
// SessionBackend 接口 (已定义于 session-orchestrator.ts)
interface SessionBackend {
  createSession(systemPrompt: string, userPrompt: string, windowSize: number, tools?: ToolDefinition[]): Promise<string>
  executeTurn(sessionId: string): Promise<LlmResponse | null>
  appendMessages(sessionId: string, messages: Message[]): Promise<void>
  getConversation(sessionId: string): Promise<Message[]>
  destroySession(sessionId: string): Promise<void>
  destroyAllSessions(): Promise<void>
}

// 蓝图类型 (已定义于 stills/types.ts)
interface ExecutionBlueprint {
  goal: string
  items: BlueprintPlanItem[]
  checkpoints: BlueprintCheckpoint[]
  currentItemIndex: number
  status: 'planning' | 'executing' | 'completed' | 'failed'
}
```

### C. 组件目录投影角色

```typescript
// catalog-projections.ts
export type ProjectionRole = 
  | 'full-context'      // 完整上下文（用于页面生成）
  | 'dev-system'        // DevSystem 角色（组件属性提示）
  | 'fc-container'      // 容器组件
  | 'fc-field'          // 字段组件
  | 'fc-action'         // 动作组件
```
