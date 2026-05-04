# spark-scenario API 参考

## 目录

- [导出概览](#导出概览)
- [核心 API](#核心-api)
- [类型定义](#类型定义)
- [工作流示例](#工作流示例)

---

## 导出概览

```typescript
import {
  // ===== contracts 层（纯类型）=====
  createScenarioRegistry,      // 场景注册中心
  createScenarioRuntime,       // 场景运行时
  
  // ===== system 层（装配）=====
  createScenarioSystem,        // 统一启动
  registerScenarios,           // 批量注册
  
  // ===== prompt 层（提示词）=====
  createScenarioPromptTemplateRegistry,
  
  // ===== history 层（历史）=====
  createScenarioRunHistoryStore,
  
  // ===== llm 层（推理）=====
  createBrowserFetchLlmClient,      // HTTP 客户端
  createBrowserLocalLlmClient,      // 本地推理
  createBrowserScenarioPlanner,     // LLM 规划器
  
  // ===== 类型定义 =====
  type AiScenarioDefinition,
  type AiScenarioContext,
  type AiScenarioQueryProtocol,
  type AiBrowserLlmClient,
  // ... 其他类型
} from '@spark-view/spark-scenario'
```

---

## 核心 API

### 1️⃣ createScenarioRegistry()

**职责**：创建场景注册中心，管理生命周期 + 提供查询协议。

**签名**：

```typescript
function createScenarioRegistry(
  options: AiScenarioRegistryOptions
): AiScenarioRegistry
```

**参数**：

```typescript
interface AiScenarioRegistryOptions {
  definitions?: readonly AiScenarioDefinition[]  // 初始场景列表
  queryRunHistory?: (query: AiScenarioHistoryQuery) => AiScenarioHistoryPage
  queryRunRecord?: (runId: string) => AiScenarioRunRecord | undefined
}
```

**返回值**：

```typescript
interface AiScenarioRegistry {
  // 生命周期
  register(def: AiScenarioDefinition): void
  unregister(scenarioId: string): void
  get(scenarioId: string): AiScenarioDefinition | undefined
  list(): readonly AiScenarioDefinition[]
  clear(): void
  
  // 匹配
  resolve(input: string, ctx?: AiScenarioContext): AiScenarioResolution | undefined
  
  // 查询协议（15 个方法）
  queryIntentCatalog(): AiIntentCatalog
  queryScenarioInfo(scenarioId: string): AiScenarioInfo | undefined
  queryScenarioCapabilities(query?: AiScenarioCapabilitiesQuery): AiScenarioCapabilitiesPage
  queryScenarioPayload(scenarioId: string): AiScenarioPayloadInfo | undefined
  queryScenarioFlow(scenarioId: string): AiScenarioFlowInfo | undefined
  queryScenarioCompletion(scenarioId: string): AiScenarioCompletionInfo | undefined
  queryScenarioRecovery(scenarioId: string): AiScenarioRecoveryInfo | undefined
  queryScenarioTools(query?: AiScenarioToolsQuery): AiScenarioToolsPage
  queryToolSchema(toolName: string, scenarioId?: string): AiToolSchemaInfo | undefined
  queryToolSchemaNode(query: AiToolSchemaNodeQuery): AiToolSchemaNodeInfo | undefined
  queryToolRegistration(toolName: string, scenarioId?: string): AiToolRegistrationInfo | undefined
  queryRunHistory(query?: AiScenarioHistoryQuery): AiScenarioHistoryPage
  queryRunRecord(runId: string): AiScenarioRunRecord | undefined
}
```

**使用示例**：

```typescript
const registry = createScenarioRegistry({
  definitions: [
    {
      id: 'scenario.leave',
      title: '请假审批',
      scope: 'business',
      tools: [...]
    }
  ]
})

// 注册新场景
registry.register({
  id: 'scenario.expense',
  // ...
})

// 查询
const catalog = registry.queryIntentCatalog()
const info = registry.queryScenarioInfo('scenario.leave')

// 匹配用户输入到最佳场景
const resolution = registry.resolve('请假3天')
console.log(resolution?.scenarioId)  // 'scenario.leave'
```

---

### 2️⃣ createScenarioRuntime()

**职责**：执行场景和工具调用。

**签名**：

```typescript
function createScenarioRuntime(
  options: AiScenarioRuntimeOptions
): AiScenarioRuntime
```

**参数**：

```typescript
interface AiScenarioRuntimeOptions {
  registry: AiScenarioRegistry  // 场景注册表
  
  // 工具解析器（必须）
  toolResolver: (
    call: AiScenarioToolCall,
    context: AiScenarioContext
  ) => Promise<AiScenarioToolExecution>
  
  // 可选：执行历史回调
  onExecute?: (execution: AiScenarioToolExecution) => void | Promise<void>
  onScenarioComplete?: (result: AiScenarioRunResult) => void | Promise<void>
}
```

**返回值**：

```typescript
interface AiScenarioRuntime {
  registry: AiScenarioRegistry
  
  run(request: AiScenarioRunRequest): Promise<AiScenarioRunResult>
  executeTool(call: AiScenarioToolCall, ctx: AiScenarioContext): Promise<AiScenarioToolExecution>
}
```

**使用示例**：

```typescript
const runtime = createScenarioRuntime({
  registry,
  
  toolResolver: async (call, ctx) => {
    // 调用实际业务工具
    console.log(`执行工具: ${call.tool}`)
    console.log(`参数:`, call.args)
    
    // 例：调用后端 API
    const response = await fetch(`/api/tools/${call.tool}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(call.args)
    })
    
    if (!response.ok) {
      return {
        tool: call.tool,
        success: false,
        error: `HTTP ${response.status}`,
        errorCode: 'TOOL_HTTP_ERROR'
      }
    }
    
    const output = await response.json()
    return {
      tool: call.tool,
      success: true,
      output
    }
  },
  
  onExecute: async (execution) => {
    console.log(`[${execution.tool}] ${execution.success ? '成功' : '失败'}`)
  }
})

