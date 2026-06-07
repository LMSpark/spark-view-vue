/**
 * ═══════════════════════════════════════════════════════════════
 * modules/runtime/protocol-tool-router.ts — 固定协议工具路由器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】modules 层的工具调用中央调度器。接收 LLM 发出的 tool_call，
 *   按 toolName 路由到对应的内部组件（Knowledge / Navigator / Attributes / Functions）。
 *   是 AiModuleRuntime.executeTool() 的核心实现。
 *
 * 【路由】
 *   module_query   → knowledge.queryModules / queryFunctions
 *   module_guide   → knowledge.guideKind
 *   module_attribute_guide → knowledge.guideAttribute
 *   module_function_guide → knowledge.guideFunction
 *   module_find    → navigator.listChildren / findInstance
 *   module_attr    → attributes.get / attributes.set
 *   module_call    → functionInvoker.invoke（兼容旧协议）
 *   module_memory  → runtime-local scoped scratchpad
 *   <functionName> → functionInvoker.invoke（OpenAI direct function protocol: arguments={path,args}）
 *   human_question → knowledge.guideHumanQuestion
 *   agent_complete → 工具化收尾，避免自然语言正文完成
 *
 * 【错误处理】
 *   路径解析失败（AiModulePathParseError）→ INVALID_PATH_* 错误码
 *   参数校验失败（ProtocolToolArgsError）→ INVALID_TOOL_ARGS 错误码
 *   未知工具 → UNKNOWN_TOOL 错误码
 *
 * 【消费方】AiModuleRuntime.executeTool()（间接被 Host 层 tool-call-executor 消费）
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiJsonParams, AiJsonValue } from '../../json'
import type { AiModuleRegistry } from '../internal/ai-module-registry'
import type { FunctionInvoker } from '../internal/function-invoker'
import type { AttributeAccessor } from '../internal/attribute-accessor'
import type { Navigator } from '../internal/navigator'
import { PROTOCOL_TOOL_NAMES, isProtocolToolName } from '../internal/protocol-tool-generator'
import type { AiModuleKnowledgeProjector } from '../knowledge/ai-module-knowledge'
import {
  AiModulePath,
  AiModulePathParseError,
  AiModuleResult,
  type AiModule,
  type AiModulePathContext,
  type AiModuleHostContext,
} from '../protocol'
import {
  ProtocolToolArgsError,
  ProtocolToolArgsParser,
  type ProtocolToolArgs,
} from './protocol-tool-args'
import { ProtocolResultProjector } from './protocol-result-projector'
import { executeModuleScript, type AiModuleScriptContext } from './module-script-sandbox'

type ProtocolToolRouterOptions = Readonly<{
  attributes: AttributeAccessor
  functions: FunctionInvoker
  navigator: Navigator
  knowledge: AiModuleKnowledgeProjector
  kinds: AiModuleRegistry
  handleToolDispatcher?: AiModuleHandleToolDispatcher
}>

export type AiModuleHandleToolDispatchCommand = Readonly<{
  handleId: string
  actionName: string
  args: AiJsonParams
  ctx: AiModulePathContext
}>

export type AiModuleHandleToolDispatcher = Readonly<{
  dispatchHandle(command: AiModuleHandleToolDispatchCommand): Promise<AiModuleResult<AiJsonValue>>
}>

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · ProtocolToolRouter 类
// ═══════════════════════════════════════════════════════════════

/**
 * 固定协议工具路由器。
 *
 * 组合四个内部组件完成工具调用的完整分发：
 *   attributes — 属性读写（module_attr）
 *   functions  — 函数调用（module_call 兼容旧协议；业务函数名直连为标准协议）
 *   navigator  — 实例导航（module_find）
 *   knowledge  — 知识投影（module_query / module_attribute_guide / module_function_guide / human_question）
 */
