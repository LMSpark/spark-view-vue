import { describe, it, expect } from 'vitest'
import {
  extractBlocks,
  extractProposals,
  extractComponentQueries,
  stripProposalTags,
  resolveComponentQuery,
  COMPONENT_PROPS_CATALOG,
  SKILL_CATALOG,
  SKILL_CATEGORY_INDEX,
  resolveSkillQuery,
} from '@spark-view/spark-ai'
import {
  ResponsePipeline,
  BlockExtractorProcessor,
  ProposalValidatorProcessor,
  SchemaCheckerProcessor,
  QueryResolverProcessor,
  AutoResponderProcessor,
} from '@spark-view/spark-ai'

// ── extractBlocks ────────────────────────────────────────────────────────────

describe('extractBlocks', () => {
  it('extracts single @@ block', () => {
    const text = `Some intro text.

@@proposal:data-model
# 订单主表
{"tableName": "Orders"}
@@end

Some trailing text.`

    const blocks = extractBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      type: 'proposal',
      name: 'data-model',
      payload: '# 订单主表\n{"tableName": "Orders"}',
    })
  })

  it('extracts multiple blocks', () => {
    const text = `
@@proposal:data-model
# 用户表
{"tableName": "Users"}
@@end

Some explanation in between.

@@proposal:ui-structure
# 用户列表
[{"type": "r-table"}]
@@end
`
    const blocks = extractBlocks(text)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.type).toBe('proposal')
    expect(blocks[0]?.name).toBe('data-model')
    expect(blocks[1]?.name).toBe('ui-structure')
  })

  it('extracts query blocks', () => {
    const text = `
@@query:component-props
r-table, r-form
@@end
`
    const blocks = extractBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      type: 'query',
      name: 'component-props',
      payload: 'r-table, r-form',
    })
  })

  it('returns empty for text without blocks', () => {
    expect(extractBlocks('just normal text')).toEqual([])
  })
})

// ── extractProposals ─────────────────────────────────────────────────────────

describe('extractProposals', () => {
  it('extracts proposals from @@ protocol', () => {
    const text = `这是我的建议：

@@proposal:data-model
# 订单表结构
{
  "tableName": "Orders",
  "columns": [{"name": "id"}]
}
@@end

以上是数据模型的设计。`

    const { proposals, cleanContent } = extractProposals(text, 'msg-1')
    expect(proposals).toHaveLength(1)
    expect(proposals[0]?.type).toBe('data-model')
    expect(proposals[0]?.title).toBe('订单表结构')
    expect(proposals[0]?.messageId).toBe('msg-1')
    expect(proposals[0]?.status).toBe('pending')
    expect(cleanContent).not.toContain('@@proposal')
    expect(cleanContent).toContain('这是我的建议')
  })

  it('returns empty for text without @@ blocks', () => {
    const text = `说明文字
<proposal type="ui-structure" title="用户列表">
[{"type": "r-table"}]
</proposal>`

    const { proposals } = extractProposals(text, 'msg-2')
    expect(proposals).toHaveLength(0)
  })

  it('defaults to ui-structure for unknown type', () => {
    const text = `
@@proposal:unknown-type
# Test
content
@@end`

    const { proposals } = extractProposals(text, 'msg-4')
    expect(proposals).toHaveLength(1)
    expect(proposals[0]?.type).toBe('ui-structure')
  })

  it('uses type label as title when # title line missing', () => {
    const text = `
@@proposal:interaction
function handleClick() {}
@@end`

    const { proposals } = extractProposals(text, 'msg-5')
    expect(proposals).toHaveLength(1)
    expect(proposals[0]?.title).toBe('交互逻辑')
  })
})

// ── extractComponentQueries ──────────────────────────────────────────────────

describe('extractComponentQueries', () => {
  it('extracts from @@ query block', () => {
    const text = `让我查一下组件信息。

@@query:component-props
r-table, r-form, r-select
@@end`

    const queries = extractComponentQueries(text)
    expect(queries).toEqual(['r-table', 'r-form', 'r-select'])
  })

  it('ignores XML query tags', () => {
    const text = `<query type="component-props">r-table, r-form</query>`
    const queries = extractComponentQueries(text)
    expect(queries).toEqual([])
  })

  it('returns empty for no queries', () => {
    expect(extractComponentQueries('just text')).toEqual([])
  })

  it('deduplicates components', () => {
    const text = `
@@query:component-props
r-table r-table r-form
@@end`
    const queries = extractComponentQueries(text)
    expect(queries).toEqual(['r-table', 'r-form'])
  })

  it('extracts from @@query:component-api block', () => {
    const text = `
@@query:component-api
r-table#meta.filter, builtin-action
@@end`
    const queries = extractComponentQueries(text)
    expect(queries).toEqual(['r-table#meta.filter', 'builtin-action'])
  })

  it('supports @list for component API index query', () => {
    const text = `
@@query:component-api
@list
@@end`
    const queries = extractComponentQueries(text)
    expect(queries).toEqual(['@list'])
  })
})

