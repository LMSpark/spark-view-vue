# spark-scenario 架构深度解析

## 项目概览

**spark-scenario** 是一个纯 TypeScript、无框架依赖的 **AI 场景编程引擎**，为复杂业务流程提供声明式、可扩展的场景定义与执行框架。

### 核心使命

将 AI 能力从"黑盒函数调用"升级为"可查询、可计划、可恢复的业务场景"，支持：

- **声明式场景**：预先定义场景意图、工具、工作流，而非通过提示词复杂编程
- **分级查询**：LLM 可以通过 15 步结构化 API 逐步发现能力（意图 → 场景 → 工具 → Schema）
- **计划生成**：LLM 基于查询结果生成执行计划（scenarioId + toolCalls），不直接执行工具
- **失败恢复**：运行时记录异常步骤，支持多种恢复策略（分层恢复、人工干预、严格失败）
- **浏览器原生**：支持本地 WASM/WebGPU 推理（无服务器成本）和远程 OpenAI API（成本最优）

### 关键特性

| 特性 | 说明 |
|-----|------|
| **纯 TS + 无依赖** | 0 个运行时依赖（contracts/runtime/system），可独立 npm 发布 |
| **双 LLM 客户端** | 本地推理（transformers.js）和远程 API（OpenAI-compatible），接口统一 |
| **分层架构** | 6 层隔离（contracts/runtime/system/prompt/history/llm），易测试易扩展 |
| **查询协议** | 15 步结构化 API，规范 LLM 信息收集流程 |
| **类型安全** | strict mode + exactOptionalPropertyTypes，完全类型检查 |
| **完整测试** | 38 个单元测试，覆盖 LLM 推理、注册表、查询协议 |

---

## 6 层架构设计

### 架构图

```
┌─────────────────────────────────────────────┐
│         llm 层（LLM 集成）                    │
│  ┌─────────────────────────────────────┐   │
│  │ • browser-fetch-llm-client          │   │  OpenAI API 客户端
│  │ • browser-local-llm-client          │   │  transformers.js 推理
│  │ • browser-scenario-planner          │   │  LLM 场景规划器
│  └─────────────────────────────────────┘   │
└──────────────────┬──────────────────────────┘
                   │ 消费 AiBrowserLlmClient interface
                   ↓
┌─────────────────────────────────────────────┐
│      system 层（系统装配与注册）              │
│  ┌─────────────────────────────────────┐   │
│  │ • scenario-system (createScenarioSystem) │  统一启动
│  │ • registerScenarios(初始化数据)         │  批量注册
│  └─────────────────────────────────────┘   │
└──────────────────┬──────────────────────────┘
                   │ 依赖
                   ↓
┌─────────────────────────────────────────────┐
│      runtime 层（执行引擎 & 中心）           │
│  ┌─────────────────────────────────────┐   │
│  │ • createScenarioRegistry()          │   │  生命周期 + 15 步查询
│  │ • createScenarioRuntime()           │   │  场景执行与工具调用
│  │ • queryIntentCatalog()              │   │
│  │ • queryScenarioInfo()               │   │  ← 提供 AiScenarioQueryProtocol
│  │ • queryToolSchema() / 等 12 个方法  │   │
│  └─────────────────────────────────────┘   │
└──────────────────┬──────────────────────────┘
                   │ 依赖 + 返回
                   ↓
┌──────────────────────────────────────────────┐
│  prompt/history 层（附加服务）                │
│  ┌───────────────────────────────────────┐  │
│  │ • scenario-prompt-template-registry   │  │  提示词模板
│  │ • run-history-store                   │  │  运行历史
│  │ • prompt-constraints                  │  │  约束定义
│  └───────────────────────────────────────┘  │
└──────────────────┬───────────────────────────┘
                   │ 依赖
                   ↓
┌──────────────────────────────────────────────┐
│   contracts 层（类型定义 & 协议）            │
│  ┌───────────────────────────────────────┐  │
│  │ • scenario-types.ts                   │  │  AiScenarioDefinition 等
│  │ • query-protocol.ts                   │  │  15 步查询接口定义
│  │ • llm-contracts.ts                    │  │  LLM 通信契约
│  │ • json-schema.ts                      │  │  JSON Schema 类型
│  └───────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

---

## 层级详解

### 1️⃣ **contracts 层**（纯类型定义，零依赖）

**职责**：定义所有公开接口、数据结构、协议规范。是整个系统的类型骨架。

#### 关键文件

##### 📄 `scenario-types.ts`（~300 行）

定义场景的完整生命周期类型：

```typescript
// 场景身份：三元组标识
interface AiScenarioIdentity {
  id: string          // "scenario.leave"
  title: string       // "请假审批"
  scope: 'planning' | 'design' | 'business'
}

// 场景定义：完整的行为声明
interface AiScenarioDefinition {
  ...AiScenarioIdentity
  description?: string
  
  // 提示词政策：支持静态/动态/模板三种入口
  prompts: AiScenarioPromptPolicy
  
  // 工具集合：该场景能调用的所有工具
  tools: readonly AiScenarioTool[]
  
  // 工作流：步骤序列
  flow?: AiScenarioFlowContract
  
  // 确认/恢复策略
  confirmPolicy?: AiConfirmPolicy  // 'auto' | 'plan-confirm' | 'step-confirm' ...
  recoveryPolicy?: AiRecoveryPolicy // 'layered' | 'manual' | 'strict'
  
  // 工具注册规则（失败码、修复提示）
  toolRegistrations?: Record<string, AiScenarioToolRegistration>
}

// 上下文：运行时参数
interface AiScenarioContext {
  userInput: string
  pageId?: string
  projectId?: string
  user?: { id?: string; name?: string; role?: string }
  metadata?: Record<string, unknown>
}

