import { ref, computed } from 'vue'
import type { DesignProposal, ProposalType, SessionPhase } from '@spark-view/spark-ai'

/**
 * Vue composable 封装设计会话状态。
 * 纯 Vue 响应式层——类型和工具函数来自 @spark-view/spark-ai（纯 TS）。
 */
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
