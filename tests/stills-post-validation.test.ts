/**
 * Phase 1: postValidate 管道 + dispatcher 导出 API
 *
 * - findCandidateActions / scoreCandidateAction 公共 API 验证
 * - postValidate 管道 smoke test（dataview.configure options 视图）
 *
 * ⚠ postValidate warnings 是给 LLM 的辅助提示，
 *   此处仅验证管道通畅，不穷举规则细节。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerAllStills,
  clearRegistry,
  clearDomains,
  executeStill,
  createSession,
  findCandidateActions,
  scoreCandidateAction,
} from '../packages/spark-ai/src/stills'
import type { IStillSession, StillResult } from '../packages/spark-ai/src/stills'

// ─── helpers ────────────────────────────────────────────────

let session: IStillSession
let reqSeq = 0

function exec(action: string, params: unknown = {}): StillResult {
  reqSeq++
  return executeStill(action, params, session, `pv${reqSeq}`)
}

function expectOk(result: StillResult): asserts result is Extract<StillResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(`Expected ok but got error: ${result.code} — ${result.msg}`)
  }
}

// ─── setup ──────────────────────────────────────────────────

beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerAllStills()
  session = createSession()
  reqSeq = 0
})

// ═══════════════════════════════════════════════════════════
// findCandidateActions / scoreCandidateAction
// ═══════════════════════════════════════════════════════════

describe('dispatcher exported helpers', () => {
  it('findCandidateActions returns matches for namespace prefix', () => {
    const candidates = findCandidateActions('datatable')
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((c) => c.startsWith('datatable.'))).toBe(true)
  })

  it('findCandidateActions returns empty for unknown prefix', () => {
    expect(findCandidateActions('zzz_nonexistent')).toEqual([])
  })

  it('scoreCandidateAction ranks same-namespace higher', () => {
    const sameNs = scoreCandidateAction('datatable.insert', 'datatable.addRows')
    const diffNs = scoreCandidateAction('datatable.insert', 'schema.lock')
    expect(sameNs).toBeGreaterThan(diffNs)
  })
})

// ═══════════════════════════════════════════════════════════
// postValidate 管道 smoke test
// ═══════════════════════════════════════════════════════════

describe('postValidate pipeline', () => {
  it('schema.lock succeeds without postValidate warnings', () => {
    // schema.lock 无 postValidate 钩子，结果不应有 warnings
    expectOk(exec('blueprint.create', {
      title: 'PV 测试',
      requirements: '管道验证',
      checkpoints: [{ id: 'cp1', title: '建模', plannedActions: ['datatable.create'], validation: 'ok' }],
    }))
    expectOk(exec('dataset.init', { dataSetName: 'PV' }))
    expectOk(exec('datatable.create', {
      tableName: 'Users',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    }))

    const r = exec('schema.lock')
    expectOk(r)
    expect(r.warnings).toBeUndefined()
  })

  it('dataview.configure attaches options warnings when valueField missing', () => {
    // 蓝图 → dataset → 建表 → lock → 创建 options 视图 → configure → 检查 warnings
    expectOk(exec('blueprint.create', {
      title: 'PV options',
      requirements: '验证 options postValidate',
      checkpoints: [{ id: 'cp1', title: '建模', plannedActions: ['datatable.create'], validation: 'ok' }],
    }))
    expectOk(exec('dataset.init', { dataSetName: 'PVOpt' }))
    expectOk(exec('datatable.create', {
      tableName: 'Statuses',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'label', type: 'string' },
      ],
    }))
    expectOk(exec('schema.lock'))
    expectOk(exec('dataview.create', { tableName: 'Statuses', viewId: 'options' }))

    // configure options 视图但不设 valueField/labelField
    const r = exec('dataview.configure', { tableName: 'Statuses', viewId: 'options', autoLoad: false })
    expectOk(r)
    expect(r.warnings).toBeDefined()
    expect(r.warnings!.some((w) => w.rule === 'OPTIONS_VALUE_FIELD')).toBe(true)
    expect(r.warnings!.some((w) => w.rule === 'OPTIONS_LABEL_FIELD')).toBe(true)
  })
})
