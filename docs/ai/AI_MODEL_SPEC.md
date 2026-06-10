# AI 生成模型规范（AI_MODEL_SPEC）

> 状态：有效（2026-06）。**AI 不能什么都做**——本规范约束 AI 可生成的业务模型形态，确保每个模型可序列化、可恢复、可验证。

## 0. 治理定位

本规范是 AI 代码生成规则的具体化，位于 `ai-code-generation-behavior.md` 之下：

```
理念 > 逻辑 > AI 代码生成规则 > AI_MODEL_SPEC > SSOT || SOLID > 兼容
```

规范层级四层：

| 层 | 文档 | 职责 |
|----|------|------|
| **编写时** | AI_MODEL_SPEC.md（本文档） | 写什么代码：class 结构、序列化、继承 |
| **编译时** | VCM_NATIVE_CLASS_SPEC.md | 编译器从代码产出什么 metadata |
| **类型级** | vcm-native-class-contract.ts | 契约的结构化类型编码 |
| **审计** | vcm-native-class-lifecycle-audit.ts | 编译时审计 + CI 门禁 |

四层构成：**编写 → 契约 → 审计 → 门禁**。

## 1. 三段式 class 结构

每个业务模型 class 固定为三个区域，按顺序排列：

```typescript
export class MyModel {
  // ═══ 区域 1：constructor（反序列化入口 + 完整性验证） ═══
  constructor(options: MyModelOptions) { /* ... */ }

  // ═══ 区域 2：api ═══
  // —— static api（工厂方法）——
  static fromJson(json: MyModelMetadata | Record<string, unknown> | string): MyModel { /* ... */ }

  // —— instance api（查询 / 命令 / 序列化）——
  toJson(): MyModelMetadata { /* ... */ }
  someCommand(param: ParamType): ResultType { /* ... */ }

  // ═══ 区域 3：properties（仅公开 getter） ═══
  get id(): string { return this.#id }
  get name(): string { return this.#name }

  // —— 私有字段（不出现在以上三个区域的公共签名中）——
  #id: string
  #name: string
}
```

### 区域 1：constructor

- 接受**结构化 options object**（如 `DataSetConfig`、`SparkNodeTreeRootParams`），**不直接**接受 JSON string。
- 验证完整性：缺失必填字段立即 throw。不做静默兜底。
- 参数遵循已有签名约束：最多 4 个 `public readonly` 参数属性，超出用 options object。
- 禁止参数内嵌 JSDoc（移至类定义上方）。

### 区域 2：api

分两段，顺序固定：

1. **static api**（工厂方法）：`static fromJson`、`static fromDataSet`、`static fromRuleJson` 等
2. **instance api**（查询 / 命令 / 序列化）：`toJson()`、业务方法等

### 区域 3：properties

- **仅公开 getter**，无私有字段直接暴露。
- 禁止 public setter 绕过 class 不变量。变异通过 instance api 方法。
- 私有状态用 `#` 字段。子类访问父状态**只通过父 getter**，不直接引用 `#` 字段。

### 禁止事项

- 禁止第五个区域（辅助函数归入 instance api 或提取为模块级函数）。
- 禁止在 properties 区域放置可写 public 字段。
- 禁止 constructor 直接解析 JSON string（那是 `static fromJson` 的职责）。

### 参考先例

- `DataSet`：constructor 接受 `DataSetConfig` → `static fromJson(json: DataSetMetadata | Record<string, unknown> | string)` → getters → `toJson()` → 业务方法
- `DataTable`：同上模式
- `SparkNodeTree`：constructor → `static fromJson` / `fromRuleJson` / `fromPageChildren` → getters → 查询/写入 API

## 2. constructor 反序列化协议

### 职责分离

| 方法 | 职责 | 输入 |
|------|------|------|
| `constructor` | 验证完整性 + 初始化状态 | 结构化 options object |
| `static fromJson` | 解析 + 规范化 + 委托 constructor | `Metadata \| Record<string, unknown> \| string` |

