# SAP 协议完整说明

> 更新时间：2026-04-01
> 目标：把当前仓库中分散在前端面板、统一协议层、后端解析器、编排器、控制器与动作处理器里的 SAP 协议实现，整理成一份可直接查阅的完整说明。
>
> 所属： [AI 提示词体系](../../README.md) / 平台规则 / SAP 协议完整说明。

---

## 1. 适用范围

本文件描述的是当前仓库里已经落地的 SAP 协议现实口径，而不是抽象设计稿。

当前完整口径来自以下实现：

- 前端 SAP 工具面板：`src/components/SapChatPanel.vue`
- 前端统一协议服务：`src/services/ai-protocol.ts`
- 前端 SAP 协议收口层：`src/services/sap-protocol.ts`
- 前端统一协议解析原语：`packages/spark-ai/src/protocol.ts`
- 后端 HTTP 入口：`spark-ai-server/src/main/java/com/spark/ai/controller/SapController.java`
- 后端 AI 助手闭环：`spark-ai-server/src/main/java/com/spark/ai/sap/SapAssistantService.java`
- 后端协议解析器：`spark-ai-server/src/main/java/com/spark/ai/sap/SapProtocolParser.java`
- 后端编排器：`spark-ai-server/src/main/java/com/spark/ai/sap/SapOrchestrator.java`
- 动作注册与执行：`spark-ai-server/src/main/java/com/spark/ai/sap/handler/**`

这意味着：如果文档与代码冲突，以这些实现文件为准。

---

## 2. 三种接入方式

当前 SAP 协议实际上有两条对话链路，再加一条直接执行链路，不能混为一谈。

### 2.1 前端面板模式

入口：`src/components/SapChatPanel.vue`

执行路径：

1. 前端通过 `streamAiChatText()` 调用 `/api/ai/chat/stream`。
2. 给 LLM 注入 SAP 专用 system prompt。
3. 从 AI 回复中提取 `@@type:action#id ... @@end` 协议块，并要求一轮最多只能有 1 个块。
4. 如果模型输出多个块，前端将其视为协议错误并回灌给模型要求重试，不会顺序执行。
5. 单块执行通过 `/api/sap/execute` 完成。
6. 如果执行结果是 `@@error`，继续回灌让模型修正；如果是 `@@result`，只再请求一轮自然语言总结，然后直接结束。

特点：

- 当前 `SapChatPanel` 显式过滤的是 `type=request` 与 `type=describe` 的块。
- 一轮回复里只允许 0 或 1 个协议块。
- 多块输出会被判为协议错误，不会执行。
- 前端最大工具回合数是 5。

### 2.2 后端助手模式

入口：`POST /api/sap/chat`

执行路径：

1. 用户发自然语言消息给后端。
2. `SapAssistantService` 用 SAP/1.0 system prompt 调 LLM。
3. LLM 输出协议块后，交给 `SapOrchestrator` 执行。
4. 执行结果以 `@@result` 或 `@@error` 回灌给 LLM。
5. 如果回灌的是 `@@error`，继续进入下一轮让 LLM 自动修正；如果回灌的是 `@@result`，当前实现只再请求一轮自然语言总结，然后直接返回。

特点：

- 后端助手文案采用 SAP/1.0 的 `request / describe / result / error` 语义。
- 后端最大工具回合数也是 5。
- `SapOrchestrator.processProtocol()` 当前只接受单个协议块；多块会直接返回 `INVALID_PROTOCOL`。
- `/api/sap/chat` 当前更接近“单个工具动作 + 一轮总结”的闭环，而不是成功后还能继续发起第二个工具动作的通用多步代理。

### 2.3 直接执行模式

入口：`POST /api/sap/execute`

用途：

- 绕过 LLM，直接执行一段原始 SAP 协议文本。
- 适合调试、联调和单块工具测试。

特点：

- 请求体是 `text/plain` 原始协议文本。
- 返回 JSON 包装，真正的工具结果仍然放在 `result` 字段里的 `@@result` / `@@error` 文本中。
- 和后端助手一样，当前一次只接受一个协议块；多块会返回 `INVALID_PROTOCOL`。

