import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type {
  IPageSelectedEntity,
  IPageSelectEntitiesOptions,
  IPageServiceCapability,
} from '@spark-view/spark-utils'
import { useFieldActionMode } from './useFieldActionMode'

export interface UseSelectorFieldActionsOptions {
  pageService: IPageServiceCapability | null
  isEditable: ComputedRef<boolean>
}

export function useSelectorFieldActions(options: UseSelectorFieldActionsOptions) {
  const { pageService, isEditable } = options
  const { actionMode, chooseByMode } = useFieldActionMode({ isEditable })

  const hasSelectorCapability = computed(() => typeof pageService?.selectEntities === 'function')
  const primaryAction = chooseByMode<'select' | 'view'>('select', 'view')

  async function selectEntities(selectorOptions: IPageSelectEntitiesOptions): Promise<IPageSelectedEntity[]> {
    if (typeof pageService?.selectEntities !== 'function') return []
    return await pageService.selectEntities(selectorOptions)
  }

  return {
    actionMode,
    hasSelectorCapability,
    primaryAction,
    selectEntities,
  }
}