### fromJson 协议

```typescript
static fromJson(json: MyModelMetadata | Record<string, unknown> | string): MyModel {
  // 1. string → parse
  if (typeof json === 'string') {
    const parsed: unknown = JSON.parse(json)
    return MyModel.fromJson(isRecord(parsed) ? parsed : { value: parsed })
  }

  // 2. 防御性校验
  const normalized = normalizeMyModelMetadata(json)

  // 3. 委托 constructor
  return new MyModel(normalized)
}
```

规则：
- `fromJson` 必须接受三种输入：metadata type、`Record<string, unknown>`、`string`。
- 对 `string` 输入执行 `JSON.parse`，失败时 throw（错误消息包含"fromJson"前缀以便溯源）。
- 对 `object` 输入做防御性校验（`isRecord`、字段类型检查、规范化）。
- 最终委托 constructor 完成实例化，不在 fromJson 中绕过 constructor 的验证逻辑。

### constructor 验证

- 缺失必填字段立即 throw。
- 类型不匹配立即 throw（不做隐式转换）。
- 错误消息包含字段名 + 期望类型，便于 LLM 修正。
- 禁止静默兜底（如 `name ?? 'unnamed'`）——缺失字段必须由调用方显式提供。

## 3. toJson() 输出协议

### 输出要求

1. **返回纯对象**——非 class 实例，不含循环引用，不含 `undefined`（省略 key 代替）。
2. **返回类型为 type alias**（如 `DataSetMetadata`、`TableMetadata`）——DTO 载体用 type，不用 class。
3. **递归调用子模型 toJson()**——嵌套模型必须也输出纯对象。
4. **输出符合 JSON Schema Draft 2020-12**——通过 `auditDraft2020Schema()` 结构审计 + `JsonSchemaValidator` 值验证。

### 输出示例

```typescript
toJson(): DataSetMetadata {
  const tables: Record<string, TableMetadata> = {}
  for (const [name, table] of Object.entries(this.tables)) {
    tables[name] = table.toJson() // 递归
  }
  const result: DataSetMetadata = {
    schemaVersion: this.schemaVersion,
    dataSetName: this.dataSetName,
    tables,
  }
  // 可选字段：省略 key 代替 undefined
  if (this.tableRelations !== undefined) result.tableRelations = this.tableRelations
  if (this.version !== undefined) result.version = this.version
  return result
}
```

### 双向保证

| 方向 | 保证 | 机制 |
|------|------|------|
| **输入侧** | constructor 验证完整性 | 必填字段缺失时 throw |
| **输出侧** | toJson() 输出符合 Draft 2020-12 schema | `auditDraft2020Schema()` + `JsonSchemaValidator` |

`fromJson(toJson())` 必须产生等价实例（幂等性）。这条规则不要求引用相等，只要求值相等。

### 禁止事项

- 禁止 toJson() 返回 class 实例。
- 禁止 toJson() 输出含 `undefined` 值的 key（`{ name: undefined }` → 应省略 `name`）。
- 禁止 toJson() 输出含循环引用的对象。
- 禁止跳过子模型 toJson()（嵌套模型不可直接赋值 class 实例）。

## 4. 继承链对称性

### 判别分发模式

父类 `static fromJson` 必须包含**判别分发（discriminator dispatch）**，根据判别字段路由到正确子类：

```typescript
abstract class BaseModel {
  abstract get modelKind(): string

  // 子类注册入口
  static readonly #kindRegistry = new Map<string, typeof BaseModel>()

  static registerKind(kind: string, ctor: typeof BaseModel): void {
    BaseModel.#kindRegistry.set(kind, ctor)
  }

  static fromJson(json: Record<string, unknown> | string): BaseModel {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json
    const kind = parsed['modelKind']
    if (typeof kind !== 'string') throw new Error('Missing modelKind discriminator')

    const ctor = BaseModel.#kindRegistry.get(kind)
    if (!ctor) throw new Error(`Unknown modelKind: ${kind}`)

    return ctor.fromJson(parsed)
  }

  abstract toJson(): Record<string, unknown>
}

// 子类
class ConfigModel extends BaseModel {
  get modelKind(): string { return 'config' }

  static {
    BaseModel.registerKind('config', ConfigModel)
  }

  static fromJson(json: Record<string, unknown> | string): ConfigModel { /* ... */ }

  toJson(): Record<string, unknown> {
    return { modelKind: 'config', /* ... */ }
  }
}
```

