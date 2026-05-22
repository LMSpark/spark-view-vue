/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/runtime/module-semantic-runtime.ts — 组合根
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】模块语义协议的对外运行时句柄。
 *   把 5 个 internal 组件组合成一个可用的运行时：
 *     ModuleKindRegistry + Navigator + AttributeAccessor + ActionInvoker + ProtocolToolGenerator
 *
 * 【暴露面】
 *   - 注册：registerKind(moduleKind)
 *   - 工具规约：getLlmTools()（供 LLM tool spec，每次调用基于当前注册表快照）
 *   - 工具路由：executeTool(toolName, rawArgs)（LLM tool_call 的统一入口）
 *   - 直接调用：getAttribute / setAttribute / invokeAction / listChildren / findInstance / describeKind
 *
 * 【生命周期】
 *   1. new ModuleSemanticRuntime()
 *   2. registerKind(...) × N（启动期一次性注册）
 *   3. getLlmTools() → 喂给 LLM
 *   4. LLM 调 tool → executeTool(toolName, args) → 路由到 internal 组件
 *
 * 【状态管理】本类不持有任何业务状态。业务数据由注册的 ModuleKind 自行适配。
 *
 * 【消费方】AiHostBusinessRegistration.runtime、测试代码
 * ═══════════════════════════════════════════════════════════════
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


// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 公共类型
// ═══════════════════════════════════════════════════════════════

/**
 * LLM 传入的原始 tool 参数（JSON 对象）。
 * 运行时不预先信任结构，executeTool 内部按工具名分别解析。
 */
export type ProtocolToolArgs = Readonly<Record<string, LlmJsonValue>>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · ModuleSemanticRuntime class
// ═══════════════════════════════════════════════════════════════

export class ModuleSemanticRuntime {
  // ── 5 个 internal 组件 ──
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

  // ── 2.1 注册 ───────────────────────────────────────────────

  /** 注册一个 ModuleKind。同名冲突抛 ModuleKindConflictError。 */
  public registerKind(moduleKind: ModuleKind): void {
    this.kinds.register(moduleKind)
  }

  // ── 2.2 工具规约 ───────────────────────────────────────────

  /** 派生当前注册表快照的 6 个协议工具规约。 */
  public getLlmTools(): readonly ModuleSemanticToolSpec[] {
    return this.toolGenerator.generate()
  }

  // ── 2.3 工具路由（LLM tool_call 统一入口）─────────────────