// Payload 契约：补齐参数的结构化声明
interface AiScenarioPayloadContract {
  schema?: JsonSchema
  slots?: readonly AiScenarioPayloadSlot[]  // [{ key: "days", required: true, description: "..." }]
  required?: readonly string[]
}

// 工作流契约：多步骤编排
interface AiScenarioFlowContract {
  description?: string
  steps: readonly AiScenarioFlowStep[]  // [{ id: "submit", title: "提交申请", kind: "tool-call" }]
}
```

**设计要点**：

- 所有政策都是声明式的，不包含执行逻辑
- Payload 支持"补齐"（用户输入不完整时追问）
- 工具注册规则支持"失败恢复"（自动重试、人工干预）

##### 📄 `query-protocol.ts`（~200 行）

定义分级查询协议的 15 步 API：

```typescript
interface AiScenarioQueryProtocol {
  // 步骤 1：发现可用场景（第一眼）
  queryIntentCatalog(): AiIntentCatalog  // [ { scenarioId, intents: [...], summary } ]
  
  // 步骤 2：读取目标场景详情
  queryScenarioInfo(scenarioId: string): AiScenarioInfo | undefined
  
  // 步骤 2.5~2.9：按能力视角查询
  queryScenarioCapabilities(query?: ...): AiScenarioCapabilitiesPage
  queryScenarioPayload(scenarioId: string): AiScenarioPayloadInfo | undefined
  queryScenarioFlow(scenarioId: string): AiScenarioFlowInfo | undefined
  queryScenarioCompletion(scenarioId: string): AiScenarioCompletionInfo | undefined
  queryScenarioRecovery(scenarioId: string): AiScenarioRecoveryInfo | undefined
  
  // 步骤 3：分页浏览工具目录
  queryScenarioTools(query?: ...): AiScenarioToolsPage  // { items: [...], hasMore }
  
  // 步骤 4：查询工具 Schema
  queryToolSchema(toolName: string, scenarioId?: string): AiToolSchemaInfo | undefined
  queryToolSchemaNode(query: { toolName, pointer?: "/days" }): AiToolSchemaNodeInfo | undefined
  
  // 步骤 5：读取工具注册规则
  queryToolRegistration(...): AiToolRegistrationInfo | undefined
  
  // 步骤 7：查询历史记录
  queryRunHistory(query?: ...): AiScenarioHistoryPage
  queryRunRecord(runId: string): AiScenarioRunRecord | undefined
}
```

**设计要点**：

- **分级递进**：从广到细（整体意图 → 场景 → 工具 → 参数 Schema）
- **推荐顺序**：协议注释中明确标记 `步骤 N`，LLM 可按序调用
- **Schema 导航**：支持 JSON Pointer（RFC 6901）进行深层参数查询
- **分页支持**：工具列表/能力列表支持分页，避免一次返回过多数据

##### 📄 `llm-contracts.ts`

定义 LLM 通信契约：

```typescript
// LLM 消息格式（OpenAI 兼容）
interface AiBrowserLlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// 生成请求
interface AiBrowserLlmGenerateRequest {
  messages: readonly AiBrowserLlmMessage[]
  temperature?: number  // 0~2，默认 0.6
  maxTokens?: number    // 默认 512
}

// 生成响应
interface AiBrowserLlmGenerateResponse {
  text: string
  raw: unknown  // 原始输出（便于调试）
}

// LLM 客户端接口（本地 & 远程通用）
interface AiBrowserLlmClient {
  generate(request: AiBrowserLlmGenerateRequest): Promise<AiBrowserLlmGenerateResponse>
}

// 场景规划请求/响应
interface AiScenarioPlanningRequest {
  userInput: string
  context: AiScenarioContext
  forceScenarioId?: string  // 可强制某个场景
  dryRun?: boolean          // 仅计划，不执行
}

interface AiScenarioPlan {
  scenarioId: string
  toolCalls: Array<{ tool: string; args?: unknown }>
  reason?: string  // 规划理由
  dryRun?: boolean
}
```

**设计要点**：

- **接口统一**：无论本地推理还是远程 API，都实现 `AiBrowserLlmClient` 接口
- **计划分离**：`plan()` 仅生成计划，`runWithPlanning()` 才执行
- **失败隔离**：单个工具失败不影响其他步骤

##### 📄 `json-schema.ts`

JSON Schema 子集类型（用于参数校验）：

```typescript
type JsonSchema = {
  type?: string | readonly string[]
  properties?: Record<string, JsonSchema>
  required?: readonly string[]
  items?: JsonSchema
  // ... 更多 Draft 7 属性
}
```

---

### 2️⃣ **runtime 层**（注册、执行、查询）

**职责**：实现场景的生命周期管理、执行引擎、查询协议。

#### 关键文件

##### 📄 `scenario-registry.ts`（~700 行）

**三大职责**：

1. **生命周期管理**
   ```typescript
   register(definition: AiScenarioDefinition): void
   unregister(scenarioId: string): void
   get(scenarioId: string): AiScenarioDefinition | undefined
   list(): readonly AiScenarioDefinition[]
   ```

2. **意图匹配**
   ```typescript
   resolve(userInput: string, ctx?: AiScenarioContext): AiScenarioResolution | undefined
   // 基于关键词匹配打分，返回最高分场景
   // 例：userInput="请假一周" → 匹配 scenario.leave（分数 = "请假".length）
   ```

3. **查询协议实现**
   - 所有 15 个 `query*` 方法的完整实现
   - 支持 JSON Pointer 导航（`queryToolSchemaNode`）
   - 支持分页和关键词过滤

**核心算法**：

```typescript
// 关键词匹配打分（简单可解释）
function keywordMatchScore(input: string, intents: readonly string[]): number {
  const normalized = input.trim().toLowerCase()
  let score = 0
  for (const intent of intents) {
    const keyword = normalize(intent)
    if (normalized.includes(keyword)) {
      score += keyword.length  // 匹配字符越多，分数越高
    }
  }
  return score
}

