# SPARK AppWorks

> AI 编码助手在本仓库工作时，修改任何代码前必须先阅读并遵循下方列出的文档。

## 项目概述

低代码应用平台。pnpm monorepo 结构。前端：Vue 3 + TypeScript + Element Plus。后端：Spring Boot（Java），位于 `spark-ai-server/`。

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

**修改任何代码前，必须完整阅读以下文档：**

1. **代码修改协议** — `docs/ai/AI_CODE_CHANGE_PROTOCOL.md`
   - 7 阶段门控工作流：深度研读（含复述确认）→ 复杂度分级 → 反向提问 → 方案计划书 → 用户审核 → 编码实施 → 知识沉淀
   - HARD-GATE：用户未明确说"通过/开工"，禁止写任何代码
   - 严格一问一答，每题 5 个以上选项，题数由复杂度等级决定（简单 3-5、中等 5-8、复杂 8-10）
   - 研读后必须复述理解并等用户确认，禁止跳过
   - 跨会话委派只传结构化持久层文件，禁止传聊天记录
   - context window 超 40% 时主动建议压缩重启

2. **代码生成行为规范** — `docs/ai/ai-code-generation-behavior.md`
   - 代码按层次组织，禁止大平层（interface / class / 文件 / 文件夹四种反模式）
   - 字典式命名 `[领域路径][角色]`，矩阵式命名禁止
   - 函数签名最多 3 个位置参数，超出用 options object
   - 导出约束、错误处理、注释规则

3. **AI 模型规范** — `docs/ai/AI_MODEL_SPEC.md`
   - 业务 class 必须继承 `SparkAIModel`，`toJson()` 是唯一强制协议方法
   - 模型 class = LLM 知识真源，无额外 registry、无 metadata 第二真源
   - 知识有界：只看当前 root 实例 + 已引用子 model

4. **spark-ai 工作流** — `docs/ai/spark-ai-workflow.md`
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
