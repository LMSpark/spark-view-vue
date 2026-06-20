# SPARK AppWorks

> AI 编码助手在本仓库工作时，修改任何代码前必须先阅读并遵循下方列出的文档。

## 项目概述

低代码应用平台。pnpm monorepo 结构。前端：Vue 3 + TypeScript + Element Plus。后端：Spring Boot（Java），位于 `spark-ai-server/`。

## AI 编码赋能层边界

`AGENTS.md` 是 AI 编码助手在本仓库生成代码、阅读项目事实、执行验证和沉淀知识的纲领性入口。

- `docs/ai/`、`knowledge/`、`notes/`、`ai-coding-kit/` 都属于 AI 编码赋能层，必须对接本项目真实代码、路径、约束和踩坑记录
- 赋能层文档不替代产品层源码、模型 class、JSDoc 和产品文档；涉及产品事实时必须回到对应代码或产品文档确认

### `notes/` 临时记录与度量管理

- 文件分类：研读锚点写入 `notes/research-<task-slug>.md`；方案计划写入 `notes/plan-<task-slug>.md`；执行效果度量统一追加到 `notes/ai-code-metrics.md`
- 文件名格式：`<task-slug>` 必须是具体任务主题的 kebab-case 英文短语；禁止日期、版本号、`notes`、`draft`、`final`、`latest`、`temp` 等低信号词
- 状态管理：计划文件顶部必须写 `状态：draft | approved | implementing | blocked | superseded`；用户审核前是 `draft`，用户明确“通过/开工”后改为 `approved`，开始实施后改为 `implementing`
- 状态变更：方案前提失效或用户改变方向时，先把原计划标为 `superseded` 并写明替代方案；实施受阻且无法继续时标为 `blocked` 并写明阻塞原因
- 完成处理：计划执行完成并验证通过后，删除对应 `notes/plan-*`，不保留“完成版方案”；可复用规则沉淀到 `knowledge/`，效果度量追加到 `notes/ai-code-metrics.md`
- 研读锚点处理：`notes/research-*` 按跨会话需要保留；若只服务一次性任务且已无复用价值，完成后可删除；禁止把历史研读当作当前产品事实源
- 度量台账处理：`notes/ai-code-metrics.md` 是长期过程数据，只记录 AI 编码任务的复杂度、返工、审查和存活率；它不是执行计划、产品路线图或产品架构事实源

## 构建与验证

```bash
pnpm install              # 安装依赖
pnpm run dev              # 本地开发服务器
pnpm run typecheck        # TypeScript 类型检查（修改代码前必须先跑）
pnpm run lint             # ESLint
pnpm run test             # Vitest 单元测试
pnpm run verify:rules     # AI 代码规则全量检查（arch + deps + pages-config + ai-codegen + docs + class-model + ai-model）
pnpm run verify           # typecheck + lint + verify:rules（完整门禁）
```

单包操作：

```bash
pnpm --filter @spark-appworks/<pkg> run typecheck
pnpm --filter @spark-appworks/<pkg> run lint
pnpm --filter @spark-appworks/<pkg> run test
```

## 依赖管理

- 工作区基础依赖版本真源在 `pnpm-workspace.yaml` 的 `catalog:` 段，子包用 `"catalog:"` 引用，禁止重复写死版本
- 新增依赖时：先确认应加在哪个包的 `package.json`，再确认版本号是否应走 catalog
- 禁止未经用户同意修改 `pnpm-lock.yaml`

## AI 工作规程（强制）

**修改任何代码前，必须完整阅读 [ai-coding-kit/AGENTS.md](ai-coding-kit/AGENTS.md)**——它是 AI 编码标准的完整主体，包含：

- 第 0 章 治理优先级
- 第 1 章 代码修改协议（7 阶段强制工作流：深度研读含复述确认 → 复杂度分级 → 反向提问 → 方案计划书 → 用户审核 → 编码实施 → 知识沉淀）
- 第 2 章 代码生成行为规范（代码组织层次、interface/class 命名、函数签名、导出约束、硬门禁）
- 第 3 章 跨会话委派协议（EPSS）

### SPARK 落地要点（写死值）

- **HARD-GATE**：用户未明确说"通过/开工"，禁止写任何代码
- **严格一问一答**，每题 5 个以上选项；题数由复杂度等级决定（简单 3-5、中等 5-8、复杂 8-10）
- **研读后必须复述理解并等用户确认**，禁止跳过
- **跨会话委派只传结构化持久层文件**（`notes/research-*`、`notes/plan-*`、验证结果），禁止传聊天记录
- **context window 超 40% 时主动建议压缩重启**
- 目录约定：研读锚点 `notes/research-<task-slug>.md`；方案计划 `notes/plan-<task-slug>.md`（顶部写 `状态：draft | approved | implementing | blocked | superseded`）；度量台账 `notes/ai-code-metrics.md`；知识沉淀 `knowledge/`
- 验证命令：`pnpm run typecheck` → `pnpm run lint` → `pnpm run test` → `pnpm run verify:rules`（完整门禁 `pnpm run verify`）

### SPARK 产品文档（ai-coding-kit 不覆盖，必读）

1. **AI 模型规范** — `docs/ai/AI_MODEL_SPEC.md`
   - 业务 class 必须继承 `SparkAIModel`，`toJson()` 是唯一强制协议方法
   - 模型 class = LLM 知识真源，无额外 registry、无 metadata 第二真源
   - 知识有界：只看当前 root 实例 + 已引用子 model

2. **spark-ai 工作流** — `docs/ai/spark-ai-workflow.md`
   - 工具循环、相位门控、渐进澄清（`human_question`）
   - 知识消费顺序：`model_query → model_class_guide / model_attribute_guide / model_action_guide → model_script`

## 知识库

过去工作中积累的隐含规则和踩坑记录：

- `knowledge/` 目录 — 开始新任务前，先读取相关领域的知识文件
- 每完成一个任务后，如发现非显而易见的规则或陷阱，按 `knowledge/README.md` 的格式沉淀

## Monorepo 结构

```
packages/
  spark-ai/              — AI Agent 运行时、ClassModel、工具循环
  spark-component/       — Vue UI 组件
  spark-data/            — DataSet、数据管理
  spark-project-model/   — 项目模型、页面配置、导航
  spark-utils/           — 共享工具，SparkAIModel 基类
src/                     — 应用壳、Vue 视图、前端服务
spark-ai-server/         — Java Spring Boot 后端（SSE、会话、LLM 代理）
generated/               — 自动生成（dts-class-model 等）
tests/                   — 集成与冒烟测试
```

## Git 规范

- 只在 feature 分支上工作，禁止直接修改 master/main
- 提交格式：`<type>(<scope>): <description>`，详见 `CONTRIBUTING.md`
- 允许的 scope：`deps`, `docs`, `scripts`, `spark-data`, `spark-app`, `spark-ai`, `spark-component`, `spark-utils`, `spark-project-model`
- 禁止自动 push，由用户显式触发

## 禁止事项

- 未完成 7 阶段协议就修改代码
- 研读代码后不复述理解就进入提问阶段
- 猜测项目行为——必须读代码确认，本项目创新内容多
- 未经用户同意引入新依赖或修改 `pnpm-lock.yaml`
- 顺手重构、顺手清理、计划外优化
- 自动格式化、批量重命名、未要求的文档补充
- 跨会话传递完整聊天记录（只传持久层文件）
- context window 膨胀到出现重复/不一致/遵循率下降仍不压缩
- 非 allowlist `interface`、`Ixxx`/`XxxImpl` 命名、TypeScript `namespace`、`export *`