### 规则

1. 每个继承链的根 class 定义判别字段（如 `modelKind`、`nodeKind`）。
2. 父类 `static fromJson` 读取判别字段并分发到对应子类 `fromJson`。
3. 子类 `toJson()` **必须**包含判别字段。
4. 实现模式二选一：
   - **(a) registry map**：适合子类多、动态注册的场景（如插件体系）
   - **(b) switch / if-else**：适合子类少、固定枚举的场景（如 `instantiateNavigationKindNode`）
5. 判别字段的 metadata type 必须是 literal union（如 `'config' | 'module' | 'link'`），不用 `string`。

### 对称性要求

```
instance.toJson() → fromJson(json) → 等价实例
子类实例.toJson().modelKind === 子类.modelKind
父类.fromJson(子类实例.toJson()) instanceof 子类
```

### 参考先例

- `instantiateNavigationKindNode`：按 `nodeKind` switch 分发到 `ModuleNode`、`ConfigPageNode` 等
- `ConfigPageNode`/`ModuleNode` 继承 `ProjectNode`：当前通过 `nodeKind` getter 区分，但尚未实现 `fromJson` 多态分发

## 5. type vs class 边界

### 使用 type alias 的场景

| 场景 | 示例 |
|------|------|
| DTO / input / output 数据载体 | `DataSetMetadata`、`TableMetadata`、`PageNodeData` |
| JSON Schema 源类型 | `DataSetConfig`、`SparkNodeTreeRootParams` |
| options / params 对象 | `ProjectModelInitOptions`、`DataSetSaveChangesOptions` |
| 联合 / 映射 / 条件类型 | `'config' \| 'module' \| 'link'`、`Record<string, TableMetadata>` |
| 无运行时行为的契约 | 跨模块数据形状约定 |

### 使用 class 的场景

| 场景 | 示例 |
|------|------|
| 有生命周期和不变量的业务模型 | `DataSet`、`DataTable`、`DataView` |
| 拥有 toJson() / static fromJson() 的容器 | `DataSetCrudTool`、`SparkNodeTree` |
| 需要私有状态或 getter 计算属性 | `ProjectNode`（#node + getters） |
| 控制变异的方法 API | `DataSet.addTable()`、`ProjectNode.applyNavigationPatch()` |

### 核心判断

**有行为 → class；仅数据 → type。**

当对象满足以下任一条件时，必须用 class：
1. 有 `toJson()` 或 `static fromJson()` 方法
2. 有私有状态需要通过 getter 控制访问
3. 有业务不变量需要通过方法保证
4. 有生命周期管理（缓存、订阅、销毁）

不满足以上任何条件的数据载体，用 type alias。

本规则扩展 `ai-code-generation-behavior.md` §1"interface 使用原则"——"data carriers use type alias"。interface 的 SPICE gate 不变；本节补充 type vs class 的选择标准。

## 6. 与 VCM 生命周期契约对齐

### 映射表

| AI_MODEL_SPEC | VCM 契约 | 说明 |
|---|---|---|
| `toJson()` | `VcmNativeSnapshotClass.toJson()` | 同一方法，双重含义 |
| `static fromJson()` | `VcmNativeSnapshotFactory.fromJson()` | 同一方法 |
| 判别分发模式 | 无 VCM 对应 | 模型层约定，VCM metadata 不感知 |
| `@vcmSession` | 豁免 toJson/fromJson | 会话模型不受本规范 §2/§3 约束 |
| `@vcmFilePersisted` | 树模型有 `fromRuleJson` 等特殊工厂 | 持久化走文件 API，toJson 可选 |
| `@vcmSerializable` | 快照模型必须 toJson + fromJson | 完全受本规范约束 |