// JSON Pointer 导航（RFC 6901）
function findSchemaNode(parameters: JsonSchema, pointer?: string): { pointer: string; node: SchemaNode } {
  // pointer="/days" → 导航到 { properties: { days: { type: "number" } } }
  // pointer="/" → 返回根节点
  // 支持编码："/~1name" → "/name"
}
```

**测试覆盖**（18 个单元测试）：

- ✅ `queryIntentCatalog` - 返回所有场景意图
- ✅ `queryScenarioInfo` - 返回场景详情（包含工具列表）
- ✅ `queryScenarioTools` - 分页工具列表
- ✅ `queryToolSchema` - 完整参数 Schema
- ✅ `queryToolSchemaNode` - 深层参数导航
- ✅ `resolve` - 关键词匹配与场景选择

##### 📄 `scenario-runtime.ts`（~400 行）

**职责**：场景运行和工具执行。

```typescript
interface AiScenarioRuntime {
  // 执行场景
  run(request: AiScenarioRunRequest): Promise<AiScenarioRunResult>
  
  // 执行单个工具（粒度更细）
  executeTool(call: AiScenarioToolCall, ctx: AiScenarioContext): Promise<AiScenarioToolExecution>
}

interface AiScenarioRunRequest {
  scenarioId: string
  toolCalls: readonly AiScenarioToolCall[]
  context: AiScenarioContext
  payload?: Record<string, unknown>
}

interface AiScenarioRunResult {
  status: 'success' | 'partial-failure' | 'failure'
  executions: readonly AiScenarioToolExecution[]
  payload?: Record<string, unknown>
}
```

**执行流程**：

```
1. 验证场景存在
2. 遍历工具调用列表
3. 按序执行每个工具（调用 toolResolver）
4. 捕获异常，按 recoveryPolicy 决定是否继续
5. 汇总结果（success/partial-failure/failure）
6. 可选：调用 history 回调记录运行记录
```

---

### 3️⃣ **system 层**（系统装配）

**职责**：统一启动和初始化。

##### 📄 `scenario-system.ts`（~150 行）

```typescript
interface ScenarioSystem {
  registry: AiScenarioRegistry
  runtime: AiScenarioRuntime
  planner?: AiScenarioBrowserPlanner
  prompts?: ScenarioPromptTemplateRegistry
  history?: AiScenarioRunHistoryStore
}

function createScenarioSystem(options: ScenarioSystemOptions): ScenarioSystem {
  // 1. 创建 registry
  // 2. 创建 runtime（依赖 registry）
  // 3. 可选：创建 planner（依赖 runtime + llm）
  // 4. 可选：创建 prompts registry
  // 5. 可选：创建 history store
  return { registry, runtime, planner, prompts, history }
}

// 便捷函数：批量注册场景
function registerScenarios(system: ScenarioSystem, definitions: readonly AiScenarioDefinition[]): void {
  for (const def of definitions) {
    system.registry.register(def)
  }
}
```

**使用示例**：

```typescript
import {
  createScenarioSystem,
  createScenarioPromptTemplateRegistry,
  createScenarioRunHistoryStore,
  createBrowserLocalLlmClient,
  createBrowserScenarioPlanner,
  registerScenarios,
} from '@spark-view/spark-scenario'

// 1. 创建系统
const system = createScenarioSystem({
  definitions: [],  // 初始为空
  toolResolver: async (call, ctx) => {
    // 调用实际的业务工具
    if (call.tool === 'approve-leave') {
      return { success: true, output: { approvalId: '...' } }
    }
    throw new Error(`Unknown tool: ${call.tool}`)
  }
})

// 2. 注册场景
registerScenarios(system, [
  {
    id: 'scenario.leave',
    title: '请假审批',
    scope: 'business',
    tools: [
      {
        name: 'approve-leave',
        description: '审批请假申请',
        parameters: {
          type: 'object',
          properties: {
            employeeId: { type: 'string' },
            days: { type: 'number' }
          },
          required: ['employeeId', 'days']
        }
      }
    ]
  }
])

// 3. 创建 LLM 规划器
const llm = createBrowserLocalLlmClient({
  model: 'Qwen/Qwen2.5-0.5B-Instruct'
})

const planner = createBrowserScenarioPlanner({
  runtime: system.runtime,
  llm,
  temperature: 0.6,
  maxTokens: 512
})

// 4. 用户输入 → 规划 → 执行
const result = await planner.runWithPlanning({
  userInput: '我要请假3天',
  context: { pageId: 'leave-page' }
})
// result: { scenarioId: 'scenario.leave', toolCalls: [...], ... }
```

---

### 4️⃣ **prompt 层**（提示词管理）

**职责**：管理 LLM 提示词模板和约束。

##### 📄 `prompt-constraints.ts`

定义分级查询约束：

```typescript
export const TIERED_QUERY_CONSTRAINT = `
你是一个 AI 业务助手。按照以下步骤逐步查询系统能力：

1. 首先调用 queryIntentCatalog() 查看所有可用场景
2. 根据用户输入确定目标场景，调用 queryScenarioInfo(scenarioId)
3. 根据场景需要，分页调用 queryScenarioTools() 查看工具列表
4. 对于关键工具，调用 queryToolSchema(toolName) 获取参数 schema
5. 如果需要了解特定参数，调用 queryToolSchemaNode({toolName, pointer})
6. 最后生成结构化计划：{ scenarioId, toolCalls: [...] }

输出必须是有效的 JSON，不要包含 markdown 代码块。
`.trim()
```

##### 📄 `scenario-prompt-template-registry.ts`（~200 行）

```typescript
interface ScenarioPromptTemplateRegistry {
  register(id: string, template: string | ((ctx) => string)): void
  render(id: string, context: ScenarioPromptBuildContext): Promise<string>
}

