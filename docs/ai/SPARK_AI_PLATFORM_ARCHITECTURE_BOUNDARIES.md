# SPARK AI Platform 架构边界

> 状态：已定稿，作为 SPARK AI Platform、`@spark-view/spark-ai`、App AI Center、AI Backend 和业务注册边界的 SSOT。
> 日期：2026-05-22

## 命名分层

| 名称 | 对应对象 | 语义 |
| --- | --- | --- |
| SPARK AI Platform / AI 平台 | 前端 APP、`spark-ai`、AI Backend、业务能力注册组成的整体 | 产品与架构总称 |
| App AI Center / AI 中心 | APP 级 AI 入口、面板、传输装配 | 用户入口与应用集成层 |
| Spark AI Host | `@spark-view/spark-ai` 的 `host` 子包 | 会话记录、工具循环、transport 契约 |
| Module Semantic | `@spark-view/spark-ai/module-semantic` | 固定 6 个协议工具、kind/action 语义发现与调用 |
| AI Backend | `spark-ai-server` 中的 LLM 会话、模型调用、持久化、SSE stream | 后端会话与模型网关层 |
| AI Business Kinds | 业务服务注册的 ModuleKind | 业务能力接入层 |

## 定稿结论

业务工具链路：

```text
业务 service
  -> ModuleKind
  -> ModuleSemanticRuntime
  -> AiHostBusinessRegistration
  -> Host tool loop
  -> AI Backend <=> LLM
```

一句话边界：

`App AI Center` 负责用户入口和传输装配；`spark-ai/host` 负责会话历史、工具循环和 transport 契约；`spark-ai/module-semantic` 负责语义发现、路径导航和参数校验；`AI Backend` 负责 LLM 会话、模型调用、持久化和 SSE 输出；业务服务拥有业务状态和业务动作实现。

## 包职责边界

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| App AI Center / AI 中心 | 打开 AI 面板；装配 transport；把用户输入送入 Host | 导入 page-config 业务实现；创建业务 service；管理业务 live state |
| `spark-ai/schema` | LLM JSON 值、标准 JSON Schema helper、参数校验 | 业务语义、工具循环 |
| `spark-ai/module-semantic` | kind/action 元数据、`listChildren/findInstance/describeKind/invokeAction` 协议、action 参数校验 | Host 会话历史、模型传输、业务状态 |
| `spark-ai/host` | `AiHostBusinessRegistration` 注册表、会话历史、工具调用循环、transport 契约 | 具体业务动作、页面配置文件读写、业务生命周期判断 |
| AI Backend | LLM 会话、模型调用、消息持久化、SSE stream | 前端业务函数执行；页面 live state；APP UI 状态 |
| 业务服务 | 持有业务状态；声明 kind/action；通过 `ModuleKind.runner`、`list`、`find` 委托执行副作用和发现 | 管理 LLM 会话；重写 `spark-ai` 通用协议 |

## 发现与调用协议

1. `listChildren("/")` 获取可用 kind。
2. `findInstance("/", kind, {})` 获取当前业务实例。
3. `describeKind(kind)` 获取 action 的 `paramsSchema`、`resultSchema`、`usageRules`、`failureModes`、`example`。
4. `invokeAction(path, actionName, args)` 执行业务动作。

## 禁止事项

- 不恢复旧 core/protocol 公共 subpath。
- 不恢复旧会话/投影/adapter 过渡层。
- 不把业务 live state 放入 Host session store。
- 不让 `spark-ai` 导入 `spark-page-config`。
- 不使用私有参数 DSL，action 参数必须是标准 JSON Schema object root。
