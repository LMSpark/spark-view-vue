# Java 后端（spark-ai-server）

### 后端只做三件事

- **场景**：AI 需要修改 Java 后端代码
- **规则**：`spark-ai-server/` 的职责边界非常明确：LLM 通信代理、APP SSE 通信、会话记录落库和查询。不要在后端实现业务逻辑、数据处理或页面生成——那些在前端 TypeScript 层通过 ClassModel 运行时完成。
- **违反后果**：在后端实现本应在前端做的逻辑 → 架构违反"后端只做通信和持久化"的原则，难以维护

### SSE 是前后端通信通道

- **场景**：前端需要接收 AI 的实时输出
- **规则**：后端通过 SSE（Server-Sent Events）向前端推送 LLM 的流式响应。SSE 事件格式有固定协议，不要自定义新事件类型除非同时修改前端消费者。
- **违反后果**：新增 SSE 事件类型但前端没同步消费 → 事件丢失或解析失败

### 会话持久化的边界

- **场景**：AI 会话记录需要存储或查询
- **规则**：后端负责 session 的持久化和查询，但不持有 session 的运行时状态。运行时状态（模型实例、工具调用上下文）全部在前端内存中。后端重启不应影响已打开页面的编辑状态。
- **违反后果**：假设后端持有运行时状态 → 后端重启后前端丢失编辑中的数据

### Posted Turn 是 Agent 主路径

- **场景**：前端 Agent 发起 LLM 调用
- **规则**：当前主路径是 `POST /api/ai/turns`（Posted Turn），返回 HTTP 202 ACK，结果通过 `llm-frame` SSE 事件推送。帧类型：`message.delta`（流式文本/推理片段）、`message.completed`（最终组装结果）、`done`（终止帧）。同一 `(sessionId, turnId)` + 相同输入 hash 会幂等返回 ACK，不重复执行。
- **违反后果**：使用旧的非流式 `/api/ai/sessions/{id}/turn` 路径 → 没有 SSE 事件推送，前端无法实时显示

### Host Run 实现前端工具执行

- **场景**：后端需要触发前端环境中的操作
- **规则**：`POST /api/ai/host-run/request` → 后端向特定 appClientId 推送 `ai-host-run-request` SSE 事件 → 前端执行后通过 `POST /api/ai/host-run/result` 回报结果。这是后端驱动前端操作的唯一机制。
- **违反后果**：不知道 Host Run 机制 → 在后端实现本应在前端执行的操作

### Spring Boot 配置约定

- **场景**：修改后端配置
- **规则**：配置文件在 `spark-ai-server/` 目录下，环境变量通过 `.env.java` 注入。不要在代码中硬编码 LLM API 密钥、数据库连接串等敏感信息。
- **违反后果**：硬编码敏感信息 → 安全漏洞；配置不一致 → 开发/测试/生产环境行为不同

### 日志文件位置

- **场景**：需要查看后端运行日志排查问题
- **规则**：Spring Boot 运行日志输出到 `spark-ai-server/target/spring-boot-run.log`。这是 `.gitignore` 中的文件，不应提交。
- **违反后果**：找不到日志 → 排查问题效率低；误提交日志 → 仓库体积膨胀

### 后端测试必须使用 JDK 17

- **场景**：在 `spark-ai-server/` 运行 Maven 测试或打包，尤其本机默认 `java` 指向 JDK 11 时。
- **规则**：先确认 `java -version` 是 17。当前本机可临时执行 `$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot'; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"` 后再运行 `mvn test`。
- **违反后果**：Maven 测试会因为 Java 版本不匹配失败，例如遇到 Java 17 class file version 61.0 但当前运行时只支持到 55.0。
- **发现来源**：Agent Workflow Designer 单一业务节点契约落地任务中运行 `WorkflowDesignServiceTest` / `WorkflowDesignApiIntegrationTest` 时发现。
