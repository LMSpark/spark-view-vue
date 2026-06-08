import type { AiJsonSchemaObject, AiJsonValue } from '../../json'
import type { ClassModelDocument } from '../class-model'
import {
  ClassModelKnowledgeService,
  type ComponentCatalogLike,
  type VcmNativeKnowledgeProvider,
} from '../knowledge'
import { VCM_NATIVE_TOOL_NAMES, isVcmNativeToolName, type VcmNativeToolName } from '../tools'

export type VcmNativeScriptCommand = Readonly<{
  script: string
  host?: unknown
}>

export type VcmNativeRuntimeOptions = Readonly<{
  document?: ClassModelDocument
  componentCatalog?: ComponentCatalogLike
  knowledge?: VcmNativeKnowledgeProvider
  scriptExecutor: VcmNativeScriptExecutor
}>

export type VcmNativeToolArgs = Readonly<Record<string, AiJsonValue>>

export type VcmNativeToolSpec = Readonly<{
  type: 'function'
  function: {
    readonly name: string
    readonly description: string
    readonly parameters: AiJsonSchemaObject
  }
}>

export type VcmNativeToolResult = Readonly<{
  ok: boolean
  data?: AiJsonValue
  checks?: readonly VcmNativeToolCheck[]
  state?: Readonly<Record<string, unknown>>
}>

export type VcmNativeToolCheck = Readonly<{
  level: 'error' | 'warn' | 'info'
  code: string
  message: string
  hint?: string
}>

export type VcmNativeScriptExecutorResult = AiJsonValue | VcmNativeToolResult

export type VcmNativeScriptExecutor =
  (command: VcmNativeScriptCommand) => VcmNativeScriptExecutorResult | Promise<VcmNativeScriptExecutorResult>

/**
 * VCM-native tool runtime。
 *
 * 这是 ClassModel 的运行时投影，不是旧 path/direct runtime 的新分支。
 * runtime 主要负责执行：暴露 7 个 OpenAI tools、校验参数、调度脚本执行器。
 * ClassModel 查询、索引和 guide 投影属于 knowledge 边界，可替换成 Web Worker provider。
 */
export class VcmNativeRuntime {
  private readonly knowledge: VcmNativeKnowledgeProvider
  private readonly scriptExecutor: VcmNativeScriptExecutor

  public constructor(options: VcmNativeRuntimeOptions) {
    this.knowledge = options.knowledge ?? createDefaultKnowledgeProvider(options)
    this.scriptExecutor = options.scriptExecutor
  }

  public getTools(): readonly VcmNativeToolSpec[] {
    return [
      buildVcmQueryTool(),
      buildVcmModelGuideTool(),
      buildVcmAttributeGuideTool(),
      buildVcmActionGuideTool(),
      buildVcmScriptTool(),
      buildHumanQuestionTool(),
      buildAgentCompleteTool(),
    ]
  }

  public async executeTool(
    toolName: string,
    rawArgs: VcmNativeToolArgs,
    host?: unknown,
  ): Promise<VcmNativeToolResult> {
    if (!isVcmNativeToolName(toolName)) {
      return failResult(
        'UNKNOWN_VCM_NATIVE_TOOL',
        `工具 "${toolName}" 未在 VCM-native 工具闭集中定义。`,
        `可用工具: ${Object.values(VCM_NATIVE_TOOL_NAMES).join(', ')}`,
      )
    }

    try {
      return await this.route(toolName, rawArgs, host)
    } catch (error) {
      if (error instanceof VcmNativeToolArgsError) {
        return failResult('INVALID_VCM_NATIVE_TOOL_ARGS', error.message, '请按工具 schema 补齐参数后重试。')
      }
      throw error
    }
  }

