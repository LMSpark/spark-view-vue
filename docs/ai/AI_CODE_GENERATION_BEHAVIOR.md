# AI 代码生成行为准则

本文是 Codex、GitHub Copilot、Claude 以及其它 AI 编码助手在本仓库生成或修改代码时必须遵守的共同准则。它不是风格建议，而是生成前、提交前都要对照的工程约束。

核心目标：代码应体现清晰的业务层次和可维护边界。不要把系统扁平化成大量零散 `interface`、泛型、工具类型和随处导出的符号。

推荐设计顺序：

```text
接口 Contract
  -> class 基础实现 / 默认实现
  -> 具体 class 实现
  -> 必要时再派生子类
```

## 总原则

- 先复用已有 class、registry、factory、capability key 和领域对象，再新增结构。
- 接口只定义稳定契约，不替代普通类型定义。DTO、配置、payload 和判别联合优先使用 `type`。
- class 用于承载状态、生命周期、缓存、不变量和默认行为。
- 子类只表达明确的“是一种”关系，不为复用几个方法而继承。
- 泛型只在调用方能获得真实类型收益时使用，不作为默认模板。
- 公共导出必须有明确消费者。内部实现细节不要为了“方便测试”或“未来扩展”导出。
- 模块要有清晰主干：优先让一个领域 class、service、registry 或 runtime 承担入口职责，不用一组平级 interface 拼出业务层次。
- 常见调用路径的导入应收敛到少量公共符号；如果调用方需要同时导入多个 helper、context、options、provider、resolver 才能完成基本用例，说明边界需要重新组织。

## 层次化与导入收敛

后端式组织优先：入口对象表达业务主线，内部协作对象表达实现细节。AI 不应把模块展开成一排平级协议。

推荐：

```text
module-semantic/
  ModuleSemanticRuntime.ts
  ModuleKind.ts
  internal/
    normalizeModuleKind.ts
    resolveModuleInstance.ts
  index.ts
```

调用方导入：

```ts
import { ModuleSemanticRuntime, ModuleKind } from '@spark-view/spark-ai/module-semantic'
```

避免：

```text
module-semantic/
  ModuleRuntimeInterface.ts
  ModuleRuntimeProvider.ts
  ModuleRuntimeResolver.ts
  ModuleRuntimeAdapter.ts
  ModuleRuntimeOptions.ts
  ModuleRuntimeContext.ts
  ModuleRuntimeFactory.ts
```

除非这些对象分别对应稳定层级和真实外部扩展点，否则不要让它们全部成为公共 API。优先由 `ModuleSemanticRuntime` 这类主对象持有协作关系，内部 helper 留在 `internal/` 或文件私有作用域。

导入收敛检查：

- 一个常规业务用例最好只需要 1-3 个公共导入。
- `Options`、`Context`、`Snapshot`、`Payload` 等类型优先贴近主对象定义，并仅在跨模块需要时导出。
- 不要把“为了单测能 import”当成公共导出的理由；优先通过公共行为测试。
- 如果一个目录的 `index.ts` 出现大量同层级 `Provider/Resolver/Adapter/Factory/Context` 导出，先确认是否缺少主对象或聚合入口。

## AI 生成代码的强制要求

1. 不要默认为每个 class 创建同名 `interface`。
2. 不要默认添加 `Ixxx`、`XxxInterface`、`XxxImpl` 这类机械命名。
3. 不要为了“灵活”引入多层泛型、条件类型、映射类型或复杂工具类型。
4. 不要把仅当前文件使用的类型、常量、helper 函数导出。
5. 新增抽象前，必须能说明它解决的真实重复、稳定扩展点或跨模块契约。
6. 如果只有一个实现，默认使用具体 class 或普通函数，不额外创建接口层。
7. 先寻找已有 class、registry、factory 和稳定领域对象，再决定是否新增结构。
8. 公共 API 应少而稳定；内部实现可以具体、直接、可读。
9. 不要新增静默兜底来掩盖缺失 API、无效配置或状态不一致。
10. 修改公共入口时，同步更新 package exports、TS paths、Vite/Vitest alias 和 import smoke test。
11. 不要把一个业务能力拆成多组平级 `Provider`、`Resolver`、`Adapter`、`Context`、`Options` interface 后全部导出。
12. 不要让调用方为完成一个基础流程导入一串内部零件；先设计收敛入口，再暴露必要类型。

## 硬门禁

`pnpm run verify:rules` 是本仓库的规则治理入口，根 `verify` 已接入。以下问题必须在提交前清零：

