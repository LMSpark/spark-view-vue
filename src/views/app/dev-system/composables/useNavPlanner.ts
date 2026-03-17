/**
 * 导航结构策划会话状态管理
 *
 * 核心设计规则：
 * - 仅策划导航结构（title / description / nodeKind / 层级）
 * - 增量式：基于当前导航树快照建议增/删
 * - 目标锁定：点击"开始策划"时锁定节点 ID + 快照
 * - 非阻塞：策划中用户可自由切换节点
 * - 人工审核后插入：候选建议 → 用户逐条选择 → 确认后写入
 * - 删除先标记待删除，统一确认后删
 */
import { ref, computed } from 'vue'
import type { NavNode } from '@spark-view/spark-utils'

// ── Types ────────────────────────────────────────────────────────────────────

export type NavSuggestionKind = 'add' | 'delete'
export type NavSuggestionStatus = 'pending' | 'accepted' | 'rejected'
export type PlannerMode = 'current-node' | 'global'
export type PlannerPhase = 'idle' | 'planning' | 'reviewing' | 'applying' | 'applied' | 'failed'

export interface NavAddSuggestion {
  id: string
  kind: 'add'
  status: NavSuggestionStatus
  messageId: string
  title: string
  /** 目标父节点 ID（null = 添加到根级） */
  parentId: string | null
  /** 新增节点完整定义 */
  node: NavNode
}

export interface NavDeleteSuggestion {
  id: string
  kind: 'delete'
  status: NavSuggestionStatus
  messageId: string
  title: string
  /** 要删除的节点 ID */
  nodeId: string
  /** 删除原因 */
  reason: string
}

export type NavSuggestion = NavAddSuggestion | NavDeleteSuggestion

/** 锁定的策划目标快照 */
export interface PlannerTarget {
  /** 锁定时的节点 ID（null = 全局模式） */
  nodeId: string | null
  /** 锁定时的节点标题（展示用） */
  nodeTitle: string
  /** 锁定时的导航树快照（JSON 序列化） */
  treeSnapshot: string
}

// ── @@proposal 协议解析（nav-add / nav-delete 专用）──────────────────────────

const NAV_BLOCK_RE = /^@@proposal:(nav-add|nav-delete)\s*$([\s\S]*?)^@@end\s*$/gm

