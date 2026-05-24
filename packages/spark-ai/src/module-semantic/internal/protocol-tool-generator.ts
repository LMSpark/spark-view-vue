/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/internal/protocol-tool-generator.ts — 协议工具规约生成器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】协议层内部组件，由 ModuleSemanticRuntime 组合。
 *   从所有已注册的 ModuleKind 派生 LLM 可见的知识工具与执行协议工具。
 *
 * 【设计原则】
 *   - LLM 看到的工具集固定，不随业务 kind 数量膨胀。
 *   - 工具规约对齐 OpenAI function tool spec：{ type: 'function', function: { name, description, parameters } }。
 *   - 每个工具的 description 内嵌当前注册的 kind 摘要，LLM 据此决定下一步调哪个工具。
 *   - 调用路由由 ModuleSemanticRuntime.executeTool() 负责，本生成器只产规约。
 *
 * 【知识工具】
 *   - queryModules()                       — 查询模块目录摘要
 *   - queryFunctions(kind?, keyword?)       — 查询动作目录摘要
 *   - guideFunction(action | kind+action)   — 查询单个动作完整指南
 *   - guideHumanQuestion(context, reason)   — 查询人工反问指南
 *
 * 【6 个执行协议工具】
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

/** 固定协议工具名 */
export type ProtocolToolName =
  | 'queryModules'
  | 'queryFunctions'
  | 'guideFunction'
  | 'guideHumanQuestion'
  | 'getAttribute'
  | 'setAttribute'
  | 'invokeAction'
  | 'listChildren'
  | 'findInstance'
  | 'describeKind'