---

## 3. 协议总格式

SAP 协议块的通用语法是：

```text
@@<type>:<action>#<id>
<body>
@@end
```

字段含义：

- `type`：块类型，如 `request`、`describe`、`result`、`error`
- `action`：动作名，如 `file.write`、`db.query`、`system.capabilities`
- `id`：请求关联 ID，用于多轮追踪
- `body`：块体，通常是 JSON 文本

解析规则来自 `SapProtocolParser` 与 `packages/spark-ai/src/protocol.ts`：

- `action` 允许点号，如 `file.write`
- `id` 允许字母、数字、下划线、横线
- 一个文本里可以包含多个协议块
- 解析器支持 `parseAll()` 与 `parseFirst()`
- 但编排入口当前只接受单块，多个块会被判为协议错误

---

## 4. 块类型说明

### 4.1 `request`

这是后端 SAP/1.0 助手文案里的标准请求类型，用于真正发起工具调用。

示例：

```text
@@request:file.write#req-1
{"path":"output/hello.txt","content":"Hello SAP","append":false}
@@end
```

### 4.2 `describe`

用于能力探测，当前内置支持 `system.capabilities`。

示例：

```text
@@describe:system.capabilities#cap-1
{}
@@end
```

### 4.3 `result`

后端执行成功时返回的标准结果块。

示例：

```text
@@result:file.write#req-1
{"status":"success","path":"output/hello.txt","size":9,"append":false}
@@end
```

### 4.4 `error`

后端执行失败时返回的标准错误块。

示例：

```text
@@error:db.query#req-2
{"code":"INVALID_PARAMS","msg":"仅允许 SELECT 查询","fix":"请将 sql 改为 SELECT 语句"}
@@end
```

### 4.5 `type` 约束

当前统一规则：

- 发起真实操作只能使用 `request`
- 查看能力只能使用 `describe:system.capabilities`
- 发送任何非 `request/describe` 的类型到 `/api/sap/execute` 会返回 `@@error`，错误码为 `INVALID_TYPE`

---

## 5. 当前支持的动作

### 5.1 `system.capabilities`

来源：`SapOrchestrator` 内置动作

用途：返回当前已注册动作列表。

请求：

```text
@@describe:system.capabilities#cap-1
{}
@@end
```

成功返回数据结构：

```json
{
  "status": "success",
  "actions": ["db.query", "file.write"]
}
```

### 5.2 `file.write`

来源：`FileWriteHandler`

请求体格式：

```json
{
  "path": "output/hello.txt",
  "content": "Hello SAP",
  "append": false
}
```

参数说明：

- `path`：必填，相对路径
- `content`：必填，文件内容
- `append`：可选，默认 `false`

安全约束：

- 禁止绝对路径
- 禁止 `..` 目录穿越
- 最终目标路径必须位于 sandbox 内
- 默认 sandbox 配置是 `./data/sap-sandbox`
- 仅允许白名单扩展名：`.txt`、`.json`、`.csv`、`.md`、`.xml`、`.yml`、`.yaml`、`.log`、`.html`、`.css`

成功返回数据结构：

```json
{
  "status": "success",
  "path": "output/hello.txt",
  "size": 9,
  "append": false
}
```

### 5.3 `db.query`

来源：`DbQueryHandler`

请求体格式：

```json
{
  "sql": "SELECT * FROM users",
  "limit": 10
}
```

参数说明：

- `sql`：必填，只允许只读 `SELECT`
- `limit`：可选，默认 10，最大 100

安全约束：

- 仅允许 `SELECT`
- 禁止多语句执行
- 禁止危险关键字：`INSERT`、`UPDATE`、`DELETE`、`DROP`、`ALTER`、`CREATE`、`TRUNCATE`、`GRANT`、`REVOKE`、`EXEC`、`EXECUTE`、`LOAD_FILE`、`INTO OUTFILE`、`INTO DUMPFILE`
- 禁止注释注入（`--`、`/*`）
- 若 SQL 未显式带 `LIMIT`，执行前会自动补安全 `LIMIT`

