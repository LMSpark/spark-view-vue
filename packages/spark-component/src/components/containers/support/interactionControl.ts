import type { CrudResult, DataRow } from '@spark-view/spark-data'
import { isRecord } from '@spark-view/spark-utils'

// ── 可取消控制器（从 core/cancellable-control 内聚至此） ──────────────────

export type CancellableControl = {
  cancel: boolean}

export function createCancellableControl(): CancellableControl {
  return { cancel: false }
}

export function isCancellableControl(value: unknown): value is CancellableControl {
  return isRecord(value)
    && 'cancel' in value
    && typeof value['cancel'] === 'boolean'
}

export type InteractionControl = {
  cancel: boolean
}

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

export type RowClickHandler = CancelableHandler<[DataRow, unknown, Event | undefined]>
export type RowSelectionHandler = CancelableHandler<[DataRow[]]>
export type CurrentRowChangeHandler = CancelableHandler<[DataRow | null, DataRow | null | undefined]>
export type AddRowHandler = CancelableHandler<[Partial<DataRow>]>
export type EditRowHandler = CancelableHandler<[string | number, Partial<DataRow>]>
export type RemoveRowHandler = CancelableHandler<[string | number]>
