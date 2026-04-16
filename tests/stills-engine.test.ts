/**
 * Stills Engine — 完整请假系统流程测试
 *
 * 模拟 STILLS_BLUEPRINT_PROMPT 中的 Stills 引擎全流程：
 * session.describe → stills.capabilities → blueprint.create →
 * dataset.init → datatable.create×5 → relation.add×4 →
 * schema.lock → dataview.configure×5 → dependency.add×3 →
 * dataset.validate → dataset.export
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerAllStills,
  clearRegistry,
  clearDomains,
  executeStill,
  createSession,
  getAllStills,
  getDataSetState,
} from '../packages/spark-ai/src/stills'
import type { IStillSession, StillResult, DataSetDomainState } from '../packages/spark-ai/src/stills'

// ─── helpers ────────────────────────────────────────────────

let session: IStillSession
let reqSeq = 0

/** Shortcut to the dataset domain state */
function datasetState(): DataSetDomainState {
  return getDataSetState(session)
}

function exec(action: string, params: unknown = {}): StillResult {
  reqSeq++
  return executeStill(action, params, session, `r${reqSeq}`)
}

function expectOk(result: StillResult): asserts result is { ok: true; data: unknown; summary: string } {
  if (!result.ok) {
    throw new Error(`Expected ok but got error: ${result.code} — ${result.msg}`)
  }
}

function expectFail(result: StillResult, code?: string): asserts result is { ok: false; code: string; msg: string; fix: string } {
  if (result.ok) {
    throw new Error(`Expected fail but got ok: ${result.summary}`)
  }
  if (code) {
    expect(result.code).toBe(code)
  }
}

function expectDefined<T>(value: T | null | undefined): T {
  expect(value).toBeDefined()
  expect(value).not.toBeNull()
  if (value === null || value === undefined) {
    throw new Error('Expected value to be defined')
  }
  return value
}

// ─── setup ──────────────────────────────────────────────────

beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerAllStills()
  session = createSession()
  reqSeq = 0
})

// ─── Tests ──────────────────────────────────────────────────

describe('stills registry', () => {
  it('registers stills into a non-empty registry', () => {
    expect(getAllStills().size).toBeGreaterThan(0)
  })

  it('all stills have required fields', () => {
    for (const [, still] of getAllStills()) {
      expect(still.action).toBeTruthy()
      expect(still.type).toMatch(/^(request|describe)$/)
      expect(still.description).toBeTruthy()
      expect(typeof still.validate).toBe('function')
      expect(typeof still.execute).toBe('function')
    }
  })
})

describe('meta stills (P0)', () => {
  it('stills.capabilities returns action list', () => {
    const r = exec('stills.capabilities')
    expectOk(r)
    expect((r.data as { actions: unknown[] }).actions.length).toBe(getAllStills().size)
  })

  it('stills.actionSpec returns spec for known action', () => {
    const r = exec('stills.actionSpec', { action: 'datatable.create' })
    expectOk(r)
    const data = r.data as { action: string; description: string }
    expect(data.action).toBe('datatable.create')
  })

  it('stills.actionSpec returns component spec for known component type', () => {
    const r = exec('stills.actionSpec', { action: 'r-table' })
    expectOk(r)
    const data = r.data as {
      action: string
      subjectKind: string
      componentType: string
      category: string
      props: Array<{ name: string }>
    }
    expect(data.action).toBe('r-table')
    expect(data.subjectKind).toBe('component')
    expect(data.componentType).toBe('r-table')
    expect(data.category).toBe('container')
    expect(data.props.some((prop) => prop.name === 'dataKey')).toBe(true)
  })

  it('stills.actionSpec exposes usage rules and failure modes for risky actions', () => {
    const r = exec('stills.actionSpec', { action: 'blueprint.revise' })
    expectOk(r)
    const data = r.data as {
      usageRules: string[]
      failureModes: Array<{ code: string }>
    }
    expect(data.usageRules.some((rule) => rule.includes('updateCheckpoints'))).toBe(true)
    expect(data.failureModes.some((failureMode) => failureMode.code === 'NO_BLUEPRINT_CHANGE')).toBe(true)
  })

  it('stills.actionSpec fails for unknown action', () => {
    const r = exec('stills.actionSpec', { action: 'nonexistent' })
    expectFail(r, 'UNKNOWN_ACTION')
  })

  it('session.describe returns initial state', () => {
    const r = exec('session.describe')
    expectOk(r)
    const data = r.data as {
      domains: Record<string, { phase: string; initialized: boolean }>
      executionTrace: { totalActions: number }
      components: {
        summary: { total: number; containers: number }
        querySpecExample: string
        components: Array<{ type: string }>
      }
    }
    expect(data.domains['dataset']?.phase).toBe('discover')
    expect(data.domains['blueprint']?.phase).toBe('idle')
    expect(data.executionTrace.totalActions).toBe(0)
    expect(data.components.summary.total).toBeGreaterThan(0)
    expect(data.components.summary.containers).toBeGreaterThan(0)
    expect(data.components.querySpecExample).toContain('stills.actionSpec')
    expect(data.components.components.some((component) => component.type === 'r-table')).toBe(true)
  })
})

