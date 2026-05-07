# @spark-view/spark-ai

SPARK 的 AI 运行时包，采用业务注册架构：运行时负责 LLM-facing 实例、函数曝光与调用分发，业务层负责 page-design 编辑服务与具体领域能力。

## 主要职责

- `core`：业务注册、运行实例生命周期、`core@knowledge` 只读模型、函数调用与历史事件
- `business`：`page-design` 四文件编辑服务（`rule.json`、`pagedata.json`、`script.js`、`style.css`）和具体 knowledge payload provider
- `catalog`：组件目录投影与 DevSystem 预计算元数据

## 分层入口

- `@spark-view/spark-ai/core`：核心运行时、协议类型与 knowledge provider registry
- `@spark-view/spark-ai/business`：业务能力（含 page-design）
- `@spark-view/spark-ai/catalog`：目录投影与 catalog 类型
- `@spark-view/spark-ai`：聚合入口（同时导出 core/business/catalog）

## 适用场景

- 页面模型的细粒度编辑与迭代
- 组件配置规格查询、参数荷载查询与工具执行前置引导
- AI 会话与本地编辑状态联动

## 开发命令

```bash
pnpm --filter @spark-view/spark-ai run build
pnpm --filter @spark-view/spark-ai run typecheck
pnpm --filter @spark-view/spark-ai run test:run
```

## 进一步阅读

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [../../docs/ai/README.md](../../docs/ai/README.md)
