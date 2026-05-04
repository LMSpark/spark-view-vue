# spark-scenario - 快速开始

**spark-scenario** 是一个纯 TypeScript 的 AI 场景编程引擎，用于声明式地定义和执行 AI 业务流程。

## 📦 安装

```bash
npm install @spark-view/spark-scenario

# 如果使用本地推理，还需安装 transformers.js
npm install @huggingface/transformers
```

## ⚡ 最小示例（30 秒）

```typescript
import {
  createScenarioSystem,
  createBrowserFetchLlmClient,
  createBrowserScenarioPlanner,
} from '@spark-view/spark-scenario'

// 1. 创建系统
const system = createScenarioSystem({
  toolResolver: async (call) => ({
    tool: call.tool,
    success: true,
    output: { result: 'ok' }
  })
})

// 2. 注册场景
system.registry.register({
  id: 'scenario.leave',
  title: '请假',
  scope: 'business',
  tools: [
    {
      name: 'approve',
      description: '审批请假',
      parameters: {
        type: 'object',
        properties: { days: { type: 'number' } },
        required: ['days']
      }
    }
  ]
})

// 3. 创建 LLM 客户端
const llm = createBrowserFetchLlmClient({
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4',
  apiKey: process.env.OPENAI_API_KEY
})

// 4. 创建规划器
const planner = createBrowserScenarioPlanner({ runtime: system.runtime, llm })

// 5. 执行
const result = await planner.runWithPlanning({
  userInput: '我要请假3天',
  context: { user: { id: 'user1' } }
})

console.log(result.scenarioId)    // 'scenario.leave'
console.log(result.toolCalls)     // [{ tool: 'approve', args: { days: 3 } }]
```

## 🏗️ 项目结构

```
packages/spark-scenario/
├── ARCHITECTURE.md            ← 深度架构设计（6 层）
├── API_REFERENCE.md           ← API 详细参考
├── src/
│   ├── contracts/             ← 纯类型定义
│   │   ├── scenario-types.ts  ← 场景类型
│   │   ├── query-protocol.ts  ← 15 步查询协议
│   │   └── llm-contracts.ts   ← LLM 通信契约
│   │
│   ├── runtime/               ← 执行引擎
│   │   ├── scenario-registry.ts  ← 场景注册中心
│   │   └── scenario-runtime.ts   ← 执行引擎
│   │
│   ├── system/                ← 装配层
│   │   └── scenario-system.ts
│   │
│   ├── llm/                   ← LLM 集成
│   │   ├── browser-fetch-llm-client.ts       ← HTTP 客户端
│   │   ├── browser-local-llm-client.ts       ← 本地推理
│   │   └── browser-scenario-planner.ts       ← 规划器
│   │
│   ├── prompt/                ← 提示词管理
│   ├── history/               ← 历史记录
│   ├── tests/                 ← 38 个单元测试
│   └── index.ts               ← 导出
│
├── package.json
└── vitest.config.ts
```

## 🎯 核心概念（3 分钟）

### 1. 场景 (Scenario)

预先声明的 AI 业务流程模板：

```typescript
{
  id: 'scenario.leave',           // 唯一标识
  title: '请假审批',               // 用户友好名称
  scope: 'business',               // 归类
  intents: ['请假', '休假'],       // 用户可能说的词
  tools: [                          // 该场景能调用的工具
    { name: 'check-balance', ... },
    { name: 'submit-request', ... }
  ],
  flow: { steps: [...] },          // 工作流
  confirmPolicy: 'step-confirm',   // 每步需确认
  recoveryPolicy: 'layered'        // 失败可重试
}
```

### 2. 工具 (Tool)

可被 LLM 调用的原子操作：

```typescript
{
  name: 'submit-request',
  description: '提交请假申请',
  parameters: {
    type: 'object',
    properties: {
      employeeId: { type: 'string' },
      days: { type: 'number' }
    },
    required: ['employeeId', 'days']
  }
}
```

### 3. LLM 客户端

两种实现，接口相同：

| 客户端 | 优点 | 成本 | 用途 |
|--------|------|------|------|
| **Fetch** | 质量高，支持细微调整 | $5/1M tokens | 生产场景 |
| **Local** | 零成本，无隐私泄露 | 首次下载 500MB | 离线场景 |

## 🚀 完整工作流

```
┌──────────────────┐
│  用户输入        │  "我要请假3天"
└────────┬─────────┘
         │
         ↓
┌──────────────────────────────────┐
│ 1. LLM 查询意图目录               │  queryIntentCatalog()
│ 2. 确定目标场景 scenario.leave    │  queryScenarioInfo()
│ 3. 查询该场景的工具               │  queryScenarioTools()
│ 4. 查询工具参数 schema            │  queryToolSchema()
│ 5. 生成工具调用计划               │  [{ tool: 'check-balance' }, ...]
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│  Runtime 执行工具调用             │
│  • check-balance → 余额充足 ✓    │
│  • submit-request → 申请成功 ✓   │
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────┐
│  返回结果        │  { scenarioId, executions, ... }
└──────────────────┘
```

## 💡 常见用法

### 用法 1：简单查询

