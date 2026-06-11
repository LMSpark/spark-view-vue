/**
 * @module @spark-appworks/spark-app:ai/tool-approval-bridge
 * 职责：提供应用壳层 tool-approval-bridge 能力，围绕 AiToolApprovalRequest、AiToolApprovalBridgeSnapshot、AiToolApprovalBridgeListener 等 6 个公开契约 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 ai/tool-approval-bridge。
 */
import type {
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
} from '@spark-appworks/spark-ai/agent'
import type { AiJsonParams } from '@spark-appworks/spark-ai/json'

/** Ai Tool Approval Request 的语义模型。 */
export type AiToolApprovalRequest = Readonly<{
  id: string
  moduleId: string
  moduleInstanceId: string
  instanceId: string
  toolName: string
  args: AiJsonParams
  requestedAt: number
}>

/** Ai Tool Approval Bridge Snapshot 的语义模型。 */
export type AiToolApprovalBridgeSnapshot = Readonly<{
  pending: readonly AiToolApprovalRequest[]
}>

/** Ai Tool Approval Bridge Listener 的语义模型。 */
export type AiToolApprovalBridgeListener = (snapshot: AiToolApprovalBridgeSnapshot) => void

/** Ai Tool Approval Request Id Factory 的语义模型。 */
export type AiToolApprovalRequestIdFactory = Readonly<{
  createId(options: AiAgentBeforeFunctionCallOptions, sequence: number): string
}>

/** Ai Tool Approval Bridge Options 的调用配置。 */
export type AiToolApprovalBridgeOptions = Readonly<{
  now?: () => number
  idFactory?: AiToolApprovalRequestIdFactory
}>

type PendingToolApproval = Readonly<{
  request: AiToolApprovalRequest
  resolve: (directive: AiAgentBeforeFunctionCallDirective) => void
}>

const DEFAULT_ABORT_REASON = '审批已取消。'

/** Ai Tool Approval Bridge 的语义模型。 */
export class AiToolApprovalBridge {
  private readonly pending = new Map<string, PendingToolApproval>()
  private readonly listeners = new Set<AiToolApprovalBridgeListener>()
  private readonly now: () => number
  private readonly idFactory: AiToolApprovalRequestIdFactory
  private nextSequence = 1

    /** 创建 Ai Tool Approval Bridge 实例。 */
public constructor(options: AiToolApprovalBridgeOptions = {}) {
    this.now = options.now ?? Date.now
    this.idFactory = options.idFactory ?? defaultApprovalRequestIdFactory
  }

    /** before Function Call 字段。 */
public readonly beforeFunctionCall = (
    options: AiAgentBeforeFunctionCallOptions,
  ): Promise<AiAgentBeforeFunctionCallDirective> => {
    const sequence = this.nextSequence
    this.nextSequence += 1
    const request = createApprovalRequest({
      id: this.idFactory.createId(options, sequence),
      options,
      requestedAt: this.now(),
    })

    return new Promise((resolve) => {
      this.pending.set(request.id, { request, resolve })
      this.emit()
    })
  }

    /** 执行 list Pending 操作。 */
public listPending(): readonly AiToolApprovalRequest[] {
    return [...this.pending.values()].map((item) => item.request)
  }

    /** 执行 decide 操作。 */
public decide(requestId: string, directive: AiAgentBeforeFunctionCallDirective): boolean {
    const item = this.pending.get(requestId)
    if (item === undefined) return false
    this.pending.delete(requestId)
    item.resolve(directive)
    this.emit()
    return true
  }

    /** cancel Pending 字段。 */
public readonly cancelPending = (reason = DEFAULT_ABORT_REASON): number => {
    const items = [...this.pending.values()]
    for (const item of items) {
      this.pending.delete(item.request.id)
      item.resolve({ status: 'abort', reason })
    }
    if (items.length > 0) this.emit()
    return items.length
  }

    /** 执行 subscribe 操作。 */
public subscribe(listener: AiToolApprovalBridgeListener): () => void {
    this.listeners.add(listener)
    listener(this.createSnapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    const snapshot = this.createSnapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }

  private createSnapshot(): AiToolApprovalBridgeSnapshot {
    return { pending: this.listPending() }
  }
}

export function createAiToolApprovalBridge(
  options: AiToolApprovalBridgeOptions = {},
): AiToolApprovalBridge {
  return new AiToolApprovalBridge(options)
}

const defaultApprovalRequestIdFactory: AiToolApprovalRequestIdFactory = Object.freeze({
  createId: (options, sequence) => [
    'tool-approval',
    options.moduleId,
    options.moduleInstanceId,
    options.toolName,
    String(sequence),
  ].join(':'),
})

type CreateApprovalRequestInput = Readonly<{
  id: string
  options: AiAgentBeforeFunctionCallOptions
  requestedAt: number
}>

function createApprovalRequest(input: CreateApprovalRequestInput): AiToolApprovalRequest {
  return {
    id: input.id,
    moduleId: input.options.moduleId,
    moduleInstanceId: input.options.moduleInstanceId,
    instanceId: input.options.instanceId,
    toolName: input.options.toolName,
    args: input.options.args,
    requestedAt: input.requestedAt,
  }
}
