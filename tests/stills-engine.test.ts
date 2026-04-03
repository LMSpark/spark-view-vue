/**
 * Stills Engine — 完整请假系统流程测试
 *
 * 模拟 STILLS_BLUEPRINT_PROMPT 中的 SAP 协议全流程：
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
  it('registers 32 stills', () => {
    expect(getAllStills().size).toBe(32)
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
    expect((r.data as { actions: unknown[] }).actions.length).toBe(32)
  })

  it('stills.actionSpec returns spec for known action', () => {
    const r = exec('stills.actionSpec', { action: 'datatable.create' })
    expectOk(r)
    const data = r.data as { action: string; description: string }
    expect(data.action).toBe('datatable.create')
  })

  it('stills.actionSpec fails for unknown action', () => {
    const r = exec('stills.actionSpec', { action: 'nonexistent' })
    expectFail(r, 'UNKNOWN_ACTION')
  })

  it('session.describe returns initial state', () => {
    const r = exec('session.describe')
    expectOk(r)
    const data = r.data as { phase: string; locked: boolean }
    expect(data.phase).toBe('discover')
    expect(data.locked).toBe(false)
  })
})

describe('blueprint stills (P1)', () => {
  it('blueprint.create requires title and requirements', () => {
    const r = exec('blueprint.create', { title: '', requirements: '', checkpoints: [] })
    expectFail(r, 'INVALID_PARAMS')
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

  it('blueprint.describe after creation', () => {
    exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [{
        id: 'cp1',
        title: '步骤1',
        plannedActions: ['test'],
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
        plannedActions: ['test'],
        validation: 'test',
        executionMode: 'subagent',
      }],
    })
    expectFail(r, 'INVALID_PARAMS')
  })

  it('blueprint.advance marks checkpoint done', () => {
    exec('blueprint.create', {
      title: '测试',
      requirements: '测试需求',
      checkpoints: [
        { id: 'cp1', title: '步骤1', plannedActions: ['a'], validation: 'v1' },
        {
          id: 'cp2',
          title: '步骤2',
          plannedActions: ['b'],
          validation: 'v2',
          dependsOn: ['cp1'],
          relatedCheckpointIds: ['cp1'],
          executionMode: 'subagent',
          subagentGoal: '独立补齐步骤2',
        },
      ],
    })
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
            { id: 'cp1.item1', title: '建表', action: 'datatable.create' },
            { id: 'cp1.item2', title: '建关系', action: 'relation.add', dependsOn: ['cp1.item1'] },
          ],
        },
      ],
    })
    const r = exec('blueprint.item.advance', { completedPlanItemId: 'cp1.item1', note: '建表完成' })
    expectOk(r)
    const blueprint = expectDefined(session.blueprint)
    expect(blueprint.currentCheckpointId).toBe('cp1')
    expect(blueprint.currentPlanItemId).toBe('cp1.item2')
    expect(blueprint.checkpoints[0]?.planItems[0]?.status).toBe('done')
    expect(blueprint.checkpoints[0]?.status).toBe('pending')
  })
})

function createTestBlueprint(): void {
  exec('blueprint.create', {
    title: '测试蓝图',
    requirements: '测试',
    checkpoints: [{ id: 'cp1', title: '步骤1', plannedActions: ['a'], validation: 'v' }],
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
  })

  it('rejects ops requiring dataset when no dataset', () => {
    createTestBlueprint()
    const r = exec('datatable.create', {
      tableName: 'T',
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
    })
    expectFail(r, 'NO_DATASET')
  })

  it('unknown action returns UNKNOWN_ACTION', () => {
    const r = exec('nonexistent.action')
    expectFail(r, 'UNKNOWN_ACTION')
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
        { id: 'cp1', title: '建表阶段', plannedActions: ['datatable.create×5'], validation: '5张表+PK' },
        { id: 'cp2', title: '关系阶段', plannedActions: ['relation.add×4'], validation: '4条关系' },
        { id: 'cp3', title: '锁定结构', plannedActions: ['schema.lock'], validation: 'locked=true' },
        { id: 'cp4', title: '视图配置', plannedActions: ['dataview.configure×5'], validation: '5张表视图配置' },
        { id: 'cp5', title: '级联依赖', plannedActions: ['dependency.add×3'], validation: '3条依赖' },
        { id: 'cp6', title: '校验导出', plannedActions: ['dataset.validate', 'dataset.export'], validation: 'clean' },
      ],
    })
    expectOk(s3)

    // Step ④: dataset.init
    exec('dataset.init', { dataSetName: 'LeaveSystem' })

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

    expect(Object.keys(datasetState().data!.tables).length).toBe(5)
    exec('blueprint.advance', { completedCheckpointId: 'cp1' })

    // ── cp2: 关系 ──
    exec('relation.add', { parentTable: 'LeaveTypes', childTable: 'LeaveRequests', parentField: 'id', childField: 'leaveTypeId' })
    exec('relation.add', { parentTable: 'LeaveRequests', childTable: 'ApprovalRecords', parentField: 'id', childField: 'requestId' })
    exec('relation.add', { parentTable: 'LeaveTypes', childTable: 'LeaveBalances', parentField: 'id', childField: 'leaveTypeId' })
    exec('relation.add', { parentTable: 'LeaveTypes', childTable: 'ApprovalFlows', parentField: 'id', childField: 'leaveTypeId' })

    expect(datasetState().data!.tableRelations!.length).toBe(4)
    exec('blueprint.advance', { completedCheckpointId: 'cp2' })

    // ── cp3: schema.lock ──
    const lockResult = exec('schema.lock')
    expectOk(lockResult)
    exec('blueprint.advance', { completedCheckpointId: 'cp3' })

    // ── cp4: dataview.configure ──
    exec('dataview.configure', { tableName: 'LeaveTypes', config: { autoLoad: true, autoCurrentFirst: true } })
    exec('dataview.configure', { tableName: 'LeaveRequests', config: { autoLoad: true, autoCurrentFirst: true, pageSize: 20 } })
    exec('dataview.configure', { tableName: 'ApprovalRecords', config: { autoLoad: false } })
    exec('dataview.configure', { tableName: 'LeaveBalances', config: { autoLoad: true } })
    exec('dataview.configure', { tableName: 'ApprovalFlows', config: { autoLoad: false } })
    exec('blueprint.advance', { completedCheckpointId: 'cp4' })

    // ── cp5: dependency.add ──
    exec('dependency.add', { parentTable: 'LeaveTypes', childTable: 'LeaveRequests', dependencyType: 'currentRow' })
    exec('dependency.add', { parentTable: 'LeaveRequests', childTable: 'ApprovalRecords', dependencyType: 'currentRow' })
    exec('dependency.add', { parentTable: 'LeaveTypes', childTable: 'LeaveBalances', dependencyType: 'currentRow' })

    expect(datasetState().data!.viewDependencies!.length).toBe(3)
    exec('blueprint.advance', { completedCheckpointId: 'cp5' })

    // ── cp6: validate + export ──
    const validateResult = exec('dataset.validate')
    expectOk(validateResult)
    expect((validateResult.data as { valid: boolean }).valid).toBe(true)

    const exportResult = exec('dataset.export')
    expectOk(exportResult)
    const snap = (exportResult.data as { snapshot: { dataSetName: string; tables: Record<string, unknown> } }).snapshot
    expect(snap.dataSetName).toBe('LeaveSystem')
    expect(Object.keys(snap.tables).length).toBe(5)

    exec('blueprint.advance', { completedCheckpointId: 'cp6' })

    // Verify all checkpoints done
    expect(session.blueprint!.checkpoints.every((cp) => cp.status === 'done')).toBe(true)

    // Verify patchLog has entries
    expect(session.patchLog.length).toBeGreaterThan(10)
  })
})
