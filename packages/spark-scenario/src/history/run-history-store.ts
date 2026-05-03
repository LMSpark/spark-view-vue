import type {
  AiScenarioHistoryPage,
  AiScenarioHistoryQuery,
  AiScenarioRunRecord,
  AiScenarioRunRequest,
  AiScenarioRunResult,
} from '../contracts/scenario-types'

/**
 * ==============================================
 * 历史层：运行记录存储
 * ==============================================
 * 功能分区：
 * 1) push 记录。
 * 2) get 单条。
 * 3) query 分页过滤。
 * 4) clear 清空。
 *
 * 时序分区：
 * 1) runtime 每次 run 结束后 push。
 * 2) registry/runtime 查询阶段调用 get/query。
 */

export interface AiScenarioRunHistoryStore {
  /** 写入单次运行记录。 */
  push: (request: AiScenarioRunRequest, result: AiScenarioRunResult, startedAtMs: number) => void
  /** 按 runId 查询单条记录。 */
  get: (runId: string) => AiScenarioRunRecord | undefined
  /** 分页查询历史记录。 */
  query: (query?: AiScenarioHistoryQuery) => AiScenarioHistoryPage
  /** 清空全部历史。 */
  clear: () => void
}

function toPage(query?: AiScenarioHistoryQuery): { offset: number; limit: number } {
  // 功能：统一 offset/limit 规范，避免上层重复实现分页边界处理。
  const rawOffset = query?.offset ?? 0
  const rawLimit = query?.limit ?? 20
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 20
  return { offset, limit }
}

export function createScenarioRunHistoryStore(maxRecords = 200): AiScenarioRunHistoryStore {
  // 功能：初始化固定上限内存队列，避免历史无限增长。
  const normalizedLimit = Number.isFinite(maxRecords) && maxRecords > 0
    ? Math.min(Math.floor(maxRecords), 1000)
    : 200

  const history: AiScenarioRunRecord[] = []

  function push(request: AiScenarioRunRequest, result: AiScenarioRunResult, startedAtMs: number): void {
    // 时序：每次 run 结束后调用，记录耗时与请求结果快照。
    const finishedAtMs = Date.now()
    const record: AiScenarioRunRecord = {
      runId: result.runId,
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: Math.max(0, finishedAtMs - startedAtMs),
      request,
      result,
    }

    history.unshift(record)
    if (history.length > normalizedLimit) {
      history.splice(normalizedLimit)
    }
  }

  function get(runId: string): AiScenarioRunRecord | undefined {
    // 功能：按 runId 精确定位一条记录。
    return history.find((item) => item.runId === runId)
  }

  function query(queryInput?: AiScenarioHistoryQuery): AiScenarioHistoryPage {
    // 功能：支持按 scenarioId/status 过滤并做分页切片。
    const { offset, limit } = toPage(queryInput)
    const scenarioId = queryInput?.scenarioId?.trim()
    const status = queryInput?.status

    const all = history.filter((item) => {
      if (scenarioId !== undefined && scenarioId !== '' && item.result.scenario.id !== scenarioId) return false
      if (status !== undefined && item.result.status !== status) return false
      return true
    })

    const items = all.slice(offset, offset + limit)
    return {
      total: all.length,
      offset,
      limit,
      hasMore: offset + items.length < all.length,
      items,
    }
  }

  function clear(): void {
    // 功能：清空内存历史，常用于测试隔离或人工复位。
    history.length = 0
  }

  return {
    push,
    get,
    query,
    clear,
  }
}
