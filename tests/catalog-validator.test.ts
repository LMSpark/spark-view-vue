import { describe, it, expect } from 'vitest'
import {
  validateWithCatalog,
  type GeneratedPageFiles,
  type ConfigValidationIssue,
} from '@spark-view/vite-plugin-spark-catalog'
import type {
  ComponentCatalog,
  ComponentEntry,
  PlatformConstraints,
} from '@spark-view/vite-plugin-spark-catalog'

/* --------------------------------------------------------------------------
 * Minimal fixture helpers
 * ----------------------------------------------------------------------- */

function makeCatalog(overrides?: Partial<ComponentCatalog>): ComponentCatalog {
  return {
    version: '2.0.0',
    buildTime: '2026-01-01T00:00:00.000Z',
    componentCount: 0,
    registry: { containers: [], fields: [], groups: [], meta: [] },
    components: {},
    constraints: makeConstraints(),
    sharedTypes: {},
    ...overrides,
  }
}

function makeConstraints(overrides?: Partial<PlatformConstraints>): PlatformConstraints {
  return {
    dataKeyPattern: String.raw`^(#[\w-]+@)?[\w-]+@([\w-]+@)?(rows|currentRow|selectedRows|summaryRow|selectionSummaryRow)(\.[\w.]+)?$`,
    htmlTypes: ['div', 'span', 'p', 'h1', 'h2', 'h3', 'table', 'input', 'button', 'form', 'label', 'img', 'a'],
    validTypePrefixes: ['r-', 'el-', 'Render', 'spark-'],
    validAggregateTypes: ['sum', 'count', 'avg', 'min', 'max', 'join'],
    nonFieldRTypes: ['r-table', 'r-form', 'r-detail', 'r-list', 'r-tree', 'r-tabs', 'r-collapse', 'r-dialog', 'r-drawer', 'r-steps', 'r-section', 'r-block', 'r-column-group'],
    containerContextMap: { 'r-table': 'table', 'r-form': 'form', 'r-detail': 'detail', 'r-list': 'list', 'r-tree': 'tree' },
    nestingRules: {
      'r-table': {
        allowedChildren: ['r-*', 'r-column-group'],
        forbiddenChildren: ['el-table-column'],
        note: 'r-table 子节点应使用 r-* 字段组件。',
      },
      'r-form': {
        allowedChildren: ['r-*'],
        note: 'r-form 子节点应使用 r-* 字段组件。',
      },
    },
    ...overrides,
  }
}

function makeComponentEntry(overrides?: Partial<ComponentEntry>): ComponentEntry {
  return {
    type: 'r-text',
    category: 'field',
    description: 'Text field',
    props: [
      { name: 'label', type: 'string', required: false },
      { name: 'placeholder', type: 'string', required: false },
    ],
    emits: [],
    source: 'ast',
    ...overrides,
  }
}

function issuesOf(issues: ConfigValidationIssue[], category: string): ConfigValidationIssue[] {
  return issues.filter(i => i.category === category)
}

function issuesContaining(issues: ConfigValidationIssue[], substring: string): ConfigValidationIssue[] {
  return issues.filter(i => i.message.includes(substring))
}

/* --------------------------------------------------------------------------
 * Tests
 * ----------------------------------------------------------------------- */

