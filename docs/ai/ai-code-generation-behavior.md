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

- 优先按"接口契约 → class 基础/默认实现 → 具体 class → 必要子类"的层次组织代码。
- 不要把系统扁平化成大量平级 `interface`、泛型、工具类型和随处导出的符号。
- 先复用已有 class、registry、factory、capability key 和领域对象，再新增结构。

### interface 使用原则

- 不要默认为每个 class 创建同名 `interface`。
- 不要使用 `Ixxx`、`XxxInterface`、`XxxImpl` 这类机械命名。
- 只有稳定契约、跨模块能力、DTO/config/payload 或多个实现共享协议才使用 `interface`。
- 如果只有一个实现，默认使用具体 class 或普通函数。

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
