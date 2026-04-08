# @spark-view/spark-ai

SPARK 的 AI 运行时包，负责把受约束的 AI 输出接入现有页面平台，而不是直接生成和接管整个前端代码仓库。

## 主要职责

- SSE 对话与事件流协同
- Stills 执行链与 AI 页面生成闭环
- 组件目录、提示词与 AI 运行时之间的桥接

## 适用场景

- 前端页面配置生成与迭代
- AI 调试链路接入
- Stills 约束下的消息处理和结果落盘

## 开发命令

```bash
pnpm --filter @spark-view/spark-ai run build
pnpm --filter @spark-view/spark-ai run typecheck
pnpm --filter @spark-view/spark-ai run test:run
```

## 进一步阅读

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [../../docs/ai/README.md](../../docs/ai/README.md)