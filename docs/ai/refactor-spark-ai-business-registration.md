# spark-ai 业务注册机制重构方案：VCM 嵌套 Schema 驱动 API 对象模型

> **状态**：方案评审中
> **范围**：`packages/spark-ai`、`packages/vite-plugin-spark-catalog`、`packages/spark-project-model`
> **向后兼容**：旧 `AiModule` + `AiModuleRuntime` 不删除，供旧业务继续使用；新 adapter 不依赖旧 children/list/find 机制

---

## 核心范式转换

**旧模型**：业务方声明 `children` → 运行时 `listChildren`/`findInstance` 子实例 → 子模块显式 `new` 后注册到 `AiModuleRuntime`。
这是一种"静态子模块树"设计：业务方需要手写子模块 class、手写 list/find 委托、手动往 runtime 注册每个子模块 class。

**新模型**：action 返回对象由 VCM `resultSchema` 自动发现嵌套 API → 运行时创建可寻址 handle → LLM 继续调用该对象 API。
这是一种"API 对象图"设计：业务方只需在返回类型中使用带 class 级模块注解的 API class，VCM 构建期自动发现 public `AiModuleResult` 方法，adapter 运行时自动处理。

**被替换的旧机制（仅允许在"旧模型对比"中出现，不得作为新方案机制使用）**：

| 旧机制 | 位置 | 新方案替代 |
|--------|------|-----------|
| `children: string[]` | `AiModuleOptions` | `resultApis` 从返回类型自动发现 |
| `parentKind: string` | `AiModuleOptions` | 无需。嵌套关系由 action 返回对象表达 |
| `@moduleChildren` | JSDoc tag | 移除。VCM 从返回类型自动推断 |
| `@moduleParentKind` | JSDoc tag | 移除。同上 |
| `listChildren` | `AiModuleOptions` | 无需。action 返回含 API 的对象 → adapter 创建 handle |
| `findInstance` | `AiModuleOptions` | 无需。adapter 按 handle 寻址 |
| 手写子模块 class + `runtime.register()` | 业务代码 | 无需。`resultApis` 描述嵌套 API，adapter 按 handle 协议自动路由 |
| `AiModuleInstanceRef` | 运行时引用 | 无需。handle 替代 |

---

## 架构总览

```
业务 class（普通 class，不继承 AiModule，不手写 AiModuleOptions）
  + class 级 JSDoc tags（@moduleKind, @moduleName, @moduleDescription ...）
  + 方法参数 TypeScript 类型 → paramsSchema
  + 方法返回 TypeScript 类型 → resultSchema + 嵌套 API 发现
      │
      ↓  构建：module-metadata-generator.ts（扩展）
      │
元数据 JSON（*.module-metadata.json）
  描述 API 对象图：
    rootApi: { kind, name, description, actions[], attributes[] }
    actions[].resultApis: []  ← VCM 从返回类型递归发现
      │
      ↓  运行时：AiModuleAdapter.register()
      │
  ① 校验 JSON 是否符合 AiApiObjectMetadataSchema
  ② 绑定 root class 方法为 action runner
  ③ action 执行后，返回对象含 API → adapter 创建 handle
  ④ handle 上的 API 可被 LLM 继续调用
  ⑤ 生命周期由 adapter 管理对象 handle
```

> **框架约定**：业务 class 通过 `AiModulePathContext` 和 `AiModuleResult` 两个框架类型与协议层交互。这是最小编程接口——不需要继承 `AiModule`、不需要手写 `AiModuleOptions`、不需要手写 `list`/`find`/`runner` 委托。如需完全零依赖，业务 class 可使用纯 JSON DTO 作为参数/返回值，由 adapter 在 runner 内完成投影，但这是可选优化，不是必须遵守的约束。

---

## 第一步：元数据 Schema — API 对象图

### 文件：`packages/spark-ai/src/modules/metadata/ai-api-object-metadata-schema.ts`

```typescript
/**
 * VCM 生成的 API 对象元数据。
 * 描述一个可被 LLM 操作的 API 对象：它有什么 action、参数和返回值是什么。
 * 返回值中如果嵌套了含 API 的对象，通过 resultApis 递归表达。
 */

/** API 对象元数据（根对象或嵌套返回对象） */
export type AiApiObjectMetadata = Readonly<{
  /** API 对象类型标识（全小写，如 "manual-leave"、"leave-draft"） */
  kind: string
  /** LLM 可见名称 */
  name: string
  /** LLM 可见描述 */
  description: string
  /** 可调用的 action 列表 */
  actions: readonly AiApiActionMetadata[]
  /**
   * 可读写的属性（可选，VCM 从 class 属性或 getter 发现）。
   * 注意：v1 adapter 暂不支持 attributes——声明时需同步提供 attributeAccessor，
   * 否则 AiModule 构造会失败。attributes 支持留待 v2。
   */
  attributes?: readonly AiModuleAttributeMetadata[]
}>

/** action 元数据 */
export type AiApiActionMetadata = Readonly<{
  /** LLM 可见的 action 名称（如 "submitDraft"） */
  name: string
  /** class 上的方法名（默认与 name 相同） */
  methodName: string
  /** LLM 可见描述（来自方法 JSDoc summary） */
  description: string
  /** 参数 JSON Schema（从方法第 2 个参数类型生成） */
  paramsSchema: AiJsonSchemaObject
  /** 返回值 JSON Schema（从方法返回类型生成） */
  resultSchema?: AiJsonSchema
  /** 返回值中嵌套的 API 对象（VCM 从返回类型递归发现） */
  resultApis?: readonly AiApiResultApiRef[]
  /** 使用规则 */
  usageRules?: readonly string[]
  /** 失败模式 */
  failureModes?: readonly AiModuleFunctionFailureMode[]
}>

/**
 * resultApis 中的条目：API 对象元数据 + 在返回值中的定位路径。
 * resultPath 告诉 adapter 从 action 返回的 result.data 中如何提取 API-bearing 实例：
 *   [] — 返回值本身即为 API-bearing 对象（如 listPersons 返回 PersonDirectory）
 *   ["directory"] — 返回值.directory 是 API-bearing 对象
 *   ["items", "0"] — 返回值.items[0] 是 API-bearing 对象
 */
export type AiApiResultApiRef = Readonly<{
  /** 从 result.data 到 API-bearing 对象的访问路径 */
  resultPath: readonly string[]
  /** API 对象元数据 */
  api: AiApiObjectMetadata
}>

/** VCM 生成的完整模块元数据 JSON */
export type AiModuleMetadataJson = Readonly<{
  /** 根 API 对象 */
  rootApi: AiApiObjectMetadata
  /** 元数据版本（用于未来格式迁移） */
  schemaVersion: 1
}>
```

### 与旧 schema 的关键差异

