/**
 * @module @spark-appworks/spark-component:components/fields/actions/useSelectorFieldActions
 * @spark-appworks/spark-component 的 components/fields/actions/useSelectorFieldActions 模块。
 * 导出 ClassModel symbol: UseSelectorFieldActionsOptions（共 1 个 symbol）。
 */
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type {
  PageSelectorOption,
  PageSelectEntitiesOptions,
  PageServiceCapability,
} from '../../internal'
import { useFieldActionMode } from './useFieldActionMode'

/** Use Selector Field Actions Options 的调用配置。 */
type UseSelectorFieldActionsOptions = {
    /** page Service 字段。 */
pageService: PageServiceCapability | null
    /** 是否 is Editable。 */
isEditable: ComputedRef<boolean>}

export function useSelectorFieldActions(options: UseSelectorFieldActionsOptions) {
  const { pageService, isEditable } = options
  const { actionMode, chooseByMode } = useFieldActionMode({ isEditable })

  const hasSelectorCapability = computed(() => typeof pageService?.selectEntities === 'function')
  const primaryAction = chooseByMode<'select' | 'view'>('select', 'view')

  async function selectEntities(selectorOptions: PageSelectEntitiesOptions): Promise<PageSelectorOption[]> {
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