// ── stripProposalTags ────────────────────────────────────────────────────────

describe('stripProposalTags', () => {
  it('strips @@ blocks', () => {
    const text = `Hello

@@proposal:data-model
# Title
content
@@end

World`
    const result = stripProposalTags(text)
    expect(result).not.toContain('@@proposal')
    expect(result).toContain('Hello')
    expect(result).toContain('World')
  })

  it('preserves XML tags in output (no longer stripped)', () => {
    const text = `Hello <proposal type="data-model" title="x">content</proposal> World`
    const result = stripProposalTags(text)
    // XML is not stripped anymore, only @@ blocks are
    expect(result).toContain('<proposal')
    expect(result).toContain('Hello')
  })

  it('strips streaming partial @@ blocks', () => {
    const text = `Hello

@@proposal:data-model
# Title
partial content here`
    const result = stripProposalTags(text)
    expect(result).not.toContain('@@proposal')
    expect(result).toContain('Hello')
  })
})

// ── ResponsePipeline ─────────────────────────────────────────────────────────

describe('ResponsePipeline', () => {
  it('executes processors in order', async () => {
    const pipeline = new ResponsePipeline()
      .use(new BlockExtractorProcessor())
      .use(new ProposalValidatorProcessor())
      .use(new SchemaCheckerProcessor())
      .use(new QueryResolverProcessor())
      .use(new AutoResponderProcessor())

    const text = `设计建议：

@@proposal:data-model
# 用户表
{
  "tableName": "Users",
  "columns": [
    {"name": "id", "type": "string", "isPrimaryKey": true},
    {"name": "name", "type": "string"}
  ]
}
@@end

@@proposal:ui-structure
# 用户列表
[{"type": "r-table", "dataKey": "Users@rows"}]
@@end
`
    const ctx = await pipeline.execute(text, 'msg-test')

    expect(ctx.proposals).toHaveLength(2)
    expect(ctx.proposals[0]?.type).toBe('data-model')
    expect(ctx.proposals[1]?.type).toBe('ui-structure')
    expect(ctx.validationErrors).toHaveLength(0)
  })

  it('detects JSON syntax errors in proposals', async () => {
    const pipeline = new ResponsePipeline()
      .use(new BlockExtractorProcessor())
      .use(new ProposalValidatorProcessor())
      .use(new AutoResponderProcessor())

    const text = `
@@proposal:data-model
# 有语法错误的表
{ "tableName": "Orders", invalid }
@@end`

    const ctx = await pipeline.execute(text, 'msg-err')
    expect(ctx.validationErrors).toHaveLength(1)
    expect(ctx.validationErrors[0]?.checkType).toBe('json-syntax')
    expect(ctx.autoMessages.some((m) => m.type === 'validation-feedback')).toBe(true)
  })

  it('detects invalid DataKey format', async () => {
    const pipeline = new ResponsePipeline()
      .use(new BlockExtractorProcessor())
      .use(new ProposalValidatorProcessor())
      .use(new SchemaCheckerProcessor())
      .use(new AutoResponderProcessor())

    const text = `
@@proposal:ui-structure
# 错误 DataKey
[{"type": "r-table", "dataKey": "invalid.key.format"}]
@@end`

    const ctx = await pipeline.execute(text, 'msg-dk')
    const dkErrors = ctx.validationErrors.filter((e) => e.checkType === 'datakey-format')
    expect(dkErrors).toHaveLength(1)
  })

  it('detects unregistered component types', async () => {
    const pipeline = new ResponsePipeline()
      .use(new BlockExtractorProcessor())
      .use(new ProposalValidatorProcessor())
      .use(new SchemaCheckerProcessor())

    const text = `
@@proposal:ui-structure
# 未注册组件
[{"type": "unknown-widget", "dataKey": "Users@rows"}]
@@end`

    const ctx = await pipeline.execute(text, 'msg-comp')
    const typeErrors = ctx.validationErrors.filter((e) => e.checkType === 'component-type')
    expect(typeErrors).toHaveLength(1)
  })

  it('resolves component queries and generates auto message', async () => {
    const pipeline = new ResponsePipeline()
      .use(new BlockExtractorProcessor())
      .use(new QueryResolverProcessor())
      .use(new AutoResponderProcessor())

    const text = `我需要查看组件信息。

@@query:component-props
r-table
@@end`

    const ctx = await pipeline.execute(text, 'msg-query')
    expect(ctx.queries).toHaveLength(1)
    expect(ctx.queries[0]?.type).toBe('component-props')
    // r-table is in the catalog
    const propsMsg = ctx.autoMessages.find((m) => m.type === 'props-injection')
    expect(propsMsg).toBeDefined()
    expect(propsMsg?.content).toContain('r-table')
  })

  it('skips auto message for unknown component', async () => {
    const pipeline = new ResponsePipeline()
      .use(new BlockExtractorProcessor())
      .use(new QueryResolverProcessor())
      .use(new AutoResponderProcessor())

    const text = `
@@query:component-props
nonexistent-component
@@end`

    const ctx = await pipeline.execute(text, 'msg-unknown')
    // resolveComponentQuery returns info even for unknown (with "未收录" note)
    const propsMsg = ctx.autoMessages.find((m) => m.type === 'props-injection')
    expect(propsMsg).toBeDefined()
    expect(propsMsg?.content).toContain('未收录')
  })

  it('handles empty response gracefully', async () => {
    const pipeline = new ResponsePipeline()
      .use(new BlockExtractorProcessor())
      .use(new ProposalValidatorProcessor())
      .use(new AutoResponderProcessor())

    const ctx = await pipeline.execute('', 'msg-empty')
    expect(ctx.proposals).toEqual([])
    expect(ctx.queries).toEqual([])
    expect(ctx.autoMessages).toEqual([])
  })

  it('supports component query alias bundles for richer API exposure', () => {
    const resolved = resolveComponentQuery(['r-table-series'])
    expect(resolved).not.toBeNull()
    expect(resolved ?? '').toContain('context-aware-fields-api')
    expect(resolved ?? '').toContain('builtin-action')
    expect(resolved ?? '').toContain('r-table')
    expect(resolved ?? '').toContain('r-form')
  })

  it('supports specific component API fragment query', () => {
    const resolved = resolveComponentQuery(['r-table#meta.filter'])
    expect(resolved).not.toBeNull()
    expect(resolved ?? '').toContain('精确片段: meta.filter')
    expect(resolved ?? '').toContain('meta.filter.items')
  })

  it('supports component API catalog index query', () => {
    const resolved = resolveComponentQuery(['@list'])
    expect(resolved).not.toBeNull()
    expect(resolved ?? '').toContain('组件 API 目录索引')
    expect(resolved ?? '').toContain('r-table')
  })

  it('stops pipeline when processor returns false', async () => {
    const order: string[] = []
    const pipeline = new ResponsePipeline()
      .use({
        name: 'first',
        process(ctx) {
          order.push('first')
          ctx.metadata['visited'] = true
          return false // stop
        },
      })
      .use({
        name: 'second',
        process() {
          order.push('second')
          return true
        },
      })

    const ctx = await pipeline.execute('test', 'msg-stop')
    expect(order).toEqual(['first'])
    expect(ctx.metadata['visited']).toBe(true)
  })

  it('resolves r-form-series alias to form-related components', () => {
    const resolved = resolveComponentQuery(['r-form-series'])
    expect(resolved).not.toBeNull()
    expect(resolved ?? '').toContain('r-form')
    expect(resolved ?? '').toContain('r-detail')
    expect(resolved ?? '').toContain('r-checkbox')
    expect(resolved ?? '').toContain('r-cascader')
  })

  it('resolves r-column-group-series alias', () => {
    const resolved = resolveComponentQuery(['r-column-group-series'])
    expect(resolved).not.toBeNull()
    expect(resolved ?? '').toContain('r-column-group')
    expect(resolved ?? '').toContain('r-table')
  })

  it('resolves dialog-form-crud alias to dialog/drawer + form components', () => {
    const resolved = resolveComponentQuery(['dialog-form-crud'])
    expect(resolved).not.toBeNull()
    expect(resolved ?? '').toContain('r-dialog')
    expect(resolved ?? '').toContain('r-drawer')
    expect(resolved ?? '').toContain('r-form')
    expect(resolved ?? '').toContain('builtin-action')
  })

  it('resolves upload-series alias to upload-related components', () => {
    const resolved = resolveComponentQuery(['upload-series'])
    expect(resolved).not.toBeNull()
    expect(resolved ?? '').toContain('r-upload')
    expect(resolved ?? '').toContain('r-file-path')
    expect(resolved ?? '').toContain('r-file-browser')
    expect(resolved ?? '').toContain('r-image')
  })
})

