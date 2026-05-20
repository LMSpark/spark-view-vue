/**
 * 业务注册协议。
 *
 * 模块注册契约与便捷基类。
 * 业务模块实现应继承 AiModuleRegistrationBase，不 `implements I*` 接口。
 *
 * 注册树结构：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ AiModuleRegistration（模块注册树节点）                         │
 * │   ├─ moduleId: 唯一标识                                       │
 * │   ├─ name/description: 展示给 LLM                             │
 * │   ├─ prompt: 模块提示文本（静态字符串或动态提供者）             │
 * │   ├─ modules: 子模块列表（递归结构）                           │
 * │   ├─ instanceParam: 实例参数声明（可选）                        │
 * │   └─ functionRegistrations: 函数注册列表                       │
 * │        ├─ functionId: 函数标识                                │
 * │        ├─ description: 函数描述                               │
 * │        ├─ paramsSchema: 参数 JSON Schema                      │
 * │        ├─ resultSchema: 返回值 Schema（可选）                  │
 * │        ├─ usageRules: 使用规则（展示给 LLM）                   │
 * │        ├─ failureModes: 失败模式（展示给 LLM）                 │
 * │        ├─ scope: 'collection' | 'instance'                    │
 * │        └─ example: 示例参数（可选）                            │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 注册流程：
 * 1. 业务模块继承 AiModuleRegistrationBase 定义注册信息
 * 2. AiRuntime.registerModule() 存储注册树
 * 3. 验证唯一性（moduleId/modulePath/function address 不重复）
 * 4. 返回 AiRegisteredModule 句柄供调用方使用
 */

import type { LlmJsonObject, LlmParameterSchemaRoot } from './parameter-schema'

// ═══════════════════════════════════════════════════════
// 1. 函数注册
// ═══════════════════════════════════════════════════════

/**
 * 函数失败模式：描述函数可能失败的场景和修复建议。
 * 这些信息会展示给 LLM，帮助它预判和恢复错误。
 */
export interface FunctionFailureMode {
  /** 错误码，如 'INVALID_ARGS'、'TIMEOUT' 等 */
  readonly code: string
  /** 触发条件描述 */
  readonly when: string
  /** 修复建议 */
  readonly fix: string
}

/**
 * 函数注册信息。
 * 定义一个可被 LLM 调用的函数能力。
 */
export interface AiFunctionRegistration {
  /** 函数标识符（在模块内唯一） */
  readonly functionId: string
  /** 函数描述，会展示给 LLM */
  readonly description: string
  /** 参数的 JSON Schema */
  readonly paramsSchema: LlmParameterSchemaRoot
  /** 返回值的 JSON Schema（可选） */
  readonly resultSchema?: LlmJsonObject | undefined
  /** 最大执行时间（毫秒，可选） */
  readonly maxExecutionMs?: number | undefined
  /** 使用规则列表，会展示给 LLM */
  readonly usageRules?: readonly string[] | undefined
  /** 失败模式列表，会展示给 LLM */
  readonly failureModes?: readonly FunctionFailureMode[] | undefined
  /** 作用域类型：'collection'（集合级）或 'instance'（实例级） */
  readonly scope?: 'collection' | 'instance'
  /** 示例参数对象，帮助 LLM 理解参数结构 */
  readonly example?: LlmJsonObject | undefined
}

// ═══════════════════════════════════════════════════════
// 2. 模块元数据与实例参数
// ═══════════════════════════════════════════════════════

/**
 * 模块实例参数声明。
 * 描述模块启动时需要注入的实例参数，
 * 用于函数调用时注入上下文参数（context params）。
 */
export interface AiModuleInstanceParam {
  /** 参数名 */
  readonly name: string
  /** 参数描述 */
  readonly description: string
}

/**
 * 模块注册元数据。
 * 不包含函数注册表，便于运行时树节点和构造参数复用同一组语义字段。
 */
export interface AiModuleRegistrationMetadata {
  /** 模块唯一标识符 */
  readonly moduleId: string
  /** 模块名称，展示给 LLM */
  readonly name: string
  /** 模块描述，展示给 LLM */
  readonly description: string
  /** 模块提示文本提供者（可选） */
  readonly prompt?: ModulePromptProvider | undefined
  /** 子模块列表（递归结构） */
  readonly modules?: readonly AiModuleRegistration[] | undefined
  /** 实例参数声明（可选） */
  readonly instanceParam?: AiModuleInstanceParam | undefined
}

