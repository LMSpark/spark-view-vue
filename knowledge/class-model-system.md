# ClassModel 知识体系

### 模型 class 是唯一知识真源

- **场景**：AI 需要理解某个业务模型有哪些字段和 API
- **规则**：直接读 class 的 TS 声明 + JSDoc。没有额外的 registry、没有约定标签、没有 metadata 第二真源。`DtsClassModelBundle` 是工具索引（给 LLM 生成 JSON Schema 用），不是设计中心。
- **违反后果**：依赖过时的文档或手写目录做判断，产生与代码实际行为不一致的方案

### 知识有界——不要全量灌入

- **场景**：AI 需要为某个业务操作查找可用字段和方法
- **规则**：只看当前会话 root 实例上的字段和 API + 已引用的子 model class。不看整包 dts manifest 全量，不看仓库里所有 export class。
- **违反后果**：context window 撑爆，模型注意力退化，后续指令遵循率显著下降

### 工具链路有固定顺序

- **场景**：AI 执行页面设计任务
- **规则**：`model_query → model_class_guide / model_attribute_guide / model_action_guide → model_script`。组装 UI 前只查模型动作，通过 `model_script` 执行对象链调用。禁止提交 `/kind[id]` 形式的路径参数。
- **违反后果**：跳过 guide 直接 script → 闸门拦截强制回退；路径参数格式错误 → script 执行失败

### 渐进澄清是 BFS 不是填表

- **场景**：AI 通过 `human_question` 向用户提问补全参数
- **规则**：参数表随知识探索逐层生长，属性链 BFS 走到叶子、当前层 required 已补全、无新子 kind 待问，即可进入生产。收敛 = 探索到底，不是填满预设表。
- **违反后果**：一次性问全部问题 → 用户思考负担过重、信息过载；或者没走到叶子就声称收敛 → 缺少必要参数

### Host 相位门控会强制纠偏

- **场景**：AI 在工具循环中只查不动作，或提交伪 tool_call
- **规则**：读完 `model_action_guide` 仍只查目录 → Host 强制 `model_script`；`model_script` 失败 → 按 RECOVERY_HINT 修正；正文伪 tool_call → Host 强制真实 OpenAI tool_calls。
- **违反后果**：不遵循门控节奏 → 每轮都被强制纠偏，效率极低

### 编译生成物的生命周期

- **场景**：修改了模型 class 的字段或 JSDoc，运行时知识没更新
- **规则**：`generated/dts-class-model/` 由 `pnpm run generate:class-model-surface` 生成。修改模型后需要重新生成，否则运行时知识是旧的。运行时通过 Web Worker（Comlink）按需加载 shard，主线程不加载全量 manifest。
- **违反后果**：AI 在运行时读到的是旧版字段/API，基于过期知识生成错误脚本

### SparkAIModel 的最小协议

- **场景**：新增一个 AI 可编辑的业务 class
- **规则**：必须 `extends SparkAIModel`（`packages/spark-utils/src/ai-model.ts`），协议只强制 `toJson()`。IO 在 `save()/load()` 内部，依赖经 options 传入，不挂公开字段。不要为每模型创建 interface，不要创建 `Ixxx` 或 `XxxImpl`。
- **违反后果**：不继承 SparkAIModel → ClassModelRuntime 无法识别和路由该模型；机械创建 interface → `verify:ai-codegen` 报 interface 违规