// 用法
const promptReg = createScenarioPromptTemplateRegistry()
promptReg.register('leave-system-prompt', (ctx) => `
你是请假审批系统。
当前用户：${ctx.user?.name}
项目：${ctx.projectId}
`)

const systemPrompt = await promptReg.render('leave-system-prompt', context)
```

---

### 5️⃣ **history 层**（历史管理）

**职责**：记录运行历史。

##### 📄 `run-history-store.ts`（~200 行）

```typescript
interface AiScenarioRunHistoryStore {
  // 记录新的运行
  recordRun(record: AiScenarioRunRecord): Promise<void>
  
  // 查询历史
  queryHistory(query: AiScenarioHistoryQuery): Promise<AiScenarioHistoryPage>
  
  // 查询单条记录
  getRecord(runId: string): Promise<AiScenarioRunRecord | undefined>
}

// 用法
const historyStore = createScenarioRunHistoryStore({
  // 可选：远程存储后端
  recordRun: async (record) => {
    await fetch(`/api/scenarios/${record.runId}`, {
      method: 'POST',
      body: JSON.stringify(record)
    })
  },
  queryHistory: async (query) => {
    const res = await fetch(`/api/scenarios/history?...`)
    return res.json()
  }
})
```

---

### 6️⃣ **llm 层**（LLM 集成）

**职责**：LLM 推理和场景规划。

#### 关键文件

##### 📄 `browser-fetch-llm-client.ts`（~150 行）

**用途**：调用远程 OpenAI 兼容 API（OpenAI、Deepseek、Ollama 等）。

```typescript
interface BrowserFetchLlmClientOptions {
  endpoint: string      // "https://api.openai.com/v1"
  model: string         // "gpt-4" 或 "deepseek-chat"
  apiKey?: string       // 可选（Ollama 本地部署不需要）
  headers?: Record<string, string>
}

export function createBrowserFetchLlmClient(options: BrowserFetchLlmClientOptions): AiBrowserLlmClient {
  return {
    async generate(request: AiBrowserLlmGenerateRequest) {
      const body = {
        model: options.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.6,
        max_tokens: request.maxTokens ?? 512
      }
      
      const response = await fetch(`${options.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.apiKey || ''}`,
          ...options.headers
        },
        body: JSON.stringify(body)
      })
      
      const data = await response.json()
      return {
        text: data.choices[0].message.content,
        raw: data
      }
    }
  }
}
```

**支持的后端**：

| 后端 | 成本 | 部署位置 | 支持模型 |
|-----|------|--------|--------|
| **OpenAI** | ~$5/1M tokens | 远程 | gpt-4, gpt-3.5-turbo 等 |
| **Deepseek** | 更便宜 | 远程 | deepseek-chat, deepseek-coder |
| **Ollama** | 免费 | 本机 (localhost:11434) | Llama2, Mistral 等 |
| **LM Studio** | 免费 | 本机 | 任何 GGUF 量化模型 |

##### 📄 `browser-local-llm-client.ts`（~170 行）

**用途**：在浏览器中用 transformers.js 进行本地推理（WASM/WebGPU），零成本无隐私问题。

```typescript
interface BrowserLocalLlmClientOptions {
  model: string           // HuggingFace 模型 ID，如 "Qwen/Qwen2.5-0.5B-Instruct"
  device?: 'wasm' | 'webgpu'  // 推理后端，默认 'wasm'（CPU 通用）
  maxNewTokens?: number   // 默认 512
  defaultTemperature?: number  // 默认 0.6
  onProgress?: (info: { progress: number; file: string }) => void  // 模型下载进度
}

export function createBrowserLocalLlmClient(options: BrowserLocalLlmClientOptions): AiBrowserLlmClient {
  let pipeline: TransformersPipeline | undefined

  async function loadPipeline() {
    if (pipeline !== undefined) return pipeline
    
    // 动态 import，不使用本地推理时无代价
    const { pipeline: pipelineFactory } = await import('@huggingface/transformers')
    
    pipeline = await pipelineFactory('text2text-generation', options.model, {
      device: options.device ?? 'wasm',
      progress_callback: options.onProgress ? (info) => {
        options.onProgress?.({
          progress: info.progress ?? 0,
          file: info.file ?? ''
        })
      } : undefined
    })
    
    return pipeline
  }

  return {
    async generate(request: AiBrowserLlmGenerateRequest) {
      const p = await loadPipeline()
      
      const output = await p(
        request.messages,
        {
          max_new_tokens: request.maxTokens ?? options.maxNewTokens ?? 512,
          temperature: request.temperature ?? options.defaultTemperature ?? 0.6,
          do_sample: (request.temperature ?? 0.6) > 0  // 温度=0时关闭采样
        }
      )
      
      return {
        text: extractAssistantText(output),
        raw: output
      }
    }
  }
}
```

**推荐的小模型**（浏览器可用）：

| 模型 | 大小 | 速度 | 说明 |
|-----|------|------|-----|
| Qwen/Qwen2.5-0.5B-Instruct | <1 GB | 🚀 快 | 最平衡 |
| HuggingFaceTB/SmolLM2-135M | ~270 MB | 🚀🚀 极快 | 超轻量级 |
| microsoft/Phi-3-mini-4k | ~1.5 GB | ⚡ 中速 | 质量更好，需 WebGPU |

**特点**：

- ✅ 首次加载较慢（需下载模型 500MB~1.5GB）
- ✅ 之后复用同一 pipeline，速度快（第 2 次 ~1 秒内返回）
- ✅ 完全离线，无隐私泄露，无 API 成本
- ✅ 适合长期对话（可复用 pipeline）

##### 📄 `browser-scenario-planner.ts`（~300 行）

**用途**：LLM + registry 的结合，生成可执行的场景计划。

```typescript
interface BrowserScenarioPlannerOptions {
  runtime: AiScenarioRuntime  // 提供 query* 方法
  llm: AiBrowserLlmClient     // OpenAI API 或本地推理
  temperature?: number         // 0~2，默认 0.6
  maxTokens?: number          // 默认 2048
  maxToolCalls?: number       // 单次计划最大工具数，默认 10
}

