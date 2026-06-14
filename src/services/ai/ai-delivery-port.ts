/**
 * @module app:services/ai-delivery-port
 * 职责：定义 APP 层 AI 交付端口，把 Working Copy 的 save、trace 和 rollback 统一成可回执的结果。
 * 边界：只表达应用交付策略，不进入 spark-ai 内核，也不直接理解 pageDesign/projectPlanning 领域细节。
 * AI用途：排查 Host Run 结束后如何落盘、如何回执或失败时如何记录交付状态时，用本模块定位统一协议。
 */

export type AiDeliveryMode = 'manual' | 'auto'

/** 单次交付涉及的文件或导航变更摘要。 */
export type AiDeliveryArtifact = Readonly<{
  kind: 'page-file' | 'navigation'
  name: string
  status: 'dirty' | 'saved' | 'skipped' | 'rolledBack'
}>

/** Host Run 结束后的交付回执，包含模式、状态与产物列表。 */
export type AiDeliveryResult = Readonly<{
  mode: AiDeliveryMode
  status: 'saved' | 'skipped' | 'rolledBack' | 'failed'
  artifacts: readonly AiDeliveryArtifact[]
  message?: string
}>

/** 应用层交付端口：负责 save、trace 与 rollback 三阶段契约。 */
export interface AiDeliveryPort<TContext> {
  readonly mode: AiDeliveryMode
  save(context: TContext): Promise<AiDeliveryResult>
  trace(context: TContext, result: AiDeliveryResult): Promise<void>
  rollback(context: TContext, error: Error): Promise<AiDeliveryResult>
}

/** 附加在 Error 上的交付回执扩展字段。 */
export type AiDeliveryResultExtras = Readonly<{
  delivery: AiDeliveryResult
}>

const AI_DELIVERY_ERROR_EXTRAS_KEY = '__sparkAiDeliveryExtras'

type AiDeliveryErrorCarrier = Error & {
  [AI_DELIVERY_ERROR_EXTRAS_KEY]?: AiDeliveryResultExtras
}

export const noopDeliveryPort: AiDeliveryPort<unknown> = {
  mode: 'manual',
  save() {
    return Promise.resolve(createSkippedAiDeliveryResult('manual'))
  },
  trace() {
    return Promise.resolve()
  },
  rollback() {
    return Promise.resolve(createSkippedAiDeliveryResult('manual'))
  },
}

export function createSkippedAiDeliveryResult(mode: AiDeliveryMode, message?: string): AiDeliveryResult {
  return {
    mode,
    status: 'skipped',
    artifacts: [],
    ...(message === undefined ? {} : { message }),
  }
}

export function createAiDeliveryResultExtras(result: AiDeliveryResult): AiDeliveryResultExtras {
  return { delivery: result }
}

export function attachAiDeliveryResult(error: unknown, result: AiDeliveryResult): Error {
  const normalized = toError(error)
  const carrier = normalized as AiDeliveryErrorCarrier
  carrier[AI_DELIVERY_ERROR_EXTRAS_KEY] = createAiDeliveryResultExtras(result)
  return normalized
}

export function createAiDeliveryFailureError(message: string, result: AiDeliveryResult): Error {
  return attachAiDeliveryResult(new Error(message), result)
}

export function readAiDeliveryErrorExtras(error: unknown): AiDeliveryResultExtras | undefined {
  if (!(error instanceof Error)) return undefined
  const carrier = error as AiDeliveryErrorCarrier
  return carrier[AI_DELIVERY_ERROR_EXTRAS_KEY]
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
