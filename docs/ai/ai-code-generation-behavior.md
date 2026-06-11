# AI 代码生成行为规范

> Codex 或其它 AI 编码助手修改本仓库时，必须遵守本文规则。

## 0. 治理优先级

AI 代码生成规则是生产线质量门，排在理念和逻辑之后、迁移便利之前。遇到冲突时按以下顺序裁决：

`理念 > 逻辑 > AI 生成代码规则 > SSOT || SOLID > 该删则删 || 该合则合 || 该拆则拆 > 迁移便利`

- 理念和业务生产线闭环优先于形式规则；规则如果误伤理念或逻辑，应修正规则。
- AI 生成代码规则优先于过期公共面和迁移层；扁平导出、过期协议和过期路径，该收窄就收窄。
- SSOT 和 SOLID 服务于业务逻辑，不用作机械口号。
- 发现真实重复、错误边界或过时迁移层时，该删则删、该合则合、该拆则拆；迁移便利排最后，只保留有明确业务价值的迁移路径。

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
- 不要制造"class 大平层"——同一目录下十几个 class 文件平铺，类名无层次前缀，相关 class 散落各处。
- 不要制造"文件大平层"——单个目录下二三十个文件平级，没有子目录分组。
- 不要制造"文件夹大平层"——同级目录超过 7 个、没有父子分组，全部平铺。
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
- AI 可编辑模型形态见 `docs/ai/AI_MODEL_SPEC.md`（`SparkAIModel` + 公开字段 + JSDoc；**模型 class 即 LLM 知识真源**，无 ClassModel 管线）。

### class 命名与组织层次

核心立场：**class 命名必须反映领域层次，不能所有人平级命名。** 同一目录下 class 文件平铺、类名无层次前缀、相关 class 散落各处——这就是"class 大平层"反模式。

#### class 命名层次规则

- 同一领域下的 class 必须有共同的命名前缀或后缀，表达层次归属。例如 `PageNodeFileApi`、`PageNodeFileCache`、`PageNodeFileCreator` 共享 `PageNodeFile` 前缀 → 它们属于同一个子领域，应归入 `page-file/` 子目录。
- 禁止在同一个目录下出现 5 个以上无共同前缀的 class——这说明领域划分不清。
- 子类命名必须体现"是一种"关系：`MongoUserRepository` implements `UserRepository`，不是 `UserRepositoryImpl`。

#### class 命名字典分层规则（强制）

核心立场：**class 命名必须反映领域路径（字典式），禁止多维度自由组合拼接（矩阵式）。**

**字典式命名**：类名 = 领域路径 + 领域内角色。左侧是稳定的领域层次路径，右侧是领域内部的自然细化。

```
✅ 字典式：领域路径 → 角色

PageFileReader       → 领域路径=PageFile, 角色=Reader
PageFileWriter       → 领域路径=PageFile, 角色=Writer
PageFileCache        → 领域路径=PageFile, 角色=Cache
DataSetValidator     → 领域路径=DataSet, 角色=Validator
DataSetTransformer   → 领域路径=DataSet, 角色=Transformer
```

特征：
- 新增领域内角色不会导致其他领域的类名变化
- 目录结构与命名完全一致——`PageFileReader` 自然归属 `page-file/` 子目录
- 类名长度只反映层次深度，不反映维度组合数

**矩阵式命名**（禁止）：类名 = 维度A × 维度B × 角色。多个正交维度的笛卡尔积拼接。

```
❌ 矩阵式：维度A × 维度B × 角色

维度1（存储）: Mongo / Redis / Memory
维度2（实体）: User / Order / Product
维度3（角色）: Repository / Service / Controller

→ MongoUserRepository, MongoOrderRepository, RedisUserRepository...
→ 3×3×3 = 27 个类名，没有层次，只有组合
```

特征：
- 类名中任意两段可以独立替换产生合法新类名 → 矩阵式
- 新增一个维度值（如加 `Postgres`）导致类名爆炸
- 目录结构无法自然分组——"按存储分"还是"按实体分"都合理但都不完整
- 类名长度随维度数线性增长

**强制规则：**

