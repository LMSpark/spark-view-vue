# @spark-view/spark-ai

SPARK 的 AI 运行时包。核心层采用递归模块注册架构：运行时负责面向 LLM 的实例、模块函数曝光、活动路径、函数调用分发、历史和事件；具体模块实现负责领域状态与真实执行。

## 主要职责

- `core`：递归模块注册、运行实例生命周期、函数调用、活动路径、历史事件和知识负载提供者注册表
- `business`：`page-design` 四文件编辑模块（`rule.json`、`pagedata.json`、`script.js`、`style.css`）和具体知识负载提供者
- `catalog`：组件目录投影与 DevSystem 预计算元数据

## 核心层语义

- **统一叫模块**：不再区分业务、根模块、子模块；模块通过 `modules` 递归形成树。
- **函数路径**：action 使用 `module/.../function`，例如 `pageDesign/nodeTree/addNode`。
- **简单接口**：公共契约以 `AiModuleRegistration`、`AiFunctionRegistration` 等普通接口为主，不要求业务开发者维护多层泛型约束。
- **实例语义**：
  - `moduleId`：顶层模块 ID，例如 `pageDesign`。
  - `moduleInstanceId`：调用方提供的顶层模块实例 ID，例如某个页面编辑会话。
  - `instanceId`：由核心层统一分配/管理的运行时技术实例 ID。
- **父级实例参数**：模块可声明 `instanceParam`，运行时会把父级模块实例 ID 投影进面向 LLM 的参数 schema；执行前剥离这些字段，业务函数从 `FunctionExecutionContext.moduleInstances` 读取。
- **活动路径**：宿主可通过 `setActivePath` / `clearActivePath` 管理当前选中的模块实例路径；函数执行不会自动改变活动路径。

## 分层入口

- `@spark-view/spark-ai/core`：核心运行时、协议类型与知识负载提供者注册表
- `@spark-view/spark-ai/business`：业务模块（含 page-design）
- `@spark-view/spark-ai/business/page-design`
- `@spark-view/spark-ai/catalog`
- `@spark-view/spark-ai`：聚合入口

## 开发命令

```bash
pnpm --filter @spark-view/spark-ai run build
pnpm --filter @spark-view/spark-ai run typecheck
pnpm --filter @spark-view/spark-ai run test:run
```

## 进一步阅读

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [../../docs/ai/README.md](../../docs/ai/README.md)
