# @spark-view/spark-ai

SPARK 的 AI 运行时包，采用业务注册架构：运行时负责 LLM-facing 实例、函数曝光与调用分发，业务层负责 page-design 编辑服务与具体领域能力。

## 主要职责

- `core`：业务注册、运行实例生命周期、`core@knowledge` 只读模型、函数调用与历史事件
- `business`：`page-design` 四文件编辑服务（`rule.json`、`pagedata.json`、`script.js`、`style.css`）和具体 knowledge payload provider
- `catalog`：组件目录投影与 DevSystem 预计算元数据

## 核心层语义（先读）

- **核心层是标准制定者**：统一定义业务能力向 LLM 暴露时的形态（业务信息 → 模块信息 → 函数信息），并提供注册入口与运行时承载。
- **标准不向后兼容**：不保留旧入口兼容层，只有新契约可用。
- **注册语义要点**：
  - 一个 `AiBusinessRegistration` 代表一个业务能力（如 `pageDesign`）。
  - 一个 `AiBusinessModuleRegistration` 代表一个模块（如 `nodeTree`、`dataset`）。
  - 一个 `AiFunctionRegistration` 代表可调用函数（如 `addNode`、`createTable`）。
  - 模块能力和函数能力都应以 `ts` 类实现标准接口/基类，避免运行时散落的对象字典。
- **实例语义**：
  - `businessId`：业务能力维度（能力定义 ID），例如 `pageDesign`。
  - `businessInstanceId`：业务实例维度（同一能力下的不同对象），例如“张三请假”和“李四请假”是两个实例。
  - `instanceId`：由核心层统一分配/管理的运行时实例。
- **会话归口**：同一 `(businessId, businessInstanceId)` 重入时恢复同一运行时实例；不同实例间互不污染。
- **事件能力**：核心层通过 `subscribe` 提供统一事件流，支持 UI 与业务服务监听生命周期、函数前后置和历史变更，避免在调用方之间重复维护通知链路。

## 分层入口

- `@spark-view/spark-ai/core`：核心运行时、协议类型与 knowledge provider registry
- `@spark-view/spark-ai/business`：业务能力（含 page-design）
- `@spark-view/spark-ai/catalog`：目录投影与 catalog 类型
- `@spark-view/spark-ai`：聚合入口（同时导出 core/business/catalog）

## 适用场景

- 页面模型的细粒度编辑与迭代
- 组件配置规格查询、参数荷载查询与工具执行前置引导
- AI 会话与本地编辑状态联动
- 启动实例采用 `startInstance({ businessId, businessInstanceId })`；同一业务能力+业务实例对会恢复同一运行时实例（不保留旧的兼容入口）

## 开发命令

```bash
pnpm --filter @spark-view/spark-ai run build
pnpm --filter @spark-view/spark-ai run typecheck
pnpm --filter @spark-view/spark-ai run test:run
```

## 进一步阅读

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [../../docs/ai/README.md](../../docs/ai/README.md)