  private async route(
    toolName: VcmNativeToolName,
    args: VcmNativeToolArgs,
    host?: unknown,
  ): Promise<VcmNativeToolResult> {
    switch (toolName) {
      case VCM_NATIVE_TOOL_NAMES.query: {
        rejectUnknownArgs(toolName, args, ['kind', 'keyword', 'includeMembers'])
        return okResult(await this.knowledge.query({
          ...optionalStringProperty(args, 'kind'),
          ...optionalStringProperty(args, 'keyword'),
          includeMembers: args['includeMembers'] === true,
        }))
      }
      case VCM_NATIVE_TOOL_NAMES.modelGuide: {
        rejectUnknownArgs(toolName, args, ['kind'])
        return okResult(await this.knowledge.modelGuide({
          kind: requireString(args, 'kind'),
        }))
      }
      case VCM_NATIVE_TOOL_NAMES.attributeGuide: {
        rejectUnknownArgs(toolName, args, ['kind', 'attributeName'])
        return okResult(await this.knowledge.attributeGuide({
          kind: requireString(args, 'kind'),
          attributeName: requireString(args, 'attributeName'),
        }))
      }
      case VCM_NATIVE_TOOL_NAMES.actionGuide: {
        rejectUnknownArgs(toolName, args, ['kind', 'actionName', 'componentType'])
        return okResult(await this.knowledge.methodGuide({
          kind: requireString(args, 'kind'),
          methodName: requireString(args, 'actionName'),
          ...optionalStringProperty(args, 'componentType'),
        }))
      }
      case VCM_NATIVE_TOOL_NAMES.script: {
        rejectUnknownArgs(toolName, args, ['script'])
        return normalizeScriptExecutionResult(await this.scriptExecutor({
          script: requireString(args, 'script'),
          ...(host === undefined ? {} : { host }),
        }))
      }
      case VCM_NATIVE_TOOL_NAMES.humanQuestion: {
        rejectUnknownArgs(toolName, args, ['context', 'reason', 'missingFacts', 'candidateOptions'])
        return okResult({
          awaitingHuman: true,
          context: requireString(args, 'context'),
          reason: requireString(args, 'reason'),
          ...optionalStringArrayProperty(args, 'missingFacts'),
          ...optionalStringArrayProperty(args, 'candidateOptions'),
        })
      }
      case VCM_NATIVE_TOOL_NAMES.agentComplete: {
        rejectUnknownArgs(toolName, args, ['summary'])
        const summary = requireString(args, 'summary').trim()
        return okResult({
          completed: true,
          summary,
        }, undefined, {
          agentLifecycle: 'complete',
          finalAssistantMessage: summary,
        })
      }
    }
  }
}

class VcmNativeToolArgsError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'VcmNativeToolArgsError'
  }
}

function buildVcmQueryTool(): VcmNativeToolSpec {
  return toolSpec({
    name: VCM_NATIVE_TOOL_NAMES.query,
    description: 'Query the VCM-native ClassModel catalog before choosing model, attribute, or method guides.',
    properties: {
      kind: { type: 'string', description: 'Optional exact ClassModel kind.' },
      keyword: { type: 'string', description: 'Optional keyword matched against model/member names and summaries.' },
      includeMembers: { type: 'boolean', description: 'When true, include compact attribute and method summaries.' },
    },
  })
}

function createDefaultKnowledgeProvider(options: VcmNativeRuntimeOptions): VcmNativeKnowledgeProvider {
  if (options.document === undefined) {
    throw new Error('VcmNativeRuntime requires either knowledge provider or ClassModelDocument.')
  }
  return new ClassModelKnowledgeService({
    document: options.document,
    ...(options.componentCatalog === undefined ? {} : { componentCatalog: options.componentCatalog }),
  })
}

function buildVcmModelGuideTool(): VcmNativeToolSpec {
  return toolSpec({
    name: VCM_NATIVE_TOOL_NAMES.modelGuide,
    description: 'Render one ClassModel as d.ts-like declaration with native JSDoc.',
    properties: {
      kind: { type: 'string', description: 'ClassModel kind.' },
    },
    required: ['kind'],
  })
}

function buildVcmAttributeGuideTool(): VcmNativeToolSpec {
  return toolSpec({
    name: VCM_NATIVE_TOOL_NAMES.attributeGuide,
    description: 'Render one ClassModel attribute declaration with native JSDoc.',
    properties: {
      kind: { type: 'string', description: 'ClassModel kind.' },
      attributeName: { type: 'string', description: 'Attribute name.' },
    },
    required: ['kind', 'attributeName'],
  })
}

function buildVcmActionGuideTool(): VcmNativeToolSpec {
  return toolSpec({
    name: VCM_NATIVE_TOOL_NAMES.actionGuide,
    description: 'Render one ClassModel public action declaration with native JSDoc and optional component catalog props.',
    properties: {
      kind: { type: 'string', description: 'ClassModel kind.' },
      actionName: { type: 'string', description: 'Action name.' },
      componentType: { type: 'string', description: 'Optional component type, such as r-table, to merge catalog props knowledge.' },
    },
    required: ['kind', 'actionName'],
  })
}