```typescript
// 仅查询，不执行
const catalog = system.registry.queryIntentCatalog()
const scenarios = catalog.entries
// [
//   { scenarioId: 'scenario.leave', title: '请假审批', intents: [...], summary: '...' },
//   { scenarioId: 'scenario.expense', title: '费用报销', intents: [...], summary: '...' }
// ]
```

### 用法 2：手动规划（干运行）

```typescript
// 生成计划但不执行
const plan = await planner.plan({
  userInput: '我要请假3天',
  context: { user: { id: 'emp1' } },
  dryRun: true  // ← 仅计划
})

console.log(plan.toolCalls)  // [{ tool: 'approve', args: { days: 3 } }]
console.log(plan.reason)     // "用户需要请3天假..."
```

### 用法 3：完整执行

```typescript
// 规划 + 执行
const result = await planner.runWithPlanning({
  userInput: '我要请假3天',
  context: { user: { id: 'emp1' } }
  // dryRun 省略或为 false
})

console.log(result.executions)  // 每个工具的执行结果
```

### 用法 4：自定义工具解析器

```typescript
const system = createScenarioSystem({
  toolResolver: async (call, ctx) => {
    // 在这里调用业务逻辑
    
    if (call.tool === 'check-balance') {
      const balance = await getLeaveBalance(ctx.user?.id!)
      return {
        tool: 'check-balance',
        success: true,
        output: { balance }
      }
    }
    
    if (call.tool === 'submit-request') {
      const requestId = await submitLeaveRequest(call.args)
      return {
        tool: 'submit-request',
        success: true,
        output: { requestId, status: 'pending' }
      }
    }
    
    return {
      tool: call.tool,
      success: false,
      error: `Unknown tool: ${call.tool}`,
      errorCode: 'UNKNOWN_TOOL'
    }
  }
})
```

### 用法 5：选择 LLM 后端

```typescript
// ✅ 本地推理（无成本）
const localLlm = createBrowserLocalLlmClient({
  model: 'Qwen/Qwen2.5-0.5B-Instruct',
  device: 'wasm'  // CPU 通用
})

// ✅ OpenAI API（质量高）
const openaiLlm = createBrowserFetchLlmClient({
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4',
  apiKey: process.env.OPENAI_API_KEY
})

// ✅ 本地 Ollama（免费 + 自主）
const ollamaLlm = createBrowserFetchLlmClient({
  endpoint: 'http://localhost:11434/v1',
  model: 'llama2'
})

// 都可用于 planner，接口统一
const planner = createBrowserScenarioPlanner({
  runtime: system.runtime,
  llm: localLlm  // 改这里切换后端
})
```

## 🧪 测试

```bash
# 运行所有测试
npx vitest run packages/spark-scenario/src/tests/

# 运行特定测试文件
npx vitest run packages/spark-scenario/src/tests/browser-local-llm-client.test.ts

# 观看模式（开发时）
npx vitest watch packages/spark-scenario/src/tests/
```

**测试统计**：

- ✅ 20 个 LLM 客户端测试（文本提取、参数透传、进度回调）
- ✅ 18 个查询协议测试（所有 15 步 API）
- ✅ 8+ 个运行时测试（工具执行、异常恢复）

## 📚 深入学习

| 文档 | 内容 | 阅读时间 |
|-----|------|--------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 6 层架构、设计理念、完整示例 | 30 分钟 |
| [API_REFERENCE.md](./API_REFERENCE.md) | 所有 API 的详细参考 | 20 分钟 |
| 本文件 | 快速开始 | 5 分钟 |

## ❓ 常见问题

### Q: 本地推理和远程 API 怎么选？

**A**: 取决于场景：

- 🏢 **企业内部**：用本地推理（Qwen2.5-0.5B），成本 $0，隐私 100%
- ☁️ **公有云**：用 OpenAI API（gpt-4），成本 $5~20，质量最好
- 🎯 **简单场景**：用本地推理，足够了
- 🧠 **复杂推理**：用 gpt-4，保险

### Q: 第一次加载本地模型为什么这么慢？

**A**: 需要下载 500MB~1.5GB 的模型文件。之后都在内存里，会很快（1~3 秒）。

### Q: 能微调模型吗？

**A**: 本地推理客户端**不支持**微调（推理专用）。如需微调：

1. 用 PyTorch/Hugging Face `transformers` 库在服务器训练
2. 导出为 ONNX 格式
3. 用 transformers.js 在浏览器加载

### Q: 如何记录运行历史？

**A**: 提供 `queryRunHistory` 回调：

```typescript
const registry = createScenarioRegistry({
  queryRunHistory: async (query) => {
    // 从后端查询
    const res = await fetch(`/api/scenarios/history?scenarioId=${query.scenarioId}`)
    return res.json()
  }
})
```

### Q: 工具执行失败了怎么办？

**A**: 由 `recoveryPolicy` 决定：

- `'auto'` - 自动重试 → 补齐参数 → 跳过 → 人工
- `'manual'` - 立即暂停，等待人工处理
- `'strict'` - 抛异常

## 🔗 链接

- [spark-view 主仓库](https://gitee.com/obslight/SPARK_VIEW)
- [SPARK 文档中心](../docs/README.md)
- [AI 工作流文档](../docs/ai/README.md)

## 📝 许可证

MIT

---

**更新时间**: 2026-05-04

**版本**: 0.1.0（MVP）
