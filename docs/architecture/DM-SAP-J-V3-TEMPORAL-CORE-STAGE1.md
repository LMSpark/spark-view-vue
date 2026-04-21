# DM: SAP-J v3 重设计（Temporal 核心 + 内置持久化）

> 状态：草案 v0.1（待评审）  
> 日期：2026-04-19  
> 适用范围：LLM《===》Agent 交互协议执行链（JVM）

---

## 1. 一句话目标

将现有会话与工具调用链重构为 SAP-J v3：仅支持 Function Calling v3，执行核心下沉到 JVM 并以 Temporal 为核心编排框架，实现零兼容硬切、冲突感知并行、按 action 幂等、四层错误模型与 HANDOFF 人工接管。

---

## 2. 业务动机

当前链路存在三个痛点：

1. 协议与执行语义分散：前端与后端都在承担部分编排职责，边界不清。  
2. 可靠性不足：并行、幂等、状态迁移、回放与中止机制缺少统一协议约束。  
3. 兼容历史路径成本高：旧 stills 文本协议与新 FC 路径并存，增加维护复杂度。

业务需要是把执行控制面集中到后端，形成可审计、可中止、可恢复、可扩展的协议体系。

---

## 3. 源码事实对照（SSoT）

### 3.1 后端会话现状

1. 会话入口在 [spark-ai-server/src/main/java/com/spark/ai/controller/AiSessionController.java](spark-ai-server/src/main/java/com/spark/ai/controller/AiSessionController.java)。  
2. 会话状态与 LLM 调用在 [spark-ai-server/src/main/java/com/spark/ai/stills/StillsSessionService.java](spark-ai-server/src/main/java/com/spark/ai/stills/StillsSessionService.java)。  
3. 当前已支持 tools 与 tool_calls 透传，但尚未形成 v3 协议强校验与统一状态机约束。

### 3.2 前端客户端现状

1. 会话 HTTP 客户端在 [packages/spark-ai/src/session-backend.ts](packages/spark-ai/src/session-backend.ts)。  
2. 运行时编排入口在 [packages/spark-ai/src/runtime/session-orchestrator.ts](packages/spark-ai/src/runtime/session-orchestrator.ts)。  
3. 仍存在本地编排语义与协议适配混合，位于 [packages/spark-ai/src/runtime/session-orchestrator.ts](packages/spark-ai/src/runtime/session-orchestrator.ts) 与 [packages/spark-ai/src/tool-calling.ts](packages/spark-ai/src/tool-calling.ts)。

### 3.3 旧协议路径

1. 旧 stills 入口位于 [spark-ai-server/src/main/java/com/spark/ai/controller/StillsController.java](spark-ai-server/src/main/java/com/spark/ai/controller/StillsController.java)。  
2. 旧文本协议解析位于 [packages/spark-ai/src/protocol-parser.ts](packages/spark-ai/src/protocol-parser.ts)。

---

## 4. 一问一答决策结论（本次确认）

1. 交付目标：可执行改造方案，审核后编码。  
2. Node 边界：仅执行链脱离 Node，前端构建链可保留。  
3. 兼容策略：零兼容，立即硬切。  
4. 并行策略：冲突感知并行。  
5. 并行裁决：静态声明 + 运行时动态分析。  
6. 幂等策略：按 action 配置。  
7. 错误模型：四层（severity/category/code/retryPolicy）。  
8. 中止策略：连续同类错误/高风险/预算超限/状态冲突全部触发。  
9. 观测级别：增强 trace（含 argsHash、replayed、stateTransition、latency）。  
10. 实施节奏：第一阶段单 PR 一次性交付。  
11. 第三方框架：优先采用成熟框架，选择 Temporal。  
12. 第一阶段约束：仅 Temporal 核心 + 复用现有数据库（以当前环境配置为准）作为内置持久化，不依赖 Redis。  
13. 数据库实现策略：阶段一先按 H2 开发与验证，同时预留 MySQL/PostgreSQL 方言层（DDL 与索引差异隔离）。

---

## 5. 目标架构（阶段一）

## 5.1 分层