describe('blueprint stills (P1)', () => {
  it('blueprint.create requires title and requirements', () => {
    const r = exec('blueprint.create', { title: '', requirements: '', checkpoints: [] })
    expectFail(r, 'INVALID_PARAMS')
    expect(r.fix).toContain('blueprint_create')
    expect(r.fix).toContain('checkpoints')
  })

  it('blueprint.create succeeds with proper params', () => {
    const r = exec('blueprint.create', {
      title: '请假系统',
      requirements: '请假管理',
      checkpoints: [
        { id: 'cp1', title: '建表', plannedActions: ['datatable.create'], validation: '5张表' },
        { id: 'cp2', title: '关系', plannedActions: ['relation.add'], validation: '4条关系' },
      ],
    })
    expectOk(r)
    expect(session.blueprint).not.toBeNull()
  })

  it('blueprint.create rejects aggregate placeholder actions', () => {
    const r = exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        { id: 'cp1', title: '步骤1', plannedActions: ['datatable.create×5'], validation: 'v1' },
      ],
    })

    expectFail(r, 'INVALID_PARAMS')
  })

  it('blueprint.create auto chains generated plan items', () => {
    const r = exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        {
          id: 'cp1',
          title: '步骤1',
          plannedActions: ['stills.capabilities', 'blueprint.describe'],
          validation: 'v1',
        },
      ],
    })

    expectOk(r)
    const checkpoint = expectDefined(session.blueprint?.checkpoints[0])
    expect(checkpoint.planItems[1]?.dependsOn).toEqual(['cp1.item1'])
  })

  it('blueprint.create accepts planItems without plannedActions', () => {
    const r = exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        {
          id: 'cp1',
          title: '步骤1',
          validation: 'v1',
          planItems: [
            { id: 'cp1.item1', title: '查看目录', action: 'stills.capabilities' },
            { id: 'cp1.item2', title: '查看蓝图', action: 'blueprint.describe', dependsOn: ['cp1.item1'] },
          ],
        },
      ],
    })

    expectOk(r)
    const checkpoint = expectDefined(session.blueprint?.checkpoints[0])
    expect(checkpoint.plannedActions).toEqual(['stills.capabilities', 'blueprint.describe'])
  })

  it('blueprint.describe after creation', () => {
    exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [{
        id: 'cp1',
        title: '步骤1',
        plannedActions: ['blueprint.describe'],
        validation: 'test',
        executionMode: 'subagent',
        subagentGoal: '单独处理步骤1',
      }],
    })
    const r = exec('blueprint.describe')
    expectOk(r)
    const data = r.data as {
      currentCheckpoint: {
        executionMode: string
        subagentGoal: string
      }
      checkpoints: Array<{
        executionMode: string
        subagentGoal: string
      }>
    }
    expect(data.currentCheckpoint.executionMode).toBe('subagent')
    expect(data.currentCheckpoint.subagentGoal).toBe('单独处理步骤1')
    expect(data.checkpoints[0]?.executionMode).toBe('subagent')
  })

  it('blueprint.create validates subagent checkpoints', () => {
    const r = exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [{
        id: 'cp1',
        title: '步骤1',
        plannedActions: ['blueprint.describe'],
        validation: 'test',
        executionMode: 'subagent',
      }],
    })
    expectFail(r, 'INVALID_PARAMS')
  })

  it('blueprint.advance marks checkpoint done after plan items complete', () => {
    exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        { id: 'cp1', title: '步骤1', plannedActions: ['stills.capabilities'], validation: 'v1' },
        {
          id: 'cp2',
          title: '步骤2',
          plannedActions: ['blueprint.describe'],
          validation: 'v2',
          dependsOn: ['cp1'],
          relatedCheckpointIds: ['cp1'],
          executionMode: 'subagent',
          subagentGoal: '独立补齐步骤2',
        },
      ],
    })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp1.item1', note: '已完成 cp1.item1' })
    const r = exec('blueprint.advance', { completedCheckpointId: 'cp1' })
    expectOk(r)
    const blueprint = expectDefined(session.blueprint)
    const checkpoint = expectDefined(blueprint.checkpoints[0])
    const nextCheckpoint = expectDefined(blueprint.checkpoints[1])
    expect(checkpoint.status).toBe('done')
    expect(blueprint.currentCheckpointId).toBe('cp2')
    expect(nextCheckpoint.dependsOn).toEqual(['cp1'])
    expect(nextCheckpoint.executionMode).toBe('subagent')
  })

  it('blueprint.item.advance marks plan item done', () => {
    exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        {
          id: 'cp1',
          title: '步骤1',
          plannedActions: [],
          validation: 'v1',
          planItems: [
            { id: 'cp1.item1', title: '初始化数据集', action: 'dataset.init' },
            { id: 'cp1.item2', title: '查看蓝图', action: 'blueprint.describe', dependsOn: ['cp1.item1'] },
          ],
        },
      ],
    })
    exec('dataset.init', { dataSetName: 'TestDS' })
    const r = exec('blueprint.item.advance', { completedPlanItemId: 'cp1.item1', note: '初始化完成' })
    expectOk(r)
    const blueprint = expectDefined(session.blueprint)
    expect(blueprint.currentCheckpointId).toBe('cp1')
    expect(blueprint.currentPlanItemId).toBe('cp1.item2')
    expect(blueprint.checkpoints[0]?.planItems[0]?.status).toBe('done')
    expect(blueprint.checkpoints[0]?.status).toBe('pending')
  })

  it('blueprint.item.advance rejects plan item with pending dependencies', () => {
    exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        {
          id: 'cp1',
          title: '步骤1',
          plannedActions: [],
          validation: 'v1',
          planItems: [
            { id: 'cp1.item1', title: '查看目录', action: 'stills.capabilities' },
            { id: 'cp1.item2', title: '查看蓝图', action: 'blueprint.describe', dependsOn: ['cp1.item1'] },
          ],
        },
      ],
    })

    const r = exec('blueprint.item.advance', { completedPlanItemId: 'cp1.item2' })

    expectFail(r, 'PLAN_ITEM_DEPENDENCIES_PENDING')
  })

  it('blueprint.item.advance rejects request item without successful execution', () => {
    exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        {
          id: 'cp1',
          title: '步骤1',
          plannedActions: [],
          validation: 'v1',
          planItems: [
            { id: 'cp1.item1', title: '初始化数据集', action: 'dataset.init' },
          ],
        },
      ],
    })

    const r = exec('blueprint.item.advance', { completedPlanItemId: 'cp1.item1' })

    expectFail(r, 'PLAN_ITEM_NOT_EXECUTED')
    expect(r.fix).toContain('@@describe:stills.actionSpec#retry-dataset-init-spec')
    expect(r.fix).toContain('@@request:blueprint.item.advance#retry-cp1.item1')
  })

  it('blueprint.advance rejects checkpoint with pending plan items', () => {
    exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        {
          id: 'cp1',
          title: '步骤1',
          plannedActions: ['stills.capabilities'],
          validation: 'v1',
        },
      ],
    })

    const r = exec('blueprint.advance', { completedCheckpointId: 'cp1' })

    expectFail(r, 'CHECKPOINT_HAS_PENDING_PLAN_ITEMS')
    expect(r.fix).toContain('@@request:blueprint.item.advance#retry-cp1.item1')
    expect(r.fix).toContain('@@request:blueprint.advance#retry-cp1')
  })

  it('blueprint.create rejects dangling checkpoint dependency', () => {
    const r = exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        {
          id: 'cp1',
          title: '步骤1',
          plannedActions: ['stills.capabilities'],
          validation: 'v1',
          dependsOn: ['cp999'],
        },
      ],
    })
    expectFail(r, 'INVALID_BLUEPRINT')
  })

  it('blueprint.create rejects cyclic plan item dependency graph', () => {
    const r = exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        {
          id: 'cp1',
          title: '步骤1',
          plannedActions: [],
          validation: 'v1',
          planItems: [
            { id: 'cp1.item1', title: '查看目录', action: 'stills.capabilities', dependsOn: ['cp1.item2'] },
            { id: 'cp1.item2', title: '查看蓝图', action: 'blueprint.describe', dependsOn: ['cp1.item1'] },
          ],
        },
      ],
    })

    expectFail(r, 'INVALID_BLUEPRINT')
  })

  it('blueprint.revise rejects orphaned dependency graph', () => {
    exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        { id: 'cp1', title: '步骤1', plannedActions: ['stills.capabilities'], validation: 'v1' },
        { id: 'cp2', title: '步骤2', plannedActions: ['blueprint.describe'], validation: 'v2', dependsOn: ['cp1'] },
      ],
    })

    const r = exec('blueprint.revise', {
      reason: '错误删除前置步骤',
      removeCheckpointIds: ['cp1'],
    })

    expectFail(r, 'INVALID_BLUEPRINT')
  })

  it('blueprint.revise updates pending checkpoint structure', () => {
    exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        { id: 'cp1', title: '步骤1', plannedActions: ['dataset.init'], validation: 'v1' },
        { id: 'cp2', title: '步骤2', plannedActions: ['datatable.create'], validation: 'v2', dependsOn: ['cp1'] },
      ],
    })

    const r = exec('blueprint.revise', {
      reason: '补充 schema.lock 并细化验证条件',
      updateCheckpoints: [
        {
          id: 'cp2',
          plannedActions: ['datatable.create', 'relation.add', 'schema.lock'],
          validation: '核心表、关系与 schema.lock 全部完成',
          insertAfter: 'cp1',
        },
      ],
    })

    expectOk(r)
    const checkpoint = expectDefined(session.blueprint?.checkpoints.find((item) => item.id === 'cp2'))
    expect(checkpoint.plannedActions).toEqual(['datatable.create', 'relation.add', 'schema.lock'])
    expect(checkpoint.validation).toBe('核心表、关系与 schema.lock 全部完成')
    expect(checkpoint.planItems.map((planItem) => planItem.action)).toEqual([
      'datatable.create',
      'relation.add',
      'schema.lock',
    ])
    expect(checkpoint.planItems[1]?.dependsOn).toEqual(['cp2.item1'])
    expect(checkpoint.planItems[2]?.dependsOn).toEqual(['cp2.item2'])
  })

  it('blueprint.revise rejects editing completed checkpoint', () => {
    exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        { id: 'cp1', title: '步骤1', plannedActions: ['stills.capabilities'], validation: 'v1' },
        { id: 'cp2', title: '步骤2', plannedActions: ['blueprint.describe'], validation: 'v2', dependsOn: ['cp1'] },
      ],
    })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp1.item1', note: '已完成 cp1.item1' })
    exec('blueprint.advance', { completedCheckpointId: 'cp1', note: '已完成' })

    const r = exec('blueprint.revise', {
      reason: '试图回写已完成节点',
      updateCheckpoints: [
        {
          id: 'cp1',
          title: '修改后的步骤1',
        },
      ],
    })

    expectFail(r, 'CHECKPOINT_NOT_EDITABLE')
  })

  it('blueprint.revise rejects no-op revision', () => {
    exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        { id: 'cp1', title: '步骤1', plannedActions: ['stills.capabilities'], validation: 'v1' },
      ],
    })

    const r = exec('blueprint.revise', {
      reason: '只是口头说要调整顺序，但没有实际修改参数',
      addCheckpoints: [],
      removeCheckpointIds: [],
      updateOpenQuestions: [],
    })

    expectFail(r, 'NO_BLUEPRINT_CHANGE')
  })
})

