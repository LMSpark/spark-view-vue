import mitt from 'mitt'
import type { IDataRow } from './types'
import { createEventContext } from './types'
import { withEventContext } from './event-context-manager'

// 📍 全局事件总线（mitt）
export const bus = mitt<{ rowSelected: IDataRow }>()

/**
 * 发布行选中事件，会自动创建并传播 EventContext
 */
export function emitRowSelected(row: IDataRow): void {
  const ctx = createEventContext('ui')
  withEventContext(ctx, () => {
    bus.emit('rowSelected', row)
  })
}
