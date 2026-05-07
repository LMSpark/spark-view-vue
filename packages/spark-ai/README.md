# @spark-view/spark-ai

SPARK 的 AI 运行时包，负责把 Function Calling 会话、组件知识目录和页面编辑工具接入现有页面平台。

## 主要职责

- Function Calling 会话循环、工具 schema 生成与本地函数调度
- `core@knowledge` 查询函数与组件 payload 目录桥接
- `page-design` 四文件编辑运行时：`rule.json`、`pagedata.json`、`script.js`、`style.css`

## 适用场景

- 页面模型的细粒度编辑与迭代
- 组件配置规格查询、参数荷载查询与工具执行前置引导
- AI 会话后端、SSE 调试事件与本地编辑状态联动

## 开发命令

```bash
pnpm --filter @spark-view/spark-ai run build
pnpm --filter @spark-view/spark-ai run typecheck
pnpm --filter @spark-view/spark-ai run test:run
```

## 进一步阅读

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [../../docs/ai/README.md](../../docs/ai/README.md)