function createTestBlueprint(): void {
  exec('blueprint.create', {
    title: '测试蓝图',
    requirements: '测试',
    checkpoints: [{ id: 'cp1', title: '步骤1', plannedActions: ['stills.capabilities'], validation: 'v' }],
  })
}

describe('dataset stills (P2)', () => {
  it('dataset.init creates empty dataset', () => {
    createTestBlueprint()
    const r = exec('dataset.init', { dataSetName: 'LeaveSystem' })
    expectOk(r)
    expect(datasetState().data).not.toBeNull()
    expect(datasetState().data!.dataSetName).toBe('LeaveSystem')
    expect(datasetState().phase).toBe('design')
  })

  it('dataset.describe shows state', () => {
    createTestBlueprint()
    exec('dataset.init', { dataSetName: 'Test' })
    const r = exec('dataset.describe')
    expectOk(r)
    const data = r.data as { dataSetName: string; tableCount: number }
    expect(data.dataSetName).toBe('Test')
    expect(data.tableCount).toBe(0)
  })

  it('dataset.validate reports row consistency issues', () => {
    createTestBlueprint()
    exec('dataset.init', { dataSetName: 'Test' })
    exec('datatable.create', {
      tableName: 'Employees',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
    })

    const table = expectDefined(datasetState().data?.tables['Employees'])
    table.addRows([{ id: 'E-01', name: '张三', code: 'EMP001' }])

    const r = exec('dataset.validate')
    expectOk(r)
    const data = r.data as { valid: boolean; issues: Array<{ detail?: string }> }
    expect(data.valid).toBe(false)
    expect(data.issues.some((issue) => issue.detail?.includes('未声明字段: code'))).toBe(true)
    expect(data.issues.some((issue) => issue.detail?.includes('字段 id 类型不匹配'))).toBe(true)
  })

  it('dataset.validate ignores internal row metadata fields', () => {
    createTestBlueprint()
    exec('dataset.init', { dataSetName: 'Test' })
    exec('datatable.create', {
      tableName: 'Statuses',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'label', type: 'string' },
      ],
    })

    const addRowsResult = exec('datatable.addRows', {
      tableName: 'Statuses',
      rows: [
        { id: 1, label: '待审批' },
        { id: 2, label: '已通过' },
      ],
    })
    expectOk(addRowsResult)

    const r = exec('dataset.validate')
    expectOk(r)
    const data = r.data as { valid: boolean; issues: Array<{ detail?: string }> }
    expect(data.valid).toBe(true)
    expect(data.issues.some((issue) => issue.detail?.includes('_pk'))).toBe(false)
  })
})

