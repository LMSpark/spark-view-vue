import { describe, it, expect } from 'vitest'
import {
  // session-state
  STEP_REGISTRY,
  createEmptySession,
  isDataRegistryLocked,
  getRegisteredTableNames,
  getRegisteredColumnNames,
  getRegisteredViewKeys,
  getDependentProposals,
  // session-state write operations
  advanceStep,
  canAdvanceTo,
  registerTable,
  lockDataRegistry,
  registerView,
  appendUIRegistry,
  recordAcceptedProposal,
  addDependency,
  removeDependency,
  checkCascadeImpact,
  formatCascadeNotification,
  // apply / context / serialize / validate
  applyProposalToSession,
  buildSessionContextPrompt,
  serializeSession,
  deserializeSession,
  runFullValidation,
  // pipeline
  ResponsePipeline,
  BlockExtractorProcessor,
  ProposalValidatorProcessor,
  SchemaCheckerProcessor,
  RegistryValidatorProcessor,
  AutoResponderProcessor,
} from '@spark-view/spark-ai'
import type {
  PersistedDesignSession,
  RegistryTable,
  CascadeImpact,
} from '@spark-view/spark-ai'

// ═══════════════════════════════════════════════════════════════════════════════
// Part 1: session-state 工厂函数与名册辅助
// ═══════════════════════════════════════════════════════════════════════════════

describe('STEP_REGISTRY', () => {
  it('has 10 steps: A1-A4, B1-B6', () => {
    expect(STEP_REGISTRY).toHaveLength(10)
    const ids = STEP_REGISTRY.map((s) => s.id)
    expect(ids).toEqual(['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6'])
  })

  it('Pass A steps are labeled A, Pass B steps labeled B', () => {
    const passA = STEP_REGISTRY.filter((s) => s.pass === 'A')
    const passB = STEP_REGISTRY.filter((s) => s.pass === 'B')
    expect(passA).toHaveLength(4)
    expect(passB).toHaveLength(6)
  })

  it('A3/A4 produce data-model, B1 produces view-plan', () => {
    const a3 = STEP_REGISTRY.find((s) => s.id === 'A3')
    expect(a3?.produces).toContain('data-model')
    const b1 = STEP_REGISTRY.find((s) => s.id === 'B1')
    expect(b1?.produces).toContain('view-plan')
  })
})

describe('createEmptySession', () => {
  it('returns a valid empty session with version 1', () => {
    const session = createEmptySession()
    expect(session.version).toBe(1)
    expect(session.currentPass).toBe('A')
    expect(session.currentStep).toBe('A1')
  })

  it('has empty registries', () => {
    const session = createEmptySession()
    expect(session.dataRegistry.tables).toEqual({})
    expect(session.dataRegistry.lockedAt).toBeNull()
    expect(session.viewRegistry.views).toEqual({})
    expect(session.uiRegistry.componentIds).toEqual([])
    expect(session.uiRegistry.functionNames).toEqual([])
    expect(session.uiRegistry.cssClassesDefined).toEqual([])
    expect(session.uiRegistry.cssClassesReferenced).toEqual([])
  })

  it('has empty proposals and dependency graph', () => {
    const session = createEmptySession()
    expect(session.acceptedProposals).toEqual([])
    expect(session.dependencyGraph).toEqual({})
  })

  it('returns independent instances (no shared state)', () => {
    const a = createEmptySession()
    const b = createEmptySession()
    a.dataRegistry.tables['Orders'] = { columns: [], relations: [] }
    expect(b.dataRegistry.tables).toEqual({})
  })
})

describe('isDataRegistryLocked', () => {
  it('returns false for a fresh session', () => {
    expect(isDataRegistryLocked(createEmptySession())).toBe(false)
  })

  it('returns true when lockedAt is set', () => {
    const session = createEmptySession()
    session.dataRegistry.lockedAt = '2026-03-21T10:00:00Z'
    expect(isDataRegistryLocked(session)).toBe(true)
  })
})

describe('getRegisteredTableNames', () => {
  it('returns empty array for empty registry', () => {
    expect(getRegisteredTableNames(createEmptySession())).toEqual([])
  })

  it('returns all table names', () => {
    const session = createEmptySession()
    session.dataRegistry.tables['Orders'] = { columns: [], relations: [] }
    session.dataRegistry.tables['Users'] = { columns: [], relations: [] }
    const names = getRegisteredTableNames(session)
    expect(names.sort()).toEqual(['Orders', 'Users'])
  })
})

describe('getRegisteredColumnNames', () => {
  it('returns empty for non-existent table', () => {
    expect(getRegisteredColumnNames(createEmptySession(), 'NoSuch')).toEqual([])
  })

  it('returns column names for existing table', () => {
    const session = createEmptySession()
    session.dataRegistry.tables['Orders'] = {
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'amount', type: 'number' },
        { name: 'customer', type: 'string' },
      ],
      relations: [],
    }
    expect(getRegisteredColumnNames(session, 'Orders')).toEqual(['id', 'amount', 'customer'])
  })
})

describe('getRegisteredViewKeys', () => {
  it('returns empty for empty view registry', () => {
    expect(getRegisteredViewKeys(createEmptySession())).toEqual([])
  })

  it('returns view keys', () => {
    const session = createEmptySession()
    session.viewRegistry.views['Orders@default'] = {
      tableName: 'Orders', viewId: 'default', purpose: '主列表', origin: 'auto-default',
    }
    session.viewRegistry.views['Orders@grid'] = {
      tableName: 'Orders', viewId: 'grid', purpose: '网格视图', origin: 'planned',
    }
    expect(getRegisteredViewKeys(session).sort()).toEqual(['Orders@default', 'Orders@grid'])
  })
})

