# spark-ai 架构全景

> 更新于 2026-04-22。

本文只描述当前仍在仓库中生效的 spark-ai 能力边界。旧页面生成链已删除，不再属于现行架构。

## 1. 包定位

@spark-view/spark-ai 当前承担四类职责：

1. 通用聊天协议与 SSE 解析。
2. stills / FC 会话编排与前端执行控制。
3. 提示词、组件目录、校验器等知识层能力。
4. 页面缓存、导航注册、监控器等少量运行时辅助能力。

它不再承担“页面配置整模生成闭环”的运行时职责。

## 2. 当前两条主链路

### 2.1 通用聊天链

AiChatWidget
-> src/services/ai-protocol.ts
-> POST /api/ai/chat/stream
-> AiChatController
-> AiStreamService

用途：纯聊天、解释、问答、SSE 增量输出。

### 2.2 细粒度编辑链

DevDataSetDesigner / useRuleEditSession
-> registerEditStills() / runStillsLoop() / SessionBackendImpl
-> POST /api/ai/sessions / turn / turn/stream / append
-> AiSessionController
-> StillsSessionService

用途：rule.json、pagedata.json、script.js、style.css 的细粒度编辑与回合式工具调用。

## 3. 关键模块

### 协议层

- src/protocol.ts：协议原语、消息解析、块提取等公共协议能力。
- src/session-backend.ts：前端会话后端适配接口与实现。

### stills / 编辑域

- src/stills/dispatcher.ts：动作调度入口。
- src/stills/domain.ts：domain 注册与 session state 初始化。
- src/stills/edit-state.ts：4 文件单会话编辑状态。
- src/stills/*-domain.ts：dataset、node tree、page config 等动作域。

### 运行时辅助

- src/runtime/session-orchestrator.ts：多轮工具循环编排。
- src/runtime/page-cache.ts：页面缓存清理与统计。
- src/runtime/nav-register.ts：导航注册辅助。
- src/runtime/monitors/*：回合监控与诊断采样。

### 知识层

- src/prompts/*：system prompt 与辅助提示词。
- src/catalog/*：组件目录与结构化元数据。
- src/validation/*：配置校验与报告。

## 4. 与后端的边界

spark-ai 依赖但不替代后端能力：

1. AiChatController / AiStreamService：通用聊天 SSE。
2. AiSessionController / StillsSessionService：统一会话主干。
3. PageConfigController：页面配置、版本、批量写入与 SSE 广播。
4. NavigationController：导航树查询与写入。

## 5. 当前约束

1. 前端不再保留旧页面生成整模闭环，也不再调用专用页面生成端点。
2. rule 编辑走 useRuleEditSession，DataSet 细粒度编辑走 stills 会话，不做向后兼容。
3. 文档、测试和接线应默认围绕 chat/stream 与 /api/ai/sessions/* 建模。

## 6. 历史说明

如需追溯 2026-04 之前的页面生成链与旧 DevSystem AI 面板方案，请直接查看 git 历史；这些内容不再保留在当前架构文档中，避免误导后续实现。