describe('datatable stills (P2)', () => {
  beforeEach(() => {
    createTestBlueprint()
    exec('dataset.init', { dataSetName: 'Test' })
  })

  it('datatable.create adds a table', () => {
    const r = exec('datatable.create', {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true, label: 'ID' },
        { name: 'name', type: 'string', label: '姓名' },
      ],
    })
    expectOk(r)
    const usersTable = expectDefined(datasetState().data?.tables['Users'])
    expect(usersTable.columns.filter((column) => !column.isComputed)).toHaveLength(2)
  })

  it('datatable.create rejects duplicate table', () => {
    exec('datatable.create', {
      tableName: 'Users',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    const r = exec('datatable.create', {
      tableName: 'Users',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    expectFail(r, 'TABLE_EXISTS')
  })

  it('datatable.addColumns adds to existing table', () => {
    exec('datatable.create', {
      tableName: 'Users',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    const r = exec('datatable.addColumns', {
      tableName: 'Users',
      columns: [{ name: 'email', type: 'string', label: '邮箱' }],
    })
    expectOk(r)
    const usersTable = expectDefined(datasetState().data?.tables['Users'])
    expect(usersTable.columns.filter((column) => !column.isComputed)).toHaveLength(2)
  })

  it('datatable.updateColumn modifies column', () => {
    exec('datatable.create', {
      tableName: 'Users',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    const r = exec('datatable.updateColumn', {
      tableName: 'Users',
      columnName: 'id',
      updates: { label: '用户ID' },
    })
    expectOk(r)
    const usersTable = expectDefined(datasetState().data?.tables['Users'])
    const firstColumn = expectDefined(usersTable.columns[0])
    expect(firstColumn.label).toBe('用户ID')
  })

  it('datatable.removeColumn fails if referenced by relation', () => {
    exec('datatable.create', {
      tableName: 'Parent',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    exec('datatable.create', {
      tableName: 'Child',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'parentId', type: 'string' },
      ],
    })
    datasetState().data!.tableRelations = [
      { parentTable: 'Parent', childTable: 'Child', parentField: 'id', childField: 'parentId' },
    ]
    const r = exec('datatable.removeColumn', { tableName: 'Parent', columnName: 'id' })
    expectFail(r, 'COLUMN_IN_USE')
  })

  it('datatable.describe shows table info', () => {
    exec('datatable.create', {
      tableName: 'Users',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true, label: 'ID' }],
    })
    const r = exec('datatable.describe', { tableName: 'Users' })
    expectOk(r)
    const data = r.data as { tableName: string; columnCount: number }
    expect(data.tableName).toBe('Users')
    expect(data.columnCount).toBe(1)
  })

  it('datatable.addRows writes to default view', () => {
    exec('datatable.create', {
      tableName: 'Statuses',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'label', type: 'string' },
      ],
    })
    datasetState().locked = true
    const r = exec('datatable.addRows', {
      tableName: 'Statuses',
      rows: [
        { id: '1', label: '待审批' },
        { id: '2', label: '已通过' },
      ],
    })
    expectOk(r)
    const statusesTable = expectDefined(datasetState().data?.tables['Statuses'])
    const rows = expectDefined(expectDefined(statusesTable.views['default']).rows)
    expect(rows).toHaveLength(2)
  })

  it('datatable.addRows rejects inconsistent row payload', () => {
    exec('datatable.create', {
      tableName: 'Statuses',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'label', type: 'string' },
      ],
    })

    const r = exec('datatable.addRows', {
      tableName: 'Statuses',
      rows: [
        { id: '1', label: '待审批', code: 'PENDING' },
      ],
    })

    expectFail(r, 'INVALID_ROW_DATA')
  })

  it('datatable.addRows reports remaining option tables without seed rows', () => {
    exec('datatable.create', {
      tableName: 'LeaveType',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
    })
    exec('datatable.create', {
      tableName: 'Employee',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
    })
    exec('schema.lock')
    exec('dataview.create', { tableName: 'LeaveType', viewId: 'options' })
    exec('dataview.create', { tableName: 'Employee', viewId: 'options' })

    const r = exec('datatable.addRows', {
      tableName: 'LeaveType',
      rows: [
        { id: 1, name: '年假' },
      ],
    })

    expectOk(r)
    const data = r.data as { remainingOptionTablesWithoutRows: string[]; hint: string }
    expect(data.remainingOptionTablesWithoutRows).toEqual(['Employee'])
    expect(data.hint).toContain('Employee')
  })

  it('datatable.setApi rejects flat endpoint shape', () => {
    exec('datatable.create', {
      tableName: 'Orders',
      columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
    })
    exec('schema.lock')

    const r = exec('datatable.setApi', {
      tableName: 'Orders',
      api: { url: '/api/orders', method: 'POST' },
    })

    expectFail(r, 'INVALID_PARAMS')
  })
})

