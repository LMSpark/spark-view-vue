import {
  extractProposals,
  extractComponentQueries,
  resolveComponentQuery,
  AUTO_QUERY_PREFIX,
} from './useDesignSession'
import type { DesignProposal, ValidationFeedback } from './useDesignSession'

// ── Types ────────────────────────────────────────────────────────────────────

/** 组件查询（从 @@query 块解析出的查询请求） */
export interface ComponentQuery {
  type: string   // 'component-props' | 'component-example' | ...
  target: string // 组件名列表（逗号分隔）
}

/** 自动回复消息（由管线组装，待发送） */
export interface AutoMessage {
  type: 'props-injection' | 'validation-feedback' | 'query-response'
  content: string
  sourceId?: string
}

/** 管线上下文 — 在处理器之间共享 */
export interface PipelineContext {
  rawContent: string
  messageId: string
  cleanContent: string
  proposals: DesignProposal[]
  queries: ComponentQuery[]
  validationErrors: ValidationFeedback[]
  autoMessages: AutoMessage[]
  metadata: Record<string, unknown>
}

/** 处理器接口 */
export interface ResponseProcessor {
  name: string
  /** 返回 true 继续管线，false 中断 */
  process(ctx: PipelineContext): boolean | Promise<boolean>
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

export class ResponsePipeline {
  private processors: ResponseProcessor[] = []

  use(processor: ResponseProcessor): this {
    this.processors.push(processor)
    return this
  }

  async execute(rawContent: string, messageId: string): Promise<PipelineContext> {
    const ctx: PipelineContext = {
      rawContent,
      messageId,
      cleanContent: '',
      proposals: [],
      queries: [],
      validationErrors: [],
      autoMessages: [],
      metadata: {},
    }
    for (const proc of this.processors) {
      const shouldContinue = await proc.process(ctx)
      if (!shouldContinue) break
    }
    return ctx
  }
}

// ── Processors ───────────────────────────────────────────────────────────────

/**
 * 处理器 1: 提取 @@ 定界块 → proposals + queries
 */
export class BlockExtractorProcessor implements ResponseProcessor {
  name = 'BlockExtractor'

  process(ctx: PipelineContext): boolean {
    // 提取 proposals（@@ 协议优先，XML 兼容）
    const { cleanContent, proposals } = extractProposals(ctx.rawContent, ctx.messageId)
    ctx.cleanContent = cleanContent
    ctx.proposals = proposals

    // 提取 queries（@@ 协议优先，XML 兼容）
    const queryComponents = extractComponentQueries(ctx.rawContent)
    if (queryComponents.length > 0) {
      ctx.queries.push({
        type: 'component-props',
        target: queryComponents.join(', '),
      })
    }

    return true
  }
}

/**
 * 处理器 2: JSON 语法校验（对 data-model / ui-structure / api-config 类型的 proposal payload）
 */
export class ProposalValidatorProcessor implements ResponseProcessor {
  name = 'ProposalValidator'

  private static readonly JSON_TYPES = new Set([
    'data-model', 'ui-structure', 'api-config', 'dict-entry',
  ])