export class ProtocolToolRouter {
  private readonly argsParser = new ProtocolToolArgsParser()
  private readonly resultProjector = new ProtocolResultProjector()
  private readonly attributes: AttributeAccessor
  private readonly functions: FunctionInvoker
  private readonly navigator: Navigator
  private readonly knowledge: AiModuleKnowledgeProjector
  private readonly kinds: AiModuleRegistry
  private readonly memoryByScope = new Map<string, Map<string, AiJsonValue>>()
  private handleToolDispatcher?: AiModuleHandleToolDispatcher

  public constructor(options: ProtocolToolRouterOptions) {
    this.attributes = options.attributes
    this.functions = options.functions
    this.navigator = options.navigator
    this.knowledge = options.knowledge
    this.kinds = options.kinds
    if (options.handleToolDispatcher !== undefined) {
      this.handleToolDispatcher = options.handleToolDispatcher
    }
  }

  /**
   * 执行工具调用。
   *
   * 流程：校验工具名 → 按 toolName 分发 → 统一错误处理。
   * 路径解析和参数校验异常被捕获并转为友好的 AiModuleResult 错误。
   */
  public async execute(
    toolName: string,
    rawArgs: ProtocolToolArgs,
    host?: AiModuleHostContext,
  ): Promise<AiModuleResult<AiJsonValue>> {
    try {
      if (toolName === 'module_handle_call') {
        return await this.routeModuleHandleCall(rawArgs, host)
      }
      if (!this.argsParser.isProtocolToolName(toolName)) {
        if (!this.isDirectFunctionToolName(toolName)) {
          return AiModuleResult.failCode(
            'UNKNOWN_TOOL',
            `工具 "${toolName}" 未在 AI module 协议或已声明业务函数中定义`,
            `可用协议工具: ${Object.values(PROTOCOL_TOOL_NAMES).join(', ')}；业务函数请先 module_query({ includeFunctions: true }) 查询。`,
          )
        }
        return await this.routeDirectModuleFunction(toolName, rawArgs, host)
      }

      switch (toolName) {
        case PROTOCOL_TOOL_NAMES.moduleQuery: return this.routeModuleQuery(rawArgs)
        case PROTOCOL_TOOL_NAMES.moduleGuide: return this.routeModuleGuide(rawArgs)
        case PROTOCOL_TOOL_NAMES.moduleAttributeGuide: return this.routeModuleAttributeGuide(rawArgs)
        case PROTOCOL_TOOL_NAMES.moduleFunctionGuide: return this.routeModuleFunctionGuide(rawArgs)
        case PROTOCOL_TOOL_NAMES.moduleFind: return await this.routeModuleFind(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.moduleAttr: return await this.routeModuleAttr(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.moduleCall: return await this.routeModuleCall(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.moduleScript: return await this.routeModuleScript(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.moduleMemory: return this.routeModuleMemory(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.humanQuestion: return this.routeHumanQuestion(rawArgs)
        case PROTOCOL_TOOL_NAMES.agentComplete: return this.routeAgentComplete(rawArgs)
      }
    } catch (error) {
      if (error instanceof AiModulePathParseError) {
        return AiModuleResult.failCode(
          `INVALID_PATH_${error.code}`,
          `路径解析失败: ${error.message}`,
          '路径语法: / 或 /<kind>[<id>]/<kind>[<id>]/...',
        )
      }
      if (error instanceof ProtocolToolArgsError) {
        return AiModuleResult.failCode('INVALID_TOOL_ARGS', error.message, '请按工具描述补齐参数后重试')
      }
      throw error
    }
  }

  private async routeModuleHandleCall(
    args: ProtocolToolArgs,
    host?: AiModuleHostContext,
  ): Promise<AiModuleResult<AiJsonValue>> {
    if (this.handleToolDispatcher === undefined) {
      return AiModuleResult.failCode(
        'HANDLE_TOOL_NOT_REGISTERED',
        '当前 runtime 未注册 module_handle_call',
        '当前注册流程未启用 handle dispatcher；请改用 module_query/module_function_guide 查看元数据，或使用声明函数/脚本执行通道。',
      )
    }
    return this.handleToolDispatcher.dispatchHandle({
      handleId: this.argsParser.requireString(args, 'handleId'),
      actionName: this.argsParser.requireString(args, 'actionName'),
      args: this.argsParser.optionalObject(args, 'args'),
      ctx: {
        segments: [],
        ...(host === undefined ? {} : { host }),
      },
    })
  }

  // ── module_query — 查询模块目录 ──────────────────────────────

  /** 路由 module_query：可选 kind / parentKind / keyword 过滤，可选 includeFunctions 返回函数摘要 */
  private routeModuleQuery(args: ProtocolToolArgs): AiModuleResult<AiJsonValue> {
    const kind = this.argsParser.optionalString(args, 'kind')
    const parentKind = this.argsParser.optionalString(args, 'parentKind')
    const keyword = this.argsParser.optionalString(args, 'keyword')
    const moduleFilter = {
      ...(kind === undefined ? {} : { kind }),
      ...(parentKind === undefined ? {} : { parentKind }),
      ...(keyword === undefined ? {} : { keyword }),
    }
    const modules = this.knowledge.queryModules(moduleFilter)
    if (args['includeFunctions'] === true) {
      return this.resultProjector.jsonResult(AiModuleResult.ok({
        modules,
        functions: this.knowledge.queryFunctions({
          ...(kind === undefined ? {} : { kind }),
          ...(keyword === undefined ? {} : { keyword }),
        }),
      }))
    }
    return this.resultProjector.jsonResult(AiModuleResult.ok(modules))
  }

  // ── module_guide — 读取模块指南 ─────────────────────────────

  /** 路由 module_guide：读取 kind 轻量指南；函数细节交给 module_function_guide */
  private routeModuleGuide(args: ProtocolToolArgs): AiModuleResult<AiJsonValue> {
    const kind = this.argsParser.requireString(args, 'kind')
    const functionName = this.argsParser.optionalString(args, 'functionName')
    if (functionName !== undefined) {
      return AiModuleResult.failCode(
        'INVALID_TOOL_ARGS',
        'module_guide only accepts { kind } and does not return function contracts.',
        `Call module_function_guide({ kind: "${kind}", functionName: "${functionName}" }) for paramsSchema, usageRules and failureModes.`,
      )
    }
    return this.resultProjector.jsonResult(this.knowledge.guideKind(kind))
  }

  // ── module_attribute_guide — 读取属性指南 ────────────────────

  /** 路由 module_attribute_guide：kind + attrName 均必填，读取属性完整契约 */
  private routeModuleAttributeGuide(args: ProtocolToolArgs): AiModuleResult<AiJsonValue> {
    const property = this.argsParser.optionalString(args, 'property')
    return this.resultProjector.jsonResult(this.knowledge.guideAttribute({
      kind: this.argsParser.requireString(args, 'kind'),
      attrName: this.argsParser.requireString(args, 'attrName'),
      ...(property === undefined ? {} : { property }),
    }))
  }

  // ── module_function_guide — 读取函数指南 ──────────────────────

  /** 路由 module_function_guide：kind + functionName 均必填，读取函数完整契约 */
  private routeModuleFunctionGuide(args: ProtocolToolArgs): AiModuleResult<AiJsonValue> {
    const normalized = normalizeModuleFunctionGuideArgs(args)
    const functionName = this.argsParser.requireString(normalized, 'functionName')
    if (isProtocolToolName(functionName)) {
      return AiModuleResult.failCode(
        'INVALID_TOOL_ARGS',
        `"${functionName}" 是协议工具名，不是业务 functionName。`,
        '先用 module_query({ includeFunctions: true }) 选择真实 functionName（如 openPageDesign、readPlanningProjection）。',
      )
    }
    return this.resultProjector.jsonResult(this.knowledge.guideFunction({
      kind: this.argsParser.requireString(normalized, 'kind'),
      functionName,
    }))
  }

  // ── module_find — 查找/列出实例 ──────────────────────────────

  /** 路由 module_find：有 query → findInstance；无 query → listChildren */
  private async routeModuleFind(
    args: ProtocolToolArgs,
    host?: AiModuleHostContext,
  ): Promise<AiModuleResult<AiJsonValue>> {
    const normalized = normalizeModuleFindArgs(args, host)
    const path = AiModulePath.parse(this.argsParser.requireString(normalized, 'path'))
    const childKind = this.argsParser.optionalString(normalized, 'childKind')
    if ('query' in normalized) {
      if (childKind === undefined) {
        throw new ProtocolToolArgsError('参数 "childKind" 缺失: module_find 使用 query 时必须指定 childKind')
      }
      const result = await this.navigator.findInstance({
        path,
        childKind,
        query: this.argsParser.requireObject(normalized, 'query'),
        ...(host === undefined ? {} : { host }),
      })
      return this.resultProjector.instanceListResult(result)
    }

    const result = await this.navigator.listChildren(path, childKind, host)
    return this.resultProjector.instanceListResult(result)
  }

  // ── module_attr — 属性读写 ──────────────────────────────────

  /** 路由 module_attr：op="get" → 读取属性；op="set" → 写入属性 */
  private async routeModuleAttr(
    args: ProtocolToolArgs,
    host?: AiModuleHostContext,
  ): Promise<AiModuleResult<AiJsonValue>> {
    const op = this.argsParser.requireString(args, 'op')
    const path = AiModulePath.parse(this.argsParser.requireString(args, 'path'))
    const attrName = this.argsParser.requireString(args, 'attrName')
    if (op === 'get') {
      return this.attributes.get(path, attrName, host)
    }
    if (op !== 'set') {
      throw new ProtocolToolArgsError('参数 "op" 必须是 "get" 或 "set"')
    }
    const result = await this.attributes.set({
      path,
      attrName,
      value: this.argsParser.requireValue(args, 'value'),
      ...(host === undefined ? {} : { host }),
    })
    return this.resultProjector.voidResult(result)
  }

  // ── module_call — 兼容函数调用 ───────────────────────────────

  /** 路由 module_call：兼容旧协议，解析路径 → 校验非根路径 → 委托 functionInvoker */
  private async routeModuleCall(
    args: ProtocolToolArgs,
    host?: AiModuleHostContext,
  ): Promise<AiModuleResult<AiJsonValue>> {
    const normalized = normalizeModuleCallArgs(args, host, this.kinds)
    const path = AiModulePath.parse(this.argsParser.requireString(normalized, 'path'))
    const functionName = this.argsParser.requireString(normalized, 'functionName')
    const callArgs = this.argsParser.requireObject(normalized, 'args')
    const kindPath = path.segments.map((segment) => segment.kind)
    if (kindPath.length === 0) {
      return AiModuleResult.failCode(
        'INVALID_TOOL_ARGS',
        'module_call.path 必须指向具体模块实例，不能使用根路径 "/"',
        '先用 module_find 定位实例 path，再调用目标 direct function；旧协议兼容场景使用 module_call 路由。',
      )
    }
    const result = await this.functions.invoke({
      path,
      kindPath,
      functionName,
      args: callArgs,
      ...(host === undefined ? {} : { host }),
    })
    return result
  }

  private async routeModuleScript(
    args: ProtocolToolArgs,
    host?: AiModuleHostContext,
  ): Promise<AiModuleResult<AiJsonValue>> {
    const normalized = normalizeModuleScriptArgs(args)
    const script = this.argsParser.requireString(normalized, 'script')
    const pathRaw = this.argsParser.optionalString(normalized, 'path')
    if (pathRaw !== undefined) {
      const path = AiModulePath.parse(pathRaw)
      const navResult = await this.navigator.navigate(path, host)
      if (navResult instanceof AiModuleResult) {
        return navResult
      }
      return executeModuleScript(
        script,
        this.createScriptContext(host, navResult.moduleKind, navResult.segmentCtx),
      )
    }
    return executeModuleScript(script, this.createScriptContext(host))
  }

  private routeModuleMemory(args: ProtocolToolArgs, host?: AiModuleHostContext): AiModuleResult<AiJsonValue> {
    const op = this.argsParser.requireString(args, 'op')
    const memory = this.memoryForHost(host)
    if (op === 'list') {
      return AiModuleResult.ok({ keys: Array.from(memory.keys()) })
    }
    if (op === 'clear') {
      const count = memory.size
      memory.clear()
      return AiModuleResult.ok({ cleared: count })
    }
    const key = this.argsParser.requireString(args, 'key')
    if (op === 'get') {
      return AiModuleResult.ok({
        key,
        found: memory.has(key),
        value: memory.get(key) ?? null,
      })
    }
    if (op === 'set') {
      const value = this.argsParser.requireValue(args, 'value')
      memory.set(key, value)
      return AiModuleResult.ok({ key, value })
    }
    if (op === 'delete') {
      return AiModuleResult.ok({ key, deleted: memory.delete(key) })
    }
    throw new ProtocolToolArgsError('参数 "op" 必须是 get/set/delete/list/clear')
  }

  private createScriptContext(
    host?: AiModuleHostContext,
    moduleKind?: AiModule,
    segmentCtx?: AiModulePathContext,
  ): AiModuleScriptContext {
    const moduleContext = moduleKind !== undefined && segmentCtx !== undefined
      ? moduleKind.createScriptContext(segmentCtx)
      : this.createProviderScriptContext(host)
    const memory = this.createScriptMemory(host)
    const helpers = {
      module_query: (args: ProtocolToolArgs = {}) => this.routeModuleQuery(args),
      module_guide: (args: ProtocolToolArgs) => this.routeModuleGuide(args),
      module_attribute_guide: (args: ProtocolToolArgs) => this.routeModuleAttributeGuide(args),
      module_function_guide: (args: ProtocolToolArgs) => this.routeModuleFunctionGuide(args),
      module_find: (args: ProtocolToolArgs) => this.routeModuleFind(args, host),
      module_attr: (args: ProtocolToolArgs) => this.routeModuleAttr(args, host),
      module_call: (args: ProtocolToolArgs) => this.routeModuleCall(args, host),
      module_memory: (args: ProtocolToolArgs) => this.routeModuleMemory(args, host),
      call: (functionName: string, args: ProtocolToolArgs) => this.routeDirectModuleFunction(functionName, args, host),
    }
    return {
      ...helpers,
      $tools: helpers,
      memory,
      ...moduleContext,
    }
  }

  private createScriptMemory(host?: AiModuleHostContext): Readonly<Record<string, unknown>> {
    const memory = this.memoryForHost(host)
    return {
      get: (key: string): AiJsonValue | undefined => memory.get(key),
      set: (key: string, value: AiJsonValue): AiJsonValue => {
        memory.set(key, value)
        return value
      },
      delete: (key: string): boolean => memory.delete(key),
      list: (): readonly string[] => Array.from(memory.keys()),
      clear: (): number => {
        const count = memory.size
        memory.clear()
        return count
      },
      snapshot: (): Readonly<Record<string, AiJsonValue>> => Object.fromEntries(memory.entries()),
    }
  }

  private memoryForHost(host?: AiModuleHostContext): Map<string, AiJsonValue> {
    const key = host === undefined
      ? '__default__'
      : `${host.moduleId}\u0000${host.moduleInstanceId}\u0000${host.instanceId}`
    let memory = this.memoryByScope.get(key)
    if (memory === undefined) {
      memory = new Map<string, AiJsonValue>()
      this.memoryByScope.set(key, memory)
    }
    return memory
  }

  private createProviderScriptContext(host?: AiModuleHostContext): Readonly<Record<string, unknown>> {
    const moduleKind = this.resolveScriptModule(host)
    if (moduleKind === undefined) return {}
    return moduleKind.createScriptContext({
      segments: [],
      ...(host === undefined ? {} : { host }),
    })
  }

  private resolveScriptModule(host?: AiModuleHostContext) {
    if (host !== undefined) {
      const registered = this.kinds.get(host.moduleId)
      if (registered !== undefined) return registered
    }
    const rootKinds = this.kinds.list().filter(moduleKind => moduleKind.parentKind === undefined)
    if (rootKinds.length === 1) return rootKinds[0]
    const projectKind = rootKinds.find(moduleKind => moduleKind.kind === 'project')
    if (projectKind !== undefined) return projectKind
    return rootKinds[0]
  }

  // ── <functionName> — 标准 OpenAI 业务函数调用 ────────────────

  /** 路由直接业务函数：tool_call.function.name 就是 functionName，arguments={path,args}。 */
  private async routeDirectModuleFunction(
    functionName: string,
    args: ProtocolToolArgs,
    host?: AiModuleHostContext,
  ): Promise<AiModuleResult<AiJsonValue>> {
    const normalized = normalizeDirectFunctionCallArgs(args, host, this.kinds, functionName)
    const path = AiModulePath.parse(this.argsParser.requireString(normalized, 'path'))
    const callArgs = this.argsParser.requireObject(normalized, 'args')
    const kindPath = path.segments.map((segment) => segment.kind)
    if (kindPath.length === 0) {
      return AiModuleResult.failCode(
        'INVALID_TOOL_ARGS',
        `${functionName}.path 必须指向具体模块实例，不能使用根路径 "/"`,
        '先用 module_find 定位实例 path，再调用具体业务函数。',
      )
    }
    const result = await this.functions.invoke({
      path,
      kindPath,
      functionName,
      args: callArgs,
      ...(host === undefined ? {} : { host }),
    })
    return result
  }

  // ── human_question — 人工提问 ───────────────────────────────

  /** 路由 human_question：委托 knowledge.guideHumanQuestion 生成结构化提问指南 */
  private routeHumanQuestion(args: ProtocolToolArgs): AiModuleResult<AiJsonValue> {
    const missingFacts = this.argsParser.optionalStringArray(args, 'missingFacts')
    const candidateOptions = this.argsParser.optionalStringArray(args, 'candidateOptions')
    return this.resultProjector.jsonResult(this.knowledge.guideHumanQuestion({
      context: this.argsParser.requireString(args, 'context'),
      reason: this.argsParser.requireString(args, 'reason'),
      ...(missingFacts === undefined ? {} : { missingFacts }),
      ...(candidateOptions === undefined ? {} : { candidateOptions }),
    }))
  }

  // ── agent_complete — 工具化完成当前生产线 ───────────────────

  private routeAgentComplete(args: ProtocolToolArgs): AiModuleResult<AiJsonValue> {
    const summary = this.argsParser.requireString(args, 'summary').trim()
    return AiModuleResult.ok({
      completed: true,
      summary,
    }, undefined, {
      agentLifecycle: 'complete',
      finalAssistantMessage: summary,
    })
  }

  private isDirectFunctionToolName(toolName: string): boolean {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(toolName)) return false
    let count = 0
    for (const moduleKind of this.kinds.list()) {
      for (const fn of moduleKind.functions) {
        if (fn.name === toolName) count += 1
      }
    }
    return count === 1
  }

}

const DIRECT_FUNCTION_RESERVED_KEYS = new Set(['path', 'args'])
const MODULE_CALL_RESERVED_KEYS = new Set(['path', 'functionName', 'args'])
const MODULE_FIND_RESERVED_KEYS = new Set(['path', 'childKind', 'query'])

/** LLM 常把业务参数摊平在根级；归一化为 { path, args } 形状。 */
function normalizeDirectFunctionCallArgs(
  args: ProtocolToolArgs,
  host: AiModuleHostContext | undefined,
  kinds: AiModuleRegistry,
  functionName?: string,
): ProtocolToolArgs {
  const pathRaw = readOptionalString(args, 'path')
  const nestedArgs = readOptionalObject(args, 'args')
  const hasNestedArgs = nestedArgs !== undefined && !isEmptyJsonObject(nestedArgs)

  if (hasNestedArgs) {
    const callArgs = nestedArgs
    if (pathRaw !== undefined) return args
    const inferredPath = inferDefaultDirectFunctionPath(host, kinds, functionName)
    return inferredPath === undefined
      ? { args: callArgs }
      : { path: inferredPath, args: callArgs }
  }

  let businessArgs = pickNonReservedFields(args, DIRECT_FUNCTION_RESERVED_KEYS)
  if (Object.keys(businessArgs).length === 0 && functionName !== undefined) {
    const defaults = applyHostDefaultCallArgs(functionName, host)
    if (defaults !== undefined) businessArgs = defaults
  }
  if (Object.keys(businessArgs).length === 0) return args

  const inferredPath = pathRaw ?? inferDefaultDirectFunctionPath(host, kinds, functionName)
  if (inferredPath === undefined) {
    return { args: businessArgs }
  }
  return { path: inferredPath, args: businessArgs }
}

function applyHostDefaultCallArgs(
  functionName: string,
  host: AiModuleHostContext | undefined,
): AiJsonParams | undefined {
  if (host === undefined) return undefined
  if (functionName === 'openPageDesign') {
    return { pageId: host.moduleInstanceId }
  }
  if (functionName === 'readPlanningProjection') {
    return {}
  }
  return undefined
}


function isEmptyJsonObject(value: AiJsonParams): boolean {
  return Object.keys(value).length === 0
}

/** module_call 常见误传：{ path, functionName, pageId } 缺 args 包装。 */
function normalizeModuleCallArgs(
  args: ProtocolToolArgs,
  host: AiModuleHostContext | undefined,
  kinds: AiModuleRegistry,
): ProtocolToolArgs {
  const functionName = readOptionalString(args, 'functionName')
  const pathRaw = readOptionalString(args, 'path')
  const nestedArgs = readOptionalObject(args, 'args')
  if (nestedArgs !== undefined && Object.keys(nestedArgs).length > 0) {
    if (pathRaw !== undefined && functionName !== undefined) return args
    const inferredPath = pathRaw ?? inferDefaultDirectFunctionPath(host, kinds, functionName)
    if (inferredPath === undefined || functionName === undefined) return args
    return { path: inferredPath, functionName, args: nestedArgs }
  }

  const businessArgs = pickNonReservedFields(args, MODULE_CALL_RESERVED_KEYS)
  if (Object.keys(businessArgs).length === 0) return args

  const inferredPath = pathRaw ?? inferDefaultDirectFunctionPath(host, kinds, functionName)
  const normalized: Record<string, AiJsonValue> = { args: businessArgs }
  if (functionName !== undefined) normalized['functionName'] = functionName
  if (inferredPath !== undefined) normalized['path'] = inferredPath
  return normalized
}

/** module_find 常见误传：{ path, childKind, id } 缺 query 包装；根查找缺 path 时默认 "/"。 */
function normalizeModuleFindArgs(
  args: ProtocolToolArgs,
  host?: AiModuleHostContext,
): ProtocolToolArgs {
  let normalized = args
  if (readOptionalObject(args, 'query') === undefined) {
    const childKind = readOptionalString(args, 'childKind')
    if (childKind !== undefined) {
      const queryFields = pickNonReservedFields(args, MODULE_FIND_RESERVED_KEYS)
      if (Object.keys(queryFields).length > 0) {
        normalized = {
          ...(readOptionalString(args, 'path') === undefined ? {} : { path: args['path'] }),
          childKind,
          query: queryFields,
        }
      } else if ('query' in args) {
        const withoutInvalidQuery: Record<string, AiJsonValue> = {}
        for (const [key, value] of Object.entries(args)) {
          if (key === 'query') continue
          withoutInvalidQuery[key] = value
        }
        normalized = withoutInvalidQuery
      }
    }
  }

  const childKind = readOptionalString(normalized, 'childKind')
  if (readOptionalObject(normalized, 'query') === undefined && childKind !== undefined) {
    const defaultQuery = defaultRootFindQuery(childKind, host)
    if (defaultQuery !== undefined) {
      normalized = { ...normalized, query: defaultQuery }
    }
  }

  if (readOptionalString(normalized, 'path') === undefined
    && (readOptionalString(normalized, 'childKind') !== undefined || readOptionalObject(normalized, 'query') !== undefined)) {
    return { ...normalized, path: '/' }
  }
  return normalized
}

function defaultRootFindQuery(
  childKind: string,
  host?: AiModuleHostContext,
): AiJsonParams | undefined {
  if (childKind === 'project' && host !== undefined && host.moduleInstanceId.trim().length > 0) {
    return { id: host.moduleInstanceId }
  }
  return undefined
}

function inferDefaultDirectFunctionPath(
  host: AiModuleHostContext | undefined,
  kinds: AiModuleRegistry,
  functionName?: string,
): string | undefined {
  if (functionName !== undefined) {
    const ownerKind = findUniqueKindDeclaringFunction(kinds, functionName)
    if (ownerKind !== undefined) {
      return `/${ownerKind.kind}[${defaultInstanceIdForKind(ownerKind, host)}]`
    }
  }
  if (host === undefined) return undefined
  const registered = kinds.get(host.moduleId)
  if (registered !== undefined && registered.parentKind === undefined) {
    return `/${registered.kind}[${host.moduleInstanceId}]`
  }
  const projectKind = kinds.list().find(moduleKind => moduleKind.kind === 'project' && moduleKind.parentKind === undefined)
  if (projectKind !== undefined) {
    return `/project[${host.moduleInstanceId}]`
  }
  const rootKinds = kinds.list().filter(moduleKind => moduleKind.parentKind === undefined)
  const soleRoot = rootKinds.length === 1 ? rootKinds[0] : undefined
  if (soleRoot !== undefined) {
    return `/${soleRoot.kind}[${host.moduleInstanceId}]`
  }
  return undefined
}

function findUniqueKindDeclaringFunction(
  kinds: AiModuleRegistry,
  functionName: string,
): AiModule | undefined {
  let match: AiModule | undefined
  for (const moduleKind of kinds.list()) {
    if (!moduleKind.functions.some(fn => fn.name === functionName)) continue
    if (match !== undefined) return undefined
    match = moduleKind
  }
  return match
}

function defaultInstanceIdForKind(
  moduleKind: AiModule,
  host: AiModuleHostContext | undefined,
): string {
  if (host !== undefined && host.moduleInstanceId.trim().length > 0) {
    return host.moduleInstanceId
  }
  return moduleKind.kind
}

/** module_script 常见误传：code 字段代替 script。 */
function normalizeModuleScriptArgs(args: ProtocolToolArgs): ProtocolToolArgs {
  if (readOptionalString(args, 'script') !== undefined) return args
  const code = readOptionalString(args, 'code') ?? readOptionalString(args, 'javascript')
  if (code === undefined) return args
  return { ...args, script: code }
}

/** module_function_guide 常见误传：name / fn 代替 functionName。 */
function normalizeModuleFunctionGuideArgs(args: ProtocolToolArgs): ProtocolToolArgs {
  if (readOptionalString(args, 'functionName') !== undefined) return args
  const alias = readOptionalString(args, 'name') ?? readOptionalString(args, 'fn')
  if (alias === undefined) return args
  return { ...args, functionName: alias }
}

function pickNonReservedFields(
  args: ProtocolToolArgs,
  reserved: ReadonlySet<string>,
): AiJsonParams {
  const out: Record<string, AiJsonValue> = {}
  for (const [key, value] of Object.entries(args)) {
    if (reserved.has(key)) continue
    out[key] = value
  }
  return out
}

function readOptionalString(args: ProtocolToolArgs, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readOptionalObject(args: ProtocolToolArgs, key: string): AiJsonParams | undefined {
  const value = args[key]
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value
}