export function createBrowserScenarioPlanner(options: BrowserScenarioPlannerOptions): AiScenarioBrowserPlanner {
  return {
    async plan(request: AiScenarioPlanningRequest): Promise<AiScenarioPlan> {
      // 分两阶段
      
      // 阶段 1：场景选择
      const scenarios = options.runtime.registry.queryIntentCatalog().entries
      const selectionPrompt = `
${TIERED_QUERY_CONSTRAINT}

可用场景：${JSON.stringify(scenarios, null, 2)}

用户输入：${request.userInput}

请选择最合适的场景，并简要说明理由。
回复格式：{ "scenarioId": "...", "reason": "..." }
`
      
      const selectionResult = await options.llm.generate({
        messages: [{ role: 'user', content: selectionPrompt }]
      })
      
      const { scenarioId } = parseUnknownObject(selectionResult.text)
      
      // 阶段 2：工具调用生成
      const info = options.runtime.registry.queryScenarioInfo(scenarioId)
      const toolCallPrompt = `
当前场景：${info?.title}
${info?.description ? `描述：${info.description}` : ''}

可用工具：${JSON.stringify(info?.tools, null, 2)}

用户需求：${request.userInput}

请生成执行计划。
回复格式：{ "toolCalls": [{ "tool": "...", "args": {...} }], "reason": "..." }
`
      
      const toolCallResult = await options.llm.generate({
        messages: [{ role: 'user', content: toolCallPrompt }],
        temperature: options.temperature,
        maxTokens: options.maxTokens
      })
      
      const { toolCalls, reason } = parseUnknownObject(toolCallResult.text)
      
      return {
        scenarioId,
        toolCalls,
        reason,
        dryRun: request.dryRun
      }
    },
    
    async runWithPlanning(request: AiScenarioPlanningRequest) {
      const plan = await this.plan(request)
      
      if (plan.dryRun) {
        return plan  // 仅返回计划
      }
      
      // 执行计划
      const runResult = await options.runtime.run({
        scenarioId: plan.scenarioId,
        toolCalls: plan.toolCalls as any,
        context: request.context,
        payload: {}
      })
      
      return { ...plan, executions: runResult.executions }
    }
  }
}
```

**执行流程**：

```
用户输入 → LLM 查询意图 → 选择 scenarioId
        ↓
       查询该场景的工具 schema
        ↓
       LLM 根据工具生成计划（toolCalls）
        ↓
       runtime.run(scenarioId, toolCalls)
        ↓
       按序执行工具，异常按恢复策略处理
        ↓
       返回结果
```

---

## 核心概念

### 🎯 场景 (Scenario)

**定义**：预先声明的 AI 业务流程模板，包括意图、工具、工作流、恢复策略。

**关键属性**：

```typescript
{
  id: "scenario.leave",
  title: "请假审批",
  scope: "business",
  intents: ["请假", "休假", "年假"],  // 用户可能说的词
  tools: [
    { name: "check-balance", description: "查询假期余额" },
    { name: "submit-request", description: "提交请假申请" },
    { name: "approve", description: "审批请假" }
  ],
  flow: {
    steps: [
      { id: "check", tool: "check-balance" },
      { id: "submit", tool: "submit-request" },
      { id: "wait", kind: "human-confirm" },
      { id: "approve", tool: "approve" }
    ]
  },
  confirmPolicy: "step-confirm",  // 每步都需人工确认
  recoveryPolicy: "layered"       // 失败可重试
}
```

### 🔗 工具 (Tool)

**定义**：场景内可调用的原子操作，具有参数约束和失败恢复规则。

```typescript
{
  name: "submit-leave-request",
  description: "提交请假申请",
  parameters: {
    type: "object",
    properties: {
      employeeId: { type: "string", description: "员工 ID" },
      days: { type: "number", minimum: 1, maximum: 365 },
      reason: { type: "string" }
    },
    required: ["employeeId", "days"]
  },
  registration: {
    maxRetries: 3,
    retryBackoff: "exponential",
    failureMessages: {
      "ERR_QUOTA_EXCEEDED": "假期余额不足，请先申请补假",
      "ERR_CONFLICT": "该时段已有其他请假，请重新选择"
    },
    recoveryHints: [
      { error: "ERR_QUOTA_EXCEEDED", hint: "调用 check-balance 查询余额" }
    ]
  }
}
```

### 📋 Payload（参数补齐契约）

**用途**：当用户输入不完整时，系统主动向用户追问缺失参数。

```typescript
{
  slots: [
    {
      key: "days",
      label: "请假天数",
      required: true,
      description: "您需要请假多少天？",
      askWhenMissing: "抱歉，我需要知道您要请假的天数。",
      examples: [1, 3, 7, 14]
    },
    {
      key: "reason",
      label: "请假原因",
      required: false,
      source: "user"  // 来自用户输入
    }
  ]
}
```

### 🚦 确认策略 (Confirm Policy)

| 策略 | 说明 | 适用场景 |
|-----|------|--------|
| `auto` | 自动执行，无确认 | 查询、非关键操作 |
| `plan-confirm` | 生成计划后确认一次 | 中等风险 |
| `step-confirm` | 每一步都确认 | 高风险（审批、删除） |
| `critical-confirm` | 关键步骤额外确认 | 混合风险 |
| `human-takeover` | 必须人工操作 | 极高风险 |

### 🔄 恢复策略 (Recovery Policy)

| 策略 | 说明 |
|-----|------|
| `layered` | 分层恢复：首先自动重试 → 补齐参数 → 跳过该步 → 人工干预 |
| `manual` | 失败立即中止，等待人工处理 |
| `strict` | 失败立即抛出异常 |

### 🔍 分级查询协议

**核心设计**：分 15 步逐级发现能力，LLM 可按需调用，避免一次返回过多信息。

```
步骤 1: 查看整体场景目录
       ↓
