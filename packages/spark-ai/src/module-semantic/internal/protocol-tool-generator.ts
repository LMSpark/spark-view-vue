/**
 * @packageDocumentation
 *
 * 协议工具规约生成器。
 *
 * 从所有已注册的 ModuleKind 派生 LLM 可见的协议级工具集。
 * 协议层固定派生 6 个通用工具,实际可用 kind / attribute / action 写入
 * 每个工具的 description,LLM 通过 describeKind / listChildren 二次探索:
 *
 * - getAttribute(path, attrName)
 * - setAttribute(path, attrName, value)
 * - invokeAction(path, actionName, args)
 * - listChildren(path, childKind?)
 * - findInstance(path, childKind, query)
 * - describeKind(kind)
 *
 * 工具规约形状对齐 OpenAI tool spec:
 * ```
 * { type: 'function', function: { name, description, parameters } }
 * ```
 * 调用路由由 ModuleSemanticRuntime 负责,本生成器只产规约。
 */

import type { ModuleKindRegistry } from './module-kind-registry'
import type { ModuleKind } from '../protocol/module-kind'
import type { LlmJsonSchema, LlmJsonSchemaObject, LlmParameterSchemaRoot } from '../../protocol/parameter-schema'

/**
 * 协议级工具规约(OpenAI 兼容形状)。
 *
 * 与 AiRuntimeToolSpec 结构对齐,但不依赖 AI Runtime 模块,
 * 让 module-semantic 协议自成体系。
 *
 * `function.parameters` 复用 `LlmParameterSchemaRoot`(标准 JSON Schema 子集),
 * 这样 host 适配层可以把同一份 schema 直接喂给旧 host 的 AiRuntimeToolCodec,
 * 无需 `as` 断言绕过 TS。
 */
export interface ModuleSemanticToolSpec {
  readonly type: 'function'
  readonly function: {
    readonly name: string
    readonly description: string
    readonly parameters: LlmParameterSchemaRoot
  }
}

/**
 * 协议固定工具名集合。
 *
 * 工具名稳定,LLM 看到的工具集大小只与协议有关,
 * 不随业务方注册的 kind 数量膨胀。
 */
export const PROTOCOL_TOOL_NAMES = Object.freeze({
  getAttribute: 'getAttribute',
  setAttribute: 'setAttribute',
  invokeAction: 'invokeAction',
  listChildren: 'listChildren',
  findInstance: 'findInstance',
  describeKind: 'describeKind',
} as const)

export type ProtocolToolName = (typeof PROTOCOL_TOOL_NAMES)[keyof typeof PROTOCOL_TOOL_NAMES]

/**
 * 协议工具规约生成器。
 *
 * 用法:
 * ```ts
 * const generator = new ProtocolToolGenerator(kindRegistry)
 * const specs = generator.generate()  // 6 条 ModuleSemanticToolSpec
 * ```
 *
 * 每次调用 generate() 都基于当前注册表快照,描述里嵌入 kind 摘要。
 * 注册表变化后需重新生成。
 */
export class ProtocolToolGenerator {
  public constructor(private readonly kinds: ModuleKindRegistry) {}

  /**
   * 生成所有 6 个协议工具规约。
   */
  public generate(): readonly ModuleSemanticToolSpec[] {
    const digest = this.buildKindDigest()
    return [
      this.buildGetAttribute(digest),
      this.buildSetAttribute(digest),
      this.buildInvokeAction(digest),
      this.buildListChildren(digest),
      this.buildFindInstance(digest),
      this.buildDescribeKind(digest),
    ]
  }

  /**
   * 生成所有已注册 kind 的摘要字符串,嵌入每个工具的 description。
   *
   * 形式:
   * ```
   * - school(学校): attrs=[name, address] actions=[archive] children=[grade, teacher]
   * - grade(年级): attrs=[name, level]    actions=[]         children=[class]
   * ```
   */
  private buildKindDigest(): string {
    const lines = this.kinds.list().map((kind) => formatKindLine(kind))
    if (lines.length === 0) {
      return '(当前注册表为空,业务方需先注册 ModuleKind)'
    }
    return lines.join('\n')
  }