1. 协议网关层（Spring MVC）  
- 强制 protocolVersion=3。  
- 统一 envelope 和错误输出。

2. 协议态守卫层（Spring StateMachine）  
- 维护 READY/PLAN/CALL/APPLY/VERIFY/DONE/FAILED/HANDOFF 的迁移白名单。  
- 非法迁移统一返回 INVALID_STATE_TRANSITION。

3. 执行态编排层（Temporal Workflow）  
- 负责 round 生命周期、tool call 分组调度、失败中止与恢复。

4. 持久化层（内置数据库）  
- 复用现有数据库存储会话、round、执行事件、幂等记录。  
- 阶段一以 H2 为开发与测试基线，结构层预留 MySQL/PostgreSQL 适配位。  
- 阶段一不引入 Redis。

## 5.2 关键执行语义

1. 冲突感知并行  
- 默认域级冲突；关键动作提升到实体级冲突。  
- 读读并行，读写/写写串行。  
- 回写顺序保持与 tool_calls 原顺序一致。

2. 按 action 幂等  
- 支持 none/strong/windowed/describe-only。  
- 幂等键：sessionId + roundId + action + argsHash + toolCallId。

3. HANDOFF 触发  
- 连续同类错误 >=2。  
- 高风险动作。  
- 预算超限。  
- 状态冲突。  
- 触发后返回 handoff 载荷（reasonCode/nextAction/checklist）。

## 5.3 状态迁移白名单（阶段一）

允许迁移：

1. READY -> PLAN  
2. PLAN -> CALL  
3. CALL -> APPLY  
4. APPLY -> VERIFY  
5. VERIFY -> DONE  
6. VERIFY -> PLAN  
7. PLAN/CALL/APPLY/VERIFY -> FAILED  
8. FAILED -> HANDOFF  
9. HANDOFF -> PLAN（人工确认后）  
10. DONE -> READY（新任务）

非法迁移：统一返回 INVALID_STATE_TRANSITION，并触发 ask-human。

## 5.4 第三方框架职责映射

1. Temporal Java SDK  
- Workflow：回合驱动、并行分组、失败短路、恢复重入。  
- Activity：tool call 执行与结果封装。

2. Spring StateMachine  
- 协议态守卫：请求入站前校验当前 state 与目标迁移是否合法。  
- 非法迁移统一映射到四层错误模型。

3. 现有数据库（内置持久化）  
- 会话状态、回合事件、幂等键（唯一约束）持久化。  
- 阶段一先按 H2 方言落地，预留 MySQL/PostgreSQL 方言扩展。  
- 阶段一不引入 Redis。

---

## 6. 第一阶段改造范围（单 PR）

1. 后端
- [spark-ai-server/src/main/java/com/spark/ai/controller/AiSessionController.java](spark-ai-server/src/main/java/com/spark/ai/controller/AiSessionController.java)  
- [spark-ai-server/src/main/java/com/spark/ai/stills/StillsSessionService.java](spark-ai-server/src/main/java/com/spark/ai/stills/StillsSessionService.java)  
- [spark-ai-server/pom.xml](spark-ai-server/pom.xml)

2. 前端客户端适配
- [packages/spark-ai/src/session-backend.ts](packages/spark-ai/src/session-backend.ts)  
- [packages/spark-ai/src/runtime/session-orchestrator.ts](packages/spark-ai/src/runtime/session-orchestrator.ts)  
- [packages/spark-ai/src/tool-calling.ts](packages/spark-ai/src/tool-calling.ts)

3. 零兼容清理
- [spark-ai-server/src/main/java/com/spark/ai/controller/StillsController.java](spark-ai-server/src/main/java/com/spark/ai/controller/StillsController.java)  
- [packages/spark-ai/src/protocol-parser.ts](packages/spark-ai/src/protocol-parser.ts)