describe('relation stills (P2)', () => {
  beforeEach(() => {
    createTestBlueprint()
    exec('dataset.init', { dataSetName: 'Test' })
    exec('datatable.create', {
      tableName: 'Orders',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    exec('datatable.create', {
      tableName: 'Items',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'orderId', type: 'string' },
      ],
    })
  })

  it('relation.add creates relation', () => {
    const r = exec('relation.add', {
      parentTable: 'Orders',
      childTable: 'Items',
      parentField: 'id',
      childField: 'orderId',
    })
    expectOk(r)
    expect(datasetState().data!.tableRelations!.length).toBe(1)
  })

  it('relation.add rejects nonexistent table', () => {
    const r = exec('relation.add', {
      parentTable: 'Nonexist',
      childTable: 'Items',
      parentField: 'id',
      childField: 'orderId',
    })
    expectFail(r, 'TABLE_NOT_FOUND')
  })

  it('relation.add rejects nonexistent field', () => {
    const r = exec('relation.add', {
      parentTable: 'Orders',
      childTable: 'Items',
      parentField: 'nonexist',
      childField: 'orderId',
    })
    expectFail(r, 'COLUMN_NOT_FOUND')
  })

  it('relation.add rejects duplicate', () => {
    exec('relation.add', {
      parentTable: 'Orders',
      childTable: 'Items',
      parentField: 'id',
      childField: 'orderId',
    })
    const r = exec('relation.add', {
      parentTable: 'Orders',
      childTable: 'Items',
      parentField: 'id',
      childField: 'orderId',
    })
    expectFail(r, 'RELATION_EXISTS')
  })

  it('relation.list shows all relations', () => {
    exec('relation.add', {
      parentTable: 'Orders',
      childTable: 'Items',
      parentField: 'id',
      childField: 'orderId',
    })
    const r = exec('relation.list')
    expectOk(r)
    expect((r.data as { count: number }).count).toBe(1)
  })

  it('relation.remove deletes relation', () => {
    exec('relation.add', {
      parentTable: 'Orders',
      childTable: 'Items',
      parentField: 'id',
      childField: 'orderId',
    })
    const r = exec('relation.remove', { parentTable: 'Orders', childTable: 'Items' })
    expectOk(r)
    expect(datasetState().data!.tableRelations!.length).toBe(0)
  })

  it('relation.remove blocked by viewDependency', () => {
    exec('relation.add', {
      parentTable: 'Orders',
      childTable: 'Items',
      parentField: 'id',
      childField: 'orderId',
    })
    datasetState().data!.viewDependencies = [
      { parentTable: 'Orders', childTable: 'Items', dependencyType: 'currentRow' },
    ]
    const r = exec('relation.remove', { parentTable: 'Orders', childTable: 'Items' })
    expectFail(r, 'RELATION_IN_USE')
  })
})

describe('schema stills (P3)', () => {
  beforeEach(() => {
    createTestBlueprint()
    exec('dataset.init', { dataSetName: 'Test' })
    exec('datatable.create', {
      tableName: 'Users',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
  })

  it('schema.lock succeeds with PK', () => {
    const r = exec('schema.lock')
    expectOk(r)
    expect(datasetState().locked).toBe(true)
  })

  it('schema.lock fails without PK', () => {
    exec('datatable.create', {
      tableName: 'NoPK',
      columns: [{ name: 'x', type: 'string' }],
    })
    const r = exec('schema.lock')
    expectFail(r, 'MISSING_PK')
  })

  it('schema.lock fails when already locked', () => {
    exec('schema.lock')
    const r = exec('schema.lock')
    expectFail(r, 'SCHEMA_LOCKED')
  })

  it('schema.unlock after lock', () => {
    exec('schema.lock')
    const r = exec('schema.unlock', { reason: '需要加字段' })
    expectOk(r)
    expect(datasetState().locked).toBe(false)
  })
})

describe('dataview stills (P4)', () => {
  beforeEach(() => {
    createTestBlueprint()
    exec('dataset.init', { dataSetName: 'Test' })
    exec('datatable.create', {
      tableName: 'Orders',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'price', type: 'number' },
        { name: 'parentId', type: 'string' },
      ],
    })
    exec('schema.lock')
  })

  it('dataview.configure sets autoLoad', () => {
    const r = exec('dataview.configure', {
      tableName: 'Orders',
      config: { autoLoad: true, autoCurrentFirst: true, pageSize: 20 },
    })
    expectOk(r)
    const ordersTable = expectDefined(datasetState().data?.tables['Orders'])
    const view = expectDefined(ordersTable.views['default'])
    expect(view.autoLoad).toBe(true)
    expect(view.pageSize).toBe(20)
  })

  it('dataview.create adds custom view', () => {
    const r = exec('dataview.create', { tableName: 'Orders', viewId: 'grid' })
    expectOk(r)
    const ordersTable = expectDefined(datasetState().data?.tables['Orders'])
    expect(ordersTable.views['grid']).toBeDefined()
  })

  it('dataview.create rejects duplicate', () => {
    exec('dataview.create', { tableName: 'Orders', viewId: 'grid' })
    const r = exec('dataview.create', { tableName: 'Orders', viewId: 'grid' })
    expectFail(r, 'VIEW_EXISTS')
  })

  it('dataview.describe returns view config', () => {
    exec('dataview.configure', { tableName: 'Orders', config: { autoLoad: true } })
    const r = exec('dataview.describe', { tableName: 'Orders' })
    expectOk(r)
    expect((r.data as { config: { autoLoad: boolean } }).config.autoLoad).toBe(true)
  })

  it('dataview.configure rejects viewName alias', () => {
    const r = exec('dataview.configure', {
      tableName: 'Orders',
      viewName: 'options',
      config: { valueField: 'id', labelField: 'name' },
    })
    expectFail(r, 'INVALID_PARAMS')
  })

  it('dataview.setAggregates sets aggregates', () => {
    const r = exec('dataview.setAggregates', {
      tableName: 'Orders',
      aggregates: { price: { type: 'sum' } },
    })
    expectOk(r)
    const ordersTable = expectDefined(datasetState().data?.tables['Orders'])
    const view = expectDefined(ordersTable.views['default'])
    expect(view.aggregates).toEqual({ price: { type: 'sum' } })
  })

  it('dataview.setAggregates rejects missing field', () => {
    const r = exec('dataview.setAggregates', {
      tableName: 'Orders',
      aggregates: { nonexist: { type: 'sum' } },
    })
    expectFail(r, 'COLUMN_NOT_FOUND')
  })

  it('dataview.setTreeConfig works', () => {
    const r = exec('dataview.setTreeConfig', {
      tableName: 'Orders',
      treeConfig: { idField: 'id', parentIdField: 'parentId', textField: 'id' },
    })
    expectOk(r)
    const ordersTable = expectDefined(datasetState().data?.tables['Orders'])
    expect(expectDefined(ordersTable.views['default']).treeConfig?.idField).toBe('id')
  })

  it('dataview.setTreeConfig rejects viewName alias', () => {
    const r = exec('dataview.setTreeConfig', {
      tableName: 'Orders',
      viewName: 'options',
      treeConfig: { idField: 'id', parentIdField: 'parentId', textField: 'id' },
    })
    expectFail(r, 'INVALID_PARAMS')
  })

  it('dataview.setTreeConfig rejects missing field', () => {
    const r = exec('dataview.setTreeConfig', {
      tableName: 'Orders',
      treeConfig: { idField: 'nonexist', parentIdField: 'parentId' },
    })
    expectFail(r, 'COLUMN_NOT_FOUND')
  })
})