1. 类名结构必须是 `[领域路径][角色]`，不是 `[维度A][维度B][角色]`。
2. 领域路径必须与目录路径一一对应：`PageFileXxx` → `page-file/` 子目录。不允许 `PageFileXxx` 出现在根目录。
3. 角色后缀必须在领域内部有意义，不能跨领域复用为独立维度。
4. 新增 class 时先判断它属于哪个已有领域路径——属于已有领域则用该领域前缀并放入对应子目录；不属于任何已有领域则先建新领域子目录再放 class；绝不往根目录扔无前缀 class。
5. 实现细节（存储后端、序列化格式、传输协议等）不得作为命名维度。`MongoUserRepository` 中 `Mongo` 是实现细节不是领域路径——正确做法是 `UserRepository` 作为领域 class，`Mongo` 作为构造参数或配置，不进入类名。

**矩阵式命名检测信号：**

- 同一前缀段在多个类名中出现但不属于同一领域 → 矩阵式
- 类名中任意两段可以独立替换产生合法新类名 → 矩阵式
- 类名超过 3 段（A-B-C-Role）且前 2+ 段是正交维度 → 矩阵式
- 新增一个维度值（如新存储后端）需要为所有领域创建新类 → 矩阵式

**反例：矩阵式命名**

```ts
// ❌ 禁止：3 个正交维度的笛卡尔积

// 维度1（存储）× 维度2（实体）× 维度3（角色）
export class MongoUserRepository { /* ... */ }
export class MongoOrderRepository { /* ... */ }
export class RedisUserRepository { /* ... */ }
export class RedisOrderRepository { /* ... */ }
export class MemoryUserRepository { /* ... */ }
export class MemoryOrderRepository { /* ... */ }

// 新增加 Postgres → 又要写 PostgresUserRepository, PostgresOrderRepository...
// 新增加 Product 实体 → 又要写 MongoProductRepository, RedisProductRepository...
// 2×2 已经 6 个类，3×3 = 27 个类，维度爆炸
```

**正例：字典式分层命名**

```ts
// ✅ 正确：领域路径 + 角色，实现细节不入类名

// --- user/user-repository.ts ---
export class UserRepository {
  // 领域路径=User, 角色=Repository
  // 存储后端通过构造参数注入，不进入类名
  constructor(private readonly store: DataStore) {}
}

// --- user/user-service.ts ---
export class UserService {
  // 领域路径=User, 角色=Service
}

// --- order/order-repository.ts ---
export class OrderRepository {
  // 领域路径=Order, 角色=Repository
  constructor(private readonly store: DataStore) {}
}

// --- order/order-service.ts ---
export class OrderService {
  // 领域路径=Order, 角色=Service
}

// 新增加 Postgres → 只需新建 DataStore 实现，不改任何类名
// 新增加 Product → 新建 product/ 子目录 + ProductRepository，不影响 user/ 和 order/
```

**命名字典分层检查清单：**

新增或重命名 class 时，必须依次回答：

1. **领域路径是什么？** — 类名左侧连续大写段（如 `PageFile`）
2. **角色是什么？** — 类名最右一段（如 `Reader`、`Validator`）
3. **中间有没有可独立替换的维度？** — 有则违反字典分层，必须重新组织
4. **目录路径与领域路径一致吗？** — `PageFileXxx` → `page-file/` 子目录
5. **新增维度值是否导致类名爆炸？** — 如果加一个存储后端需要改所有领域类名，说明该维度是实现细节，不进入类名

#### class 文件组织规则

- 同一目录下 class 文件超过 **7 个** 时，必须按领域拆分子目录。
- 共享明确前缀的 class（如 `XxxDelegate`、`XxxAgent`、`XxxModel`）必须放入以该前缀命名的子目录。
- 一个 class 一个文件，但相关的 class 应共处于同一个子目录，不是散落在不同目录。

#### 反例：class 大平层

