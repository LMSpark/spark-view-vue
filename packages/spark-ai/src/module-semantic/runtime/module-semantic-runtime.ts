/**
 * @packageDocumentation
 *
 * 模块语义协议运行时(组合根)。
 *
 * 把 ModuleKindRegistry / Navigator /
 * AttributeAccessor / ActionInvoker / ProtocolToolGenerator
 * 组合成一个对外可用的运行时句柄。
 *
 * 暴露面:
 * - 注册:registerKind(moduleKind)
 * - 工具规约:getLlmTools()(供 LLM tool spec)
 * - 工具路由:executeTool(toolName, rawArgs)(LLM tool_call 入口)
 * - 直接调用:getAttribute / setAttribute / invokeAction /
 *            listChildren / findInstance / describeKind
 *
 * 不持有业务状态。业务数据由注册的 ModuleKind 运行入口自行适配。
 */

import type { LlmJsonValue } from '../../schema'
import { ActionInvoker } from '../internal/action-invoker'
import { AttributeAccessor } from '../internal/attribute-accessor'
import { ModuleKindRegistry } from '../internal/module-kind-registry'
import { Navigator, type ModuleKindDescription } from '../internal/navigator'
import {
  PROTOCOL_TOOL_NAMES,
  ProtocolToolGenerator,
  type ModuleSemanticToolSpec,
  type ProtocolToolName,
} from '../internal/protocol-tool-generator'
import { ModuleKind } from '../protocol/module-kind'


/**
 * LLM 传入的原始 tool 参数(JSON 对象)。
 *
 * 运行时不预先信任结构,executeTool 内部按工具名分别拆解。
 */
export type ProtocolToolArgs = Readonly<Record<string, LlmJsonValue>>

/**
 * 模块语义协议运行时。
 *
 * 典型生命周期:
 * 1. `new ModuleSemanticRuntime()`
 * 2. `registerKind(createSchoolModuleKind(...))` × N
 * 3. `getLlmTools()` 取规约喂给 LLM
 * 4. LLM 调 tool → `executeTool(toolName, args)` 路由
 *
 * 注册阶段允许冲突抛错(由 registry 抛 ConflictError),
 * 调用阶段所有失败统一走 ModuleKind.OperationResult.checks 反馈。
 */
export class ModuleSemanticRuntime {
  private readonly kinds: ModuleKindRegistry

  private readonly attributes: AttributeAccessor

  private readonly actions: ActionInvoker

  private readonly navigator: Navigator

  private readonly toolGenerator: ProtocolToolGenerator

  public constructor() {
    this.kinds = new ModuleKindRegistry()
    this.navigator = new Navigator(this.kinds)
    this.attributes = new AttributeAccessor(this.navigator)
    this.actions = new ActionInvoker(this.navigator)
    this.toolGenerator = new ProtocolToolGenerator(this.kinds)
  }

  // ───────── 注册 ─────────

  public registerKind(moduleKind: ModuleKind): void {
    this.kinds.register(moduleKind)
  }

  // ───────── 协议工具规约 ─────────

  /**
   * 派生协议工具规约。每次调用都基于当前注册表快照。
   */
  public getLlmTools(): readonly ModuleSemanticToolSpec[] {
    return this.toolGenerator.generate()
  }

  // ───────── 工具路由 ─────────