  private buildGetAttribute(digest: string): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.getAttribute,
        description: [
          '读取指定路径末段模块的某个属性。',
          'path 必须指向一个具体模块实例(非根路径),格式 /<kind>[<id>]/<kind>[<id>]/...',
          '当前注册的 kind 及其属性列表:',
          digest,
          '失败码: PATH_EMPTY / KIND_NOT_REGISTERED / PATH_INVALID / ATTRIBUTE_NOT_DECLARED / ATTRIBUTE_NOT_READABLE',
        ].join('\n'),
        parameters: pathPlusName('attrName', '属性名,需为路径末段 kind 上已声明且 readable=true 的属性'),
      },
    }
  }

  private buildSetAttribute(digest: string): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.setAttribute,
        description: [
          '写入指定路径末段模块的某个属性。',
          'value 的类型必须符合属性 schema,由末段 Capability 自行校验。',
          '当前注册的 kind 及其属性列表:',
          digest,
          '失败码: PATH_EMPTY / KIND_NOT_REGISTERED / PATH_INVALID / ATTRIBUTE_NOT_DECLARED / ATTRIBUTE_NOT_WRITABLE',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            path: pathProperty(),
            attrName: {
              type: 'string',
              description: '属性名,需为路径末段 kind 上已声明且 writable=true 的属性',
            },
            value: {
              description: '写入值,需符合属性 schema(类型由 describeKind 查询)',
            },
          },
          required: ['path', 'attrName', 'value'],
        },
      },
    }
  }

  private buildInvokeAction(digest: string): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.invokeAction,
        description: [
          '调用指定路径末段模块声明的某个动作。',
          'args 必须符合该动作的 paramsSchema,协议层会按 schema 预校验。',
          '调用前若不确定参数形状/注意事项/失败模式,先调 describeKind(kind) 获取完整动作元数据(含 usageRules / failureModes / paramsSchema)。',
          '当前注册的 kind 及其动作列表(rules=N 表示该动作声明了 N 条 usageRules,fails=N 表示声明了 N 条 failureModes):',
          digest,
          '失败码: PATH_EMPTY / KIND_NOT_REGISTERED / PATH_INVALID / ACTION_NOT_DECLARED / INVALID_ARGS',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            path: pathProperty(),
            actionName: {
              type: 'string',
              description: '动作名,需为路径末段 kind 上已声明的 action',
            },
            args: {
              type: 'object',
              description: '动作参数,符合 ActionSchema.paramsSchema',
              additionalProperties: true,
            },
          },
          required: ['path', 'actionName', 'args'],
        },
      },
    }
  }

  private buildListChildren(digest: string): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.listChildren,
        description: [
          '列出指定路径下可用的子实例。',
          'path="/" 时返回所有已注册的 kind 名单(用于发现入口)。',
          '非根路径时返回末段 Capability 提供的子实例列表;childKind 可选,用于过滤。',
          '当前注册的 kind 及其可挂子 kind:',
          digest,
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            path: pathProperty(true),
            childKind: {
              type: 'string',
              description: '子模块 kind,可选;路径为根时若指定,需配合 findInstance',
            },
          },
          required: ['path'],
        },
      },
    }
  }

  private buildFindInstance(digest: string): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.findInstance,
        description: [
          '在指定路径下按业务条件查询子实例。',
          'path="/" 表示在全局查询某个 kind(由 Capability 自行决定根级搜索范围)。',
          '非根路径下,childKind 必须是末段 kind 在 children 中声明的子 kind。',
          'query 由对应 Capability 解释,通常包含 label 关键字、过滤条件或 hint。',
          '当前注册的 kind 及其可挂子 kind:',
          digest,
          '失败码: KIND_NOT_REGISTERED / CHILD_KIND_NOT_DECLARED / CAPABILITY_NOT_REGISTERED',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            path: pathProperty(true),
            childKind: {
              type: 'string',
              description: '查询目标 kind,必填',
            },
            query: {
              type: 'object',
              description: '查询条件,具体字段由对应 Capability 约定',
              additionalProperties: true,
            },
          },
          required: ['path', 'childKind', 'query'],
        },
      },
    }
  }

  private buildDescribeKind(digest: string): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.describeKind,
        description: [
          '查询某个 kind 的元数据:attributes(含 readable / writable)、actions(含 usageRules、failureModes)、children。',
          '纯协议层操作,不调用 Capability。LLM 用它精确了解模块开放的属性表与动作表。',
          '当前注册的 kind:',
          digest,
          '失败码: KIND_NOT_REGISTERED',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              description: '模块 kind,需为已注册的 kind',
            },
          },
          required: ['kind'],
        },
      },
    }
  }
}

function formatKindLine(kind: ModuleKind): string {
  const attrs = kind.attributes.length === 0
    ? '[]'
    : `[${kind.attributes.map((attr) => formatAttrFlag(attr.name, attr.readable, attr.writable)).join(', ')}]`
  const actions = kind.actions.length === 0
    ? '[]'
    : `[${kind.actions.map((action) => formatActionLabel(action.name, action.usageRules?.length ?? 0, action.failureModes?.length ?? 0)).join(', ')}]`
  const children = kind.children.length === 0
    ? '[]'
    : `[${kind.children.join(', ')}]`
  return `- ${kind.kind}(${kind.name}): attrs=${attrs} actions=${actions} children=${children}`
}

function formatActionLabel(name: string, rulesCount: number, failsCount: number): string {
  if (rulesCount === 0 && failsCount === 0) return name
  const parts: string[] = []
  if (rulesCount > 0) parts.push(`rules=${rulesCount}`)
  if (failsCount > 0) parts.push(`fails=${failsCount}`)
  return `${name}(${parts.join(',')})`
}

function formatAttrFlag(name: string, readable: boolean, writable: boolean): string {
  const flag = `${readable ? 'r' : '-'}${writable ? 'w' : '-'}`
  return `${name}(${flag})`
}

function pathProperty(allowRoot = false): LlmJsonSchemaObject {
  const description = allowRoot
    ? '模块路径,根路径用 "/" 表示;具体路径形如 /<kind>[<id>]/<kind>[<id>]/...'
    : '模块路径,必须指向具体实例,形如 /<kind>[<id>]/<kind>[<id>]/...'
  return {
    type: 'string',
    description,
  }
}

function pathPlusName(propertyName: string, description: string): LlmParameterSchemaRoot {
  const properties: Record<string, LlmJsonSchema> = {
    path: pathProperty(),
    [propertyName]: {
      type: 'string',
      description,
    },
  }
  return {
    type: 'object',
    properties,
    required: ['path', propertyName],
  }
}