  /**
   * LLM tool_call 入口。把工具名 + 原始参数路由到对应协议方法。
   *
   * 失败码:
   *   - UNKNOWN_TOOL:     工具名不在 6 个协议工具中
   *   - INVALID_TOOL_ARGS: 参数缺字段或类型错
   *   - INVALID_PATH_*:    path 字符串解析失败（透传 PathParseError code）
   *   - (其它):            由下层 internal 组件返回
   *
   * @param host Host 适配层注入的当前业务实例作用域。
   *             直接 new ModuleSemanticRuntime() 调用时为 undefined。
   */
  public async executeTool(
    toolName: string,
    rawArgs: ProtocolToolArgs,
    host?: ModuleKind.HostContext,
  ): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    if (!isProtocolToolName(toolName)) {
      return ModuleKind.OperationResult.failCode(
        'UNKNOWN_TOOL', `工具 "${toolName}" 未在协议中定义`, '可调用的工具列表见 getLlmTools()'
      )
    }
    try {
      switch (toolName) {
        case PROTOCOL_TOOL_NAMES.getAttribute:   return await this.routeGetAttribute(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.setAttribute:   return await this.routeSetAttribute(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.invokeAction:   return await this.routeInvokeAction(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.listChildren:   return await this.routeListChildren(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.findInstance:   return await this.routeFindInstance(rawArgs, host)
        case PROTOCOL_TOOL_NAMES.describeKind:   return this.routeDescribeKind(rawArgs)
      }
    } catch (error) {
      if (error instanceof ModuleKind.PathParseError) {
        return ModuleKind.OperationResult.failCode(
          `INVALID_PATH_${error.code}`,
          `路径解析失败: ${error.message}`,
          '路径语法: / 或 /<kind>[<id>]/<kind>[<id>]/...',
        )
      }
      if (error instanceof ToolArgsError) {
        return ModuleKind.OperationResult.failCode('INVALID_TOOL_ARGS', error.message, '请按工具描述补齐参数后重试')
      }
      throw error
    }
  }

  // ── 2.4 直接调用入口（供测试 / 程序化编排使用）───────────

  public async getAttribute(path: ModuleKind.Path, attrName: string, host?: ModuleKind.HostContext): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    return this.attributes.get(path, attrName, host)
  }

  public async setAttribute(path: ModuleKind.Path, attrName: string, value: LlmJsonValue, host?: ModuleKind.HostContext): Promise<ModuleKind.OperationResult<void>> {
    return this.attributes.set(path, attrName, value, host)
  }

  public async invokeAction(path: ModuleKind.Path, actionName: string, args: Readonly<Record<string, LlmJsonValue>>, host?: ModuleKind.HostContext): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    return this.actions.invoke(path, actionName, args, host)
  }

  public async listChildren(path: ModuleKind.Path, childKind?: string, host?: ModuleKind.HostContext): Promise<ModuleKind.OperationResult<readonly ModuleKind.InstanceRef[]>> {
    return this.navigator.listChildren(path, childKind, host)
  }

  public async findInstance(path: ModuleKind.Path, childKind: string, query: ModuleKind.InstanceQuery, host?: ModuleKind.HostContext): Promise<ModuleKind.OperationResult<readonly ModuleKind.InstanceRef[]>> {
    return this.navigator.findInstance(path, childKind, query, host)
  }

  public describeKind(kind: string): ModuleKind.OperationResult<ModuleKindDescription> {
    return this.navigator.describeKind(kind)
  }

  // ── 2.5 路由实现（参数解析 + 委托 internal 组件）──────────

  private async routeGetAttribute(args: ProtocolToolArgs, host?: ModuleKind.HostContext): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    const pathStr = requireString(args, 'path')
    const attrName = requireString(args, 'attrName')
    return this.attributes.get(ModuleKind.Path.parse(pathStr), attrName, host)
  }

  private async routeSetAttribute(args: ProtocolToolArgs, host?: ModuleKind.HostContext): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    const pathStr = requireString(args, 'path')
    const attrName = requireString(args, 'attrName')
    if (!('value' in args)) throw new ToolArgsError(`参数 "value" 缺失`)
    const value = args['value']
    const result = await this.attributes.set(ModuleKind.Path.parse(pathStr), attrName, value, host)
    return castVoidResult(result)
  }

  private async routeInvokeAction(args: ProtocolToolArgs, host?: ModuleKind.HostContext): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    const pathStr = requireString(args, 'path')
    const actionName = requireString(args, 'actionName')
    const actionArgs = requireObject(args, 'args')
    return this.actions.invoke(ModuleKind.Path.parse(pathStr), actionName, actionArgs, host)
  }

  private async routeListChildren(args: ProtocolToolArgs, host?: ModuleKind.HostContext): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    const pathStr = requireString(args, 'path')
    const childKind = optionalString(args, 'childKind')
    const result = await this.navigator.listChildren(ModuleKind.Path.parse(pathStr), childKind, host)
    return castInstanceListResult(result)
  }

  private async routeFindInstance(args: ProtocolToolArgs, host?: ModuleKind.HostContext): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
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

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 内部：LLM 参数解析与校验
// ═══════════════════════════════════════════════════════════════

/** 工具参数解析错误（内部异常，由 executeTool catch 处理） */
class ToolArgsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolArgsError'
  }
}

/** 从协议工具参数中提取必填字符串字段 */
function requireString(args: ProtocolToolArgs, key: string): string {
  const v = args[key]
  if (typeof v !== 'string' || v.length === 0) {
    throw new ToolArgsError(`参数 "${key}" 缺失或非字符串`)
  }
  return v
}

/** 从协议工具参数中提取可选字符串字段 */
function optionalString(args: ProtocolToolArgs, key: string): string | undefined {
  if (!(key in args)) return undefined
  const v = args[key]
  if (v === null || v === undefined) return undefined
  if (typeof v !== 'string') throw new ToolArgsError(`参数 "${key}" 类型错误,应为字符串`)
  return v.length === 0 ? undefined : v
}

