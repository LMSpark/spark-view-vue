import type { ComputedRef, InjectionKey } from 'vue'

export const TABLE_COLUMN_RESIZABLE_KEY: InjectionKey<ComputedRef<boolean>> = Symbol('spark-table-column-resizable')