// ── COMPONENT_PROPS_CATALOG ──────────────────────────────────────────────────

describe('COMPONENT_PROPS_CATALOG', () => {
  it('contains r-column-group entry', () => {
    expect(COMPONENT_PROPS_CATALOG['r-column-group']).toBeDefined()
    expect(COMPONENT_PROPS_CATALOG['r-column-group']).toContain('多级表头')
  })

  it('r-checkbox uses checkedText/uncheckedText and deprecates trueLabel/falseLabel', () => {
    const entry = COMPONENT_PROPS_CATALOG['r-checkbox']
    expect(entry).toBeDefined()
    expect(entry).toContain('checkedText')
    expect(entry).toContain('uncheckedText')
    // contains deprecation note mentioning the old names
    expect(entry).toContain('已废弃')
  })

  it('r-cascader includes optionChildrenField', () => {
    const entry = COMPONENT_PROPS_CATALOG['r-cascader']
    expect(entry).toBeDefined()
    expect(entry).toContain('optionChildrenField')
    expect(entry).toContain('emitPath')
  })

  it('r-tree-select includes optionLabelField and defaultExpandAll', () => {
    const entry = COMPONENT_PROPS_CATALOG['r-tree-select']
    expect(entry).toBeDefined()
    expect(entry).toContain('optionLabelField')
    expect(entry).toContain('defaultExpandAll')
  })

  it('r-transfer uses options not data', () => {
    const entry = COMPONENT_PROPS_CATALOG['r-transfer']
    expect(entry).toBeDefined()
    expect(entry).toContain('options')
    expect(entry).toContain('optionLabelField')
  })

  it('r-upload includes readonlyButtonText', () => {
    const entry = COMPONENT_PROPS_CATALOG['r-upload']
    expect(entry).toBeDefined()
    expect(entry).toContain('readonlyButtonText')
  })
})