- 非 allowlist `interface`。
- `Interface` / `Impl` 机械命名的类型、class 或导入导出。
- 超过阈值的 workspace 包 named import；历史热点只能减少，不能继续增加。
- `spark-ai` / `spark-page-config` 公共入口中过宽的平铺导出；历史热点只能减少，不能继续增加。
- 非 `as const` 类型断言和尖括号类型断言。
- TypeScript `namespace`。
- 公共 barrel 使用 `export * from ...`；公共入口必须使用显式 export 清单。
- 旧 `@spark-view/spark-ai/core`、`/protocol`、`/runtime`、`/adapter` 等 subpath。
- 旧 `ModuleKind.PathContext`、`ModuleKind.OperationResult` 等 namespace 类型。
- 旧 schema/type 名，例如 `LlmParameterSchemaRoot`、`JsonSchemaProperties`、`ActionSchema`、`AttributeSchema`。
- 框架无关包导入 Vue、Vue Router、Element Plus、VueUse 或 Pinia。
- workspace 包之间绕过 `@spark-view/*` 的跨包相对导入。

门禁失败时先改代码和公共入口，不要直接扩 allowlist。只有 TypeScript module augmentation、已验证的第三方扩展协议或无法替代的历史兼容点，才允许把例外加入脚本 allowlist，并且必须在同次改动中写明原因。

门禁只能覆盖可静态识别的模式。以下内容仍需要人工检查：抽象是否真的稳定、公共导出是否有消费者、错误是否 fail-fast、包边界是否符合业务方向、测试是否覆盖新的协议面。

## Interface 使用规则

允许使用 `interface` 的场景：

- 跨模块、跨包、插件、DI 或 capability 的稳定能力契约。
- 外部输入输出结构，例如 API DTO、配置对象、事件 payload。
- 多个实现类共享的公共行为协议。
- 明确需要被第三方扩展的公共类型。

不推荐：

```ts
export interface UserService {
  getUser(id: string): Promise<User>
}

export class UserServiceImpl implements UserService {
  async getUser(id: string): Promise<User> {
    // ...
  }
}
```

如果只有一个实现，推荐：

```ts
export class UserService {
  async getUser(id: string): Promise<User> {
    // ...
  }
}
```

## Class 与继承规则

当代码包含内部状态、初始化/销毁、重置、缓存、不变量保护、多个相关方法或默认行为时，优先使用 class。

推荐：

```ts
export abstract class BaseDataLoader {
  async load(): Promise<void> {
    const raw = await this.fetchRaw()
    this.apply(raw)
  }

  protected abstract fetchRaw(): Promise<unknown>

  protected apply(raw: unknown): void {
    // default behavior
  }
}

export class PageDataLoader extends BaseDataLoader {
  protected async fetchRaw(): Promise<unknown> {
    // page data loading
  }
}
```

继承要求：

- 子类必须能替代父类。
- 子类不应绕过父类生命周期。
- 父类 `protected` 方法应少而清晰。
- 不要超过 3 层继承，除非这是非常稳定的核心框架层。
- 仅为复用几个方法时，优先使用组合，而不是继承。

## 泛型使用规则

泛型应服务于真实抽象。

允许：

```ts
export class Registry<TItem> {
  private readonly items = new Map<string, TItem>()

  register(key: string, item: TItem): void {
    this.items.set(key, item)
  }
}
```

避免：

```ts
type Handler<TInput, TOutput, TContext, TOptions, TMeta> = ...
```

如果一个类型需要超过 2 个泛型参数，优先考虑：

- 拆成具名业务类型。
- 使用 class 封装状态和行为。
- 降低抽象层级。
- 给调用方暴露更具体的业务对象名称。

## 导出规则

模块应暴露公共入口，不暴露内部零件。

公共入口应像后端模块的门面：让调用方看见稳定能力，而不是看见内部装配线。

推荐：

```text
src/
  core/
    DataSet.ts
    DataView.ts
    internal/
      normalizeRows.ts
  index.ts
```

`index.ts` 只导出公共 API：

```ts
export { DataSet } from './core/DataSet'
export { DataView } from './core/DataView'
export type { DataViewProvider } from './core/DataViewProvider'
```

不要导出：

- 内部 helper。
- 临时类型。
- 仅供实现使用的中间类型。
- 私有泛型工具类型。
- 只是为了测试而暴露的内部函数。
- 只服务于内部装配的 `Provider`、`Resolver`、`Adapter`、`Context`、`Options`。

## 命名规则

接口命名表达能力或契约：

```ts
DataViewProvider
PageConfigResolver
PageDataProvider
```

类命名表达实现和职责：

```ts
DefaultPageConfigResolver
JsonPageDataParser
```

抽象类使用 `Base` 或 `Abstract`：

```ts
BaseRenderer
AbstractDataSource
```

除非已有项目约定，否则不要使用：

```ts
IUserService
UserServiceInterface
UserServiceImpl
```