// 执行场景
const result = await runtime.run({
  scenarioId: 'scenario.leave',
  toolCalls: [
    { tool: 'check-balance', args: { employeeId: 'emp123' } },
    { tool: 'submit-request', args: { days: 3 } }
  ],
  context: { pageId: 'leave-page', user: { id: 'emp123' } }
})

console.log(result.status)        // 'success' | 'partial-failure' | 'failure'
console.log(result.executions)    // 每个工具的执行结果
```

---

### 3️⃣ createScenarioSystem()

**职责**：统一装配所有组件（registry + runtime + llm + etc）。

**签名**：

```typescript
function createScenarioSystem(
  options: ScenarioSystemOptions
): ScenarioSystem
```

**参数**：

```typescript
interface ScenarioSystemOptions {
  definitions?: readonly AiScenarioDefinition[]
  toolResolver: (call: AiScenarioToolCall, ctx: AiScenarioContext) => Promise<AiScenarioToolExecution>
  onExecute?: (execution: AiScenarioToolExecution) => void | Promise<void>
  onScenarioComplete?: (result: AiScenarioRunResult) => void | Promise<void>
}
```

**返回值**：

```typescript
interface ScenarioSystem {
  registry: AiScenarioRegistry
  runtime: AiScenarioRuntime
  prompts?: ScenarioPromptTemplateRegistry
  history?: AiScenarioRunHistoryStore
  planner?: AiScenarioBrowserPlanner  // 可选
}
```

**使用示例**：

```typescript
const system = createScenarioSystem({
  definitions: [], // 后续动态加载或注册
  
  toolResolver: async (call, ctx) => {
    // 工具实现
    if (call.tool === 'approve') {
      return { tool: 'approve', success: true, output: { approvalId: '...' } }
    }
    throw new Error(`未知工具: ${call.tool}`)
  },
  
  onExecute: async (exec) => {
    // 可用于日志、监控、UI 更新
    if (!exec.success) {
      console.warn(`工具 ${exec.tool} 执行失败: ${exec.error}`)
    }
  }
})

// 注册场景
registerScenarios(system, [
  {
    id: 'scenario.leave',
    // ...
  }
])

// 执行
const result = await system.runtime.run({
  scenarioId: 'scenario.leave',
  toolCalls: [...],
  context: {...}
})
```

---

### 4️⃣ createBrowserFetchLlmClient()

**职责**：调用远程 OpenAI 兼容 API。

**签名**：

```typescript
function createBrowserFetchLlmClient(
  options: BrowserFetchLlmClientOptions
): AiBrowserLlmClient
```

**参数**：

```typescript
interface BrowserFetchLlmClientOptions {
  endpoint: string                    // API 基础 URL
  model: string                       // 模型名称
  apiKey?: string                     // 可选（本地 Ollama 不需要）
  headers?: Record<string, string>    // 自定义请求头
}
```

**返回值**：

```typescript
interface AiBrowserLlmClient {
  generate(request: AiBrowserLlmGenerateRequest): Promise<AiBrowserLlmGenerateResponse>
}
```

**使用示例**：

```typescript
// OpenAI
const openaiClient = createBrowserFetchLlmClient({
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4',
  apiKey: process.env.OPENAI_API_KEY
})

