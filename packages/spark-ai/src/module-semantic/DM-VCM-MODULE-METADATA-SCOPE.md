# DM: VCM 能力模块元数据生成范围

> 状态：有效。本文贴近 `module-semantic` 协议源码维护，约束 VCM 生成“能力模块元数据”的范围。这里的实体元数据指 AI 能力模块的业务实体/实例语义，不是 Vue 组件、props、component catalog 或页面渲染组件元数据。

## 目标

VCM 的目标是替代手写 `ModuleKind`：构建期从业务能力源码、JSDoc、构造函数和注册工厂中提取语义元数据，生成标准 `ModuleKindOptions` / `ActionSchema` / `AttributeSchema` 输入，再由生成代码创建 `ModuleKind` 并调用 `runtime.registerKind`。

进入协议层后的标准形态仍然只有：

- `ModuleKind.kind / name / description`
- `ModuleKind.attributes`
- `ModuleKind.actions`
- `ModuleKind.children`
- `ModuleKind.list / find / runner` 的运行入口声明边界

LLM 只通过 `describeKind` 理解语义；不得从 runner 函数属性、函数体、服务实例或组件树反推业务语义。

手写 `ModuleKind` class 只作为迁移期兼容形态存在；新增能力模块不应把元数据硬编码在自定义 `ModuleKind` 子类里。业务代码只保留 runner/list/find 运行委托、构造依赖和服务实现，语义元数据与装配边界由 VCM 生成。

## 生成形态

VCM 生成物应投影成协议层已有类型，不新增第二套注册协议：

```ts
import { ModuleKind, type ModuleKindOptions } from '@spark-view/spark-ai/module-semantic'

export const NODE_TREE_KIND_OPTIONS = {
  kind: 'node-tree',
  name: 'Page Design Node Tree',
  description: '当前页面 SparkNodeTree/rule.json 结构读写能力。',
  attributes: [],
  actions: NODE_TREE_ACTIONS,
  children: [],
} satisfies ModuleKindOptions

export function createNodeTreeModuleKind(delegates: {
  readonly runner: ModuleKindOptions['runner']
  readonly find?: ModuleKindOptions['find']
  readonly list?: ModuleKindOptions['list']
}): ModuleKind {
  return new ModuleKind({
    ...NODE_TREE_KIND_OPTIONS,
    runner: delegates.runner,
    find: delegates.find,
    list: delegates.list,
  })
}
```

运行时仍只认 `runtime.registerKind(moduleKind)` 这一个注册口。VCM 可以生成 factory 和构造依赖声明，但 factory 的返回值必须是标准 `ModuleKind`。

VCM 应完整提取五类结构：

- **属性**：生成 `AttributeSchema[]`，包括读写能力、值 schema、示例和属性语义。
- **动作**：生成 `ActionSchema[]`，包括 `paramsSchema / resultSchema / usageRules / failureModes / example`。
- **子模块**：生成 `children`，并校验 `list/find/resolve` 发现语义与子 kind 声明一致。
- **构造装配**：从构造函数、factory 参数和注册工厂中提取依赖边界，例如 `service`、`contextFactory`、`runner`、`list`、`find`；只生成装配签名，不生成业务实现体。
- **运行委托**：按 JSDoc 标识提取 `runner/list/find` 委托函数，把它们接到 `ModuleKind.runner / list / find`。VCM 只识别委托签名和绑定关系，不解析委托函数体来推导业务语义。

## JSDoc 标识

VCM 提取能力模块元数据时，只识别写在业务能力源、模块注册源、action 声明源附近的 JSDoc。迁移期可以读取已有 `ModuleKind` class 上的注释用于回填；目标形态不要求业务继续手写 `ModuleKind` class。

这些 JSDoc tag 的定位类似 Java 注解：源码里写声明，构建期由 VCM 扫描并生成注册代码；运行时不通过反射扫描注解，也不从函数体猜业务语义。

推荐标识：

- `@moduleKind <kind>`：声明目标 `ModuleKind.kind`，必须与注册时的 `kind` 一致。
- `@moduleName <name>`：声明给 LLM 看的能力模块名称。
- `@moduleDescription <text>`：声明能力模块描述。可省略；省略时以 `ModuleKind.description` 为准。
- `@moduleEntity <entityId> <label>`：声明该能力模块代表的业务实体或实例族，例如 `page 页面`、`pageNode 页面节点`、`leaveRequest 请假申请`。
- `@moduleScope <text>`：声明实例作用域，例如 `host.moduleInstanceId is pageId`。
- `@moduleFind <text>`：声明 `findInstance("/", kind, query)` 的查询语义和允许 query 范围。
- `@moduleList <text>`：声明 `listChildren(path, childKind?)` 的列表语义。
- `@moduleChild <childKind>`：声明允许的子 kind；必须与 `children` 一致。
- `@moduleDependency <name> <type>`：声明构造或 factory 依赖，只描述装配边界。
- `@moduleFactory <factoryName>`：声明生成 factory 名称；返回值必须是标准 `ModuleKind`。
- `@moduleRunner <functionName>`：声明 action runner 委托。目标函数必须满足 `ModuleKindRunner`，或由生成 factory 包一层后满足该签名。
- `@moduleListDelegate <functionName>`：声明 list 委托。目标函数必须满足 `ModuleChildrenLister`。
- `@moduleFindDelegate <functionName>`：声明 find 委托。目标函数必须满足 `ModuleInstanceFinder`。
- `@moduleAction <actionName>`：声明 action 名；说明文本优先来自 JSDoc summary / `@description`。
- `@usageRule <text>`：声明 action 使用规则，可多条。
- `@failureMode <code> <when> => <fix>`：声明 action 失败模式，可多条。
- `@example <json>`：声明 action 示例参数，必须是 JSON 兼容值。

