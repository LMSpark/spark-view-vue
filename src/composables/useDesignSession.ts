import { ref, computed } from 'vue'

// ── Types ────────────────────────────────────────────────────────────────────

export type ProposalType = 'data-model' | 'ui-structure' | 'interaction' | 'style'

export type ProposalStatus = 'pending' | 'accepted' | 'rejected'

export type SessionPhase = 'discussing' | 'generating' | 'applied'

export interface DesignProposal {
  id: string
  type: ProposalType
  title: string
  /** 提案核心内容（JSON 或代码） */
  content: string
  status: ProposalStatus
  /** 所属聊天消息 ID */
  messageId: string
  timestamp: Date
}

// ── 工具函数 ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<ProposalType, string> = {
  'data-model': '📊 数据模型',
  'ui-structure': '🎨 UI 结构',
  'interaction': '⚡ 交互逻辑',
  'style': '🎭 样式',
}

const TYPE_ICONS: Record<ProposalType, string> = {
  'data-model': '📊',
  'ui-structure': '🎨',
  'interaction': '⚡',
  'style': '🎭',
}

export function typeLabel(type: ProposalType): string {
  return TYPE_LABELS[type]
}

export function typeIcon(type: ProposalType): string {
  return TYPE_ICONS[type]
}

// ── 提案提取 ─────────────────────────────────────────────────────────────────

const PROPOSAL_RE = /<proposal\s+type="([^"]+)"\s+title="([^"]*)">([\s\S]*?)<\/proposal>/gi
const VALID_TYPES = new Set<ProposalType>(['data-model', 'ui-structure', 'interaction', 'style'])

/**
 * 从 AI 回复中提取结构化提案
 *
 * AI 被指示用 `<proposal type="..." title="...">...</proposal>` 包裹设计决策。
 * 返回清理后的显示内容（去除 XML 标记）和解析出的提案列表。
 */
export function extractProposals(
  content: string,
  messageId: string,
): { cleanContent: string; proposals: DesignProposal[] } {
  const proposals: DesignProposal[] = []

  PROPOSAL_RE.lastIndex = 0
  let match: RegExpExecArray | null = PROPOSAL_RE.exec(content)

  while (match !== null) {
    const rawType = (match[1] ?? '').toLowerCase()
    const type: ProposalType = VALID_TYPES.has(rawType as ProposalType)
      ? (rawType as ProposalType)
      : 'ui-structure'

    proposals.push({
      id: crypto.randomUUID(),
      type,
      title: (match[2] ?? '') || typeLabel(type),
      content: (match[3] ?? '').trim(),
      status: 'pending',
      messageId,
      timestamp: new Date(),
    })

    match = PROPOSAL_RE.exec(content)
  }

  const cleanContent = content
    .replace(PROPOSAL_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { cleanContent, proposals }
}

/**
 * 从显示内容中去除 proposal XML 标记（用于流式渲染期间的实时清理）
 */
export function stripProposalTags(content: string): string {
  return content
    .replace(/<proposal[\s\S]*?<\/proposal>/gi, '')
    .replace(/<proposal[^>]*>[\s\S]*/i, '') // 处理尚未闭合的标签（流式中途）
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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

// ── 设计模式系统提示词 ───────────────────────────────────────────────────────

export const DESIGN_SYSTEM_PROMPT = `你是 SPARK 低代码平台的页面设计顾问。与用户讨论页面需求，逐步形成设计方案。

## 输出规则

1. **自然讨论**：正常用中文回复，解释设计思路和建议理由。
2. **结构化提案**：每当你形成一个可落地的设计决策，用 XML 标记包裹：

<proposal type="提案类型" title="提案标题">
提案内容（JSON 或代码）
</proposal>

提案标记之外正常写 markdown 文字解释。一次回复可包含多个提案。

## 提案类型

| type | 说明 | 内容格式 |
|------|------|---------|
| data-model | 数据表结构 | pagedata.json 中 tables 片段（JSON） |
| ui-structure | UI 组件树 | rule.json 片段（JSON 数组） |
| interaction | 交互逻辑 | script.js 代码 |
| style | 视觉样式 | CSS 代码 |

## 讨论策略

- 第一步：理解业务目标，追问关键细节
- 第二步：提出数据模型方案（表结构、字段、关系）
- 第三步：提出 UI 结构方案（组件树、布局）
- 第四步：提出交互逻辑和样式
- 每个提案聚焦一个决策点（一个数据表、一个 UI 区块、一个交互行为）
- 提案之间保持独立，可单独采纳或拒绝
- 主动询问用户对提案的看法，等用户确认后再推进下一步
- 如果用户拒绝提案，询问修改方向并给出替代方案

## SPARK 平台约束（提案内容须遵守）

- 数据绑定使用 DataKey 格式：\`tableName@field\`（2 段）或 \`tableName@viewId@field\`（3 段）
- 组件 type 使用 kebab-case（如 el-table、el-form、r-form、r-tree）
- field 可选值：rows、currentRow、selectedRows、summaryRow
- 页面数据通过 DataSet 流转，rule.json 中通过 dataKey 引用
- script.js 使用沙箱变量：$api、$dataSet、$page、$route、$refreshData、SparkData、h
- 内联数据在 pagedata.json 的 tables.{tableName}.rows 中直接定义
- 计算列用 computeExpression 表达式，聚合用 views.default.aggregates 配置`

// ── Composable ───────────────────────────────────────────────────────────────

export function useDesignSession() {
  const pageId = ref('')
  const phase = ref<SessionPhase>('discussing')
  const proposals = ref<DesignProposal[]>([])
  const userGoal = ref('')

  const acceptedProposals = computed(() =>
    proposals.value.filter((p) => p.status === 'accepted'),
  )

  const pendingProposals = computed(() =>
    proposals.value.filter((p) => p.status === 'pending'),
  )

  const hasAccepted = computed(() => acceptedProposals.value.length > 0)

  /** 按消息 ID 分组的提案映射（用于在消息后渲染对应提案卡） */
  const proposalsByMessage = computed(() => {
    const map = new Map<string, DesignProposal[]>()
    for (const p of proposals.value) {
      const list = map.get(p.messageId) ?? []
      list.push(p)
      map.set(p.messageId, list)
    }
    return map
  })

  /** 按类型分组的已采纳提案（侧栏展示） */
  const acceptedByType = computed(() => {
    const map = new Map<ProposalType, DesignProposal[]>()
    for (const p of acceptedProposals.value) {
      const list = map.get(p.type) ?? []
      list.push(p)
      map.set(p.type, list)
    }
    return map
  })

  function addProposals(newProposals: DesignProposal[]) {
    proposals.value.push(...newProposals)
  }

  function acceptProposal(id: string) {
    const p = proposals.value.find((x) => x.id === id)
    if (p) p.status = 'accepted'
  }

  function rejectProposal(id: string) {
    const p = proposals.value.find((x) => x.id === id)
    if (p) p.status = 'rejected'
  }

  /** 撤回已采纳的提案（从侧栏移除） */
  function revokeProposal(id: string) {
    const p = proposals.value.find((x) => x.id === id)
    if (p) p.status = 'pending'
  }

  function reset() {
    pageId.value = ''
    phase.value = 'discussing'
    proposals.value = []
    userGoal.value = ''
  }

  return {
    pageId,
    phase,
    proposals,
    userGoal,
    acceptedProposals,
    pendingProposals,
    hasAccepted,
    proposalsByMessage,
    acceptedByType,
    addProposals,
    acceptProposal,
    rejectProposal,
    revokeProposal,
    reset,
  }
}
