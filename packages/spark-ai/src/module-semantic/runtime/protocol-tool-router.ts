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
 * │    setAttribute  → AttributeAccessor.set(request)                           │
 * │    invokeFunction  → FunctionInvoker.invoke(request)                           │
 * │    listChildren  → Navigator.listChildren(path, childKind)                   │
 * │    findInstance  → Navigator.findInstance(request)                          │
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
import type { FunctionInvoker } from '../internal/function-invoker'
import type { AttributeAccessor } from '../internal/attribute-accessor'
import type { Navigator } from '../internal/navigator'
import { PROTOCOL_TOOL_NAMES } from '../internal/protocol-tool-generator'
import {
  parseBusinessFunctionToolName,
  type BusinessFunctionToolRef,
} from '../internal/business-function-tool-name'
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
    private readonly functions: FunctionInvoker,
    private readonly navigator: Navigator,
    private readonly knowledge: ModuleSemanticKnowledgeProjector,
  ) {}

  /**
   * 执行协议工具调用或业务函数调用。
   *
   * 流程：
   *   1. 先检查 toolName 是否为业务函数 tool（parseBusinessFunctionToolName）
   *   2. 再校验 toolName 是否为已知的协议工具名（UNKNOWN_TOOL）
   *   3. switch 路由到对应方法
   *   4. 各方法内部解析 path（ModulePath.parse）、提取参数（argsParser）
   *   5. 调用内部组件（attributes / functions / navigator）
   *   6. 通过 resultProjector 统一投影返回值格式
   *   7. 捕获 ModulePathParseError → INVALID_PATH_{code}
   *   8. 捕获 ProtocolToolArgsError → INVALID_TOOL_ARGS
   */
  public async execute(
    toolName: string,
    rawArgs: ProtocolToolArgs,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    try {
      // 先检查是否为业务函数 tool
      const businessFn = parseBusinessFunctionToolName(toolName)
      if (businessFn !== null) {
        return await this.routeBusinessFunction(businessFn, rawArgs, host)
      }

      if (!this.argsParser.isProtocolToolName(toolName)) {
        return ModuleOperationResult.failCode(
          'UNKNOWN_TOOL',
          `工具 "${toolName}" 未在协议中定义`,
          '可调用的工具列表见 getLlmTools()',
        )
      }
      switch (toolName) {
        case PROTOCOL_TOOL_NAMES.queryModules: return this.routeQueryModules(rawArgs)
        case PROTOCOL_TOOL_NAMES.queryFunctions: return this.routeQueryFunctions(rawArgs)
        case PROTOCOL_TOOL_NAMES.guideFunction: return this.routeGuideFunction(rawArgs)
        case PROTOCOL_TOOL_NAMES.guideHumanQuestion: return this.routeGuideHumanQuestion(rawArgs)
        case PROTOCOL_TOOL_NAMES.getAttribute: return await this.routeGetAttribute(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.setAttribute: return await this.routeSetAttribute(rawArgs, host)
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
    const kind = this.argsParser.optionalString(args, 'kind')
    const parentKind = this.argsParser.optionalString(args, 'parentKind')
    const keyword = this.argsParser.optionalString(args, 'keyword')
    return this.resultProjector.jsonResult(ModuleOperationResult.ok(this.knowledge.queryModules({
      ...(kind === undefined ? {} : { kind }),
      ...(parentKind === undefined ? {} : { parentKind }),
      ...(keyword === undefined ? {} : { keyword }),
    })))
  }

  /* ── queryFunctions ───────────────────────────────────── */

  private routeQueryFunctions(args: ProtocolToolArgs): ModuleOperationResult<LlmJsonValue> {
    const kind = this.argsParser.optionalString(args, 'kind')
    const keyword = this.argsParser.optionalString(args, 'keyword')
    return this.resultProjector.jsonResult(ModuleOperationResult.ok(this.knowledge.queryFunctions({
      ...(kind === undefined ? {} : { kind }),
      ...(keyword === undefined ? {} : { keyword }),
    })))
  }

  /* ── guideFunction ────────────────────────────────────── */

  private routeGuideFunction(args: ProtocolToolArgs): ModuleOperationResult<LlmJsonValue> {
    const toolName = this.argsParser.optionalString(args, 'toolName')
    const kind = this.argsParser.optionalString(args, 'kind')
    const functionName = this.argsParser.optionalString(args, 'functionName')
    return this.resultProjector.jsonResult(this.knowledge.guideFunction({
      ...(toolName === undefined ? {} : { toolName }),
      ...(kind === undefined ? {} : { kind }),
      ...(functionName === undefined ? {} : { functionName }),
    }))
  }

  /* ── guideHumanQuestion ───────────────────────────────── */

  private routeGuideHumanQuestion(args: ProtocolToolArgs): ModuleOperationResult<LlmJsonValue> {
    const missingFacts = this.argsParser.optionalStringArray(args, 'missingFacts')
    const candidateOptions = this.argsParser.optionalStringArray(args, 'candidateOptions')
    return this.resultProjector.jsonResult(this.knowledge.guideHumanQuestion({
      context: this.argsParser.requireString(args, 'context'),
      reason: this.argsParser.requireString(args, 'reason'),
      ...(missingFacts === undefined ? {} : { missingFacts }),
      ...(candidateOptions === undefined ? {} : { candidateOptions }),
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
    const result = await this.attributes.set({
      path,
      attrName,
      value: this.argsParser.requireValue(args, 'value'),
      ...(host === undefined ? {} : { host }),
    })
    return this.resultProjector.voidResult(result)
  }

  /* ── business function ──────────────────────────────────── */

  private async routeBusinessFunction(
    businessFn: BusinessFunctionToolRef,
    rawArgs: ProtocolToolArgs,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const { kindPath, functionName } = businessFn
    // 1. Extract $paths and validate length matches kindPath
    const dollarPaths = this.argsParser.requireStringArray(rawArgs, '$paths')
    if (dollarPaths.length !== kindPath.length) {
      return ModuleOperationResult.failCode(
        'INVALID_TOOL_ARGS',
        `$paths 长度 (${String(dollarPaths.length)}) 与 kindPath 长度 (${String(kindPath.length)}) 不匹配`,
        `kindPath: ${kindPath.join(' -> ')}`,
      )
    }

    // 2. Build instance path string
    const pathSegments = kindPath.map((kind, index) => {
      const id = dollarPaths[index]
      if (id === undefined) {
        throw new ProtocolToolArgsError(`$paths[${String(index)}] 缺失`)
      }
      return `/${kind}[${id}]`
    })
    const path = ModulePath.parse(pathSegments.join(''))

    // 3. Extract business args (everything except $paths)
    const businessArgs: Record<string, LlmJsonValue> = {}
    for (const key of Object.keys(rawArgs)) {
      if (key === '$paths') continue
      const value = rawArgs[key]
      if (value !== undefined) {
        businessArgs[key] = value
      }
    }

    // 4. Delegate to FunctionInvoker
    return this.functions.invoke({
      path,
      kindPath,
      functionName,
      args: businessArgs,
      ...(host === undefined ? {} : { host }),
    })
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
    const result = await this.navigator.findInstance({
      path,
      childKind,
      query: this.argsParser.requireObject(args, 'query'),
      ...(host === undefined ? {} : { host }),
    })
    return this.resultProjector.instanceListResult(result)
  }

  /* ── describeKind ──────────────────────────────────────── */

  private routeDescribeKind(args: ProtocolToolArgs): ModuleOperationResult<LlmJsonValue> {
    return this.resultProjector.describeKindResult(
      this.navigator.describeKind(this.argsParser.requireString(args, 'kind')),
    )
  }
}
