/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MODULE-SEMANTIC · 协议工具路由器                                             │
 * │  Protocol Tool Router                                                         │
 * │                                                                              │
 * │  本模块将 LLM 发起的协议工具调用（toolName + rawArgs）路由到具体的内部组件。    │
 * │                                                                              │
 * │  路由表：                                                                      │
 * │    queryModules  → KnowledgeProjector.queryModules()                         │
 * │    queryFunctions→ KnowledgeProjector.queryFunctions(filter)                  │
 * │    guideFunction → KnowledgeProjector.guideFunction(input)                    │
 * │    guideHumanQuestion → KnowledgeProjector.guideHumanQuestion(input)          │
 * │    getAttribute  → AttributeAccessor.get(path, attrName)                     │
 * │    setAttribute  → AttributeAccessor.set(path, attrName, value)              │
 * │    invokeAction  → ActionInvoker.invoke(path, actionName, args)              │
 * │    listChildren  → Navigator.listChildren(path, childKind)                   │
 * │    findInstance  → Navigator.findInstance(path, childKind, query)            │
 * │    describeKind  → Navigator.describeKind(kind)                              │
 * │                                                                              │
 * │  错误包装：                                                                   │
 * │    · ModulePathParseError → INVALID_PATH_{code} (路径语法错误)                │
 * │    · ProtocolToolArgsError → INVALID_TOOL_ARGS (参数缺失/类型错误)            │
 * │                                                                              │
 * │  调用方：ModuleSemanticRuntime.executeTool()                                  │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import type { LlmJsonValue } from '../../schema'
import type { ActionInvoker } from '../internal/action-invoker'
import type { AttributeAccessor } from '../internal/attribute-accessor'
import type { Navigator } from '../internal/navigator'
import { PROTOCOL_TOOL_NAMES } from '../internal/protocol-tool-generator'
import type { ModuleSemanticKnowledgeProjector } from '../knowledge/module-semantic-knowledge'
import {
  ModuleOperationResult,
  ModulePath,
  ModulePathParseError,
  type ModuleHostContext,
} from '../protocol'
import {
  ProtocolToolArgsError,
  ProtocolToolArgsParser,
  type ProtocolToolArgs,
} from './protocol-tool-args'
import { ProtocolResultProjector } from './protocol-result-projector'

/* -------------------------------------------------------------------------------
 * 一、ProtocolToolRouter
 * ----------------------------------------------------------------------------- */

export class ProtocolToolRouter {
  private readonly argsParser = new ProtocolToolArgsParser()
  private readonly resultProjector = new ProtocolResultProjector()

  public constructor(
    private readonly attributes: AttributeAccessor,
    private readonly actions: ActionInvoker,
    private readonly navigator: Navigator,
    private readonly knowledge: ModuleSemanticKnowledgeProjector,
  ) {}

