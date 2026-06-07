/**
 * ═══════════════════════════════════════════════════════════════
 * modules/internal/protocol-tool-generator.ts — 固定协议工具规约生成器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】modules 层的 OpenAI function tool 规约生成入口。
 *   读取已注册的 AiModule 图，为 LLM 生成固定协议工具的 JSON Schema 规约。
 *   每个工具对应一类协议操作：查询、指南、查找、属性读写、函数调用、人工提问。
 *
 * 【固定协议工具】
 *   module_query   — 查询已注册的模块目录（支持 kind / parentKind / keyword 过滤）
 *   module_guide   — 读取单个模块 kind 的用途与目录概要
 *   module_attribute_guide — 读取单个属性的详细读写指南
 *   module_function_guide — 读取单个函数的详细调用指南
 *   module_find    — 查找或列出模块实例（需提供具体父路径）
 *   module_attr    — 读写模块的声明属性
 *   module_call    — 兼容旧协议调用模块声明函数；新协议优先直接暴露 functionName({ path, args })
 *   module_script  — 在模块上下文沙箱中执行脚本，适合组合多次查询/调用
 *   module_memory  — 当前会话/业务实例的临时 JSON 记忆体
 *   human_question — 遇到不确定信息时向用户发问（暂停工具循环）
 *   agent_complete — 以工具调用完成当前生产线，避免自然语言正文收尾
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
import { resolveAiModulePath } from './ai-module-path'
import type { AiModuleRegistry } from './ai-module-registry'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 工具规约类型与常量
// ═══════════════════════════════════════════════════════════════

/** 单个 OpenAI function tool 的完整规约 */
export type AiModuleToolSpec = Readonly<{
  type: 'function'
  function: {
    readonly name: string
    readonly description: string
    readonly parameters: AiJsonSchemaObject
    readonly strict?: boolean
  }
}>

/** 固定协议工具的联合类型 */
export type ProtocolToolName =
  | 'module_query'
  | 'module_guide'
  | 'module_attribute_guide'
  | 'module_function_guide'
  | 'module_find'
  | 'module_attr'
  | 'module_call'
  | 'module_script'
  | 'module_memory'
  | 'human_question'
  | 'agent_complete'

/** 工具名称常量映射（冻结对象，避免魔法字符串） */
export const PROTOCOL_TOOL_NAMES: Readonly<{
  moduleQuery: 'module_query'
  moduleGuide: 'module_guide'
  moduleAttributeGuide: 'module_attribute_guide'
  moduleFunctionGuide: 'module_function_guide'
  moduleFind: 'module_find'
  moduleAttr: 'module_attr'
  moduleCall: 'module_call'
  moduleScript: 'module_script'
  moduleMemory: 'module_memory'
  humanQuestion: 'human_question'
  agentComplete: 'agent_complete'
}> = Object.freeze({
  moduleQuery: 'module_query',
  moduleGuide: 'module_guide',
  moduleAttributeGuide: 'module_attribute_guide',
  moduleFunctionGuide: 'module_function_guide',
  moduleFind: 'module_find',
  moduleAttr: 'module_attr',
  moduleCall: 'module_call',
  moduleScript: 'module_script',
  moduleMemory: 'module_memory',
  humanQuestion: 'human_question',
  agentComplete: 'agent_complete',
})

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · ProtocolToolGenerator 类
// ═══════════════════════════════════════════════════════════════

/**
 * 协议工具规约生成器。
 *
 * 从注册表中读取已注册的模块，为 LLM 生成固定导航工具和直接业务函数工具的 JSON Schema。
 * 每个工具的 parameters 字段严格对齐 OpenAI function calling 规范。
 */
export class ProtocolToolGenerator {
  public constructor(
    private readonly kinds: AiModuleRegistry,
  ) {}

