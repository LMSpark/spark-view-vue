# AI Host I/O-Free 边界完成说明

## 当前结论

AI Host 已完成去 I/O 重构：`@spark-view/spark-ai` 只保留纯编排、协议投影、事件聚合和类型契约，不再直接发起 HTTP 请求、文件上传或 APP SSE 订阅。

网络 I/O 统一下沉到 APP 与脚本层，通过 `AiHostTurnCallbacks` 注入给业务会话与工具循环。

## 包边界

### `@spark-view/spark-ai`

负责纯运行时能力：

- `AiHostTurnCallbacks`：AI turn 的外部回调边界。
- `AiHostOptions.turnCallbacks`：会话入口注入 APP/脚本侧 I/O。
- `AiHostToolLoopRunner`：只编排 session prepare、turn execute、tool append 与工具循环。
- `createTurnEventCollector`：聚合 APP SSE 事件为 turn 结果。
- `createAiHostTransportTurn`：生成稳定的 turn payload、`turnKey` 与 `streamKey`。
- `app-sse-events.ts`：只声明事件类型。

约束：

- 不依赖浏览器网络请求、事件源订阅或文件上传实现。
- 不持有 APP SSE 订阅生命周期。
- 不内置后端 URL、认证或重试策略。
- 不复制 APP/脚本层的网络协议细节。
- 不保留 `http-utils.ts` 这类 Host 内部 HTTP helper；JSON/envelope 解析属于 APP/脚本 I/O 边界。

### APP 层

负责浏览器 I/O 桥接：

- `src/services/ai-turn-bridge.ts` 组装 `AiHostTurnCallbacks`。
- 通过现有 `http` 服务执行后端请求。
- 通过 `createAppSseEventSource` 订阅 APP SSE。
- 复用 `createTurnEventCollector` 保持事件聚合语义一致。
- 维护 prepared session 缓存。

### 脚本层

负责 Node 验证脚本 I/O：

- `scripts/app-sse-client.mjs` 提供脚本侧 APP SSE helper。
- 验证脚本自行完成登录、HTTP POST 和 SSE 订阅。
- 脚本复用 `spark-ai` 的 turn payload 与事件聚合 helper，避免重复实现协议 key。

## 公共 API

保留的新边界：

- `AiHostTurnCallbacks`
- `AiHostPrepareSessionInput`
- `AiHostOptions.turnCallbacks`
- `createAiHostTransportTurn`
- `AiHostTransportTurn`
- `createTurnEventCollector`
- `TurnEventCollector`

这些导出都是纯类型、纯投影或纯聚合 helper，可被 APP 与脚本层安全复用。

## 行为保持

重构后继续保持：

- turn 身份、`turnKey`、`streamKey` 生成规则一致。
- session prepare 缓存语义一致。
- APP SSE delta、reasoning、usage、result 聚合语义一致。
- 诊断事件回调透传一致。
- tool loop 的 append messages 行为一致。
- 非当前 session、turn 或 stream 的事件会被过滤。
- turn error、abort、timeout 会正确拒绝并清理监听。

## 验证清单

完成边界清理后应通过：

```bash
pnpm run typecheck
pnpm run verify:rules
pnpm run test
```

边界巡检建议：

```bash
rg "已废弃入口名" packages src scripts docs
rg "from ['\"]\.\./" packages
```

第一条按迁移清单替换为需要确认的旧入口名，不应在源码、脚本和正式文档中命中；第二条用于辅助检查跨包相对导入。