  /**
   * 执行协议工具调用。
   *
   * 流程：
   *   1. 校验 toolName 是否为已知的协议工具名（UNKNOWN_TOOL）
   *   2. switch 路由到对应方法
   *   3. 各方法内部解析 path（ModulePath.parse）、提取参数（argsParser）
   *   4. 调用内部组件（attributes / actions / navigator）
   *   5. 通过 resultProjector 统一投影返回值格式
   *   6. 捕获 ModulePathParseError → INVALID_PATH_{code}
   *   7. 捕获 ProtocolToolArgsError → INVALID_TOOL_ARGS
   */
  public async execute(
    toolName: string,
    rawArgs: ProtocolToolArgs,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    if (!this.argsParser.isProtocolToolName(toolName)) {
      return ModuleOperationResult.failCode(
        'UNKNOWN_TOOL',
        `工具 "${toolName}" 未在协议中定义`,
        '可调用的工具列表见 getLlmTools()',
      )
    }
    try {
      switch (toolName) {
        case PROTOCOL_TOOL_NAMES.queryModules: return this.routeQueryModules(rawArgs)
        case PROTOCOL_TOOL_NAMES.queryFunctions: return this.routeQueryFunctions(rawArgs)
        case PROTOCOL_TOOL_NAMES.guideFunction: return this.routeGuideFunction(rawArgs)
        case PROTOCOL_TOOL_NAMES.guideHumanQuestion: return this.routeGuideHumanQuestion(rawArgs)
        case PROTOCOL_TOOL_NAMES.getAttribute: return await this.routeGetAttribute(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.setAttribute: return await this.routeSetAttribute(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.invokeAction: return await this.routeInvokeAction(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.listChildren: return await this.routeListChildren(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.findInstance: return await this.routeFindInstance(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.describeKind: return this.routeDescribeKind(rawArgs)
      }
    } catch (error) {
      // 路径解析错误 → 友好错误码
      if (error instanceof ModulePathParseError) {
        return ModuleOperationResult.failCode(
          `INVALID_PATH_${error.code}`,
          `路径解析失败: ${error.message}`,
          '路径语法: / 或 /<kind>[<id>]/<kind>[<id>]/...',
        )
      }
      // 参数错误 → 友好错误码
      if (error instanceof ProtocolToolArgsError) {
        return ModuleOperationResult.failCode('INVALID_TOOL_ARGS', error.message, '请按工具描述补齐参数后重试')
      }
      throw error
    }
  }

  /* ── queryModules ─────────────────────────────────────── */

  private routeQueryModules(args: ProtocolToolArgs): ModuleOperationResult<LlmJsonValue> {
    return this.resultProjector.jsonResult(ModuleOperationResult.ok(this.knowledge.queryModules({
      kind: this.argsParser.optionalString(args, 'kind'),
      parentKind: this.argsParser.optionalString(args, 'parentKind'),
      keyword: this.argsParser.optionalString(args, 'keyword'),
    })))
  }

  /* ── queryFunctions ───────────────────────────────────── */

  private routeQueryFunctions(args: ProtocolToolArgs): ModuleOperationResult<LlmJsonValue> {
    return this.resultProjector.jsonResult(ModuleOperationResult.ok(this.knowledge.queryFunctions({
      kind: this.argsParser.optionalString(args, 'kind'),
      keyword: this.argsParser.optionalString(args, 'keyword'),
    })))
  }

  /* ── guideFunction ────────────────────────────────────── */

  private routeGuideFunction(args: ProtocolToolArgs): ModuleOperationResult<LlmJsonValue> {
    return this.resultProjector.jsonResult(this.knowledge.guideFunction({
      action: this.argsParser.optionalString(args, 'action'),
      kind: this.argsParser.optionalString(args, 'kind'),
      actionName: this.argsParser.optionalString(args, 'actionName'),
    }))
  }

  /* ── guideHumanQuestion ───────────────────────────────── */

  private routeGuideHumanQuestion(args: ProtocolToolArgs): ModuleOperationResult<LlmJsonValue> {
    return this.resultProjector.jsonResult(this.knowledge.guideHumanQuestion({
      context: this.argsParser.requireString(args, 'context'),
      reason: this.argsParser.requireString(args, 'reason'),
      missingFacts: this.argsParser.optionalStringArray(args, 'missingFacts'),
      candidateOptions: this.argsParser.optionalStringArray(args, 'candidateOptions'),
    }))
  }

  /* ── getAttribute ──────────────────────────────────────── */

  private async routeGetAttribute(
    args: ProtocolToolArgs,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const path = ModulePath.parse(this.argsParser.requireString(args, 'path'))
    const attrName = this.argsParser.requireString(args, 'attrName')
    return this.attributes.get(path, attrName, host)
  }

  /* ── setAttribute ──────────────────────────────────────── */

  private async routeSetAttribute(
    args: ProtocolToolArgs,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const path = ModulePath.parse(this.argsParser.requireString(args, 'path'))
    const attrName = this.argsParser.requireString(args, 'attrName')
    const result = await this.attributes.set(path, attrName, this.argsParser.requireValue(args, 'value'), host)
    return this.resultProjector.voidResult(result)
  }

  /* ── invokeAction ──────────────────────────────────────── */

  private async routeInvokeAction(
    args: ProtocolToolArgs,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const path = ModulePath.parse(this.argsParser.requireString(args, 'path'))
    const actionName = this.argsParser.requireString(args, 'actionName')
    return this.actions.invoke(path, actionName, this.argsParser.requireObject(args, 'args'), host)
  }

  /* ── listChildren ──────────────────────────────────────── */

  private async routeListChildren(
    args: ProtocolToolArgs,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const path = ModulePath.parse(this.argsParser.requireString(args, 'path'))
    const childKind = this.argsParser.optionalString(args, 'childKind')
    const result = await this.navigator.listChildren(path, childKind, host)
    return this.resultProjector.instanceListResult(result)
  }

  /* ── findInstance ──────────────────────────────────────── */

  private async routeFindInstance(
    args: ProtocolToolArgs,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const path = ModulePath.parse(this.argsParser.requireString(args, 'path'))
    const childKind = this.argsParser.requireString(args, 'childKind')
    const result = await this.navigator.findInstance(
      path,
      childKind,
      this.argsParser.requireObject(args, 'query'),
      host,
    )
    return this.resultProjector.instanceListResult(result)
  }

  /* ── describeKind ──────────────────────────────────────── */

  private routeDescribeKind(args: ProtocolToolArgs): ModuleOperationResult<LlmJsonValue> {
    return this.resultProjector.describeKindResult(
      this.navigator.describeKind(this.argsParser.requireString(args, 'kind')),
    )
  }
}