// Deepseek
const deepseekClient = createBrowserFetchLlmClient({
  endpoint: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY
})

// 本地 Ollama（localhost:11434）
const ollamaClient = createBrowserFetchLlmClient({
  endpoint: 'http://localhost:11434/v1',
  model: 'llama2'
  // apiKey 省略
})

// 调用
const response = await openaiClient.generate({
  messages: [
    { role: 'system', content: '你是一个助手' },
    { role: 'user', content: '请假3天' }
  ],
  temperature: 0.7,
  maxTokens: 512
})

console.log(response.text)  // 模型输出
console.log(response.raw)   // 原始 API 响应
```

---

### 5️⃣ createBrowserLocalLlmClient()

**职责**：在浏览器本地进行 LLM 推理（WASM/WebGPU）。

**签名**：

```typescript
function createBrowserLocalLlmClient(
  options: BrowserLocalLlmClientOptions
): AiBrowserLlmClient
```

**参数**：

```typescript
interface BrowserLocalLlmClientOptions {
  model: string                    // HuggingFace 模型 ID
  device?: 'wasm' | 'webgpu'      // 推理后端，默认 'wasm'
  maxNewTokens?: number            // 默认 512
  defaultTemperature?: number      // 默认 0.6
  onProgress?: (info: {            // 下载进度回调
    progress: number               // 0~1
    file: string                   // 当前文件名
  }) => void
}
```

**返回值**：

```typescript
interface AiBrowserLlmClient {
  generate(request: AiBrowserLlmGenerateRequest): Promise<AiBrowserLlmGenerateResponse>
}
```

**推荐模型**：

| 模型 | 大小 | 用途 |
|-----|------|------|
| Qwen/Qwen2.5-0.5B-Instruct | <1 GB | **推荐**，通用场景 |
| HuggingFaceTB/SmolLM2-135M | ~270 MB | 超轻量，简单场景 |
| microsoft/Phi-3-mini-4k | ~1.5 GB | 更强能力，需 WebGPU |

**使用示例**：

```typescript
const localClient = createBrowserLocalLlmClient({
  model: 'Qwen/Qwen2.5-0.5B-Instruct',
  device: 'wasm',
  maxNewTokens: 512,
  defaultTemperature: 0.6,
  
  onProgress: (info) => {
    console.log(`下载 ${info.file}: ${(info.progress * 100).toFixed(1)}%`)
  }
})

// 首次调用较慢（下载 + 初始化），后续快速
console.time('生成')
const response = await localClient.generate({
  messages: [
    { role: 'system', content: '你是请假助手' },
    { role: 'user', content: '我要请假3天' }
  ],
  temperature: 0.3  // 低温度，确保输出稳定
})
console.timeEnd('生成')  // 首次 ~30s，之后 ~1-3s

console.log(response.text)
```

---

### 6️⃣ createBrowserScenarioPlanner()

**职责**：LLM + Registry 结合，生成可执行的场景计划。

**签名**：

```typescript
function createBrowserScenarioPlanner(
  options: BrowserScenarioPlannerOptions
): AiScenarioBrowserPlanner
```

**参数**：

```typescript
interface BrowserScenarioPlannerOptions {
  runtime: AiScenarioRuntime
  llm: AiBrowserLlmClient
  temperature?: number      // 默认 0.6
  maxTokens?: number        // 默认 2048
  maxToolCalls?: number     // 单次计划最大工具数，默认 10
}
```

**返回值**：

```typescript
interface AiScenarioBrowserPlanner {
  plan(request: AiScenarioPlanningRequest): Promise<AiScenarioPlan>
  runWithPlanning(request: AiScenarioPlanningRequest): Promise<AiScenarioPlan>
}
```

**使用示例**：

```typescript
const planner = createBrowserScenarioPlanner({
  runtime: system.runtime,
  llm: openaiClient,  // 或 localClient
  temperature: 0.3,
  maxTokens: 512
})

// 仅生成计划，不执行
const plan = await planner.plan({
  userInput: '我要请假3天',
  context: {
    pageId: 'leave-page',
    projectId: 'hr-system',
    user: { id: 'emp123', name: '张三' }
  }
})