  /**
   * LLM tool_call 入口。把工具名 + 原始参数路由到协议方法。
   *
   * 失败码:
   * - UNKNOWN_TOOL:    未识别的工具名
   * - INVALID_TOOL_ARGS: 缺字段或类型错
   * - INVALID_PATH:    path 字符串解析失败(透传 ModuleKind.PathParseError code)
   * - (其它):           由下层路由返回
   *
   * @param host host 适配层注入的当前业务实例作用域。直接 new ModuleSemanticRuntime()
   *             调用时为 undefined,ModuleKind 自行判断是否消费。
   */
  public async executeTool(
    toolName: string,
    rawArgs: ProtocolToolArgs,
    host?: ModuleKind.HostContext,
  ): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    if (!isProtocolToolName(toolName)) {
      return failWith('UNKNOWN_TOOL', `工具 "${toolName}" 未在协议中定义`, '可调用的工具列表见 getLlmTools()')
    }
    try {
      switch (toolName) {
        case PROTOCOL_TOOL_NAMES.getAttribute:
          return await this.routeGetAttribute(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.setAttribute:
          return await this.routeSetAttribute(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.invokeAction:
          return await this.routeInvokeAction(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.listChildren:
          return await this.routeListChildren(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.findInstance:
          return await this.routeFindInstance(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.describeKind:
          return this.routeDescribeKind(rawArgs)
      }
    } catch (error) {
      if (error instanceof ModuleKind.PathParseError) {
        return failWith(
          `INVALID_PATH_${error.code}`,
          `路径解析失败: ${error.message}`,
          '路径语法: / 或 /<kind>[<id>]/<kind>[<id>]/...',
        )
      }
      if (error instanceof ToolArgsError) {
        return failWith('INVALID_TOOL_ARGS', error.message, '请按工具描述补齐参数后重试')
      }
      throw error
    }
  }

  // ───────── 直接调用入口(测试 / 程序化) ─────────

  public async getAttribute(
    path: ModuleKind.Path,
    attrName: string,
    host?: ModuleKind.HostContext,
  ): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    return this.attributes.get(path, attrName, host)
  }

  public async setAttribute(
    path: ModuleKind.Path,
    attrName: string,
    value: LlmJsonValue,
    host?: ModuleKind.HostContext,
  ): Promise<ModuleKind.OperationResult<void>> {
    return this.attributes.set(path, attrName, value, host)
  }

  public async invokeAction(
    path: ModuleKind.Path,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
    host?: ModuleKind.HostContext,
  ): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    return this.actions.invoke(path, actionName, args, host)
  }

  public async listChildren(
    path: ModuleKind.Path,
    childKind?: string,
    host?: ModuleKind.HostContext,
  ): Promise<ModuleKind.OperationResult<readonly ModuleKind.InstanceRef[]>> {
    return this.navigator.listChildren(path, childKind, host)
  }

  public async findInstance(
    path: ModuleKind.Path,
    childKind: string,
    query: ModuleKind.InstanceQuery,
    host?: ModuleKind.HostContext,
  ): Promise<ModuleKind.OperationResult<readonly ModuleKind.InstanceRef[]>> {
    return this.navigator.findInstance(path, childKind, query, host)
  }

  public describeKind(kind: string): ModuleKind.OperationResult<ModuleKindDescription> {
    return this.navigator.describeKind(kind)
  }

  // ───────── 路由实现 ─────────

  private async routeGetAttribute(
    args: ProtocolToolArgs,
    host?: ModuleKind.HostContext,
  ): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    const pathStr = requireString(args, 'path')
    const attrName = requireString(args, 'attrName')
    return this.attributes.get(ModuleKind.Path.parse(pathStr), attrName, host)
  }

  private async routeSetAttribute(
    args: ProtocolToolArgs,
    host?: ModuleKind.HostContext,
  ): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    const pathStr = requireString(args, 'path')
    const attrName = requireString(args, 'attrName')
    if (!('value' in args)) {
      throw new ToolArgsError(`参数 "value" 缺失`)
    }
    const value = args['value']
    const result = await this.attributes.set(ModuleKind.Path.parse(pathStr), attrName, value, host)
    return castVoidResult(result)
  }

  private async routeInvokeAction(
    args: ProtocolToolArgs,
    host?: ModuleKind.HostContext,
  ): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    const pathStr = requireString(args, 'path')
    const actionName = requireString(args, 'actionName')
    const actionArgs = requireObject(args, 'args')
    return this.actions.invoke(ModuleKind.Path.parse(pathStr), actionName, actionArgs, host)
  }

  private async routeListChildren(
    args: ProtocolToolArgs,
    host?: ModuleKind.HostContext,
  ): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    const pathStr = requireString(args, 'path')
    const childKind = optionalString(args, 'childKind')
    const result = await this.navigator.listChildren(ModuleKind.Path.parse(pathStr), childKind, host)
    return castInstanceListResult(result)
  }

  private async routeFindInstance(
    args: ProtocolToolArgs,
    host?: ModuleKind.HostContext,
  ): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    const pathStr = requireString(args, 'path')
    const childKind = requireString(args, 'childKind')
    const query = requireObject(args, 'query')
    const result = await this.navigator.findInstance(ModuleKind.Path.parse(pathStr), childKind, query, host)
    return castInstanceListResult(result)
  }

  private routeDescribeKind(args: ProtocolToolArgs): ModuleKind.OperationResult<LlmJsonValue> {
    const kind = requireString(args, 'kind')
    const result = this.navigator.describeKind(kind)
    return castDescribeKindResult(result)
  }
}

// ═══════════════════════════════════════════════════════
// 内部参数辅助
// ═══════════════════════════════════════════════════════

class ToolArgsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolArgsError'
  }
}

function requireString(args: ProtocolToolArgs, key: string): string {
  const v = args[key]
  if (typeof v !== 'string' || v.length === 0) {
    throw new ToolArgsError(`参数 "${key}" 缺失或非字符串`)
  }
  return v
}

function optionalString(args: ProtocolToolArgs, key: string): string | undefined {
  if (!(key in args)) {
    return undefined
  }
  const v = args[key]
  if (v === null || v === undefined) {
    return undefined
  }
  if (typeof v !== 'string') {
    throw new ToolArgsError(`参数 "${key}" 类型错误,应为字符串`)
  }
  return v.length === 0 ? undefined : v
}