动作与属性仍以现有 `ActionSchema` / `AttributeSchema` 为最终协议形态：

- action 的参数、返回、规则、失败模式只进入 `paramsSchema / resultSchema / usageRules / failureModes / example`。
- attribute 的读写语义只进入 `AttributeSchema`。
- JSDoc 只用于 VCM 生成和一致性检查，不新增运行时协议字段。
- 参数说明复用标准 JSDoc `@param`；返回说明复用 `@returns` / `@return`。JSON Schema 可以由类型系统、`.dm` 约束和显式 schema 常量共同生成，但最终必须落到 `LlmParameterSchemaRoot`。

## 示例

```ts
/**
 * @moduleKind node-tree
 * @moduleName Page Design Node Tree
 * @moduleDescription 当前页面 SparkNode 树结构读写能力。
 * @moduleEntity pageNode 页面节点
 * @moduleScope host.moduleInstanceId is pageId
 * @moduleFind 根路径 query 可按 id、type、label 查询当前页面节点。
 * @moduleList 非根路径列出当前节点下的子节点。
 * @moduleDependency service PageDesignService
 * @moduleDependency contextFactory (ctx: ModulePathContext) => PageDesignServiceContext
 * @moduleFactory createNodeTreeModuleKind
 * @moduleRunner runNodeTreeAction
 * @moduleFindDelegate findCurrentNodeTree
 * @moduleAction addNode
 * @usageRule 修改 rule.json 前先确认目标父节点存在。
 * @failureMode NODE_NOT_FOUND 目标节点不存在 => 先调用 getNode 或 findInstance 确认节点 id。
 */
export class PageNodeTreeAbility {
  /**
   * 添加一个 SparkNode。
   *
   * @param args 添加节点参数。
   * @returns 更新后的节点摘要。
   */
  addNode(args: AddNodeArgs): AddNodeResult {
    // 业务实现不承担协议注册职责。
  }
}
```

## 生成范围

纳入生成：

- `packages/spark-page-config/src/assistant/registrations/**` 下的能力模块声明、service/action binding、直接 Host 注册源。
- `ActionSchema` / `AttributeSchema` 常量，以及它们被传入 `ModuleKind` 的标准 metadata。
- `createPageDesignBusinessRegistration()`、`createLeaveRequestBusinessRegistration()` 等直接注册到 Host 的业务注册工厂。
- 与 `ModuleKind` 发现链路直接相关的 `children`、`list`、`find` 语义说明。
- 构造函数、factory 参数、注册工厂中的依赖注入边界；提取名称、类型、必填性和用途，不提取实现。
- 被 `@moduleRunner`、`@moduleListDelegate`、`@moduleFindDelegate` 标记的运行委托声明；提取签名、依赖参数和目标 kind 绑定，不提取函数体。

不纳入生成：

- Vue 组件、组件 props/emits、`component-catalog.json`、VCM 组件 API。
- `runner` 函数体、service 私有方法实现、业务 live state、会话历史。
- 真实业务数据行、页面配置文件、后端接口返回样本。
- 旧 `Capability`、旧 runtime、旧 adapter 相关类型。

## 一致性规则

- `@moduleKind` 与 `ModuleKind.kind` 不一致时 fail-fast。
- `@moduleChild` 与 `children` 不一致时 fail-fast。
- JSDoc 与 `ActionSchema` / `AttributeSchema` 冲突时，以标准 schema 为准并报诊断，不做静默覆盖。
- VCM 生成的 `ModuleKindOptions` 必须通过 TypeScript `satisfies ModuleKindOptions` 校验。
- 生成代码不得包含业务 runner/list/find 函数体；runner/list/find 只能由被 JSDoc 标记的业务运行委托注入或包裹。
- 构造依赖必须显式出现在生成 factory 参数中，不允许从闭包或全局变量隐式捕获。
- `@moduleRunner` / `@moduleListDelegate` / `@moduleFindDelegate` 指向不存在的函数、签名不匹配或 kind 绑定冲突时 fail-fast。
- 最终注册仍必须走 `runtime.registerKind(new ModuleKind(...))` 或等价的生成 factory 返回值；不得新增绕过 `ModuleKind` 的 runtime 注册入口。