### 生命周期豁免

标有 `@vcmSession` 的 class 不需要 `toJson()` / `static fromJson()`。但仍然必须遵守 §1 三段式结构（constructor / api / properties）。

标有 `@vcmFilePersisted` 的 class 必须有 `static fromJson` 或 `fromRuleJson`，`toJson()` 建议但不强制。

### 豁免声明方式

在 class JSDoc 中标注：

```typescript
/**
 * 页面设计项目模型。
 * @moduleKind project
 * @vcmSession 编排会话；无整包 toJson。
 */
export class ProjectModel { /* ... */ }
```

验证脚本检测 `@vcmSession` tag 后跳过 toJson/fromJson 检查。

## 7. 验证

| 命令 | 作用 |
|------|------|
| `pnpm run verify:ai-model` | 静态检查（warn 模式） |
| `pnpm run verify:ai-model:strict` | 静态检查（strict 模式，warn 升级为 error） |
| `pnpm run verify:ai-model:schema` | 运行时 toJson() 输出的 Draft 2020-12 合规验证 |
| `pnpm run verify:rules` | 含 verify:ai-model（总门禁） |

### 静态检查项

1. 业务模型 class 是否有 `toJson()` 实例方法（`@vcmSession` 豁免）
2. 业务模型 class 是否有 `static fromJson` / `fromDataSet` / `fromRuleJson` / `reconcileFromJson` 工厂方法（`@vcmSession` 豁免）
3. `fromJson` 签名是否接受 `Metadata | Record<string, unknown> | string`
4. 继承链父类 fromJson 是否包含判别分发（建议性 info）

### 运行时验证

利用 `spark-json-document` 的 `auditDraft2020Schema()` 对 `toJson()` 输出做 Draft 2020-12 合规检查。

## 8. 渐进式落地

### 新增模型（立即生效）

新增业务模型 class 必须遵守：
1. 三段式结构（constructor / api / properties）
2. `toJson()` 返回 metadata type
3. `static fromJson()` 接受 JSON object | string
4. 继承链使用判别分发

### 现有模型迁移

| Class | 当前状态 | 迁移动作 |
|-------|----------|----------|
| `DataSet` | 合规 | 无需修改 |
| `DataTable` | 合规 | 无需修改 |
| `DataView` | 合规 | 无需修改 |
| `DataSetCrudTool` | 合规 | 无需修改 |
| `SparkNodeTree` | 合规 | 无需修改 |
| `ProjectNode` | 会话模型 | 确认 `@vcmSession` tag |
| `ConfigPageNode` | 会话模型 | 已有 `@vcmSession` |
| `ModuleNode` 等 | 会话模型子类 | 继承 `@vcmSession` 豁免 |

### 验证级别

- **初期**：`verify:ai-model`（warn 模式）集成到 `verify:rules`，warn 不阻塞 CI
- **一个发布周期后**：切换到 `verify:ai-model:strict`（strict 模式），warn 升级为 error，阻塞 CI

## 9. 相关文档

- AI 代码生成行为规范：`docs/ai/ai-code-generation-behavior.md`
- VCM 原生 Class 规范：`docs/ai/VCM_NATIVE_CLASS_SPEC.md`
- 生命周期契约类型：`packages/spark-ai/src/vcm-native/metadata/vcm-native-class-contract.ts`
- 生命周期编译时审计：`packages/vite-plugin-spark-catalog/src/vcm-native-class-lifecycle-audit.ts`
- JSON Schema Draft 2020-12 审计：`packages/spark-json-document/src/schema/schema-draft2020-audit.ts`
- 序列化参考实现：`packages/spark-data/src/dataset.ts`、`packages/spark-data/src/data-table.ts`、`packages/spark-data/src/data-view.ts`