/**
 * 从可能含有解释文字的字符串中提取首个 JSON 对象 `{...}`
 * AI 有时在 # 标题和 JSON 之间插入说明段落，此函数容错处理。
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  // 从末尾向前找最后一个 `}`
  const end = text.lastIndexOf('}')
  if (end <= start) return null
  return text.slice(start, end + 1)
}

function extractNavSuggestions(content: string, messageId: string): NavSuggestion[] {
  const results: NavSuggestion[] = []
  NAV_BLOCK_RE.lastIndex = 0
  let m: RegExpExecArray | null = NAV_BLOCK_RE.exec(content)
  while (m !== null) {
    const kind = m[1] as 'nav-add' | 'nav-delete'
    const payload = (m[2] ?? '').trim()

    // 提取标题（# 开头的第一行）+ 容错提取 JSON 对象
    const lines = payload.split('\n')
    let title = ''
    let restStr = payload
    if (lines[0]?.startsWith('# ')) {
      title = lines[0].slice(2).trim()
      restStr = lines.slice(1).join('\n').trim()
    }

    // 从剩余文本中定位首个 {...} 块（容忍 AI 在标题和 JSON 之间插入文字）
    const jsonStr = extractJsonObject(restStr)
    if (!jsonStr) {
      m = NAV_BLOCK_RE.exec(content)
      continue
    }

    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>

      if (kind === 'nav-add') {
        const node = parsed['node'] as NavNode | undefined
        if (node?.id && node.title) {
          results.push({
            id: crypto.randomUUID(),
            kind: 'add',
            status: 'pending',
            messageId,
            title: title || `新增：${node.title}`,
            parentId: (parsed['parentId'] as string | null) ?? null,
            node,
          })
        }
      } else {
        const nodeId = parsed['nodeId'] as string | undefined
        if (nodeId) {
          results.push({
            id: crypto.randomUUID(),
            kind: 'delete',
            status: 'pending',
            messageId,
            title: title || `删除：${nodeId}`,
            nodeId,
            reason: typeof parsed['reason'] === 'string' ? parsed['reason'] : '',
          })
        }
      }
    } catch {
      // JSON 解析失败，跳过该提案
    }

    m = NAV_BLOCK_RE.exec(content)
  }
  return results
}

/** 从显示内容中去除 nav-add / nav-delete 协议块 */
export function stripNavProposalTags(content: string): string {
  return content
    .replace(NAV_BLOCK_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Composable ───────────────────────────────────────────────────────────────

export function useNavPlanner() {
  const mode = ref<PlannerMode>('current-node')
  const phase = ref<PlannerPhase>('idle')
  const suggestions = ref<NavSuggestion[]>([])
  const target = ref<PlannerTarget | null>(null)
  /** 导航上下文是否已随第一条消息发出（防止多轮 token 膨胀） */
  let contextSent = false

  // ── 计算属性 ────────────────────────────────────────────────────────────

  const addSuggestions = computed(() =>
    suggestions.value.filter((s): s is NavAddSuggestion => s.kind === 'add'),
  )

  const deleteSuggestions = computed(() =>
    suggestions.value.filter((s): s is NavDeleteSuggestion => s.kind === 'delete'),
  )

  const acceptedSuggestions = computed(() =>
    suggestions.value.filter((s) => s.status === 'accepted'),
  )

  const pendingSuggestions = computed(() =>
    suggestions.value.filter((s) => s.status === 'pending'),
  )

  const hasAccepted = computed(() => acceptedSuggestions.value.length > 0)

  /** 按消息分组（用于聊天区域内联渲染） */
  const suggestionsByMessage = computed(() => {
    const map = new Map<string, NavSuggestion[]>()
    for (const s of suggestions.value) {
      const list = map.get(s.messageId) ?? []
      list.push(s)
      map.set(s.messageId, list)
    }
    return map
  })

  const stats = computed(() => ({
    addCount: addSuggestions.value.filter((s) => s.status === 'accepted').length,
    deleteCount: deleteSuggestions.value.filter((s) => s.status === 'accepted').length,
    pendingCount: pendingSuggestions.value.length,
  }))

  // ── 锁定目标 ──────────────────────────────────────────────────────────

  function lockTarget(
    node: NavNode | null,
    treeData: NavNode[],
  ) {
    target.value = {
      nodeId: node?.id ?? null,
      nodeTitle: node?.title ?? '全局导航',
      treeSnapshot: JSON.stringify(treeData, null, 2),
    }
    phase.value = 'planning'
  }

  /** 安全检查：锁定节点是否仍存在且未变更 */
  function verifyTarget(treeData: NavNode[]): { valid: boolean; reason?: string } {
    if (!target.value) return { valid: false, reason: '没有锁定目标' }

    if (target.value.nodeId === null) {
      // 全局模式：只检查树不为空
      return treeData.length > 0
        ? { valid: true }
        : { valid: false, reason: '导航树为空' }
    }

    // 当前节点模式：检查节点仍存在
    const found = findNodeById(treeData, target.value.nodeId)
    if (!found) {
      return { valid: false, reason: `锁定节点 ${target.value.nodeTitle} 已被删除` }
    }

    return { valid: true }
  }

  // ── 提案操作 ──────────────────────────────────────────────────────────

  function addSuggestionsFromMessage(content: string, messageId: string) {
    const newSuggestions = extractNavSuggestions(content, messageId)
    if (newSuggestions.length > 0) {
      suggestions.value.push(...newSuggestions)
    }
  }

  function acceptSuggestion(id: string) {
    const s = suggestions.value.find((x) => x.id === id)
    if (s) s.status = 'accepted'
  }

  function rejectSuggestion(id: string) {
    const s = suggestions.value.find((x) => x.id === id)
    if (s) s.status = 'rejected'
  }

  function revokeSuggestion(id: string) {
    const s = suggestions.value.find((x) => x.id === id)
    if (s) s.status = 'pending'
  }

  function acceptAll() {
    for (const s of suggestions.value) {
      if (s.status === 'pending') s.status = 'accepted'
    }
  }

  function rejectAll() {
    for (const s of suggestions.value) {
      if (s.status === 'pending') s.status = 'rejected'
    }
  }

  // ── 构建 AI 上下文 ────────────────────────────────────────────────────

  /**
   * 构建发送给 AI 的用户消息
   *
   * - 第 1 条消息：注入策划模式 + 导航树快照 + 用户需求（结构化定界符）
   * - 第 2+ 条消息：只发用户原文（AI 依据系统提示词记忆首轮快照）
   */
  function buildContextPrompt(userMessage: string): string {
    if (!target.value) return userMessage

    // 后续轮次不再注入快照——避免 N 轮 × 快照大小 的 token 膨胀
    if (contextSent) return userMessage

    contextSent = true

    const parts: string[] = []

    if (mode.value === 'global') {
      parts.push('【策划模式：全局】对整个应用导航树进行规划。')
    } else {
      parts.push(`【策划模式：当前节点】对节点「${target.value.nodeTitle}」(ID: ${target.value.nodeId}) 及其子树进行规划。`)
    }

    parts.push('')
    parts.push('===NAV_TREE_START===')
    parts.push(target.value.treeSnapshot)
    parts.push('===NAV_TREE_END===')
    parts.push('')
    parts.push('===USER_REQUEST===')
    parts.push(userMessage)

    return parts.join('\n')
  }

  // ── 重置 ──────────────────────────────────────────────────────────────

  function reset() {
    mode.value = 'current-node'
    phase.value = 'idle'
    suggestions.value = []
    target.value = null
    contextSent = false
  }

  return {
    mode,
    phase,
    suggestions,
    target,
    // computed
    addSuggestions,
    deleteSuggestions,
    acceptedSuggestions,
    pendingSuggestions,
    hasAccepted,
    suggestionsByMessage,
    stats,
    // methods
    lockTarget,
    verifyTarget,
    addSuggestionsFromMessage,
    acceptSuggestion,
    rejectSuggestion,
    revokeSuggestion,
    acceptAll,
    rejectAll,
    buildContextPrompt,
    reset,
  }
}

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function findNodeById(nodes: NavNode[], id: string): NavNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}
