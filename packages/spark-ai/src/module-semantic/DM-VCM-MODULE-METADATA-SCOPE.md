# DM: VCM 能力模块元数据生成范围

> 状态：有效。本文贴近 `module-semantic` 协议源码维护，约束 VCM 生成“能力模块元数据”的范围。这里的实体元数据指 AI 能力模块的业务实体/实例语义，不是 Vue 组件、props、component catalog 或页面渲染组件元数据。

## 目标

VCM 的目标是替代手写 `ModuleKind`：构建期从领域能力 class 源码、JSDoc、构造函数和能力模块边界中提取语义元数据，生成标准 `ModuleFunctionMetadata` / `ModuleAttributeMetadata` 输入和 `ModuleKind` factory，再由生成代码创建 `ModuleKind` 并调用 `runtime.registerKind`。

进入协议层后的标准形态仍然只有：

- `ModuleKind.kind / name / description`
- `ModuleKind.attributes`
- `ModuleKind.functions`
- `ModuleKind.children`
- 构造期运行委托：`runner / list / find` 输入，只能通过 `ModuleKind` 协议方法访问

LLM 只通过 `queryModules`、`queryFunctions`、`guideFunction`、`guideHumanQuestion` 和 `describeKind` 理解语义；不得从 attributeAccessor/runner 函数体、服务实例或组件树反推业务语义。

手写 `ModuleKind` class 只作为迁移期兼容形态存在；新增能力模块不应把元数据硬编码在自定义 `ModuleKind` 子类里。业务代码只保留构造期运行委托、构造依赖和服务实现，语义元数据从能力模块本体提取，注册层只承接装配边界。

## 生成形态

VCM 生成物应投影成协议层已有类型，不新增第二套注册协议：

```ts
import {
  ModuleKind,
  type ModuleChildrenLister,
  type ModuleInstanceFinder,
  type ModuleKindRunner,
} from '@spark-view/spark-ai/module-semantic'

export const NODE_TREE_KIND_METADATA = {
  kind: 'node-tree',
  name: 'Page Design Node Tree',
  description: '当前页面 SparkNodeTree/rule.json 结构读写能力。',
  attributes: [],
  functions: NODE_TREE_FUNCTIONS,
  children: [],
}

export function createNodeTreeModuleKind(delegates: {
  readonly runner: ModuleKindRunner
  readonly find?: ModuleInstanceFinder
  readonly list?: ModuleChildrenLister
}): ModuleKind {
  return new ModuleKind({
    ...NODE_TREE_KIND_METADATA,
    runner: delegates.runner,
    find: delegates.find,
    list: delegates.list,
  })
}
```

运行时仍只认 `runtime.registerKind(moduleKind)` 这一个注册口。VCM 可以生成 factory 和构造依赖声明，但 factory 的返回值必须是标准 `ModuleKind`。

VCM 应完整提取六类结构：

- **属性**：生成 `ModuleAttributeMetadata[]`，包括读写能力、值 schema、示例和属性语义。
- **动作**：生成 `ModuleFunctionMetadata[]`，包括 `paramsSchema / resultSchema / usageRules / failureModes / example`。
- **子模块**：生成 `children`，并校验 `list/find/resolve` 发现语义与子 kind 声明一致。
- **构造装配**：从能力模块构造函数、factory 参数和注册工厂中提取依赖边界，例如 `service`、`contextFactory`、`runner`、`list`、`find`；只生成装配签名，不生成业务实现体。
- **运行委托**：按 JSDoc 标识提取 `attributeAccessor/runner/list/find` 委托函数，把它们作为 `ModuleKind` 构造参数接入；运行期只能通过 `getAttribute/setAttribute/标准 function tool/listChildren/findInstance` 协议方法访问。VCM 只识别委托签名和绑定关系，不解析委托函数体来推导业务语义。
- **攻击面**：按 JSDoc 标识提取能力模块能触达的资源、信任边界、写入/删除/执行风险和防护规则。VCM 只提取声明，不从业务实现反推安全语义。

## JSDoc 标识