  process(ctx: PipelineContext): boolean {
    for (const proposal of ctx.proposals) {
      if (!ProposalValidatorProcessor.JSON_TYPES.has(proposal.type)) continue

      try {
        JSON.parse(proposal.content)
      } catch {
        ctx.validationErrors.push({
          severity: 'error',
          proposalName: proposal.title,
          checkType: 'json-syntax',
          message: `提案「${proposal.title}」的 JSON 内容解析失败`,
          suggestion: '请检查 JSON 语法，确保大括号/方括号正确闭合、属性名用双引号包裹。',
        })
      }
    }
    return true
  }
}

/** DataKey 格式校验正则 — 2段或3段 @-分隔 */
const DATAKEY_RE = /^(#[\w-]+@)?[\w-]+@([\w-]+@)?(rows|currentRow|selectedRows|summaryRow|selectionSummaryRow)(\.[\w.]+)?$/

/** 组件类型白名单前缀 */
const VALID_TYPE_PREFIXES = ['r-', 'el-', 'Render']
const HTML_TYPES = new Set([
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'br', 'pre', 'a', 'label', 'table', 'thead', 'tbody',
  'tr', 'th', 'td', 'ul', 'li', 'img',
])

/**
 * 处理器 3: DataKey 格式 / 组件类型 语义校验
 */
export class SchemaCheckerProcessor implements ResponseProcessor {
  name = 'SchemaChecker'

  process(ctx: PipelineContext): boolean {
    for (const proposal of ctx.proposals) {
      if (proposal.type === 'ui-structure') {
        this.checkUiStructure(proposal, ctx)
      }
    }
    return true
  }

  private checkUiStructure(proposal: DesignProposal, ctx: PipelineContext): void {
    try {
      const parsed: unknown = JSON.parse(proposal.content)
      const nodes = Array.isArray(parsed) ? parsed : [parsed]
      this.walkNodes(nodes, proposal, ctx)
    } catch {
      // JSON 解析失败由 ProposalValidator 处理
    }
  }

  private walkNodes(
    nodes: unknown[],
    proposal: DesignProposal,
    ctx: PipelineContext,
  ): void {
    for (const node of nodes) {
      if (typeof node !== 'object' || node === null) continue
      const n = node as Record<string, unknown>

      // 校验组件 type
      if (typeof n['type'] === 'string') {
        const t = n['type']
        const isValid = HTML_TYPES.has(t)
          || VALID_TYPE_PREFIXES.some((prefix) => t.startsWith(prefix))
        if (!isValid) {
          ctx.validationErrors.push({
            severity: 'warning',
            proposalName: proposal.title,
            checkType: 'component-type',
            message: `组件类型「${t}」不在注册表内`,
            suggestion: '请使用 r-* / el-* / HTML 原生标签 / Render* 函数。',
          })
        }
      }

      // 校验 dataKey 格式
      if (typeof n['dataKey'] === 'string') {
        const dk = n['dataKey']
        if (!DATAKEY_RE.test(dk)) {
          ctx.validationErrors.push({
            severity: 'error',
            proposalName: proposal.title,
            checkType: 'datakey-format',
            message: `DataKey「${dk}」格式不正确`,
            suggestion: '格式：tableName@field 或 tableName@viewId@field，field 可选 rows/currentRow/selectedRows/summaryRow/selectionSummaryRow。',
          })
        }
      }

      // 递归 children
      if (Array.isArray(n['children'])) {
        this.walkNodes(n['children'] as unknown[], proposal, ctx)
      }
    }
  }
}

/**
 * 处理器 4: 解析查询，查目录返回组件 Props 信息
 */
export class QueryResolverProcessor implements ResponseProcessor {
  name = 'QueryResolver'

  process(ctx: PipelineContext): boolean {
    for (const query of ctx.queries) {
      if (query.type === 'component-props') {
        const components = query.target.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
        const resolved = resolveComponentQuery(components)
        if (resolved) {
          ctx.metadata['resolvedProps'] = resolved
          ctx.metadata['queryComponents'] = components
        }
      }
    }
    return true
  }
}

/**
 * 处理器 5: 组装自动回复消息（Props 注入 / 验证反馈）
 */
export class AutoResponderProcessor implements ResponseProcessor {
  name = 'AutoResponder'

  process(ctx: PipelineContext): boolean {
    // Props 查询自动回复
    const resolvedProps = ctx.metadata['resolvedProps'] as string | undefined
    const queryComponents = ctx.metadata['queryComponents'] as string[] | undefined
    if (resolvedProps && queryComponents) {
      ctx.autoMessages.push({
        type: 'props-injection',
        content: `${AUTO_QUERY_PREFIX} ${queryComponents.join(', ')}\n\n${resolvedProps}\n\n请基于以上组件 Props 信息继续你的设计。`,
      })
    }

    // 验证反馈自动回复
    if (ctx.validationErrors.length > 0) {
      const lines: string[] = ['⚠️ [配置校验反馈]\n']
      for (const err of ctx.validationErrors) {
        const icon = err.severity === 'error' ? '❌' : '⚠️'
        lines.push(`${icon} **${err.proposalName}** — ${err.message}`)
        if (err.suggestion) {
          lines.push(`   💡 ${err.suggestion}`)
        }
      }
      lines.push('\n请根据以上反馈修正相关提案。')
      ctx.autoMessages.push({
        type: 'validation-feedback',
        content: lines.join('\n'),
      })
    }

    return true
  }
}
