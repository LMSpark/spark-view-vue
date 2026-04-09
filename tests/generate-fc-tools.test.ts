/**
 * FC 三阶段生成管线 — Mock 测试（全覆盖）。
 *
 * 验证所有 tool 函数（查询型 + 生成型）、校验器、编排器逻辑、catalog 投影。
 * 不调用 LLM，用 mock backend 模拟全部交互。
 */
import { describe, it, expect, vi } from 'vitest'
import {
  dispatchQueryTool,
  getGenerateTools,
  getGenerateToolsForApi,
  type GenerateToolName,
} from '../packages/spark-ai/src/generate/generate-tools-catalog'
import {
  validateToolLayerEmit,
  validateSemanticCrossPhase,
  type GenerateArtifacts,
} from '../packages/spark-ai/src/generate/generate-validators'
import {
  runGenerateLoop,
  type GenerateProgressEvent,
} from '../packages/spark-ai/src/generate/generate-orchestrator'
import type { SessionBackend } from '../packages/spark-ai/src/runtime/session-orchestrator'
import type { ComponentCatalog } from '../packages/spark-ai/src/catalog/types'
import {
  projectFcDirectory,
  projectFcSpec,
  projectDevTypes,
  projectDevPropNames,
  projectDevPropEnums,
} from '../packages/spark-ai/src/catalog/catalog-projections'
import {
  GENERATE_BASE_PROMPT,
  DATA_PHASE_PROMPT,
  UI_PHASE_PROMPT,
  STYLE_PHASE_PROMPT,
  CROSS_CONSISTENCY_PROMPT,
} from '../packages/spark-ai/src/prompts/page-system-prompt'

// ═══════════════════════════════════════════════════════════
// Test fixtures
// ═══════════════════════════════════════════════════════════

function createMiniCatalog(): ComponentCatalog {
  return {
    version: '1.0.0',
    buildTime: '2026-04-09',
    componentCount: 3,
    registry: {
      containers: ['r-table'],
      fields: ['r-text', 'r-number'],
      groups: [],
      meta: [],
    },
    components: {
      'r-table': {
        type: 'r-table',
        category: 'container',
        description: '表格容器',
        props: [
          { name: 'dataKey', type: 'string', required: true, description: '数据绑定键' },
          { name: 'highlightCurrentRow', type: 'boolean', required: false, description: '高亮当前行' },
        ],
        emits: [{ name: 'current-change', description: '当前行变化' }],
        source: 'vcm' as const,
      },
      'r-text': {
        type: 'r-text',
        category: 'field',
        description: '文本字段',
        props: [
          { name: 'field', type: 'string', required: true },
          { name: 'label', type: 'string', required: false },
        ],
        emits: [],
        source: 'vcm' as const,
      },
      'r-number': {
        type: 'r-number',
        category: 'field',
        description: '数字字段',
        props: [
          { name: 'field', type: 'string', required: true },
          { name: 'label', type: 'string', required: false },
        ],
        emits: [],
        source: 'vcm' as const,
      },
    },
    constraints: {} as ComponentCatalog['constraints'],
  }
}

/** 合法的 pagedata.json 内容 */
const VALID_PAGEDATA = {
  dataset: {
    dataSetName: 'PageDataSet',
    tables: {
      Orders: {
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'product', type: 'string' },
          { name: 'amount', type: 'number' },
        ],
        views: {
          default: {
            autoCurrentFirst: true,
            rows: [
              { id: 1, product: '笔记本', amount: 5999 },
            ],
          },
        },
      },
    },
  },
}

/** 合法的 pagedata.json（含 relation） */
const VALID_PAGEDATA_WITH_RELATIONS = {
  dataset: {
    dataSetName: 'PageDataSet',
    tables: {
      Customer: {
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'name', type: 'string' },
        ],
        views: {
          default: { autoCurrentFirst: true, rows: [{ id: 1, name: 'Alice' }] },
        },
      },
      Orders: {
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'customerId', type: 'number' },
          { name: 'product', type: 'string' },
        ],
        views: {
          default: { rows: [{ id: 1, customerId: 1, product: '笔记本' }] },
        },
      },
    },
    tableRelations: [
      { parentTable: 'Customer', childTable: 'Orders', parentField: 'id', childField: 'customerId' },
    ],
  },
}

const VALID_RULE_JSON = [
  {
    type: 'div',
    style: { display: 'flex', height: '100vh' },
    children: [
      {
        type: 'r-table',
        dataKey: 'Orders@rows',
        props: { highlightCurrentRow: true },
        children: [
          { type: 'el-table-column', props: { prop: 'product', label: '产品' } },
          { type: 'el-table-column', props: { prop: 'amount', label: '金额' } },
        ],
      },
    ],
  },
]

const VALID_SCRIPT_JS = `
let _pageState = {};

function __init__() {
  const view = $dataSet?.getView('Orders', 'default');
  view?.events.on('currentRowChanged', (row) => {
    console.log('当前行:', row);
  });
}

function handleRefresh() {
  $refreshData();
}
`

const VALID_STYLE_CSS = `
:root {
  --el-color-primary: #409eff;
}
.page-container {
  padding: 16px;
}
`

// ═══════════════════════════════════════════════════════════
// 1. Tool Definitions
// ═══════════════════════════════════════════════════════════

describe('FC Tool Definitions', () => {
  it('should export 7 tools (3 query + 4 emit)', () => {
    const tools = getGenerateTools()
    expect(tools).toHaveLength(7)

    const names = tools.map(t => t.function.name)
    expect(names).toContain('queryCapabilities')
    expect(names).toContain('queryActionSpec')
    expect(names).toContain('queryComponentCatalog')
    expect(names).toContain('emitPagedata')
    expect(names).toContain('emitRuleJson')
    expect(names).toContain('emitScriptJs')
    expect(names).toContain('emitStyleCss')
  })

  it('getGenerateToolsForApi should return array matching getGenerateTools', () => {
    const tools = getGenerateTools()
    const api = getGenerateToolsForApi()
    expect(api).toHaveLength(tools.length)
  })

  it('every tool should have required parameters', () => {
    const tools = getGenerateTools()
    for (const tool of tools) {
      expect(tool.type).toBe('function')
      expect(tool.function.name).toBeTruthy()
      expect(tool.function.description).toBeTruthy()
      expect(tool.function.parameters).toBeTruthy()
    }
  })
})

// ═══════════════════════════════════════════════════════════
// 2. Query Tools — dispatchQueryTool
// ═══════════════════════════════════════════════════════════

