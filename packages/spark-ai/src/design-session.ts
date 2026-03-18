import { COMPONENT_PROPS_CATALOG } from './component-props-catalog'
import { extractBlocks as _extractBlocks, stripBlocksWithUnclosed } from './protocol'
import type { ProtocolBlock } from './protocol'

// ── Types ────────────────────────────────────────────────────────────────────

export type ProposalType =
  | 'data-model'
  | 'ui-structure'
  | 'interaction'
  | 'style'
  | 'api-config'
  | 'db-schema'
  | 'dict-entry'
  | 'function-plan'
  | 'navigation'

export type ProposalStatus = 'pending' | 'accepted' | 'rejected'

export type SessionPhase =
  | 'discussing'
  | 'validating'
  | 'correcting'
  | 'ready'
  | 'reviewing'
  | 'generating'
  | 'verifying'
  | 'iterating'
  | 'applied'
  | 'failed'

export interface DesignProposal {
  id: string
  type: ProposalType
  title: string
  /** 提案核心内容（JSON 或代码） */
  content: string
  status: ProposalStatus
  /** 所属聊天消息 ID */
  messageId: string
  /** 提案所属工作流阶段 */
  stage: string
  timestamp: Date
}

/**
 * @@ 协议提取的原始块
 * @deprecated 直接使用 protocol.ts 的 ProtocolBlock（完全兼容，额外含 raw 字段）
 */
export type { ProtocolBlock } from './protocol'

/** 验证反馈（结构化） */
export interface ValidationFeedback {
  severity: 'error' | 'warning' | 'info'
  proposalName: string
  checkType: 'json-syntax' | 'datakey-format' | 'table-reference'
            | 'component-type' | 'script-reference' | 'schema'
  message: string
  suggestion?: string
}

/** 审核清单条目 */
export interface ReviewChecklistItem {
  id: string
  category: 'db-change' | 'dict-change' | 'naming' | 'security' | 'consistency' | 'ux'
  severity: 'blocker' | 'warning' | 'info'
  description: string
  status: 'pending' | 'approved' | 'rejected' | 'auto-passed'
  feedback?: string
  relatedProposalId?: string
  autoFixSuggestion?: string
}

// ── 工具函数 ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<ProposalType, string> = {
  'data-model': '数据模型',
  'ui-structure': 'UI 结构',
  'interaction': '交互逻辑',
  'style': '样式',
  'api-config': 'API 配置',
  'db-schema': '数据库变更',
  'dict-entry': '字典变更',
  'function-plan': '功能规划',
  'navigation': '导航结构',
}

const TYPE_ICONS: Record<ProposalType, string> = {
  'data-model': 'DataBoard',
  'ui-structure': 'Brush',
  'interaction': 'Lightning',
  'style': 'MagicStick',
  'api-config': 'Connection',
  'db-schema': 'Coin',
  'dict-entry': 'Notebook',
  'function-plan': 'SetUp',
  'navigation': 'Globe',
}

export function typeLabel(type: ProposalType): string {
  return TYPE_LABELS[type]
}

export function typeIcon(type: ProposalType): string {
  return TYPE_ICONS[type]
}

// ── @@ 定界符协议解析（委托 protocol.ts） ────────────────────────────────────

/**
 * 从文本中提取所有 @@ 协议块
 * @deprecated 优先使用 protocol.ts 的 extractBlocks + filter
 */
export function extractBlocks(text: string): ProtocolBlock[] {
  return _extractBlocks(text)
}

// ── 提案提取 ─────────────────────────────────────────────────────────────────

const VALID_TYPES = new Set<ProposalType>([
  'data-model', 'ui-structure', 'interaction', 'style', 'api-config',
  'db-schema', 'dict-entry', 'function-plan', 'navigation',
])

/**
 * 从 @@ 协议块提取 proposal，payload 第一行 `# title` 作为标题
 */
