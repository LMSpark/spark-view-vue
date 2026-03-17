import { ref, computed } from 'vue'
import type { DesignProposal, ProposalType } from '@spark-view/spark-ai'

/**
 * 蓝图策划阶段（比页面设计更宏观）
 */
export type BlueprintPhase =
  | 'needs-analysis'     // 需求理解
  | 'module-planning'    // 模块规划
  | 'data-modeling'      // 数据建模
  | 'page-design'        // 页面详设
  | 'reviewing'          // 蓝图审阅
  | 'generating'         // 正在写入后端
  | 'applied'            // 已应用
  | 'failed'             // 失败

/** 蓝图关注的 ProposalType 子集 */
const BLUEPRINT_TYPES: ProposalType[] = [
  'navigation', 'data-model', 'function-plan', 'api-config', 'interaction',
]

/**
 * Vue composable: 蓝图策划会话状态管理
 *
 * 复用 spark-ai 的 DesignProposal 类型体系，
 * 但聚焦于应用级（模块/页面/数据模型），而非单页面级。
 */
export function useBlueprintPlanner() {
  const appName = ref('')
  const phase = ref<BlueprintPhase>('needs-analysis')
  const proposals = ref<DesignProposal[]>([])
  const userGoal = ref('')

  // ── 计算属性 ───────────────────────────────────────────────────────────

  const acceptedProposals = computed(() =>
    proposals.value.filter((p) => p.status === 'accepted'),
  )

  const pendingProposals = computed(() =>
    proposals.value.filter((p) => p.status === 'pending'),
  )

  const hasAccepted = computed(() => acceptedProposals.value.length > 0)

  /** 按消息 ID 分组（用于聊天区域内联展示提案卡）*/
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

  /** 蓝图统计 */
  const stats = computed(() => {
    const navProposals = acceptedProposals.value.filter((p) => p.type === 'navigation')
    const dataProposals = acceptedProposals.value.filter((p) => p.type === 'data-model')
    const funcProposals = acceptedProposals.value.filter((p) => p.type === 'function-plan')

    // 从 navigation 提案中提取模块/页面计数
    let moduleCount = 0
    let pageCount = 0
    for (const p of navProposals) {
      try {
        const parsed = JSON.parse(p.content) as Record<string, unknown>
        if (parsed['nodeKind'] === 'module') {
          moduleCount++
          const children = parsed['children']
          if (Array.isArray(children)) {
            pageCount += children.length
          }
        }
      } catch {
        // 非 JSON 格式的 navigation 提案跳过
      }
    }

    return {
      moduleCount,
      pageCount,
      tableCount: dataProposals.length,
      functionPlanCount: funcProposals.length,
    }
  })

  // ── 操作方法 ───────────────────────────────────────────────────────────

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

  function revokeProposal(id: string) {
    const p = proposals.value.find((x) => x.id === id)
    if (p) p.status = 'pending'
  }

  function reset() {
    appName.value = ''
    phase.value = 'needs-analysis'
    proposals.value = []
    userGoal.value = ''
  }

  /**
   * 从已采纳的提案构建最终蓝图提示词（用于 "一键生成" 或 "汇总蓝图"）
   */
  function buildBlueprintSummary(): string {
    const accepted = acceptedProposals.value
    if (accepted.length === 0) return ''

    const sections: string[] = [
      `# 应用蓝图：${appName.value || '未命名应用'}`,
      '',
    ]

    const grouped = new Map<ProposalType, DesignProposal[]>()
    for (const p of accepted) {
      const list = grouped.get(p.type) ?? []
      list.push(p)
      grouped.set(p.type, list)
    }

    const TYPE_LABELS: Record<string, string> = {
      'navigation': '导航结构',
      'data-model': '数据模型',
      'function-plan': '功能规划',
      'api-config': 'API 配置',
      'interaction': '交互规则',
    }

    for (const type of BLUEPRINT_TYPES) {
      const items = grouped.get(type)
      if (!items?.length) continue
      sections.push(`## ${TYPE_LABELS[type] ?? type}`)
      for (const item of items) {
        sections.push(`### ${item.title}`)
        sections.push('```')
        sections.push(item.content)
        sections.push('```')
        sections.push('')
      }
    }

    return sections.join('\n')
  }

  return {
    appName,
    phase,
    proposals,
    userGoal,
    acceptedProposals,
    pendingProposals,
    hasAccepted,
    proposalsByMessage,
    acceptedByType,
    stats,
    blueprintTypes: BLUEPRINT_TYPES,
    addProposals,
    acceptProposal,
    rejectProposal,
    revokeProposal,
    reset,
    buildBlueprintSummary,
  }
}