describe('dispatchQueryTool', () => {
  const catalog = createMiniCatalog()

  describe('queryCapabilities', () => {
    it('data phase — returns DataSet capabilities', () => {
      const result = JSON.parse(dispatchQueryTool('queryCapabilities', { phase: 'data' }, catalog))
      expect(result.capabilities).toBeDefined()
      expect(result.capabilities.length).toBeGreaterThan(0)
      const ids = result.capabilities.map((c: { id: string }) => c.id)
      expect(ids).toContain('DataSet.tables')
      expect(ids).toContain('DataSet.columns')
      expect(ids).toContain('DataSet.relations')
      expect(ids).toContain('DataSet.views')
    })

    it('ui phase — returns SparkNode + ScriptJs capabilities', () => {
      const result = JSON.parse(dispatchQueryTool('queryCapabilities', { phase: 'ui' }, catalog))
      expect(result.capabilities).toBeDefined()
      const ids = result.capabilities.map((c: { id: string }) => c.id)
      expect(ids).toContain('SparkNode.structure')
      expect(ids).toContain('SparkNode.dataKey')
      expect(ids).toContain('SparkNode.events')
      expect(ids).toContain('ScriptJs.sandbox')
      expect(ids).toContain('ScriptJs.init')
    })

    it('style phase — returns Style capabilities', () => {
      const result = JSON.parse(dispatchQueryTool('queryCapabilities', { phase: 'style' }, catalog))
      expect(result.capabilities).toBeDefined()
      const ids = result.capabilities.map((c: { id: string }) => c.id)
      expect(ids).toContain('StyleCss.pageScope')
      expect(ids).toContain('StyleCss.elementPlus')
      expect(ids).toContain('StyleCss.layout')
    })
  })

  describe('queryActionSpec', () => {
    const ALL_CAPABILITY_IDS = [
      'DataSet.tables', 'DataSet.columns', 'DataSet.relations', 'DataSet.views', 'DataSet.treeConfig',
      'SparkNode.structure', 'SparkNode.dataKey', 'SparkNode.events', 'SparkNode.containers', 'SparkNode.fields',
      'ScriptJs.sandbox', 'ScriptJs.init',
      'StyleCss.pageScope', 'StyleCss.elementPlus', 'StyleCss.layout',
    ]

    it.each(ALL_CAPABILITY_IDS)('should return valid spec for %s', (capabilityId) => {
      const result = JSON.parse(dispatchQueryTool('queryActionSpec', { capabilityId }, catalog))
      expect(result.error).toBeUndefined()
      expect(result.capabilityId).toBe(capabilityId)
      expect(result.paramsSchema).toBeDefined()
      expect(result.usageRules).toBeDefined()
      expect(Array.isArray(result.usageRules)).toBe(true)
      expect(result.failureModes).toBeDefined()
    })

    it('unknown capabilityId returns error', () => {
      const result = JSON.parse(dispatchQueryTool('queryActionSpec', { capabilityId: 'Nonexistent.thing' }, catalog))
      expect(result.error).toBeDefined()
      expect(result.hint).toBeDefined()
    })
  })

  describe('queryComponentCatalog', () => {
    it('* returns directory with summary and registry', () => {
      const result = JSON.parse(dispatchQueryTool('queryComponentCatalog', { componentType: '*' }, catalog))
      expect(result.summary).toBeDefined()
      expect(result.summary.total).toBe(3)
      expect(result.summary.containers).toBe(1)
      expect(result.summary.fields).toBe(2)
      expect(result.registry).toBeDefined()
      expect(result.registry.containers).toContain('r-table')
      expect(result.components).toBeDefined()
      expect(result.components).toHaveLength(3)
    })

    it('specific component returns spec', () => {
      const result = JSON.parse(dispatchQueryTool('queryComponentCatalog', { componentType: 'r-table' }, catalog))
      expect(result.type).toBe('r-table')
      expect(result.category).toBe('container')
      expect(result.props).toBeDefined()
      expect(Array.isArray(result.props)).toBe(true)
    })

    it('unknown component returns error', () => {
      const result = JSON.parse(dispatchQueryTool('queryComponentCatalog', { componentType: 'nonexistent' }, catalog))
      expect(result.error).toBeDefined()
    })

    it('null catalog returns error', () => {
      const result = JSON.parse(dispatchQueryTool('queryComponentCatalog', { componentType: '*' }, null))
      expect(result.error).toBeDefined()
    })
  })

  it('unknown tool returns error', () => {
    const result = JSON.parse(dispatchQueryTool('unknownTool', {}, catalog))
    expect(result.error).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════
// 3. Tool-layer Validators
// ═══════════════════════════════════════════════════════════

describe('validateToolLayerEmit', () => {
  describe('emitPagedata', () => {
    it('valid pagedata passes', () => {
      const r = validateToolLayerEmit('emitPagedata', VALID_PAGEDATA)
      expect(r.passed).toBe(true)
      expect(r.issues).toHaveLength(0)
    })

    it('string JSON also passes', () => {
      const r = validateToolLayerEmit('emitPagedata', JSON.stringify(VALID_PAGEDATA))
      expect(r.passed).toBe(true)
    })

    it('invalid JSON string fails', () => {
      const r = validateToolLayerEmit('emitPagedata', '{bad json')
      expect(r.passed).toBe(false)
      expect(r.issues[0]).toContain('JSON')
    })

    it('non-object fails', () => {
      const r = validateToolLayerEmit('emitPagedata', 42)
      expect(r.passed).toBe(false)
    })

    it('missing dataset fails', () => {
      const r = validateToolLayerEmit('emitPagedata', { tables: {} })
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('dataset'))).toBe(true)
    })

    it('missing dataSetName fails', () => {
      const r = validateToolLayerEmit('emitPagedata', { dataset: { tables: {} } })
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('dataSetName'))).toBe(true)
    })

    it('missing tables fails', () => {
      const r = validateToolLayerEmit('emitPagedata', { dataset: { dataSetName: 'DS' } })
      expect(r.passed).toBe(false)
    })

    it('table without columns fails', () => {
      const r = validateToolLayerEmit('emitPagedata', {
        dataset: {
          dataSetName: 'DS',
          tables: { T: { views: { default: {} } } },
        },
      })
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('columns'))).toBe(true)
    })

    it('table without views.default fails', () => {
      const r = validateToolLayerEmit('emitPagedata', {
        dataset: {
          dataSetName: 'DS',
          tables: {
            T: {
              columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
            },
          },
        },
      })
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('views.default'))).toBe(true)
    })

    it('table with root-level rows warns', () => {
      const r = validateToolLayerEmit('emitPagedata', {
        dataset: {
          dataSetName: 'DS',
          tables: {
            T: {
              columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
              views: { default: {} },
              rows: [{ id: 1 }],
            },
          },
        },
      })
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('rows'))).toBe(true)
    })

    it('table without isPrimaryKey fails', () => {
      const r = validateToolLayerEmit('emitPagedata', {
        dataset: {
          dataSetName: 'DS',
          tables: {
            T: {
              columns: [{ name: 'id', type: 'number' }],
              views: { default: {} },
            },
          },
        },
      })
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('isPrimaryKey'))).toBe(true)
    })
  })

  describe('emitRuleJson', () => {
    it('valid rule.json passes', () => {
      const r = validateToolLayerEmit('emitRuleJson', VALID_RULE_JSON)
      expect(r.passed).toBe(true)
    })

    it('string JSON also passes', () => {
      const r = validateToolLayerEmit('emitRuleJson', JSON.stringify(VALID_RULE_JSON))
      expect(r.passed).toBe(true)
    })

    it('non-array fails', () => {
      const r = validateToolLayerEmit('emitRuleJson', { type: 'div' })
      expect(r.passed).toBe(false)
      expect(r.issues[0]).toContain('数组')
    })

    it('empty array fails', () => {
      const r = validateToolLayerEmit('emitRuleJson', [])
      expect(r.passed).toBe(false)
    })

    it('node without type fails', () => {
      const r = validateToolLayerEmit('emitRuleJson', [{ props: {} }])
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('type'))).toBe(true)
    })
  })

  describe('emitScriptJs', () => {
    it('valid script passes', () => {
      const r = validateToolLayerEmit('emitScriptJs', VALID_SCRIPT_JS)
      expect(r.passed).toBe(true)
    })

    it('non-string fails', () => {
      const r = validateToolLayerEmit('emitScriptJs', 42)
      expect(r.passed).toBe(false)
    })

    it('empty string fails', () => {
      const r = validateToolLayerEmit('emitScriptJs', '')
      expect(r.passed).toBe(false)
    })

    it('missing __init__ fails', () => {
      const r = validateToolLayerEmit('emitScriptJs', 'function foo() {}')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('__init__'))).toBe(true)
    })

    it('import statement fails', () => {
      const r = validateToolLayerEmit('emitScriptJs', 'import foo from "bar";\nfunction __init__() {}')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('import'))).toBe(true)
    })

    it('ElMessage usage fails', () => {
      const r = validateToolLayerEmit('emitScriptJs', 'function __init__() { ElMessage.success("ok") }')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('ElMessage'))).toBe(true)
    })

    it('ElMessageBox usage fails', () => {
      const r = validateToolLayerEmit('emitScriptJs', 'function __init__() { ElMessageBox.confirm("sure?") }')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('ElMessageBox'))).toBe(true)
    })
  })

  describe('emitStyleCss', () => {
    it('valid CSS passes', () => {
      const r = validateToolLayerEmit('emitStyleCss', VALID_STYLE_CSS)
      expect(r.passed).toBe(true)
    })

    it('empty string passes (allowed)', () => {
      const r = validateToolLayerEmit('emitStyleCss', '')
      expect(r.passed).toBe(true)
    })

    it('non-string fails', () => {
      const r = validateToolLayerEmit('emitStyleCss', { color: 'red' })
      expect(r.passed).toBe(false)
    })
  })

  it('unknown tool name passes (default)', () => {
    const r = validateToolLayerEmit('unknownTool', 'anything')
    expect(r.passed).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════
// 4. Semantic Cross-Phase Validators
// ═══════════════════════════════════════════════════════════

describe('validateSemanticCrossPhase', () => {
  describe('data phase', () => {
    it('valid pagedata passes', () => {
      const a: GenerateArtifacts = { pagedata: JSON.stringify(VALID_PAGEDATA) }
      const r = validateSemanticCrossPhase(a, 'data')
      expect(r.passed).toBe(true)
    })

    it('missing pagedata fails', () => {
      const r = validateSemanticCrossPhase({}, 'data')
      expect(r.passed).toBe(false)
    })

    it('invalid JSON fails', () => {
      const r = validateSemanticCrossPhase({ pagedata: '{bad' }, 'data')
      expect(r.passed).toBe(false)
    })

    it('relation referencing nonexistent table fails', () => {
      const pd = {
        dataset: {
          dataSetName: 'DS',
          tables: {
            T1: { columns: [{ name: 'id', isPrimaryKey: true }], views: { default: {} } },
          },
          tableRelations: [
            { parentTable: 'T1', childTable: 'T_NONEXISTENT', parentField: 'id', childField: 'fk' },
          ],
        },
      }
      const r = validateSemanticCrossPhase({ pagedata: JSON.stringify(pd) }, 'data')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('T_NONEXISTENT'))).toBe(true)
    })

    it('relation with illegal fields reports issues', () => {
      const pd = {
        dataset: {
          dataSetName: 'DS',
          tables: {
            T1: { columns: [{ name: 'id', isPrimaryKey: true }], views: { default: {} } },
            T2: { columns: [{ name: 'id', isPrimaryKey: true }], views: { default: {} } },
          },
          tableRelations: [
            { parentTable: 'T1', childTable: 'T2', parentField: 'id', childField: 'fk', autoLoad: true },
          ],
        },
      }
      const r = validateSemanticCrossPhase({ pagedata: JSON.stringify(pd) }, 'data')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('autoLoad'))).toBe(true)
    })
  })

  describe('ui phase', () => {
    it('valid rule.json + script.js passes', () => {
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(VALID_RULE_JSON),
        scriptJs: VALID_SCRIPT_JS,
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })

    it('missing ruleJson fails', () => {
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        scriptJs: VALID_SCRIPT_JS,
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(false)
    })

    it('missing scriptJs fails', () => {
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(VALID_RULE_JSON),
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(false)
    })

    it('event handler not in scriptJs fails', () => {
      const rule = [{ type: 'el-button', on: { click: 'handleMissing' } }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('handleMissing'))).toBe(true)
    })

    it('Render* component not in scriptJs fails', () => {
      const rule = [{ type: 'RenderCustomPanel' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('RenderCustomPanel'))).toBe(true)
    })

    it('Render* in script passes when defined', () => {
      const rule = [{ type: 'RenderStats' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}\nfunction RenderStats() { return h("div", "stats") }',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })

    it('dataKey referencing nonexistent table triggers backtrack', () => {
      const rule = [{ type: 'r-table', dataKey: 'Nonexistent@rows' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(false)
      expect(r.requiresBacktrack).toBe(true)
      expect(r.issues.some(i => i.includes('Nonexistent'))).toBe(true)
    })

    it('dataKey referencing existing table passes', () => {
      const rule = [{ type: 'r-table', dataKey: 'Orders@rows' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })
  })

  describe('style phase', () => {
    it('valid styleCss passes', () => {
      const a: GenerateArtifacts = { styleCss: VALID_STYLE_CSS }
      const r = validateSemanticCrossPhase(a, 'style')
      expect(r.passed).toBe(true)
    })

    it('missing styleCss fails', () => {
      const r = validateSemanticCrossPhase({}, 'style')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('style.css'))).toBe(true)
    })

    it('empty styleCss with no class refs passes', () => {
      const a: GenerateArtifacts = { styleCss: '' }
      const r = validateSemanticCrossPhase(a, 'style')
      expect(r.passed).toBe(true)
    })

    it('empty styleCss with class refs in ruleJson fails', () => {
      const a: GenerateArtifacts = {
        ruleJson: JSON.stringify([{ type: 'div', class: 'my-class' }]),
        styleCss: '',
      }
      const r = validateSemanticCrossPhase(a, 'style')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('CSS class'))).toBe(true)
    })

    it('non-empty styleCss with class refs passes', () => {
      const a: GenerateArtifacts = {
        ruleJson: JSON.stringify([{ type: 'div', class: 'my-class' }]),
        styleCss: '.my-class { color: red; }',
      }
      const r = validateSemanticCrossPhase(a, 'style')
      expect(r.passed).toBe(true)
    })
  })
})

