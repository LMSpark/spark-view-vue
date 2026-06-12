# spark-ai 架构

## 当前主线

spark-ai 的 AI 知识面只来自 TypeScript 声明：

```text
源码 class + JSDoc
  -> vue-tsc 生成 declarations/**/*.d.ts
  -> scripts/generate-dts-class-model.mjs
  -> generated/dts-class-model/manifest.json
  -> Web Worker 按 className 加载对应 JSON
```

没有额外 registry、没有额外 catalog、没有约定标签。`.d.ts` 是编译期知识边界，运行时实例是执行边界。

## 运行时

| 模块 | 职责 |
|---|---|
| `ClassModelRuntime` | 暴露并校验七个工具，路由到 knowledge provider 或 script executor |
| `ClassModelKnowledgeService` | 把已加载的 DTS class-model JSON 投影成 query / guide 文本 |
| `DtsClassModelBundleLoader` | 按 root className 加载可达 class JSON |
| `WorkerClassModelKnowledgeProvider` | 在浏览器 Worker 中按需加载 DTS JSON，避免主线程塞入全量知识 |
| `ClassModelAgentAdapter` | 把业务实例、knowledge provider 和 runtime 接入 ToolLoop |

## 工具闭集

| 工具 | 参数 |
|---|---|
| `model_query` | `kind?`, `keyword?`, `includeMembers?` |
| `model_class_guide` | `kind` |
| `model_attribute_guide` | `kind`, `attributeName` |
| `model_action_guide` | `kind`, `actionName` |
| `model_script` | `script` |
| `human_question` | `context`, `reason`, `missingFacts?`, `candidateOptions?` |
| `agent_complete` | `summary` |

未知工具名和多余参数都 fail-fast，不做额外别名映射。

## 生成命令

```bash
pnpm run generate:class-model-surface
pnpm run generate:class-model-surface:delete-dts
```

第二个命令会在生成 JSON 后删除临时 `.d.ts`，用于审核完成后的编译流水线。

## 业务接入

pageDesign / projectPlanning 在 app 层选择 root className 和业务实例：

- pageDesign：`ProjectModel`
- projectPlanning：按业务注册选择 root model

**全仓 AI 主文档：** [`docs/spark-ai-platform.md`](docs/spark-ai-platform.md) · 接入 checklist 附录 [`docs/business-capability-onboarding.md`](docs/business-capability-onboarding.md)

AI 通过公开字段和公开方法工作。class 之间只能通过公开属性暴露子 class 或子 class 数组；序列化使用 `toJson()`，恢复入口按模型需要提供 `fromJson()` 或 `fromJsonString()`。
