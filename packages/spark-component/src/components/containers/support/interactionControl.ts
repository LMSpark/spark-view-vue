/**
 * @module @spark-appworks/spark-component:components/containers/support/interactionControl
 * @spark-appworks/spark-component 的 components/containers/support/interactionControl 模块。
 * 导出 ClassModel symbol: CancellableControl, InteractionControl, CancelableHandler, RowClickHandler, RowSelectionHandler, CurrentRowChangeHandler, AddRowHandler, EditRowHandler 等（共 9 个 symbol）。
 */
import type { CrudResult, DataRow } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'

// ── 可取消控制器（从 core/cancellable-control 内聚至此） ──────────────────

/** Cancellable Control 的语义模型。 */
export type CancellableControl = {
    /** cancel 字段。 */
cancel: boolean}

export function createCancellableControl(): CancellableControl {
  return { cancel: false }
}

export function isCancellableControl(value: unknown): value is CancellableControl {
  return isRecord(value)
    && 'cancel' in value
    && typeof value['cancel'] === 'boolean'
}

/** Interaction Control 的语义模型。 */
export type InteractionControl = {
    /** cancel 字段。 */
cancel: boolean
}

/** Cancelable Handler 的回调函数契约。 */
export type CancelableHandler<TArgs extends unknown[]> = {
  (...args: [...TArgs, InteractionControl]): void | Promise<void>}

export async function runControlledInteraction<TArgs extends unknown[]>(
  handler: CancelableHandler<TArgs> | undefined,
  args: TArgs,
  defaultAction?: () => void | Promise<void>,
): Promise<InteractionControl> {
  const control = createCancellableControl()
  if (handler) {
    await handler(...args, control)
  }
  if (!control.cancel) {
    await defaultAction?.()
  }
  return control
}

export function createCancelledCrudResult<T>(message: string): CrudResult<T> {
  return {
    success: false,
    message,
  }
}

/** Row Click Handler 的回调函数契约。 */
export type RowClickHandler = CancelableHandler<[DataRow, unknown, Event | undefined]>
/** Row Selection Handler 的回调函数契约。 */
export type RowSelectionHandler = CancelableHandler<[DataRow[]]>
/** Current Row Change Handler 的回调函数契约。 */
export type CurrentRowChangeHandler = CancelableHandler<[DataRow | null, DataRow | null | undefined]>
/** Add Row Handler 的回调函数契约。 */
export type AddRowHandler = CancelableHandler<[Partial<DataRow>]>
/** Edit Row Handler 的回调函数契约。 */
export type EditRowHandler = CancelableHandler<[string | number, Partial<DataRow>]>
/** Remove Row Handler 的回调函数契约。 */
export type RemoveRowHandler = CancelableHandler<[string | number]>