VCM 提取能力模块元数据时，能力语义只识别写在领域能力 class 源码附近的 JSDoc，例如 `SparkNodeTree`、`DataSetCrudTool` 这类真正承载动作和状态不变量的 class。`assistant/registrations/**` 这类注册源只允许声明 factory、attributeAccessor/runner/list/find 委托和依赖装配；不得承载实体、攻击面、业务动作语义。迁移期可以读取已有 `ModuleKind` class 上的装配注释用于回填；目标形态不要求业务继续手写 `ModuleKind` class。

这些 JSDoc tag 的定位类似 Java 注解：源码里写声明，构建期由 VCM 扫描并生成注册代码；运行时不通过反射扫描注解，也不从函数体猜业务语义。

推荐标识：

- `@moduleAbility <abilityId>`：声明被 VCM 提取的业务能力模块，例如 `pageDesign.nodeTree`、`pageDesign.dataset`。
- `@moduleKind <kind>`：声明目标 `ModuleKind.kind`，必须与注册时的 `kind` 一致。
- `@moduleName <name>`：声明给 LLM 看的能力模块名称。
- `@moduleDescription <text>`：声明能力模块描述。可省略；省略时以 `ModuleKind.description` 为准。
- `@moduleEntity <entityId> <label>`：声明该能力模块代表的业务实体或实例族，例如 `page 页面`、`pageNode 页面节点`、`leaveRequest 请假申请`。
- `@moduleScope <text>`：声明实例作用域，例如 `host.moduleInstanceId is pageId`。
- `@moduleFind <text>`：声明当前 kind 在合法父路径下的 `findInstance(path, kind, query)` 查询语义和允许 query 范围；根 kind 使用 `path="/"`，子 kind 必须先定位父实例路径。
- `@moduleList <text>`：声明 `listChildren(path, childKind?)` 的列表语义。
- `@moduleChild <childKind>`：声明允许的子 kind；必须与 `children` 一致。
- `@moduleDependency <name> <type>`：声明构造或 factory 依赖，只描述装配边界。
- `@moduleFactory <factoryName>`：声明生成 factory 名称；返回值必须是标准 `ModuleKind`。
- `@moduleRunner <functionName>`：声明 function runner 委托。目标函数必须满足 `ModuleKindRunner`，或由生成 factory 包一层后满足该签名。
- `@moduleListDelegate <functionName>`：声明 list 委托。目标函数必须满足 `ModuleChildrenLister`。
- `@moduleFindDelegate <functionName>`：声明 find 委托。目标函数必须满足 `ModuleInstanceFinder`。
- `@moduleAttackSurface <surfaceId> <risk> <text>`：声明攻击面。`risk` 推荐使用 `low | medium | high | critical`。
- `@moduleTrustBoundary <text>`：声明该能力跨越的信任边界，例如 Host live binding、用户输入、页面源码。
- `@moduleGuard <text>`：声明调用前或执行中必须保留的防护规则。
- `@moduleMutation <resource> <mode> <text>`：声明资源访问模式。`mode` 推荐使用 `read | write | delete | execute | read-write`。
- `@moduleFunction <functionName>`：声明 function 名；说明文本优先来自 JSDoc summary / `@description`。
- `@usageRule <text>`：声明 function 使用规则，可多条。
- `@failureMode <code> <when> => <fix>`：声明 function 失败模式，可多条。
- `@example <json>`：声明 function 示例参数，必须是 JSON 兼容值。

函数与属性仍以现有 `ModuleFunctionMetadata` / `ModuleAttributeMetadata` 为最终协议形态：

- function 的参数、返回、规则、失败模式只进入 `paramsSchema / resultSchema / usageRules / failureModes / example`。
- attribute 的读写语义只进入 `ModuleAttributeMetadata`。
- JSDoc 只用于 VCM 生成和一致性检查，不新增运行时协议字段。
- 参数说明复用标准 JSDoc `@param`；返回说明复用 `@returns` / `@return`。JSON Schema 可以由类型系统、`.dm` 约束和显式 schema 常量共同生成，但最终必须落到 `LlmJsonSchemaObject`。

## 示例