| 维度 | 旧 schema | 新 schema |
|------|----------|----------|
| 子模块关系 | `children: string[]` + `parentKind` | 无。`resultApis` 从返回类型自动发现 |
| 函数表 | `functions: AiModuleFunctionMetadata[]` | `actions: AiApiActionMetadata[]`（含 `methodName` + `resultApis`） |
| 实例发现 | `listChildren` / `findInstance` 委托 | 无。action 返回含 API 的对象 → adapter 创建 handle |
| 子模块注册 | `runtime.register(subAiModule)` 显式注册每个子模块 class | 无需。adapter 按 `resultApis` + handle 协议自动路由，无需业务方构造子 AiModule |
| paramsSchema | 手写 | VCM 从方法参数类型生成 |
| resultSchema | 可选手写 | VCM 从方法返回类型生成 |

---

## 第二步：JSDoc tag 规范

### class 级 JSDoc tags

| Tag | 必填 | 格式 | 生成到 |
|-----|------|------|--------|
| `@moduleKind` | **是** | `@moduleKind <kind>` | `rootApi.kind` |
| `@moduleName` | **是** | `@moduleName <名称>` | `rootApi.name` |
| `@moduleDescription` | **是** | `@moduleDescription <描述>` | `rootApi.description` |

**移除**：`@moduleChildren`、`@moduleParentKind`（不再需要，子 API 由 VCM 返回类型自动发现）

### 方法级发现规则

方法级不再使用 VCM 专用 tag。action 由生成器自动发现：

- 方法必须是 `public`。
- 方法必须返回 `AiModuleResult<T>` 或 `Promise<AiModuleResult<T>>`。
- 方法必须有自然语言 JSDoc summary，生成到 `actions[].description`。
- `actions[].name` 固定使用 method name。
- 非 AI 可见方法使用 `private/protected`，或不返回 `AiModuleResult`；特殊情况下可用通用 `@internal` 排除。

```typescript
// ✅ 正确：没有方法级 VCM tag，action name 来自 method name
/**
 * 提交请假草稿
 */
submitDraft(ctx: AiModulePathContext, args: Readonly<{ reason?: string }>): AiModuleResult<AiJsonValue>
```

### VCM 自动发现规则（无 JSDoc tag，纯类型推断）

**参数 schema**：方法第 2 个参数 `args` 的 TypeScript 类型 → `paramsSchema`

**返回 schema**：方法返回类型 → `resultSchema`
- `AiModuleResult<AiJsonValue>` → 展开泛型参数，从 `AiJsonValue` 提取结构
- `AiModuleResult<Readonly<{ draft: LeaveDraft }>>` → 生成 object schema + 识别 `LeaveDraft` 为 API-bearing

**嵌套 API 发现**：如果返回类型展开后，某个属性的类型是另一个带 class 级模块注解且含 public `AiModuleResult` 方法的 class → 递归生成 `resultApis` 条目

```typescript
// LeaveRequestService 的 listPersons 方法返回 PersonDirectory
// PersonDirectory 有 class 级 @moduleKind，且有 public AiModuleResult 方法 → VCM 自动发现
/**
 * 获取人员目录
 */
listPersons(ctx: AiModulePathContext, args: Readonly<{}>): AiModuleResult<PersonDirectory>
```

VCM 发现 `PersonDirectory` class 有 class 级模块注解和 public action 方法 → 生成 `resultApis`：

```json
{
  "name": "listPersons",
  "methodName": "listPersons",
  "description": "获取人员目录",
  "paramsSchema": { "type": "object", "properties": {}, "required": [] },
  "resultSchema": { "$ref": "#/resultApis/PersonDirectory" },
  "resultApis": [
    {
      "resultPath": [],
      "api": {
        "kind": "person-directory",
        "name": "人员目录",
        "description": "请假人员和审批人查询",
        "actions": [
          {
            "name": "searchPersons",
            "methodName": "searchPersons",
            "description": "按条件搜索人员",
            "paramsSchema": { ... }
          },
          {
            "name": "getPerson",
            "methodName": "getPerson",
            "description": "按编码获取人员详情",
            "paramsSchema": { ... }
          }
        ]
      }
    }
  ]
}
```

---

## 第三步：构建期生成——扩展 module-metadata-generator.ts

### 修改文件：`packages/vite-plugin-spark-catalog/src/module-metadata-generator.ts`

**3a. `@moduleAction` 解析改为严格单 token**

当前 `createActionMetadata()` 读取 `@moduleAction` 的全部文本作为 actionName。

改为：只取第一个空白分隔的 token 作为 functionName，忽略后续文本（如果有的话，发出 warn）。

```typescript
function createActionMetadata(input: ActionMetadataCreateInput): ModuleActionMetadata | undefined {
  const { root, sourceFile, checker, node } = input
  const tags = readDocTags(node, sourceFile)
  const rawActionName = firstTagText(tags, 'moduleAction')
  if (rawActionName === undefined) return undefined

  // 严格解析：只取第一个 token
  const actionName = rawActionName.split(/\s+/u)[0]
  if (actionName.length === 0) return undefined
  if (rawActionName !== actionName) {
    console.warn(
      `@moduleAction "${rawActionName}" contains extra text after functionName; `
      + `description should be in JSDoc summary, not after @moduleAction`,
    )
  }
  // ...
}
```

**3b. 新增 paramsSchema 生成**

从方法第 2 个参数（`args`）的 TypeScript 类型自动生成 JSON Schema。

```typescript
function generateParamsSchema(
  checker: ts.TypeChecker,
  method: ts.MethodDeclaration,
): AiJsonSchemaObject {
  const params = method.parameters
  const argsParam = params.length >= 2 ? params[1] : undefined
  if (argsParam === undefined) {
    return { type: 'object', properties: {}, required: [] }
  }
  const argsType = checker.getTypeAtLocation(argsParam)
  return tsTypeToJsonSchema(checker, argsType)
}
```

**3c. 新增 resultSchema 生成**

从方法返回类型生成 JSON Schema，展开 `AiModuleResult<T>` 提取内部类型 `T`。

```typescript
function generateResultSchema(
  checker: ts.TypeChecker,
  method: ts.MethodDeclaration,
): AiJsonSchema | undefined {
  const returnType = checker.getReturnTypeOfSignature(
    checker.getSignatureFromDeclaration(method)!,
  )
  const innerType = unwrapAiModuleResult(checker, returnType)
  if (innerType === undefined) return undefined
  return tsTypeToJsonSchema(checker, innerType)
}

/**
 * 从 AiModuleResult<T> / Promise<AiModuleResult<T>> 中提取 T。
 *
 * 实现要求：
 *   1. 先用 TypeChecker 展开 awaited type（Promise<T> → T），不要手写 union 猜测。
 *   2. 再判断 awaited type 是否为 TypeReference，且 target symbol 名称为 AiModuleResult。
 *   3. 命中时读取第 1 个 type argument 作为业务返回类型。
 *   4. 未命中 AiModuleResult<T> 时，直接把 awaited type 当普通返回类型处理。
 *
 * 注意：不要照抄 type.isInterfaceType()/isClassType() 这类不稳定判断；
 * 具体实现应基于 TypeChecker 的 awaited type + TypeReference + symbol name。
 */
function unwrapAiModuleResult(checker: ts.TypeChecker, type: ts.Type): ts.Type | undefined {
  const awaited = checker.getAwaitedType(type) ?? type
  if (isTypeReferenceTo(awaited, 'AiModuleResult')) {
    const args = checker.getTypeArguments(awaited)
    return args[0]
  }
  return awaited
}
```

