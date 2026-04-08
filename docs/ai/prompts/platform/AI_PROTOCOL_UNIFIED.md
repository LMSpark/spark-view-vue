# AI 协议统一说明

> 更新时间：2026-03-18
> 目标：将前端所有 AI 交互协议（流式输出、工具块、提案块）收敛到统一协议层，避免各组件重复实现。
>
> 所属： [AI 提示词体系](../README.md) / [平台基础](README.md) / 统一交互协议。
>

---

## 1. 统一入口

统一协议服务文件：
- `src/services/ai-protocol.ts`

提供能力：
- `streamAiChatText()`：统一 `/api/ai/chat/stream` SSE 解析
- `extractToolProtocolBlocks()` / `stripToolProtocolBlocks()` / `parseToolProtocolPayload()`：统一 `@@type:*#* ... @@end`
- `extractProposalProtocolBlocks()` / `stripProposalProtocolBlocks()`：统一 `@@proposal:* ... @@end`
- `extractFirstJsonObject()`：统一容错 JSON 抽取

---

## 2. 协议格式

### 2.1 动作协议（Action Block）

格式：

```text
@@<type>:<action>#<requestId>
<json>
@@end
```

示例：

```text
@@request:page.auto#req-1
{"pageId":"orders","prompt":"创建订单列表页"}
@@end
```

Stills 专项示例：

```text
@@request:file.write#req-1
{"path":"output/hello.txt","content":"Hello Stills","append":false}
@@end
```

说明：
- `type`：协议类型，仅允许 `request` / `describe`
- `action`：工具动作（如 `page.auto` / `file.write`）
- `requestId`：工具调用唯一标识
- `<json>`：工具参数

### 2.2 提案协议（Proposal Block）

格式：

```text
@@proposal:<name>
# 标题（可选）
{ ...json... }
@@end
```

示例：

```text
@@proposal:nav-add
# 新增订单导航
{"parentId":"sales","node":{"id":"orders","title":"订单"}}
@@end
```

说明：
- `name`：提案类型（如 `nav-add` / `nav-delete`）
- 块体可包含标题与说明文本，解析时会容错提取首个 JSON 对象

---

## 3. 已统一模块

### 3.1 页面 AI 面板
- 文件：`src/components/AiChatPanel.vue`
- 变更：
  - 协议规划流改为 `streamAiChatText()`
  - 工具块解析改为 `extractToolProtocolBlocks()`
  - payload 解析改为 `parseToolProtocolPayload()`
  - 协议文本清洗改为 `stripToolProtocolBlocks()`

### 3.2 Stills 工具面板
- 文件：`src/components/StillsChatPanel.vue`
- 变更：
  - 移除本地 SSE 手写解析，改为 `streamAiChatText()`
  - 移除本地正则，改为 `extractToolProtocolBlocks()` / `stripToolProtocolBlocks()`
  - Stills 专项块类型统一为 `request / describe`
  - Stills 专项执行语义统一为“一轮最多一个协议块；成功后一轮总结；多块直接判协议错误”

### 3.3 顶栏 AI Chat 组件链路
- 文件：`src/composables/useAiChat.ts`
- 变更：
  - 移除本地 `createFetchClient().streamSSE()` 解析循环
  - 改为调用 `streamAiChatText()` 并通过回调增量更新消息

### 3.4 导航策划提案解析
- 文件：`src/views/app/dev-system/composables/useNavPlanner.ts`
- 变更：
  - 移除本地 `NAV_BLOCK_RE` 协议实现
  - 改为 `extractProposalProtocolBlocks()` / `stripProposalProtocolBlocks()`
  - JSON 容错抽取改为 `extractFirstJsonObject()`

---

## 4. 协议分层建议

- 协议层（`ai-protocol.ts`）只负责：
  - 流式协议解析
  - 定界块解析与清洗
  - payload 反序列化
- 业务层（`AiChatPanel` / `StillsChatPanel` / `useNavPlanner`）只负责：
  - 工具动作执行
  - UI 状态管理
  - 错误提示与回退策略

---

## 5. 兼容与回退

- `AiChatPanel` 保留“协议失败自动回退原生成流程”的兜底逻辑。
- `StillsChatPanel` 保留原工具执行端点 `/api/stills/execute`。
- `useAiChat` 保留原消息模型，仅替换底层流式解析实现。

---

## 6. 后续可选增强

- 抽取统一 `runToolLoop()`（当前 AI/Stills 各有循环控制，尚未统一）
- 为工具动作定义共享 schema（可接入 Zod 或 JSON Schema）
- 增加协议级单测（`ai-protocol.service.test.ts`）覆盖异常块/脏数据