```ts
/**
 * SparkNodeTree 是页面节点树编辑能力本体。
 *
 * @moduleAbility pageDesign.nodeTree
 * @moduleKind node-tree
 * @moduleName Page Design Node Tree
 * @moduleDescription 当前页面 SparkNode 树结构读写能力。
 * @moduleEntity pageNode 页面节点
 * @moduleScope 当前 SparkNodeTree 实例代表一个页面 rule.json 根树。
 * @moduleAttackSurface rule-tree-write high rule.json 结构写入会改变页面渲染树、数据绑定和行为入口。
 * @moduleTrustBoundary 调用方负责把当前页面 rule.json live model 映射为 SparkNodeTree 实例。
 * @moduleGuard 修改节点前必须确认目标节点、父节点和组件 payload 合法。
 * @moduleMutation rule.json read-write SparkNodeTree 操作直接修改当前页面 rule.json live model。
 */
export class SparkNodeTree {
  /**
   * 添加一个 SparkNode。
   *
   * @moduleFunction addNode
   * @usageRule 修改 rule.json 前先确认目标父节点存在。
   * @failureMode NODE_NOT_FOUND 目标节点不存在 => 先调用 getNode 或 findInstance 确认节点 id。
   * @param args 添加节点参数。
   * @returns 更新后的节点摘要。
   */
  addNode(args: AddNodeArgs): AddNodeResult {
    // 业务实现不承担协议注册职责。
  }
}

/**
 * DataSetCrudTool 是页面数据集编辑能力本体。
 *
 * @moduleAbility pageDesign.dataset
 * @moduleKind dataset
 * @moduleName Page Design DataSet
 * @moduleDescription 当前页面 DataSetCrudTool/pagedata.json 数据空间读写能力。
 * @moduleEntity dataSet 页面数据集
 * @moduleScope 当前 DataSetCrudTool 实例代表一个页面 pagedata.json 模型。
 * @moduleAttackSurface dataset-schema high 表、列、视图、关系和依赖写入会改变页面数据绑定语义。
 * @moduleTrustBoundary 调用方负责把当前页面 pagedata.json live model 映射为 DataSetCrudTool 实例。
 * @moduleGuard 修改结构前必须确认表、字段、视图和绑定链仍能解析。
 * @moduleMutation pagedata.json read-write DataSetCrudTool 操作直接修改当前页面 pagedata.json live model。
 */
export class DataSetCrudTool {
  /**
   * 创建数据表。
   *
   * @moduleFunction createTable
   * @usageRule 建表前确认 tableName 在 DataSet 内唯一。
   * @failureMode TABLE_EXISTS 表已存在 => 先调用 listTables 或 getTable 确认表名。
   */
  createTable(args: CreateTableArgs): CreateTableResult {
    // 业务实现不承担协议注册职责。
  }
}

/**
 * node-tree 协议装配源。
 *
 * @moduleKind node-tree
 * @moduleDependency service PageDesignService
 * @moduleDependency contextFactory (ctx: ModulePathContext) => PageDesignServiceContext
 * @moduleFactory createNodeTreeModuleKind
 * @moduleRunner runNodeTreeAction
 * @moduleFindDelegate findCurrentNodeTree
 */
export function createNodeTreeModuleKind(): ModuleKind {
  // 注册层只负责把能力模块元数据和运行委托投影为 ModuleKind。
}
```

## 生成范围

纳入生成：

- 领域能力 class 源码中的能力声明、领域实体、属性、动作和攻击面，例如 `packages/spark-page-config/src/page/model/spark-node-tree.ts`、`packages/spark-data/src/dataset-crud-tool.ts`，以及后续同类能力 class。
- `ModuleFunctionMetadata` / `ModuleAttributeMetadata` 常量，以及它们被传入 `ModuleKind` 的标准 metadata。
- 与 `ModuleKind` 发现链路直接相关的 `children`、`list`、`find` 语义说明。
- 构造函数、factory 参数、注册工厂中的依赖注入边界；提取名称、类型、必填性和用途，不提取实现，不提取业务语义。
- 被 `@moduleRunner`、`@moduleListDelegate`、`@moduleFindDelegate` 标记的运行委托声明；提取签名、依赖参数和目标 kind 绑定，不提取函数体。
- 被 `@moduleAttackSurface`、`@moduleTrustBoundary`、`@moduleGuard`、`@moduleMutation` 标记的安全元数据；这些 tag 只能出现在业务能力源码，供提示词、诊断和生成校验使用。