console.log(plan.scenarioId)    // 'scenario.leave'
console.log(plan.toolCalls)     // [{ tool: '...', args: {...} }, ...]
console.log(plan.reason)        // LLM 生成的推理文本

// 直接执行（先规划后执行）
const result = await planner.runWithPlanning({
  userInput: '我要请假3天',
  context: {...},
  dryRun: false  // false=执行，true=仅计划
})

console.log(result.executions)  // 每个工具的执行结果
```

---

### 7️⃣ createScenarioPromptTemplateRegistry()

**职责**：管理提示词模板。

**签名**：

```typescript
function createScenarioPromptTemplateRegistry(): ScenarioPromptTemplateRegistry
```

**返回值**：

```typescript
interface ScenarioPromptTemplateRegistry {
  register(
    id: string,
    template: string | ((ctx: ScenarioPromptBuildContext) => string)
  ): void
  
  render(id: string, context: ScenarioPromptBuildContext): Promise<string>
}
```

**使用示例**：

```typescript
const promptReg = createScenarioPromptTemplateRegistry()

// 静态模板
promptReg.register('system-leave', `
你是企业请假审批助手。
- 规范流程，礼貌专业
- 严格按照政策处理
- 如遇异常，请升级人工
`)

// 动态模板
promptReg.register('user-context', (ctx) => `
当前用户：${ctx.user?.name} (${ctx.user?.id})
部门：${ctx.context?.metadata?.department}
项目：${ctx.context?.projectId}

请根据上述背景信息处理请求。
`)

// 渲染
const systemPrompt = await promptReg.render('system-leave', {})
const userPrompt = await promptReg.render('user-context', {
  user: { id: 'emp123', name: '张三' },
  context: { projectId: 'hr', metadata: { department: '人力资源' } }
})
```

---

### 8️⃣ createScenarioRunHistoryStore()

**职责**：记录和查询场景运行历史。

**签名**：

```typescript
function createScenarioRunHistoryStore(
  options: AiScenarioRunHistoryStore
): AiScenarioRunHistoryStore
```

**返回值**：

```typescript
interface AiScenarioRunHistoryStore {
  recordRun(record: AiScenarioRunRecord): Promise<void>
  queryHistory(query: AiScenarioHistoryQuery): Promise<AiScenarioHistoryPage>
  getRecord(runId: string): Promise<AiScenarioRunRecord | undefined>
}
```

**使用示例**：

```typescript
const historyStore = createScenarioRunHistoryStore({
  recordRun: async (record) => {
    // 保存到后端或本地存储
    await fetch('/api/scenarios/history', {
      method: 'POST',
      body: JSON.stringify(record)
    })
  },
  
  queryHistory: async (query) => {
    // 从后端查询历史
    const res = await fetch(`/api/scenarios/history?scenarioId=${query.scenarioId}&limit=20`)
    return res.json()
  },
  
  getRecord: async (runId) => {
    const res = await fetch(`/api/scenarios/history/${runId}`)
    return res.ok ? res.json() : undefined
  }
})

// 使用
const historyPage = await historyStore.queryHistory({
  scenarioId: 'scenario.leave',
  limit: 10,
  offset: 0
})

const record = await historyStore.getRecord('run-123')
```

---

## 类型定义

### AiScenarioDefinition

```typescript
interface AiScenarioDefinition extends AiScenarioIdentity {
  description?: string
  
  // 提示词
  prompts: AiScenarioPromptPolicy
  
  // 工具列表
  tools: readonly AiScenarioTool[]
  
  // 工作流
  flow?: AiScenarioFlowContract
  
  // 政策
  confirmPolicy?: AiConfirmPolicy
  recoveryPolicy?: AiRecoveryPolicy
  
  // 工具注册规则
  toolRegistrations?: Record<string, AiScenarioToolRegistration>
  
  // 补齐参数
  payload?: AiScenarioPayloadContract
  