describe('dependency stills (P4)', () => {
  beforeEach(() => {
    createTestBlueprint()
    exec('dataset.init', { dataSetName: 'Test' })
    exec('datatable.create', {
      tableName: 'Orders',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    exec('datatable.create', {
      tableName: 'Items',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'orderId', type: 'string' },
      ],
    })
    exec('relation.add', {
      parentTable: 'Orders',
      childTable: 'Items',
      parentField: 'id',
      childField: 'orderId',
    })
    exec('schema.lock')
  })

  it('dependency.add creates dependency', () => {
    const r = exec('dependency.add', {
      parentTable: 'Orders',
      childTable: 'Items',
      dependencyType: 'currentRow',
    })
    expectOk(r)
    const viewDependencies = expectDefined(datasetState().data?.viewDependencies)
    expect(viewDependencies.length).toBe(1)
    const firstDependency = expectDefined(viewDependencies[0])
    expect(firstDependency.dependencyType).toBe('currentRow')
  })

  it('dependency.add requires relation', () => {
    const r = exec('dependency.add', {
      parentTable: 'Items',
      childTable: 'Orders',
    })
    expectFail(r, 'NO_RELATION')
  })

  it('dependency.add rejects duplicate', () => {
    exec('dependency.add', { parentTable: 'Orders', childTable: 'Items' })
    const r = exec('dependency.add', { parentTable: 'Orders', childTable: 'Items' })
    expectFail(r, 'DEPENDENCY_EXISTS')
  })

  it('dependency.remove works', () => {
    exec('dependency.add', { parentTable: 'Orders', childTable: 'Items' })
    const r = exec('dependency.remove', { parentTable: 'Orders', childTable: 'Items' })
    expectOk(r)
    expect(datasetState().data!.viewDependencies!.length).toBe(0)
  })
})