说明：本项按“全部下线 /api/stills/*”执行，不仅限会话子接口，包含 `/api/stills/chat` 与 `/api/stills/execute`。

4. 文档口径
- [packages/spark-ai/src/prompts/stills-prompts.ts](packages/spark-ai/src/prompts/stills-prompts.ts)  
- [docs/ai/README.md](docs/ai/README.md)

---

## 7. 非范围（阶段一不做）

1. Redis 分布式幂等/锁。  
2. OpenTelemetry 与告警平台落地（仅预留 trace 字段）。  
3. Camunda/Akka 等替代编排框架。  
4. 前端构建链去 Node。

---

## 8. 验证计划

1. 后端单测 + 集成测试  
- 协议版本、状态机迁移、并行冲突、幂等、handoff。

2. 前端协议适配冒烟  
- create/turn/append/conversation/destroy 能走通 v3。

3. 端到端核心链路回归  
- 一条成功链路。  
- 一条中止并恢复链路。  
- 一条并行冲突链路。  
- 一条幂等回放链路。

## 8.1 单 PR 交付拆分（PR 内四提交块）

为满足“单 PR 一次性交付”且控制风险，PR 内按以下顺序提交：

1. 提交块 A：协议入口与错误 envelope  
- 文件：AiSessionController + 协议 DTO。  
- 验证：版本校验与错误结构测试。

2. 提交块 B：状态机守卫与 HANDOFF 触发  
- 文件：StillsSessionService + 状态机配置。  
- 验证：迁移白名单与四类中止触发测试。

3. 提交块 C：并行冲突与幂等策略  
- 文件：StillsSessionService + 调度/幂等组件。  
- 验证：冲突并行测试与回放测试。

4. 提交块 D：零兼容清理与前端适配  
- 文件：StillsController/protocol.ts 清理 + 两个 session backend 客户端。  
- 验证：旧协议请求拒绝 + v3 冒烟 + E2E 核心链路。

---

## 9. 风险与缓解

1. 单 PR 变更面大。  
- 缓解：在单 PR 内按模块分提交，逐块自测。

2. Temporal 首次接入复杂。  
- 缓解：先接最小 workflow 骨架，再挂接完整执行动作。

3. 零兼容硬切导致旧调用瞬断。  
- 缓解：提交前完成调用点清单并同步前端客户端适配。

4. 无 Redis 时多实例幂等压力。  
- 缓解：阶段一以数据库事务 + 唯一键约束保证幂等主路径。

---

## 10. 自审记录（3 轮）

### 自审第 1 轮（完整性）

检查项：是否覆盖源码事实、业务目标、一问一答决策。  
问题：初稿未明确“仅 Temporal + 内置持久化，不依赖 Redis”的最终约束。  
修正：新增第 4 章第 12 条与第 7 章非范围第 1 条。

### 自审第 2 轮（一致性）

检查项：方案内容是否与“零兼容”一致。  
问题：初稿中“文档口径”未明确旧协议执行路径下线。  
修正：第 6 章新增零兼容清理清单，显式列出旧控制器与旧解析路径。

### 自审第 3 轮（可实施性）

检查项：是否可直接转实现任务。  
问题：并行冲突粒度和验证层级描述偏抽象。  
修正：第 5 章补充“默认域级 + 关键动作实体级”；第 8 章补充 4 条端到端回归最小样例。

结论：当前版本满足“源码对照 + 业务需要 + 一问一答约束 + 3 轮自审”。

---

## 11. 已确认项

阶段一数据库策略已确认：复用现有数据库，不新增 Redis 依赖。  
阶段一先按 H2 开发，预留 MySQL/PostgreSQL 方言层，再按目标环境切换 DDL 与索引策略。

---

## 12. 与 AI_FRONTEND_UNIFICATION_PLAN 对接映射（2026-04-19）

本章用于约束 [docs/ai/architecture/AI_FRONTEND_UNIFICATION_PLAN.md](docs/ai/architecture/AI_FRONTEND_UNIFICATION_PLAN.md) 与本 DM 文档的最终一致性。若出现冲突，以本 DM 文档为准。

### 12.1 协议入口映射

1. AI 统一方案中的“编辑链路入口”最终收敛为 `/api/ai/sessions` 主干。  
2. 不再新增平行 `stream-edit` 协议族，避免与 v3 统一入口冲突。  
3. 前端仅做 v3 客户端适配，不承载独立执行控制面。

### 12.2 执行语义映射

1. 并行模型：采用“冲突感知并行”（读读并行，读写/写写串行）。  
2. 幂等模型：按 action 配置，幂等键以 `sessionId + roundId + action + argsHash + toolCallId` 为准。  
3. 错误模型：统一四层 `severity/category/code/retryPolicy`。  
4. 中止模型：连续同类错误、高风险动作、预算超限、状态冲突触发 HANDOFF。

### 12.3 改造范围映射

1. 前端统一方案内涉及会话与编排的改动，必须落在第 6 章列出的阶段一文件范围内。  
2. 旧 stills 文本协议路径清理，必须遵循“零兼容硬切”策略，不保留长期双轨。  
3. 文档和提示词更新，必须同步反映“FC v3 唯一路径 + 旧协议下线”。

### 12.4 交付节奏映射

1. AI 统一方案的落地节奏必须对齐“单 PR 一次性交付”。  
2. 单 PR 内部按第 8.1 节四提交块顺序推进：
	- A：协议入口与错误 envelope
	- B：状态机守卫与 HANDOFF
	- C：并行冲突与幂等策略
	- D：零兼容清理与前端适配

### 12.5 验收映射（最小必过项）

1. v3 入口可用：create/turn/append/conversation/destroy 全链路通过。  
2. 状态机守卫可用：非法迁移稳定返回 `INVALID_STATE_TRANSITION`。  
3. HANDOFF 可用：四类触发条件均可观测。  
4. 并行与幂等可用：冲突链路与回放链路可复现。  
5. 零兼容生效：旧协议请求被拒绝且调用点已迁移。
6. 旧入口下线生效：`/api/stills/*`（含 chat/execute）请求被拒绝。

### 12.6 差异处理规则

1. 若 AI 统一方案出现与本 DM 文档冲突的接口或流程定义，应在 AI 文档中直接修订，不在实现阶段临时兜底。  
2. 若发现阶段一范围外需求（如 Redis、OTel、替代编排框架），统一延期到后续阶段，不并入本 PR。  
3. 若执行中发现数据库方言差异，保持“先 H2 验证、再扩展 MySQL/PostgreSQL”的既定策略。

---

## 13. 实施任务分解（按文件到函数级）

本章将第 8.1 节四提交块细化到可直接执行的任务单元。每个提交块均遵循“先测试后扩面”的顺序。

### 13.1 提交块 A：协议入口与错误 envelope

目标：统一入口、强制 v3、统一错误输出。

文件与任务：

1. [spark-ai-server/src/main/java/com/spark/ai/controller/AiSessionController.java](spark-ai-server/src/main/java/com/spark/ai/controller/AiSessionController.java)
- 统一 create/turn/append/conversation/destroy 的 protocolVersion 检查入口。
- 收敛错误返回结构为四层错误 envelope。
- 对非法请求参数返回可定位的 fail-fast 错误码。

2. 统一会话请求 DTO（旧 generate/iterate 请求 DTO 已删除）
- 明确 v3 必填字段最小集合与校验策略。
- 删除与旧协议耦合的输入字段或标记为不可用。

3. [spark-ai-server/src/test/java/com/spark/ai/controller/ControllersTest.java](spark-ai-server/src/test/java/com/spark/ai/controller/ControllersTest.java)
- 新增 protocolVersion 缺失/错误用例。
- 新增错误 envelope 结构断言用例。

提交块 A 完成判定：

1. 任一入口缺失 v3 时，返回稳定错误码与可读诊断。
2. 控制器层错误结构在测试中可重复断言。

### 13.2 提交块 B：状态机守卫与 HANDOFF 触发

目标：把协议态迁移白名单落地为统一守卫，并把中止路径收敛到 HANDOFF。

文件与任务：

1. [spark-ai-server/src/main/java/com/spark/ai/stills/StillsSessionService.java](spark-ai-server/src/main/java/com/spark/ai/stills/StillsSessionService.java)
- 落地 READY/PLAN/CALL/APPLY/VERIFY/DONE/FAILED/HANDOFF 迁移白名单。
- 非法迁移统一抛出 `INVALID_STATE_TRANSITION`。
- 实现 HANDOFF 四类触发判定与回包载荷（reasonCode/nextAction/checklist）。

2. 状态机配置类（若拆分）
- 增加状态与事件映射表，避免散落在业务逻辑分支中。
- 保证 `FAILED -> HANDOFF` 与 `HANDOFF -> PLAN`（人工确认）路径可测。

3. 后端测试（状态机/服务层）
- 覆盖合法迁移主链与非法迁移。
- 覆盖四类 HANDOFF 触发条件。

提交块 B 完成判定：

1. 非法迁移全量返回 `INVALID_STATE_TRANSITION`。
2. HANDOFF 触发后，返回载荷字段完整可消费。

### 13.3 提交块 C：并行冲突与幂等策略

目标：实现冲突感知并行与按 action 幂等，并验证回放安全性。

文件与任务：

1. [spark-ai-server/src/main/java/com/spark/ai/stills/StillsSessionService.java](spark-ai-server/src/main/java/com/spark/ai/stills/StillsSessionService.java)
- 实现读读并行、读写/写写串行的调度分组。
- 默认域级冲突，关键 action 提升到实体级冲突。
- 统一回写顺序与 tool_calls 原顺序一致。

2. 幂等组件（服务内或独立类）
- 落地幂等键：`sessionId + roundId + action + argsHash + toolCallId`。
- 支持 none/strong/windowed/describe-only 四种策略。
- 使用数据库唯一约束与事务保证阶段一幂等主路径。

3. 后端测试（并行/幂等）
- 冲突并行链路测试。
- 幂等回放链路测试。

提交块 C 完成判定：

1. 并行组可复现且无越序回写。
2. 同幂等键重复请求不产生重复副作用。

### 13.4 提交块 D：零兼容清理与前端适配

目标：下线旧协议路径，前端完全迁移到 v3 sessions 客户端。

文件与任务：

1. [spark-ai-server/src/main/java/com/spark/ai/controller/StillsController.java](spark-ai-server/src/main/java/com/spark/ai/controller/StillsController.java)
- 下线或显式拒绝全部旧 stills 入口（含 `/api/stills/chat`、`/api/stills/execute`、`/api/stills/session*`）。

2. [packages/spark-ai/src/protocol-parser.ts](packages/spark-ai/src/protocol-parser.ts)
- 清理旧 `@@` 文本协议解析与调用路径。

3. [packages/spark-ai/src/session-backend.ts](packages/spark-ai/src/session-backend.ts)
4. [packages/spark-ai/src/runtime/session-orchestrator.ts](packages/spark-ai/src/runtime/session-orchestrator.ts)
5. [packages/spark-ai/src/tool-calling.ts](packages/spark-ai/src/tool-calling.ts)
- 全面对齐 `/api/ai/sessions` 与 `protocolVersion=3`。
- 移除旧协议兼容分支，不保留静默 fallback。
- 保持失败可定位，明确暴露缺失上下文与错误码。

7. [docs/ai/README.md](docs/ai/README.md)
8. [packages/spark-ai/src/prompts/stills-prompts.ts](packages/spark-ai/src/prompts/stills-prompts.ts)
- 文档与提示词同步更新到 FC v3 唯一路径口径。

提交块 D 完成判定：

1. 旧协议请求拒绝行为稳定且可观测。
2. 前端端到端仅通过 v3 sessions 协议完成主链路。
3. `/api/stills/*` 全部返回下线语义，不再承载调试捷径。

### 13.5 每块统一验证顺序

1. 后端单测。
2. 后端集成测试。
3. 前端 typecheck。
4. 前端相关 Vitest。
5. 端到端最小链路回归。

### 13.6 PR 评审门禁（必须全部通过）

1. 不新增平行协议入口。
2. 不引入静默 fallback。
3. 不引入 Redis 依赖。
4. 不扩大到阶段一非范围能力。
5. 所有新增错误码都有测试与文档映射。
