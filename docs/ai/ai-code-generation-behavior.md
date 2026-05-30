# AI 代码生成行为规范

> Codex 或其它 AI 编码助手修改本仓库时，必须遵守本文规则。

## 0. 治理优先级

AI 代码生成规则是生产线质量门，排在理念和逻辑之后、兼容之前。遇到冲突时按以下顺序裁决：

`理念 > 逻辑 > AI 生成代码规则 > SSOT || SOLID > 该删则删 || 该合则合 || 该拆则拆 > 兼容`

- 理念和业务生产线闭环优先于形式规则；规则如果误伤理念或逻辑，应修正规则。
- AI 生成代码规则优先于旧公共面和旧兼容层；为了兼容而保留的扁平导出、旧协议和旧路径，该收窄就收窄。
- SSOT 和 SOLID 服务于业务逻辑，不用作机械口号。
- 发现真实重复、错误边界或过时兼容层时，该删则删、该合则合、该拆则拆；兼容排最后，只保留有明确业务价值的迁移路径。

## 1. 代码组织层次

核心原则：**代码按层次组织，不按文件平铺。** 一个模块的典型层次是：

```
契约层（少量 interface，跨模块协议）
  ↓
实体/领域层（class，状态 + 行为一体）
  ↓
实现层（class implements 契约）
  ↓
子类层（必要的 "is-a" 特化，不是方法复用）
```

- 不要制造"interface 大平层"——几十个平级 interface 散落各处，没有层次归属，大多只有单一实现。
- 不要制造"type 大平层"——遍地泛型工具类型和随处 export 的碎片 type。
- 先复用已有 class、registry、factory、capability key 和领域对象，再新增结构。
- 一个模块对外暴露的符号应控制在个位数；如果调用方需要 import 一堆东西才能用，先收敛门面。

### interface 使用原则

核心立场：**interface 是契约，不是装饰品。** 禁止把系统拆成遍地散落的平级 `interface`，没有层次、没有归属、没有消费者——这就是"interface 大平层"反模式。

#### interface 的合法场景（四有一）

- **有契约** — 跨模块、跨团队、跨进程的稳定协议，变更成本高。
- **有多实现** — 两个及以上 class/模块共享同一协议，替换实现不影响调用方。
- **有边界** — DTO、config、payload、事件体等数据载体，穿越模块边界。
- **有消费者** — 被外部调用方或下游模块 import，不是"可能以后有用"。
- 不满足以上任何一条 → **不许用 interface**，直接用 class、type alias 或匿名内联。

#### 禁止事项

- 禁止为每个 class 自动创建同名 `interface`。
- 禁止 `Ixxx`、`XxxInterface`、`XxxImpl` 机械命名。
- 禁止"一个文件一个 interface"的碎片化导出——相关的 interface 应共处一个契约文件。
- 禁止只有单一实现的 interface——它不叫契约，叫膨胀。
- 禁止无消费者的公共 interface——写了没人用就删掉。

#### 反例：interface 大平层

```ts
// ❌ 禁止：模块导出 6 个平级 interface，散落在 4 个文件中，大多只有单一实现

// --- user-types.ts ---
export interface User { id: string; name: string }
export interface UserCreateInput { name: string; email: string }
export interface UserUpdateInput { name?: string; email?: string }

// --- user-repo.ts ---
export interface UserRepository {
  findById(id: string): User
  create(input: UserCreateInput): User
}

// --- user-service.ts ---
export interface UserService {
  getUser(id: string): User
  registerUser(input: UserCreateInput): User
}

// --- user-controller.ts ---
export interface UserController {
  handleGet(req: Request): Response
}

// 整个模块最后只有一个 UserRepositoryImpl、一个 UserServiceImpl……
// 6 个 interface，全是平层，没有层次，调用方 import 一堆碎片。
```

#### 正例：层次化组织

```ts
// ✅ 正确：按契约层次收束，一个模块只暴露有限契约

// --- user-contract.ts ---（唯一的公共契约文件）
export interface UserRepository {
  findById(id: string): User
  create(input: UserCreateInput): User
}

// 只有真正多实现或跨边界的才放 contract；其余用 type 或 class 内部消化

// --- user.entity.ts ---
export class User {
  // 状态 + 行为一体，不另建 IUser
  constructor(
    public readonly id: string,
    public name: string,
    public email: string,
  ) {}
}

// --- user-create.input.ts ---
export type UserCreateInput = Readonly<{ name: string; email: string }>
// 数据载体用 type alias，不需要 interface

// --- user.repository.impl.ts ---
export class MongoUserRepository implements UserRepository {
  // 唯一的实现，但 UserRepository 是跨模块契约 → 保留 interface
}
```

#### interface 收束检查清单

新增或保留 interface 前，回答三个问题：
1. 这个 interface 会被两个以上的 class 实现吗？（否 → 不用 interface）
2. 这个 interface 有外部消费者吗？（否 → 不用 interface，或至少不 export）
3. 相关的 interface 能合并成一个契约文件吗？（能 → 合并，别散落）

