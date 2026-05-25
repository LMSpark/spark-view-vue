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
 *   - 每个工具的 description 只说明固定协议职责；业务知识由 queryModules / queryFunctions / guideFunction 按需返回。
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
  /** 生成所有固定协议工具规约 */
  public generate(): readonly ModuleSemanticToolSpec[] {
    return [
      this.buildQueryModules(),
      this.buildQueryFunctions(),
      this.buildGuideFunction(),
      this.buildGuideHumanQuestion(),
      this.buildGetAttribute(),
      this.buildSetAttribute(),
      this.buildInvokeAction(),
      this.buildListChildren(),
      this.buildFindInstance(),
      this.buildDescribeKind(),
    ]
  }

  // ── 知识工具构建器 ───────────────────────────────────────

  private buildQueryModules(): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.queryModules,
        description: [
          '职责：查询当前注册的 ModuleKind 分层知识目录，这是 LLM 进入业务能力的第一入口。',
          '何时使用：不确定入口 kind、父子 kind、实例 id 来源、pathPattern、属性/函数摘要或 payload 引用时调用。',
          '返回：ModuleSemanticKnowledgeModuleSummary[]，包含 instanceGuide、childKindSummaries、attributeGuides、functionGuides、payloadLookupSteps。',
          '下一步：按 instanceGuide.queryFields 调 findInstance；按 childKindSummaries.detailLookupSteps 进入子层；按 functionGuides 再查 queryFunctions/guideFunction。',
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

  private buildQueryFunctions(): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.queryFunctions,
        description: [
          '职责：查询动作目录，帮助 LLM 从业务意图定位到 kind.actionName。',
          '何时使用：已知道或大致知道 kind/关键词，需要选择可调用函数、必填参数、失败码或 payload 引用时调用。',
          '返回：ModuleSemanticKnowledgeFunctionSummary[]，包含 action、kind、actionName、paramNames、requiredParamNames、failureCodes、payloadLookupSteps。',
          '下一步：选定 action 后调用 guideFunction 读取完整 paramsSchema、usageRules、failureModes，再进入 invokeAction。',
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

  private buildGuideFunction(): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.guideFunction,
        description: [
          '职责：查询单个业务函数的完整调用契约，是 invokeAction 前的函数级指南。',
          '何时使用：已选定 action，准备构造 args 或需要读取 usageRules、failureModes、example、resultSchema 时调用。',
          '返回：ModuleSemanticKnowledgeFunctionGuide，包含完整 paramsSchema、resultSchema、usageRules、failureModes、requiresPayloadGuide、payloadLookupSteps。',
          '下一步：requiresPayloadGuide=true 时按 payloadLookupSteps 查询 payload 目录；参数齐备后调用 invokeAction。',
          '输入：action 使用 "<kind>.<actionName>"，也可传 kind + actionName。',
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

  private buildGuideHumanQuestion(): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.guideHumanQuestion,
        description: [
          '职责：把缺失用户事实整理成可追问的问题，帮助 LLM 暂停工具链并收集必要事实。',
          '何时使用：缺少用户意图、业务范围、日期含义、审批/提交确认、破坏性操作确认或必填业务字段时调用。',
          '返回：human-question-guide，包含 shouldAskHuman、stopToolCalls、question、usageRules、resumeFlow。',
          '下一步：把 question 改写为自然语言询问用户，用户回复后按 resumeFlow 继续 queryModules/queryFunctions/guideFunction 或执行工具。',
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

  private buildGetAttribute(): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.getAttribute,
        description: [
          '职责：读取具体实例 path 末段 kind 的一个属性。',
          '何时使用：queryModules/describeKind 显示该属性 readable=true，且已经通过 findInstance 取得实例 path 时调用。',
          '输入：path 为具体实例路径 /<kind>[<id>]/...；attrName 为末段 kind 声明的属性名。',
          '返回：属性 JSON 值；属性 schema 来源于 queryModules.attributeGuides 或 describeKind.attributes。',
          '下一步：按返回值继续判断业务状态，或在需要修改且 writable=true 时调用 setAttribute。',
          '失败码: PATH_EMPTY / KIND_NOT_REGISTERED / PATH_INVALID / ATTRIBUTE_NOT_DECLARED / ATTRIBUTE_NOT_READABLE',
        ].join('\n'),
        parameters: pathPlusName('attrName', '属性名,需为路径末段 kind 上已声明且 readable=true 的属性'),
      },
    }
  }

  private buildSetAttribute(): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.setAttribute,
        description: [
          '职责：写入具体实例 path 末段 kind 的一个属性。',
          '何时使用：queryModules/describeKind 显示该属性 writable=true，且 value 已按属性 schema 构造完成时调用。',
          '输入：path 为具体实例路径；attrName 为末段 kind 声明的属性名；value 为 JSON 值。',
          '返回：写入成功时 data 为空；失败时根据 checks/code/msg/fix 修正 value 或路径。',
          '下一步：需要确认写入结果时调用 getAttribute 或对应只读 action。',
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

  private buildInvokeAction(): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.invokeAction,
        description: [
          '职责：执行具体实例 path 末段 kind 声明的业务 action。',
          '何时使用：已经通过 queryFunctions 选定 action，并通过 guideFunction/describeKind 读取完整 paramsSchema、usageRules、failureModes 后调用。',
          '输入：path 为具体实例路径；actionName 为末段 kind 的 action 名；args 必须符合该 action.paramsSchema。',
          '复杂参数：guideFunction 返回 requiresPayloadGuide=true 时，先按 payloadLookupSteps 调 payload-catalog 的 queryPayloads/guidePayload，再组装 args。',
          '返回：业务 action 的 JSON 结果；失败时读取 code/msg/fix/checks 并按指南修正。',
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

  private buildListChildren(): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.listChildren,
        description: [
          '职责：列出根入口或某个实例 path 下的可用子实例引用。',
          '何时使用：需要发现入口 kind、查看父实例下有哪些子 kind/子实例，或先浏览候选实例时调用。',
          '输入：path="/" 返回根级 kind 引用；非根 path 返回末段实例的子实例；childKind 可选过滤。',
          '返回：ModuleInstanceRef[]，每项包含 id、label、summary；id 可用于拼接后续实例 path。',
          '下一步：需要按条件定位时调用 findInstance；需要进入实例时把 ref.id 拼入 pathPattern。',
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

  private buildFindInstance(): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.findInstance,
        description: [
          '职责：按业务条件查询根级实例或某个父实例下的子实例。',
          '何时使用：已从 queryModules.instanceGuide 或 childKindSummaries 知道 childKind，需要拿真实 ModuleInstanceRef.id 时调用。',
          '输入：path="/" 查询根级 childKind；非根 path 查询末段 kind.children 中声明的 childKind；query 字段来自目标 kind 的 instanceGuide.queryFields。',
          '返回：ModuleInstanceRef[]，每项 id 是实例路径段中的 id。',
          '下一步：按目标 pathPattern 或 parentPath/<childKind>[ref.id] 拼接 path，再调用 describeKind/getAttribute/setAttribute/invokeAction。',
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

  private buildDescribeKind(): ModuleSemanticToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.describeKind,
        description: [
          '职责：查询单个 kind 的原始元数据。',
          '何时使用：已知道 kind，需要精确查看 attributes、actions、payloads、children，或校对 queryModules 摘要时调用。',
          '返回：kind/name/description/parentKind、attributes(readable/writable/schema)、actions(paramsSchema/usageRules/failureModes/resultSchema/example)、payloads、children。',
          '下一步：读写属性走 getAttribute/setAttribute；执行业务函数优先再用 guideFunction 获取函数级流程。',
          'payloads[].requiredForActions 表示对应 action 构造复杂参数前应按 payloadLookupSteps 查询 payload 目录。',
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
    description: '查询条件,具体字段由对应 ModuleKind 构造期 find 委托解释;先看 queryModules 返回的 instanceGuide.queryFields,优先使用 id/label/keyword/hint/name/code/role/filters 这些稳定字段',
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