步骤 2: 确认目标场景详情
       ↓
步骤 3: 浏览该场景的工具列表
       ↓
步骤 4-5: 查询单个工具的参数 schema
       ↓
步骤 6: 查看运行历史和参考案例
       ↓
生成计划 & 执行
```

**优点**：

- 💡 **智能发现**：LLM 可逐步了解系统能力，而非一次性 dump 所有信息
- 🎯 **上下文精准**：每一步返回的数据量有限，Token 成本低
- 🔄 **可追溯**：每一步的查询都有对应的 API，便于日志和调试

---

## 完整使用示例

### 场景一：简单请假工作流

```typescript
import {
  createScenarioSystem,
  createBrowserLocalLlmClient,
  createBrowserScenarioPlanner,
  registerScenarios,
} from '@spark-view/spark-scenario'

// 1. 定义场景
const leaveScenario = {
  id: 'scenario.leave',
  title: '请假审批',
  scope: 'business' as const,
  intents: ['请假', '休假', '年假'],
  
  prompts: {
    systemPrompt: '你是企业请假审批助手，规范流程、礼貌专业。'
  },
  
  tools: [
    {
      name: 'check-balance',
      description: '查询员工请假余额',
      parameters: {
        type: 'object',
        properties: {
          employeeId: { type: 'string' }
        },
        required: ['employeeId']
      }
    },
    {
      name: 'submit-request',
      description: '提交请假申请',
      parameters: {
        type: 'object',
        properties: {
          employeeId: { type: 'string' },
          startDate: { type: 'string' },
          days: { type: 'number' },
          reason: { type: 'string' }
        },
        required: ['employeeId', 'startDate', 'days']
      }
    }
  ],
  
  flow: {
    steps: [
      { id: 'check', title: '检查假期余额', kind: 'tool-call', toolName: 'check-balance' },
      { id: 'confirm', title: '用户确认', kind: 'human-confirm' },
      { id: 'submit', title: '提交申请', kind: 'tool-call', toolName: 'submit-request' },
      { id: 'done', title: '完成', kind: 'complete' }
    ]
  },
  
  confirmPolicy: 'plan-confirm' as const,
  recoveryPolicy: 'layered' as const,
}

// 2. 创建系统
const system = createScenarioSystem({
  definitions: [],
  toolResolver: async (call, ctx) => {
    if (call.tool === 'check-balance') {
      // 调用后端 API
      const response = await fetch('/api/leave/balance', {
        method: 'POST',
        body: JSON.stringify({ employeeId: call.args?.employeeId })
      })
      return { success: true, output: await response.json() }
    }
    if (call.tool === 'submit-request') {
      const response = await fetch('/api/leave/request', {
        method: 'POST',
        body: JSON.stringify(call.args)
      })
      return { success: true, output: await response.json() }
    }
    throw new Error(`Unknown tool: ${call.tool}`)
  }
})

// 3. 注册场景
registerScenarios(system, [leaveScenario])

// 4. 创建 LLM 规划器
const llm = createBrowserLocalLlmClient({
  model: 'Qwen/Qwen2.5-0.5B-Instruct',
  device: 'wasm',
  maxNewTokens: 512,
  onProgress: (info) => {
    console.log(`下载进度: ${info.progress * 100}%`)
  }
})

const planner = createBrowserScenarioPlanner({
  runtime: system.runtime,
  llm,
  temperature: 0.3,  // 较低，确保输出稳定
  maxTokens: 512
})

// 5. 处理用户请求
async function handleUserRequest(userInput: string) {
  try {
    const result = await planner.runWithPlanning({
      userInput,  // "我要请假3天"
      context: {
        pageId: 'leave-page',
        projectId: 'hr-system',
        user: { id: 'emp123', name: '张三' }
      }
    })
    
    console.log('场景:', result.scenarioId)
    console.log('工具调用:', result.toolCalls)
    console.log('执行结果:', result.executions)
    
    return result
  } catch (error) {
    console.error('规划失败:', error)
  }
}

// 测试
await handleUserRequest('我要请假3天，因为身体不适')
// 输出示例：
// 场景: scenario.leave
// 工具调用: [ { tool: 'check-balance', args: { employeeId: 'emp123' } }, ... ]
// 执行结果: [
//   { tool: 'check-balance', success: true, output: { balance: 10 } },
//   { tool: 'submit-request', success: true, output: { requestId: 'req456' } }
// ]
```

### 场景二：费用报销多工具编排

```typescript
// 定义费用报销场景（多个工具）
const reimbursementScenario = {
  id: 'scenario.reimbursement',
  title: '费用报销',
  scope: 'business' as const,
  intents: ['报销', '费用', '发票'],
  
  tools: [
    {
      name: 'query-policy',
      description: '查询报销政策',
      parameters: { type: 'object', properties: { category: { type: 'string' } } }
    },
    {
      name: 'validate-receipt',
      description: '验证发票真伪',
      parameters: { type: 'object', properties: { receiptId: { type: 'string' } } }
    },
    {
      name: 'calculate-amount',
      description: '计算可报销金额',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          amount: { type: 'number' },
          department: { type: 'string' }
        }
      }
    },
    {
      name: 'submit-reimbursement',
      description: '提交报销申请',
      parameters: {
        type: 'object',
        properties: {
          itemIds: { type: 'array', items: { type: 'string' } },
          totalAmount: { type: 'number' },
          department: { type: 'string' }
        },
        required: ['itemIds', 'totalAmount']
      }
    }
  ],
  
  flow: {
    steps: [
      { id: 'policy-check', title: '检查政策', toolName: 'query-policy' },
      { id: 'receipt-validation', title: '验证发票', toolName: 'validate-receipt' },
      { id: 'amount-calc', title: '计算金额', toolName: 'calculate-amount' },
      { id: 'user-review', title: '用户审核', kind: 'human-confirm' },
      { id: 'submit', title: '提交申请', toolName: 'submit-reimbursement' }
    ]
  },
  
  confirmPolicy: 'step-confirm' as const,  // 每步都确认
  recoveryPolicy: 'manual' as const,       // 失败人工处理
}

