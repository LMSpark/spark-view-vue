# @spark-appworks/spark-ai

Spark AI agent runtime：JSON Schema 校验、VCM-native 工具闭集、Host 编排、ToolLoop、传输契约与 native-runtime 脚本执行。

## 公共入口

| 子路径 | 用途 |
|--------|------|
| `@spark-appworks/spark-ai` | 薄门面（常用符号快捷导出） |
| `@spark-appworks/spark-ai/json` | Schema 校验与 JSON 规整 |
| `@spark-appworks/spark-ai/agent` | Host、会话、ToolLoop、传输、native-runtime |
| `@spark-appworks/spark-ai/vcm-native` | ClassModel 反射图、metadata 解析与 VCM-native 工具 |

## 文档

| 文档 | 说明 |
|------|------|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 包架构 SSOT |
| [`docs/README.md`](docs/README.md) | 文档索引与阅读顺序 |
| [`docs/NATIVE-RUNTIME-AND-AGENT-FLOW.zh-CN.md`](docs/NATIVE-RUNTIME-AND-AGENT-FLOW.zh-CN.md) | native-runtime、Adapter、ToolLoop、pageDesign 全链路 |
| [`docs/TRANSPORT-AND-SESSION.zh-CN.md`](docs/TRANSPORT-AND-SESSION.zh-CN.md) | V4 传输、session-turn / app-sse、`ai-turn-bridge` |
| [`docs/VCM-GENERATOR-AND-CALLBACKAPIS.zh-CN.md`](docs/VCM-GENERATOR-AND-CALLBACKAPIS.zh-CN.md) | Generator 规则与 callbackApis 迁移设计 |
| [`src/vcm-native/metadata`](src/vcm-native/metadata) | VCM metadata 协议与解析实现 |

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