  /** 生成协议工具和业务函数工具的规约数组 */
  public generate(): readonly AiModuleToolSpec[] {
    return [
      this.buildModuleQuery(),
      this.buildModuleGuide(),
      this.buildModuleAttributeGuide(),
      this.buildModuleFunctionGuide(),
      this.buildModuleFind(),
      this.buildModuleAttr(),
      this.buildModuleCall(),
      this.buildModuleScript(),
      this.buildModuleMemory(),
      this.buildHumanQuestion(),
      this.buildAgentComplete(),
      ...this.buildDeclaredFunctionTools(),
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
            keyword: { type: 'string', description: 'Optional keyword matching kind, name, description, attributes, functions, or children.' },
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
          'Use this to inspect module metadata, attributes, children, and declared function names.',
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
          'For complex object attributes, pass property like "metadata.columns" to inspect only that local schema branch.',
          'Use this after module_query or module_guide selects a real attribute name.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            kind: { type: 'string', description: 'Registered module kind that declares the attribute.' },
            attrName: { type: 'string', description: 'Exact declared attribute name on the module kind.' },
            property: { type: 'string', description: 'Optional dot-separated property branch inside the attribute schema.' },
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
          'Read the exact contract for one declared function before calling the direct business function tool.',
          'Requires both kind and functionName. Returns paramsSchema, resultApis, requiredBeforeCall, usageRules, failureModes, and recoveryHints.',
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
          'Root lookup: module_find({ path: "/", childKind: "project", query: { id: "<projectId>" } }). Do not list root kind without query.',
          'Flat query fields such as id are coalesced into query when query object is omitted.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            path: pathProperty(true),
            childKind: {
              type: 'string',
              description: 'Child module kind filter. Required when query is provided.',
            },
            query: instanceQueryProperty(),
          },
          required: ['path'],
          additionalProperties: true,
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

  /** module_call — 兼容旧协议调用模块函数；新调用优先使用 direct function */
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

  /** module_script — 在模块上下文沙箱中执行脚本 */
  private buildModuleScript(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.moduleScript,
        description: [
          'Execute JavaScript with this bound to the module context itself; ctx is the same object.',
          'Use this when direct function calls are too small-grained and the task needs branching, loops, or multiple metadata/API calls.',
          'Optional path selects the module context tail (e.g. /project[homepage] or /project[homepage]/config-page[pageId]). Without path, this defaults to the business root kind (project), not host.moduleId.',
          'Parameter name is script (not code). editNodeTree/editDataSet are script-only mutators.',
          'Available helpers include this.module_query, this.module_guide, this.module_attribute_guide, this.module_function_guide, this.module_find, this.module_attr, this.module_call, and this.call; the same helpers are also available under this.$tools when a provider method has the same name.',
          'Return a JSON-serializable value.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Optional module path for script this binding. Example: /project[homepage]/config-page[<pageId>]',
            },
            script: {
              type: 'string',
              description: 'JavaScript body executed inside async function with this bound to the module context. Example: return await this.openPageDesign({ pageId: "<pageId>" })',
            },
          },
          required: ['script'],
          additionalProperties: false,
        },
      },
    }
  }

  /** module_memory — 当前会话/业务实例的临时 JSON 记忆体 */
  private buildModuleMemory(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.moduleMemory,
        description: [
          'Read and write temporary JSON memory for the current module host scope.',
          'Use it as an LLM scratchpad for selected kind/function names, guide digests, draft args, and diagnostic notes.',
          'Do not store business live state or durable user facts here; this memory is runtime-local and may be cleared.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            op: {
              type: 'string',
              enum: ['get', 'set', 'delete', 'list', 'clear'],
              description: 'Memory operation.',
            },
            key: {
              type: 'string',
              description: 'Memory key. Required for get/set/delete.',
            },
            value: {
              type: ['string', 'number', 'boolean', 'object', 'array', 'null'],
              description: 'JSON value. Required for set.',
            },
          },
          required: ['op'],
          additionalProperties: false,
        },
      },
    }
  }

  /** 声明函数直投 OpenAI tool：function.name 就是业务 functionName，arguments={path,args}。 */
  private buildDeclaredFunctionTools(): readonly AiModuleToolSpec[] {
    const modules = this.kinds.list()
    const nameCounts = new Map<string, number>()
    for (const moduleKind of modules) {
      for (const fn of moduleKind.functions) {
        if (!isDirectCallableFunction(fn.name, fn.directCallable)) continue
        nameCounts.set(fn.name, (nameCounts.get(fn.name) ?? 0) + 1)
      }
    }

    return modules.flatMap((moduleKind) => {
      const kindPath = resolveAiModulePath(moduleKind, modules)
      const pathPattern = kindPath.map((kind) => `/${kind}[<${kind}Id>]`).join('')
      return moduleKind.functions
        .filter((fn) => nameCounts.get(fn.name) === 1 && isDirectCallableFunction(fn.name, fn.directCallable))
        .map((fn) => this.buildDeclaredFunctionTool({
          functionName: fn.name,
          kind: moduleKind.kind,
          pathPattern,
          description: fn.description,
        }))
    })
  }

  private buildDeclaredFunctionTool(input: Readonly<{
    functionName: string
    kind: string
    pathPattern: string
    description: string
  }>): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: input.functionName,
        description: [
          `Call declared AiModule function "${input.functionName}" on kind "${input.kind}".`,
          input.description,
          `Use arguments={"path":"${input.pathPattern}","args":{...}}. Flat business fields at the root are coalesced into args at runtime.`,
          'Do not pass functionName in arguments; the OpenAI function name already is the business function name.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            path: pathProperty(),
            args: {
              type: 'object',
              description: `Business arguments for ${input.kind}.${input.functionName}. Read the exact schema with module_function_guide before calling.`,
              additionalProperties: true,
            },
          },
          required: ['path', 'args'],
          additionalProperties: true,
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

  /** agent_complete — 用函数调用收尾，保持工具生产线无正文。 */
  private buildAgentComplete(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.agentComplete,
        description: [
          'Complete the current agent production line after all required tool work is done.',
          'Use this instead of assistant prose when no more tools are needed. Keep summary short.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            summary: {
              type: 'string',
              description: 'Short final user-facing summary. Do not include implementation dumps.',
            },
          },
          required: ['summary'],
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

function isDirectFunctionToolName(name: string): boolean {
  if (isProtocolToolName(name)) return false
  return /^[A-Za-z0-9_-]{1,64}$/.test(name)
}

function isDirectCallableFunction(name: string, directCallable: boolean | undefined): boolean {
  return directCallable !== false && isDirectFunctionToolName(name)
}