**3d. 新增嵌套 API 发现**

递归扫描返回类型：如果返回类型（或其属性类型）是另一个含 `@moduleAction` 方法的 class，则为该 class 生成 `AiApiObjectMetadata` 加入 `resultApis`。

```typescript
/**
 * 递归发现返回类型中的 API-bearing 嵌套对象。
 * visited 防止递归循环。
 */
function discoverResultApis(
  checker: ts.TypeChecker,
  method: ts.MethodDeclaration,
  visited: Set<number>,
): AiApiResultApiRef[] {
  const returnType = getInnerReturnType(checker, method)
  if (returnType === undefined) return []

  const apis: AiApiResultApiRef[] = []
  discoverApisFromType(checker, returnType, [], visited, apis)
  return apis
}

function discoverApisFromType(
  checker: ts.TypeChecker,
  type: ts.Type,
  resultPath: readonly string[],
  visited: Set<number>,
  results: AiApiResultApiRef[],
): void {
  const declarations = type.symbol?.declarations
  if (declarations === undefined) return
  for (const decl of declarations) {
    if (!ts.isClassDeclaration(decl)) continue
    const tags = readDocTags(decl, decl.getSourceFile())
    const kind = firstTagText(tags, 'moduleKind')
    if (kind === undefined) continue  // 不是 API class

    const typeId = (type as any).id
    if (visited.has(typeId)) continue  // 防循环
    visited.add(typeId)

    const apiMetadata = createApiObjectMetadata(checker, decl, tags, kind, visited)
    if (apiMetadata !== undefined) results.push({ resultPath, api: apiMetadata })
  }

  // 递归检查可枚举 properties；不要依赖 isInterfaceType/isClassType 判断
  for (const prop of type.getProperties()) {
    const declaration = prop.declarations?.[0]
    if (declaration === undefined) continue
    const propType = checker.getTypeOfSymbolAtLocation(prop, declaration)
    discoverApisFromType(checker, propType, [...resultPath, prop.name], visited, results)
  }
}
```

**3e. 输出格式改为 `AiModuleMetadataJson`**

不再输出 `children/parentKind`。输出格式示例：

```json
{
  "schemaVersion": 1,
  "rootApi": {
    "kind": "manual-leave",
    "name": "人工请假",
    "description": "帮助员工收集、确认并提交人工请假申请",
    "actions": [
      {
        "name": "describeDraft",
        "methodName": "describeDraft",
        "description": "描述当前请假草稿",
        "paramsSchema": { "type": "object", "properties": {}, "required": [] }
      },
      {
        "name": "submitDraft",
        "methodName": "submitDraft",
        "description": "提交请假草稿",
        "paramsSchema": {
          "type": "object",
          "properties": { "reason": { "type": "string" } },
          "required": []
        },
        "usageRules": ["必须先确认草稿内容"],
        "failureModes": [{ "code": "DRAFT_NOT_FOUND", "when": "草稿不存在", "fix": "先创建草稿" }]
      },
      {
        "name": "listPersons",
        "methodName": "listPersons",
        "description": "获取人员目录",
        "paramsSchema": { "type": "object", "properties": {}, "required": [] },
        "resultApis": [
          {
            "resultPath": [],
            "api": {
              "kind": "person-directory",
              "name": "人员目录",
              "description": "请假人员和审批人查询",
              "actions": [
                {
                  "name": "searchPersons",
                  "methodName": "searchPersons",
                  "description": "按条件搜索人员",
                  "paramsSchema": {
                    "type": "object",
                    "properties": { "keyword": { "type": "string" }, "role": { "type": "string" } },
                    "required": []
                  }
                },
                {
                  "name": "getPerson",
                  "methodName": "getPerson",
                  "description": "按编码获取人员详情",
                  "paramsSchema": {
                    "type": "object",
                    "properties": { "code": { "type": "string" } },
                    "required": ["code"]
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

---

## 第四步：注册中间类——AiModuleAdapter

### 文件：`packages/spark-ai/src/agent/business/ai-module-adapter.ts`

AiModuleAdapter 是业务方与运行时之间的桥梁。业务方只需：
1. 提供业务 class（或已构造的实例）
2. 提供 VCM 生成的 `*.module-metadata.json`
3. 可选地提供生命周期钩子

**业务方不需要**：手写子模块 class、手写 list/find 委托、手动注册子模块、声明 `children`。嵌套 API 的发现和 handle 创建全部由 adapter 自动处理。

#### Handle 类型定义

```typescript
/**
 * API 对象 handle — adapter 为 action 返回的 API-bearing 对象创建的可寻址引用。
 *
 * handle 是运行时概念，不存在于构建期的 metadata JSON 中。
 * 当 action 返回一个含 @moduleAction 方法的对象时，adapter：
 *   1. 创建 handle 记录该对象实例及其 action metadata
 *   2. 在返回结果中附带 handle 描述（handleId + apiKind）
 *   3. LLM 后续通过 handleId + actionName + args 调用该对象的 API
 */
export type AiApiObjectHandle = Readonly<{
  /** handle ID（在 business instance scope 内唯一，如 "hnd_01"） */
  handleId: string
  /** 该 handle 对应的 API 对象 kind（对应 resultApis 中的 kind，如 "person-directory"） */
  apiKind: string
  /** 对象实例引用（adapter 内部使用，不暴露给 LLM） */
  instance: object
  /** 该 handle 可调用的 action 列表（来自 resultApis 中的 actions） */
  actions: readonly AiApiActionMetadata[]
  /** 所属 business instance ID（用于 per-instance 隔离） */
  businessInstanceId: string
}>
```

#### Handle Registry 设计

handle 按 business instance 分区存储，避免多 session/多 instance 互相干扰：

```typescript
/**
 * handle 注册表 — 按 businessInstanceId 分区。
 * 每个 business instance 有独立的 handle 命名空间，
 * business instance 结束或释放时只清空对应 instance 的 handles。
 *
 * registry 以 adapter 实例为生命周期载体，
 * adapter 实例随 AiAgentRegistration 创建，随 host 销毁。
 */
export class AiModuleHandleRegistry {
  private readonly handlesByInstance = new Map<string, Map<string, AiApiObjectHandle>>()
  private handleCounter = 0

  /** 注册 handle，返回分配的 handleId */
  public register(businessInstanceId: string, entry: Omit<AiApiObjectHandle, 'handleId' | 'businessInstanceId'>): string {
    const handleId = `hnd_${++this.handleCounter}`
    const handle: AiApiObjectHandle = { ...entry, handleId, businessInstanceId }
    let instanceMap = this.handlesByInstance.get(businessInstanceId)
    if (instanceMap === undefined) {
      instanceMap = new Map()
      this.handlesByInstance.set(businessInstanceId, instanceMap)
    }
    instanceMap.set(handleId, handle)
    return handleId
  }

