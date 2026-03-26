import { computed } from 'vue'
import type { ComputedRef, Slots } from 'vue'
import type { LateralActionPosition } from './useContainerActions'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface UseContainerSlotsOptions {
  slots: Slots
  actionSlotName: string
  actionPosition: ComputedRef<LateralActionPosition>
  showActionsLeft: ComputedRef<boolean>
  showActionsRight: ComputedRef<boolean>
}

// ── 组合式函数 ───────────────────────────────────────────────────────────────

export function useContainerSlots(options: UseContainerSlotsOptions) {
  // 只要消费方提供了动作插槽，就应该强制显示对应的动作区域。
  const hasActionSlot = computed(() => options.slots[options.actionSlotName] !== undefined)
  const showActionsLeftValue = computed(() =>
    options.actionPosition.value === 'left' && (options.showActionsLeft.value || hasActionSlot.value)
  )
  const showActionsRightValue = computed(() =>
    options.actionPosition.value === 'right' && (options.showActionsRight.value || hasActionSlot.value)
  )

  return {
    showActionsLeftValue,
    showActionsRightValue,
  }
}