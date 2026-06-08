# ClassModel 反射层定型与隔离落地方案

> 状态：执行审计文档。
> 目标：先把 `ClassModel` 作为新 VCM-native 知识层的稳定中间形态落地到 `packages/spark-ai/src/vcm-native/`，不与旧 `modules/*` 协议系统混写。

## 1. 主线

```text
现有 runtime.generated.json
  保留池化去重 / $defs / schema 标准化
      -> vcm-native 读取并转换为 ClassModel
      -> guide 前按需渲染 d.ts-like + JSDoc
      -> LLM 生成 vcm_script
```

本阶段不强制改写 `*.runtime.generated.json` 真源。`ClassModel` 是稳定 JS/TS 投影层，旧 metadata 只作为输入适配对象。

## 2. 新目录

```text
packages/spark-ai/src/vcm-native/
  class-model/
  projection/
  tools/
  runtime/
  knowledge/
  tests/
```

新协议代码只放在 `vcm-native` 下。旧 `modules/internal|runtime|knowledge|metadata` 不继续扩写新协议逻辑，后续旧系统可整目录清理。

## 3. ClassModel 形态

```ts
type ClassModel = {
  kind: string
  className: string
  name: string
  declaration: string
  jsdoc: JsDocMeta
  constructor?: ConstructorMeta
  attributes: AttributeMeta[]
  methods: MethodMeta[]
}
```

核心语义：

- `attributes` 是 class 对外可见的数据入口，不区分源码字段或 getter。
- `methods` 是 class public methods，不等于 OpenAI function tools。
- `childModels` 是模型之间的入口边：
  - `attribute`：属性指向子模型。
  - `return`：方法返回值指向子模型。
  - `callback-param`：方法通过回调参数把子模型交给调用方。

`editNodeTree(run: (tree: SparkNodeTree) => ...)` 和 `editDataSet(run: (tool: DataSetCrudTool) => ...)` 必须是 `callback-param` 子模型，不是 return 子模型。

## 4. JSDoc 与投影

JSDoc 真源必须在具体 class / constructor / attribute / method 的源码首次声明处维护。generator 只负责把源码 JSDoc 搬运成 metadata 的 `jsdoc` 字段；`vcm-native` 只读取，不重新发明语义。

跨包反射时，generator 必须优先读取 `tsconfig.catalog.json` 的 `paths`，把 workspace package import 解析到 `packages/*/src`。如果某个外部包没有源码 path，才允许退到已构建的 `.d.ts` 作为类型入口；`.d.ts` 不能成为 JSDoc 语义真源。

迁移期兼容旧 metadata 中已有的 `description`、`usageRules`、`requiredBeforeCall`、`failureModes`，但这些只是旧字段兜底；一旦 `jsdoc` 存在，`ClassModel.jsdoc.summary/tags/raw` 以 `jsdoc` 为 SSOT。

d.ts-like 文本只在 guide 前按需渲染，不写入 generated JSON。

## 5. 工具与 runtime 边界

7 个工具闭集只在 `packages/spark-ai/src/vcm-native/` 内落地为独立运行时投影：

```text
vcm_query
vcm_model_guide
vcm_attribute_guide
vcm_method_guide
vcm_script
human_question
agent_complete
```

本阶段不接入旧 agent loop，不改旧 `modules/runtime` 注册协议。`VcmNativeRuntime` 只接收 `ClassModelDocument`、component catalog、script executor 等显式依赖，并把它们投影成上述 7 个 OpenAI tools。

## 6. 跨构建迭代计划

跨包反射必须显式区分“源码语义”和“构建产物类型”。源码 class 是 JSDoc/VCM 语义 SSOT；构建产物只用于验证发布类型没有滞后。

### 6.1 阶段 A：源码优先反射

目标：不依赖 package build，也能从 workspace 源码反射完整 ClassModel。

- generator 读取 `tsconfig.catalog.json` 编译选项。
- workspace 包名 import 通过 `paths` 指到 `packages/*/src`。
- 递归发现子模型时，优先使用源码 class declaration。
- 如果 TypeScript 仍解析到 `dist/types/*.d.ts`，必须用源码 class 索引映射回 `src/*.ts`。
- 验收命令：`pnpm run generate:module-metadata` 与 ClassModel 投影测试。

### 6.2 阶段 B：构建产物一致性检查

目标：确认 package build 后的 `.d.ts` 没有落后于源码语义，但不把 `.d.ts` 设为语义真源。

- 对参与 VCM 反射的包执行最小构建或 declaration build。
- generator 支持 `--verify-build-consistency`：源码反射生成一次，type-entry 入口生成一次，然后对比关键 API metadata：`kind/className/constructor/actions/attributes/jsdoc.summary`。
- 发现 `.d.ts` 与源码反射不一致时，诊断为 build stale 或 declaration emit 丢注释。
- 失败处理：先修 build/declaration 输出链路，再重新生成 metadata；不在 ClassModel 投影层补猜测逻辑。

### 6.3 阶段 C：生成物 provenance

目标：让每个 ClassModel 成员能审计到来源。

- generator 为 model/constructor/attribute/method 记录最小 source provenance：`file/line/className/memberName`。
- provenance 指向源码声明；如果类型入口来自 `.d.ts`，额外记录 `typeEntryFile`。
- guide 默认不展示 provenance，只在诊断或审计模式输出。

### 6.4 阶段 D：CI 串联

目标：把跨构建流程变成稳定红绿灯。

- 快速路径：`pnpm run verify:vcm-native`。
- 完整路径：`pnpm run verify:vcm-native:full`。
- CI 失败时按阶段定位：源码反射失败、build stale、metadata 生成失败、ClassModel 投影失败、tool handler 失败。

### 6.5 阶段 E：旧入口收口

目标：新链路稳定后再删除旧系统，避免半迁移状态漂移。

- `vcm-native` 稳定对外导出 ClassModel/projection/runtime。
- 旧 `modules/*` 仅保留迁移期输入适配，不再新增新协议逻辑。
- 删除旧入口前必须有一份最终对账报告：7 tools、6 models、childModels、JSDoc、component catalog 合并均通过。

## 7. 验收

- 从当前 runtime metadata 生成 6 个 model：`project/config-page/node-tree/dataset/data-table/data-view`。
- method 数量与当前 action 数一致。
- `editNodeTree` / `editDataSet` 生成 `callback-param` 子模型边。
- method guide 输出带中文 JSDoc 的 d.ts-like 签名，且不出现 `resultApis/callbackApis`。
- `addNode + componentType: "r-table"` 能合并 `component-catalog.json` 的 `RTableProps` 知识。
- generator 能从具体 class/constructor/attribute/method 搬运原生 `jsdoc.raw`，`ClassModel` 优先使用该字段。
- `VcmNativeRuntime.getTools()` 返回固定 7 个工具，handler 不依赖旧 `modules/runtime` 协议。
- 跨构建路径中，workspace 源码反射与构建后 `.d.ts` 类型入口的 ClassModel 关键字段必须一致；不一致时阻断生成物进入最终工具面。