  /** 获取 handle */
  public get(businessInstanceId: string, handleId: string): AiApiObjectHandle | undefined {
    return this.handlesByInstance.get(businessInstanceId)?.get(handleId)
  }

  /** 清空指定 business instance 的所有 handles */
  public clearForInstance(businessInstanceId: string): void {
    this.handlesByInstance.get(businessInstanceId)?.clear()
    this.handlesByInstance.delete(businessInstanceId)
  }
}
```

#### AiModuleAdapter 类

```typescript
/**
 * 模块注册适配器——VCM 嵌套 Schema 驱动的 API 对象模型。
 *
 * 职责：
 *   1. 校验元数据 JSON 是否符合 AiApiObjectMetadataSchema
 *   2. 绑定 root class 方法为 action runner
 *   3. action 返回含 API 的对象 → 创建 handle 并注册到 handleRegistry
 *   4. 通过 handleId + actionName + args 调用 handle 上的 API
 *   5. handle 生命周期随 business instance/session 管理
 *
 * v1 不使用 AiModule 作为 handle 协议底座——只构造一个最小 root AiModule
 * 用于函数路由和 tool 生成，handle 调用走独立的 dispatchHandle 路径。
 */
export class AiModuleAdapter {

  private readonly handleRegistry = new AiModuleHandleRegistry()

  /**
   * 注册业务模块。
   *
   * @param host         - AI Host 实例
   * @param alias        - 注册别名（host.register 的键）
   * @param moduleClass  - 业务 class
   * @param metadata     - VCM 生成的元数据 JSON
   * @param options      - 运行时选项
   */
  public static register<T>(
    host: AiAgentHost,
    alias: string,
    moduleClass: new (...args: any[]) => T,
    metadata: AiModuleMetadataJson,
    options: AiModuleAdapterRegisterOptions<T>,
  ): AiAgentHost {
    // 1. 校验元数据
    validateApiObjectMetadata(metadata.rootApi)

    // 2. 获取或创建 class 实例
    const instance = options.instance ?? new moduleClass(...(options.constructArgs ?? []))

    // 3. 构建 adapter 实例（持有 handleRegistry）
    const adapter = new AiModuleAdapter()

    // 4. 构建 root AiModule（最小构造：只有 runner 和 find，不设 children/attributes）
    const runtime = new AiModuleRuntime()
    const rootModule = adapter.buildRootAiModule(metadata.rootApi, instance)
    runtime.register(rootModule)

    // 5. 将 module_handle_call 注册为运行时 tool
    //    adapter 通过 ProtocolToolRouter 拦截 module_handle_call，
    //    路由到 adapter.dispatchHandle()
    const handleCallTool = adapter.createHandleCallToolSpec(metadata.rootApi)
    runtime.registerHandleCallTool(handleCallTool, adapter)

    // 6. 构造 AiAgentRegistration
    const registration = new AiAgentRegistration({
      moduleId: options.moduleId ?? metadata.rootApi.kind,
      name: metadata.rootApi.name,
      description: metadata.rootApi.description,
      runtime,
      inputContract: options.inputContract,
      sessionStore: options.sessionStore ?? new DefaultAiAgentSessionStore(),
      systemPrompt: options.systemPrompt?.bind(null, instance),
      beforeFunctionCall: options.beforeFunctionCall?.bind(null, instance),
      afterFunctionCall: options.afterFunctionCall?.bind(null, instance),
      onStartSession: options.onStartSession?.bind(null, instance),
      onEndBusinessInstance: (ctx, directive) => {
        // 只清空当前 business instance 的 handles，不影响其他 instance
        adapter.handleRegistry.clearForInstance(ctx.moduleInstanceId)
        options.onEndBusinessInstance?.call(null, instance, ctx, directive)
      },
      releaseModuleInstance: (moduleInstanceId) => {
        adapter.handleRegistry.clearForInstance(moduleInstanceId)
        options.releaseModuleInstance?.(instance, moduleInstanceId)
      },
    })

    // 7. 注册到 host
    return host.register(alias, registration)
  }

  /**
   * 构建 root AiModule。
   *
   * v1 最小构造：
   *   - 只声明 functions + runner（按 methodName 路由）
   *   - 不设 children（嵌套 API 走 handle 协议）
   *   - 不设 attributes（v1 暂不支持，需同步提供 attributeAccessor 才不会构造失败）
   *   - 提供最小 find 委托（root module 构造要求 find 必填）
   *   - runner 为 async，支持 Promise<AiModuleResult<T>> 返回
   */
  private buildRootAiModule(
    api: AiApiObjectMetadata,
    instance: any,
  ): AiModule {
    const registry = this.handleRegistry

    return new AiModule({
      kind: api.kind,
      name: api.name,
      description: api.description,
      functions: api.actions.map(action => ({
        name: action.name,
        description: action.description,
        paramsSchema: action.paramsSchema,
        ...(action.resultSchema !== undefined ? { resultSchema: action.resultSchema } : {}),
        usageRules: action.usageRules ? [...action.usageRules] : undefined,
        failureModes: action.failureModes ? action.failureModes.map(m => ({ ...m })) : undefined,
      })),
      // 不设 children — 嵌套 API 通过 handle 协议路由
      // 不设 attributes — v1 暂不支持

      // 最小 find 委托：root module 没有子实例，返回空列表
      find: (_ctx, _childKind, _query) =>
        AiModuleResult.ok([]),

      // async runner：按 methodName 路由 + resultApis handle 创建
      runner: async (ctx, functionName, args) => {
        const action = api.actions.find(a => a.name === functionName)
        const methodName = action?.methodName ?? functionName
        const method = instance[methodName]
        if (typeof method !== 'function') {
          return AiModuleResult.failCode(
            'FUNCTION_NOT_IMPLEMENTED',
            `${api.kind} 未注册函数 "${functionName}"`,
            `检查 class 是否实现了方法 "${methodName}"`,
          )
        }

        // 调用实例方法，await 支持 async 方法
        const result = await method.call(instance, ctx, args)

        // 执行失败时不创建 handle
        if (!result.ok) return result

        // 检测返回值是否含 API-bearing 对象（resultApis 非空时）
        const resultApis = action?.resultApis
        if (resultApis !== undefined && resultApis.length > 0) {
          const businessInstanceId = readRequiredBusinessInstanceId(ctx)
          if (businessInstanceId === undefined) {
            return AiModuleResult.failCode(
              'HANDLE_SCOPE_NOT_FOUND',
              '无法创建 API 对象 handle：当前调用缺少 business instance 标识',
              'handle 必须绑定到业务实例。请确认 Host 层执行工具时向 AiModulePathContext 注入 ctx.host.moduleInstanceId。',
            )
          }
          const handles: Array<{ handleId: string; apiKind: string }> = []

          for (const ref of resultApis) {
            // 按 resultPath 从 result.data 提取 API-bearing 实例
            const nestedInstance = extractByPath(result.data, ref.resultPath)
            if (nestedInstance === undefined) continue

            const handleId = registry.register(businessInstanceId, {
              apiKind: ref.api.kind,
              instance: nestedInstance,
              actions: ref.api.actions,
            })
            handles.push({ handleId, apiKind: ref.api.kind })
          }

          if (handles.length > 0) {
            // 返回明确 envelope，不展开 class 实例到 JSON
            return AiModuleResult.ok({
              value: coerceToJsonValue(result.data) ?? null,
              _handles: handles,
            })
          }
        }

        return result
      },
    })
  }