function buildVcmScriptTool(): VcmNativeToolSpec {
  return toolSpec({
    name: VCM_NATIVE_TOOL_NAMES.script,
    description: 'Execute vcm_script through the injected business script executor after reading relevant guides.',
    properties: {
      script: { type: 'string', description: 'JavaScript body.' },
    },
    required: ['script'],
  })
}

function buildHumanQuestionTool(): VcmNativeToolSpec {
  return toolSpec({
    name: VCM_NATIVE_TOOL_NAMES.humanQuestion,
    description: 'Ask the human for missing facts or approval when guessing would be risky.',
    properties: {
      context: { type: 'string', description: 'What the agent is trying to complete.' },
      reason: { type: 'string', description: 'Why user input is needed.' },
      missingFacts: { type: 'array', items: { type: 'string' }, description: 'Missing facts, ordered by importance.' },
      candidateOptions: { type: 'array', items: { type: 'string' }, description: 'Optional choices.' },
    },
    required: ['context', 'reason'],
  })
}

function buildAgentCompleteTool(): VcmNativeToolSpec {
  return toolSpec({
    name: VCM_NATIVE_TOOL_NAMES.agentComplete,
    description: 'Complete the current VCM-native production line after all tool work is done.',
    properties: {
      summary: { type: 'string', description: 'Short final user-facing summary.' },
    },
    required: ['summary'],
  })
}

function toolSpec(input: Readonly<{
  name: VcmNativeToolName
  description: string
  properties: NonNullable<AiJsonSchemaObject['properties']>
  required?: readonly string[]
}>): VcmNativeToolSpec {
  return {
    type: 'function',
    function: {
      name: input.name,
      description: input.description,
      parameters: {
        type: 'object',
        properties: input.properties,
        required: input.required ?? [],
        additionalProperties: false,
      },
    },
  }
}

function okResult(
  data: AiJsonValue,
  checks?: readonly VcmNativeToolCheck[],
  state?: Readonly<Record<string, unknown>>,
): VcmNativeToolResult {
  return {
    ok: true,
    data,
    ...(checks === undefined || checks.length === 0 ? {} : { checks }),
    ...(state === undefined ? {} : { state }),
  }
}

function failResult(code: string, message: string, hint?: string): VcmNativeToolResult {
  return {
    ok: false,
    checks: [{
      level: 'error',
      code,
      message,
      ...(hint === undefined ? {} : { hint }),
    }],
  }
}

function normalizeScriptExecutionResult(result: VcmNativeScriptExecutorResult): VcmNativeToolResult {
  return isVcmNativeToolResult(result) ? result : okResult(result)
}

function isVcmNativeToolResult(value: VcmNativeScriptExecutorResult): value is VcmNativeToolResult {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof (value as Readonly<Record<string, unknown>>)['ok'] === 'boolean'
}

function requireString(args: VcmNativeToolArgs, key: string): string {
  const value = optionalString(args, key)
  if (value === undefined) throw new VcmNativeToolArgsError(`参数 "${key}" 缺失或非字符串。`)
  return value
}

function rejectUnknownArgs(
  toolName: VcmNativeToolName,
  args: VcmNativeToolArgs,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys)
  const extra = Object.keys(args).filter(key => !allowed.has(key)).sort()
  if (extra.length === 0) return
  const allowedText = allowedKeys.length === 0 ? '(none)' : allowedKeys.join(', ')
  throw new VcmNativeToolArgsError(
    `工具 "${toolName}" 不接受参数: ${extra.join(', ')}。允许参数: ${allowedText}。`,
  )
}

function optionalString(args: VcmNativeToolArgs, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function optionalStringProperty(args: VcmNativeToolArgs, key: string): Record<string, string> {
  const value = optionalString(args, key)
  return value === undefined ? {} : { [key]: value }
}

function optionalStringArrayProperty(args: VcmNativeToolArgs, key: string): Record<string, readonly string[]> {
  const value = args[key]
  if (value === undefined) return {}
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new VcmNativeToolArgsError(`参数 "${key}" 必须是字符串数组。`)
  }
  return { [key]: value }
}