```ts
// ❌ 禁止：8 个 Delegate 类平铺在 strategies/ 目录下，无子目录分组

// --- strategies/AggregateDelegate.ts ---
export class AggregateDelegate { /* ... */ }

// --- strategies/CascadeDelegate.ts ---
export class CascadeDelegate { /* ... */ }

// --- strategies/ComputedColumnDelegate.ts ---
export class ComputedColumnDelegate { /* ... */ }

// --- strategies/CrudDelegate.ts ---
export class CrudDelegate { /* ... */ }

// --- strategies/DirtyTrackingDelegate.ts ---
export class DirtyTrackingDelegate { /* ... */ }

// --- strategies/LocalMutationDelegate.ts ---
export class LocalMutationDelegate { /* ... */ }

// --- strategies/PrimaryKeyDelegate.ts ---
export class PrimaryKeyDelegate { /* ... */ }

// --- strategies/SelectionDelegate.ts ---
export class SelectionDelegate { /* ... */ }

// 8 个 Delegate，全平级，没有按职责（数据完整性 vs 变更追踪 vs UI）分组。
// 新增一个 Delegate 时开发者不知道该放哪，只能继续往 strategies/ 扔。
```

#### 正例：class 按领域分层

```ts
// ✅ 正确：按职责拆分子目录，class 命名保留领域前缀

// --- strategies/data-integrity/PrimaryKeyDelegate.ts ---
export class PrimaryKeyDelegate { /* ... */ }

// --- strategies/data-integrity/CascadeDelegate.ts ---
export class CascadeDelegate { /* ... */ }

// --- strategies/data-integrity/ComputedColumnDelegate.ts ---
export class ComputedColumnDelegate { /* ... */ }

// --- strategies/data-integrity/AggregateDelegate.ts ---
export class AggregateDelegate { /* ... */ }

// --- strategies/mutation/CrudDelegate.ts ---
export class CrudDelegate { /* ... */ }

// --- strategies/mutation/DirtyTrackingDelegate.ts ---
export class DirtyTrackingDelegate { /* ... */ }

// --- strategies/mutation/LocalMutationDelegate.ts ---
export class LocalMutationDelegate { /* ... */ }

// --- strategies/ui/SelectionDelegate.ts ---
export class SelectionDelegate { /* ... */ }

// 职责清晰，新增 Delegate 时能立刻判断归属子目录。
// 每个子目录下文件数 ≤ 4，一目了然。
```

### 文件与目录组织规则（强制）

核心立场：**文件按领域层次组织，不按类型平铺。** 一个目录下二三十个文件平级、没有子目录分组——这就是"文件大平层"反模式。

#### 文件数量硬限制

- 单个目录下 `.ts`/`.vue` 文件数 **不得超过 10 个**（不含 `index.ts` 桶文件）。
- 超过 10 个时，必须按领域或功能拆分为子目录。
- 测试文件同样适用此规则——测试目录下超过 10 个测试文件时，必须按被测模块拆分子目录。

#### 文件命名前缀规则

- 当 3 个及以上文件共享同一前缀（如 `page-file-api.ts`、`page-file-cache.ts`、`page-file-creator.ts`），这些文件构成一个子领域，必须归入以该前缀命名的子目录。
- 反例：`model/` 目录下 6 个 `page-file-*.ts` 文件与 4 个 `page-*-model.ts` 文件平铺——应拆为 `model/page-file/` 和 `model/page-model/`。

#### 组件文件配对规则

- `.props.ts` + `.vue` 配对文件（如 `FieldText.props.ts` + `FieldText.vue`）必须放入组件专属子目录。
- 反例：`data-components/` 目录下 60 个文件（30 个 `.vue` + 30 个 `.props.ts`）全部平铺。
- 正例：`data-components/FieldText/` 目录下只有 `FieldText.props.ts` + `FieldText.vue`。

#### 反例：文件大平层

```
// ❌ 禁止：data-components/ 目录下 60 个文件平铺
data-components/
  FieldAutocomplete.props.ts
  FieldAutocomplete.vue
  FieldCascader.props.ts
  FieldCascader.vue
  FieldCheckbox.props.ts
  FieldCheckbox.vue
  ... (54 more files)
  index.ts
```

#### 正例：按组件拆分子目录

