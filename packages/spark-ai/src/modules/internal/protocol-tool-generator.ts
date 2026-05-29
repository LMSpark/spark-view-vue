/**
 * ═══════════════════════════════════════════════════════════════
 * modules/internal/protocol-tool-generator.ts — 固定协议工具规约生成器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】modules 层的 OpenAI function tool 规约生成入口。
 *   读取已注册的 AiModule 图，为 LLM 生成 8 个固定协议工具的 JSON Schema 规约。
 *   每个工具对应一类协议操作：查询、指南、查找、属性读写、函数调用、人工提问。
 *
 * 【8 个固定协议工具】
 *   module_query   — 查询已注册的模块目录（支持 kind / parentKind / keyword 过滤）
 *   module_guide   — 读取单个模块 kind 的用途与目录概要
 *   module_attribute_guide — 读取单个属性的详细读写指南
 *   module_function_guide — 读取单个函数的详细调用指南
 *   module_find    — 查找或列出模块实例（需提供具体父路径）
 *   module_attr    — 读写模块的声明属性
 *   module_call    — 调用模块的声明函数
 *   human_question — 遇到不确定信息时向用户发问（暂停工具循环）
 *
 * 【数据流】
 *   1. AiModuleRuntime.getTools() → ProtocolToolGenerator.generate()
 *   2. 返回 OpenAI 格式的工具规约数组
 *   3. Host 层转发给 LLM → LLM 选择工具调用 → ProtocolToolRouter 路由执行
 *
 * 【消费方】AiModuleRuntime（通过 getTools() 暴露），间接被 Host 层 tool-loop-runner 消费
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiJsonSchemaObject } from '../../json'
import type { AiModuleRegistry } from './ai-module-registry'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 工具规约类型与常量
// ═══════════════════════════════════════════════════════════════

/** 单个 OpenAI function tool 的完整规约 */
export type AiModuleToolSpec = Readonly<{
  type: 'function'
  function: {
    readonly name: ProtocolToolName
    readonly description: string
    readonly parameters: AiJsonSchemaObject
    readonly strict?: boolean
  }
}>

/** 8 个固定协议工具的联合类型 */
export type ProtocolToolName =
  | 'module_query'
  | 'module_guide'
  | 'module_attribute_guide'
  | 'module_function_guide'
  | 'module_find'
  | 'module_attr'
  | 'module_call'
  | 'human_question'

/** 工具名称常量映射（冻结对象，避免魔法字符串） */
export const PROTOCOL_TOOL_NAMES: Readonly<{
  moduleQuery: 'module_query'
  moduleGuide: 'module_guide'
  moduleAttributeGuide: 'module_attribute_guide'
  moduleFunctionGuide: 'module_function_guide'
  moduleFind: 'module_find'
  moduleAttr: 'module_attr'
  moduleCall: 'module_call'
  humanQuestion: 'human_question'
}> = Object.freeze({
  moduleQuery: 'module_query',
  moduleGuide: 'module_guide',
  moduleAttributeGuide: 'module_attribute_guide',
  moduleFunctionGuide: 'module_function_guide',
  moduleFind: 'module_find',
  moduleAttr: 'module_attr',
  moduleCall: 'module_call',
  humanQuestion: 'human_question',
})

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · ProtocolToolGenerator 类
// ═══════════════════════════════════════════════════════════════

/**
 * 协议工具规约生成器。
 *
 * 从注册表中读取已注册的模块，为 LLM 生成 8 个固定工具的 JSON Schema。
 * 每个工具的 parameters 字段严格对齐 OpenAI function calling 规范。
 */
export class ProtocolToolGenerator {
  public constructor(
    private readonly kinds: AiModuleRegistry,
  ) {}

  /** 生成全部 8 个协议工具的规约数组 */
  public generate(): readonly AiModuleToolSpec[] {
    return [
      this.buildModuleQuery(),
      this.buildModuleGuide(),
      this.buildModuleAttributeGuide(),
      this.buildModuleFunctionGuide(),
      this.buildModuleFind(),
      this.buildModuleAttr(),
      this.buildModuleCall(),
      this.buildHumanQuestion(),
    ]
  }