  /**
   * 生成 module_handle_call 的 tool spec。
   * spec 描述 handleId / actionName / args 三个参数，
   * 在 LLM tool 列表中注册为统一入口。
   *
   * 实现时不要把它伪装成普通 AiModule function；
   * runtime 需要单独保存该 handle tool spec，并在 executeTool 时优先路由。
   */
  private createHandleCallToolSpec(rootApi: AiApiObjectMetadata): AiModuleToolSpec {
    // 收集所有可能的 handle apiKind + action，写入 tool description
    const allHandleActions: string[] = []
    for (const action of rootApi.actions) {
      for (const ref of action.resultApis ?? []) {
        for (const hAction of ref.api.actions) {
          allHandleActions.push(`${ref.api.kind}.${hAction.name}`)
        }
      }
    }
    return {
      type: 'function',
      function: {
        name: 'module_handle_call',
        description: `调用 API 对象 handle 上的 action。可用: ${allHandleActions.join(', ')}`,
        parameters: {
          type: 'object',
          properties: {
            handleId: { type: 'string', description: 'handle ID' },
            actionName: { type: 'string', description: '要调用的 action 名称' },
            args: { type: 'object', description: 'action 参数' },
          },
          required: ['handleId', 'actionName'],
        },
      },
    }
  }

  /**
   * 通过 handleId + actionName + args 调用 handle 上的 API。
   *
   * 这是 module_handle_call tool 的执行入口。
   * 支持：
   *   - paramsSchema 校验
   *   - async 方法
   *   - 递归 resultApis（handle action 返回新的 API-bearing 对象）
   */
  public async dispatchHandle(
    businessInstanceId: string,
    handleId: string,
    actionName: string,
    args: AiJsonParams,
    ctx?: AiModulePathContext,
  ): Promise<AiModuleResult<AiJsonValue>> {
    const handle = this.handleRegistry.get(businessInstanceId, handleId)
    if (handle === undefined) {
      return AiModuleResult.failCode(
        'HANDLE_NOT_FOUND',
        `handle "${handleId}" 不存在或已过期`,
        '请重新调用创建该 handle 的 action，获取新的 handle',
      )
    }
    const action = handle.actions.find(a => a.name === actionName)
    if (action === undefined) {
      return AiModuleResult.failCode(
        'HANDLE_ACTION_NOT_FOUND',
        `handle "${handleId}" (${handle.apiKind}) 没有 action "${actionName}"`,
        `可用 actions: ${handle.actions.map(a => a.name).join(', ')}`,
      )
    }

    // paramsSchema 校验：复用 spark-ai 现有 schema validator
    const validation = AiJsonSchemaValidator.validateDeserializedParams(args, action.paramsSchema)
    if (!validation.ok) {
      return AiModuleResult.failCode(
        'INVALID_PARAMS',
        `action "${actionName}" 参数校验失败: ${AiJsonSchemaValidator.formatAiJsonValidationIssues(validation.issues)}`,
        `期望 schema: ${JSON.stringify(action.paramsSchema)}`,
      )
    }

    const method = (handle.instance as Record<string, Function>)[action.methodName]
    if (typeof method !== 'function') {
      return AiModuleResult.failCode(
        'FUNCTION_NOT_IMPLEMENTED',
        `${handle.apiKind} 未实现方法 "${action.methodName}"`,
      )
    }

    // 传入合理 ctx：必须保留 host 信息，确保后续 handle 仍能按 business instance 分区
    const handleCtx = ctx ?? {
      segments: [],
      host: {
        moduleId: handle.apiKind,
        moduleInstanceId: businessInstanceId,
        instanceId: businessInstanceId,
      },
    }
    const result = await method.call(handle.instance, handleCtx, args)

    if (!result.ok) return result

    // 递归：handle action 返回的 API-bearing 对象也创建新 handle
    const resultApis = action.resultApis
    if (resultApis !== undefined && resultApis.length > 0) {
      const handles: Array<{ handleId: string; apiKind: string }> = []

      for (const ref of resultApis) {
        const nestedInstance = extractByPath(result.data, ref.resultPath)
        if (nestedInstance === undefined) continue

        const newHandleId = this.handleRegistry.register(businessInstanceId, {
          apiKind: ref.api.kind,
          instance: nestedInstance,
          actions: ref.api.actions,
        })
        handles.push({ handleId: newHandleId, apiKind: ref.api.kind })
      }

      if (handles.length > 0) {
        return AiModuleResult.ok({
          value: coerceToJsonValue(result.data) ?? null,
          _handles: handles,
        })
      }
    }

    return result
  }
}

// ── 辅助函数 ──