```
// ✅ 正确：每个组件一个子目录
data-components/
  basic/
    FieldText/
      FieldText.props.ts
      FieldText.vue
    FieldNumber/
      FieldNumber.props.ts
      FieldNumber.vue
  selection/
    FieldSelect/
      FieldSelect.props.ts
      FieldSelect.vue
    FieldCheckbox/
      FieldCheckbox.props.ts
      FieldCheckbox.vue
  index.ts
```

### 文件夹层次规则

核心立场：**文件夹按领域分组，不能所有人平级。** 同级目录超过一定数量、没有父子分组——这就是"文件夹大平层"反模式。

#### 同级目录数量限制

- 同一级目录下子目录数 **不得超过 7 个**（不含文件）。
- 超过 7 个时，必须按领域或关注点合并为父级分组目录。

#### 目录命名层次

- 目录名必须体现领域归属，形成从粗到细的层次路径。
- 反例：`src/services/` 下 13 个文件 + 0 个子目录，AI、认证、项目三类服务平铺。
- 正例：`src/services/ai/`、`src/services/auth/`、`src/services/project/` 三层分组。

#### 反例：文件夹大平层

```
// ❌ 禁止：13 个服务文件 + 0 个子目录
services/
  ai-host.ts
  ai-host-run-bridge.ts
  ai-turn-bridge.ts
  page-design-ai-runner.ts
  page-design-host-run-provider.ts
  sse-events.ts
  auth.ts
  http.ts
  api-paths.ts
  project-switch.ts
  project-ui-settings.ts
  tenant-scope.ts
```

#### 正例：按领域分组

```
// ✅ 正确：三级领域分组，每级 ≤ 7 个条目
services/
  ai/
    ai-host.ts
    ai-host-run-bridge.ts
    ai-turn-bridge.ts
  page-design/
    page-design-ai-runner.ts
    page-design-host-run-provider.ts
  project/
    project-switch.ts
    project-ui-settings.ts
    tenant-scope.ts
  auth.ts
  http.ts
  api-paths.ts
  sse-events.ts
```

### 大平层收束检查清单

新增 class、文件或目录前，回答三个问题：
1. 同级目录下文件/子目录数是否超过 7 个？（是 → 拆分子目录再新增）
2. 是否有 3 个及以上现有文件/class 共享同一前缀？（是 → 它们应归入子目录）
3. 这个新 class/文件与现有代码属于同一子领域吗？（是 → 放入对应子目录，别往根目录扔）

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
- LLM 可见语义必须在首次声明处用自然语言注释、类型签名和命名表达；不要新增约定标签。
- 不用注释合理化静默兜底。

## 6. 硬门禁

- `pnpm run verify:rules` 必须通过。
- 禁止非 allowlist `interface`、`Interface/Impl` 机械命名、TypeScript `namespace`。
- 禁止非 `as const` 类型断言和尖括号类型断言。
- 禁止已移除的 `@spark-appworks/spark-ai/core`、`/protocol`、`/runtime`、`/adapter` 等 subpath。
- 禁止已移除的 `ModuleKind.PathContext`、`ModuleKind.OperationResult` 等 namespace 类型。
- 框架无关包禁止导入 Vue、Vue Router、Element Plus、VueUse 或 Pinia。
- workspace 包之间禁止绕过 `@spark-appworks/*` 的跨包相对导入。
- **单目录文件数**：单个目录下 `.ts`/`.vue` 文件不得超过 10 个（不含 `index.ts`）；超过必须拆子目录。
- **单目录子目录数**：同一级目录下子目录数不得超过 7 个；超过必须按领域合并父级分组。
- **class 命名层次**：同一目录下 5 个以上无共同前缀的独立 class 视为领域划分不清，必须拆分子目录。
- **class 命名字典分层**：类名必须是 `[领域路径][角色]`（字典式），禁止多正交维度拼接（矩阵式）；实现细节（存储后端、序列化格式、传输协议）不得作为命名维度。
- **组件配对文件**：`.props.ts` + `.vue` 配对文件必须放入组件专属子目录，禁止平铺在父目录。
- **测试文件层次**：测试目录同样受上述文件数和目录数限制。

## 7. 参考

DTS ClassModel 生成链路见 `scripts/generate-dts-class-model.mjs`；仓库验证命令见根目录 `package.json`。
