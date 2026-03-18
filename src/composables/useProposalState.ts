import { ref, computed } from 'vue'
import type { DesignProposal, ProposalType } from '@spark-view/spark-ai'

/**
 * 提案状态管理基础 composable
 *
 * 提取 useDesignSession 和 useBlueprintPlanner 的公共逻辑：
 * - 提案 CRUD（add / accept / reject / revoke）
 * - 按消息分组 / 按类型分组 / 过滤计算
 *
 * 各上层 composable 在此基础上追加各自的 phase / stats / 特殊方法。
 */
export function useProposalState() {
  const proposals = ref<DesignProposal[]>([])

  // ── 计算属性 ───────────────────────────────────────────────────────────

  const acceptedProposals = computed(() =>
    proposals.value.filter((p) => p.status === 'accepted'),
  )

  const pendingProposals = computed(() =>
    proposals.value.filter((p) => p.status === 'pending'),
  )

  const hasAccepted = computed(() => acceptedProposals.value.length > 0)

  /** 按消息 ID 分组（用于聊天区域内联展示提案卡） */
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

  /** 撤回已采纳的提案 */
  function revokeProposal(id: string) {
    const p = proposals.value.find((x) => x.id === id)
    if (p) p.status = 'pending'
  }

  /** 一键采纳所有待决定提案 */
  function acceptAll() {
    for (const p of proposals.value) {
      if (p.status === 'pending') p.status = 'accepted'
    }
  }

  /** 一键拒绝所有待决定提案 */
  function rejectAll() {
    for (const p of proposals.value) {
      if (p.status === 'pending') p.status = 'rejected'
    }
  }

  /** 编辑提案内容 */
  function editProposalContent(id: string, newContent: string) {
    const p = proposals.value.find((x) => x.id === id)
    if (p) p.content = newContent
  }

  /** 编辑提案标题 */
  function editProposalTitle(id: string, newTitle: string) {
    const p = proposals.value.find((x) => x.id === id)
    if (p) p.title = newTitle
  }

  return {
    proposals,
    acceptedProposals,
    pendingProposals,
    hasAccepted,
    proposalsByMessage,
    acceptedByType,
    addProposals,
    acceptProposal,
    rejectProposal,
    revokeProposal,
    acceptAll,
    rejectAll,
    editProposalContent,
    editProposalTitle,
  }
}
