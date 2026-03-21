import {
  extractProposals,
  extractComponentQueries,
  resolveComponentQuery,
  AUTO_QUERY_PREFIX,
  AUTO_SKILL_PREFIX,
  extractClarifyBlocks,
  extractCompareBlocks,
  extractSkillQueryRequests,
} from './design-session'
import type {
  DesignProposal,
  ValidationFeedback,
  ClarifyBlock,
  CompareBlock,
  SkillQueryRequest,
} from './design-session'
import { resolveSkillQuery } from './skill-catalog'
import type { PersistedDesignSession } from './session-state'
import {
  getRegisteredTableNames,
  getRegisteredColumnNames,
} from './session-state'

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
  /** AI 追问块（@@clarify:name）*/
  clarifyBlocks: ClarifyBlock[]
  /** AI 方案对比块（@@compare:name）*/
  compareBlocks: CompareBlock[]
  /** 技能/模式查询请求（@@query:skill-list / @@query:pattern）*/
  skillQueryRequests: SkillQueryRequest[]
  validationErrors: ValidationFeedback[]
  autoMessages: AutoMessage[]
  metadata: Record<string, unknown>
  /** 设计会话状态（可选，注入后启用名册校验） */
  session?: PersistedDesignSession | null
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

  async execute(rawContent: string, messageId: string, session?: PersistedDesignSession | null): Promise<PipelineContext> {
    const ctx: PipelineContext = {
      rawContent,
      messageId,
      cleanContent: '',
      proposals: [],
      queries: [],
      clarifyBlocks: [],
      compareBlocks: [],
      skillQueryRequests: [],
      validationErrors: [],
      autoMessages: [],
      metadata: {},
      session: session ?? null,
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

    // 提取组件 Props 查询（@@query:component-props）
    const queryComponents = extractComponentQueries(ctx.rawContent)
    if (queryComponents.length > 0) {
      ctx.queries.push({
        type: 'component-props',
        target: queryComponents.join(', '),
      })
    }

    // 提取 AI 追问块（@@clarify:name）
    ctx.clarifyBlocks = extractClarifyBlocks(ctx.rawContent)

    // 提取 AI 方案对比块（@@compare:name）
    ctx.compareBlocks = extractCompareBlocks(ctx.rawContent)

    // 提取技能/模式查询（@@query:skill-list / @@query:pattern）
    ctx.skillQueryRequests = extractSkillQueryRequests(ctx.rawContent)

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
 * 处理器 4: 解析组件 Props 查询
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
 * 处理器 5: 解析技能/模式查询（@@query:skill-list 和 @@query:pattern）
 */
export class SkillQueryProcessor implements ResponseProcessor {
  name = 'SkillQueryResolver'

  process(ctx: PipelineContext): boolean {
    if (ctx.skillQueryRequests.length === 0) return true
    const resultParts: string[] = []
    for (const req of ctx.skillQueryRequests) {
      const result = resolveSkillQuery(req.queryType, req.targets)
      resultParts.push(result)
    }
    if (resultParts.length > 0) {
      ctx.metadata['skillQueryResults'] = resultParts.join('\n\n---\n\n')
    }
    return true
  }
}

/**
 * 处理器 6: 名册交叉校验（基于 PersistedDesignSession 的名册A/B）
 *
 * 仅在 ctx.session 存在时生效：
 * - data-model 提案：校验不引入重复表名
 * - view-plan 提案：校验引用的表名存在于名册A
 * - ui-structure 提案：校验 dataKey 中的表名/列名存在于名册A
 * - interaction 提案：校验脚本引用的函数名在 UIRegistry 中
 */
export class RegistryValidatorProcessor implements ResponseProcessor {
  name = 'RegistryValidator'

  process(ctx: PipelineContext): boolean {
    const session = ctx.session
    if (!session) return true // 无会话状态时跳过

    const tableNames = new Set(getRegisteredTableNames(session))

    for (const proposal of ctx.proposals) {
      switch (proposal.type) {
        case 'view-plan':
          this.validateViewPlan(proposal, tableNames, ctx)
          break
        case 'ui-structure':
          this.validateUiStructure(proposal, session, tableNames, ctx)
          break
        case 'data-model':
          this.validateDataModel(proposal, tableNames, ctx)
          break
        case 'interaction':
          this.validateInteraction(proposal, session, ctx)
          break
        case 'style':
          this.validateStyle(proposal, session, ctx)
          break
        case 'api-config':
        case 'db-schema':
        case 'dict-entry':
        case 'function-plan':
        case 'navigation':
          // 这些提案类型当前无需校验
          break
      }
    }
    return true
  }

  /** 表名列的候选表头名称集合 */
  private static readonly TABLE_HEADER_NAMES = new Set(['表名', 'tableName', 'tablename', 'table', 'Table'])

  /** view-plan：视图引用的表名必须存在于名册A */
  private validateViewPlan(
    proposal: DesignProposal,
    tableNames: Set<string>,
    ctx: PipelineContext,
  ): void {
    const lines = proposal.content.split('\n')
    let tableColIndex = -1
    let headerParsed = false

    for (const line of lines) {
      if (!line.startsWith('|')) continue
      // 跳过分隔行
      if (/^\|[\s:-]+\|/.test(line)) continue

      const cells = line.split('|').map((c) => c.trim()).filter(Boolean)
      if (cells.length < 2) continue

      // 动态定位表头中的"表名"列
      if (!headerParsed) {
        headerParsed = true
        tableColIndex = cells.findIndex((c) => RegistryValidatorProcessor.TABLE_HEADER_NAMES.has(c))
        if (tableColIndex < 0) tableColIndex = 1 // 默认回退到第 2 列
        continue
      }

      const tbl = cells[tableColIndex]
      if (tbl && !tableNames.has(tbl)) {
        ctx.validationErrors.push({
          severity: 'error',
          proposalName: proposal.title,
          checkType: 'table-reference',
          message: `视图引用的表「${tbl}」不在名册A 中`,
          suggestion: `名册A 已有表：${[...tableNames].join(', ')}。请先通过 @@proposal:data-model 添加该表。`,
        })
      }
    }
  }

  /** ui-structure：dataKey 中的表名必须存在于名册A */
  private validateUiStructure(
    proposal: DesignProposal,
    session: PersistedDesignSession,
    tableNames: Set<string>,
    ctx: PipelineContext,
  ): void {
    try {
      const parsed: unknown = JSON.parse(proposal.content)
      const nodes = Array.isArray(parsed) ? parsed : [parsed]
      this.walkNodesForRegistry(nodes, proposal, session, tableNames, ctx, null)
    } catch {
      // JSON 解析失败由 ProposalValidator 处理
    }
  }

  private walkNodesForRegistry(
    nodes: unknown[],
    proposal: DesignProposal,
    session: PersistedDesignSession,
    tableNames: Set<string>,
    ctx: PipelineContext,
    /** 父容器的 dataKey 解析出的表名，子组件继承用于列名校验 */
    inheritedTable: string | null,
  ): void {
    for (const node of nodes) {
      if (typeof node !== 'object' || node === null) continue
      const n = node as Record<string, unknown>

      // 当前节点的表名（从 dataKey 解析，或继承父级）
      let currentTable = inheritedTable

      // 检查 dataKey 中的表名
      const dk = this.extractDataKey(n)
      if (dk) {
        const atIdx = dk.indexOf('@')
        const raw = atIdx >= 0 ? dk.slice(0, atIdx) : dk
        // 去掉 #scope 前缀
        const tbl = raw.startsWith('#') ? null : raw
        if (tbl && tableNames.size > 0 && !tableNames.has(tbl)) {
          ctx.validationErrors.push({
            severity: 'error',
            proposalName: proposal.title,
            checkType: 'table-reference',
            message: `dataKey「${dk}」引用的表「${tbl}」不在名册A 中`,
            suggestion: `名册A 已有表：${[...tableNames].join(', ')}`,
          })
        }
        // 覆盖继承的表名
        if (tbl) currentTable = tbl
      }

      // 检查 name 字段是否在表的列定义中（使用当前表名或继承表名）
      const name = typeof n['name'] === 'string' ? n['name'] : null
      if (name && currentTable && tableNames.has(currentTable)) {
        const cols = getRegisteredColumnNames(session, currentTable)
        if (cols.length > 0 && !cols.includes(name)) {
          ctx.validationErrors.push({
            severity: 'warning',
            proposalName: proposal.title,
            checkType: 'table-reference',
            message: `字段「${name}」不在表「${currentTable}」的列定义中`,
            suggestion: `表「${currentTable}」已有列：${cols.join(', ')}`,
          })
        }
      }

      // 递归 children，传递当前表名作为继承上下文
      if (Array.isArray(n['children'])) {
        this.walkNodesForRegistry(
          n['children'] as unknown[], proposal, session, tableNames, ctx, currentTable,
        )
      }
    }
  }

  /** 从节点中提取 dataKey（兼容 meta.data.dataKey 和顶层 dataKey） */
  private extractDataKey(n: Record<string, unknown>): string | null {
    if (typeof n['dataKey'] === 'string') return n['dataKey']
    const meta = n['meta'] as Record<string, unknown> | undefined
    const data = meta?.['data'] as Record<string, unknown> | undefined
    if (typeof data?.['dataKey'] === 'string') return data['dataKey']
    return null
  }

  /** data-model：校验不引入重复表名 */
  private validateDataModel(
    proposal: DesignProposal,
    tableNames: Set<string>,
    ctx: PipelineContext,
  ): void {
    try {
      const parsed = JSON.parse(proposal.content) as Record<string, unknown>
      // 检查 tables 字段
      const tables = parsed['tables'] as Record<string, unknown> | undefined
      if (tables) {
        for (const tbl of Object.keys(tables)) {
          if (tableNames.has(tbl)) {
            ctx.validationErrors.push({
              severity: 'warning',
              proposalName: proposal.title,
              checkType: 'table-reference',
              message: `表「${tbl}」已在名册A 中存在，此提案将覆盖现有定义`,
              suggestion: '如需修改表结构，请确认级联影响。',
            })
          }
        }
      }
      // 检查 tableName 字段（单表格式）
      if (typeof parsed['tableName'] === 'string') {
        const tbl = parsed['tableName']
        if (tableNames.has(tbl)) {
          ctx.validationErrors.push({
            severity: 'warning',
            proposalName: proposal.title,
            checkType: 'table-reference',
            message: `表「${tbl}」已在名册A 中存在，此提案将覆盖现有定义`,
            suggestion: '如需修改表结构，请确认级联影响。',
          })
        }
      }
    } catch {
      // JSON 解析失败由 ProposalValidator 处理
    }
  }

  /** interaction：提取函数名并检查 DataSet 操作引用的表名 */
  private validateInteraction(
    proposal: DesignProposal,
    session: PersistedDesignSession,
    ctx: PipelineContext,
  ): void {
    const content = proposal.content
    const tableNames = new Set(getRegisteredTableNames(session))
    if (tableNames.size === 0) return

    // 提取 function 声明名（function foo() 或 function __init__()）
    const funcDeclRegex = /\bfunction\s+([a-zA-Z_$][\w$]*)\s*\(/g
    let funcMatch: RegExpExecArray | null
    const declaredFunctions: string[] = []
    while ((funcMatch = funcDeclRegex.exec(content)) !== null) {
      if (funcMatch[1]) declaredFunctions.push(funcMatch[1])
    }

    // 检查脚本中对 getView('TableName', ...) 引用的表名是否在名册A中
    const getViewRegex = /\bgetView\s*\(\s*['"]([^'"]+)['"]/g
    let viewMatch: RegExpExecArray | null
    while ((viewMatch = getViewRegex.exec(content)) !== null) {
      const tbl = viewMatch[1]
      if (tbl && !tableNames.has(tbl)) {
        ctx.validationErrors.push({
          severity: 'warning',
          proposalName: proposal.title,
          checkType: 'table-reference',
          message: `脚本中 getView('${tbl}', ...) 引用的表不在名册A 中`,
          suggestion: `名册A 已有表：${[...tableNames].join(', ')}`,
        })
      }
    }

    // 检查脚本中引用 Render* 组件名是否以大写开头且合法
    const renderRegex = /\bfunction\s+(Render[A-Z][\w]*)\s*\(/g
    let renderMatch: RegExpExecArray | null
    while ((renderMatch = renderRegex.exec(content)) !== null) {
      // Render* 函数会被注册为 Vue 组件，记录其存在即可
      const renderName = renderMatch[1]
      if (renderName && !declaredFunctions.includes(renderName)) {
        declaredFunctions.push(renderName)
      }
    }

    // 将发现的函数名暂存到 context 以供后续处理器使用
    if (declaredFunctions.length > 0) {
      const existing = (ctx as unknown as Record<string, unknown>)['_discoveredFunctions'] as string[] | undefined
      ;(ctx as unknown as Record<string, unknown>)['_discoveredFunctions'] = [
        ...(existing ?? []),
        ...declaredFunctions,
      ]
    }
  }

  /** style：检查 CSS 中引用的类名是否在 UIRegistry 中有对应的 rule.json 引用 */
  private validateStyle(
    proposal: DesignProposal,
    session: PersistedDesignSession,
    ctx: PipelineContext,
  ): void {
    const ui = session.uiRegistry
    if (ui.cssClassesReferenced.length === 0) return // 无 UI 引用记录时跳过

    // 从 CSS 中提取定义的类名
    const classRegex = /\.([a-zA-Z_][\w-]*)\s*[{,]/g
    let match: RegExpExecArray | null
    const definedClasses: string[] = []
    while ((match = classRegex.exec(proposal.content)) !== null) {
      const cls = match[1]
      if (cls && !cls.startsWith('el-') && !cls.startsWith('vxe-') && !cls.startsWith('is-')) {
        definedClasses.push(cls)
      }
    }

    // 检查 UIRegistry 中引用的类是否在本提案中定义
    const definedSet = new Set(definedClasses)
    for (const ref of ui.cssClassesReferenced) {
      const normalized = ref.startsWith('.') ? ref.slice(1) : ref
      if (!definedSet.has(normalized) && !normalized.startsWith('el-') && !normalized.startsWith('vxe-')) {
        ctx.validationErrors.push({
          severity: 'warning',
          proposalName: proposal.title,
          checkType: 'script-reference',
          message: `rule.json 引用的 CSS 类「${ref}」未在 style 提案中定义`,
          suggestion: `已定义的类：${definedClasses.length > 0 ? definedClasses.join(', ') : '（无）'}`,
        })
      }
    }
  }
}

/**
 * 处理器 7: 组装自动回复消息（Props 注入 / 技能查询结果 / 验证反馈）
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

    // 技能/模式查询自动回复
    const skillQueryResults = ctx.metadata['skillQueryResults'] as string | undefined
    if (skillQueryResults) {
      ctx.autoMessages.push({
        type: 'query-response',
        content: `${AUTO_SKILL_PREFIX}\n\n${skillQueryResults}\n\n请基于以上技能信息继续你的设计决策。`,
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

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * 创建预配置的标准 ResponsePipeline（全部 7 个处理器）
 *
 * 使用方式：
 * ```ts
 * const pipeline = createStandardPipeline()
 * const ctx = await pipeline.execute(rawContent, messageId, session)
 * // ctx.autoMessages — 需要发送的自动回复
 * // ctx.proposals    — 提取的结构化提案
 * ```
 */
export function createStandardPipeline(): ResponsePipeline {
  return new ResponsePipeline()
    .use(new BlockExtractorProcessor())
    .use(new ProposalValidatorProcessor())
    .use(new SchemaCheckerProcessor())
    .use(new QueryResolverProcessor())
    .use(new SkillQueryProcessor())
    .use(new RegistryValidatorProcessor())
    .use(new AutoResponderProcessor())
}
