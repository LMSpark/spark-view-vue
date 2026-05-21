# SPARK AI 源码职责边界

> 本文记录当前 `@spark-view/spark-ai` 的源码边界。旧公共入口和旧会话/投影内核已经移除；新代码只使用 `schema`、`module-semantic`、`host` 三块。

## 一句话结论

`@spark-view/spark-ai` 是框架无关的 AI Host 与 module-semantic 协议包。它负责 LLM JSON Schema、语义模块协议、Host 会话记录、工具循环和传输契约；它不拥有 page-design、leave-request 等业务 live state，也不导入 Vue、Element Plus、Router 或 `spark-page-config`。

## 当前物理分层

```text
packages/spark-ai/src/
├── index.ts              # 包根公共出口：schema + module-semantic + host
├── schema/               # LLM JSON 值、JSON Schema helper、LlmSchemaValidator
├── module-semantic/      # ModuleKind/ModulePath/ModuleSemanticRuntime
├── host/                 # AiHostBusinessRegistration、session store、tool loop、transport
└── tests/                # schema、module-semantic、host transport 测试
```

`package.json` 只暴露：

- `@spark-view/spark-ai`
- `@spark-view/spark-ai/schema`
- `@spark-view/spark-ai/module-semantic`
- `@spark-view/spark-ai/host`

## 职责边界

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| `schema` | `LlmJsonValue`、`LlmJsonSchema`、参数 schema DSL、`LlmSchemaValidator` | 业务语义、工具路由、会话状态 |
| `module-semantic` | 固定 6 个协议工具、kind/attribute/action 元数据、路径导航、action 参数校验 | Host 会话历史、模型传输、业务 live state |
| `host` | `AiHostBusinessRegistration` 注册表、会话历史、工具调用循环、SSE/HTTP transport 契约 | 具体业务动作、页面配置文件读写、业务生命周期判断 |
| `spark-page-config` assistant | 注册 pageDesign/manualLeave 业务，提供 ModuleKind 和业务服务 | 定义通用 AI 协议、修改 Host 工具循环 |

## 调用链路

1. 业务创建 `ModuleSemanticRuntime`。
2. 业务注册标准 `ModuleKind` class；动作实现挂在 `ModuleKind.runner(ctx, actionName, args)`，列表/查找挂在 `list` / `find` 委托。
3. 业务返回 `AiHostBusinessRegistration`，其中 `runtime` 字段直接指向该 `ModuleSemanticRuntime`。
4. Host 启动会话，调用 `runtime.getLlmTools()` 暴露固定 6 个协议工具。
5. LLM 通过 `listChildren("/")`、`findInstance("/", kind, {})`、`describeKind(kind)` 发现能力。
6. LLM 通过 `invokeAction(path, actionName, args)` 执行业务动作。
7. 协议层按 action 的 `paramsSchema` 校验参数，再委托目标 `ModuleKind.runner`。
8. Host 记录 `AiHostSessionRecord / AiHostHistoryEntry / AiHostFunctionCallResult`。

## 维护红线

- 不要让 `spark-ai` 直接或间接导入 `spark-page-config`。
- 不要让 `spark-ai` 直接导入 Vue、Element Plus、Router 或页面组件。
- 不要在 `schema`、`module-semantic` 中引入框架依赖。
- 不要恢复旧 core/protocol 公共 subpath。
- 不要恢复旧会话/投影/adapter 过渡层。
- 不要把业务 live state 放进 Host session store；业务 release 只清 live state，不删除历史。
- 不要用私有参数 DSL；函数参数必须是标准 JSON Schema object root。
- 不要绕过 `listChildren`、`findInstance`、`describeKind`、`invokeAction` 这条发现与调用链路。