/** 协议固定工具名常量集合（Object.freeze 防篡改） */
export const PROTOCOL_TOOL_NAMES: Readonly<{
  queryModules: 'queryModules'
  queryFunctions: 'queryFunctions'
  guideFunction: 'guideFunction'
  guideHumanQuestion: 'guideHumanQuestion'
  getAttribute: 'getAttribute'
  setAttribute: 'setAttribute'
  invokeAction: 'invokeAction'
  listChildren: 'listChildren'
  findInstance: 'findInstance'
  describeKind: 'describeKind'
}> = Object.freeze({
  queryModules: 'queryModules',
  queryFunctions: 'queryFunctions',
  guideFunction: 'guideFunction',
  guideHumanQuestion: 'guideHumanQuestion',
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
 * const specs = generator.generate()  // 返回固定 ModuleSemanticToolSpec 列表
 * ```
 *
 * 每次 generate() 基于当前注册表快照生成规约。
 * 注册表变化后需重新调用。
 */
export class ProtocolToolGenerator {
  public constructor(private readonly kinds: ModuleKindRegistry) {}

  /** 生成所有固定协议工具规约 */
  public generate(): readonly ModuleSemanticToolSpec[] {
    const digest = this.buildKindDigest()
    return [
      this.buildQueryModules(digest),
      this.buildQueryFunctions(digest),
      this.buildGuideFunction(digest),
      this.buildGuideHumanQuestion(digest),
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

  // ── 知识工具构建器 ───────────────────────────────────────

  private buildQueryModules(digest: string): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.queryModules,
        description: [
          '查询当前注册的 AI 业务模块目录摘要。',
          '这是旧 knowledge.queryModules 的 LLM 直面工具,只返回轻量模块边界、payload 引用和子 kind 摘要。',
          '当不确定当前有哪些业务模块、入口 kind、父子模块或模块职责时先调用本工具。',
          '当前注册的 kind:',
          digest,
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              description: '可选 kind 精确过滤,例如 "pageDesign" 或 "node-tree"',
            },
            parentKind: {
              type: 'string',
              description: '可选父 kind 过滤;传 "root" 表示只看根模块',
            },
            keyword: {
              type: 'string',
              description: '可选关键字,匹配 kind、name、description、payloadRef 或 child kind',
            },
          },
          additionalProperties: false,
        },
      },
    }
  }

  private buildQueryFunctions(digest: string): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.queryFunctions,
        description: [
          '查询当前注册模块的动作目录摘要。',
          '这是旧 knowledge.queryFunctions 的 LLM 直面工具,返回 action、描述、参数名、必填参数名和失败码摘要,不返回完整 schema。',
          '调用 invokeAction 前若不确定 actionName、参数字段或失败模式,先用本工具检索候选动作;需要完整参数规则时再调用 guideFunction。',
          '当前注册的 kind 及其动作列表:',
          digest,
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              description: '可选 kind 过滤,例如 "node-tree"',
            },
            keyword: {
              type: 'string',
              description: '可选关键字,匹配 action、kind、actionName 或 description',
            },
          },
          additionalProperties: false,
        },
      },
    }
  }

  private buildGuideFunction(digest: string): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.guideFunction,
        description: [
          '查询单个动作的完整调用指南。',
          '这是旧 knowledge.guideFunction 的 LLM 直面工具,返回完整 paramsSchema、resultSchema、usageRules、failureModes 和 example。',
          '准备调用 invokeAction 前,若动作包含复杂参数、payload 约束或 usageRules/failureModes,必须先调用本工具确认参数契约。',
          'action 使用 "<kind>.<actionName>" 格式;也可传 kind + actionName。',
          '当前注册的 kind 及其动作列表:',
          digest,
          '失败码: INVALID_GUIDE_REQUEST / KIND_NOT_REGISTERED / FUNCTION_NOT_FOUND',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: '动作全名,格式 "<kind>.<actionName>",例如 "node-tree.getNode"',
            },
            kind: {
              type: 'string',
              description: '模块 kind;未传 action 时必填',
            },
            actionName: {
              type: 'string',
              description: '动作名;未传 action 时必填',
            },
          },
          oneOf: [
            {
              type: 'object',
              required: ['action'],
            },
            {
              type: 'object',
              required: ['kind', 'actionName'],
            },
          ],
          additionalProperties: false,
        },
      },
    }
  }

  private buildGuideHumanQuestion(digest: string): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.guideHumanQuestion,
        description: [
          '生成结构化人工反问指南,用于缺少用户事实时避免猜测。',
          '这是知识工具,不执行业务副作用,不会替用户作决定。',
          '当缺少用户意图、业务范围、日期含义、审批/提交确认、破坏性操作确认或必填业务字段时,先调用本工具。',
          '工具返回 question 后,应停止继续调用写工具,把问题用自然语言问给用户,等待下一轮答复。',
          '当前注册的 kind 摘要:',
          digest,
          '失败码: INVALID_HUMAN_QUESTION_REQUEST / INVALID_TOOL_ARGS',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            context: {
              type: 'string',
              description: '当前任务或工具链上下文,说明正在尝试完成什么',
            },
            reason: {
              type: 'string',
              description: '为什么必须问用户;说明如果猜测会造成什么风险',
            },
            missingFacts: {
              type: 'array',
              description: '缺失的用户事实,按重要性列出,最多 3 条',
              items: { type: 'string' },
            },
            candidateOptions: {
              type: 'array',
              description: '可选项列表;只有确实能收敛用户选择时填写',
              items: { type: 'string' },
            },
          },
          required: ['context', 'reason'],
          additionalProperties: false,
        },
      },
    }
  }

  // ── 执行协议工具构建器 ─────────────────────────────────────

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
          '调用前若不确定参数形状/注意事项/失败模式,先调 guideFunction({ action }) 或 describeKind(kind) 获取完整动作元数据(含 usageRules / failureModes / paramsSchema)。',
          '若缺少用户事实或需要确认用户选择,先调 guideHumanQuestion,不要用默认值替用户决定。',
          '若目标 kind 声明 payloads,它们是复杂参数的外部指南引用;调用相关写动作前必须先通过业务提供的 payload 查询/指南动作取得参数 schema,不要凭记忆组装复杂 args。',
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
            query: instanceQueryProperty(),
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
          '查询某个 kind 的元数据:attributes(含 readable / writable)、actions(含 usageRules、failureModes)、payloads(外部参数指南引用)、children。',
          '纯协议层操作,不调用业务 runner。LLM 用它精确了解模块开放的属性表与动作表。',
          'payloads[].requiredForActions 表示哪些 action 在构造复杂参数前需要先读取对应 payload 指南。',
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
    : `[${kind.payloads.map(formatPayloadLabel).join(', ')}]`
  const parent = kind.parentKind === undefined ? 'root' : `parent=${kind.parentKind}`
  return `- ${kind.kind}(${kind.name}; ${parent}): attrs=${attrs} actions=${actions} payloads=${payloads} children=${children}`
}

/** 格式化参数荷载标签：payloadRef 或 payloadRef(actions=a|b) */
function formatPayloadLabel(payload: ModuleKind['payloads'][number]): string {
  const actions = payload.requiredForActions ?? []
  if (actions.length === 0) return payload.payloadRef
  return `${payload.payloadRef}(actions=${actions.join('|')})`
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

/** findInstance 的查询参数 schema：保留业务扩展，同时给 LLM 常用字段。 */
function instanceQueryProperty(): LlmJsonSchemaObject {
  return {
    type: 'object',
    description: '查询条件,具体字段由对应 ModuleKind 构造期 find 委托解释;优先使用 id/label/keyword/hint/filters 这些稳定字段',
    properties: {
      id: {
        type: 'string',
        description: '实例 id 精确查询',
      },
      label: {
        type: 'string',
        description: '实例显示名或用户可见名称',
      },
      keyword: {
        type: 'string',
        description: '模糊关键字',
      },
      hint: {
        type: 'string',
        description: '自然语言查询提示,用于业务 find 委托自行解释',
      },
      filters: {
        type: 'object',
        description: '业务自定义过滤条件',
        additionalProperties: true,
      },
    },
    additionalProperties: true,
  }
}

/** 构建 { path, <propertyName> } 的参数根 schema */
function pathPlusName(propertyName: string, description: string): LlmJsonSchemaObject {
  const properties: Record<string, LlmJsonSchema> = {
    path: pathProperty(),
    [propertyName]: { type: 'string', description },
  }
  return { type: 'object', properties, required: ['path', propertyName] }
}
