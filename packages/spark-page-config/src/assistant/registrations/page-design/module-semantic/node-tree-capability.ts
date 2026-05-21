/**
 * @packageDocumentation
 *
 * 节点树模块语义协议 — Capability(参考实现)。
 *
 * 协议固定 6 工具调用最终由本类的 invokeAction 落地:
 * - LLM 通过 `invokeAction(path='/node-tree[<pageId>]', actionName='getNode', args={...})` 调起
 * - 本 Capability 把 args 视作 `Record<string, LlmJsonValue>`,直接转交
 *   `PageDesignService.useNodeTreeMethod(...)` —— 不重写 switch 分派、不重新维护参数表。
 *
 * 设计要点:
 * - 实例 ID 约定:节点树实例的 `segment.id` 即 PageDesignServiceContext.pageId。
 * - 不暴露任何属性(attributes 留空),所有可见状态都通过 action 读出。
 * - 不暴露任何子 kind:节点树本体在协议视角下是叶节点。
 * - service 失败时(ok=false)按 PageDesignServiceResult 三字段映射到协议 CheckEntry。
 */

import {
  ModuleCapability,
  errorCheck,
  ok as okResult,
  type ModuleInstanceQuery,
  type ModuleInstanceRef,
  type ModulePathContext,
  type OperationResult,
} from '@spark-view/spark-ai/module-semantic'
import type { LlmJsonValue } from '@spark-view/spark-ai/protocol'
import type {
  PageDesignService,
  PageDesignServiceContext,
  PageDesignServiceResult,
} from '@spark-view/spark-page-config/page/workspace'

/** 写入类方法集合;invokeAction 路由时按此判断 binding.mutates。 */
const NODE_TREE_MUTATING_METHODS: ReadonlySet<string> = new Set([
  'addNode',
  'addNodes',
  'moveNode',
  'setProps',
  'setPropsBatch',
  'replaceNode',
  'replaceNodes',
  'removeNode',
  'removeNodes',
])

/**
 * NodeTreeCapability 构造选项。
 *
 * `contextFactory` 是必需的,用于从 ModulePathContext 抽取 PageDesignServiceContext。
 * 这层小转换让 Capability 不感知 service 的 pageId / requestId 来源。
 */
export interface NodeTreeCapabilityOptions {
  readonly service: PageDesignService
  readonly contextFactory: (ctx: ModulePathContext) => PageDesignServiceContext
}

/**
 * 节点树语义协议 Capability。
 *
 * 一行委托:`service.useNodeTreeMethod(serviceContext, args, methodBinding)`。
 * 不再有 19 个 switch case,也不再有 handler 工厂。
 */
export class NodeTreeCapability extends ModuleCapability {
  public readonly kind = 'node-tree'

  private readonly service: PageDesignService

  private readonly contextFactory: (ctx: ModulePathContext) => PageDesignServiceContext

  public constructor(options: NodeTreeCapabilityOptions) {
    super()
    this.service = options.service
    this.contextFactory = options.contextFactory
  }

  public getAttribute(): Promise<OperationResult<LlmJsonValue>> {
    return Promise.resolve({
      ok: false,
      checks: [errorCheck('ATTRIBUTE_NOT_DECLARED', 'node-tree 未暴露任何属性', '请通过 invokeAction 调用具体方法')],
    })
  }

  public setAttribute(): Promise<OperationResult<void>> {
    return Promise.resolve({
      ok: false,
      checks: [errorCheck('ATTRIBUTE_NOT_DECLARED', 'node-tree 未暴露任何属性', '请通过 invokeAction 调用具体方法')],
    })
  }

  public invokeAction(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<OperationResult<LlmJsonValue>> {
    const serviceResult = this.service.useNodeTreeMethod(
      this.contextFactory(ctx),
      args,
      {
        serviceLabel: actionName,
        methodName: actionName,
        mutates: NODE_TREE_MUTATING_METHODS.has(actionName),
      },
    )
    return Promise.resolve(toOperationResult(serviceResult))
  }

  public listChildren(): Promise<OperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(okResult<readonly ModuleInstanceRef[]>([]))
  }

  public findInstance(
    _ctx: ModulePathContext,
    _childKind: string,
    _query: ModuleInstanceQuery,
  ): Promise<OperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(okResult<readonly ModuleInstanceRef[]>([]))
  }

  public resolveChild(): Promise<OperationResult<boolean>> {
    return Promise.resolve(okResult<boolean>(false))
  }
}

// ═══════════════════════════════════════════════════════
// 内部辅助
// ═══════════════════════════════════════════════════════

function toOperationResult(result: PageDesignServiceResult<unknown>): OperationResult<LlmJsonValue> {
  if (result.ok) {
    const data = coerceLlmJsonValue(result.data)
    return {
      ok: true,
      ...(data === undefined ? {} : { data }),
    }
  }
  return {
    ok: false,
    checks: [errorCheck(result.code, result.msg, result.fix)],
  }
}

function coerceLlmJsonValue(value: unknown): LlmJsonValue | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value
  if (typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    const out: LlmJsonValue[] = []
    for (const item of value) {
      const coerced = coerceLlmJsonValue(item)
      if (coerced !== undefined) out.push(coerced)
    }
    return out
  }
  const record = value satisfies object
  const obj: Record<string, LlmJsonValue> = {}
  for (const [k, v] of Object.entries(record)) {
    const coerced = coerceLlmJsonValue(v)
    if (coerced !== undefined) obj[k] = coerced
  }
  return obj
}