/** 从协议工具参数中提取必填 JSON 对象字段 */
function requireObject(args: ProtocolToolArgs, key: string): Readonly<Record<string, LlmJsonValue>> {
  const v = args[key]
  if (!isJsonObject(v)) throw new ToolArgsError(`参数 "${key}" 缺失或不是 JSON 对象`)
  return v
}

function isJsonObject(value: LlmJsonValue | undefined): value is Readonly<Record<string, LlmJsonValue>> {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
}

/** 工具名校验：是否为 6 个协议工具之一 */
function isProtocolToolName(name: string): name is ProtocolToolName {
  const known: readonly ProtocolToolName[] = Object.values(PROTOCOL_TOOL_NAMES)
  return known.some((candidate) => candidate === name)
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 内部：OperationResult 类型转换（T → LlmJsonValue）
//
// internal 组件返回的类型 OperationResult<T> 各不相同，
// executeTool 需要统一投影为 OperationResult<LlmJsonValue> 返回给 LLM。
// ═══════════════════════════════════════════════════════════════

/** void → LlmJsonValue：成功时 data 为 undefined */
function castVoidResult(result: ModuleKind.OperationResult<void>): ModuleKind.OperationResult<LlmJsonValue> {
  if (!result.ok) return ModuleKind.OperationResult.passthroughFailure(result)
  return ModuleKind.OperationResult.ok<LlmJsonValue>(undefined, result.checks, result.state)
}

/** InstanceRef[] → LlmJsonValue：每个 ref 投影为 JSON 对象 */
function castInstanceListResult(
  result: ModuleKind.OperationResult<readonly ModuleKind.InstanceRef[]>,
): ModuleKind.OperationResult<LlmJsonValue> {
  if (!result.ok) return ModuleKind.OperationResult.passthroughFailure(result)
  const data = result.data ?? []
  const payload: LlmJsonValue = data.map((ref) => instanceRefToJson(ref))
  return ModuleKind.OperationResult.ok(payload, result.checks, result.state)
}

/** ModuleKindDescription → LlmJsonValue：完整元数据投影 */
function castDescribeKindResult(
  result: ModuleKind.OperationResult<ModuleKindDescription>,
): ModuleKind.OperationResult<LlmJsonValue> {
  if (!result.ok) return ModuleKind.OperationResult.passthroughFailure(result)
  if (result.data === undefined) return ModuleKind.OperationResult.ok<LlmJsonValue>(undefined, result.checks, result.state)
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

// ── JSON 投影 helper ──────────────────────────────────────

function describeAttributeToJson(attr: ModuleKindDescription['attributes'][number]): Record<string, LlmJsonValue> {
  const out: Record<string, LlmJsonValue> = {
    name: attr.name,
    description: attr.description,
    readable: attr.readable,
    writable: attr.writable,
    schema: jsonSchemaToJson(attr.schema),
  }
  if (attr.example !== undefined) out['example'] = attr.example
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
      : action.failureModes.map((mode) => ({ code: mode.code, when: mode.when, fix: mode.fix })),
    example: action.example === undefined ? null : action.example,
  }
  return out
}

/** 递归投影 LlmJsonSchema → LlmJsonValue（JSON Schema 本身 JSON 兼容） */
function jsonSchemaToJson(schema: unknown): LlmJsonValue {
  if (schema === null) return null
  if (typeof schema === 'boolean') return schema
  if (typeof schema === 'number') return schema
  if (typeof schema === 'string') return schema
  if (Array.isArray(schema)) return schema.map((item) => jsonSchemaToJson(item))
  if (typeof schema === 'object') {
    const out: Record<string, LlmJsonValue> = {}
    for (const [key, value] of Object.entries(schema)) {
      if (value === undefined) continue
      out[key] = jsonSchemaToJson(value)
    }
    return out
  }
  return null
}

function instanceRefToJson(ref: ModuleKind.InstanceRef): LlmJsonValue {
  const base: Record<string, LlmJsonValue> = { id: ref.id, label: ref.label }
  if (ref.summary !== undefined) base['summary'] = ref.summary
  return base
}