  // 完成合约
  completion?: AiScenarioCompletionContract
}
```

### AiScenarioContext

```typescript
interface AiScenarioContext {
  userInput: string
  pageId?: string
  projectId?: string
  moduleId?: string
  route?: string
  user?: {
    id?: string
    name?: string
    role?: string
  }
  metadata?: Record<string, unknown>
}
```

### AiBrowserLlmGenerateRequest

```typescript
interface AiBrowserLlmGenerateRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  temperature?: number    // 0~2，默认 0.6
  maxTokens?: number      // 默认 512
}
```

### AiBrowserLlmGenerateResponse

```typescript
interface AiBrowserLlmGenerateResponse {
  text: string           // 模型输出文本
  raw: unknown          // 原始响应对象（用于调试）
}
```

### AiScenarioPlanningRequest

```typescript
interface AiScenarioPlanningRequest {
  userInput: string
  context: AiScenarioContext
  forceScenarioId?: string  // 可强制某个场景
  dryRun?: boolean          // true=仅计划，false=执行
}
```

### AiScenarioPlan

```typescript
interface AiScenarioPlan {
  scenarioId: string
  toolCalls: Array<{
    tool: string
    args?: unknown
  }>
  reason?: string       // LLM 的推理过程
  dryRun?: boolean
  executions?: Array<any>  // runWithPlanning 时包含
}
```

---

## 工作流示例

### 完整端到端流程

```typescript
import {
  createScenarioSystem,
  createBrowserLocalLlmClient,
  createBrowserScenarioPlanner,
  registerScenarios,
} from '@spark-view/spark-scenario'

// 1️⃣ 定义场景
const scenarios = [
  {
    id: 'scenario.leave',
    title: '请假审批',
    scope: 'business' as const,
    intents: ['请假', '休假'],
    prompts: {
      systemPrompt: '你是请假助手...'
    },
    tools: [
      {
        name: 'check-balance',
        description: '查询假期余额',
        parameters: {
          type: 'object' as const,
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
          type: 'object' as const,
          properties: {
            employeeId: { type: 'string' },
            days: { type: 'number' },
            reason: { type: 'string' }
          },
          required: ['employeeId', 'days']
        }
      }
    ],
    flow: {
      steps: [
        { id: 'check', title: '检查余额', kind: 'tool-call' as const, toolName: 'check-balance' },
        { id: 'submit', title: '提交申请', kind: 'tool-call' as const, toolName: 'submit-request' }
      ]
    }
  }
]

// 2️⃣ 创建系统
const system = createScenarioSystem({
  definitions: scenarios,
  
  toolResolver: async (call, ctx) => {
    console.log(`执行工具: ${call.tool}`, call.args)
    
    if (call.tool === 'check-balance') {
      // 模拟调用后端 API
      return {
        tool: 'check-balance',
        success: true,
        output: { balance: 10, unit: 'days' }
      }
    }
    
    if (call.tool === 'submit-request') {
      return {
        tool: 'submit-request',
        success: true,
        output: { requestId: 'req-' + Date.now(), status: 'pending' }
      }
    }
    
    return {
      tool: call.tool,
      success: false,
      error: '未知工具',
      errorCode: 'UNKNOWN_TOOL'
    }
  }
})

// 3️⃣ 创建 LLM 客户端
const llm = createBrowserLocalLlmClient({
  model: 'Qwen/Qwen2.5-0.5B-Instruct',
  device: 'wasm',
  onProgress: (info) => {
    console.log(`模型下载: ${(info.progress * 100).toFixed(1)}%`)
  }
})

// 4️⃣ 创建规划器
const planner = createBrowserScenarioPlanner({
  runtime: system.runtime,
  llm,
  temperature: 0.3,
  maxTokens: 512
})

// 5️⃣ 处理用户请求
async function main() {
  console.log('=== 用户说：我要请假3天 ===')
  
  const result = await planner.runWithPlanning({
    userInput: '我要请假3天，因为需要休息',
    context: {
      pageId: 'leave-page',
      projectId: 'hr-system',
      user: { id: 'emp001', name: '张三', role: 'employee' }
    }
  })
  
  console.log('\n✅ 规划结果')
  console.log('场景:', result.scenarioId)
  console.log('工具调用:', result.toolCalls.map(t => t.tool))
  console.log('推理:', result.reason)
  
  console.log('\n✅ 执行结果')
  if (result.executions) {
    for (const exec of result.executions) {
      console.log(`${exec.tool}: ${exec.success ? '✓' : '✗'} `, exec.output || exec.error)
    }
  }
}

main().catch(console.error)
```

**预期输出**：

```
=== 用户说：我要请假3天 ===
模型下载: 100%

✅ 规划结果
场景: scenario.leave
工具调用: ['check-balance', 'submit-request']
推理: 用户要请3天假，首先检查余额确保足够，然后提交请假申请。

✅ 执行结果
check-balance: ✓ { balance: 10, unit: 'days' }
submit-request: ✓ { requestId: 'req-1704067200000', status: 'pending' }
```

---

**更多文档**：查看 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解设计细节和最佳实践。