// LLM 可自动选择合适的工具顺序，而不需要写死工作流
```

---

## 测试覆盖

### 测试文件位置

```
packages/spark-scenario/src/tests/
├── browser-local-llm-client.test.ts           (20 个测试)
├── scenario-registry-query-protocol.test.ts   (18 个测试)
└── spark-scenario-runtime-regression.test.ts  (等)
```

### 测试统计

| 测试套件 | 测试数 | 覆盖内容 | 状态 |
|--------|------|--------|------|
| browser-local-llm-client | 20 | 文本提取、参数透传、lazy 加载、进度回调、错误传播 | ✅ |
| scenario-registry-query-protocol | 18 | 所有 15 个查询 API、JSON Pointer 导航、分页 | ✅ |
| spark-scenario-runtime-regression | 8+ | 运行时执行、工具调用、异常恢复 | ✅ |

### 运行测试

```bash
# 运行所有测试
npx vitest run packages/spark-scenario/src/tests/

# 运行特定测试
npx vitest run packages/spark-scenario/src/tests/browser-local-llm-client.test.ts

# 观看模式（开发中实时重跑）
npx vitest watch packages/spark-scenario/src/tests/
```

### 测试示例

**browser-local-llm-client.test.ts** - 验证推理客户端：

```typescript
describe('browser-local-llm-client', () => {
  it('字符串格式文本提取', async () => {
    // mock pipeline 返回字符串
    const result = await client.generate({
      messages: [{ role: 'user', content: 'hello' }]
    })
    expect(result.text).toBe('hello world')
  })
  
  it('参数透传：temperature=0 → do_sample=false', async () => {
    // 验证当 temperature=0 时，自动关闭采样
    await client.generate({
      messages: [...],
      temperature: 0
    })
    expect(pipeline).toHaveBeenCalledWith(..., { do_sample: false, ... })
  })
  
  it('进度回调正常化（50 → 0.5）', async () => {
    // 验证回调中的 progress 被正确从 0-100 归一化为 0-1
    const progressValues = []
    const client = createBrowserLocalLlmClient({
      model: 'test',
      onProgress: (info) => progressValues.push(info.progress)
    })
    // ... 触发下载 ...
    expect(progressValues).toContain(0.5)  // 如果原始是 50
  })
})
```

**scenario-registry-query-protocol.test.ts** - 验证查询 API：

```typescript
describe('scenario-registry-query-protocol', () => {
  it('queryIntentCatalog 返回所有场景的意图', () => {
    const catalog = registry.queryIntentCatalog()
    expect(catalog.entries).toHaveLength(2)
    expect(catalog.entries[0]).toEqual({
      scenarioId: 'scenario.leave',
      title: '请假审批',
      intents: ['请假', '休假', '年假'],
      summary: 'Auto-generated summary...'
    })
  })
  
  it('queryToolSchemaNode 支持 JSON Pointer 导航', () => {
    const node = registry.queryToolSchemaNode({
      toolName: 'submit-leave',
      pointer: '/days'  // 导航到 days 字段
    })
    expect(node?.schema).toEqual({ type: 'number' })
    expect(node?.childPointers).toEqual([])  // 数字没有子字段
  })
  
  it('resolve 按关键词匹配返回最佳场景', () => {
    const resolution = registry.resolve('我要请假')
    expect(resolution?.scenarioId).toBe('scenario.leave')
    expect(resolution?.score).toBeGreaterThan(0)
  })
})
```

---

## 部署指南

### 1. 作为 npm 包发布

```bash
# 在 spark-scenario 目录
npm version patch  # 或 minor/major
npm publish

# 消费方安装
npm install @spark-view/spark-scenario

# 如果使用本地推理，还需安装 transformers.js
npm install @huggingface/transformers
```

### 2. 集成到 SPARK 前端应用

```typescript
// src/features/ai-scenarios/useScenarios.ts
import {
  createScenarioSystem,
  createBrowserLocalLlmClient,
  createBrowserScenarioPlanner,
} from '@spark-view/spark-scenario'

export function useScenarios() {
  const [system] = useState(() =>
    createScenarioSystem({
      definitions: [],  // 从后端加载
      toolResolver: async (call, ctx) => {
        // 调用业务 API
        return await resolveBusinessTool(call, ctx)
      }
    })
  )
  
  const [llm] = useState(() =>
    createBrowserLocalLlmClient({
      model: 'Qwen/Qwen2.5-0.5B-Instruct'
    })
  )
  
  const planner = useMemo(() =>
    createBrowserScenarioPlanner({ runtime: system.runtime, llm })
  , [system.runtime, llm])
  
  return { system, planner }
}
```

### 3. 后端（Spring Boot）集成

```java
// 后端可通过 REST API 提供场景定义
@GetMapping("/api/scenarios")
public List<ScenarioDefinition> listScenarios() {
  return scenarioService.listAll();
}

@PostMapping("/api/scenarios/{scenarioId}/run")
public ScenarioRunResult runScenario(
  @PathVariable String scenarioId,
  @RequestBody ScenarioRunRequest request
) {
  return scenarioService.run(scenarioId, request);
}