## 注释规范

注释用于解释代码之外无法稳定表达的背景、约束和风险，不用于复述代码正在做什么。

优先写这些注释：

- 公共 API、跨包契约、生命周期钩子和扩展点的 JSDoc，说明调用契约、输入输出语义、失败模式、状态影响和兼容性边界。
- DataSet、DataViewKey、能力注入、脚本沙箱、页面配置解析等隐含约束，说明为什么必须按当前路径接线。
- 非显然的不变量、顺序要求、缓存策略、并发限制、资源释放约定和安全边界。
- VCM/catalog 元数据相关注释，描述组件、props、emits、slots 的业务语义、默认值、优先级和配置限制；不要把这些语义藏在生成器逻辑里。
- 面向 LLM 的组件约束必须写在首次声明处：组件首个 JSDoc、Props 字段、emits 事件、枚举值 tag。首次出现时先写自然语言夹注释，再用 `@skill`、`@description`、`@binding`、`@notes`、`@default`、`@example`、`@enumValue`、`@param` 等结构化 tag 固化可提取约束。

避免这些注释：

- 逐行解释显而易见的赋值、分支、循环或导入。
- 为缺失 API、静默回退、吞错逻辑或临时绕路写“合理化”说明；这类问题应 fail-fast 或补齐契约。
- 与代码行为不一致的历史说明、已废弃规则、TODO 式空承诺。
- 仅为提高“文档感”而给私有小函数、局部变量、一次性类型补冗余 JSDoc。

修改代码时必须同步处理相邻注释：

- 行为变更后，更新或删除过时注释。
- 新增公共导出时，只有当名称和类型无法完整表达契约时才补 JSDoc。
- 新增或修改 VCM 组件能力时，遵守 `packages/vite-plugin-spark-catalog/README.md` 的 VCM JSDoc 标识规范；tag 一行一个，值保持单行，默认值和示例必须是 JSON literal。
- 项目/领域说明默认使用中文；对外 API、第三方协议或已有英文文件沿用英文。
- 示例代码中的注释不得展示被脚本沙箱禁止的用法，例如 `$data`、ESM `import`、`window.xxx`、直接 UI 框架 API 或路由导入。

## 推荐文件组织

稳定领域对象可以按层次组织：

```text
data-loader/
  DataLoader.ts
  BaseDataLoader.ts
  PageDataLoader.ts
  RemoteDataLoader.ts
  index.ts
```

如果对象很小，可以放在同一文件，但顺序仍应保持：

```ts
export interface DataLoader {
  load(): Promise<void>
}

export abstract class BaseDataLoader implements DataLoader {
  abstract load(): Promise<void>
}

export class PageDataLoader extends BaseDataLoader {
  async load(): Promise<void> {
    // ...
  }
}
```

## SPARK AI Host 约束

`packages/spark-ai` 只保留 `schema`、`module-semantic`、`host` 三块稳定能力：

- 公共入口只允许 `@spark-view/spark-ai`、`@spark-view/spark-ai/schema`、`@spark-view/spark-ai/module-semantic`、`@spark-view/spark-ai/host`。
- 不得恢复旧 core/protocol 公共 subpath 或旧 adapter 过渡层。
- 新业务注册统一返回 `AiHostBusinessRegistration`，其中 `runtime` 直接持有 `ModuleSemanticRuntime`。
- 业务能力进入协议层前必须投影成标准 `ModuleKind` / `ModuleSemanticRuntime`；手写 `ModuleKind` class 只作为迁移期形态，目标是由 VCM 从领域能力 class 源码提取属性、动作、子模块、构造函数、攻击面元数据以及 `runner/list/find` 委托标识，生成 JSON 能力元数据或 `ModuleKind` factory 后调用 `runtime.registerKind`。
- `packages/spark-page-config/src/ai/**` 是业务协议装配层，只允许承接 factory、依赖注入和 `runner/list/find` 委托，不承载通用 AI Host 语义。
- `ModuleActionMetadata` 只保存声明，运行侧统一挂在 `ModuleKind.runner(ctx, actionName, args)` 函数上。
- `ModuleKind` 可通过 `list` / `find` 函数委托适配任意业务系统；属性语义只来自 `attributes` 元数据并通过 `describeKind` 暴露给 LLM，最终能力元数据可由 VCM 等构建期链路生成，但进入协议层必须投影成标准 `ModuleKind` 或由 factory 创建 `ModuleKind`。
- `getAttribute` / `setAttribute` 由基类按元数据校验后直接读写 `runner` 函数对象属性；`resolveChild` 和内部 resolve 逻辑由基类实现，不要求业务层实现额外适配协议。
- LLM 可见工具固定为 `listChildren`、`findInstance`、`describeKind`、`invokeAction`、`getAttribute`、`setAttribute`。
- `describeKind` 必须完整暴露 action 的 `paramsSchema`、`resultSchema`、`usageRules`、`failureModes`、`example`。
- 参数 schema 使用标准 JSON Schema object root，并由 `LlmSchemaValidator` 校验；不得恢复私有参数 DSL。
- Host 只记录 `AiHostSessionRecord / AiHostHistoryEntry / AiHostFunctionCallResult`；业务 live state 由业务 service 自管。
- 业务 release 只清 live state，不删除 Host 会话历史。
- `spark-ai` 与消费层不得用 `as` 类型断言绕过 TypeScript 检查；需要收窄 unknown 时使用类型守卫、显式返回类型、`satisfies` 或运行时校验后构造 typed object。
- `@spark-view/spark-ai` 的 package exports、TS paths、Vite/Vitest alias 必须严格保持根、`/schema`、`/module-semantic`、`/host` 四个入口。

