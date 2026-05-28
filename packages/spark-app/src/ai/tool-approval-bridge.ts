import type {
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
} from '@spark-view/spark-ai/agent'
import type { AiJsonParams } from '@spark-view/spark-ai/json'

export type AiToolApprovalRequest = Readonly<{
  id: string
  moduleId: string
  moduleInstanceId: string
  instanceId: string
  toolName: string
  args: AiJsonParams
  requestedAt: number
}>

export type AiToolApprovalBridgeSnapshot = Readonly<{
  pending: readonly AiToolApprovalRequest[]
}>

export type AiToolApprovalBridgeListener = (snapshot: AiToolApprovalBridgeSnapshot) => void

export type AiToolApprovalRequestIdFactory = Readonly<{
  createId(options: AiAgentBeforeFunctionCallOptions, sequence: number): string
}>

export type AiToolApprovalBridgeOptions = Readonly<{
  now?: () => number
  idFactory?: AiToolApprovalRequestIdFactory
}>

type PendingToolApproval = Readonly<{
  request: AiToolApprovalRequest
  resolve: (directive: AiAgentBeforeFunctionCallDirective) => void
}>

const DEFAULT_ABORT_REASON = '审批已取消。'

export class AiToolApprovalBridge {
  private readonly pending = new Map<string, PendingToolApproval>()
  private readonly listeners = new Set<AiToolApprovalBridgeListener>()
  private readonly now: () => number
  private readonly idFactory: AiToolApprovalRequestIdFactory
  private nextSequence = 1

  public constructor(options: AiToolApprovalBridgeOptions = {}) {
    this.now = options.now ?? Date.now
    this.idFactory = options.idFactory ?? defaultApprovalRequestIdFactory
  }

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

  public listPending(): readonly AiToolApprovalRequest[] {
    return [...this.pending.values()].map((item) => item.request)
  }

  public decide(requestId: string, directive: AiAgentBeforeFunctionCallDirective): boolean {
    const item = this.pending.get(requestId)
    if (item === undefined) return false
    this.pending.delete(requestId)
    item.resolve(directive)
    this.emit()
    return true
  }

  public readonly cancelPending = (reason = DEFAULT_ABORT_REASON): number => {
    const items = [...this.pending.values()]
    for (const item of items) {
      this.pending.delete(item.request.id)
      item.resolve({ status: 'abort', reason })
    }
    if (items.length > 0) this.emit()
    return items.length
  }

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