describe('guard system', () => {
  it('rejects schema-locked ops when schema unlocked', () => {
    createTestBlueprint()
    exec('dataset.init', { dataSetName: 'Test' })
    exec('datatable.create', {
      tableName: 'T',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    // schema not locked → dataview.configure should fail
    const r = exec('dataview.configure', { tableName: 'T', config: { autoLoad: true } })
    expectFail(r, 'SCHEMA_NOT_LOCKED')
    expect(r.fix).toContain('schema_lock')
  })

  it('rejects schema-unlocked ops when schema locked', () => {
    createTestBlueprint()
    exec('dataset.init', { dataSetName: 'Test' })
    exec('datatable.create', {
      tableName: 'T',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    exec('schema.lock')
    // schema locked → datatable.create should fail
    const r = exec('datatable.create', {
      tableName: 'T2',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    expectFail(r, 'SCHEMA_LOCKED')
    expect(r.fix).toContain('schema_unlock')
  })

  it('rejects ops requiring dataset when no dataset', () => {
    createTestBlueprint()
    const r = exec('datatable.create', {
      tableName: 'T',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    expectFail(r, 'NO_DATASET')
    expect(r.fix).toContain('dataset_init')
  })

  it('unknown action returns UNKNOWN_ACTION', () => {
    const r = exec('nonexistent.action')
    expectFail(r, 'UNKNOWN_ACTION')
    expect(r.fix).toContain('stills_capabilities')
  })
})

describe('patchLog tracking', () => {
  it('logs request actions but not describe actions', () => {
    createTestBlueprint()
    const logBefore = session.patchLog.length // blueprint.create is also logged
    exec('dataset.init', { dataSetName: 'Test' })
    exec('dataset.describe')
    // dataset.init = request → logged, dataset.describe = describe → not logged
    expect(session.patchLog.length).toBe(logBefore + 1)
    const lastPatch = expectDefined(session.patchLog[session.patchLog.length - 1])
    expect(lastPatch.action).toBe('dataset.init')
  })
})

describe('dataset.validate', () => {
  beforeEach(() => {
    createTestBlueprint()
    exec('dataset.init', { dataSetName: 'Test' })
  })

  it('reports missing PKs', () => {
    exec('datatable.create', {
      tableName: 'NoPK',
      columns: [{ name: 'x', type: 'string' }],
    })
    const r = exec('dataset.validate')
    expectOk(r)
    const data = r.data as { issues: Array<{ rule: string; pass: boolean }> }
    expect(data.issues.some((i) => !i.pass && i.rule.includes('NoPK'))).toBe(true)
  })

  it('reports broken relation refs', () => {
    exec('datatable.create', {
      tableName: 'A',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    datasetState().data!.tableRelations = [
      { parentTable: 'A', childTable: 'Missing', parentField: 'id', childField: 'fk' },
    ]
    const r = exec('dataset.validate')
    expectOk(r)
    const data = r.data as { issues: Array<{ rule: string; pass: boolean }> }
    expect(data.issues.some((i) => !i.pass && i.rule.includes('引用表存在'))).toBe(true)
  })

  it('clean dataset passes validation', () => {
    exec('datatable.create', {
      tableName: 'Users',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    const r = exec('dataset.validate')
    expectOk(r)
    const data = r.data as { valid: boolean }
    expect(data.valid).toBe(true)
    expect(r.summary).toContain('0 个问题')
  })
})

describe('dataset.export & reset', () => {
  it('export returns deep copy', () => {
    createTestBlueprint()
    exec('dataset.init', { dataSetName: 'Test' })
    exec('datatable.create', {
      tableName: 'T',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    const r = exec('dataset.export')
    expectOk(r)
    const data = r.data as { snapshot: { dataSetName: string } }
    expect(data.snapshot.dataSetName).toBe('Test')
    // mutating export should not affect session
    data.snapshot.dataSetName = 'Mutated'
    expect(datasetState().data!.dataSetName).toBe('Test')
  })

  it('dataset.reset clears everything', () => {
    createTestBlueprint()
    exec('dataset.init', { dataSetName: 'Test' })
    exec('datatable.create', {
      tableName: 'T',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    const r = exec('dataset.reset')
    expectOk(r)
    expect(datasetState().data).toBeNull()
    expect(session.blueprint).toBeNull()
    expect(datasetState().phase).toBe('discover')
    // dataset.reset clears patchLog THEN dispatcher writes the reset entry
    // So patchLog has exactly 1 entry (the reset itself)
    expect(session.patchLog).toHaveLength(1)
    const resetPatch = expectDefined(session.patchLog[0])
    expect(resetPatch.action).toBe('dataset.reset')
  })
})

describe('full leave-system scenario (E2E)', () => {
  it('builds complete 请假系统 dataset', () => {
    // Step ①: session.describe
    const s1 = exec('session.describe')
    expectOk(s1)

    // Step ②: stills.capabilities
    const s2 = exec('stills.capabilities')
    expectOk(s2)

    // Step ③: blueprint.create
    const s3 = exec('blueprint.create', {
      title: '请假管理系统',
      requirements: '员工请假申请、审批流程、假别管理、假期余额管理',
      checkpoints: [
        { id: 'cp0', title: '初始化数据集', plannedActions: ['dataset.init'], validation: 'dataset ready' },
        {
          id: 'cp1',
          title: '建表阶段',
          plannedActions: [],
          validation: '5张表+PK',
          dependsOn: ['cp0'],
          planItems: [
            { id: 'cp1.item1', title: '创建 LeaveTypes', action: 'datatable.create' },
            { id: 'cp1.item2', title: '创建 LeaveRequests', action: 'datatable.create', dependsOn: ['cp1.item1'] },
            { id: 'cp1.item3', title: '创建 ApprovalRecords', action: 'datatable.create', dependsOn: ['cp1.item2'] },
            { id: 'cp1.item4', title: '创建 LeaveBalances', action: 'datatable.create', dependsOn: ['cp1.item3'] },
            { id: 'cp1.item5', title: '创建 ApprovalFlows', action: 'datatable.create', dependsOn: ['cp1.item4'] },
          ],
        },
        {
          id: 'cp2',
          title: '关系阶段',
          plannedActions: [],
          validation: '4条关系',
          dependsOn: ['cp1'],
          planItems: [
            { id: 'cp2.item1', title: 'LeaveTypes -> LeaveRequests', action: 'relation.add' },
            { id: 'cp2.item2', title: 'LeaveRequests -> ApprovalRecords', action: 'relation.add', dependsOn: ['cp2.item1'] },
            { id: 'cp2.item3', title: 'LeaveTypes -> LeaveBalances', action: 'relation.add', dependsOn: ['cp2.item2'] },
            { id: 'cp2.item4', title: 'LeaveTypes -> ApprovalFlows', action: 'relation.add', dependsOn: ['cp2.item3'] },
          ],
        },
        { id: 'cp3', title: '锁定结构', plannedActions: ['schema.lock'], validation: 'locked=true', dependsOn: ['cp2'] },
        {
          id: 'cp4',
          title: '视图配置',
          plannedActions: [],
          validation: '5张表视图配置',
          dependsOn: ['cp3'],
          planItems: [
            { id: 'cp4.item1', title: '配置 LeaveTypes 视图', action: 'dataview.configure' },
            { id: 'cp4.item2', title: '配置 LeaveRequests 视图', action: 'dataview.configure', dependsOn: ['cp4.item1'] },
            { id: 'cp4.item3', title: '配置 ApprovalRecords 视图', action: 'dataview.configure', dependsOn: ['cp4.item2'] },
            { id: 'cp4.item4', title: '配置 LeaveBalances 视图', action: 'dataview.configure', dependsOn: ['cp4.item3'] },
            { id: 'cp4.item5', title: '配置 ApprovalFlows 视图', action: 'dataview.configure', dependsOn: ['cp4.item4'] },
          ],
        },
        {
          id: 'cp5',
          title: '级联依赖',
          plannedActions: [],
          validation: '3条依赖',
          dependsOn: ['cp4'],
          planItems: [
            { id: 'cp5.item1', title: 'LeaveTypes -> LeaveRequests 依赖', action: 'dependency.add' },
            { id: 'cp5.item2', title: 'LeaveRequests -> ApprovalRecords 依赖', action: 'dependency.add', dependsOn: ['cp5.item1'] },
            { id: 'cp5.item3', title: 'LeaveTypes -> LeaveBalances 依赖', action: 'dependency.add', dependsOn: ['cp5.item2'] },
          ],
        },
        {
          id: 'cp6',
          title: '校验导出',
          plannedActions: [],
          validation: 'clean',
          dependsOn: ['cp5'],
          planItems: [
            { id: 'cp6.item1', title: '校验数据集', action: 'dataset.validate' },
            { id: 'cp6.item2', title: '导出数据集', action: 'dataset.export', dependsOn: ['cp6.item1'] },
          ],
        },
      ],
    })
    expectOk(s3)

    // Step ④: dataset.init
    exec('dataset.init', { dataSetName: 'LeaveSystem' })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp0.item1', note: '数据集初始化完成' })
    exec('blueprint.advance', { completedCheckpointId: 'cp0' })

    // ── cp1: 建表 ──

    // LeaveTypes
    exec('datatable.create', {
      tableName: 'LeaveTypes',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true, label: '假别ID' },
        { name: 'name', type: 'string', label: '假别名称' },
        { name: 'maxDays', type: 'number', label: '最大天数' },
        { name: 'needProof', type: 'boolean', label: '需要证明' },
        { name: 'description', type: 'string', label: '说明' },
        { name: 'enabled', type: 'boolean', label: '启用' },
      ],
    })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp1.item1', note: 'LeaveTypes 创建完成' })

    // LeaveRequests
    exec('datatable.create', {
      tableName: 'LeaveRequests',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true, label: '申请ID' },
        { name: 'leaveTypeId', type: 'string', label: '假别' },
        { name: 'applicant', type: 'string', label: '申请人' },
        { name: 'startDate', type: 'string', label: '开始日期' },
        { name: 'endDate', type: 'string', label: '结束日期' },
        { name: 'days', type: 'number', label: '天数' },
        { name: 'reason', type: 'string', label: '事由' },
        { name: 'status', type: 'string', label: '状态' },
        { name: 'createdAt', type: 'string', label: '提交时间' },
      ],
    })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp1.item2', note: 'LeaveRequests 创建完成' })

    // ApprovalRecords
    exec('datatable.create', {
      tableName: 'ApprovalRecords',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true, label: '审批ID' },
        { name: 'requestId', type: 'string', label: '申请ID' },
        { name: 'approver', type: 'string', label: '审批人' },
        { name: 'action', type: 'string', label: '审批动作' },
        { name: 'comment', type: 'string', label: '审批意见' },
        { name: 'timestamp', type: 'string', label: '审批时间' },
      ],
    })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp1.item3', note: 'ApprovalRecords 创建完成' })

    // LeaveBalances
    exec('datatable.create', {
      tableName: 'LeaveBalances',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true, label: 'ID' },
        { name: 'employeeId', type: 'string', label: '员工ID' },
        { name: 'leaveTypeId', type: 'string', label: '假别' },
        { name: 'year', type: 'number', label: '年度' },
        { name: 'total', type: 'number', label: '总额度' },
        { name: 'used', type: 'number', label: '已用' },
        { name: 'remaining', type: 'number', label: '剩余', computeExpression: 'total - used' },
      ],
    })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp1.item4', note: 'LeaveBalances 创建完成' })

    // ApprovalFlows
    exec('datatable.create', {
      tableName: 'ApprovalFlows',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true, label: 'ID' },
        { name: 'leaveTypeId', type: 'string', label: '假别' },
        { name: 'step', type: 'number', label: '步骤序号' },
        { name: 'approverRole', type: 'string', label: '审批角色' },
        { name: 'condition', type: 'string', label: '条件表达式' },
      ],
    })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp1.item5', note: 'ApprovalFlows 创建完成' })

    expect(Object.keys(datasetState().data!.tables).length).toBe(5)
    exec('blueprint.advance', { completedCheckpointId: 'cp1' })

    // ── cp2: 关系 ──
    exec('relation.add', { parentTable: 'LeaveTypes', childTable: 'LeaveRequests', parentField: 'id', childField: 'leaveTypeId' })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp2.item1', note: 'LeaveTypes -> LeaveRequests 关系完成' })
    exec('relation.add', { parentTable: 'LeaveRequests', childTable: 'ApprovalRecords', parentField: 'id', childField: 'requestId' })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp2.item2', note: 'LeaveRequests -> ApprovalRecords 关系完成' })
    exec('relation.add', { parentTable: 'LeaveTypes', childTable: 'LeaveBalances', parentField: 'id', childField: 'leaveTypeId' })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp2.item3', note: 'LeaveTypes -> LeaveBalances 关系完成' })
    exec('relation.add', { parentTable: 'LeaveTypes', childTable: 'ApprovalFlows', parentField: 'id', childField: 'leaveTypeId' })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp2.item4', note: 'LeaveTypes -> ApprovalFlows 关系完成' })

    expect(datasetState().data!.tableRelations!.length).toBe(4)
    exec('blueprint.advance', { completedCheckpointId: 'cp2' })

    // ── cp3: schema.lock ──
    const lockResult = exec('schema.lock')
    expectOk(lockResult)
    exec('blueprint.item.advance', { completedPlanItemId: 'cp3.item1', note: 'schema.lock 完成' })
    exec('blueprint.advance', { completedCheckpointId: 'cp3' })

    // ── cp4: dataview.configure ──
    exec('dataview.configure', { tableName: 'LeaveTypes', config: { autoLoad: true, autoCurrentFirst: true } })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp4.item1', note: 'LeaveTypes 视图完成' })
    exec('dataview.configure', { tableName: 'LeaveRequests', config: { autoLoad: true, autoCurrentFirst: true, pageSize: 20 } })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp4.item2', note: 'LeaveRequests 视图完成' })
    exec('dataview.configure', { tableName: 'ApprovalRecords', config: { autoLoad: false } })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp4.item3', note: 'ApprovalRecords 视图完成' })
    exec('dataview.configure', { tableName: 'LeaveBalances', config: { autoLoad: true } })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp4.item4', note: 'LeaveBalances 视图完成' })
    exec('dataview.configure', { tableName: 'ApprovalFlows', config: { autoLoad: false } })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp4.item5', note: 'ApprovalFlows 视图完成' })
    exec('blueprint.advance', { completedCheckpointId: 'cp4' })

    // ── cp5: dependency.add ──
    exec('dependency.add', { parentTable: 'LeaveTypes', childTable: 'LeaveRequests', dependencyType: 'currentRow' })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp5.item1', note: '第一条 dependency 完成' })
    exec('dependency.add', { parentTable: 'LeaveRequests', childTable: 'ApprovalRecords', dependencyType: 'currentRow' })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp5.item2', note: '第二条 dependency 完成' })
    exec('dependency.add', { parentTable: 'LeaveTypes', childTable: 'LeaveBalances', dependencyType: 'currentRow' })
    exec('blueprint.item.advance', { completedPlanItemId: 'cp5.item3', note: '第三条 dependency 完成' })

    expect(datasetState().data!.viewDependencies!.length).toBe(3)
    exec('blueprint.advance', { completedCheckpointId: 'cp5' })

    // ── cp6: validate + export ──
    const validateResult = exec('dataset.validate')
    expectOk(validateResult)
    expect((validateResult.data as { valid: boolean }).valid).toBe(true)
    exec('blueprint.item.advance', { completedPlanItemId: 'cp6.item1', note: 'dataset.validate 完成' })

    const exportResult = exec('dataset.export')
    expectOk(exportResult)
    const snap = (exportResult.data as { snapshot: { dataSetName: string; tables: Record<string, unknown> } }).snapshot
    expect(snap.dataSetName).toBe('LeaveSystem')
    expect(Object.keys(snap.tables).length).toBe(5)
    exec('blueprint.item.advance', { completedPlanItemId: 'cp6.item2', note: 'dataset.export 完成' })

    exec('blueprint.advance', { completedCheckpointId: 'cp6' })

    // Verify all checkpoints done
    expect(session.blueprint!.checkpoints.every((cp) => cp.status === 'done')).toBe(true)

    // Verify patchLog has entries
    expect(session.patchLog.length).toBeGreaterThan(10)
  })
})