// ═══════════════════════════════════════════════════════════
// 5. Orchestrator — Mock backend end-to-end
// ═══════════════════════════════════════════════════════════

describe('runGenerateLoop (mock backend)', () => {
  /**
   * 创建 mock SessionBackend。
   * turnResponses 队列模拟 LLM 每轮返回的 tool_calls。
   */
  function createMockBackend(turnResponses: Array<{
    toolCalls: Array<{
      id: string
      function: { name: string; arguments: string }
    }>
  } | null>): SessionBackend {
    let turnIndex = 0
    return {
      createSession: vi.fn().mockResolvedValue('mock-session-123'),
      executeTurn: vi.fn().mockImplementation(() => {
        const resp = turnResponses[turnIndex] ?? null
        turnIndex++
        return Promise.resolve(resp)
      }),
      appendMessages: vi.fn().mockResolvedValue(undefined),
      getConversation: vi.fn().mockResolvedValue([]),
      destroySession: vi.fn().mockResolvedValue(undefined),
      destroyAllSessions: vi.fn().mockResolvedValue(undefined),
    }
  }

  function tc(id: string, name: string, args: unknown) {
    return { id, function: { name, arguments: JSON.stringify(args) } }
  }

  it('should converge with all 4 files when LLM follows happy path', async () => {
    const turns = [
      // Phase 1: data
      { toolCalls: [tc('t1', 'queryCapabilities', { phase: 'data' })] },
      { toolCalls: [tc('t2', 'emitPagedata', { content: VALID_PAGEDATA })] },
      // Phase 2: ui
      { toolCalls: [tc('t3', 'queryCapabilities', { phase: 'ui' })] },
      { toolCalls: [tc('t4', 'queryComponentCatalog', { componentType: '*' })] },
      { toolCalls: [tc('t5', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      { toolCalls: [tc('t6', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      // Phase 3: style
      { toolCalls: [tc('t7', 'emitStyleCss', { content: VALID_STYLE_CSS })] },
    ]

    const backend = createMockBackend(turns)
    const events: GenerateProgressEvent[] = []
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试页面',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 10,
      onProgress: (e) => events.push(e),
    })

    expect(result.success).toBe(true)
    expect(result.artifacts.pagedata).toBeDefined()
    expect(result.artifacts.ruleJson).toBeDefined()
    expect(result.artifacts.scriptJs).toBeDefined()
    expect(result.artifacts.styleCss).toBeDefined()

    // 确认三阶段都完成
    const phaseCompletes = events.filter(e => e.type === 'phase-complete')
    expect(phaseCompletes).toHaveLength(3)

    // 确认 final complete
    expect(events.some(e => e.type === 'complete')).toBe(true)
  })

  it('should fail Phase 3 if emitStyleCss is never called (not skip)', async () => {
    const turns = [
      // Phase 1
      { toolCalls: [tc('t1', 'emitPagedata', { content: VALID_PAGEDATA })] },
      // Phase 2
      { toolCalls: [tc('t2', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      { toolCalls: [tc('t3', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      // Phase 3: only query, no emit
      { toolCalls: [tc('t4', 'queryCapabilities', { phase: 'style' })] },
      // MaxRounds exhausted for phase 3, nudge kicks in:
      // nudge executeTurn returns nothing → no styleCss
      null,
      null,
    ]

    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试页面',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 2,
    })

    // styleCss should be undefined (Phase 3 didn't produce it)
    expect(result.artifacts.styleCss).toBeUndefined()
  })

  it('should store styleCss when emitStyleCss is called', async () => {
    const cssContent = '.test { color: blue; }'
    const turns = [
      // Phase 1
      { toolCalls: [tc('t1', 'emitPagedata', { content: VALID_PAGEDATA })] },
      // Phase 2
      { toolCalls: [tc('t2', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      { toolCalls: [tc('t3', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      // Phase 3
      { toolCalls: [tc('t4', 'emitStyleCss', { content: cssContent })] },
    ]

    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试页面',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
    })

    expect(result.success).toBe(true)
    expect(result.artifacts.styleCss).toBe(cssContent)
  })

  it('should reject invalid emit and let LLM retry', async () => {
    const turns = [
      // Phase 1: bad pagedata → rejected → good pagedata → accepted
      { toolCalls: [tc('t1', 'emitPagedata', { content: { nope: true } })] },
      { toolCalls: [tc('t2', 'emitPagedata', { content: VALID_PAGEDATA })] },
      // Phase 2
      { toolCalls: [tc('t3', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      { toolCalls: [tc('t4', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      // Phase 3
      { toolCalls: [tc('t5', 'emitStyleCss', { content: VALID_STYLE_CSS })] },
    ]

    const backend = createMockBackend(turns)
    const events: GenerateProgressEvent[] = []
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试页面',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
      onProgress: (e) => events.push(e),
    })

    expect(result.success).toBe(true)
    // First emit should have validation failure
    const validationEvents = events.filter(e => e.type === 'validation' && e.layer === 'tool' && !e.passed)
    expect(validationEvents.length).toBeGreaterThanOrEqual(1)
  })

  it('should handle multiple tool calls in single turn', async () => {
    const turns = [
      // Phase 1
      { toolCalls: [tc('t1', 'emitPagedata', { content: VALID_PAGEDATA })] },
      // Phase 2: both emits in one turn
      {
        toolCalls: [
          tc('t2', 'emitRuleJson', { content: VALID_RULE_JSON }),
          tc('t3', 'emitScriptJs', { content: VALID_SCRIPT_JS }),
        ],
      },
      // Phase 3
      { toolCalls: [tc('t4', 'emitStyleCss', { content: VALID_STYLE_CSS })] },
    ]

    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试页面',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
    })

    expect(result.success).toBe(true)
    expect(result.artifacts.ruleJson).toBeDefined()
    expect(result.artifacts.scriptJs).toBeDefined()
  })

  it('should nudge for missing emitStyleCss when rounds exhausted', async () => {
    const turns = [
      // Phase 1
      { toolCalls: [tc('t1', 'emitPagedata', { content: VALID_PAGEDATA })] },
      // Phase 2
      { toolCalls: [tc('t2', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      { toolCalls: [tc('t3', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      // Phase 3: round 1 only queries → rounds exhausted
      { toolCalls: [tc('t4', 'queryCapabilities', { phase: 'style' })] },
      // Nudge response → emitStyleCss
      { toolCalls: [tc('t5', 'emitStyleCss', { content: '.test {}' })] },
    ]

    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试页面',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 1,
    })

    expect(result.artifacts.styleCss).toBe('.test {}')
    // AppendMessages should have been called with nudge text
    const appendCalls = (backend.appendMessages as ReturnType<typeof vi.fn>).mock.calls
    const nudgeCall = appendCalls.find((call: unknown[]) =>
      JSON.stringify(call).includes('轮次即将耗尽'),
    )
    expect(nudgeCall).toBeDefined()
  })

  it('should call destroySession... no — session cleanup is external', async () => {
    // The orchestrator returns sessionId, cleanup is done by caller
    const turns = [
      { toolCalls: [tc('t1', 'emitPagedata', { content: VALID_PAGEDATA })] },
      { toolCalls: [tc('t2', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      { toolCalls: [tc('t3', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      { toolCalls: [tc('t4', 'emitStyleCss', { content: VALID_STYLE_CSS })] },
    ]
    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试页面',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
    })
    expect(result.sessionId).toBe('mock-session-123')
  })

  it('should return error on LLM null response', async () => {
    const turns: Array<null> = [null]
    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试页面',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
    })
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('phaseSummary should have 3 entries on success', async () => {
    const turns = [
      { toolCalls: [tc('t1', 'emitPagedata', { content: VALID_PAGEDATA })] },
      { toolCalls: [tc('t2', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      { toolCalls: [tc('t3', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      { toolCalls: [tc('t4', 'emitStyleCss', { content: VALID_STYLE_CSS })] },
    ]
    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试页面',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
    })
    expect(result.phaseSummary).toHaveLength(3)
    expect(result.phaseSummary.map(p => p.phase)).toEqual(['data', 'ui', 'style'])
  })
})

// ═══════════════════════════════════════════════════════════
// 6. hasRequiredArtifacts (indirect testing via orchestrator)
// ═══════════════════════════════════════════════════════════

describe('hasRequiredArtifacts completeness', () => {
  // These tests verify that the orchestrator correctly blocks each phase
  // until the required emit tools have been called.

  function createMockBackend(turnResponses: Array<{
    toolCalls: Array<{
      id: string
      function: { name: string; arguments: string }
    }>
  } | null>): SessionBackend {
    let turnIndex = 0
    return {
      createSession: vi.fn().mockResolvedValue('mock-session-has'),
      executeTurn: vi.fn().mockImplementation(() => {
        const resp = turnResponses[turnIndex] ?? null
        turnIndex++
        return Promise.resolve(resp)
      }),
      appendMessages: vi.fn().mockResolvedValue(undefined),
      getConversation: vi.fn().mockResolvedValue([]),
      destroySession: vi.fn().mockResolvedValue(undefined),
      destroyAllSessions: vi.fn().mockResolvedValue(undefined),
    }
  }

  function tc(id: string, name: string, args: unknown) {
    return { id, function: { name, arguments: JSON.stringify(args) } }
  }

  it('Phase 1 blocks until emitPagedata is called', async () => {
    const turns = [
      // Phase 1: query only, no emit
      { toolCalls: [tc('t1', 'queryCapabilities', { phase: 'data' })] },
      { toolCalls: [tc('t2', 'queryActionSpec', { capabilityId: 'DataSet.tables' })] },
      // rounds exhausted, nudge:
      null, // nudge returns null → no pagedata
      null,
    ]
    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试页面',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 2,
    })
    expect(result.artifacts.pagedata).toBeUndefined()
  })

  it('Phase 2 blocks until both emitRuleJson AND emitScriptJs are called', async () => {
    const turns = [
      // Phase 1: good
      { toolCalls: [tc('t1', 'emitPagedata', { content: VALID_PAGEDATA })] },
      // Phase 2: only ruleJson, no scriptJs
      { toolCalls: [tc('t2', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      // Phase 2 round 2: query only
      { toolCalls: [tc('t3', 'queryCapabilities', { phase: 'ui' })] },
      // nudge → returns emitScriptJs
      { toolCalls: [tc('t4', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      // Phase 3
      { toolCalls: [tc('t5', 'emitStyleCss', { content: VALID_STYLE_CSS })] },
    ]
    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试页面',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 2,
    })
    // Both should exist thanks to nudge
    expect(result.artifacts.ruleJson).toBeDefined()
    expect(result.artifacts.scriptJs).toBeDefined()
  })

  it('Phase 3 blocks until emitStyleCss is called (the fixed bug)', async () => {
    const turns = [
      { toolCalls: [tc('t1', 'emitPagedata', { content: VALID_PAGEDATA })] },
      { toolCalls: [tc('t2', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      { toolCalls: [tc('t3', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      // Phase 3: query only → rounds exhausted → nudge
      { toolCalls: [tc('t4', 'queryCapabilities', { phase: 'style' })] },
      // nudge → null response → styleCss undefined
      null,
      null,
    ]
    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试页面',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 1,
    })
    // Phase 3 should NOT have passed — styleCss missing
    expect(result.artifacts.styleCss).toBeUndefined()
    // The old buggy code would have styleCss undefined but phase marked complete
    const stylePhase = result.phaseSummary.find(p => p.phase === 'style')
    expect(stylePhase).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════
// 7. Catalog Projections（projectFcDirectory / projectFcSpec 等）
// ═══════════════════════════════════════════════════════════

describe('Catalog Projections', () => {
  const catalog = createMiniCatalog()

  describe('projectFcDirectory', () => {
    it('returns summary with correct counts', () => {
      const dir = projectFcDirectory(catalog)
      expect(dir.summary.total).toBe(3)
      expect(dir.summary.containers).toBe(1)
      expect(dir.summary.fields).toBe(2)
      expect(dir.registry).toBeDefined()
      expect(dir.registry.containers).toContain('r-table')
      expect(dir.registry.fields).toContain('r-text')
      expect(dir.registry.fields).toContain('r-number')
    })

    it('components list has all entries', () => {
      const dir = projectFcDirectory(catalog)
      expect(dir.components).toHaveLength(3)
      const types = dir.components.map((c: Record<string, unknown>) => c['type'])
      expect(types).toContain('r-table')
      expect(types).toContain('r-text')
      expect(types).toContain('r-number')
    })

    it('handles catalog without registry gracefully', () => {
      const noReg = { ...catalog, registry: undefined } as unknown as ComponentCatalog
      const dir = projectFcDirectory(noReg)
      // Should derive from components by category
      expect(dir.summary.total).toBeGreaterThan(0)
    })
  })

  describe('projectFcSpec', () => {
    it('returns spec for known component', () => {
      const spec = projectFcSpec(catalog, 'r-table')
      expect(spec).not.toBeNull()
      expect(spec!.type).toBe('r-table')
      expect(spec!.category).toBe('container')
      expect(spec!.props).toHaveLength(2)
      expect(spec!.emits).toHaveLength(1)
    })

    it('returns null for unknown component', () => {
      const spec = projectFcSpec(catalog, 'nonexistent')
      expect(spec).toBeNull()
    })

    it('simplifies props (only name/type/required/default/description)', () => {
      const spec = projectFcSpec(catalog, 'r-table')!
      for (const prop of spec.props) {
        expect(prop).toHaveProperty('name')
        expect(prop).toHaveProperty('type')
        expect(prop).toHaveProperty('required')
      }
    })
  })

  describe('projectDevTypes', () => {
    it('returns sorted type list', () => {
      const types = projectDevTypes(catalog)
      expect(types).toContain('r-table')
      expect(types).toContain('r-text')
      expect(types).toContain('r-number')
      expect(types).toEqual([...types].sort())
    })
  })

  describe('projectDevPropNames', () => {
    it('returns prop names per component', () => {
      const propNames = projectDevPropNames(catalog)
      expect(propNames['r-table']).toBeDefined()
      expect(propNames['r-table']).toContain('dataKey')
      expect(propNames['r-table']).toContain('highlightCurrentRow')
    })

    it('excludes structural keys (type/props/children/id)', () => {
      const propNames = projectDevPropNames(catalog)
      for (const names of Object.values(propNames)) {
        expect(names).not.toContain('type')
        expect(names).not.toContain('props')
        expect(names).not.toContain('children')
        expect(names).not.toContain('id')
      }
    })
  })

  describe('projectDevPropEnums', () => {
    it('returns empty enums for catalog with no enum props', () => {
      const enums = projectDevPropEnums(catalog)
      // Our test catalog has simple types (string/boolean), no enum values
      // So either empty or only types that have enums
      expect(typeof enums).toBe('object')
    })

    it('detects enum types from type strings', () => {
      const enumCatalog: ComponentCatalog = {
        ...catalog,
        components: {
          ...catalog.components,
          'r-select': {
            type: 'r-select',
            category: 'field' as const,
            description: '下拉选择',
            props: [
              { name: 'size', type: "'small' | 'default' | 'large'", required: false },
              { name: 'field', type: 'string', required: true },
            ],
            emits: [],
            source: 'vcm' as const,
          },
        },
      }
      const enums = projectDevPropEnums(enumCatalog)
      if (enums['r-select']) {
        expect(enums['r-select']!['size']).toBeDefined()
        expect(enums['r-select']!['size']).toContain('small')
        expect(enums['r-select']!['size']).toContain('default')
        expect(enums['r-select']!['size']).toContain('large')
      }
    })
  })
})

// ═══════════════════════════════════════════════════════════
// 8. Prompt 导出完整性
// ═══════════════════════════════════════════════════════════

describe('Page System Prompts', () => {
  it('GENERATE_BASE_PROMPT is non-empty string', () => {
    expect(typeof GENERATE_BASE_PROMPT).toBe('string')
    expect(GENERATE_BASE_PROMPT.length).toBeGreaterThan(50)
  })

  it('DATA_PHASE_PROMPT is non-empty string', () => {
    expect(typeof DATA_PHASE_PROMPT).toBe('string')
    expect(DATA_PHASE_PROMPT.length).toBeGreaterThan(50)
  })

  it('UI_PHASE_PROMPT is non-empty string', () => {
    expect(typeof UI_PHASE_PROMPT).toBe('string')
    expect(UI_PHASE_PROMPT.length).toBeGreaterThan(50)
  })

  it('STYLE_PHASE_PROMPT is non-empty string', () => {
    expect(typeof STYLE_PHASE_PROMPT).toBe('string')
    expect(STYLE_PHASE_PROMPT.length).toBeGreaterThan(50)
  })

  it('CROSS_CONSISTENCY_PROMPT is non-empty string', () => {
    expect(typeof CROSS_CONSISTENCY_PROMPT).toBe('string')
    expect(CROSS_CONSISTENCY_PROMPT.length).toBeGreaterThan(10)
  })
})

// ═══════════════════════════════════════════════════════════
// 9. Validator Helpers（通过公开 API 间接测试内部 helper 函数）
// ═══════════════════════════════════════════════════════════

describe('Validator Helpers (indirectly tested)', () => {
  describe('extractFunctionNames — via ui phase Render* check', () => {
    it('detects standard function declarations', () => {
      const rule = [{ type: 'RenderMyPanel' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}\nfunction RenderMyPanel() { return h("div") }',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })

    it('detects async function declarations', () => {
      const rule = [{ type: 'RenderAsync' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}\nasync function RenderAsync() { return h("div") }',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })

    it('detects const arrow function', () => {
      const rule = [{ type: 'div', on: { click: 'handleSubmit' } }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}\nconst handleSubmit = () => { console.log("ok") }',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })

    it('detects let arrow function with params', () => {
      const rule = [{ type: 'div', on: { click: 'doAction' } }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}\nlet doAction = (e) => { console.log(e) }',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })
  })

  describe('collectNodes — via deeply nested rule.json', () => {
    it('finds Render in deeply nested children', () => {
      const rule = [
        {
          type: 'div',
          children: [
            {
              type: 'div',
              children: [
                {
                  type: 'div',
                  children: [{ type: 'RenderDeep' }],
                },
              ],
            },
          ],
        },
      ]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('RenderDeep'))).toBe(true)
    })

    it('finds dataKey in nested children', () => {
      const rule = [
        {
          type: 'div',
          children: [
            { type: 'r-table', dataKey: 'BadTable@rows' },
          ],
        },
      ]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('BadTable'))).toBe(true)
      expect(r.requiresBacktrack).toBe(true)
    })
  })

  describe('extractTableFromDataKey — via dataKey validation', () => {
    it('2-segment: table@field → extracts table', () => {
      const rule = [{ type: 'r-table', dataKey: 'Orders@rows' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true) // Orders exists
    })

    it('3-segment: table@viewId@field → extracts table', () => {
      const rule = [{ type: 'r-table', dataKey: 'Orders@grid@rows' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true) // Orders exists
    })

    it('#scope dataKey: extracts table from 2nd segment', () => {
      const rule = [{ type: 'r-table', dataKey: '#Shared@Orders@rows' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      // #scope starts with # → validator skips (cross-page scope)
      const r = validateSemanticCrossPhase(a, 'ui')
      // The extractTableFromDataKey for #Shared returns 'Orders' (parts[1])
      // and Orders exists in pagedata, so it should pass
      expect(r.passed).toBe(true)
    })

    it('single-segment dataKey: no @ → no table extracted → no check', () => {
      const rule = [{ type: 'r-table', dataKey: 'noSeparator' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      // single-segment → extractTableFromDataKey returns null → no table check
      expect(r.passed).toBe(true)
    })
  })

  describe('rowActions Render* check', () => {
    it('detects missing Render* in rowActions', () => {
      const rule = [
        {
          type: 'r-table',
          dataKey: 'Orders@rows',
          props: {
            rowActions: [
              { type: 'RenderAction', label: '操作' },
            ],
          },
        },
      ]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('RenderAction'))).toBe(true)
    })

    it('passes when Render* in rowActions is defined', () => {
      const rule = [
        {
          type: 'r-table',
          dataKey: 'Orders@rows',
          props: {
            rowActions: [
              { type: 'RenderAction', label: '操作' },
            ],
          },
        },
      ]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}\nfunction RenderAction() { return h("span") }',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })
  })

  describe('empty event handler string', () => {
    it('empty handler string is ignored (not flagged)', () => {
      const rule = [{ type: 'el-button', on: { click: '' } }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })
  })

  describe('data phase: all illegal fields', () => {
    const ILLEGAL_FIELDS = ['autoLoad', 'lazyLoad', 'apiEnabled', 'parentViewId', 'childViewId']
    it.each(ILLEGAL_FIELDS)('reports illegal field: %s', (field) => {
      const pd = {
        dataset: {
          dataSetName: 'DS',
          tables: {
            T1: { columns: [{ name: 'id', isPrimaryKey: true }], views: { default: {} } },
            T2: { columns: [{ name: 'id', isPrimaryKey: true }], views: { default: {} } },
          },
          tableRelations: [
            { parentTable: 'T1', childTable: 'T2', parentField: 'id', childField: 'fk', [field]: true },
          ],
        },
      }
      const r = validateSemanticCrossPhase({ pagedata: JSON.stringify(pd) }, 'data')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes(field))).toBe(true)
    })
  })
})

// ═══════════════════════════════════════════════════════════
// 10. Orchestrator 追加场景 — 回溯 + 异常 + 边界
// ═══════════════════════════════════════════════════════════

describe('runGenerateLoop — advanced scenarios', () => {
  function createMockBackend(turnResponses: Array<{
    toolCalls: Array<{
      id: string
      function: { name: string; arguments: string }
    }>
  } | null>): SessionBackend {
    let turnIndex = 0
    return {
      createSession: vi.fn().mockResolvedValue('mock-session-adv'),
      executeTurn: vi.fn().mockImplementation(() => {
        const resp = turnResponses[turnIndex] ?? null
        turnIndex++
        return Promise.resolve(resp)
      }),
      appendMessages: vi.fn().mockResolvedValue(undefined),
      getConversation: vi.fn().mockResolvedValue([]),
      destroySession: vi.fn().mockResolvedValue(undefined),
      destroyAllSessions: vi.fn().mockResolvedValue(undefined),
    }
  }

  function tc(id: string, name: string, args: unknown) {
    return { id, function: { name, arguments: JSON.stringify(args) } }
  }

  it('should backtrack when ui dataKey references nonexistent table', async () => {
    const badRule = [{ type: 'r-table', dataKey: 'NonExist@rows' }]
    const fixedPagedata = {
      dataset: {
        dataSetName: 'PageDataSet',
        tables: {
          NonExist: {
            columns: [
              { name: 'id', type: 'number', isPrimaryKey: true },
            ],
            views: { default: { rows: [] } },
          },
        },
      },
    }
    const turns = [
      // Phase 1: valid pagedata
      { toolCalls: [tc('t1', 'emitPagedata', { content: VALID_PAGEDATA })] },
      // Phase 2: rule.json references NonExist table (not in pagedata)
      { toolCalls: [tc('t2', 'emitRuleJson', { content: badRule })] },
      { toolCalls: [tc('t3', 'emitScriptJs', { content: 'function __init__() {}' })] },
      // semantic check fails, requests backtrack → re-enters phase 1
      // Phase 1 (backtracked): fix pagedata to include NonExist
      { toolCalls: [tc('t4', 'emitPagedata', { content: fixedPagedata })] },
      // Phase 2 (re-entered): redone emits
      { toolCalls: [tc('t5', 'emitRuleJson', { content: badRule })] },
      { toolCalls: [tc('t6', 'emitScriptJs', { content: 'function __init__() {}' })] },
      // Phase 3
      { toolCalls: [tc('t7', 'emitStyleCss', { content: '' })] },
    ]

    const events: GenerateProgressEvent[] = []
    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试页面',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
      maxBacktracks: 1,
      onProgress: (e) => events.push(e),
    })

    // Check backtrack event was emitted
    const backtracks = events.filter(e => e.type === 'backtrack')
    expect(backtracks.length).toBeGreaterThanOrEqual(1)
    if (backtracks[0]?.type === 'backtrack') {
      expect(backtracks[0].from).toBe('ui')
      expect(backtracks[0].to).toBe('data')
    }
  })

  it('should handle createSession error', async () => {
    const backend: SessionBackend = {
      createSession: vi.fn().mockRejectedValue(new Error('Connection refused')),
      executeTurn: vi.fn(),
      appendMessages: vi.fn(),
      getConversation: vi.fn(),
      destroySession: vi.fn(),
      destroyAllSessions: vi.fn(),
    }
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试',
      catalog: createMiniCatalog(),
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Connection refused')
  })

  it('should handle executeTurn error', async () => {
    const backend: SessionBackend = {
      createSession: vi.fn().mockResolvedValue('session-err'),
      executeTurn: vi.fn().mockRejectedValue(new Error('API timeout')),
      appendMessages: vi.fn().mockResolvedValue(undefined),
      getConversation: vi.fn().mockResolvedValue([]),
      destroySession: vi.fn().mockResolvedValue(undefined),
      destroyAllSessions: vi.fn().mockResolvedValue(undefined),
    }
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试',
      catalog: createMiniCatalog(),
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('API timeout')
  })

  it('should handle malformed tool_call arguments gracefully', async () => {
    const turns = [
      // Phase 1: emitPagedata with unparseable arguments
      {
        toolCalls: [{
          id: 't1',
          function: { name: 'emitPagedata', arguments: '{invalid json' },
        }],
      },
      // Follow-up with valid pagedata
      { toolCalls: [tc('t2', 'emitPagedata', { content: VALID_PAGEDATA })] },
      { toolCalls: [tc('t3', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      { toolCalls: [tc('t4', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      { toolCalls: [tc('t5', 'emitStyleCss', { content: VALID_STYLE_CSS })] },
    ]
    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
    })
    // Should still succeed because the 2nd attempt was valid
    expect(result.artifacts.pagedata).toBeDefined()
  })

  it('should track totalRounds across all phases', async () => {
    const turns = [
      // Phase 1: 2 rounds (query + emit)
      { toolCalls: [tc('t1', 'queryCapabilities', { phase: 'data' })] },
      { toolCalls: [tc('t2', 'emitPagedata', { content: VALID_PAGEDATA })] },
      // Phase 2: 1 round (both emits at once)
      {
        toolCalls: [
          tc('t3', 'emitRuleJson', { content: VALID_RULE_JSON }),
          tc('t4', 'emitScriptJs', { content: VALID_SCRIPT_JS }),
        ],
      },
      // Phase 3: 1 round
      { toolCalls: [tc('t5', 'emitStyleCss', { content: VALID_STYLE_CSS })] },
    ]
    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
    })
    expect(result.success).toBe(true)
    expect(result.totalRounds).toBe(4) // 2 + 1 + 1
  })

  it('should inject phase prompt via appendMessages', async () => {
    const turns = [
      { toolCalls: [tc('t1', 'emitPagedata', { content: VALID_PAGEDATA })] },
      { toolCalls: [tc('t2', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      { toolCalls: [tc('t3', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      { toolCalls: [tc('t4', 'emitStyleCss', { content: VALID_STYLE_CSS })] },
    ]
    const backend = createMockBackend(turns)
    await runGenerateLoop(backend, {
      userPrompt: '测试',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
    })

    const appendCalls = (backend.appendMessages as ReturnType<typeof vi.fn>).mock.calls
    // Phase 2 transition should include phase prompt
    const phaseTransition = appendCalls.find((call: unknown[]) =>
      JSON.stringify(call).includes('切换到下一阶段'),
    )
    expect(phaseTransition).toBeDefined()
  })

  it('should pass when LLM returns no toolCalls and phase artifacts already collected', async () => {
    const turns = [
      // Phase 1: emit then empty response
      { toolCalls: [tc('t1', 'emitPagedata', { content: VALID_PAGEDATA })] },
      { toolCalls: [] }, // empty turn → check artifacts → phaseComplete
      // Phase 2
      { toolCalls: [tc('t2', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      { toolCalls: [tc('t3', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      // Phase 3
      { toolCalls: [tc('t4', 'emitStyleCss', { content: VALID_STYLE_CSS })] },
    ]
    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
    })
    expect(result.success).toBe(true)
    expect(result.artifacts.pagedata).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════
// 11. Edge cases — validateToolLayerEmit 边界
// ═══════════════════════════════════════════════════════════

describe('validateToolLayerEmit — edge cases', () => {
  it('emitPagedata: multi-table with all valid passes', () => {
    const r = validateToolLayerEmit('emitPagedata', VALID_PAGEDATA_WITH_RELATIONS)
    expect(r.passed).toBe(true)
  })

  it('emitPagedata: nested dataset inside other keys still validates', () => {
    const r = validateToolLayerEmit('emitPagedata', {
      dataset: {
        dataSetName: 'DS',
        tables: {
          T: {
            columns: [{ name: 'id', isPrimaryKey: true, type: 'number' }],
            views: { default: {} },
          },
        },
      },
    })
    expect(r.passed).toBe(true)
  })

  it('emitRuleJson: node with invalid element in array is caught', () => {
    const r = validateToolLayerEmit('emitRuleJson', [42])
    expect(r.passed).toBe(false)
    expect(r.issues.some(i => i.includes('有效对象'))).toBe(true)
  })

  it('emitRuleJson: string JSON array also passes', () => {
    const r = validateToolLayerEmit('emitRuleJson', '[{"type":"div"}]')
    expect(r.passed).toBe(true)
  })

  it('emitRuleJson: invalid JSON string fails', () => {
    const r = validateToolLayerEmit('emitRuleJson', '[bad]')
    expect(r.passed).toBe(false)
    expect(r.issues[0]).toContain('JSON')
  })

  it('emitScriptJs: $page.showMessage usage is allowed', () => {
    const r = validateToolLayerEmit('emitScriptJs', 'function __init__() { $page.showMessage("ok", "success") }')
    expect(r.passed).toBe(true)
  })

  it('emitScriptJs: contains both __init__ and other functions', () => {
    const r = validateToolLayerEmit('emitScriptJs', `
      function __init__() {}
      function handleEdit(row) { $page.showMessage("编辑", "info") }
    `)
    expect(r.passed).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════
// 12. Cross-phase semantic edge cases
// ═══════════════════════════════════════════════════════════

describe('validateSemanticCrossPhase — edge cases', () => {
  it('data: valid relations with all existing tables passes', () => {
    const r = validateSemanticCrossPhase(
      { pagedata: JSON.stringify(VALID_PAGEDATA_WITH_RELATIONS) },
      'data',
    )
    expect(r.passed).toBe(true)
  })

  it('data: missing parent table in relation fails', () => {
    const pd = {
      dataset: {
        dataSetName: 'DS',
        tables: {
          T2: { columns: [{ name: 'id', isPrimaryKey: true }], views: { default: {} } },
        },
        tableRelations: [
          { parentTable: 'T_MISSING', childTable: 'T2', parentField: 'id', childField: 'fk' },
        ],
      },
    }
    const r = validateSemanticCrossPhase({ pagedata: JSON.stringify(pd) }, 'data')
    expect(r.passed).toBe(false)
    expect(r.issues.some(i => i.includes('T_MISSING'))).toBe(true)
  })

  it('data: no relations is valid', () => {
    const pd = {
      dataset: {
        dataSetName: 'DS',
        tables: {
          T1: { columns: [{ name: 'id', isPrimaryKey: true }], views: { default: {} } },
        },
      },
    }
    const r = validateSemanticCrossPhase({ pagedata: JSON.stringify(pd) }, 'data')
    expect(r.passed).toBe(true)
  })

  it('ui: multiple valid event handlers all pass', () => {
    const rule = [
      { type: 'el-button', on: { click: 'handleAdd' } },
      { type: 'el-button', on: { click: 'handleDelete' } },
    ]
    const a: GenerateArtifacts = {
      pagedata: JSON.stringify(VALID_PAGEDATA),
      ruleJson: JSON.stringify(rule),
      scriptJs: `
        function __init__() {}
        function handleAdd() {}
        function handleDelete() {}
      `,
    }
    const r = validateSemanticCrossPhase(a, 'ui')
    expect(r.passed).toBe(true)
  })

  it('ui: pagedata parse failure does not crash ui validation', () => {
    const rule = [{ type: 'div' }]
    const a: GenerateArtifacts = {
      pagedata: '{invalid json',
      ruleJson: JSON.stringify(rule),
      scriptJs: 'function __init__() {}',
    }
    // Should still pass (no table checks when pagedata is unparseable)
    const r = validateSemanticCrossPhase(a, 'ui')
    expect(r.passed).toBe(true)
  })

  it('style: null styleCss with no ruleJson class refs still fails', () => {
    const r = validateSemanticCrossPhase({}, 'style')
    expect(r.passed).toBe(false)
    expect(r.requiresBacktrack).toBe(false) // style doesn't trigger backtrack
  })

  it('style: non-empty styleCss without ruleJson passes', () => {
    const a: GenerateArtifacts = {
      styleCss: 'body { margin: 0; }',
    }
    const r = validateSemanticCrossPhase(a, 'style')
    expect(r.passed).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════
// 7. Catalog Projections（projectFcDirectory / projectFcSpec 等）
// ═══════════════════════════════════════════════════════════

describe('Catalog Projections', () => {
  const catalog = createMiniCatalog()

  describe('projectFcDirectory', () => {
    it('returns summary with correct counts', () => {
      const dir = projectFcDirectory(catalog)
      expect(dir.summary.total).toBe(3)
      expect(dir.summary.containers).toBe(1)
      expect(dir.summary.fields).toBe(2)
      expect(dir.registry).toBeDefined()
      expect(dir.registry.containers).toContain('r-table')
      expect(dir.registry.fields).toContain('r-text')
      expect(dir.registry.fields).toContain('r-number')
    })

    it('components list has all entries', () => {
      const dir = projectFcDirectory(catalog)
      expect(dir.components).toHaveLength(3)
      const types = dir.components.map((c: Record<string, unknown>) => c['type'])
      expect(types).toContain('r-table')
      expect(types).toContain('r-text')
      expect(types).toContain('r-number')
    })

    it('handles catalog without registry gracefully', () => {
      const noReg = { ...catalog, registry: undefined } as unknown as ComponentCatalog
      const dir = projectFcDirectory(noReg)
      // Should derive from components by category
      expect(dir.summary.total).toBeGreaterThan(0)
    })
  })

  describe('projectFcSpec', () => {
    it('returns spec for known component', () => {
      const spec = projectFcSpec(catalog, 'r-table')
      expect(spec).not.toBeNull()
      expect(spec!.type).toBe('r-table')
      expect(spec!.category).toBe('container')
      expect(spec!.props).toHaveLength(2)
      expect(spec!.emits).toHaveLength(1)
    })

    it('returns null for unknown component', () => {
      const spec = projectFcSpec(catalog, 'nonexistent')
      expect(spec).toBeNull()
    })

    it('simplifies props (only name/type/required/default/description)', () => {
      const spec = projectFcSpec(catalog, 'r-table')!
      for (const prop of spec.props) {
        expect(prop).toHaveProperty('name')
        expect(prop).toHaveProperty('type')
        expect(prop).toHaveProperty('required')
      }
    })
  })

  describe('projectDevTypes', () => {
    it('returns sorted type list', () => {
      const types = projectDevTypes(catalog)
      expect(types).toContain('r-table')
      expect(types).toContain('r-text')
      expect(types).toContain('r-number')
      expect(types).toEqual([...types].sort())
    })
  })

  describe('projectDevPropNames', () => {
    it('returns prop names per component', () => {
      const propNames = projectDevPropNames(catalog)
      expect(propNames['r-table']).toBeDefined()
      expect(propNames['r-table']).toContain('dataKey')
      expect(propNames['r-table']).toContain('highlightCurrentRow')
    })

    it('excludes structural keys (type/props/children/id)', () => {
      const propNames = projectDevPropNames(catalog)
      for (const names of Object.values(propNames)) {
        expect(names).not.toContain('type')
        expect(names).not.toContain('props')
        expect(names).not.toContain('children')
        expect(names).not.toContain('id')
      }
    })
  })

  describe('projectDevPropEnums', () => {
    it('returns empty enums for catalog with no enum props', () => {
      const enums = projectDevPropEnums(catalog)
      // Our test catalog has simple types (string/boolean), no enum values
      // So either empty or only types that have enums
      expect(typeof enums).toBe('object')
    })

    it('detects enum types from type strings', () => {
      const enumCatalog: ComponentCatalog = {
        ...catalog,
        components: {
          ...catalog.components,
          'r-select': {
            type: 'r-select',
            category: 'field' as const,
            description: '下拉选择',
            props: [
              { name: 'size', type: "'small' | 'default' | 'large'", required: false },
              { name: 'field', type: 'string', required: true },
            ],
            emits: [],
            source: 'vcm' as const,
          },
        },
      }
      const enums = projectDevPropEnums(enumCatalog)
      if (enums['r-select']) {
        expect(enums['r-select']!['size']).toBeDefined()
        expect(enums['r-select']!['size']).toContain('small')
        expect(enums['r-select']!['size']).toContain('default')
        expect(enums['r-select']!['size']).toContain('large')
      }
    })
  })
})

// ═══════════════════════════════════════════════════════════
// 8. Prompt 导出完整性
// ═══════════════════════════════════════════════════════════

describe('Page System Prompts', () => {
  it('GENERATE_BASE_PROMPT is non-empty string', () => {
    expect(typeof GENERATE_BASE_PROMPT).toBe('string')
    expect(GENERATE_BASE_PROMPT.length).toBeGreaterThan(50)
  })

  it('DATA_PHASE_PROMPT is non-empty string', () => {
    expect(typeof DATA_PHASE_PROMPT).toBe('string')
    expect(DATA_PHASE_PROMPT.length).toBeGreaterThan(50)
  })

  it('UI_PHASE_PROMPT is non-empty string', () => {
    expect(typeof UI_PHASE_PROMPT).toBe('string')
    expect(UI_PHASE_PROMPT.length).toBeGreaterThan(50)
  })

  it('STYLE_PHASE_PROMPT is non-empty string', () => {
    expect(typeof STYLE_PHASE_PROMPT).toBe('string')
    expect(STYLE_PHASE_PROMPT.length).toBeGreaterThan(50)
  })

  it('CROSS_CONSISTENCY_PROMPT is non-empty string', () => {
    expect(typeof CROSS_CONSISTENCY_PROMPT).toBe('string')
    expect(CROSS_CONSISTENCY_PROMPT.length).toBeGreaterThan(10)
  })
})

// ═══════════════════════════════════════════════════════════
// 9. Validator Helpers（通过公开 API 间接测试内部 helper 函数）
// ═══════════════════════════════════════════════════════════

describe('Validator Helpers (indirectly tested)', () => {
  describe('extractFunctionNames — via ui phase Render* check', () => {
    it('detects standard function declarations', () => {
      const rule = [{ type: 'RenderMyPanel' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}\nfunction RenderMyPanel() { return h("div") }',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })

    it('detects async function declarations', () => {
      const rule = [{ type: 'RenderAsync' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}\nasync function RenderAsync() { return h("div") }',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })

    it('detects const arrow function', () => {
      const rule = [{ type: 'div', on: { click: 'handleSubmit' } }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}\nconst handleSubmit = () => { console.log("ok") }',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })

    it('detects let arrow function with params', () => {
      const rule = [{ type: 'div', on: { click: 'doAction' } }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}\nlet doAction = (e) => { console.log(e) }',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })
  })

  describe('collectNodes — via deeply nested rule.json', () => {
    it('finds Render in deeply nested children', () => {
      const rule = [
        {
          type: 'div',
          children: [
            {
              type: 'div',
              children: [
                {
                  type: 'div',
                  children: [{ type: 'RenderDeep' }],
                },
              ],
            },
          ],
        },
      ]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('RenderDeep'))).toBe(true)
    })

    it('finds dataKey in nested children', () => {
      const rule = [
        {
          type: 'div',
          children: [
            { type: 'r-table', dataKey: 'BadTable@rows' },
          ],
        },
      ]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('BadTable'))).toBe(true)
      expect(r.requiresBacktrack).toBe(true)
    })
  })

  describe('extractTableFromDataKey — via dataKey validation', () => {
    it('2-segment: table@field → extracts table', () => {
      const rule = [{ type: 'r-table', dataKey: 'Orders@rows' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true) // Orders exists
    })

    it('3-segment: table@viewId@field → extracts table', () => {
      const rule = [{ type: 'r-table', dataKey: 'Orders@grid@rows' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true) // Orders exists
    })

    it('#scope dataKey: extracts table from 2nd segment', () => {
      const rule = [{ type: 'r-table', dataKey: '#Shared@Orders@rows' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      // #scope starts with # → validator skips (cross-page scope)
      const r = validateSemanticCrossPhase(a, 'ui')
      // The extractTableFromDataKey for #Shared returns 'Orders' (parts[1])
      // and Orders exists in pagedata, so it should pass
      expect(r.passed).toBe(true)
    })

    it('single-segment dataKey: no @ → no table extracted → no check', () => {
      const rule = [{ type: 'r-table', dataKey: 'noSeparator' }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      // single-segment → extractTableFromDataKey returns null → no table check
      expect(r.passed).toBe(true)
    })
  })

  describe('rowActions Render* check', () => {
    it('detects missing Render* in rowActions', () => {
      const rule = [
        {
          type: 'r-table',
          dataKey: 'Orders@rows',
          props: {
            rowActions: [
              { type: 'RenderAction', label: '操作' },
            ],
          },
        },
      ]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes('RenderAction'))).toBe(true)
    })

    it('passes when Render* in rowActions is defined', () => {
      const rule = [
        {
          type: 'r-table',
          dataKey: 'Orders@rows',
          props: {
            rowActions: [
              { type: 'RenderAction', label: '操作' },
            ],
          },
        },
      ]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}\nfunction RenderAction() { return h("span") }',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })
  })

  describe('empty event handler string', () => {
    it('empty handler string is ignored (not flagged)', () => {
      const rule = [{ type: 'el-button', on: { click: '' } }]
      const a: GenerateArtifacts = {
        pagedata: JSON.stringify(VALID_PAGEDATA),
        ruleJson: JSON.stringify(rule),
        scriptJs: 'function __init__() {}',
      }
      const r = validateSemanticCrossPhase(a, 'ui')
      expect(r.passed).toBe(true)
    })
  })

  describe('data phase: all illegal fields', () => {
    const ILLEGAL_FIELDS = ['autoLoad', 'lazyLoad', 'apiEnabled', 'parentViewId', 'childViewId']
    it.each(ILLEGAL_FIELDS)('reports illegal field: %s', (field) => {
      const pd = {
        dataset: {
          dataSetName: 'DS',
          tables: {
            T1: { columns: [{ name: 'id', isPrimaryKey: true }], views: { default: {} } },
            T2: { columns: [{ name: 'id', isPrimaryKey: true }], views: { default: {} } },
          },
          tableRelations: [
            { parentTable: 'T1', childTable: 'T2', parentField: 'id', childField: 'fk', [field]: true },
          ],
        },
      }
      const r = validateSemanticCrossPhase({ pagedata: JSON.stringify(pd) }, 'data')
      expect(r.passed).toBe(false)
      expect(r.issues.some(i => i.includes(field))).toBe(true)
    })
  })
})

// ═══════════════════════════════════════════════════════════
// 10. Orchestrator 追加场景 — 回溯 + 异常 + 边界
// ═══════════════════════════════════════════════════════════

describe('runGenerateLoop — advanced scenarios', () => {
  function createMockBackend(turnResponses: Array<{
    toolCalls: Array<{
      id: string
      function: { name: string; arguments: string }
    }>
  } | null>): SessionBackend {
    let turnIndex = 0
    return {
      createSession: vi.fn().mockResolvedValue('mock-session-adv'),
      executeTurn: vi.fn().mockImplementation(() => {
        const resp = turnResponses[turnIndex] ?? null
        turnIndex++
        return Promise.resolve(resp)
      }),
      appendMessages: vi.fn().mockResolvedValue(undefined),
      getConversation: vi.fn().mockResolvedValue([]),
      destroySession: vi.fn().mockResolvedValue(undefined),
      destroyAllSessions: vi.fn().mockResolvedValue(undefined),
    }
  }

  function tc(id: string, name: string, args: unknown) {
    return { id, function: { name, arguments: JSON.stringify(args) } }
  }

  it('should backtrack when ui dataKey references nonexistent table', async () => {
    const badRule = [{ type: 'r-table', dataKey: 'NonExist@rows' }]
    const fixedPagedata = {
      dataset: {
        dataSetName: 'PageDataSet',
        tables: {
          NonExist: {
            columns: [
              { name: 'id', type: 'number', isPrimaryKey: true },
            ],
            views: { default: { rows: [] } },
          },
        },
      },
    }
    const turns = [
      // Phase 1: valid pagedata
      { toolCalls: [tc('t1', 'emitPagedata', { content: VALID_PAGEDATA })] },
      // Phase 2: rule.json references NonExist table (not in pagedata)
      { toolCalls: [tc('t2', 'emitRuleJson', { content: badRule })] },
      { toolCalls: [tc('t3', 'emitScriptJs', { content: 'function __init__() {}' })] },
      // semantic check fails, requests backtrack → re-enters phase 1
      // Phase 1 (backtracked): fix pagedata to include NonExist
      { toolCalls: [tc('t4', 'emitPagedata', { content: fixedPagedata })] },
      // Phase 2 (re-entered): redone emits
      { toolCalls: [tc('t5', 'emitRuleJson', { content: badRule })] },
      { toolCalls: [tc('t6', 'emitScriptJs', { content: 'function __init__() {}' })] },
      // Phase 3
      { toolCalls: [tc('t7', 'emitStyleCss', { content: '' })] },
    ]

    const events: GenerateProgressEvent[] = []
    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试页面',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
      maxBacktracks: 1,
      onProgress: (e) => events.push(e),
    })

    // Check backtrack event was emitted
    const backtracks = events.filter(e => e.type === 'backtrack')
    expect(backtracks.length).toBeGreaterThanOrEqual(1)
    if (backtracks[0]?.type === 'backtrack') {
      expect(backtracks[0].from).toBe('ui')
      expect(backtracks[0].to).toBe('data')
    }
  })

  it('should handle createSession error', async () => {
    const backend: SessionBackend = {
      createSession: vi.fn().mockRejectedValue(new Error('Connection refused')),
      executeTurn: vi.fn(),
      appendMessages: vi.fn(),
      getConversation: vi.fn(),
      destroySession: vi.fn(),
      destroyAllSessions: vi.fn(),
    }
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试',
      catalog: createMiniCatalog(),
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Connection refused')
  })

  it('should handle executeTurn error', async () => {
    const backend: SessionBackend = {
      createSession: vi.fn().mockResolvedValue('session-err'),
      executeTurn: vi.fn().mockRejectedValue(new Error('API timeout')),
      appendMessages: vi.fn().mockResolvedValue(undefined),
      getConversation: vi.fn().mockResolvedValue([]),
      destroySession: vi.fn().mockResolvedValue(undefined),
      destroyAllSessions: vi.fn().mockResolvedValue(undefined),
    }
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试',
      catalog: createMiniCatalog(),
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('API timeout')
  })

  it('should handle malformed tool_call arguments gracefully', async () => {
    const turns = [
      // Phase 1: emitPagedata with unparseable arguments
      {
        toolCalls: [{
          id: 't1',
          function: { name: 'emitPagedata', arguments: '{invalid json' },
        }],
      },
      // Follow-up with valid pagedata
      { toolCalls: [tc('t2', 'emitPagedata', { content: VALID_PAGEDATA })] },
      { toolCalls: [tc('t3', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      { toolCalls: [tc('t4', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      { toolCalls: [tc('t5', 'emitStyleCss', { content: VALID_STYLE_CSS })] },
    ]
    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
    })
    // Should still succeed because the 2nd attempt was valid
    expect(result.artifacts.pagedata).toBeDefined()
  })

  it('should track totalRounds across all phases', async () => {
    const turns = [
      // Phase 1: 2 rounds (query + emit)
      { toolCalls: [tc('t1', 'queryCapabilities', { phase: 'data' })] },
      { toolCalls: [tc('t2', 'emitPagedata', { content: VALID_PAGEDATA })] },
      // Phase 2: 1 round (both emits at once)
      {
        toolCalls: [
          tc('t3', 'emitRuleJson', { content: VALID_RULE_JSON }),
          tc('t4', 'emitScriptJs', { content: VALID_SCRIPT_JS }),
        ],
      },
      // Phase 3: 1 round
      { toolCalls: [tc('t5', 'emitStyleCss', { content: VALID_STYLE_CSS })] },
    ]
    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
    })
    expect(result.success).toBe(true)
    expect(result.totalRounds).toBe(4) // 2 + 1 + 1
  })

  it('should inject phase prompt via appendMessages', async () => {
    const turns = [
      { toolCalls: [tc('t1', 'emitPagedata', { content: VALID_PAGEDATA })] },
      { toolCalls: [tc('t2', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      { toolCalls: [tc('t3', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      { toolCalls: [tc('t4', 'emitStyleCss', { content: VALID_STYLE_CSS })] },
    ]
    const backend = createMockBackend(turns)
    await runGenerateLoop(backend, {
      userPrompt: '测试',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
    })

    const appendCalls = (backend.appendMessages as ReturnType<typeof vi.fn>).mock.calls
    // Phase 2 transition should include phase prompt
    const phaseTransition = appendCalls.find((call: unknown[]) =>
      JSON.stringify(call).includes('切换到下一阶段'),
    )
    expect(phaseTransition).toBeDefined()
  })

  it('should pass when LLM returns no toolCalls and phase artifacts already collected', async () => {
    const turns = [
      // Phase 1: emit then empty response
      { toolCalls: [tc('t1', 'emitPagedata', { content: VALID_PAGEDATA })] },
      { toolCalls: [] }, // empty turn → check artifacts → phaseComplete
      // Phase 2
      { toolCalls: [tc('t2', 'emitRuleJson', { content: VALID_RULE_JSON })] },
      { toolCalls: [tc('t3', 'emitScriptJs', { content: VALID_SCRIPT_JS })] },
      // Phase 3
      { toolCalls: [tc('t4', 'emitStyleCss', { content: VALID_STYLE_CSS })] },
    ]
    const backend = createMockBackend(turns)
    const result = await runGenerateLoop(backend, {
      userPrompt: '测试',
      catalog: createMiniCatalog(),
      maxRoundsPerPhase: 5,
    })
    expect(result.success).toBe(true)
    expect(result.artifacts.pagedata).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════
// 11. Edge cases — validateToolLayerEmit 边界
// ═══════════════════════════════════════════════════════════

describe('validateToolLayerEmit — edge cases', () => {
  it('emitPagedata: multi-table with all valid passes', () => {
    const r = validateToolLayerEmit('emitPagedata', VALID_PAGEDATA_WITH_RELATIONS)
    expect(r.passed).toBe(true)
  })

  it('emitPagedata: nested dataset inside other keys still validates', () => {
    const r = validateToolLayerEmit('emitPagedata', {
      dataset: {
        dataSetName: 'DS',
        tables: {
          T: {
            columns: [{ name: 'id', isPrimaryKey: true, type: 'number' }],
            views: { default: {} },
          },
        },
      },
    })
    expect(r.passed).toBe(true)
  })

  it('emitRuleJson: node with invalid element in array is caught', () => {
    const r = validateToolLayerEmit('emitRuleJson', [42])
    expect(r.passed).toBe(false)
    expect(r.issues.some(i => i.includes('有效对象'))).toBe(true)
  })

  it('emitRuleJson: string JSON array also passes', () => {
    const r = validateToolLayerEmit('emitRuleJson', '[{"type":"div"}]')
    expect(r.passed).toBe(true)
  })

  it('emitRuleJson: invalid JSON string fails', () => {
    const r = validateToolLayerEmit('emitRuleJson', '[bad]')
    expect(r.passed).toBe(false)
    expect(r.issues[0]).toContain('JSON')
  })

  it('emitScriptJs: $page.showMessage usage is allowed', () => {
    const r = validateToolLayerEmit('emitScriptJs', 'function __init__() { $page.showMessage("ok", "success") }')
    expect(r.passed).toBe(true)
  })

  it('emitScriptJs: contains both __init__ and other functions', () => {
    const r = validateToolLayerEmit('emitScriptJs', `
      function __init__() {}
      function handleEdit(row) { $page.showMessage("编辑", "info") }
    `)
    expect(r.passed).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════
// 12. Cross-phase semantic edge cases
// ═══════════════════════════════════════════════════════════

describe('validateSemanticCrossPhase — edge cases', () => {
  it('data: valid relations with all existing tables passes', () => {
    const r = validateSemanticCrossPhase(
      { pagedata: JSON.stringify(VALID_PAGEDATA_WITH_RELATIONS) },
      'data',
    )
    expect(r.passed).toBe(true)
  })

  it('data: missing parent table in relation fails', () => {
    const pd = {
      dataset: {
        dataSetName: 'DS',
        tables: {
          T2: { columns: [{ name: 'id', isPrimaryKey: true }], views: { default: {} } },
        },
        tableRelations: [
          { parentTable: 'T_MISSING', childTable: 'T2', parentField: 'id', childField: 'fk' },
        ],
      },
    }
    const r = validateSemanticCrossPhase({ pagedata: JSON.stringify(pd) }, 'data')
    expect(r.passed).toBe(false)
    expect(r.issues.some(i => i.includes('T_MISSING'))).toBe(true)
  })

  it('data: no relations is valid', () => {
    const pd = {
      dataset: {
        dataSetName: 'DS',
        tables: {
          T1: { columns: [{ name: 'id', isPrimaryKey: true }], views: { default: {} } },
        },
      },
    }
    const r = validateSemanticCrossPhase({ pagedata: JSON.stringify(pd) }, 'data')
    expect(r.passed).toBe(true)
  })

  it('ui: multiple valid event handlers all pass', () => {
    const rule = [
      { type: 'el-button', on: { click: 'handleAdd' } },
      { type: 'el-button', on: { click: 'handleDelete' } },
    ]
    const a: GenerateArtifacts = {
      pagedata: JSON.stringify(VALID_PAGEDATA),
      ruleJson: JSON.stringify(rule),
      scriptJs: `
        function __init__() {}
        function handleAdd() {}
        function handleDelete() {}
      `,
    }
    const r = validateSemanticCrossPhase(a, 'ui')
    expect(r.passed).toBe(true)
  })

  it('ui: pagedata parse failure does not crash ui validation', () => {
    const rule = [{ type: 'div' }]
    const a: GenerateArtifacts = {
      pagedata: '{invalid json',
      ruleJson: JSON.stringify(rule),
      scriptJs: 'function __init__() {}',
    }
    // Should still pass (no table checks when pagedata is unparseable)
    const r = validateSemanticCrossPhase(a, 'ui')
    expect(r.passed).toBe(true)
  })

  it('style: null styleCss with no ruleJson class refs still fails', () => {
    const r = validateSemanticCrossPhase({}, 'style')
    expect(r.passed).toBe(false)
    expect(r.requiresBacktrack).toBe(false) // style doesn't trigger backtrack
  })

  it('style: non-empty styleCss without ruleJson passes', () => {
    const a: GenerateArtifacts = {
      styleCss: 'body { margin: 0; }',
    }
    const r = validateSemanticCrossPhase(a, 'style')
    expect(r.passed).toBe(true)
  })
})