function proposalsFromBlocks(blocks: ProtocolBlock[], messageId: string): DesignProposal[] {
  return blocks
    .filter((b) => b.type === 'proposal')
    .map((b) => {
      const rawType = b.name.toLowerCase()
      const type: ProposalType = VALID_TYPES.has(rawType as ProposalType)
        ? (rawType as ProposalType)
        : 'ui-structure'

      // 第一行 `# xxx` 作为标题，其余为内容
      const lines = b.payload.split('\n')
      let title = ''
      let content = b.payload
      if (lines[0]?.startsWith('# ')) {
        title = lines[0].slice(2).trim()
        content = lines.slice(1).join('\n').trim()
      }

      return {
        id: crypto.randomUUID(),
        type,
        title: title || typeLabel(type),
        content,
        status: 'pending' as ProposalStatus,
        messageId,
        stage: '',
        timestamp: new Date(),
      }
    })
}

/**
 * 从 AI 回复中提取结构化提案（@@ 协议）
 */
export function extractProposals(
  content: string,
  messageId: string,
): { cleanContent: string; proposals: DesignProposal[] } {
  const blocks = extractBlocks(content)
  const proposals = proposalsFromBlocks(blocks, messageId)
  const cleanContent = stripProtocolBlocks(content)
  return { cleanContent, proposals }
}

/**
 * 从显示内容中去除 @@ 定界块（用于流式渲染期间的实时清理）
 */
export function stripProposalTags(content: string): string {
  return stripProtocolBlocks(content)
}

/** 内部：清理 @@ 协议标记（含流式未闭合块） */
function stripProtocolBlocks(content: string): string {
  return stripBlocksWithUnclosed(content)
}

// ── 查询提取 ─────────────────────────────────────────────────────────────────

/** 自动查询消息的固定前缀（用于 UI 识别和防重入） */
export const AUTO_QUERY_PREFIX = '🔧 [组件 Props 查询结果]'

/**
 * 从 AI 回复中提取组件 Props 查询请求（@@ 协议）
 */
export function extractComponentQueries(content: string): string[] {
  const components: string[] = []

  const blocks = extractBlocks(content)
  for (const b of blocks) {
    if (b.type === 'query' && b.name === 'component-props') {
      const items = b.payload.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
      components.push(...items)
    }
  }

  return [...new Set(components)]
}

/**
 * 根据组件类型列表查找 Props 目录，构建查询响应文本
 */
export function resolveComponentQuery(components: string[]): string | null {
  if (components.length === 0) return null
  const sections: string[] = []
  for (const comp of components) {
    const info = COMPONENT_PROPS_CATALOG[comp]
    if (info) {
      sections.push(info)
    } else {
      sections.push(`**${comp}** — 未收录（可使用 Element Plus 文档中的标准 Props）`)
    }
  }
  return sections.join('\n\n')
}

// ── 生成提示词 ───────────────────────────────────────────────────────────────

/**
 * 从已采纳的提案构建最终生成提示词
 */
export function buildGenerationPrompt(
  proposals: DesignProposal[],
  userGoal: string,
): string {
  const accepted = proposals.filter((p) => p.status === 'accepted')
  if (accepted.length === 0) {
    return userGoal
  }

  const sections: string[] = [
    `用户需求：${userGoal}`,
    '',
    '以下是用户已确认的设计决策，请严格据此生成完整的 SPARK 页面配置（4 个文件）：',
    '',
  ]

  const grouped = new Map<ProposalType, DesignProposal[]>()
  for (const p of accepted) {
    const list = grouped.get(p.type) ?? []
    list.push(p)
    grouped.set(p.type, list)
  }

  for (const [type, items] of grouped) {
    sections.push(`## ${typeLabel(type)}`)
    for (const item of items) {
      sections.push(`### ${item.title}`)
      sections.push('```')
      sections.push(item.content)
      sections.push('```')
      sections.push('')
    }
  }

  sections.push(
    '请根据以上所有设计决策，生成完整的 rule.json、pagedata.json、script.js 和 style.css。',
    '确保数据模型与 UI 结构之间的 dataKey 绑定正确。',
  )

  return sections.join('\n')
}

// ── Re-export prompt & query resolution ──────────────────────────────────────
export { DESIGN_SYSTEM_PROMPT } from './design-prompt'