## spark-page-config 约束

`packages/spark-page-config` 是框架无关的页面配置边界，不是 Vue 渲染层，也不是 AI Host 核心层。

- 公共入口只允许根入口和 `config`、`node-tree`、`navigation`、`runtime`、`json-document`、`design`、`ai`、`ai/payloads/component-catalog.json`。
- 根 `@spark-view/spark-page-config` 只保留最小 runtime config loader API，不恢复大 barrel。
- 不得恢复旧 `page/*`、`capabilities/*`、`registrations` subpath 或对应 alias。
- `config` 层只负责四文件协议、loader、compiler、file API；文件名和 required 语义以 `PageConfigFileRegistry` 为真源。
- `node-tree`、`navigation`、`json-document` 必须保持框架无关，不导入 Vue、Vue Router、Element Plus、VueUse 或 Pinia。
- `design` 可以组合页面文件文档、工作区、设计服务和 artifacts，但不得把 AI 注册逻辑反向放入 design 核心模型。
- `ai` 只做 pageDesign/manualLeave 业务注册和 ModuleKind 投影，不定义通用 AI 协议，不修改 Host 工具循环。
- 新增或调整公开 subpath 时，必须补 import smoke test，覆盖 value export 和 type export 的实际可解析性。

## 包边界与导入

- 跨 workspace 包导入只使用 `@spark-view/*` 包名，不用 `../../spark-*` 相对路径。
- `spark-utils -> spark-data -> spark-page-config -> spark-component -> spark-app` 不允许反向依赖。
- `spark-utils`、`spark-data`、`spark-page-config` 必须保持框架无关。
- Vite/Vitest/TS alias 必须与 package exports 同步，不能留下指向已删除目录的兼容 alias。
- 大文件和生成产物不直接编辑；需要产物时通过对应包级 build 或生成命令产生。

## 错误处理风格

- 优先使用 `throw new Error(...)` 或自定义 Error 子类表达不可恢复的错误
- 可预期的业务异常应通过返回值（如 `Result<T>` 或 `{ ok: boolean; data?: T; error?: string }`）显式表达，不依赖异常流
- 禁止吞掉异常：`catch` 块必须至少执行 log 或重新 throw 之一操作
- 错误消息应包含足够的上下文（如相关 ID、参数值）以便排查，但不包含敏感信息

## async/await 与 Promise 使用约定

- 优先使用 `async/await`，不混用 `.then()` 链式调用和 `await`
- `Promise.all` 用于无依赖的并行请求；有依赖关系时使用顺序 `await`
- 禁止在无 `try/catch` 或外层错误边界的情况下静默 `await` 可能拒绝的 Promise
- 超时、重试、取消等高级控制应封装到专门的工具类或方法中，不要散落在业务代码里

## 编码前判断清单

AI 在新增类型、抽象或导出前必须先判断：

- 这是稳定契约，还是实现细节？
- 未来是否真的会有多个实现？
- 这个泛型是否让调用者更清楚，还是更难读？
- 这个符号是否必须成为公共 API？
- 这个模块是否有明确主对象或门面入口？
- 调用方是否只需少量导入就能完成常规业务流程？
- 这里是否应该由 class 维护状态、生命周期或不变量？
- 继承关系是否符合业务概念？

如果答案不明确，选择更具体、更少导出、更少泛型的实现。

## 提交前检查清单

涉及代码或公共入口改动时，至少执行：

```bash
pnpm run verify:rules
pnpm run typecheck
pnpm run lint
pnpm run test
```

只改某个包时，可以先跑包级命令加速，但合并前仍应跑根级命令。若修改 `spark-page-config` 或 `spark-ai` 公共入口，必须包含对应 import smoke test 或 verifier 测试。