成功返回数据结构：

```json
{
  "status": "success",
  "rowCount": 2,
  "data": [
    { "id": 1, "name": "Alice" },
    { "id": 2, "name": "Bob" }
  ]
}
```

---

## 6. 错误模型

后端错误统一返回 `@@error:<action>#<id>`，body 为 JSON：

```json
{
  "code": "INVALID_PARAMS",
  "msg": "仅允许 SELECT 查询",
  "fix": "请将 sql 改为 SELECT 语句"
}
```

当前常见错误码：

- `FORMAT_ERROR`：协议格式不合法
- `UNKNOWN_ACTION`：动作不存在
- `INVALID_PARAMS`：参数校验失败
- `EXECUTION_ERROR`：业务执行失败
- `RUNTIME_ERROR`：运行时异常
- `SERIALIZATION_ERROR`：结果序列化失败

语义约束：

- `msg` 解释错误原因
- `fix` 给出下一次应如何修正参数
- SAP 助手回路看到 `@@error` 后，应优先自动修正，而不是直接向用户抱怨错误

---

## 7. HTTP 接口契约

### 7.1 `POST /api/sap/chat`

用途：让后端自己完成 SAP 工具回路。

请求：

```json
{
  "message": "帮我查询 users 表前 5 条记录"
}
```

响应：

```json
{
  "answer": "已查询 users 表前 5 条记录，共返回 5 行。",
  "rounds": 2,
  "toolTrace": [
    "Round 1 → @@result:db.query#req-1 ..."
  ]
}
```

说明：

- 适合服务端闭环执行
- 当前每轮必须只产出一个协议块，多块会直接被判为 `INVALID_PROTOCOL`
- 当前首次工具执行成功后，服务端只会再请求一轮总结，不会继续执行第二个成功后的工具动作

### 7.2 `POST /api/sap/execute`

用途：直接执行单段协议文本。

请求头：

```text
Content-Type: text/plain
```

请求体：

```text
@@request:file.write#req-1
{"path":"output/hello.txt","content":"Hello SAP","append":false}
@@end
```

响应：

```json
{
  "result": "@@result:file.write#req-1\n{\"status\":\"success\",\"path\":\"output/hello.txt\",\"size\":9,\"append\":false}\n@@end"
}
```

说明：

- 空请求体会返回 400
- 当前一次只接受一个协议块，多块会返回 `INVALID_PROTOCOL`
- 适合前端逐块执行或调试联调

---

## 8. 当前统一结果

当前 SAP 协议已按同一口径执行：

- 前端 `SapChatPanel` 只生成并提取 `request / describe`
- 后端 `SapAssistantService` 的 system prompt 只要求 `request / describe`
- 后端 `SapOrchestrator` 显式拒绝非规范类型

因此：

- SAP 专项文档、测试样例、前端提示词、后端提示词都必须使用 `request / describe / result / error`
- 不再保留任何非 canonical `type` 的兼容输入

---

## 9. 推荐示例

### 9.1 查询数据库

```text
@@request:db.query#req-1
{"sql":"SELECT id,name FROM users LIMIT 5","limit":5}
@@end
```

### 9.2 写文件

```text
@@request:file.write#req-2
{"path":"reports/result.md","content":"# Report\nDone","append":false}
@@end
```

### 9.3 查看能力

```text
@@describe:system.capabilities#cap-1
{}
@@end
```

## 10. 维护建议

1. 新增任何 SAP 前端入口或后端入口时，必须继续使用 `request / describe / result / error`，不要重新引入 `tool`。
2. 若要支持一轮多个协议块，必须同时修改前端 `SapChatPanel` 与后端 `SapOrchestrator`，不能只放开一端。
3. 若新增动作，按 `ActionHandler` + `@Component` 注册，不要在编排器里硬编码分支。
4. 若补更多协议文档，应以本文件为 SAP 专项基线，以 [AI_PROTOCOL_UNIFIED.md](AI_PROTOCOL_UNIFIED.md) 为“统一协议层”基线。