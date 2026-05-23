/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/internal/protocol-tool-generator.ts — 协议工具规约生成器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】协议层内部组件，由 ModuleSemanticRuntime 组合。
 *   从所有已注册的 ModuleKind 派生 6 个固定的 LLM 可见协议工具。
 *
 * 【设计原则】
 *   - LLM 看到的工具数固定为 6，不随业务 kind 数量膨胀。
 *   - 工具规约对齐 OpenAI function tool spec：{ type: 'function', function: { name, description, parameters } }。
 *   - 每个工具的 description 内嵌当前注册的 kind 摘要，LLM 据此决定下一步调哪个工具。
 *   - 调用路由由 ModuleSemanticRuntime.executeTool() 负责，本生成器只产规约。
 *
 * 【6 个协议工具】
 *   - getAttribute(path, attrName)         — 读属性
 *   - setAttribute(path, attrName, value)  — 写属性
 *   - invokeAction(path, actionName, args) — 调用动作
 *   - listChildren(path, childKind?)       — 列出子实例
 *   - findInstance(path, childKind, query) — 查询子实例
 *   - describeKind(kind)                   — 查询 kind 元数据
 *
 * 【消费方】ModuleSemanticRuntime.getLlmTools() → ModuleSemanticToolCodec → Host transport
 * ═══════════════════════════════════════════════════════════════
 */

import type { ModuleKindRegistry } from './module-kind-registry'
import type { ModuleKind } from '../protocol/module-kind'
import type { LlmJsonSchema, LlmJsonSchemaObject } from '../../schema'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 公共类型
// ═══════════════════════════════════════════════════════════════

/**
 * 协议级工具规约（OpenAI 兼容形状）。
 * function.parameters 复用 LlmJsonSchemaObject（标准 JSON Schema 子集），
 * Host 可直接交给 transport，无需 as 断言。
 */
export type ModuleSemanticToolSpec = Readonly<{
  type: 'function'
  function: {
    readonly name: string
    readonly description: string
    readonly parameters: LlmJsonSchemaObject
  }
}>

/** 6 个固定协议工具名 */
export type ProtocolToolName =
  | 'getAttribute'
  | 'setAttribute'
  | 'invokeAction'
  | 'listChildren'
  | 'findInstance'
  | 'describeKind'

/** 协议固定工具名常量集合（Object.freeze 防篡改） */
export const PROTOCOL_TOOL_NAMES: Readonly<{
  getAttribute: 'getAttribute'
  setAttribute: 'setAttribute'
  invokeAction: 'invokeAction'
  listChildren: 'listChildren'
  findInstance: 'findInstance'
  describeKind: 'describeKind'
}> = Object.freeze({
  getAttribute: 'getAttribute',
  setAttribute: 'setAttribute',
  invokeAction: 'invokeAction',
  listChildren: 'listChildren',
  findInstance: 'findInstance',
  describeKind: 'describeKind',
})

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · ProtocolToolGenerator class
// ═══════════════════════════════════════════════════════════════

/**
 * 协议工具规约生成器。
 *
 * 用法:
 * ```ts
 * const generator = new ProtocolToolGenerator(kindRegistry)
 * const specs = generator.generate()  // 返回 6 条 ModuleSemanticToolSpec
 * ```
 *
 * 每次 generate() 基于当前注册表快照生成规约。
 * 注册表变化后需重新调用。
 */
export class ProtocolToolGenerator {
  public constructor(private readonly kinds: ModuleKindRegistry) {}

  /** 生成所有 6 个协议工具规约 */
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

  // ── Kind 摘要生成 ────────────────────────────────────────

  /**
   * 生成所有已注册 kind 的摘要字符串，嵌入每个工具的 description。
   *
   * 形式:
   * ```
   * - school(学校): attrs=[name(rw), address(r-)] actions=[archive(rules=1)] children=[grade, teacher]
   * - grade(年级): attrs=[name(rw), level(rw)]    actions=[]                    children=[class]
   * ```
   */
  private buildKindDigest(): string {
    const lines = this.kinds.list().map((kind) => formatKindLine(kind))
    if (lines.length === 0) {
      return '(当前注册表为空,业务方需先注册 ModuleKind)'
    }
    return lines.join('\n')
  }

  // ── 6 个工具构建器 ───────────────────────────────────────

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
          'value 的类型必须符合属性 schema,由末段 ModuleKind 自行校验。',
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
          '失败码: PATH_EMPTY / KIND_NOT_REGISTERED / PATH_INVALID / ACTION_NOT_DECLARED / SCHEMA_VALIDATION_FAILED',
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
              description: '动作参数,符合 ModuleActionMetadata.paramsSchema',
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
          '非根路径时返回末段 ModuleKind 提供的子实例列表;childKind 可选,用于过滤。',
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
          'path="/" 表示在全局查询某个 kind(由目标 ModuleKind 自行决定根级搜索范围)。',
          '非根路径下,childKind 必须是末段 kind 在 children 中声明的子 kind。',
          'query 由对应 ModuleKind 构造期 find 委托解释,通常包含 label 关键字、过滤条件或 hint。',
          '当前注册的 kind 及其可挂子 kind:',
          digest,
          '失败码: KIND_NOT_REGISTERED / CHILD_KIND_NOT_DECLARED',
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
              description: '查询条件,具体字段由对应 ModuleKind 构造期 find 委托约定',
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
          '纯协议层操作,不调用业务 runner。LLM 用它精确了解模块开放的属性表与动作表。',
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

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 格式化 helper（不导出）
// ═══════════════════════════════════════════════════════════════

/** 格式化单条 kind 摘要行 */
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
  const payloads = kind.payloads.length === 0
    ? '[]'
    : `[${kind.payloads.map((payload) => payload.payloadRef).join(', ')}]`
  const parent = kind.parentKind === undefined ? 'root' : `parent=${kind.parentKind}`
  return `- ${kind.kind}(${kind.name}; ${parent}): attrs=${attrs} actions=${actions} payloads=${payloads} children=${children}`
}

/** 格式化动作标签：name 或 name(rules=N,fails=N) */
function formatActionLabel(name: string, rulesCount: number, failsCount: number): string {
  if (rulesCount === 0 && failsCount === 0) return name
  const parts: string[] = []
  if (rulesCount > 0) parts.push(`rules=${rulesCount}`)
  if (failsCount > 0) parts.push(`fails=${failsCount}`)
  return `${name}(${parts.join(',')})`
}

/** 格式化属性标签：name(rw)、name(r-)、name(-w) */
function formatAttrFlag(name: string, readable: boolean, writable: boolean): string {
  const flag = `${readable ? 'r' : '-'}${writable ? 'w' : '-'}`
  return `${name}(${flag})`
}

/** path 参数 schema（可选 allowRoot） */
function pathProperty(allowRoot = false): LlmJsonSchemaObject {
  const description = allowRoot
    ? '模块路径,根路径用 "/" 表示;具体路径形如 /<kind>[<id>]/<kind>[<id>]/...'
    : '模块路径,必须指向具体实例,形如 /<kind>[<id>]/<kind>[<id>]/...'
  return { type: 'string', description }
}

/** 构建 { path, <propertyName> } 的参数根 schema */
function pathPlusName(propertyName: string, description: string): LlmJsonSchemaObject {
  const properties: Record<string, LlmJsonSchema> = {
    path: pathProperty(),
    [propertyName]: { type: 'string', description },
  }
  return { type: 'object', properties, required: ['path', propertyName] }
}
