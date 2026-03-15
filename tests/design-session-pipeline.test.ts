import { describe, it, expect } from 'vitest'
import {
  extractBlocks,
  extractProposals,
  extractComponentQueries,
  stripProposalTags,
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
    expect(blocks[0]).toEqual({
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
    expect(blocks[0]).toEqual({
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
})
