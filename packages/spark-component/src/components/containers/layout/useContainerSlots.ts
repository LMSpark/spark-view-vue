import { computed } from 'vue'
import type { ComputedRef, Slots } from 'vue'
import type { LateralActionPosition } from '../composables/useContainerActions'

interface UseContainerSlotsOptions {
  slots: Slots
  actionSlotName: string
  actionPosition: ComputedRef<LateralActionPosition>
  showActionsLeft: ComputedRef<boolean>
  showActionsRight: ComputedRef<boolean>
  allowSlotOnlyColumn?: boolean
}

export function useContainerSlots(options: UseContainerSlotsOptions) {
  const allowSlotOnlyColumn = options.allowSlotOnlyColumn ?? true
  const hasActionSlot = computed(() => options.slots[options.actionSlotName] !== undefined)
  const showActionsLeftValue = computed(() =>
    options.actionPosition.value === 'left'
      && (options.showActionsLeft.value || (allowSlotOnlyColumn && hasActionSlot.value))
  )
  const showActionsRightValue = computed(() =>
    options.actionPosition.value === 'right'
      && (options.showActionsRight.value || (allowSlotOnlyColumn && hasActionSlot.value))
  )

  return {
    showActionsLeftValue,
    showActionsRightValue,
  }
}