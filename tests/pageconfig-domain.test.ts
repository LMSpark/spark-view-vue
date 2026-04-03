/**
 * PageConfig Domain — 单元测试
 *
 * 测试 pageconfig stills: init, rule 操作, script/style 操作, validate, export, describe
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerAllStills,
  clearRegistry,
  clearDomains,
  executeStill,
  createSession,
  getPageConfigState,
} from '../packages/spark-ai/src/stills'
import type { IStillSession, StillResult } from '../packages/spark-ai/src/stills'
import type {
  PageConfigDomainState,
  IPageConfigData,
  PageConfigExportResult,
  PageConfigValidationIssue,
} from '../packages/spark-ai/src/stills/pageconfig-types'

// ─── helpers ────────────────────────────────────────────────

let session: IStillSession
let reqSeq = 0

function exec(action: string, params: unknown = {}): StillResult {
  return executeStill(action, params, session, `r${++reqSeq}`)
}

function expectOk(result: StillResult): asserts result is { ok: true; data: unknown; summary: string } {
  if (!result.ok) throw new Error(`Expected ok: ${result.code} — ${result.msg}`)
}

function expectFail(result: StillResult, code?: string): asserts result is { ok: false; code: string; msg: string; fix: string } {
  if (result.ok) throw new Error(`Expected fail: ${result.summary}`)
  if (code) expect(result.code).toBe(code)
}

function pcState(): PageConfigDomainState {
  return getPageConfigState(session)
}

function pcData(): IPageConfigData {
  const d = pcState().data
  expect(d).not.toBeNull()
  return d!
}

/** 建立 blueprint + dataset（pageconfig.init 的前置条件） */
function setupPrerequisites(): void {
  exec('blueprint.create', { title: 'test page', requirements: 'test', checkpoints: [{ id: 'c1', title: 'setup', plannedActions: ['pageconfig.init'], validation: 'ok' }] })
  exec('dataset.init', { dataSetName: 'TestDS' })
  exec('datatable.create', { tableName: 'Users', columns: [{ name: 'id', type: 'string' }, { name: 'name', type: 'string' }] })
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
// pageconfig.init
// ═══════════════════════════════════════════════════════════

describe('pageconfig.init', () => {
  it('fails without blueprint', () => {
    expectFail(exec('pageconfig.init'), 'NO_BLUEPRINT')
  })

  it('fails without dataset', () => {
    exec('blueprint.create', { title: 'test', requirements: 'test', checkpoints: [{ id: 'c1', title: 't', plannedActions: ['pageconfig.init'], validation: 'ok' }] })
    expectFail(exec('pageconfig.init'), 'NO_DATASET')
  })

  it('creates empty shell with root div', () => {
    setupPrerequisites()
    const r = exec('pageconfig.init')
    expectOk(r)
    expect(pcState().phase).toBe('bootstrapped')
    const pc = pcData()
    expect(pc.rule).not.toBeNull()
    expect(pc.rule!.type).toBe('div')
    expect(pc.rule!.id).toBeTruthy()
    expect(pc.rule!.children).toEqual([])
    expect(pc.scriptMap).toEqual({})
    expect(pc.scriptVars).toEqual({})
    expect(pc.styleMap).toEqual({})
  })

  it('custom rootType', () => {
    setupPrerequisites()
    expectOk(exec('pageconfig.init', { rootType: 'el-container' }))
    expect(pcData().rule!.type).toBe('el-container')
  })

  it('rejects duplicate init', () => {
    setupPrerequisites()
    expectOk(exec('pageconfig.init'))
    expectFail(exec('pageconfig.init'), 'ALREADY_INIT')
  })
})

// ═══════════════════════════════════════════════════════════
// rule.addComponent
// ═══════════════════════════════════════════════════════════

describe('rule.addComponent', () => {
  beforeEach(() => {
    setupPrerequisites()
    exec('pageconfig.init')
  })

  it('adds component to root', () => {
    const r = exec('rule.addComponent', { parentId: null, type: 'r-table', props: { dataKey: 'Users@rows' } })
    expectOk(r)
    const data = r.data as { id: string }
    expect(data.id).toBeTruthy()
    expect(pcData().rule!.children).toHaveLength(1)
  })

  it('adds component with custom id', () => {
    expectOk(exec('rule.addComponent', { parentId: null, type: 'r-form', id: 'my-form' }))
    const child = pcData().rule!.children![0]!
    expect(typeof child !== 'string' && typeof child !== 'number' ? child.id : null).toBe('my-form')
  })

  it('adds component at position', () => {
    expectOk(exec('rule.addComponent', { parentId: null, type: 'div', id: 'first' }))
    expectOk(exec('rule.addComponent', { parentId: null, type: 'div', id: 'second' }))
    expectOk(exec('rule.addComponent', { parentId: null, type: 'div', id: 'inserted', position: 1 }))
    const ids = pcData().rule!.children!.map((c) => typeof c !== 'string' && typeof c !== 'number' ? c.id : null)
    expect(ids).toEqual(['first', 'inserted', 'second'])
  })

  it('adds nested component', () => {
    expectOk(exec('rule.addComponent', { parentId: null, type: 'div', id: 'container' }))
    expectOk(exec('rule.addComponent', { parentId: 'container', type: 'r-text', id: 'field1' }))
    const container = pcData().rule!.children![0]!
    expect(typeof container !== 'string' && typeof container !== 'number' ? container.children : null).toHaveLength(1)
  })

  it('fails with invalid parentId', () => {
    expectFail(exec('rule.addComponent', { parentId: 'nonexistent', type: 'div' }), 'PARENT_NOT_FOUND')
  })

  it('transitions phase to refining', () => {
    expect(pcState().phase).toBe('bootstrapped')
    exec('rule.addComponent', { parentId: null, type: 'div' })
    expect(pcState().phase).toBe('refining')
  })
})

// ═══════════════════════════════════════════════════════════
// rule.setProps
// ═══════════════════════════════════════════════════════════

describe('rule.setProps', () => {
  beforeEach(() => {
    setupPrerequisites()
    exec('pageconfig.init')
    exec('rule.addComponent', { parentId: null, type: 'r-table', id: 'tbl', props: { border: true } })
  })

  it('merges props by default', () => {
    expectOk(exec('rule.setProps', { nodeId: 'tbl', props: { stripe: true } }))
    const node = pcData().rule!.children![0]!
    expect(typeof node !== 'string' && typeof node !== 'number' ? node.props : null).toEqual({ border: true, stripe: true })
  })

  it('replaces props with merge=false', () => {
    expectOk(exec('rule.setProps', { nodeId: 'tbl', props: { stripe: true }, merge: false }))
    const node = pcData().rule!.children![0]!
    expect(typeof node !== 'string' && typeof node !== 'number' ? node.props : null).toEqual({ stripe: true })
  })

  it('fails for missing node', () => {
    expectFail(exec('rule.setProps', { nodeId: 'nonexistent', props: { a: 1 } }), 'NODE_NOT_FOUND')
  })
})

// ═══════════════════════════════════════════════════════════
// rule.removeComponent
// ═══════════════════════════════════════════════════════════

describe('rule.removeComponent', () => {
  beforeEach(() => {
    setupPrerequisites()
    exec('pageconfig.init')
    exec('rule.addComponent', { parentId: null, type: 'div', id: 'target' })
  })

  it('removes component', () => {
    expectOk(exec('rule.removeComponent', { nodeId: 'target' }))
    expect(pcData().rule!.children).toHaveLength(0)
  })

  it('cannot remove root', () => {
    const rootId = pcData().rule!.id!
    expectFail(exec('rule.removeComponent', { nodeId: rootId }), 'CANNOT_REMOVE_ROOT')
  })

  it('fails for missing node', () => {
    expectFail(exec('rule.removeComponent', { nodeId: 'ghost' }), 'NODE_NOT_FOUND')
  })
})

// ═══════════════════════════════════════════════════════════
// rule.reorder
// ═══════════════════════════════════════════════════════════

describe('rule.reorder', () => {
  beforeEach(() => {
    setupPrerequisites()
    exec('pageconfig.init')
    exec('rule.addComponent', { parentId: null, type: 'div', id: 'a' })
    exec('rule.addComponent', { parentId: null, type: 'div', id: 'b' })
    exec('rule.addComponent', { parentId: null, type: 'div', id: 'c' })
  })

  it('reorders children', () => {
    expectOk(exec('rule.reorder', { parentId: null, childIds: ['c', 'a', 'b'] }))
    const ids = pcData().rule!.children!.map((c) => typeof c !== 'string' && typeof c !== 'number' ? c.id : null)
    expect(ids).toEqual(['c', 'a', 'b'])
  })
})

// ═══════════════════════════════════════════════════════════
// script stills
// ═══════════════════════════════════════════════════════════

describe('script stills', () => {
  beforeEach(() => {
    setupPrerequisites()
    exec('pageconfig.init')
  })

  it('script.addHandler adds function', () => {
    expectOk(exec('script.addHandler', { name: 'handleClick', body: 'console.log("clicked")' }))
    expect(pcData().scriptMap['handleClick']).toBe('console.log("clicked")')
  })

  it('script.addInitLogic appends to __init__', () => {
    expectOk(exec('script.addInitLogic', { code: '// line 1' }))
    expectOk(exec('script.addInitLogic', { code: '// line 2' }))
    expect(pcData().scriptMap['__init__']).toContain('// line 1')
    expect(pcData().scriptMap['__init__']).toContain('// line 2')
  })

  it('script.replaceHandler replaces existing', () => {
    exec('script.addHandler', { name: 'fn1', body: 'old' })
    expectOk(exec('script.replaceHandler', { name: 'fn1', body: 'new' }))
    expect(pcData().scriptMap['fn1']).toBe('new')
  })

  it('script.replaceHandler fails for nonexistent', () => {
    expectFail(exec('script.replaceHandler', { name: 'ghost', body: 'x' }), 'HANDLER_NOT_FOUND')
  })

  it('script.removeHandler removes', () => {
    exec('script.addHandler', { name: 'temp', body: '...' })
    expectOk(exec('script.removeHandler', { name: 'temp' }))
    expect(pcData().scriptMap['temp']).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════
// script var stills
// ═══════════════════════════════════════════════════════════

describe('script var stills', () => {
  beforeEach(() => {
    setupPrerequisites()
    exec('pageconfig.init')
  })

  it('script.setVar adds a variable', () => {
    expectOk(exec('script.setVar', { name: '_pageState', value: '{ selectedNode: null }' }))
    expect(pcData().scriptVars['_pageState']).toBe('{ selectedNode: null }')
  })

  it('script.setVar overwrites existing', () => {
    exec('script.setVar', { name: '_count', value: '0' })
    expectOk(exec('script.setVar', { name: '_count', value: '10' }))
    expect(pcData().scriptVars['_count']).toBe('10')
  })

  it('script.removeVar removes variable', () => {
    exec('script.setVar', { name: '_tmp', value: 'null' })
    expectOk(exec('script.removeVar', { name: '_tmp' }))
    expect(pcData().scriptVars['_tmp']).toBeUndefined()
  })

  it('script.removeVar fails for nonexistent', () => {
    expectFail(exec('script.removeVar', { name: '_ghost' }), 'VAR_NOT_FOUND')
  })
})

// ═══════════════════════════════════════════════════════════
// style stills
// ═══════════════════════════════════════════════════════════

describe('style stills', () => {
  beforeEach(() => {
    setupPrerequisites()
    exec('pageconfig.init')
  })

  it('style.addRule adds CSS rule', () => {
    expectOk(exec('style.addRule', { selector: '.page-root', declarations: 'padding: 16px;' }))
    expect(pcData().styleMap['.page-root']).toBe('padding: 16px;')
  })

  it('style.removeRule removes CSS rule', () => {
    exec('style.addRule', { selector: '.tmp', declarations: 'color: red;' })
    expectOk(exec('style.removeRule', { selector: '.tmp' }))
    expect(pcData().styleMap['.tmp']).toBeUndefined()
  })

  it('style.removeRule fails for nonexistent', () => {
    expectFail(exec('style.removeRule', { selector: '.ghost' }), 'RULE_NOT_FOUND')
  })

  it('style.setTheme sets CSS variables on :root', () => {
    expectOk(exec('style.setTheme', { theme: { '--primary': '#409eff', '--gap': '8px' } }))
    expect(pcData().styleMap[':root']).toContain('--primary: #409eff;')
    expect(pcData().styleMap[':root']).toContain('--gap: 8px;')
  })
})

// ═══════════════════════════════════════════════════════════
// pageconfig.validate
// ═══════════════════════════════════════════════════════════

describe('pageconfig.validate', () => {
  beforeEach(() => {
    setupPrerequisites()
    exec('pageconfig.init')
  })

  it('passes with valid dataKey', () => {
    exec('rule.addComponent', { parentId: null, type: 'r-table', props: { dataKey: 'Users@rows' } })
    const r = exec('pageconfig.validate')
    expectOk(r)
    const issues = r.data as PageConfigValidationIssue[]
    expect(issues.filter((i) => !i.pass)).toHaveLength(0)
  })

  it('detects invalid dataKey table reference', () => {
    exec('rule.addComponent', { parentId: null, type: 'r-table', props: { dataKey: 'NonExistent@rows' } })
    const r = exec('pageconfig.validate')
    expectOk(r)
    const issues = r.data as PageConfigValidationIssue[]
    const bad = issues.filter((i) => i.rule === 'dataKey-table-exists' && !i.pass)
    expect(bad.length).toBeGreaterThan(0)
    expect(bad[0]!.detail).toContain('NonExistent')
  })

  it('detects missing handler in scriptMap', () => {
    exec('rule.addComponent', { parentId: null, type: 'r-table', props: { on: { click: 'handleMissing' } } })
    const r = exec('pageconfig.validate')
    expectOk(r)
    const issues = r.data as PageConfigValidationIssue[]
    const bad = issues.filter((i) => i.rule === 'handler-defined' && !i.pass)
    expect(bad.length).toBeGreaterThan(0)
    expect(bad[0]!.detail).toContain('handleMissing')
  })
})

// ═══════════════════════════════════════════════════════════
// pageconfig.export
// ═══════════════════════════════════════════════════════════

describe('pageconfig.export', () => {
  beforeEach(() => {
    setupPrerequisites()
    exec('pageconfig.init')
  })

  it('exports rule.json + script.js + style.css', () => {
    exec('rule.addComponent', { parentId: null, type: 'r-table', props: { dataKey: 'Users@rows' } })
    exec('script.addHandler', { name: 'handleClick', body: 'console.log("ok")' })
    exec('script.setVar', { name: '_state', value: 'null' })
    exec('style.addRule', { selector: '.page-root', declarations: 'padding: 8px;' })

    const r = exec('pageconfig.export')
    expectOk(r)
    const data = r.data as PageConfigExportResult
    expect(JSON.parse(data.ruleJson)).toHaveProperty('type', 'div')
    expect(data.scriptJs).toContain('let _state = null')
    expect(data.scriptJs).toContain('function handleClick()')
    expect(data.styleCss).toContain('.page-root')
    expect(pcState().phase).toBe('exported')
  })
})

// ═══════════════════════════════════════════════════════════
// pageconfig.describe
// ═══════════════════════════════════════════════════════════

describe('pageconfig.describe', () => {
  it('describes current state', () => {
    setupPrerequisites()
    exec('pageconfig.init')
    exec('rule.addComponent', { parentId: null, type: 'r-table' })
    exec('script.addHandler', { name: 'fn1', body: '...' })
    exec('script.setVar', { name: '_state', value: '{}' })
    exec('style.addRule', { selector: '.x', declarations: 'color: red;' })

    const r = exec('pageconfig.describe')
    expectOk(r)
    const d = r.data as {
      nodeCount: number
      scriptFunctions: string[]
      scriptDetails: Record<string, string>
      scriptVars: string[]
      scriptVarDetails: Record<string, string>
      styleSelectors: string[]
      styleDetails: Record<string, string>
    }
    expect(d.nodeCount).toBe(2) // root + r-table
    expect(d.scriptFunctions).toContain('fn1')
    expect(d.scriptDetails['fn1']).toBe('...')
    expect(d.scriptVars).toContain('_state')
    expect(d.scriptVarDetails['_state']).toBe('{}')
    expect(d.styleSelectors).toContain('.x')
    expect(d.styleDetails['.x']).toBe('color: red;')
  })
})
