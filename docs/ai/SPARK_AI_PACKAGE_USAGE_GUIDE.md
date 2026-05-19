# SPARK AI 显式业务会话指南

SPARK AI 的入口由业务按钮决定；按钮先解析明确的业务 target，再交给 AI Core 执行。

当前链路：

`AI 按钮点击` → `业务/API 解析 target` → `AiSessionConfig.target` → `AppAiPanel resolver` → `spark-ai core sender` → `AiSessionLedger`

## 核心约束

- `businessRegistrationId` 表示业务类型，例如 `pageDesign`、`manualLeave`。
- `businessInstanceId` 表示业务实例，例如当前页面 ID、请假草稿 ID。
- 打开 AI 面板前必须确定完整 target。
- AI Core 只消费显式 target，不做语义业务路由，也不创建业务实例。
- `AiSessionLedger` 是会话唯一事实源；面板监视器通过各业务 runtime 的 `listSessions()` 汇总展示。
- APP 层只保留注册表、HTTP transport、面板 resolver、文件上传等装配能力。

## App 层入口

APP 层 AI 装配在 `src/services/app-ai/`：

- `panel-resolver.ts`：把 `AiSessionConfig.target` 解析为 core session，并为面板提供 runtime monitor。
- `transport.ts`：普通 HTTP/SSE transport，负责 `/api/ai` 请求、SSE envelope unwrap、附件上传。
- `index.ts`：APP 层统一出口。

## 按钮接入

业务页使用 `AiLauncherButton`，在点击时通过 `resolveTarget()` 或 `@resolve-target` 返回：

```ts
{
  businessRegistrationId: 'pageDesign',
  businessInstanceId: activePageId,
}
```

解析失败、取消或缺少实例 ID 时，不打开面板。

## 会话隔离

面板统一派生 storage key：

```ts
spark-ai:${businessRegistrationId}:${businessInstanceId}
```

同一业务实例复用同一会话，不同业务实例天然隔离。

## PageDesign

PageDesign 的按钮位于 DevSystem 页面。按钮点击时读取当前 `activePageId`：

```ts
{
  businessRegistrationId: 'pageDesign',
  businessInstanceId: activePageId,
}
```

没有 active page 时 fail-fast，不进入 AI 面板。

## 监视与人工干预

`AppAiPanel` 读取 `runtimeMonitor.getSnapshot()` 展示所有 core sessions，可查看会话历史、写入人工干预消息并关闭会话。监视器不维护第二份会话状态，只聚合 runtime 的 `listSessions()`。