// ═══════════════════════════════════════════════════════
// 3. 模块注册契约
// ═══════════════════════════════════════════════════════

/**
 * 模块注册树节点。
 * 模块注册的核心接口，定义了模块的元数据和子模块结构。
 *
 * 实现方式：业务模块应继承 AiModuleRegistrationBase 抽象类，
 * 而不是直接 implements 此接口。
 */
export interface AiModuleRegistration extends AiModuleRegistrationMetadata {
  /** 函数注册列表 */
  readonly functionRegistrations: readonly AiFunctionRegistration[]
}

/**
 * 模块注册基类构造参数。
 * functionRegistrations 可省略，表示该节点只组织子模块或 prompt。
 */
export interface AiModuleRegistrationBaseOptions extends AiModuleRegistrationMetadata {
  /** 函数注册列表（可选，默认空列表） */
  readonly functionRegistrations?: readonly AiFunctionRegistration[] | undefined
}

// ═══════════════════════════════════════════════════════
// 4. Prompt 提供
// ═══════════════════════════════════════════════════════

/**
 * 模块 prompt 上下文。
 * 传递给动态 prompt 提供者的上下文信息。
 */
export interface ModulePromptContext {
  /** 模块标识符 */
  readonly moduleId: string
  /** 模块实例标识符 */
  readonly moduleInstanceId: string
  /** 会话实例 ID */
  readonly instanceId: string
  /** AI 运行时实例 ID */
  readonly runtimeInstanceId: string
  /** 模块路径（以 / 分隔的 moduleId 序列，如 "root/child"） */
  readonly modulePath: string
  /** 模块 ID 层级数组 */
  readonly moduleIds: readonly string[]
}

/**
 * 模块 prompt 提供者。
 *
 * 支持两种形式：
 * 1. 静态字符串：直接作为 prompt 文本
 * 2. 动态函数：接收 ModulePromptContext，返回 prompt 文本或 null
 *
 * 技术说明：
 * 使用 TypeScript 的 bivarianceHack 技巧来定义一个支持协变和逆变的函数类型。
 * 这种模式允许 ModulePromptProvider 既可以直接是 string，
 * 也可以是一个接受 context 参数返回 string|null 的函数。
 * 它利用了 TypeScript 中对象字面量的 bivariance 特性来实现联合类型的函数签名。
 */
export type ModulePromptProvider = string | {
  bivarianceHack(context: ModulePromptContext): string | null | Promise<string | null>
}['bivarianceHack']

// ═══════════════════════════════════════════════════════
// 5. 便捷基类
// ═══════════════════════════════════════════════════════

/**
 * 模块注册便捷基类。
 *
 * 业务模块实现应继承此类，通过构造函数传入注册 options。
 *
 * 使用示例：
 * ```ts
 * export class MyModule extends AiModuleRegistrationBase {
 *   constructor() {
 *     super({
 *       moduleId: 'my-module',
 *       name: 'My Module',
 *       description: 'Description of my module',
 *       functionRegistrations: [{
 *         functionId: 'doSomething',
 *         description: 'Does something useful',
 *         paramsSchema: { type: 'object', properties: {} },
 *       }],
 *     })
 *   }
 * }
 * ```
 */
export abstract class AiModuleRegistrationBase implements AiModuleRegistration {
  public readonly moduleId: string

  public readonly name: string

  public readonly description: string

  public readonly prompt?: ModulePromptProvider | undefined

  public readonly modules: readonly AiModuleRegistration[]

  public readonly instanceParam?: AiModuleInstanceParam | undefined

  public readonly functionRegistrations: readonly AiFunctionRegistration[]

  protected constructor(options: AiModuleRegistrationBaseOptions) {
    this.moduleId = options.moduleId
    this.name = options.name
    this.description = options.description
    this.prompt = options.prompt
    this.modules = options.modules ?? []
    this.instanceParam = options.instanceParam
    this.functionRegistrations = options.functionRegistrations ?? []
  }
}
