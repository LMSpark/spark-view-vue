import { ref, computed } from 'vue'
import type { ProposalType } from '@spark-view/spark-ai'
import { useProposalState } from './useProposalState'

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
 * 复用 useProposalState 的提案 CRUD，
 * 追加蓝图特有的 phase / stats / summary 逻辑。
 */
export function useBlueprintPlanner() {
  const appName = ref('')
  const phase = ref<BlueprintPhase>('needs-analysis')
  const userGoal = ref('')

  const proposalState = useProposalState()

  // ── 蓝图统计 ───────────────────────────────────────────────────────────

  const stats = computed(() => {
    const navProposals = proposalState.acceptedProposals.value.filter((p) => p.type === 'navigation')
    const dataProposals = proposalState.acceptedProposals.value.filter((p) => p.type === 'data-model')
    const funcProposals = proposalState.acceptedProposals.value.filter((p) => p.type === 'function-plan')

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

  // ── 蓝图特有方法 ──────────────────────────────────────────────────────

  function reset() {
    appName.value = ''
    phase.value = 'needs-analysis'
    proposalState.proposals.value = []
    userGoal.value = ''
  }

  /**
   * 从已采纳的提案构建最终蓝图提示词
   */
  function buildBlueprintSummary(): string {
    const accepted = proposalState.acceptedProposals.value
    if (accepted.length === 0) return ''

    const sections: string[] = [
      `# 应用蓝图：${appName.value || '未命名应用'}`,
      '',
    ]

    const grouped = new Map<ProposalType, typeof accepted>()
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
    userGoal,
    ...proposalState,
    stats,
    blueprintTypes: BLUEPRINT_TYPES,
    reset,
    buildBlueprintSummary,
  }
}