  /** module_query — 查询已注册模块目录 */
  private buildModuleQuery(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.moduleQuery,
        description: [
          'Query the registered AiModule catalog. Use this before choosing a path, function, attribute, or child module.',
          'Returns compact module summaries from the current runtime registration snapshot.',
          `Registered module count: ${String(this.kinds.list().length)}.`,
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            kind: { type: 'string', description: 'Optional exact module kind filter.' },
            parentKind: { type: 'string', description: 'Optional parent kind filter. Use "root" for root modules.' },
            keyword: { type: 'string', description: 'Optional keyword matching kind, name, description, payloads, attributes, functions, or children.' },
            includeFunctions: {
              type: 'boolean',
              description: 'When true, also returns matching function summaries.',
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
    }
  }

  /** module_guide — 读取模块 kind 的用途与目录概要 */
  private buildModuleGuide(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.moduleGuide,
        description: [
          'Read overview guidance for one registered module kind.',
          'Use this to inspect module metadata, attributes, children, payload refs, and declared function names.',
          'For concrete contracts, call module_attribute_guide or module_function_guide after choosing from the directory.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            kind: { type: 'string', description: 'Registered module kind.' },
          },
          required: ['kind'],
          additionalProperties: false,
        },
      },
    }
  }

  /** module_attribute_guide — 读取单个属性的完整读写指南 */
  private buildModuleAttributeGuide(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.moduleAttributeGuide,
        description: [
          'Read the exact contract for one declared attribute before module_attr.',
          'Requires both kind and attrName. Returns access, schema, read/write steps, and example when declared.',
          'Use this after module_query or module_guide selects a real attribute name.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            kind: { type: 'string', description: 'Registered module kind that declares the attribute.' },
            attrName: { type: 'string', description: 'Exact declared attribute name on the module kind.' },
          },
          required: ['kind', 'attrName'],
          additionalProperties: false,
        },
      },
    }
  }

  /** module_function_guide — 读取单个函数的完整调用指南 */
  private buildModuleFunctionGuide(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.moduleFunctionGuide,
        description: [
          'Read the exact contract for one declared function before calling module_call.',
          'Requires both kind and functionName. Returns paramsSchema, requiredBeforeCall, usageRules, failureModes, recoveryHints, and payload lookup steps.',
          'Use this after module_query(includeFunctions=true) selects a real functionName, and again after FUNCTION_NOT_DECLARED or SCHEMA_VALIDATION_FAILED.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            kind: { type: 'string', description: 'Registered module kind that declares the function.' },
            functionName: { type: 'string', description: 'Exact declared function name on the module kind.' },
          },
          required: ['kind', 'functionName'],
          additionalProperties: false,
        },
      },
    }
  }

  /** module_find — 查找或列出模块实例 */
  private buildModuleFind(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.moduleFind,
        description: [
          'Find or list module instances using a concrete parent path.',
          'Use path="/" for root instances. Provide childKind and query to search; omit query to list children.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            path: pathProperty(true),
            childKind: {
              type: 'string',
              description: 'Optional child module kind filter. Required when query is provided.',
            },
            query: instanceQueryProperty(),
          },
          required: ['path'],
          additionalProperties: false,
        },
      },
    }
  }

  /** module_attr — 读写模块属性 */
  private buildModuleAttr(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.moduleAttr,
        description: [
          'Read or write one declared attribute on the module identified by path.',
          'Set op="get" to read. Set op="set" and provide value to write.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            op: {
              type: 'string',
              enum: ['get', 'set'],
              description: 'Attribute operation.',
            },
            path: pathProperty(),
            attrName: { type: 'string', description: 'Declared attribute name on the path tail kind.' },
            value: {
              description: 'Value for op="set"; shape is described by module_attribute_guide.',
              type: ['string', 'number', 'boolean', 'object', 'array', 'null'],
            },
          },
          required: ['op', 'path', 'attrName'],
          additionalProperties: false,
        },
      },
    }
  }

  /** module_call — 调用模块函数 */
  private buildModuleCall(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.moduleCall,
        description: [
          'Call a declared function on the module identified by path.',
          'Instance identity is resolved only from path and the current session scope. Do not pass protocol-only $paths.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            path: pathProperty(),
            functionName: { type: 'string', description: 'Declared function name on the path tail kind.' },
            args: {
              type: 'object',
              description: 'Business arguments for the function. Shape is described by module_function_guide.',
              additionalProperties: true,
            },
          },
          required: ['path', 'functionName', 'args'],
          additionalProperties: false,
        },
      },
    }
  }

  /** human_question — 向用户发问（暂停工具循环、收集缺失事实） */
  private buildHumanQuestion(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.humanQuestion,
        description: [
          'Prepare a human-facing question when required facts or confirmations are missing.',
          'Use this to pause tool execution and make the next user prompt precise.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            context: { type: 'string', description: 'What the agent is trying to complete.' },
            reason: { type: 'string', description: 'Why guessing would be risky or impossible.' },
            missingFacts: {
              type: 'array',
              description: 'Missing user facts, ordered by importance.',
              items: { type: 'string' },
            },
            candidateOptions: {
              type: 'array',
              description: 'Optional choices if they help the user answer quickly.',
              items: { type: 'string' },
            },
          },
          required: ['context', 'reason'],
          additionalProperties: false,
        },
      },
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 共享参数 schema 构造器 + 类型守卫
// ═══════════════════════════════════════════════════════════════

/** 生成 path 参数的 JSON Schema（多个工具复用） */
function pathProperty(allowRoot = false): AiJsonSchemaObject {
  return {
    type: 'string',
    description: allowRoot
      ? 'Module path. Use "/" for the root, or /<kind>[<id>]/... for concrete instances.'
      : 'Concrete module path such as /<kind>[<id>]/<childKind>[<id>].',
  }
}

/** 生成 instanceQuery 参数的 JSON Schema（module_find 复用） */
function instanceQueryProperty(): AiJsonSchemaObject {
  return {
    type: 'object',
    description: 'Optional business query object interpreted by the target module finder.',
    properties: {
      id: { type: 'string', description: 'Exact instance id.' },
      label: { type: 'string', description: 'Visible label or name.' },
      keyword: { type: 'string', description: 'Loose keyword.' },
      hint: { type: 'string', description: 'Natural-language lookup hint.' },
      filters: {
        type: 'object',
        description: 'Business-specific filters.',
        additionalProperties: true,
      },
    },
    additionalProperties: true,
  }
}

/** 类型守卫：判断字符串是否为合法的协议工具名 */
export function isProtocolToolName(name: string): name is ProtocolToolName {
  const known: readonly ProtocolToolName[] = Object.values(PROTOCOL_TOOL_NAMES)
  return known.some((candidate) => candidate === name)
}
