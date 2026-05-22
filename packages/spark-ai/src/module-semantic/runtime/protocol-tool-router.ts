import type { LlmJsonValue } from '../../schema'
import type { ActionInvoker } from '../internal/action-invoker'
import type { AttributeAccessor } from '../internal/attribute-accessor'
import type { Navigator } from '../internal/navigator'
import { PROTOCOL_TOOL_NAMES } from '../internal/protocol-tool-generator'
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

export class ProtocolToolRouter {
  private readonly argsParser = new ProtocolToolArgsParser()
  private readonly resultProjector = new ProtocolResultProjector()

  public constructor(
    private readonly attributes: AttributeAccessor,
    private readonly actions: ActionInvoker,
    private readonly navigator: Navigator,
  ) {}

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
        case PROTOCOL_TOOL_NAMES.getAttribute: return await this.routeGetAttribute(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.setAttribute: return await this.routeSetAttribute(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.invokeAction: return await this.routeInvokeAction(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.listChildren: return await this.routeListChildren(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.findInstance: return await this.routeFindInstance(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.describeKind: return this.routeDescribeKind(rawArgs)
      }
    } catch (error) {
      if (error instanceof ModulePathParseError) {
        return ModuleOperationResult.failCode(
          `INVALID_PATH_${error.code}`,
          `路径解析失败: ${error.message}`,
          '路径语法: / 或 /<kind>[<id>]/<kind>[<id>]/...',
        )
      }
      if (error instanceof ProtocolToolArgsError) {
        return ModuleOperationResult.failCode('INVALID_TOOL_ARGS', error.message, '请按工具描述补齐参数后重试')
      }
      throw error
    }
  }

  private async routeGetAttribute(
    args: ProtocolToolArgs,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const path = ModulePath.parse(this.argsParser.requireString(args, 'path'))
    const attrName = this.argsParser.requireString(args, 'attrName')
    return this.attributes.get(path, attrName, host)
  }

  private async routeSetAttribute(
    args: ProtocolToolArgs,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const path = ModulePath.parse(this.argsParser.requireString(args, 'path'))
    const attrName = this.argsParser.requireString(args, 'attrName')
    const result = await this.attributes.set(path, attrName, this.argsParser.requireValue(args, 'value'), host)
    return this.resultProjector.voidResult(result)
  }

  private async routeInvokeAction(
    args: ProtocolToolArgs,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const path = ModulePath.parse(this.argsParser.requireString(args, 'path'))
    const actionName = this.argsParser.requireString(args, 'actionName')
    return this.actions.invoke(path, actionName, this.argsParser.requireObject(args, 'args'), host)
  }

  private async routeListChildren(
    args: ProtocolToolArgs,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const path = ModulePath.parse(this.argsParser.requireString(args, 'path'))
    const childKind = this.argsParser.optionalString(args, 'childKind')
    const result = await this.navigator.listChildren(path, childKind, host)
    return this.resultProjector.instanceListResult(result)
  }

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

  private routeDescribeKind(args: ProtocolToolArgs): ModuleOperationResult<LlmJsonValue> {
    return this.resultProjector.describeKindResult(
      this.navigator.describeKind(this.argsParser.requireString(args, 'kind')),
    )
  }
}
