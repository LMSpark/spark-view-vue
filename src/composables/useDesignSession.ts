import { ref } from 'vue'
import type { SessionPhase } from '@spark-view/spark-ai'
import { useProposalState } from './useProposalState'

/**
 * Vue composable 封装设计会话状态。
 * 纯 Vue 响应式层——类型和工具函数来自 @spark-view/spark-ai（纯 TS）。
 * 提案 CRUD 委托给 useProposalState。
 */
export function useDesignSession() {
  const pageId = ref('')
  const phase = ref<SessionPhase>('discussing')
  const userGoal = ref('')

  const proposalState = useProposalState()

  function reset() {
    pageId.value = ''
    phase.value = 'discussing'
    proposalState.proposals.value = []
    userGoal.value = ''
  }

  return {
    pageId,
    phase,
    userGoal,
    ...proposalState,
    reset,
  }
}