function requireObject(args: ProtocolToolArgs, key: string): Readonly<Record<string, LlmJsonValue>> {
  const v = args[key]
  if (!isJsonObject(v)) {
    throw new ToolArgsError(`参数 "${key}" 缺失或不是 JSON 对象`)
  }
  return v
}

function isJsonObject(value: LlmJsonValue | undefined): value is Readonly<Record<string, LlmJsonValue>> {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
}

function isProtocolToolName(name: string): name is ProtocolToolName {
  const known: readonly ProtocolToolName[] = Object.values(PROTOCOL_TOOL_NAMES)
  return known.some((candidate) => candidate === name)
}

function failWith(code: string, message: string, hint?: string): ModuleKind.OperationResult<never> {
  return ModuleKind.OperationResult.failCode(code, message, hint)
}

function passthroughFailure(result: ModuleKind.OperationResult<unknown>): ModuleKind.OperationResult<never> {
  return ModuleKind.OperationResult.passthroughFailure(result)
}

function castVoidResult(result: ModuleKind.OperationResult<void>): ModuleKind.OperationResult<LlmJsonValue> {
  if (!result.ok) {
    return passthroughFailure(result)
  }
  return ModuleKind.OperationResult.ok<LlmJsonValue>(undefined, result.checks, result.state)
}

function castInstanceListResult(
  result: ModuleKind.OperationResult<readonly ModuleKind.InstanceRef[]>,
): ModuleKind.OperationResult<LlmJsonValue> {
  if (!result.ok) {
    return passthroughFailure(result)
  }
  const data = result.data ?? []
  const payload: LlmJsonValue = data.map((ref) => instanceRefToJson(ref))
  return ModuleKind.OperationResult.ok(payload, result.checks, result.state)
}

function castDescribeKindResult(
  result: ModuleKind.OperationResult<ModuleKindDescription>,
): ModuleKind.OperationResult<LlmJsonValue> {
  if (!result.ok) {
    return passthroughFailure(result)
  }
  if (result.data === undefined) {
    return ModuleKind.OperationResult.ok<LlmJsonValue>(undefined, result.checks, result.state)
  }
  const payload: LlmJsonValue = {
    kind: result.data.kind,
    name: result.data.name,
    description: result.data.description,
    attributes: result.data.attributes.map((attr) => describeAttributeToJson(attr)),
    actions: result.data.actions.map((action) => describeActionToJson(action)),
    children: [...result.data.children],
  }
  return ModuleKind.OperationResult.ok(payload, result.checks, result.state)
}

function describeAttributeToJson(attr: ModuleKindDescription['attributes'][number]): Record<string, LlmJsonValue> {
  const out: Record<string, LlmJsonValue> = {
    name: attr.name,
    description: attr.description,
    readable: attr.readable,
    writable: attr.writable,
    schema: jsonSchemaToJson(attr.schema),
  }
  if (attr.example !== undefined) {
    out['example'] = attr.example
  }
  return out
}

function describeActionToJson(action: ModuleKindDescription['actions'][number]): Record<string, LlmJsonValue> {
  const out: Record<string, LlmJsonValue> = {
    name: action.name,
    description: action.description,
    paramsSchema: jsonSchemaToJson(action.paramsSchema),
    resultSchema: action.resultSchema === undefined ? null : jsonSchemaToJson(action.resultSchema),
    usageRules: action.usageRules === undefined ? [] : [...action.usageRules],
    failureModes: action.failureModes === undefined
      ? []
      : action.failureModes.map((mode) => ({
        code: mode.code,
        when: mode.when,
        fix: mode.fix,
      })),
    example: action.example === undefined ? null : action.example,
  }
  return out
}

/**
 * 把 LlmJsonSchema 投影成 LlmJsonValue 形态(JSON Schema 本身就是 JSON 兼容,
 * 这里只做结构性递归遍历以让 TypeScript 类型对齐 LlmJsonValue)。
 */
function jsonSchemaToJson(schema: unknown): LlmJsonValue {
  if (schema === null) return null
  if (typeof schema === 'boolean') return schema
  if (typeof schema === 'number') return schema
  if (typeof schema === 'string') return schema
  if (Array.isArray(schema)) {
    return schema.map((item) => jsonSchemaToJson(item))
  }
  if (typeof schema === 'object') {
    const obj = schema as Record<string, unknown>
    const out: Record<string, LlmJsonValue> = {}
    for (const key of Object.keys(obj)) {
      const value = obj[key]
      if (value === undefined) continue
      out[key] = jsonSchemaToJson(value)
    }
    return out
  }
  return null
}

function instanceRefToJson(ref: ModuleKind.InstanceRef): LlmJsonValue {
  const base: Record<string, LlmJsonValue> = {
    id: ref.id,
    label: ref.label,
  }
  if (ref.summary !== undefined) {
    base['summary'] = ref.summary
  }
  return base
}
