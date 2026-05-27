import type { AiJsonValue } from '../../json'
import type { FunctionInvoker } from '../internal/function-invoker'
import type { AttributeAccessor } from '../internal/attribute-accessor'
import type { Navigator } from '../internal/navigator'
import { PROTOCOL_TOOL_NAMES } from '../internal/protocol-tool-generator'
import type { AiModuleKnowledgeProjector } from '../knowledge/module-semantic-knowledge'
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

export class ProtocolToolRouter {
  private readonly argsParser = new ProtocolToolArgsParser()
  private readonly resultProjector = new ProtocolResultProjector()

  public constructor(
    private readonly attributes: AttributeAccessor,
    private readonly functions: FunctionInvoker,
    private readonly navigator: Navigator,
    private readonly knowledge: AiModuleKnowledgeProjector,
  ) {}

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

  private routeModuleGuide(args: ProtocolToolArgs): AiModuleResult<AiJsonValue> {
    const kind = this.argsParser.requireString(args, 'kind')
    const functionName = this.argsParser.optionalString(args, 'functionName')
    if (functionName === undefined) {
      return this.resultProjector.describeKindResult(this.navigator.describeKind(kind))
    }
    return this.resultProjector.jsonResult(this.knowledge.guideFunction({ kind, functionName }))
  }

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