describe('getDependentProposals', () => {
  it('returns empty for non-existent key', () => {
    expect(getDependentProposals(createEmptySession(), 'Orders.amount')).toEqual([])
  })

  it('returns proposal IDs for existing key', () => {
    const session = createEmptySession()
    session.dependencyGraph['Orders.amount'] = ['p-1', 'p-3']
    expect(getDependentProposals(session, 'Orders.amount')).toEqual(['p-1', 'p-3'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Part 2: RegistryValidatorProcessor — 名册交叉校验
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 构建一个预填充的 session，方便测试名册交叉校验
 */
function buildTestSession(): PersistedDesignSession {
  const session = createEmptySession()
  session.currentPass = 'B'
  session.currentStep = 'B2'
  session.dataRegistry.lockedAt = '2026-03-21T10:00:00Z'
  session.dataRegistry.tables['Orders'] = {
    columns: [
      { name: 'id', type: 'string', isPrimaryKey: true },
      { name: 'amount', type: 'number' },
      { name: 'customer', type: 'string' },
      { name: 'status', type: 'string' },
    ],
    relations: [{ childTable: 'OrderItems', parentField: 'id', childField: 'orderId' }],
  }
  session.dataRegistry.tables['OrderItems'] = {
    columns: [
      { name: 'id', type: 'string', isPrimaryKey: true },
      { name: 'orderId', type: 'string' },
      { name: 'product', type: 'string' },
      { name: 'qty', type: 'number' },
      { name: 'price', type: 'number' },
    ],
    relations: [],
  }
  session.viewRegistry.views['Orders@default'] = {
    tableName: 'Orders', viewId: 'default', purpose: '主列表', origin: 'auto-default',
  }
  return session
}

function createFullPipeline(): ResponsePipeline {
  return new ResponsePipeline()
    .use(new BlockExtractorProcessor())
    .use(new ProposalValidatorProcessor())
    .use(new SchemaCheckerProcessor())
    .use(new RegistryValidatorProcessor())
    .use(new AutoResponderProcessor())
}

describe('RegistryValidatorProcessor', () => {
  // ── 无 session 时跳过 ───────────────────────────────────────────────────────

  it('skips validation when no session provided', async () => {
    const pipeline = createFullPipeline()
    const text = `
@@proposal:ui-structure
# 引用不存在的表
[{"type": "r-table", "dataKey": "Unknown@rows"}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-no-session')
    // 无 session 时 RegistryValidator 跳过，只有 SchemaChecker 的格式警告（如果有的话）
    const tableRefErrors = ctx.validationErrors.filter((e) => e.checkType === 'table-reference')
    expect(tableRefErrors).toHaveLength(0)
  })

  // ── ui-structure：dataKey 表名校验 ──────────────────────────────────────────

  it('passes when dataKey references existing table', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 订单列表
[{"type": "r-table", "dataKey": "Orders@rows", "children": [
  {"type": "r-text", "name": "customer"},
  {"type": "r-number", "name": "amount"}
]}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-ok', session)
    const tableRefErrors = ctx.validationErrors.filter((e) => e.checkType === 'table-reference')
    expect(tableRefErrors).toHaveLength(0)
  })

  it('reports error when dataKey references unknown table', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 用户列表
[{"type": "r-table", "dataKey": "Users@rows"}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-unknown-tbl', session)
    const tableRefErrors = ctx.validationErrors.filter((e) => e.checkType === 'table-reference')
    expect(tableRefErrors).toHaveLength(1)
    expect(tableRefErrors[0]?.message).toContain('Users')
    expect(tableRefErrors[0]?.message).toContain('不在名册A')
  })

  it('validates nested children dataKey references', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 主从布局
[
  {"type": "r-table", "dataKey": "Orders@rows", "children": [
    {"type": "r-text", "name": "customer"}
  ]},
  {"type": "r-table", "dataKey": "Nonexistent@rows"}
]
@@end`
    const ctx = await pipeline.execute(text, 'msg-nested', session)
    const tableRefErrors = ctx.validationErrors.filter(
      (e) => e.checkType === 'table-reference' && e.message.includes('Nonexistent'),
    )
    expect(tableRefErrors).toHaveLength(1)
  })

  // ── ui-structure：列名校验（warning 级别）──────────────────────────────────

  it('warns when name field not in table columns', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 订单列表
[{"type": "r-table", "dataKey": "Orders@rows", "children": [
  {"type": "r-text", "name": "nonExistentField"}
]}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-colwarn', session)
    const colWarnings = ctx.validationErrors.filter(
      (e) => e.severity === 'warning' && e.message.includes('nonExistentField'),
    )
    expect(colWarnings).toHaveLength(1)
    expect(colWarnings[0]?.suggestion).toContain('id')
    expect(colWarnings[0]?.suggestion).toContain('amount')
  })

  it('does not warn when name field exists in table columns', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 订单列表
[{"type": "r-table", "dataKey": "Orders@rows", "children": [
  {"type": "r-text", "name": "customer"},
  {"type": "r-number", "name": "amount"}
]}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-colok', session)
    const colWarnings = ctx.validationErrors.filter(
      (e) => e.severity === 'warning' && e.checkType === 'table-reference',
    )
    expect(colWarnings).toHaveLength(0)
  })

  // ── ui-structure：根级 dataKey 表名校验 ──────────────────────────────────

  it('validates dataKey with unknown table reference', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 根级 dataKey 校验
[{"type": "r-table", "dataKey": "Unknown@rows"}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-meta', session)
    const tableRefErrors = ctx.validationErrors.filter(
      (e) => e.checkType === 'table-reference' && e.message.includes('Unknown'),
    )
    expect(tableRefErrors).toHaveLength(1)
  })

  // ── ui-structure：#scope 跨页面 dataKey 跳过 ──────────────────────────────

  it('skips cross-page #scope dataKey validation', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 跨页面引用
[{"type": "r-table", "dataKey": "#SharedDS@GlobalUsers@rows"}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-scope', session)
    // #scope 开头的 dataKey，extractDataKey 返回的 raw 以 # 开头，应被跳过
    const tableRefErrors = ctx.validationErrors.filter(
      (e) => e.checkType === 'table-reference' && e.message.includes('GlobalUsers'),
    )
    expect(tableRefErrors).toHaveLength(0)
  })

  // ── view-plan：Markdown 表格中的表名校验 ──────────────────────────────────

  it('validates view-plan table references against DataRegistry', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:view-plan
# 视图规划表
| 视图 Key | 表名 | viewId | 用途 |
|---|---|---|---|
| Orders@default | Orders | default | 主列表 |
| OrderItems@grid | OrderItems | grid | 子项网格 |
@@end`
    const ctx = await pipeline.execute(text, 'msg-vp-ok', session)
    const tableRefErrors = ctx.validationErrors.filter((e) => e.checkType === 'table-reference')
    expect(tableRefErrors).toHaveLength(0)
  })

  it('reports error for view-plan referencing unknown table', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:view-plan
# 视图规划
| 视图 Key | 表名 | viewId | 用途 |
|---|---|---|---|
| Orders@default | Orders | default | 主列表 |
| Products@grid | Products | grid | 产品网格 |
@@end`
    const ctx = await pipeline.execute(text, 'msg-vp-err', session)
    const tableRefErrors = ctx.validationErrors.filter(
      (e) => e.checkType === 'table-reference' && e.message.includes('Products'),
    )
    expect(tableRefErrors).toHaveLength(1)
    expect(tableRefErrors[0]?.suggestion).toContain('Orders')
  })

  // ── data-model：重复表名警告 ──────────────────────────────────────────────

  it('warns when data-model proposes table already in registry (tables format)', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:data-model
# 修改订单表
{
  "tables": {
    "Orders": {
      "columns": [{"name": "id", "type": "string"}]
    }
  }
}
@@end`
    const ctx = await pipeline.execute(text, 'msg-dup-tbl', session)
    const dupWarnings = ctx.validationErrors.filter(
      (e) => e.severity === 'warning' && e.message.includes('Orders') && e.message.includes('已在名册A'),
    )
    expect(dupWarnings).toHaveLength(1)
  })

  it('warns when data-model proposes existing table (tableName format)', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:data-model
# 修改订单表
{
  "tableName": "Orders",
  "columns": [{"name": "id", "type": "string"}]
}
@@end`
    const ctx = await pipeline.execute(text, 'msg-dup-tblname', session)
    const dupWarnings = ctx.validationErrors.filter(
      (e) => e.severity === 'warning' && e.message.includes('已在名册A'),
    )
    expect(dupWarnings).toHaveLength(1)
  })

  it('no warning for new table in data-model', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:data-model
# 新增产品表
{
  "tableName": "Products",
  "columns": [{"name": "id", "type": "string"}, {"name": "name", "type": "string"}]
}
@@end`
    const ctx = await pipeline.execute(text, 'msg-new-tbl', session)
    const dupWarnings = ctx.validationErrors.filter(
      (e) => e.message.includes('已在名册A'),
    )
    expect(dupWarnings).toHaveLength(0)
  })

  // ── AutoResponder 自动生成校验反馈 ────────────────────────────────────────

  it('generates validation feedback auto message when errors exist', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 错误引用
[{"type": "r-table", "dataKey": "FakeTable@rows"}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-feedback', session)
    expect(ctx.validationErrors.length).toBeGreaterThan(0)
    const feedbackMsg = ctx.autoMessages.find((m) => m.type === 'validation-feedback')
    expect(feedbackMsg).toBeDefined()
    expect(feedbackMsg?.content).toContain('FakeTable')
  })

  // ── 边界场景 ──────────────────────────────────────────────────────────────

  it('handles empty data registry gracefully (no false positives)', async () => {
    const pipeline = createFullPipeline()
    const session = createEmptySession() // 空名册
    const text = `
@@proposal:ui-structure
# 结构
[{"type": "r-table", "dataKey": "AnyTable@rows"}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-empty-reg', session)
    // 空名册时 tableNames.size === 0，不应触发表名校验
    const tableRefErrors = ctx.validationErrors.filter((e) => e.checkType === 'table-reference')
    expect(tableRefErrors).toHaveLength(0)
  })

  it('handles proposal with no dataKey gracefully', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 纯布局
[{"type": "div", "children": [{"type": "el-button", "props": {"type": "primary"}}]}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-no-dk', session)
    const tableRefErrors = ctx.validationErrors.filter((e) => e.checkType === 'table-reference')
    expect(tableRefErrors).toHaveLength(0)
  })

  it('handles view-plan with no Markdown table gracefully', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:view-plan
# 视图规划
这只是一段描述文本，没有 Markdown 表格。
@@end`
    const ctx = await pipeline.execute(text, 'msg-vp-nomd', session)
    // 不含 | 行的 view-plan 不应崩溃
    const tableRefErrors = ctx.validationErrors.filter((e) => e.checkType === 'table-reference')
    expect(tableRefErrors).toHaveLength(0)
  })

  it('handles 3-segment dataKey (table@viewId@field)', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 带视图ID
[{"type": "r-table", "dataKey": "Orders@grid@rows"}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-3seg', session)
    // Orders 在名册中，不应报错
    const tableRefErrors = ctx.validationErrors.filter((e) => e.checkType === 'table-reference')
    expect(tableRefErrors).toHaveLength(0)
  })

  it('validates 3-segment dataKey with unknown table', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 带视图ID但表不存在
[{"type": "r-table", "dataKey": "Invoices@grid@rows"}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-3seg-err', session)
    const tableRefErrors = ctx.validationErrors.filter(
      (e) => e.checkType === 'table-reference' && e.message.includes('Invoices'),
    )
    expect(tableRefErrors).toHaveLength(1)
  })

  // ── view-plan：动态表头定位 ─────────────────────────────────────────────

  it('locates table column by header name when column order varies', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    // 表名列在第 3 列（非默认位置）
    const text = `
@@proposal:view-plan
# 视图规划（列顺序不同）
| viewId | 用途 | 表名 | 来源 |
|---|---|---|---|
| default | 主列表 | Orders | auto-default |
| grid | 子项 | Products | planned |
@@end`
    const ctx = await pipeline.execute(text, 'msg-vp-reorder', session)
    const tableRefErrors = ctx.validationErrors.filter(
      (e) => e.checkType === 'table-reference' && e.message.includes('Products'),
    )
    // Products 不在名册A，应检测到 1 个错误
    expect(tableRefErrors).toHaveLength(1)
    // Orders 在名册A，不应报错
    const ordersErrors = ctx.validationErrors.filter(
      (e) => e.checkType === 'table-reference' && e.message.includes('Orders'),
    )
    expect(ordersErrors).toHaveLength(0)
  })

  it('handles English header "tableName" for column detection', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:view-plan
# View Plan
| viewKey | tableName | viewId | purpose | origin |
|---|---|---|---|---|
| Orders-default | Orders | default | Main list | auto-default |
| Users-default | Users | default | User list | planned |
@@end`
    const ctx = await pipeline.execute(text, 'msg-vp-en', session)
    const tableRefErrors = ctx.validationErrors.filter(
      (e) => e.checkType === 'table-reference' && e.message.includes('Users'),
    )
    expect(tableRefErrors).toHaveLength(1)
  })

  // ── ui-structure：主从视图深层继承 ────────────────────────────────────────

  it('inherits table context across multiple nesting levels', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 三层嵌套
[{"type": "r-table", "dataKey": "Orders@rows", "children": [
  {"type": "div", "children": [
    {"type": "r-text", "name": "nonExistentDeep"}
  ]}
]}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-deep-inherit', session)
    const colWarnings = ctx.validationErrors.filter(
      (e) => e.severity === 'warning' && e.message.includes('nonExistentDeep'),
    )
    // div 无 dataKey，但继承父级 Orders，deep child 的 name 应被校验
    expect(colWarnings).toHaveLength(1)
  })

  it('child overrides parent table when child has own dataKey', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 子表覆盖父表
[{"type": "r-table", "dataKey": "Orders@rows", "children": [
  {"type": "r-table", "dataKey": "OrderItems@rows", "children": [
    {"type": "r-text", "name": "product"},
    {"type": "r-number", "name": "qty"}
  ]}
]}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-child-override', session)
    // product 和 qty 都在 OrderItems 列中，不应报错
    const colWarnings = ctx.validationErrors.filter(
      (e) => e.severity === 'warning' && e.checkType === 'table-reference',
    )
    expect(colWarnings).toHaveLength(0)
  })

  it('warns when child field not in overridden child table', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 子表字段引用错误
[{"type": "r-table", "dataKey": "Orders@rows", "children": [
  {"type": "r-table", "dataKey": "OrderItems@rows", "children": [
    {"type": "r-text", "name": "customer"}
  ]}
]}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-child-wrong-col', session)
    // customer 在 Orders 中但不在 OrderItems 中
    const colWarnings = ctx.validationErrors.filter(
      (e) => e.severity === 'warning' && e.message.includes('customer'),
    )
    expect(colWarnings).toHaveLength(1)
    expect(colWarnings[0]?.suggestion).toContain('OrderItems')
  })

  // ── ui-structure：根级 dataKey + children field 继承 ─────────────────

  it('inherits table from root dataKey to children field check', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 根级 dataKey 带继承
[{"type": "r-table", "dataKey": "OrderItems@rows", "children": [
  {"type": "r-text", "field": "product"},
  {"type": "r-text", "field": "nonExistent"}
]}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-meta-inherit', session)
    const colWarnings = ctx.validationErrors.filter(
      (e) => e.severity === 'warning' && e.checkType === 'table-reference',
    )
    // product 存在，nonExistent 不存在
    expect(colWarnings).toHaveLength(1)
    expect(colWarnings[0]?.message).toContain('nonExistent')
  })

  // ── data-model：多表同时提交 ──────────────────────────────────────────────

  it('warns for each duplicate table in multi-table data-model', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:data-model
# 多表提交
{
  "tables": {
    "Orders": {"columns": [{"name": "id", "type": "string"}]},
    "Products": {"columns": [{"name": "id", "type": "string"}]},
    "OrderItems": {"columns": [{"name": "id", "type": "string"}]}
  }
}
@@end`
    const ctx = await pipeline.execute(text, 'msg-multi-dup', session)
    const dupWarnings = ctx.validationErrors.filter(
      (e) => e.severity === 'warning' && e.message.includes('已在名册A'),
    )
    // Orders 和 OrderItems 已存在，Products 是新的
    expect(dupWarnings).toHaveLength(2)
  })

  // ── 多提案组合场景 ────────────────────────────────────────────────────────

  it('validates multiple proposals in same message', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:ui-structure
# 订单表
[{"type": "r-table", "dataKey": "Orders@rows", "children": [
  {"type": "r-text", "name": "customer"}
]}]
@@end

@@proposal:ui-structure
# 用户表（不存在）
[{"type": "r-table", "dataKey": "Users@rows"}]
@@end

@@proposal:view-plan
# 视图
| 视图 key | 表名 | viewId | 用途 |
|---|---|---|---|
| Users@default | Users | default | 用户列表 |
@@end`
    const ctx = await pipeline.execute(text, 'msg-multi-proposal', session)
    const userErrors = ctx.validationErrors.filter(
      (e) => e.checkType === 'table-reference' && e.message.includes('Users'),
    )
    // ui-structure 中 Users 不在名册 + view-plan 中 Users 不在名册 = 2 个错误
    expect(userErrors).toHaveLength(2)
    // Orders 相关不应有错误
    const orderErrors = ctx.validationErrors.filter(
      (e) => e.checkType === 'table-reference' && e.message.includes('Orders'),
    )
    expect(orderErrors).toHaveLength(0)
  })

  // ── 会话步骤进度感知（session.currentStep 不影响校验本身）──────────────────

  it('validates regardless of currentStep value', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    session.currentStep = 'A1' // 即使在 A1 步骤也校验
    const text = `
@@proposal:ui-structure
# 早期结构
[{"type": "r-table", "dataKey": "Unknown@rows"}]
@@end`
    const ctx = await pipeline.execute(text, 'msg-any-step', session)
    const tableRefErrors = ctx.validationErrors.filter((e) => e.checkType === 'table-reference')
    expect(tableRefErrors).toHaveLength(1)
  })

  // ── interaction：脚本表名引用校验 ─────────────────────────────────────────

  it('warns when interaction script references unknown table via getView', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:interaction
# 订单操作脚本
function __init__() {
  const view = $dataSet?.getView('NonExistentTable', 'default')
  view?.events.on('currentRowChanged', (row) => {})
}
function handleSave() {
  const items = $dataSet?.getView('OrderItems', 'default')?.rows
}
@@end`
    const ctx = await pipeline.execute(text, 'msg-interaction', session)
    const warnings = ctx.validationErrors.filter(
      (e) => e.severity === 'warning' && e.checkType === 'table-reference',
    )
    // NonExistentTable → warning, OrderItems → no warning (exists)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.message).toContain('NonExistentTable')
  })

  it('passes when interaction script only references known tables', async () => {
    const pipeline = createFullPipeline()
    const session = buildTestSession()
    const text = `
@@proposal:interaction
# 正确引用
function __init__() {
  const ordersView = $dataSet?.getView('Orders', 'default')
  const itemsView = $dataSet?.getView('OrderItems', 'grid')
}
@@end`
    const ctx = await pipeline.execute(text, 'msg-interaction-ok', session)
    const tableWarnings = ctx.validationErrors.filter(
      (e) => e.checkType === 'table-reference',
    )
    expect(tableWarnings).toHaveLength(0)
  })

  it('skips interaction validation when registry is empty', async () => {
    const pipeline = createFullPipeline()
    const session = createEmptySession() // 空名册
    const text = `
@@proposal:interaction
# 空名册时跳过
function handleClick() {
  $dataSet?.getView('AnyTable', 'default')
}
@@end`
    const ctx = await pipeline.execute(text, 'msg-interaction-empty', session)
    const warnings = ctx.validationErrors.filter(
      (e) => e.checkType === 'table-reference',
    )
    expect(warnings).toHaveLength(0) // 空名册不校验
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Part 3: session-state 写入操作与级联校验
// ═══════════════════════════════════════════════════════════════════════════════

describe('advanceStep', () => {
  it('advances from A1 to A2', () => {
    const session = createEmptySession()
    expect(session.currentStep).toBe('A1')
    const next = advanceStep(session)
    expect(next).toBe('A2')
    expect(session.currentStep).toBe('A2')
    expect(session.currentPass).toBe('A')
  })

  it('advances from A4 to B1 and sets pass=B', () => {
    const session = createEmptySession()
    session.currentStep = 'A4'
    const next = advanceStep(session)
    expect(next).toBe('B1')
    expect(session.currentStep).toBe('B1')
    expect(session.currentPass).toBe('B')
  })

  it('returns null at last step B6', () => {
    const session = createEmptySession()
    session.currentStep = 'B6'
    session.currentPass = 'B'
    const next = advanceStep(session)
    expect(next).toBeNull()
    expect(session.currentStep).toBe('B6')
  })

  it('advances through all 10 steps in order', () => {
    const session = createEmptySession()
    const steps: string[] = [session.currentStep]
    let step = advanceStep(session)
    while (step !== null) {
      steps.push(step)
      step = advanceStep(session)
    }
    expect(steps).toEqual(['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6'])
  })
})

describe('canAdvanceTo', () => {
  it('allows forward progression within same pass', () => {
    const session = createEmptySession()
    expect(canAdvanceTo(session, 'A2')).toBe(true)
    expect(canAdvanceTo(session, 'A4')).toBe(true)
  })

  it('rejects backward progression', () => {
    const session = createEmptySession()
    session.currentStep = 'A3'
    expect(canAdvanceTo(session, 'A1')).toBe(false)
    expect(canAdvanceTo(session, 'A3')).toBe(false) // same step = no advance
  })

  it('blocks Pass B entry when DataRegistry not locked', () => {
    const session = createEmptySession()
    session.currentStep = 'A4'
    expect(canAdvanceTo(session, 'B1')).toBe(false)
  })

  it('allows Pass B entry when DataRegistry locked', () => {
    const session = createEmptySession()
    session.currentStep = 'A4'
    session.dataRegistry.lockedAt = '2026-01-01T00:00:00Z'
    expect(canAdvanceTo(session, 'B1')).toBe(true)
  })
})

describe('registerTable', () => {
  it('adds a new table to DataRegistry', () => {
    const session = createEmptySession()
    const table: RegistryTable = {
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
      relations: [],
    }
    registerTable(session, 'Users', table)
    expect(getRegisteredTableNames(session)).toEqual(['Users'])
    expect(getRegisteredColumnNames(session, 'Users')).toEqual(['id', 'name'])
  })

  it('merges columns on duplicate table name (override existing, append new)', () => {
    const session = createEmptySession()
    registerTable(session, 'Orders', {
      columns: [
        { name: 'id', type: 'string' },
        { name: 'amount', type: 'number' },
      ],
      relations: [],
    })
    // Second registration: override 'amount' type, add 'status'
    registerTable(session, 'Orders', {
      columns: [
        { name: 'amount', type: 'string' }, // type changed
        { name: 'status', type: 'string' },
      ],
      relations: [],
    })
    const cols = getRegisteredColumnNames(session, 'Orders')
    expect(cols).toEqual(['id', 'amount', 'status'])
    // amount type should be overridden
    const amountCol = session.dataRegistry.tables['Orders']!.columns.find((c) => c.name === 'amount')
    expect(amountCol?.type).toBe('string')
  })

  it('deduplicates relations on merge', () => {
    const session = createEmptySession()
    registerTable(session, 'Orders', {
      columns: [{ name: 'id', type: 'string' }],
      relations: [{ childTable: 'Items', parentField: 'id', childField: 'orderId' }],
    })
    // Same relation again + a new one
    registerTable(session, 'Orders', {
      columns: [],
      relations: [
        { childTable: 'Items', parentField: 'id', childField: 'orderId' }, // dup
        { childTable: 'Payments', parentField: 'id', childField: 'orderId' },
      ],
    })
    expect(session.dataRegistry.tables['Orders']!.relations).toHaveLength(2)
  })

  it('merges aggregates on existing table', () => {
    const session = createEmptySession()
    registerTable(session, 'Orders', {
      columns: [{ name: 'amount', type: 'number' }],
      relations: [],
      aggregates: { amount: { type: 'sum' } },
    })
    registerTable(session, 'Orders', {
      columns: [],
      relations: [],
      aggregates: { count: { type: 'count' } },
    })
    expect(session.dataRegistry.tables['Orders']!.aggregates).toEqual({
      amount: { type: 'sum' },
      count: { type: 'count' },
    })
  })
})

describe('lockDataRegistry', () => {
  it('locks an unlocked registry', () => {
    const session = createEmptySession()
    const result = lockDataRegistry(session)
    expect(result).toBe(true)
    expect(isDataRegistryLocked(session)).toBe(true)
    expect(session.dataRegistry.lockedAt).toBeTruthy()
  })

  it('returns false when already locked', () => {
    const session = createEmptySession()
    lockDataRegistry(session)
    const result = lockDataRegistry(session)
    expect(result).toBe(false) // already locked
  })
})

describe('registerView', () => {
  it('adds a view to ViewRegistry', () => {
    const session = createEmptySession()
    registerView(session, 'Orders@grid', {
      tableName: 'Orders',
      viewId: 'grid',
      purpose: '订单网格',
      origin: 'planned',
    })
    expect(getRegisteredViewKeys(session)).toEqual(['Orders@grid'])
    expect(session.viewRegistry.views['Orders@grid']!.purpose).toBe('订单网格')
  })

  it('overwrites existing view with same key', () => {
    const session = createEmptySession()
    registerView(session, 'Orders@default', {
      tableName: 'Orders', viewId: 'default', purpose: '初始', origin: 'auto-default',
    })
    registerView(session, 'Orders@default', {
      tableName: 'Orders', viewId: 'default', purpose: '更新后', origin: 'planned',
    })
    expect(session.viewRegistry.views['Orders@default']!.purpose).toBe('更新后')
    expect(session.viewRegistry.views['Orders@default']!.origin).toBe('planned')
  })
})

describe('appendUIRegistry', () => {
  it('appends new entries to UIRegistry', () => {
    const session = createEmptySession()
    appendUIRegistry(session, {
      componentIds: ['btn-save', 'btn-delete'],
      functionNames: ['handleSave', 'handleDelete'],
      cssClassesDefined: ['.custom-row'],
      cssClassesReferenced: ['.el-table'],
    })
    expect(session.uiRegistry.componentIds).toEqual(['btn-save', 'btn-delete'])
    expect(session.uiRegistry.functionNames).toEqual(['handleSave', 'handleDelete'])
  })

  it('deduplicates on repeated appends', () => {
    const session = createEmptySession()
    appendUIRegistry(session, { componentIds: ['btn-save'] })
    appendUIRegistry(session, { componentIds: ['btn-save', 'btn-new'] })
    expect(session.uiRegistry.componentIds).toEqual(['btn-save', 'btn-new'])
  })
})

describe('recordAcceptedProposal', () => {
  it('records a new proposal', () => {
    const session = createEmptySession()
    recordAcceptedProposal(session, {
      id: 'p-1',
      type: 'data-model',
      title: '订单表结构',
      content: '...',
      step: 'A3',
      acceptedAt: '2026-01-01T00:00:00Z',
    })
    expect(session.acceptedProposals).toHaveLength(1)
    expect(session.acceptedProposals[0]!.id).toBe('p-1')
  })

  it('overwrites proposal with same ID', () => {
    const session = createEmptySession()
    recordAcceptedProposal(session, {
      id: 'p-1', type: 'data-model', title: 'v1', content: 'old', step: 'A3', acceptedAt: 't1',
    })
    recordAcceptedProposal(session, {
      id: 'p-1', type: 'data-model', title: 'v2', content: 'new', step: 'A3', acceptedAt: 't2',
    })
    expect(session.acceptedProposals).toHaveLength(1)
    expect(session.acceptedProposals[0]!.title).toBe('v2')
  })

  it('appends proposals with different IDs', () => {
    const session = createEmptySession()
    recordAcceptedProposal(session, {
      id: 'p-1', type: 'data-model', title: '表-1', content: '...', step: 'A3', acceptedAt: 't1',
    })
    recordAcceptedProposal(session, {
      id: 'p-2', type: 'view-plan', title: '视图-1', content: '...', step: 'B1', acceptedAt: 't2',
    })
    expect(session.acceptedProposals).toHaveLength(2)
  })
})

describe('addDependency / removeDependency', () => {
  it('adds dependency entries to graph', () => {
    const session = createEmptySession()
    addDependency(session, 'Orders.amount', 'p-1')
    addDependency(session, 'Orders.amount', 'p-2')
    addDependency(session, 'Users.name', 'p-1')
    expect(getDependentProposals(session, 'Orders.amount')).toEqual(['p-1', 'p-2'])
    expect(getDependentProposals(session, 'Users.name')).toEqual(['p-1'])
  })

  it('deduplicates proposal IDs within same key', () => {
    const session = createEmptySession()
    addDependency(session, 'Orders.id', 'p-1')
    addDependency(session, 'Orders.id', 'p-1') // dup
    expect(getDependentProposals(session, 'Orders.id')).toEqual(['p-1'])
  })

  it('removeDependency clears proposal from all keys', () => {
    const session = createEmptySession()
    addDependency(session, 'Orders.amount', 'p-1')
    addDependency(session, 'Orders.customer', 'p-1')
    addDependency(session, 'Users.name', 'p-2')
    removeDependency(session, 'p-1')
    expect(getDependentProposals(session, 'Orders.amount')).toEqual([])
    expect(getDependentProposals(session, 'Orders.customer')).toEqual([])
    expect(getDependentProposals(session, 'Users.name')).toEqual(['p-2'])
  })

  it('removes empty keys from dependency graph', () => {
    const session = createEmptySession()
    addDependency(session, 'Orders.amount', 'p-1')
    removeDependency(session, 'p-1')
    // Key should be cleaned up
    expect(Object.keys(session.dependencyGraph)).not.toContain('Orders.amount')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Part 4: 级联校验（CascadeImpact）
// ═══════════════════════════════════════════════════════════════════════════════

describe('checkCascadeImpact', () => {
  function setupSessionWithProposals(): PersistedDesignSession {
    const session = createEmptySession()
    // 名册A
    registerTable(session, 'Orders', {
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'amount', type: 'number' },
        { name: 'customer', type: 'string' },
      ],
      relations: [],
    })
    lockDataRegistry(session)
    session.currentStep = 'B2'
    session.currentPass = 'B'

    // 已采纳的 Pass B 提案
    recordAcceptedProposal(session, {
      id: 'p-ui-1', type: 'ui-structure', title: '订单列表 UI',
      content: '...', step: 'B2', acceptedAt: 't1',
    })
    recordAcceptedProposal(session, {
      id: 'p-view-1', type: 'view-plan', title: '订单视图规划',
      content: '...', step: 'B1', acceptedAt: 't2',
    })
    // Pass A 提案（不应出现在影响列表中）
    recordAcceptedProposal(session, {
      id: 'p-data-1', type: 'data-model', title: '订单数据模型',
      content: '...', step: 'A3', acceptedAt: 't3',
    })

    // 依赖图
    addDependency(session, 'Orders.amount', 'p-ui-1')
    addDependency(session, 'Orders.customer', 'p-ui-1')
    addDependency(session, 'Orders@default', 'p-view-1')
    addDependency(session, 'Orders.amount', 'p-data-1') // Pass A dep

    return session
  }

  it('reports affected Pass B proposals when columns removed', () => {
    const session = setupSessionWithProposals()
    const impacts = checkCascadeImpact(session, 'Orders', ['amount'])
    // p-ui-1 references Orders.amount, p-data-1 is Pass A (filtered out)
    expect(impacts.some((i) => i.proposalId === 'p-ui-1')).toBe(true)
    expect(impacts.some((i) => i.proposalId === 'p-data-1')).toBe(false)
  })

  it('reports view-level dependencies via wildcard key', () => {
    const session = setupSessionWithProposals()
    // Orders@default → p-view-1
    const impacts = checkCascadeImpact(session, 'Orders', [])
    // Even with no removed columns, the Orders@* wildcard + prefix scan finds p-view-1
    expect(impacts.some((i) => i.proposalId === 'p-view-1')).toBe(true)
  })

  it('returns empty when unrelated table modified', () => {
    const session = setupSessionWithProposals()
    const impacts = checkCascadeImpact(session, 'Users', ['email'])
    expect(impacts).toHaveLength(0)
  })

  it('includes multiple affected proposals', () => {
    const session = setupSessionWithProposals()
    const impacts = checkCascadeImpact(session, 'Orders', ['amount', 'customer'])
    // p-ui-1 depends on both amount and customer
    const uiImpact = impacts.find((i) => i.proposalId === 'p-ui-1')
    expect(uiImpact).toBeDefined()
    expect(uiImpact!.affectedFields.length).toBeGreaterThanOrEqual(2)
  })
})

describe('formatCascadeNotification', () => {
  it('returns success message when no impacts', () => {
    const msg = formatCascadeNotification('Users', '新增列 email', [])
    expect(msg).toContain('✅')
    expect(msg).toContain('无 Pass B 提案受影响')
  })

  it('lists affected proposals in warning format', () => {
    const impacts: CascadeImpact[] = [
      {
        proposalId: 'p-1',
        proposalTitle: '订单列表',
        proposalType: 'ui-structure',
        affectedFields: ['Orders.amount'],
      },
    ]
    const msg = formatCascadeNotification('Orders', '删除列 amount', impacts)
    expect(msg).toContain('⚠️')
    expect(msg).toContain('订单列表')
    expect(msg).toContain('ui-structure')
    expect(msg).toContain('请确认是否需要更新')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Part 5: 端到端全流程（A1 → B6 session state mutations）
// ═══════════════════════════════════════════════════════════════════════════════

describe('End-to-end session flow', () => {
  it('simulates complete A1→B6 journey with mutations', () => {
    const session = createEmptySession()

    // ── Pass A: A1 需求摸底 ──
    expect(session.currentStep).toBe('A1')
    advanceStep(session)

    // ── A2 技能扫描 ──
    expect(session.currentStep).toBe('A2')
    advanceStep(session)

    // ── A3 数据建模 ──
    expect(session.currentStep).toBe('A3')
    registerTable(session, 'Orders', {
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'amount', type: 'number' },
        { name: 'customer', type: 'string' },
        { name: 'total', type: 'number', computeExpression: 'amount * qty' },
      ],
      relations: [{ childTable: 'Items', parentField: 'id', childField: 'orderId' }],
    })
    registerTable(session, 'Items', {
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'orderId', type: 'string' },
        { name: 'product', type: 'string' },
        { name: 'qty', type: 'number' },
      ],
      relations: [],
    })
    recordAcceptedProposal(session, {
      id: 'p-data-1', type: 'data-model', title: '订单+明细表',
      content: '...', step: 'A3', acceptedAt: 't1',
    })
    expect(getRegisteredTableNames(session).sort()).toEqual(['Items', 'Orders'])
    advanceStep(session)

    // ── A4 名册锁定 ──
    expect(session.currentStep).toBe('A4')
    expect(canAdvanceTo(session, 'B1')).toBe(false) // 未锁定
    lockDataRegistry(session)
    expect(isDataRegistryLocked(session)).toBe(true)
    expect(canAdvanceTo(session, 'B1')).toBe(true) // 锁定后可进入 Pass B
    advanceStep(session)

    // ── Pass B: B1 视图规划 ──
    expect(session.currentStep).toBe('B1')
    expect(session.currentPass).toBe('B')
    registerView(session, 'Orders@default', {
      tableName: 'Orders', viewId: 'default', purpose: '订单主列表', origin: 'planned',
    })
    registerView(session, 'Items@grid', {
      tableName: 'Items', viewId: 'grid', purpose: '明细网格', origin: 'planned',
    })
    recordAcceptedProposal(session, {
      id: 'p-view-1', type: 'view-plan', title: '视图规划',
      content: '...', step: 'B1', acceptedAt: 't2',
    })
    addDependency(session, 'Orders@default', 'p-view-1')
    addDependency(session, 'Items@grid', 'p-view-1')
    advanceStep(session)

    // ── B2 UI 设计 ──
    expect(session.currentStep).toBe('B2')
    appendUIRegistry(session, { componentIds: ['order-table', 'item-grid'] })
    recordAcceptedProposal(session, {
      id: 'p-ui-1', type: 'ui-structure', title: '订单列表UI',
      content: '...', step: 'B2', acceptedAt: 't3',
    })
    addDependency(session, 'Orders.amount', 'p-ui-1')
    addDependency(session, 'Orders.customer', 'p-ui-1')
    advanceStep(session)

    // ── B3 交互设计 ──
    expect(session.currentStep).toBe('B3')
    appendUIRegistry(session, { functionNames: ['handleSave', 'handleDelete'] })
    recordAcceptedProposal(session, {
      id: 'p-interact-1', type: 'interaction', title: '交互逻辑',
      content: '...', step: 'B3', acceptedAt: 't4',
    })
    advanceStep(session)

    // ── B4 API 对接 ──
    expect(session.currentStep).toBe('B4')
    advanceStep(session)

    // ── B5 样式定制 ──
    expect(session.currentStep).toBe('B5')
    appendUIRegistry(session, {
      cssClassesDefined: ['.order-highlight'],
      cssClassesReferenced: ['.el-table'],
    })
    advanceStep(session)

    // ── B6 全量校验 ──
    expect(session.currentStep).toBe('B6')
    expect(advanceStep(session)).toBeNull() // 已到终点

    // 验证最终状态
    expect(session.acceptedProposals).toHaveLength(4)
    expect(getRegisteredTableNames(session).sort()).toEqual(['Items', 'Orders'])
    expect(getRegisteredViewKeys(session).sort()).toEqual(['Items@grid', 'Orders@default'])
    expect(session.uiRegistry.componentIds.sort()).toEqual(['item-grid', 'order-table'])
    expect(session.uiRegistry.functionNames.sort()).toEqual(['handleDelete', 'handleSave'])
    expect(session.uiRegistry.cssClassesDefined).toEqual(['.order-highlight'])

    // ── 级联校验：模拟 Pass B 阶段修改名册A ──
    const impacts = checkCascadeImpact(session, 'Orders', ['amount'])
    expect(impacts.some((i) => i.proposalId === 'p-ui-1')).toBe(true)
    // Pass A 提案不受影响
    expect(impacts.some((i) => i.proposalId === 'p-data-1')).toBe(false)
    // 视图级别依赖也应被检测到
    const viewImpact = impacts.find((i) => i.proposalId === 'p-view-1')
    expect(viewImpact).toBeDefined()

    // 格式化通知
    const notification = formatCascadeNotification('Orders', '删除列 amount', impacts)
    expect(notification).toContain('⚠️')
    expect(notification).toContain('Orders')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Part 6: applyProposalToSession — 提案自动写入
// ═══════════════════════════════════════════════════════════════════════════════

describe('applyProposalToSession', () => {
  describe('data-model (格式1: tables 对象)', () => {
    it('registers tables and columns from { tables: {...} } format', () => {
      const session = createEmptySession()
      session.currentStep = 'A3'
      const content = JSON.stringify({
        tables: {
          Orders: {
            columns: [
              { name: 'id', type: 'string', isPrimaryKey: true },
              { name: 'amount', type: 'number' },
              { name: 'customer', type: 'string' },
            ],
            relations: [],
          },
          Items: {
            columns: [
              { name: 'id', type: 'string', isPrimaryKey: true },
              { name: 'orderId', type: 'string' },
              { name: 'qty', type: 'number' },
            ],
            relations: [{ childTable: 'Items', parentField: 'id', childField: 'orderId' }],
          },
        },
      })

      const result = applyProposalToSession(session, {
        id: 'p-dm-1', type: 'data-model', title: '订单数据模型',
        content, step: 'A3', acceptedAt: 't1',
      })

      expect(result.registeredTables.sort()).toEqual(['Items', 'Orders'])
      expect(result.dependenciesAdded).toBe(6) // 3 + 3 columns
      expect(getRegisteredTableNames(session).sort()).toEqual(['Items', 'Orders'])
      expect(getRegisteredColumnNames(session, 'Orders')).toEqual(['id', 'amount', 'customer'])
    })

    it('parses aggregates from table definition', () => {
      const session = createEmptySession()
      const content = JSON.stringify({
        tables: {
          Orders: {
            columns: [{ name: 'amount', type: 'number' }],
            relations: [],
            aggregates: { amount: { type: 'sum' }, score: { type: 'avg', field: 'score' } },
          },
        },
      })

      applyProposalToSession(session, {
        id: 'p-agg', type: 'data-model', title: '聚合配置',
        content, step: 'A3', acceptedAt: 't1',
      })

      const table = session.dataRegistry.tables['Orders']!
      expect(table.aggregates).toBeDefined()
      expect(table.aggregates?.['amount']?.type).toBe('sum')
      expect(table.aggregates?.['score']?.field).toBe('score')
    })
  })

  describe('data-model (格式2: tableName 字符串)', () => {
    it('registers single table from { tableName, columns } format', () => {
      const session = createEmptySession()
      const content = JSON.stringify({
        tableName: 'Users',
        columns: [
          { name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'name', type: 'string' },
          { name: 'email', type: 'string' },
        ],
        relations: [],
      })

      const result = applyProposalToSession(session, {
        id: 'p-dm-2', type: 'data-model', title: '用户表',
        content, step: 'A3', acceptedAt: 't1',
      })

      expect(result.registeredTables).toEqual(['Users'])
      expect(result.dependenciesAdded).toBe(3)
      expect(getRegisteredColumnNames(session, 'Users')).toEqual(['id', 'name', 'email'])
    })
  })

  describe('data-model cascade detection', () => {
    it('detects cascade impacts when registry is locked and columns removed', () => {
      const session = createEmptySession()
      // Initial table registration
      registerTable(session, 'Orders', {
        columns: [
          { name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'amount', type: 'number' },
          { name: 'customer', type: 'string' },
        ],
        relations: [],
      })
      lockDataRegistry(session)
      session.currentStep = 'B2'
      session.currentPass = 'B'

      // Simulate a Pass B proposal depending on 'amount'
      recordAcceptedProposal(session, {
        id: 'p-ui-dep', type: 'ui-structure', title: 'UI 用 amount',
        content: '...', step: 'B2', acceptedAt: 't1',
      })
      addDependency(session, 'Orders.amount', 'p-ui-dep')

      // Now apply a data-model proposal that removes 'amount' column
      const content = JSON.stringify({
        tables: {
          Orders: {
            columns: [
              { name: 'id', type: 'string', isPrimaryKey: true },
              { name: 'customer', type: 'string' },
              // 'amount' removed!
            ],
            relations: [],
          },
        },
      })

      const result = applyProposalToSession(session, {
        id: 'p-dm-cascade', type: 'data-model', title: '修改订单',
        content, step: 'A3', acceptedAt: 't2',
      })

      expect(result.cascadeImpacts.length).toBeGreaterThan(0)
      expect(result.cascadeImpacts.some((i) => i.proposalId === 'p-ui-dep')).toBe(true)
    })

    it('no cascade when registry is NOT locked', () => {
      const session = createEmptySession()
      registerTable(session, 'Orders', {
        columns: [{ name: 'amount', type: 'number' }],
        relations: [],
      })
      // NOT locked!
      addDependency(session, 'Orders.amount', 'p-ui-dep')
      recordAcceptedProposal(session, {
        id: 'p-ui-dep', type: 'ui-structure', title: 'UI',
        content: '...', step: 'B2', acceptedAt: 't',
      })

      const content = JSON.stringify({
        tables: { Orders: { columns: [{ name: 'id', type: 'string' }], relations: [] } },
      })

      const result = applyProposalToSession(session, {
        id: 'p-dm-no-cas', type: 'data-model', title: '修改',
        content, step: 'A3', acceptedAt: 't2',
      })

      expect(result.cascadeImpacts).toHaveLength(0)
    })
  })

  describe('data-model invalid JSON', () => {
    it('gracefully handles invalid JSON content', () => {
      const session = createEmptySession()
      const result = applyProposalToSession(session, {
        id: 'p-bad', type: 'data-model', title: 'bad',
        content: 'not valid JSON {{}}', step: 'A3', acceptedAt: 't',
      })

      expect(result.registeredTables).toHaveLength(0)
      // Proposal is still recorded
      expect(session.acceptedProposals).toHaveLength(1)
    })
  })

  describe('view-plan (Markdown 表格解析)', () => {
    it('parses standard Markdown table with Chinese headers', () => {
      const session = createEmptySession()
      registerTable(session, 'Orders', { columns: [{ name: 'id', type: 'string' }], relations: [] })
      registerTable(session, 'Items', { columns: [{ name: 'id', type: 'string' }], relations: [] })

      const content = [
        '| 表名 | viewId | 用途 | 来源 |',
        '|------|--------|------|------|',
        '| Orders | default | 订单主列表 | auto-default |',
        '| Orders | summary | 订单汇总 | planned |',
        '| Items | grid | 明细网格 | planned |',
      ].join('\n')

      const result = applyProposalToSession(session, {
        id: 'p-vp-1', type: 'view-plan', title: '视图规划',
        content, step: 'B1', acceptedAt: 't1',
      })

      expect(result.registeredViews.sort()).toEqual([
        'Items@grid', 'Orders@default', 'Orders@summary',
      ])
      expect(result.dependenciesAdded).toBe(3)
      expect(getRegisteredViewKeys(session).sort()).toEqual([
        'Items@grid', 'Orders@default', 'Orders@summary',
      ])

      // Check view details
      const summaryView = session.viewRegistry.views['Orders@summary']!
      expect(summaryView.tableName).toBe('Orders')
      expect(summaryView.purpose).toBe('订单汇总')
      expect(summaryView.origin).toBe('planned')
    })

    it('parses Markdown table with English headers', () => {
      const session = createEmptySession()
      registerTable(session, 'Users', { columns: [{ name: 'id', type: 'string' }], relations: [] })

      const content = [
        '| tableName | viewId | purpose | origin |',
        '|-----------|--------|---------|--------|',
        '| Users | default | Main user list | auto-default |',
      ].join('\n')

      const result = applyProposalToSession(session, {
        id: 'p-vp-en', type: 'view-plan', title: 'View plan',
        content, step: 'B1', acceptedAt: 't1',
      })

      expect(result.registeredViews).toEqual(['Users@default'])
    })

    it('skips rows missing tableName or viewId', () => {
      const session = createEmptySession()
      const content = [
        '| 表名 | viewId | 用途 |',
        '|------|--------|------|',
        '| Orders | default | 订单列表 |',
        '|  | missing | 无表名 |',
        '| Items |  | 无视图ID |',
      ].join('\n')

      const result = applyProposalToSession(session, {
        id: 'p-vp-skip', type: 'view-plan', title: '视图',
        content, step: 'B1', acceptedAt: 't1',
      })

      // Only the first row (Orders | default | ...) has both tableName and viewId
      expect(result.registeredViews).toEqual(['Orders@default'])
    })
  })

  describe('ui-structure (JSON AST 解析)', () => {
    it('extracts component IDs and CSS class references', () => {
      const session = createEmptySession()
      const content = JSON.stringify({
        type: 'div',
        id: 'order-panel',
        props: { class: 'order-wrapper custom-border' },
        children: [
          { type: 'el-table', id: 'order-table', dataKey: 'Orders@rows', children: [
            { type: 'el-table-column', field: 'amount' },
            { type: 'el-table-column', field: 'customer' },
          ] },
        ],
      })

      const result = applyProposalToSession(session, {
        id: 'p-ui-1', type: 'ui-structure', title: '订单UI',
        content, step: 'B2', acceptedAt: 't1',
      })

      expect(session.uiRegistry.componentIds.sort()).toEqual(['order-panel', 'order-table'])
      expect(session.uiRegistry.cssClassesReferenced.sort()).toEqual(['custom-border', 'order-wrapper'])
      // No dependencies added: child columns have `name` but no `dataKey`; parent has `dataKey` but no `name`
      expect(result.dependenciesAdded).toBe(0)
    })

    it('handles array root (multiple nodes)', () => {
      const session = createEmptySession()
      const content = JSON.stringify([
        { type: 'div', id: 'panel-a' },
        { type: 'div', id: 'panel-b', props: { class: 'flex-layout' } },
      ])

      applyProposalToSession(session, {
        id: 'p-ui-arr', type: 'ui-structure', title: '多面板',
        content, step: 'B2', acceptedAt: 't1',
      })

      expect(session.uiRegistry.componentIds.sort()).toEqual(['panel-a', 'panel-b'])
      expect(session.uiRegistry.cssClassesReferenced).toEqual(['flex-layout'])
    })

    it('extracts dataKey from meta.data.dataKey', () => {
      const session = createEmptySession()
      const content = JSON.stringify({
        type: 'r-table',
        id: 'main-table',
        field: 'qty',
        meta: { data: { dataKey: 'Items@grid@rows' } },
      })

      const result = applyProposalToSession(session, {
        id: 'p-ui-meta', type: 'ui-structure', title: 'Meta DK',
        content, step: 'B2', acceptedAt: 't1',
      })

      // Items.qty dependency from field property
      expect(result.dependenciesAdded).toBe(1)
    })

    it('gracefully handles invalid JSON', () => {
      const session = createEmptySession()
      const result = applyProposalToSession(session, {
        id: 'p-ui-bad', type: 'ui-structure', title: 'bad',
        content: '{ invalid json', step: 'B2', acceptedAt: 't',
      })

      expect(session.uiRegistry.componentIds).toHaveLength(0)
      expect(result.dependenciesAdded).toBe(0)
    })
  })

  describe('interaction (脚本函数提取)', () => {
    it('extracts function names from script content', () => {
      const session = createEmptySession()
      const content = `
function __init__() {
  const view = $dataSet?.getView('Orders', 'default')
}

function handleSave(row) {
  $page.showMessage('saved', 'success')
}

function handleDelete(row) {
  $page.showConfirm('确认删除?').then(function(ok) {
    if (ok) view.deleteRowById(row.id)
  })
}

var notAFunction = 'test'
`
      applyProposalToSession(session, {
        id: 'p-int-1', type: 'interaction', title: '交互逻辑',
        content, step: 'B3', acceptedAt: 't1',
      })

      expect(session.uiRegistry.functionNames.sort()).toEqual([
        '__init__', 'handleDelete', 'handleSave',
      ])
    })

    it('handles content with no functions', () => {
      const session = createEmptySession()
      applyProposalToSession(session, {
        id: 'p-int-empty', type: 'interaction', title: '空脚本',
        content: '// no functions here\nvar x = 1;', step: 'B3', acceptedAt: 't',
      })

      expect(session.uiRegistry.functionNames).toHaveLength(0)
    })
  })

  describe('style (CSS 类定义提取)', () => {
    it('extracts CSS class definitions', () => {
      const session = createEmptySession()
      const content = `
.order-highlight {
  background: #e6f7ff;
}
.flex-layout {
  display: flex;
  gap: 16px;
}
.custom-border,
.custom-shadow {
  border: 1px solid #eee;
}
`
      applyProposalToSession(session, {
        id: 'p-style-1', type: 'style', title: '样式定义',
        content, step: 'B5', acceptedAt: 't1',
      })

      expect(session.uiRegistry.cssClassesDefined.sort()).toEqual([
        'custom-border', 'custom-shadow', 'flex-layout', 'order-highlight',
      ])
    })

    it('excludes el- and is- prefixed classes', () => {
      const session = createEmptySession()
      const content = `
.my-class { color: red; }
.el-table__row { color: blue; }
.is-active { font-weight: bold; }
`
      applyProposalToSession(session, {
        id: 'p-style-filter', type: 'style', title: '过滤测试',
        content, step: 'B5', acceptedAt: 't',
      })

      expect(session.uiRegistry.cssClassesDefined).toEqual(['my-class'])
    })

    it('handles empty CSS', () => {
      const session = createEmptySession()
      applyProposalToSession(session, {
        id: 'p-style-empty', type: 'style', title: '空CSS',
        content: '/* no classes */', step: 'B5', acceptedAt: 't',
      })

      expect(session.uiRegistry.cssClassesDefined).toHaveLength(0)
    })
  })

  describe('proposal recording across types', () => {
    it('always records the proposal regardless of type', () => {
      const session = createEmptySession()
      applyProposalToSession(session, {
        id: 'p-1', type: 'data-model', title: 'DM',
        content: '{}', step: 'A3', acceptedAt: 't1',
      })
      applyProposalToSession(session, {
        id: 'p-2', type: 'view-plan', title: 'VP',
        content: '', step: 'B1', acceptedAt: 't2',
      })
      applyProposalToSession(session, {
        id: 'p-3', type: 'interaction', title: 'INT',
        content: '', step: 'B3', acceptedAt: 't3',
      })

      expect(session.acceptedProposals).toHaveLength(3)
      expect(session.acceptedProposals.map((p) => p.id)).toEqual(['p-1', 'p-2', 'p-3'])
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Part 7: buildSessionContextPrompt — 动态上下文提示词
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildSessionContextPrompt', () => {
  it('returns basic status for empty session', () => {
    const session = createEmptySession()
    const prompt = buildSessionContextPrompt(session)
    expect(prompt).toContain('Pass A')
    expect(prompt).toContain('A1')
    expect(prompt).toContain('名册A')
    expect(prompt).toContain('空')
  })

  it('includes DataRegistry tables with column details', () => {
    const session = createEmptySession()
    registerTable(session, 'Orders', {
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'total', type: 'number', computeExpression: 'price * qty' },
      ],
      relations: [{ childTable: 'Items', parentField: 'id', childField: 'orderId' }],
    })

    const prompt = buildSessionContextPrompt(session)
    expect(prompt).toContain('**Orders**')
    expect(prompt).toContain('id: string (PK)')
    expect(prompt).toContain('total: number = `price * qty`')
    expect(prompt).toContain('→ Items')
  })

  it('shows lock status when DataRegistry is locked', () => {
    const session = createEmptySession()
    registerTable(session, 'T', { columns: [{ name: 'a', type: 'string' }], relations: [] })
    lockDataRegistry(session)

    const prompt = buildSessionContextPrompt(session)
    expect(prompt).toContain('🔒 已锁定')
  })

  it('includes ViewRegistry entries', () => {
    const session = createEmptySession()
    registerView(session, 'Orders@default', {
      tableName: 'Orders', viewId: 'default', purpose: '主列表', origin: 'auto-default',
    })

    const prompt = buildSessionContextPrompt(session)
    expect(prompt).toContain('名册B-1')
    expect(prompt).toContain('Orders@default')
    expect(prompt).toContain('主列表')
  })

  it('includes UIRegistry entries', () => {
    const session = createEmptySession()
    appendUIRegistry(session, {
      componentIds: ['order-table'],
      functionNames: ['handleSave'],
      cssClassesDefined: ['.my-class'],
      cssClassesReferenced: ['.el-table'],
    })

    const prompt = buildSessionContextPrompt(session)
    expect(prompt).toContain('名册B-2')
    expect(prompt).toContain('order-table')
    expect(prompt).toContain('handleSave')
    expect(prompt).toContain('.my-class')
    expect(prompt).toContain('.el-table')
  })

  it('includes accepted proposals list', () => {
    const session = createEmptySession()
    recordAcceptedProposal(session, {
      id: 'p-1', type: 'data-model', title: '订单数据',
      content: '...', step: 'A3', acceptedAt: 't1',
    })
    recordAcceptedProposal(session, {
      id: 'p-2', type: 'view-plan', title: '视图规划',
      content: '...', step: 'B1', acceptedAt: 't2',
    })

    const prompt = buildSessionContextPrompt(session)
    expect(prompt).toContain('已采纳提案（2个）')
    expect(prompt).toContain('[A3] data-model「订单数据」')
    expect(prompt).toContain('[B1] view-plan「视图规划」')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Part 8: serializeSession / deserializeSession — 持久化
// ═══════════════════════════════════════════════════════════════════════════════

describe('serializeSession / deserializeSession', () => {
  it('roundtrips an empty session', () => {
    const original = createEmptySession()
    const json = serializeSession(original)
    const restored = deserializeSession(json)
    expect(restored).toEqual(original)
  })

  it('roundtrips a session with registries and proposals', () => {
    const session = createEmptySession()
    session.currentStep = 'B2'
    session.currentPass = 'B'
    registerTable(session, 'Orders', {
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'amount', type: 'number' },
      ],
      relations: [],
    })
    lockDataRegistry(session)
    registerView(session, 'Orders@default', {
      tableName: 'Orders', viewId: 'default', purpose: '列表', origin: 'auto-default',
    })
    appendUIRegistry(session, {
      componentIds: ['order-table'],
      functionNames: ['handleSave'],
      cssClassesDefined: ['.highlight'],
      cssClassesReferenced: ['.el-table'],
    })
    recordAcceptedProposal(session, {
      id: 'p-1', type: 'data-model', title: '表',
      content: '...', step: 'A3', acceptedAt: 't1',
    })
    addDependency(session, 'Orders.amount', 'p-1')

    const json = serializeSession(session)
    const restored = deserializeSession(json)

    expect(restored.version).toBe(1)
    expect(restored.currentStep).toBe('B2')
    expect(restored.currentPass).toBe('B')
    expect(restored.dataRegistry.tables['Orders']!.columns).toHaveLength(2)
    expect(restored.dataRegistry.lockedAt).not.toBeNull()
    expect(Object.keys(restored.viewRegistry.views)).toEqual(['Orders@default'])
    expect(restored.uiRegistry.componentIds).toEqual(['order-table'])
    expect(restored.acceptedProposals).toHaveLength(1)
    expect(restored.dependencyGraph['Orders.amount']!).toEqual(['p-1'])
  })

  it('produces readable JSON', () => {
    const session = createEmptySession()
    const json = serializeSession(session)
    expect(json).toContain('\n') // pretty-printed
    expect(json).toContain('"version": 1')
  })

  it('throws on invalid JSON', () => {
    expect(() => deserializeSession('not json')).toThrow('解析失败')
  })

  it('throws on missing version', () => {
    const json = JSON.stringify({ currentStep: 'A1' })
    expect(() => deserializeSession(json)).toThrow('版本')
  })

  it('throws on incompatible version', () => {
    const json = JSON.stringify({ version: 999, currentStep: 'A1', currentPass: 'A', dataRegistry: { tables: {}, lockedAt: null } })
    expect(() => deserializeSession(json)).toThrow('版本')
  })

  it('throws on missing dataRegistry', () => {
    const json = JSON.stringify({ version: 1, currentStep: 'A1', currentPass: 'A' })
    expect(() => deserializeSession(json)).toThrow('dataRegistry')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Part 9: runFullValidation — B6 全量校验
// ═══════════════════════════════════════════════════════════════════════════════

describe('runFullValidation', () => {
  it('returns empty for a consistent session', () => {
    const session = createEmptySession()
    registerTable(session, 'Orders', {
      columns: [{ name: 'id', type: 'string' }],
      relations: [],
    })
    registerView(session, 'Orders@default', {
      tableName: 'Orders', viewId: 'default', purpose: '列表', origin: 'auto-default',
    })
    appendUIRegistry(session, {
      cssClassesDefined: ['.highlight'],
      cssClassesReferenced: ['highlight'],
    })
    addDependency(session, 'Orders@default', 'p-view-1')
    // Need >2 proposals for orphan-view check to trigger
    recordAcceptedProposal(session, { id: 'p-1', type: 'data-model', title: 'DM', content: '', step: 'A3', acceptedAt: 't1' })
    recordAcceptedProposal(session, { id: 'p-2', type: 'view-plan', title: 'VP', content: '', step: 'B1', acceptedAt: 't2' })
    recordAcceptedProposal(session, { id: 'p-view-1', type: 'ui-structure', title: 'UI', content: '', step: 'B2', acceptedAt: 't3' })

    const issues = runFullValidation(session)
    expect(issues).toHaveLength(0)
  })

  it('detects CSS referenced but not defined', () => {
    const session = createEmptySession()
    appendUIRegistry(session, {
      cssClassesReferenced: ['custom-style', 'another-class'],
    })

    const issues = runFullValidation(session)
    const cssIssues = issues.filter((i) => i.category === 'css-mismatch')
    expect(cssIssues.some((i) => i.message.includes('custom-style'))).toBe(true)
    expect(cssIssues.some((i) => i.message.includes('another-class'))).toBe(true)
  })

  it('ignores external CSS classes (el-/vxe-/is-)', () => {
    const session = createEmptySession()
    appendUIRegistry(session, {
      cssClassesReferenced: ['el-table', 'vxe-cell', 'is-active'],
    })

    const issues = runFullValidation(session)
    const cssIssues = issues.filter((i) => i.category === 'css-mismatch')
    expect(cssIssues).toHaveLength(0)
  })

  it('detects CSS defined but not referenced', () => {
    const session = createEmptySession()
    appendUIRegistry(session, {
      cssClassesDefined: ['.unused-style'],
      cssClassesReferenced: [],
    })

    const issues = runFullValidation(session)
    expect(issues.some((i) => i.category === 'css-mismatch' && i.message.includes('unused-style'))).toBe(true)
  })

  it('detects views referencing non-existent tables (dead-reference)', () => {
    const session = createEmptySession()
    registerView(session, 'Ghost@default', {
      tableName: 'Ghost', viewId: 'default', purpose: '不存在的表', origin: 'planned',
    })

    const issues = runFullValidation(session)
    expect(issues.some((i) => i.category === 'dead-reference' && i.message.includes('Ghost'))).toBe(true)
    expect(issues.find((i) => i.category === 'dead-reference')?.severity).toBe('error')
  })

  it('detects orphan views (no dependency references)', () => {
    const session = createEmptySession()
    registerTable(session, 'Orders', { columns: [{ name: 'id', type: 'string' }], relations: [] })
    registerView(session, 'Orders@orphan', {
      tableName: 'Orders', viewId: 'orphan', purpose: '孤立视图', origin: 'planned',
    })
    // Need >2 accepted proposals for orphan check to trigger
    recordAcceptedProposal(session, { id: 'p-1', type: 'data-model', title: 'DM', content: '', step: 'A3', acceptedAt: 't1' })
    recordAcceptedProposal(session, { id: 'p-2', type: 'view-plan', title: 'VP', content: '', step: 'B1', acceptedAt: 't2' })
    recordAcceptedProposal(session, { id: 'p-3', type: 'ui-structure', title: 'UI', content: '', step: 'B2', acceptedAt: 't3' })

    const issues = runFullValidation(session)
    expect(issues.some((i) => i.category === 'orphan-view' && i.message.includes('Orders@orphan'))).toBe(true)
  })

  it('does not flag orphan views when <=2 proposals (early session)', () => {
    const session = createEmptySession()
    registerTable(session, 'Orders', { columns: [{ name: 'id', type: 'string' }], relations: [] })
    registerView(session, 'Orders@orphan', {
      tableName: 'Orders', viewId: 'orphan', purpose: '早期视图', origin: 'planned',
    })
    recordAcceptedProposal(session, { id: 'p-1', type: 'data-model', title: 'DM', content: '', step: 'A3', acceptedAt: 't1' })

    const issues = runFullValidation(session)
    expect(issues.filter((i) => i.category === 'orphan-view')).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Part 10: RegistryValidatorProcessor — validateStyle 样式校验
// ═══════════════════════════════════════════════════════════════════════════════

describe('RegistryValidatorProcessor — style validation', () => {
  function makeStylePipeline() {
    return new ResponsePipeline()
      .use(new BlockExtractorProcessor())
      .use(new RegistryValidatorProcessor())
  }

  function makeSessionWithCssRefs(refs: string[]): PersistedDesignSession {
    const session = createEmptySession()
    appendUIRegistry(session, { cssClassesReferenced: refs })
    return session
  }

  it('warns when referenced CSS class is not defined in style proposal', async () => {
    const pipeline = makeStylePipeline()
    const session = makeSessionWithCssRefs(['custom-highlight', 'flex-layout'])

    const ctx = await pipeline.execute(
      '@@proposal:style\n# page-styles\n.flex-layout { display: flex; }\n@@end',
      'msg-style-warn',
      session,
    )

    // 'custom-highlight' is referenced but not defined → warning
    const errors = ctx.validationErrors
    expect(errors.some((e) => e.message.includes('custom-highlight'))).toBe(true)
    // 'flex-layout' is defined → no error for it
    expect(errors.some((e) => e.message.includes('flex-layout'))).toBe(false)
  })

  it('skips validation when no CSS references exist', async () => {
    const pipeline = makeStylePipeline()
    const session = createEmptySession() // empty uiRegistry

    const ctx = await pipeline.execute(
      '@@proposal:style\n# my-styles\n.something { color: red; }\n@@end',
      'msg-style-skip',
      session,
    )

    expect(ctx.validationErrors).toHaveLength(0)
  })

  it('ignores external framework classes (el-/vxe-)', async () => {
    const pipeline = makeStylePipeline()
    const session = makeSessionWithCssRefs(['el-table', 'vxe-cell'])

    const ctx = await pipeline.execute(
      '@@proposal:style\n# s\n.custom { color: blue; }\n@@end',
      'msg-style-ext',
      session,
    )

    // el-table and vxe-cell should be skipped (external)
    expect(ctx.validationErrors).toHaveLength(0)
  })

  it('handles dot-prefixed references correctly', async () => {
    const pipeline = makeStylePipeline()
    const session = makeSessionWithCssRefs(['.my-class']) // with dot prefix

    const ctx = await pipeline.execute(
      '@@proposal:style\n# s\n.my-class { color: red; }\n@@end',
      'msg-style-dot',
      session,
    )

    // .my-class is both referenced and defined → no errors
    expect(ctx.validationErrors).toHaveLength(0)
  })

  it('shows available classes in suggestion when missing', async () => {
    const pipeline = makeStylePipeline()
    const session = makeSessionWithCssRefs(['missing-class'])

    const ctx = await pipeline.execute(
      '@@proposal:style\n# s\n.defined-class { color: blue; }\n@@end',
      'msg-style-suggest',
      session,
    )

    const err = ctx.validationErrors.find((e) => e.message.includes('missing-class'))
    expect(err).toBeDefined()
    expect(err?.suggestion).toContain('defined-class')
  })
})