/** 按 resultPath 从 data 中提取嵌套值。[] 返回 data 本身 */
function extractByPath(data: unknown, path: readonly string[]): unknown {
  if (path.length === 0) return data
  let current: unknown = data
  for (const key of path) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/** 将值强制转为 JSON 安全值（class 实例 → plain object，忽略不可序列化属性） */
function coerceToJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object') return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

/**
 * 从协议上下文读取 business instance ID。
 * handle 不允许落入空字符串 scope；缺少 host 注入时必须 fail-fast。
 */
function readRequiredBusinessInstanceId(ctx: AiModulePathContext): string | undefined {
  const value = ctx.host?.moduleInstanceId
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}
```

### AiModuleAdapterRegisterOptions 类型

```typescript
/** AiModuleAdapter.register() 的运行时选项 */
export type AiModuleAdapterRegisterOptions<T> = Readonly<{
  /** 业务注册 moduleId。默认取 metadata.rootApi.kind。
   *  显式提供用于 moduleId 与 rootApi.kind 不同的场景
   *  （如 moduleId='manualLeave' vs rootApi.kind='manual-leave'）。 */
  moduleId?: string

  /** 已构造的业务实例（优先使用，避免 adapter 内部 new 后外部又引用） */
  instance?: T

  /** class 构造参数（无 instance 时使用） */
  constructArgs?: readonly unknown[]

  /** 输入契约 */
  inputContract?: AiAgentInputContract

  /** 会话存储 */
  sessionStore?: AiAgentSessionStore

  // ── 生命周期钩子 ──
  // 每个钩子的第一个参数接收业务实例，确保外部能访问已构造实例

  systemPrompt?: (instance: T, context: AiAgentRuntimeContext) => string | undefined
  beforeFunctionCall?: (instance: T, options: AiAgentBeforeFunctionCallOptions) => AiAgentBeforeFunctionCallDirective | Promise<AiAgentBeforeFunctionCallDirective>
  afterFunctionCall?: (instance: T, options: AiAgentAfterFunctionCallOptions) => AiAgentLifecycleDirective | Promise<AiAgentLifecycleDirective>
  onStartSession?: (instance: T, context: AiAgentRuntimeContext) => void | Promise<void>
  onEndBusinessInstance?: (instance: T, context: AiAgentRuntimeContext, directive: AiAgentLifecycleDirective) => void | Promise<void>
  releaseModuleInstance?: (instance: T, moduleInstanceId: string) => void
}>
```

**关键设计**：
- 生命周期钩子签名统一为 `(instance: T, ...) => ...`，确保外部能访问 adapter 创建的业务实例
- `moduleId` 优先取显式选项，`rootApi.kind` 仅作 fallback——两者语义不同：`rootApi.kind` 是 API object kind，`moduleId` 是业务注册标识

---

## 第五步：校验函数

### 文件：`packages/spark-ai/src/modules/metadata/validate-api-object-metadata.ts`

```typescript
export type ApiObjectValidationFinding = Readonly<{
  level: 'error' | 'warn'
  rule: string
  message: string
  fix?: string
}>

export class AiApiObjectMetadataValidationError extends Error {
  public constructor(
    public readonly kind: string,
    public readonly findings: readonly ApiObjectValidationFinding[],
  ) {
    super(`API object metadata validation failed for "${kind}": ${findings.map(f => f.message).join('; ')}`)
  }
}

export function validateApiObjectMetadata(api: AiApiObjectMetadata): void {
  const findings: ApiObjectValidationFinding[] = []

  // R1: kind 非空 + 全小写
  if (!api.kind || api.kind.trim().length === 0) {
    findings.push({ level: 'error', rule: 'kind-required', message: 'kind 不能为空' })
  } else if (api.kind !== api.kind.toLowerCase()) {
    findings.push({ level: 'error', rule: 'kind-lowercase', message: `kind "${api.kind}" 必须全小写` })
  }

  // R2: name 非空
  if (!api.name || api.name.trim().length === 0) {
    findings.push({ level: 'error', rule: 'name-required', message: 'name 不能为空' })
  }

  // R3: description 非空
  if (!api.description || api.description.trim().length === 0) {
    findings.push({ level: 'error', rule: 'description-required', message: 'description 不能为空' })
  }

  // R4: actions 非空
  if (!api.actions || api.actions.length === 0) {
    findings.push({ level: 'error', rule: 'actions-required', message: '至少需要一个 @moduleAction' })
  }

  // R5: action name 去重
  const actionNames = new Set<string>()
  for (const action of api.actions ?? []) {
    if (actionNames.has(action.name)) {
      findings.push({ level: 'error', rule: 'action-name-duplicate', message: `重复的 actionName: "${action.name}"` })
    }
    actionNames.add(action.name)
  }

  // R6: paramsSchema 合法性
  for (const action of api.actions ?? []) {
    if (action.paramsSchema === undefined || action.paramsSchema.type !== 'object') {
      findings.push({ level: 'error', rule: 'params-schema-invalid', message: `action "${action.name}" 的 paramsSchema 必须是 type:'object'` })
    }
  }

  // R7: methodName 非空
  for (const action of api.actions ?? []) {
    if (!action.methodName || action.methodName.trim().length === 0) {
      findings.push({ level: 'error', rule: 'method-name-required', message: `action "${action.name}" 缺少 methodName` })
    }
  }

  // R8: resultApis 递归校验（AiApiResultApiRef 结构：{ resultPath, api }）
  for (const action of api.actions ?? []) {
    for (const ref of action.resultApis ?? []) {
      // 校验 resultPath 是数组；空数组 [] 是合法值，表示 result.data 本身
      if (!ref.resultPath || !Array.isArray(ref.resultPath)) {
        findings.push({ level: 'error', rule: 'result-path-required', message: `action "${action.name}" 的 resultApi 缺少 resultPath` })
      }
      // 递归校验嵌套 api 元数据
      validateApiObjectMetadata(ref.api)
    }
  }

  const errors = findings.filter(f => f.level === 'error')
  if (errors.length > 0) {
    throw new AiApiObjectMetadataValidationError(api.kind, findings)
  }
}
```

---

## 第五步附：Handle 协议

### Handle 的形态

```typescript
type AiApiObjectHandle = Readonly<{
  handleId: string           // 在 business instance scope 内唯一（如 "hnd_01"）
  apiKind: string            // 对应 resultApis 中的 kind
  instance: object           // 实际的对象引用（adapter 内部使用）
  actions: readonly AiApiActionMetadata[]  // 该 handle 可调用的 action 列表
  businessInstanceId: string // 所属 business instance ID（用于 per-instance 隔离）
}>
```

### Handle 创建时机

当 root action 或 handle action 的 metadata 中 `resultApis` 非空且执行成功时，adapter 的 runner 自动：
1. 按 `resultPath` 从 `result.data` 中提取 API-bearing 实例
2. 分配 scope 内唯一的 `handleId`
3. 将 API-bearing 对象注册到 `handleRegistry`（按 `businessInstanceId` 分区）
4. 在返回结果的 `data` 中附加 `{ _handles: [{ handleId, apiKind }] }` 字段

**`resultPath` 语义**：
- `[]`（空数组）— 返回值本身即为 API-bearing 对象（如 `listPersons` 返回 `PersonDirectory`）
- `["directory"]` — `result.data.directory` 是 API-bearing 对象
- `["items", "0"]` — `result.data.items[0]` 是 API-bearing 对象

**不创建 handle 的情况**：
- action 的 `resultApis` 为空或不存在 → 普通 DTO 返回，原样透传
- action 执行失败（`result.ok === false`）→ 不创建 handle
- `resultPath` 提取结果为 `undefined` → 跳过该 resultApi

### Handle 调用协议

LLM 发现返回数据中含 `_handles` 字段后，通过 `module_handle_call` tool 调用 handle 上的 API：

```
tool: module_handle_call
args: { handleId: "hnd_01", actionName: "searchPersons", args: { keyword: "Ada" } }
```

**`module_handle_call` 的注册流程**：
1. adapter 在 `register()` 中通过 `runtime.registerHandleCallTool()` 将 `module_handle_call` 注册为运行时 tool
2. 该 tool 的 spec 由 `createHandleCallToolSpec()` 根据 metadata 中的 `resultApis` 动态生成
3. 当 LLM 调用 `module_handle_call` 时，`ProtocolToolRouter` 将请求路由到 adapter 实例的 `dispatchHandle()` 方法
4. adapter 从 `handleRegistry` 按 `businessInstanceId + handleId` 查找 handle，执行 action

**需要新增的 runtime 接口**：

```typescript
type AiModuleHandleToolDispatcher = Readonly<{
  dispatchHandle(
    businessInstanceId: string,
    handleId: string,
    actionName: string,
    args: AiJsonParams,
    ctx: AiModulePathContext,
  ): Promise<AiModuleResult<AiJsonValue>>
}>

class AiModuleRuntime {
  registerHandleCallTool(
    tool: AiModuleToolSpec,
    dispatcher: AiModuleHandleToolDispatcher,
  ): void
}
```

实现要求：
- `AiModuleRuntime.getTools()` 必须把 `module_handle_call` 追加到协议工具列表。
- `AiModuleRuntime.executeTool()` / `ProtocolToolRouter` 必须优先识别 `module_handle_call`，解析 `{ handleId, actionName, args }` 后调用 dispatcher。
- `businessInstanceId` 从当前 `AiModulePathContext.host.moduleInstanceId` 读取；缺失时返回 `HANDLE_SCOPE_NOT_FOUND`，不得使用空字符串兜底。

### Handle 生命周期

| 阶段 | 行为 |
|------|------|
| **创建** | action 返回 API-bearing 对象时，adapter 按 `resultPath` 提取实例，分配 handleId 并注册到 handleRegistry |
| **存活** | 当前 AiAgentBusiness instance 内有效，可跨同一 business instance 的多个 turn 使用 |
| **销毁** | business instance 结束或释放时（`endInstance` / `releaseModuleInstance`）清空当前 `businessInstanceId` 对应的 handles，不影响其他 instance |
| **过期处理** | handle 已销毁时调用 `dispatchHandle` 返回 `HANDLE_NOT_FOUND`，LLM 应重新执行创建该 handle 的 action |

`stopSession` 是否清理 handle 取决于后续会话语义：v1 默认 **不因单次 stopSession 清理**，避免用户暂停/恢复同一业务实例时丢失 handle。只有业务实例结束或释放才清理。

### Handle 在 LLM 上下文中的呈现

当 action 返回 `_handles` 后，LLM 的后续上下文中注入 handle 发现信息：

```
可用 handle：
  hnd_01 (person-directory) — 人员目录
    actions: searchPersons, getPerson
```

LLM 据此选择 `module_handle_call({ handleId: "hnd_01", actionName: "searchPersons", ... })`。

### 返回值 envelope 规范

当 action 返回的 result.data 包含 API-bearing 对象时，adapter 使用明确 envelope，**不展开 class 实例到 JSON**：

```typescript
// ✅ 正确：envelope 格式，class 实例通过 coerceToJsonValue 安全序列化
{ value: coerceToJsonValue(result.data) ?? null, _handles: [{ handleId: "hnd_01", apiKind: "person-directory" }] }

// ❌ 错误：展开 class 实例（可能为空对象或包含非 JSON 内容）
{ ...result.data, _handle: { handleId: "hnd_01", apiKind: "person-directory" } }
```

`value` 是 best-effort JSON projection：API-bearing class 实例通常可能被投影为空对象或 `null`，这不是错误。LLM 判断后续可操作能力时应以 `_handles` 为准，而不是依赖 `value` 中的 class 内部状态。

---

## 第六步：端到端示例——leave-request 迁移

### 迁移后的业务 class

人员目录不再是 `leave-person` child kind，而是 `listPersons` action 返回的 `PersonDirectory` 对象。`PersonDirectory` 自身带有 `@moduleAction` 方法，VCM 自动发现其为 API-bearing 返回对象，生成 `resultApis`。adapter 运行时创建 handle，LLM 可继续调用 `searchPersons`/`getPerson`。

```typescript
/**
 * 人工请假业务服务
 *
 * @moduleKind manual-leave
 * @moduleName 人工请假
 * @moduleDescription 帮助员工收集、确认并提交人工请假申请
 */
export class LeaveRequestService {
  private readonly drafts = new Map<string, LeaveDraft>()
  private readonly persons: PersonDirectory

  constructor(persons?: LeaveRequestPersonRecord[]) {
    this.persons = new PersonDirectory(persons ?? DEFAULT_PERSONS)
  }

  /**
   * 描述当前请假草稿
   * @moduleAction describeDraft
   */
  describeDraft(
    ctx: AiModulePathContext,
    args: Readonly<{}>,
  ): AiModuleResult<AiJsonValue> { ... }

  /**
   * 设置草稿字段
   * @moduleAction setDraftFields
   */
  setDraftFields(
    ctx: AiModulePathContext,
    args: Readonly<{ fields: Record<string, unknown> }>,
  ): AiModuleResult<AiJsonValue> { ... }

  /**
   * 提交请假草稿
   * @moduleAction submitDraft
   * @usageRule 必须先确认草稿内容
   * @failureMode DRAFT_NOT_FOUND 草稿不存在 => 先调用 setDraftFields 创建草稿
   */
  submitDraft(
    ctx: AiModulePathContext,
    args: Readonly<{}>,
  ): AiModuleResult<AiJsonValue> { ... }

  /**
   * 取消草稿
   * @moduleAction cancelDraft
   */
  cancelDraft(
    ctx: AiModulePathContext,
    args: Readonly<{ reason?: string }>,
  ): AiModuleResult<AiJsonValue> { ... }

  /**
   * 获取人员目录
   * @moduleAction listPersons
   */
  listPersons(
    ctx: AiModulePathContext,
    args: Readonly<{}>,
  ): AiModuleResult<PersonDirectory> {
    return AiModuleResult.ok(this.persons)
  }

  /** 释放草稿（非 AI 可调用，无 @moduleAction） */
  releaseDraft(draftId: string): void { ... }
}

/**
 * 人员目录（API-bearing 返回对象）
 *
 * @moduleKind person-directory
 * @moduleName 人员目录
 * @moduleDescription 请假人员和审批人查询
 */
export class PersonDirectory {
  constructor(private readonly persons: readonly LeaveRequestPersonRecord[]) {}

  /**
   * 按条件搜索人员
   * @moduleAction searchPersons
   */
  searchPersons(
    ctx: AiModulePathContext,
    args: Readonly<{ keyword?: string; role?: string }>,
  ): AiModuleResult<AiJsonValue> { ... }

  /**
   * 按编码获取人员详情
   * @moduleAction getPerson
   */
  getPerson(
    ctx: AiModulePathContext,
    args: Readonly<{ code: string }>,
  ): AiModuleResult<AiJsonValue> { ... }
}
```

### 注册代码

```typescript
import leaveRequestMeta from './leave-request.module-metadata.json'

// 构造业务实例（外部控制，adapter 不内部 new）
const service = new LeaveRequestService(persons)

AiModuleAdapter.register(host, 'manualLeave', LeaveRequestService, leaveRequestMeta, {
  moduleId: 'manualLeave',  // 显式提供，因为 rootApi.kind ('manual-leave') 与业务注册 ID 不同
  instance: service,
  inputContract: createSimpleInputContract({ ... }),
  sessionStore: new DefaultAiAgentSessionStore(),

  // 生命周期钩子：第一个参数是业务实例
  systemPrompt: (inst, _ctx) => createLeaveRequestSystemPrompt(new Date()),
  afterFunctionCall: (inst, call) => {
    const actionName = call.toolName
    if (actionName === 'submitDraft' && call.result.ok) {
      return { status: 'complete', reason: 'submitted', finalAssistantMessage: '...', releaseInstance: true }
    }
    if (actionName === 'cancelDraft' && call.result.ok) {
      return { status: 'abort', reason: 'cancelled', finalAssistantMessage: '...', releaseInstance: true }
    }
    return { status: 'continue' }
  },
  releaseModuleInstance: (inst, id) => inst.releaseDraft(id),
})
```

**迁移前后对比**：
- ❌ 旧：`children: ["leave-person"]` + 手写子模块 class + `listChildren` + `findInstance` + 独立的 `LeaveRequestPersonAiModule`
- ✅ 新：`listPersons` 返回 `PersonDirectory` → VCM 自动发现其 `@moduleAction` → `resultApis` → adapter 创建 handle → LLM 直接调用 `searchPersons`/`getPerson`

---

## 完整文件变更清单

### 新增文件

| 文件 | 职责 |
|------|------|
| `packages/spark-ai/src/modules/metadata/ai-api-object-metadata-schema.ts` | `AiApiObjectMetadata` + `AiApiActionMetadata` + `AiModuleMetadataJson` 类型 |
| `packages/spark-ai/src/modules/metadata/validate-api-object-metadata.ts` | `validateApiObjectMetadata()` + 8 条校验规则 |
| `packages/spark-ai/src/modules/metadata/index.ts` | barrel |
| `packages/spark-ai/src/agent/business/ai-module-adapter.ts` | `AiModuleAdapter` 注册中间类 + `AiApiObjectHandle` 类型 + handle dispatch |
| `packages/vite-plugin-spark-catalog/src/ts-type-to-json-schema.ts` | 从 VCM 提取的共享 TS→JSON Schema 转换工具 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `packages/vite-plugin-spark-catalog/src/module-metadata-generator.ts` | `@moduleAction` 严格单 token；新增 paramsSchema/resultSchema/resultApis 生成；输出 `AiModuleMetadataJson` |
| `packages/spark-ai/src/modules/runtime/ai-module-runtime.ts` | 新增 `registerHandleCallTool()`；`getTools()` 暴露 `module_handle_call`；`executeTool()` 路由 handle tool |
| `packages/spark-ai/src/modules/runtime/protocol-tool-router.ts` | 优先识别 `module_handle_call`，按当前 business instance 调用 adapter dispatcher |
| `packages/spark-ai/src/modules/runtime/protocol-tool-args.ts` | 新增 `module_handle_call` 请求参数解析：`handleId/actionName/args` |
| `packages/spark-ai/src/modules/index.ts` | 导出 metadata 子目录 |
| `packages/spark-ai/src/agent/index.ts` | 导出 `AiModuleAdapter` |

### 迁移文件

| 文件 | 变更 |
|------|------|
| `packages/spark-project-model/src/standalone/leave-request/leave-request.ts` | 改为普通 class + JSDoc；`LeaveRequestPersonAiModule` → `PersonDirectory`（API-bearing 返回对象）；用 `AiModuleAdapter.register()` 替代旧注册 |

---

## 向后兼容

1. **旧 `AiModule` + `AiModuleRuntime` 不删除**——供旧业务继续使用
2. **旧 `host.register(alias, registration)` 不变**
3. **旧 `children/parentKind/list/find` 机制保留在 AiModule 层**——供旧业务继续使用；新 adapter 不依赖该机制
4. **旧 `createAiBusinessKit` 已移除**；业务统一使用 `AiModuleAdapter`。

---

## 实施顺序

| 阶段 | 内容 | 风险 |
|------|------|------|
| **1** | 新增 `ai-api-object-metadata-schema.ts` + `validate-api-object-metadata.ts` | 低 |
| **2** | 提取 `ts-type-to-json-schema.ts` | 低 |
| **3** | 扩展 `module-metadata-generator.ts`：严格 `@moduleAction` + paramsSchema + resultSchema + resultApis | 中：VCM 嵌套 API 发现逻辑较复杂 |
| **4** | 新增 `AiModuleAdapter`（含 handle registry + root AiModule 兼容层 + handle dispatch） | 中 |
| **5** | 迁移 leave-request | 中 |
| **6** | 更新 barrel + 标记 deprecated | 低 |

---

## 验证方案

### 1. 元数据生成验证

- class 只带 `@moduleKind/@moduleName/@moduleDescription` 时生成 root API metadata
- `@moduleAction` 只解析第一个 token；带多余文本时 warn
- 参数类型自动生成 `paramsSchema`
- 返回类型自动生成 `resultSchema`
- 返回类型中含 `@moduleAction` class → 自动发现 `resultApis`
- 输出不包含 `children/parentKind` 字段

### 2. 嵌套 resultApi 发现验证

- 返回类型直接是 API-bearing class → 生成 `resultApis` 条目
- 返回类型的属性是 API-bearing class → 递归发现
- 互指/循环引用 → `visited` 防循环，不重复生成
- 非 API-bearing class（无 `@moduleKind`）→ 不生成 `resultApis`

### 3. handle 创建与后续调用验证

- root action 通过 metadata 调用到实例方法
- action 返回普通 DTO → 只返回 JSON 结果，不创建 handle
- action 返回含嵌套 API 的对象 → adapter 创建 handle → LLM 可继续调用该对象 API
- handle 上的 action 通过 `methodName` 正确路由到返回对象实例的方法
- 未实现 action / `methodName` 映射错误 / handle 失效时 fail-fast 且错误可定位
- 生命周期钩子收到业务实例引用

### 4. leave-request 迁移验证

- 不使用 `AiModuleInstanceRef/listChildren/findInstance`，不手写子模块 class
- 提交/取消草稿流程跑通
- 人员目录通过 `listPersons` → `PersonDirectory` handle → `searchPersons`/`getPerson` 跑通

### 5. 工程验证

每个阶段完成后执行：

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run verify:rules
```

---

## 文档自检清单

- [x] 全文搜索确认 `children`/`parentKind`/`listChildren`/`findInstance` 不得出现在新 metadata schema、adapter 新流程、leave-request 新示例中（旧模型对比、兼容说明、迁移前对比中提及旧机制除外）
- [x] `resultApis` 能表达返回对象 API 图
- [x] adapter 章节不要求业务方手写子模块注册
- [x] leave-request 新示例不出现 `AiModuleInstanceRef` 和 `children: ["leave-person"]`（迁移前对比中出现是允许的）
- [x] JSDoc 规范明确 `@moduleAction` 只放 functionName，描述来自 summary
