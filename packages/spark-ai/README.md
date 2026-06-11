# @spark-appworks/spark-ai

Spark AI agent runtime：JSON Schema 校验、ClassModel 工具闭集、Host 编排、ToolLoop、传输契约与 native-runtime 脚本执行。

## 公共入口

| 子路径 | 用途 |
|--------|------|
| `@spark-appworks/spark-ai` | 薄门面（常用符号快捷导出） |
| `@spark-appworks/spark-ai/json` | Schema 校验与 JSON 规整 |
| `@spark-appworks/spark-ai/agent` | Host、会话、ToolLoop、传输、native-runtime |
| `@spark-appworks/spark-ai/class-model` | ClassModel 反射图、metadata 解析与 ClassModel 工具 |

## 文档

| 文档 | 说明 |
|------|------|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 包架构 SSOT |
| [`docs/README.md`](docs/README.md) | 文档索引与阅读顺序 |
| [`docs/native-runtime-and-agent-flow-zh-cn.md`](docs/native-runtime-and-agent-flow-zh-cn.md) | native-runtime、Adapter、ToolLoop、pageDesign 全链路 |
| [`docs/transport-and-session-zh-cn.md`](docs/transport-and-session-zh-cn.md) | V4 传输、session-turn / app-sse、`ai-turn-bridge` |
| [`docs/END-TO-END-PLATFORM-zh-CN.md`](docs/END-TO-END-PLATFORM-zh-CN.md) | 端到端平台方案（.d.ts → 交付） |
| [`src/agent/native-runtime`](src/agent/native-runtime) | model_script 脚本上下文与执行 |

## APP 消费示例

```typescript
import { createAiAgentHost } from '@spark-appworks/spark-ai/agent'
import { createAiAgentTurnCallbacks } from '@/services/ai-turn-bridge'
import { ensurePageDesignBusiness } from '@/services/page-design-business'

const host = createAiAgentHost({
  turnCallbacks: createAiAgentTurnCallbacks({ transport: 'session-turn' }),
})

ensurePageDesignBusiness({ host, getPageDesignEditor })
```

生产 Host 见 `src/services/ai-host.ts`（`appAiAgent`）。

## 开发

```bash
pnpm --filter @spark-appworks/spark-ai test:run
pnpm --filter @spark-appworks/spark-ai typecheck
```