describe('validateWithCatalog', () => {
  // ── Happy path ──

  it('returns valid for well-formed minimal config', () => {
    const catalog = makeCatalog({
      components: {
        'r-text': makeComponentEntry(),
      },
    })
    const files: GeneratedPageFiles = {
      'rule.json': JSON.stringify([
        { type: 'r-table', dataKey: 'Users@rows', children: [
          { type: 'r-text', field: 'name', props: { label: '姓名' } },
        ] },
      ]),
      'pagedata.json': JSON.stringify({ tables: { Users: { rows: [] } } }),
      'script.js': '',
    }
    const report = validateWithCatalog(catalog, files)
    expect(report.valid).toBe(true)
    expect(report.summary.errors).toBe(0)
  })

  // ── JSON validity ──

  describe('JSON validity', () => {
    it('reports error for invalid rule.json', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': '{ bad json',
        'pagedata.json': JSON.stringify({ tables: {} }),
      })
      expect(report.valid).toBe(false)
      expect(report.summary.errors).toBeGreaterThanOrEqual(1)
      const compIssues = issuesOf(report.issues, 'component')
      expect(compIssues.some(i => i.message.includes('不是有效 JSON'))).toBe(true)
    })

    it('reports warning for invalid pagedata.json', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'div' }]),
        'pagedata.json': '{{invalid',
      })
      const dkIssues = issuesOf(report.issues, 'dataKey')
      expect(dkIssues.some(i => i.message.includes('不是有效 JSON'))).toBe(true)
    })
  })

  // ── Component type validation ──

  describe('component type validation', () => {
    it('passes for known catalog component', () => {
      const catalog = makeCatalog({
        components: { 'r-text': makeComponentEntry() },
      })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'r-text' }]),
      })
      const typeWarnings = issuesContaining(report.issues, '可能未注册')
      expect(typeWarnings).toHaveLength(0)
    })

    it('passes for HTML native types', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'div' }, { type: 'span' }]),
      })
      const typeWarnings = issuesContaining(report.issues, '可能未注册')
      expect(typeWarnings).toHaveLength(0)
    })

    it('passes for el-* prefixed types', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'el-button' }, { type: 'el-input' }]),
      })
      const typeWarnings = issuesContaining(report.issues, '可能未注册')
      expect(typeWarnings).toHaveLength(0)
    })

    it('passes for Render* function components', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'RenderUserCard' }]),
        'script.js': 'function RenderUserCard() { return h("div") }',
      })
      const typeWarnings = issuesContaining(report.issues, '可能未注册')
      expect(typeWarnings).toHaveLength(0)
    })

    it('passes for kebab-case custom components', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'my-custom-widget' }]),
      })
      const typeWarnings = issuesContaining(report.issues, '可能未注册')
      expect(typeWarnings).toHaveLength(0)
    })

    it('warns for suspicious type names (PascalCase, non-Render)', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'MyWidget' }]),
      })
      const typeWarnings = issuesContaining(report.issues, '可能未注册')
      expect(typeWarnings).toHaveLength(1)
      expect(typeWarnings[0]!.severity).toBe('warning')
    })
  })

  // ── Render function references ──

  describe('render function references', () => {
    it('errors when Render* function is missing from script.js', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'RenderChart' }]),
        'script.js': 'function handleClick() {}',
      })
      const renderIssues = issuesOf(report.issues, 'render')
      expect(renderIssues.some(i => i.message.includes('RenderChart'))).toBe(true)
      expect(renderIssues[0]!.severity).toBe('error')
    })

    it('no error when Render* function exists in script.js', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'RenderChart' }]),
        'script.js': 'function RenderChart() { return h("div") }',
      })
      const renderIssues = issuesOf(report.issues, 'render')
      expect(renderIssues.filter(i => i.message.includes('RenderChart'))).toHaveLength(0)
    })
  })

  // ── name vs field warning ──

  describe('name vs field warning', () => {
    it('warns when r-* component uses name instead of field', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'r-text', name: 'userName' }]),
      })
      const nameIssues = issuesContaining(report.issues, '请改用 field')
      expect(nameIssues).toHaveLength(1)
    })

    it('no warning when r-* component uses field', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'r-text', field: 'userName' }]),
      })
      const nameIssues = issuesContaining(report.issues, '请改用 field')
      expect(nameIssues).toHaveLength(0)
    })
  })

  // ── Props validation ──

  describe('props validation (catalog-driven)', () => {
    it('warns on unknown prop for a cataloged component', () => {
      const catalog = makeCatalog({
        components: {
          'r-text': makeComponentEntry({
            props: [
              { name: 'label', type: 'string', required: false },
              { name: 'placeholder', type: 'string', required: false },
            ],
          }),
        },
      })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([
          { type: 'r-text', props: { label: 'OK', unknownProp: 123 } },
        ]),
      })
      const propIssues = issuesContaining(report.issues, '不存在 prop')
      expect(propIssues).toHaveLength(1)
      expect(propIssues[0]!.message).toContain('unknownProp')
      expect(propIssues[0]!.severity).toBe('warning')
    })

    it('does not warn for known props', () => {
      const catalog = makeCatalog({
        components: {
          'r-text': makeComponentEntry({
            props: [{ name: 'label', type: 'string', required: false }],
          }),
        },
      })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([
          { type: 'r-text', props: { label: '姓名' } },
        ]),
      })
      const propIssues = issuesContaining(report.issues, '不存在 prop')
      expect(propIssues).toHaveLength(0)
    })

    it('allows framework pass-through props (sparkChildren, config, style, class, id)', () => {
      const catalog = makeCatalog({
        components: {
          'r-text': makeComponentEntry({ props: [] }),
        },
      })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([
          { type: 'r-text', props: { sparkChildren: [], config: {}, style: {}, class: 'foo', id: 'bar' } },
        ]),
      })
      const propIssues = issuesContaining(report.issues, '不存在 prop')
      expect(propIssues).toHaveLength(0)
    })

    it('skips props check for components not in catalog', () => {
      const catalog = makeCatalog({ components: {} })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([
          { type: 'el-input', props: { anyProp: 'anything' } },
        ]),
      })
      const propIssues = issuesContaining(report.issues, '不存在 prop')
      expect(propIssues).toHaveLength(0)
    })
  })

  // ── Required props validation ──

  describe('required props validation', () => {
    it('warns when a required prop is missing', () => {
      const catalog = makeCatalog({
        components: {
          'r-text': makeComponentEntry({
            props: [
              { name: 'label', type: 'string', required: true },
              { name: 'placeholder', type: 'string', required: false },
            ],
          }),
        },
      })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([
          { type: 'r-text', props: { placeholder: '请输入' } },
        ]),
      })
      const reqIssues = issuesContaining(report.issues, '缺少必填 prop')
      expect(reqIssues).toHaveLength(1)
      expect(reqIssues[0]!.message).toContain('label')
    })

    it('no warning when all required props are provided', () => {
      const catalog = makeCatalog({
        components: {
          'r-text': makeComponentEntry({
            props: [
              { name: 'label', type: 'string', required: true },
              { name: 'placeholder', type: 'string', required: false },
            ],
          }),
        },
      })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([
          { type: 'r-text', props: { label: '姓名' } },
        ]),
      })
      const reqIssues = issuesContaining(report.issues, '缺少必填 prop')
      expect(reqIssues).toHaveLength(0)
    })

    it('warns when component has required props but no props block at all', () => {
      const catalog = makeCatalog({
        components: {
          'r-text': makeComponentEntry({
            props: [
              { name: 'label', type: 'string', required: true },
            ],
          }),
        },
      })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([
          { type: 'r-text' },
        ]),
      })
      const reqIssues = issuesContaining(report.issues, '缺少必填 prop')
      expect(reqIssues).toHaveLength(1)
      expect(reqIssues[0]!.message).toContain('label')
    })

    it('does not warn for framework pass-through props (config, sparkChildren)', () => {
      const catalog = makeCatalog({
        components: {
          'r-table': makeComponentEntry({
            type: 'r-table',
            category: 'container',
            props: [
              { name: 'config', type: 'object', required: true },
              { name: 'sparkChildren', type: 'array', required: true },
            ],
          }),
        },
      })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'r-table', dataKey: 'Users@rows' }]),
        'pagedata.json': JSON.stringify({ tables: { Users: { rows: [] } } }),
      })
      const reqIssues = issuesContaining(report.issues, '缺少必填 prop')
      expect(reqIssues).toHaveLength(0)
    })

    it('skips required check for components not in catalog', () => {
      const catalog = makeCatalog({ components: {} })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'el-input' }]),
      })
      const reqIssues = issuesContaining(report.issues, '缺少必填 prop')
      expect(reqIssues).toHaveLength(0)
    })
  })

  // ── Emit event-name validation ──

  describe('emit event-name validation', () => {
    it('warns when on.xxx references an undeclared emit', () => {
      const catalog = makeCatalog({
        components: {
          'r-text': makeComponentEntry({
            emits: [
              { name: 'change', payload: [{ name: 'value', type: 'string' }] },
              { name: 'blur', payload: [] },
            ],
          }),
        },
      })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'r-text',
          on: { change: 'handleChange', focus: 'handleFocus' },
        }]),
        'script.js': 'function handleChange() {}\nfunction handleFocus() {}',
      })
      const emitIssues = issuesContaining(report.issues, '未声明事件')
      expect(emitIssues).toHaveLength(1)
      expect(emitIssues[0]!.message).toContain('focus')
      expect(emitIssues[0]!.severity).toBe('warning')
    })

    it('no warning when all on.xxx match declared emits', () => {
      const catalog = makeCatalog({
        components: {
          'r-text': makeComponentEntry({
            emits: [
              { name: 'change', payload: [] },
              { name: 'blur', payload: [] },
            ],
          }),
        },
      })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'r-text',
          on: { change: 'handleChange', blur: 'handleBlur' },
        }]),
        'script.js': 'function handleChange() {}\nfunction handleBlur() {}',
      })
      const emitIssues = issuesContaining(report.issues, '未声明事件')
      expect(emitIssues).toHaveLength(0)
    })

    it('skips emit check for components with empty emits list', () => {
      const catalog = makeCatalog({
        components: {
          'r-text': makeComponentEntry({ emits: [] }),
        },
      })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'r-text',
          on: { click: 'handleClick' },
        }]),
        'script.js': 'function handleClick() {}',
      })
      const emitIssues = issuesContaining(report.issues, '未声明事件')
      expect(emitIssues).toHaveLength(0)
    })

    it('skips emit check for components not in catalog', () => {
      const catalog = makeCatalog({ components: {} })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'el-button',
          on: { click: 'handleClick' },
        }]),
        'script.js': 'function handleClick() {}',
      })
      const emitIssues = issuesContaining(report.issues, '未声明事件')
      expect(emitIssues).toHaveLength(0)
    })
  })

  // ── DataKey validation ──

  describe('dataKey validation', () => {
    it('passes for valid 2-segment dataKey', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'r-table', dataKey: 'Users@rows' }]),
        'pagedata.json': JSON.stringify({ tables: { Users: { rows: [] } } }),
      })
      const dkErrors = issuesOf(report.issues, 'dataKey').filter(i => i.severity === 'error')
      expect(dkErrors).toHaveLength(0)
    })

    it('passes for valid 3-segment dataKey', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'r-table', dataKey: 'Users@grid@rows' }]),
        'pagedata.json': JSON.stringify({ tables: { Users: { rows: [] } } }),
      })
      const dkErrors = issuesOf(report.issues, 'dataKey').filter(i => i.severity === 'error')
      expect(dkErrors).toHaveLength(0)
    })

    it('passes for cross-page #scope dataKey', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'el-table', dataKey: '#SharedDS@Orders@rows' }]),
        'pagedata.json': JSON.stringify({ tables: {} }),
      })
      // Cross-page dataKey should not raise "table not found" error
      const dkErrors = issuesOf(report.issues, 'dataKey').filter(i =>
        i.severity === 'error' && i.message.includes('不存在'))
      expect(dkErrors).toHaveLength(0)
    })

    it('errors for malformed dataKey', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'r-table', dataKey: 'totally-invalid' }]),
      })
      const dkErrors = issuesOf(report.issues, 'dataKey').filter(i => i.severity === 'error')
      expect(dkErrors.some(i => i.message.includes('格式不正确'))).toBe(true)
    })

    it('errors when dataKey table is missing from pagedata.json', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'r-table', dataKey: 'Orders@rows' }]),
        'pagedata.json': JSON.stringify({ tables: { Users: { rows: [] } } }),
      })
      const dkErrors = issuesOf(report.issues, 'dataKey').filter(i =>
        i.severity === 'error' && i.message.includes('不存在'))
      expect(dkErrors).toHaveLength(1)
      expect(dkErrors[0]!.message).toContain('Orders')
    })

    it('passes dataKey with field path (dot notation)', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'div', dataKey: 'stats@currentRow.totalUsers' }]),
        'pagedata.json': JSON.stringify({ tables: { stats: { rows: [] } } }),
      })
      const dkErrors = issuesOf(report.issues, 'dataKey').filter(i =>
        i.severity === 'error' && i.message.includes('格式不正确'))
      expect(dkErrors).toHaveLength(0)
    })
  })

  // ── Event handler validation ──

  describe('event handler validation', () => {
    it('errors when event handler function is missing', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'el-button',
          on: { click: 'handleSubmit' },
        }]),
        'script.js': 'function handleCancel() {}',
      })
      const handlerIssues = issuesOf(report.issues, 'handler')
      expect(handlerIssues.some(i => i.message.includes('handleSubmit'))).toBe(true)
      expect(handlerIssues[0]!.severity).toBe('error')
    })

    it('passes when handler function exists in script.js', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'el-button',
          on: { click: 'handleSubmit' },
        }]),
        'script.js': 'function handleSubmit() { console.log("ok") }',
      })
      const handlerIssues = issuesOf(report.issues, 'handler')
      expect(handlerIssues.filter(i => i.message.includes('handleSubmit'))).toHaveLength(0)
    })

    it('detects arrow function declarations', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'el-button',
          on: { click: 'handleSubmit' },
        }]),
        'script.js': 'const handleSubmit = () => { console.log("ok") }',
      })
      const handlerIssues = issuesOf(report.issues, 'handler').filter(i => i.message.includes('handleSubmit'))
      expect(handlerIssues).toHaveLength(0)
    })
  })

  // ── Style/class placement ──

  describe('style/class placement', () => {
    it('warns when style is at top level instead of in props', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'div',
          style: { color: 'red' },
        }]),
      })
      const styleIssues = issuesContaining(report.issues, 'style 写在顶层')
      expect(styleIssues).toHaveLength(1)
    })

    it('warns when class is at top level instead of in props', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'div',
          class: 'my-class',
        }]),
      })
      const classIssues = issuesContaining(report.issues, 'class 写在顶层')
      expect(classIssues).toHaveLength(1)
    })

    it('no warning when style/class are inside props', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'div',
          style: { color: 'red' },
          props: { style: { color: 'red' } },
        }]),
      })
      const styleIssues = issuesContaining(report.issues, 'style 写在顶层')
      expect(styleIssues).toHaveLength(0)
    })
  })

  // ── Context-aware structure ──

  describe('context-aware structure', () => {
    it('warns when el-table-column is used inside r-table', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'r-table',
          dataKey: 'Users@rows',
          children: [{ type: 'el-table-column' }],
        }]),
        'pagedata.json': JSON.stringify({ tables: { Users: { rows: [] } } }),
      })
      const issues = issuesContaining(report.issues, '不建议使用 el-table-column')
      expect(issues).toHaveLength(1)
    })

    it('warns when field component is outside any container', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([
          { type: 'r-text', field: 'name' },
        ]),
      })
      const issues = issuesContaining(report.issues, '缺少父容器语境')
      expect(issues).toHaveLength(1)
    })

    it('no warning for field inside container', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'r-table',
          dataKey: 'Users@rows',
          children: [{ type: 'r-text', field: 'name' }],
        }]),
        'pagedata.json': JSON.stringify({ tables: { Users: { rows: [] } } }),
      })
      const issues = issuesContaining(report.issues, '缺少父容器语境')
      expect(issues).toHaveLength(0)
    })

    it('no warning for non-field r-* types (containers) without parent', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'r-table', dataKey: 'Users@rows' }]),
        'pagedata.json': JSON.stringify({ tables: { Users: { rows: [] } } }),
      })
      const issues = issuesContaining(report.issues, '缺少父容器语境')
      expect(issues).toHaveLength(0)
    })
  })

  // ── Nesting rules ──

  describe('nesting rules', () => {
    it('errors when forbidden child is used (el-table-column in r-table)', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'r-table',
          dataKey: 'Users@rows',
          children: [{ type: 'el-table-column' }],
        }]),
        'pagedata.json': JSON.stringify({ tables: { Users: { rows: [] } } }),
      })
      const nestIssues = issuesContaining(report.issues, '禁止嵌套')
      expect(nestIssues).toHaveLength(1)
      expect(nestIssues[0]!.severity).toBe('error')
    })

    it('passes when allowed wildcard children are used', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'r-table',
          dataKey: 'Users@rows',
          children: [
            { type: 'r-text', field: 'name' },
            { type: 'r-number', field: 'age' },
          ],
        }]),
        'pagedata.json': JSON.stringify({ tables: { Users: { rows: [] } } }),
      })
      const nestIssues = issuesContaining(report.issues, '禁止嵌套')
      expect(nestIssues).toHaveLength(0)
      const uncommonIssues = issuesContaining(report.issues, '不常见的子组件')
      expect(uncommonIssues).toHaveLength(0)
    })

    it('warns for uncommon child type not matching nesting rules', () => {
      const catalog = makeCatalog({
        constraints: makeConstraints({
          nestingRules: {
            'r-form': {
              allowedChildren: ['r-*'],
              note: 'r-form 子节点应使用 r-* 字段组件。',
            },
          },
        }),
      })
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'r-form',
          dataKey: 'Users@currentRow',
          children: [{ type: 'div', children: [] }],
        }]),
        'pagedata.json': JSON.stringify({ tables: { Users: { rows: [] } } }),
      })
      const nestIssues = issuesContaining(report.issues, '不常见的子组件')
      expect(nestIssues).toHaveLength(1)
      expect(nestIssues[0]!.message).toContain('div')
    })
  })

  // ── Cross-check: highlightCurrentRow ──

  describe('highlightCurrentRow cross-check', () => {
    it('warns when table is referenced by @currentRow but lacks highlightCurrentRow', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([
          { type: 'r-table', dataKey: 'Users@rows', props: {} },
          { type: 'div', dataKey: 'Users@currentRow.name' },
        ]),
        'pagedata.json': JSON.stringify({ tables: { Users: { rows: [] } } }),
      })
      const hlIssues = issuesContaining(report.issues, 'highlightCurrentRow')
      expect(hlIssues).toHaveLength(1)
      expect(hlIssues[0]!.severity).toBe('warning')
    })

    it('no warning when highlightCurrentRow is declared', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([
          { type: 'r-table', dataKey: 'Users@rows', props: { highlightCurrentRow: true } },
          { type: 'div', dataKey: 'Users@currentRow.name' },
        ]),
        'pagedata.json': JSON.stringify({ tables: { Users: { rows: [] } } }),
      })
      const hlIssues = issuesContaining(report.issues, 'highlightCurrentRow')
      expect(hlIssues).toHaveLength(0)
    })
  })

  // ── Aggregates validation ──

  describe('aggregates validation', () => {
    it('passes for valid aggregate types', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'div' }]),
        'pagedata.json': JSON.stringify({
          tables: {
            Orders: {
              rows: [],
              aggregates: {
                price: { type: 'sum' },
                score: { type: 'avg' },
                name: { type: 'join' },
              },
            },
          },
        }),
      })
      const aggIssues = issuesContaining(report.issues, '不合法')
      expect(aggIssues).toHaveLength(0)
    })

    it('warns for invalid aggregate type', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'div' }]),
        'pagedata.json': JSON.stringify({
          tables: {
            Orders: {
              rows: [],
              aggregates: {
                price: { type: 'multiply' },
              },
            },
          },
        }),
      })
      const aggIssues = issuesContaining(report.issues, '不合法')
      expect(aggIssues).toHaveLength(1)
      expect(aggIssues[0]!.message).toContain('multiply')
    })

    it('warns for non-object aggregate definition', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'div' }]),
        'pagedata.json': JSON.stringify({
          tables: {
            Orders: {
              rows: [],
              aggregates: {
                price: 'sum',
              },
            },
          },
        }),
      })
      const aggIssues = issuesContaining(report.issues, '应为对象')
      expect(aggIssues).toHaveLength(1)
    })

    it('validates view-level aggregates', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'div' }]),
        'pagedata.json': JSON.stringify({
          tables: {
            Orders: {
              rows: [],
              views: {
                default: {
                  aggregates: {
                    total: { type: 'badtype' },
                  },
                },
              },
            },
          },
        }),
      })
      const aggIssues = issuesContaining(report.issues, '不合法')
      expect(aggIssues).toHaveLength(1)
    })
  })

  // ── Summary structure ──

  describe('report summary structure', () => {
    it('correctly categorizes issues in summary', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([
          { type: 'RenderMissing' },
          { type: 'el-button', on: { click: 'missingHandler' }, dataKey: 'bad-key' },
        ]),
        'script.js': '',
      })
      expect(report.summary.byCategory).toHaveProperty('dataKey')
      expect(report.summary.byCategory).toHaveProperty('handler')
      expect(report.summary.byCategory).toHaveProperty('render')
      expect(report.summary.byCategory).toHaveProperty('component')
      expect(report.summary.total).toBe(report.summary.errors + report.summary.warnings)
    })

    it('valid is false when any error exists', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'RenderGhost' }]),
        'script.js': '',
      })
      expect(report.valid).toBe(false)
      expect(report.summary.errors).toBeGreaterThanOrEqual(1)
    })

    it('valid is true when only warnings exist', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'div',
          style: { color: 'red' },
        }]),
      })
      // Only a style placement warning, no errors
      expect(report.summary.errors).toBe(0)
      if (report.summary.warnings > 0) {
        expect(report.valid).toBe(true)
      }
    })
  })

  // ── Edge cases ──

  describe('edge cases', () => {
    it('handles empty files gracefully', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {})
      expect(report.valid).toBe(true)
      expect(report.issues).toHaveLength(0)
    })

    it('handles pagedata.json with array-style tables', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{ type: 'r-table', dataKey: 'Orders@rows' }]),
        'pagedata.json': JSON.stringify({
          tables: [
            { tableName: 'Orders', rows: [] },
          ],
        }),
      })
      // Table name is found via array-style parsing, no "table not found" 
      const tableErrors = issuesContaining(report.issues, '不存在')
        .filter(i => i.category === 'dataKey')
      expect(tableErrors).toHaveLength(0)
    })

    it('handles deeply nested children', () => {
      const catalog = makeCatalog()
      const report = validateWithCatalog(catalog, {
        'rule.json': JSON.stringify([{
          type: 'div',
          children: [{
            type: 'div',
            children: [{
              type: 'r-table',
              dataKey: 'Users@rows',
              children: [
                { type: 'r-text', field: 'name' },
              ],
            }],
          }],
        }]),
        'pagedata.json': JSON.stringify({ tables: { Users: { rows: [] } } }),
      })
      expect(report.valid).toBe(true)
    })
  })
})