// ── SKILL_CATALOG ────────────────────────────────────────────────────────────

describe('SKILL_CATALOG', () => {
  it('contains all 4 new patterns', () => {
    expect(SKILL_CATALOG['computed-aggregate']).toBeDefined()
    expect(SKILL_CATALOG['dialog-form-crud']).toBeDefined()
    expect(SKILL_CATALOG['tabs-multi-view']).toBeDefined()
    expect(SKILL_CATALOG['import-export']).toBeDefined()
  })

  it('computed-aggregate exists in data-pattern category', () => {
    expect(SKILL_CATALOG['computed-aggregate']).toBeDefined()
    expect(SKILL_CATEGORY_INDEX['data-pattern']).toContain('computed-aggregate')
  })

  it('dialog-form-crud exists in interaction-pattern category', () => {
    expect(SKILL_CATALOG['dialog-form-crud']).toBeDefined()
    expect(SKILL_CATEGORY_INDEX['interaction-pattern']).toContain('dialog-form-crud')
  })

  it('tabs-multi-view exists in layout-pattern category', () => {
    expect(SKILL_CATALOG['tabs-multi-view']).toBeDefined()
    expect(SKILL_CATEGORY_INDEX['layout-pattern']).toContain('tabs-multi-view')
  })

  it('import-export exists in interaction-pattern category', () => {
    expect(SKILL_CATALOG['import-export']).toBeDefined()
    expect(SKILL_CATEGORY_INDEX['interaction-pattern']).toContain('import-export')
  })

  it('SKILL_CATEGORY_INDEX includes new patterns', () => {
    expect(SKILL_CATEGORY_INDEX['data-pattern']).toContain('computed-aggregate')
    expect(SKILL_CATEGORY_INDEX['interaction-pattern']).toContain('dialog-form-crud')
    expect(SKILL_CATEGORY_INDEX['interaction-pattern']).toContain('import-export')
    expect(SKILL_CATEGORY_INDEX['layout-pattern']).toContain('tabs-multi-view')
  })

  it('resolveSkillQuery returns content for new patterns', () => {
    const result = resolveSkillQuery('pattern', ['computed-aggregate'])
    expect(result).toContain('computeExpression')
  })
})