不纳入生成：

- `packages/spark-page-config/src/assistant/registrations/**` 中的 Host 注册业务语义；该目录只作为协议装配源，允许读取 `@moduleFactory`、`@moduleRunner`、`@moduleListDelegate`、`@moduleFindDelegate`、`@moduleDependency`。
- Service 编排、Host/session、workspace state、document registry 上的隐式业务含义；除非该文件本身就是领域能力 class，否则不承载能力元数据。
- Vue 组件、组件 props/emits、`component-catalog.json`、VCM 组件 API。
- `runner` 函数体、service 私有方法实现、业务 live state、会话历史。
- 真实业务数据行、页面配置文件、后端接口返回样本。
- 旧 `Capability`、旧 runtime、旧 adapter 相关类型。
- 从 attributeAccessor/runner/list/find 函数体静态推断出的隐式攻击面；攻击面必须显式用 JSDoc 声明。

## 一致性规则

- `@moduleKind` 与 `ModuleKind.kind` 不一致时 fail-fast。
- `@moduleChild` 与 `children` 不一致时 fail-fast。
- JSDoc 与 `ModuleFunctionMetadata` / `ModuleAttributeMetadata` 冲突时，以标准 schema 为准并报诊断，不做静默覆盖。
- `assistant/registrations/**` 出现 `@moduleAbility`、`@moduleEntity`、`@moduleAttackSurface`、`@moduleTrustBoundary`、`@moduleGuard`、`@moduleMutation` 时 fail-fast；这些属于能力模块本体。
- VCM 生成的 metadata 必须在 `new ModuleKind(...)` factory 调用处通过 TypeScript 校验。
- 生成代码不得包含业务 attributeAccessor/runner/list/find 函数体；attributeAccessor/runner/list/find 只能由被 JSDoc 标记的业务运行委托注入或包裹。
- 构造依赖必须显式出现在生成 factory 参数中，不允许从闭包或全局变量隐式捕获。
- `@moduleRunner` / `@moduleListDelegate` / `@moduleFindDelegate` 指向不存在的函数、签名不匹配或 kind 绑定冲突时 fail-fast。
- `@moduleMutation` 的 resource/mode 必须与 `@moduleAttackSurface` 覆盖的资源一致；写入、删除、执行类资源缺少 `@moduleGuard` 时 fail-fast。
- 最终注册仍必须走 `runtime.registerKind(new ModuleKind(...))` 或等价的生成 factory 返回值；不得新增绕过 `ModuleKind` 的 runtime 注册入口。

## 术语迁移延后边界（2026-05-27）

**本轮实际范围**：`packages/spark-ai/src/module-semantic`（protocol 层）和 `packages/spark-ai/src/host`（transport/chat/session 层）已完成 `action`→`function` 术语统一。包括 protocol 源码、类型名、注释、工具描述和 spark-ai 测试文件。

**延后区域**：以下属于业务层/VCM 实现层，不在本轮迁移范围：

- `packages/spark-page-config/src/ai/*-tool-catalog.ts` — 内部 `actionName` 参数名和 `runAction` 方法名是 catalog class 的私有 API，与 ModuleKind 协议无耦合。
- `packages/spark-page-config/src/node-tree/spark-node-tree.ts` — `@moduleAction` JSDoc tag 是 VCM 构建期扫描标识。VCM 生成器应同时识别 `@moduleAction`（旧）和 `@moduleFunction`（新），并在构建期 fail-fast 提示迁移。运行时协议不受影响。
- `packages/spark-page-config/src/design/page-design-service.ts` — `actionName` 形参是 service 内部校验函数的本地名。

延后条件：当 VCM 生成器落地到 spark-page-config 时，统一把 `@moduleAction`→`@moduleFunction`，`actionName`→`functionName`。届时连同生成代码一并更新，不分步迁移。

`UNKNOWN_ACTION` 错误码保留不变——它是 `ModuleKind` 运行时的稳定契约字符串，已是现有业务方的错误匹配锚点，改名为 `UNKNOWN_FUNCTION` 属于不必要的 breaking change。