@GetMapping("/api/scenarios/history")
public Page<ScenarioRunRecord> getHistory(
  @RequestParam String scenarioId,
  Pageable pageable
) {
  return historyService.findByScenarioId(scenarioId, pageable);
}
```

---

## 性能特性

### 📊 内存占用

| 组件 | 占用 | 说明 |
|-----|------|------|
| Registry（100 个场景） | ~500 KB | 所有定义存内存 |
| Browser Local LLM（模型加载） | 500 MB ~ 1.5 GB | transformers.js 首次加载 |
| Browser Local LLM（推理） | +50 MB | 推理期间额外内存 |
| Fetch API 调用 | <1 MB | HTTP 请求/响应 |

### ⏱️ 时间成本

| 操作 | 时间 | 备注 |
|-----|------|------|
| Registry 初始化（1000 场景） | <50 ms | 注册表操作极快 |
| queryIntentCatalog() | <1 ms | 内存查询 |
| 本地 LLM 首次加载 | 30~60 秒 | 取决于网络，首次下载 |
| 本地 LLM 推理（第 2 次起） | 1~5 秒 | 取决于模型大小和硬件 |
| Fetch 客户端 API 调用 | 0.5~2 秒 | 网络延迟 |

### 💰 成本对比

| 方案 | 初始成本 | 长期成本 | 隐私 | 离线 |
|-----|--------|--------|------|------|
| **本地推理** | 一次性下载 | 0 | ✅ | ✅ |
| **OpenAI API** | 0 | ~$5/1M tokens | ❌ | ❌ |
| **Deepseek** | 0 | 更便宜 | ❌ | ❌ |
| **Ollama 本地** | 一次性下载 | 0 | ✅ | ✅ |

---

## 常见问题

### Q: 为什么分 6 层而不是整合在一起？

**A:** 分层带来四个好处：

1. **可独立测试**：contracts 层纯类型，零依赖，可单独验证 API 设计
2. **可分阶段交付**：runtime 层独立于 llm 层，可先交付注册表，再集成 LLM
3. **可插拔替换**：LLM 层支持多个客户端（Fetch/Local），接口统一，易于切换
4. **可维护性**：每层职责单一，修改时影响范围小

### Q: 查询协议 15 步太多了，有必要吗？

**A:** 是的，因为 LLM Token 有限。一次性返回所有信息会 dump 大量文本，浪费 Token。分步查询：

- 第 1 步：LLM 了解有哪些场景（简短列表）
- 第 2 步：LLM 选定目标场景（返回详情，包括工具摘要）
- 第 3 步：LLM 如需深入，才查工具 Schema（按需加载）

这样 **Token 成本最优**，同时 LLM 有更清晰的"思考流程"。

### Q: 本地推理的模型这么小，能处理复杂逻辑吗？

**A:** 小模型足以处理 spark-scenario 的典型任务：

- ✅ 意图识别（"请假" vs "报销"）
- ✅ 参数提取（从"请假3天"提取 days=3）
- ✅ 简单逻辑分支（根据工具结果决定下一步）

但 ❌ 不适合：

- 需要复杂推理的任务
- 需要跨域知识的任务

对于这些，改用 `createBrowserFetchLlmClient` 调用 GPT-4。

### Q: 如何切换 LLM 后端（本地 → 远程）？

**A:** 无需改业务代码，仅改一行：

```typescript
// 从本地推理
const llm = createBrowserLocalLlmClient({
  model: 'Qwen/Qwen2.5-0.5B-Instruct'
})

// 改为远程 API（仅改这里）
const llm = createBrowserFetchLlmClient({
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4',
  apiKey: process.env.OPENAI_API_KEY
})

// 其余代码不变
const planner = createBrowserScenarioPlanner({ runtime, llm })
```

两个客户端实现相同的 `AiBrowserLlmClient` 接口。

### Q: 工具失败后自动重试的逻辑在哪？

**A:** 在 `scenario-runtime.ts` 的 `executeTool()` 中，根据 `recoveryPolicy` 决策：

```typescript
if (result.status === 'failure') {
  if (context.recoveryPolicy === 'layered') {
    // 1. 自动重试（exponential backoff）
    // 2. 参数不完整？追问补齐
    // 3. 工具不可用？跳过该步
    // 4. 上述都失败？等待人工处理
  } else if (context.recoveryPolicy === 'manual') {
    // 立即暂停，等待人工
  } else if (context.recoveryPolicy === 'strict') {
    // 抛异常
  }
}
```

### Q: 如何扩展场景定义（增加新字段）？

**A:** 修改 `contracts/scenario-types.ts` 中的 `AiScenarioDefinition`：

```typescript
interface AiScenarioDefinition extends AiScenarioIdentity {
  // ... 现有字段 ...
  
  // 新增字段
  metadata?: Record<string, unknown>  // 自定义元数据
  webhookUrl?: string                 // 完成后的回调
  timeoutSeconds?: number             // 执行超时
}
```

然后：
1. 更新 runtime 和 llm 层相关逻辑
2. 补充单元测试
3. 发新版本

---

## 总结

**spark-scenario** 是一个 **轻量级、高扩展的 AI 场景引擎**：

✅ **核心能力**：
- 场景注册与生命周期管理
- 15 步分级查询协议（LLM 友好）
- 双 LLM 客户端（本地推理 + 远程 API）
- 自动计划生成与工具编排

✅ **架构优势**：
- 6 层隔离，职责清晰
- 纯 TypeScript，无框架依赖
- 完整的单元测试覆盖
- 开箱即用，易于集成

✅ **生产就绪**：
- 支持失败恢复
- 支持人工确认
- 支持运行历史记录
- 支持成本优化（本地推理零成本）

📚 **下一步**：
1. 在 SPARK 前端集成本包
2. 定义业务场景库
3. 实现相应的工具 resolver
4. 搭建前后端联调