### class 使用原则

- class 用于承载状态、生命周期、缓存、不变量和默认行为。
- 子类只表达明确的"是一种"关系，不为复用几个方法而继承。

### 泛型使用原则

- 泛型只在调用方能获得真实类型收益时使用。
- 超过两个泛型参数时优先改成具名业务类型或 class。

## 2. 函数签名约束（强制）

### 参数数量

- 函数/方法默认最多 **3 个位置参数**。
- 4 个及以上参数必须改为 **options object / command object / 领域对象**（具名 type，单参数传入）。
- 多个回调、多个上下文值或多个可选项不要平铺进参数列表；用一个具名 type/class 收束。
- 构造函数使用 `public readonly` 参数属性时最多 4 个参数，超出也必须拆 options object。

### 禁止参数内嵌 JSDoc

- 禁止在参数列表内写 `/** */` JSDoc 注释。参数说明移到类型定义处或构造函数上方。
- 反例：

```ts
// ❌ 禁止：参数内嵌 JSDoc，4 个参数撑到 10 行
public constructor(
  /** 严重级别 */
  public readonly level: ModuleCheckEntryLevel,
  /** 错误码（机器可读） */
  public readonly code: string,
  /** 人类可读描述 */
  public readonly message: string,
  /** 修复建议（可选） */
  public readonly hint?: string | undefined,
) {}
```

- 正例：

```ts
// ✅ 正确：注释移到类定义上方，参数一行一个
/**
 * 操作结果的最小诊断单元。
 * level — 严重级别（error/warn/info）
 * code  — 错误码（机器可读）
 * message — 人类可读描述
 * hint  — 修复建议（可选）
 */
public constructor(
  public readonly level: ModuleCheckEntryLevel,
  public readonly code: string,
  public readonly message: string,
  public readonly hint?: string,
) {}
```

### 禁止匿名内联对象类型

- 参数类型如果是对象字面量 type，必须提取为具名 type。
- 反例：

```ts
// ❌ 禁止：匿名内联对象类型，签名膨胀
export function objectSchema(
  properties: Readonly<Record<string, LlmJsonSchema>> = {},
  options: {
    required?: readonly string[]
    description?: string
    additionalProperties?: LlmJsonSchema
  } = {},
): LlmJsonSchemaObject {
```

- 正例：

```ts
// ✅ 正确：内联类型提取为具名 type
export type ObjectSchemaOptions = Readonly<{
  required?: readonly string[]
  description?: string
  additionalProperties?: LlmJsonSchema
}>

export function objectSchema(
  properties: Readonly<Record<string, LlmJsonSchema>>,
  options: ObjectSchemaOptions,
): LlmJsonSchemaObject {
```

### 深层泛型提取

- 嵌套 2 层及以上的泛型（如 `Readonly<Record<string, LlmJsonValue>>`）提取为具名类型别名。
- 反例：`args: Readonly<Record<string, LlmJsonValue>>`（在多处重复出现）。
- 正例：先定义 `export type LlmJsonArgs = Readonly<Record<string, LlmJsonValue>>`，再复用。

### 可选参数语法

- 用 `hint?: string`，不用 `hint?: string | undefined`。
- TypeScript 的 `?` 已隐含 `| undefined`，显式写是冗余。

## 3. 导出约束

- 公共导出必须有明确消费者；内部 helper、context、options、provider、resolver 不要为了测试或未来扩展导出。
- 常规业务流程最好只需要 1-3 个公共导入；如果调用方要导入一串内部零件，先收敛门面。
- 公共 barrel 禁止 `export *`，必须显式 export。
- 修改公共入口时，同步更新 package exports、TS paths、Vite/Vitest alias 和 import smoke test。

## 4. 错误处理

- 不要新增静默兜底掩盖缺失 API、无效配置或状态不一致；错误应 fail-fast 或返回给 LLM 修正。
- 缺失能力、非法配置和状态冲突要显式失败。

## 5. 注释规范

- 注释只解释契约、约束、优先级和风险，不逐行解释显而易见的代码。
- VCM/LLM 可见语义必须在首次声明处用自然语言注释和结构化 tag 标注。
- 不用注释合理化静默兜底。

## 6. 硬门禁

- `pnpm run verify:rules` 必须通过。
- 禁止非 allowlist `interface`、`Interface/Impl` 机械命名、TypeScript `namespace`。
- 禁止非 `as const` 类型断言和尖括号类型断言。
- 禁止旧 `@spark-view/spark-ai/core`、`/protocol`、`/runtime`、`/adapter` 等 subpath。
- 禁止旧 `ModuleKind.PathContext`、`ModuleKind.OperationResult` 等 namespace 类型。
- 框架无关包禁止导入 Vue、Vue Router、Element Plus、VueUse 或 Pinia。
- workspace 包之间禁止绕过 `@spark-view/*` 的跨包相对导入。

## 7. 参考

详细业务上下文和验证命令见 `docs/ai/spark-ai-complete-guide.md`。
