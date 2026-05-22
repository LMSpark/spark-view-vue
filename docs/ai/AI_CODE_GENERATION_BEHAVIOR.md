# AI 代码生成行为准则

本文是 Codex、GitHub Copilot、Claude 以及其它 AI 编码助手在本仓库生成或修改代码时必须遵守的共同准则。

核心目标：代码应体现清晰的业务层次和可维护边界，不要把系统扁平化成大量零散 `interface`、泛型、工具类型和随处导出的符号。

推荐设计顺序：

```text
接口 Contract
  -> class 基础实现 / 默认实现
  -> 具体 class 实现
  -> 必要时再派生子类
```

## 总原则

- 优先让代码表达业务层次，而不是追求形式上的抽象。
- 接口只定义稳定契约，不替代所有类型定义。
- class 用于承载状态、生命周期、默认行为和不变量。
- 子类用于表达明确的“是一种”关系，不用于随意复用几个方法。
- 泛型只在表达真实抽象时使用，不作为 AI 生成代码的默认模板。
- 公共导出必须收敛，内部实现细节不要为了“方便测试”或“未来扩展”随意导出。

## AI 生成代码的强制要求

1. 不要默认为每个 class 创建同名 `interface`。
2. 不要默认添加 `Ixxx`、`XxxInterface`、`XxxImpl` 这类机械命名。
3. 不要为了“灵活”引入多层泛型、条件类型、映射类型或复杂工具类型。
4. 不要把仅当前文件使用的类型、常量、helper 函数导出。
5. 新增抽象前，必须能说明它解决的真实重复、稳定扩展点或跨模块契约。
6. 如果只有一个实现，默认使用具体 class 或普通函数，不额外创建接口层。
7. 先寻找已有 class、registry、factory 和稳定领域对象，再决定是否新增结构。
8. 公共 API 应少而稳定；内部实现可以具体、直接、可读。

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
- 业务能力进入协议层前必须投影成标准 `ModuleKind` / `ModuleSemanticRuntime`；手写 `ModuleKind` class 只作为迁移期形态，目标是由 VCM 从领域能力 class 源码提取属性、动作、子模块、构造函数、攻击面元数据以及 `runner/list/find` 委托标识，生成 `ModuleKindOptions` / factory 后调用 `runtime.registerKind`。
- `assistant/registrations/**` 是协议装配层，只允许承接 factory、依赖注入和 `runner/list/find` 委托，不承载实体语义或攻击面 JSDoc。
- `ActionSchema` 只保存声明，运行侧统一挂在 `ModuleKind.runner(ctx, actionName, args)` 函数上。
- `ModuleKind` 可通过 `list` / `find` 函数委托适配任意业务系统；属性语义只来自 `attributes` 元数据并通过 `describeKind` 暴露给 LLM，最终能力元数据可由 VCM 等构建期链路生成，但进入协议层必须投影成标准 `ModuleKindOptions` 并创建 `ModuleKind`。
- `getAttribute` / `setAttribute` 由基类按元数据校验后直接读写 `runner` 函数对象属性；`resolveChild` 和内部 resolve 逻辑由基类实现，不要求业务层实现额外适配协议。
- LLM 可见工具固定为 `listChildren`、`findInstance`、`describeKind`、`invokeAction`、`getAttribute`、`setAttribute`。
- `describeKind` 必须完整暴露 action 的 `paramsSchema`、`resultSchema`、`usageRules`、`failureModes`、`example`。
- 参数 schema 使用标准 JSON Schema object root，并由 `LlmSchemaValidator` 校验；不得恢复私有参数 DSL。
- Host 只记录 `AiHostSessionRecord / AiHostHistoryEntry / AiHostFunctionCallResult`；业务 live state 由业务 service 自管。
- 业务 release 只清 live state，不删除 Host 会话历史。
- `spark-ai` 与消费层不得用 `as` 类型断言绕过 TypeScript 检查；需要收窄 unknown 时使用类型守卫、显式返回类型、`satisfies` 或运行时校验后构造 typed object。

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
- 这里是否应该由 class 维护状态、生命周期或不变量？
- 继承关系是否符合业务概念？

如果答案不明确，选择更具体、更少导出、更少泛型的实现。
