# Core 阅读顺序与功能分区

这个目录是 SPARK AI runtime 的核心层。它只负责契约、协议、知识注册和内存运行时编排，不直接拥有业务服务生命周期。

## 一、入口导出

- `index.ts`
  - 对外统一导出 core 能力。
  - 导出顺序按“业务契约 -> 调用协议 -> 参数校验 -> 知识负载 -> 运行时编排”排列。

## 二、协议与契约

- `protocol/business-contracts.ts`
  - 定义业务注册、模块注册、函数注册、运行时实例、事件、历史、快照和公共 API。
  - 推荐先读这里，因为后续 runtime 文件都围绕这些类型工作。

- `protocol/parameter-schema.ts`
  - 参数 schema 的单一事实源。
  - 负责把叶子字符串、显式 DSL、简写对象和 unknown 归一成 validator 可识别的结构。

- `protocol/llm-params-validator.ts`
  - 校验 LLM 反序列化后的 JSON 参数。
  - 时序是：根对象检查 -> schema 归一 -> required 合并 -> 递归节点校验 -> oneOf 组合校验。

- `protocol/invocation-helpers.ts`
  - 放置和具体模型 SDK 无关的调用协议工具。
  - 包括 action 地址解析、错误归一、JSON 对象抽取和 token usage 格式化。

- `protocol/knowledge-payload-contracts.ts`
  - 定义知识负载 provider 的查询和指南接口。
  - 适合 catalog、组件知识、数据集等外部知识源接入。

## 三、知识注册

- `knowledge/payload-provider-registry.ts`
  - 内存级知识 provider 注册表。
  - 调用路径是：注册 provider -> 按 payloadRef 查询摘要 -> 按 key 获取完整 guide。

## 四、运行时编排

- `runtime/ai-runtime-support.ts`
  - `AiRuntime` 的内部支持件。
  - 包含事件中心、业务投影器、历史写入器和轻量参数校验器。

- `runtime/ai-runtime.ts`
  - 核心运行时编排器。
  - 主时序是：registerBusiness -> startInstance -> appendMessages -> executeFunctionCall -> stopInstance。

## 五、核心边界

- core 会 clone 对外快照，避免调用方修改内部状态。
- core 只校验 action、实例状态、轻量参数结构和业务健康状态。
- 业务资源释放、真实函数逻辑和服务健康状态由业务层实现并注册进 runtime。
