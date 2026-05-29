/**
 * ═══════════════════════════════════════════════════════════════
 * modules/runtime/protocol-tool-router.ts — 固定协议工具路由器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】modules 层的工具调用中央调度器。接收 LLM 发出的 tool_call，
 *   按 toolName 路由到对应的内部组件（Knowledge / Navigator / Attributes / Functions）。
 *   是 AiModuleRuntime.executeTool() 的核心实现。
 *
 * 【8 条路由】
 *   module_query   → knowledge.queryModules / queryFunctions
 *   module_guide   → knowledge.guideKind
 *   module_attribute_guide → knowledge.guideAttribute
 *   module_function_guide → knowledge.guideFunction
 *   module_find    → navigator.listChildren / findInstance
 *   module_attr    → attributes.get / attributes.set
 *   module_call    → functionInvoker.invoke
 *   human_question → knowledge.guideHumanQuestion
 *
 * 【错误处理】
 *   路径解析失败（AiModulePathParseError）→ INVALID_PATH_* 错误码
 *   参数校验失败（ProtocolToolArgsError）→ INVALID_TOOL_ARGS 错误码
 *   未知工具 → UNKNOWN_TOOL 错误码
 *
 * 【消费方】AiModuleRuntime.executeTool()（间接被 Host 层 tool-call-executor 消费）
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiJsonValue } from '../../json'
import type { FunctionInvoker } from '../internal/function-invoker'
import type { AttributeAccessor } from '../internal/attribute-accessor'
import type { Navigator } from '../internal/navigator'
import { PROTOCOL_TOOL_NAMES } from '../internal/protocol-tool-generator'
import type { AiModuleKnowledgeProjector } from '../knowledge/ai-module-knowledge'
import {
  AiModulePath,
  AiModulePathParseError,
  AiModuleResult,
  type AiModuleHostContext,
} from '../protocol'
import {
  ProtocolToolArgsError,
  ProtocolToolArgsParser,
  type ProtocolToolArgs,
} from './protocol-tool-args'
import { ProtocolResultProjector } from './protocol-result-projector'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · ProtocolToolRouter 类
// ═══════════════════════════════════════════════════════════════

/**
 * 固定协议工具路由器。
 *
 * 组合四个内部组件完成工具调用的完整分发：
 *   attributes — 属性读写（module_attr）
 *   functions  — 函数调用（module_call）
 *   navigator  — 实例导航（module_find）
 *   knowledge  — 知识投影（module_query / module_attribute_guide / module_function_guide / human_question）
 */
export class ProtocolToolRouter {
  private readonly argsParser = new ProtocolToolArgsParser()
  private readonly resultProjector = new ProtocolResultProjector()

  public constructor(
    private readonly attributes: AttributeAccessor,
    private readonly functions: FunctionInvoker,
    private readonly navigator: Navigator,
    private readonly knowledge: AiModuleKnowledgeProjector,
  ) {}

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
      if (!this.argsParser.isProtocolToolName(toolName)) {
        return AiModuleResult.failCode(
          'UNKNOWN_TOOL',
          `工具 "${toolName}" 未在固定 AI module 协议中定义`,
          `可用工具: ${Object.values(PROTOCOL_TOOL_NAMES).join(', ')}`,
        )
      }

      switch (toolName) {
        case PROTOCOL_TOOL_NAMES.moduleQuery: return this.routeModuleQuery(rawArgs)
        case PROTOCOL_TOOL_NAMES.moduleGuide: return this.routeModuleGuide(rawArgs)
        case PROTOCOL_TOOL_NAMES.moduleAttributeGuide: return this.routeModuleAttributeGuide(rawArgs)
        case PROTOCOL_TOOL_NAMES.moduleFunctionGuide: return this.routeModuleFunctionGuide(rawArgs)
        case PROTOCOL_TOOL_NAMES.moduleFind: return await this.routeModuleFind(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.moduleAttr: return await this.routeModuleAttr(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.moduleCall: return await this.routeModuleCall(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.humanQuestion: return this.routeHumanQuestion(rawArgs)
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
    return this.resultProjector.jsonResult(this.knowledge.guideAttribute({
      kind: this.argsParser.requireString(args, 'kind'),
      attrName: this.argsParser.requireString(args, 'attrName'),
    }))
  }

  // ── module_function_guide — 读取函数指南 ──────────────────────

  /** 路由 module_function_guide：kind + functionName 均必填，读取函数完整契约 */
  private routeModuleFunctionGuide(args: ProtocolToolArgs): AiModuleResult<AiJsonValue> {
    return this.resultProjector.jsonResult(this.knowledge.guideFunction({
      kind: this.argsParser.requireString(args, 'kind'),
      functionName: this.argsParser.requireString(args, 'functionName'),
    }))
  }

  // ── module_find — 查找/列出实例 ──────────────────────────────

  /** 路由 module_find：有 query → findInstance；无 query → listChildren */
  private async routeModuleFind(
    args: ProtocolToolArgs,
    host?: AiModuleHostContext,
  ): Promise<AiModuleResult<AiJsonValue>> {
    const path = AiModulePath.parse(this.argsParser.requireString(args, 'path'))
    const childKind = this.argsParser.optionalString(args, 'childKind')
    if ('query' in args) {
      if (childKind === undefined) {
        throw new ProtocolToolArgsError('参数 "childKind" 缺失: module_find 使用 query 时必须指定 childKind')
      }
      const result = await this.navigator.findInstance({
        path,
        childKind,
        query: this.argsParser.requireObject(args, 'query'),
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

  // ── module_call — 函数调用 ──────────────────────────────────

  /** 路由 module_call：解析路径 → 校验非根路径 → 委托 functionInvoker */
  private async routeModuleCall(
    args: ProtocolToolArgs,
    host?: AiModuleHostContext,
  ): Promise<AiModuleResult<AiJsonValue>> {
    const path = AiModulePath.parse(this.argsParser.requireString(args, 'path'))
    const functionName = this.argsParser.requireString(args, 'functionName')
    const callArgs = this.argsParser.requireObject(args, 'args')
    const kindPath = path.segments.map((segment) => segment.kind)
    if (kindPath.length === 0) {
      return AiModuleResult.failCode(
        'INVALID_TOOL_ARGS',
        'module_call.path 必须指向具体模块实例，不能使用根路径 "/"',
        '先用 module_find 定位实例 path，再调用 module_call。',
      )
    }
    return this.functions.invoke({
      path,
      kindPath,
      functionName,
      args: callArgs,
      ...(host === undefined ? {} : { host }),
    })
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
}
