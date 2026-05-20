import type { CrudResult, DataRow } from '@spark-view/spark-data'

// ── 可取消控制器（从 core/cancellable-control 内聚至此） ──────────────────

export interface CancellableControl {
  cancel: boolean
}

export function createCancellableControl(): CancellableControl {
  return { cancel: false }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isCancellableControl(value: unknown): value is CancellableControl {
  return isRecord(value)
    && 'cancel' in value
    && typeof value['cancel'] === 'boolean'
}

export interface InteractionControl extends CancellableControl {}

export interface CancelableHandler<TArgs extends unknown[]> {
  (...args: [...TArgs, InteractionControl]): void | Promise<void>
}

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

export interface RowClickHandler extends CancelableHandler<[DataRow, unknown, Event | undefined]> {}
export interface RowSelectionHandler extends CancelableHandler<[DataRow[]]> {}
export interface CurrentRowChangeHandler extends CancelableHandler<[DataRow | null, DataRow | null | undefined]> {}
export interface AddRowHandler extends CancelableHandler<[Partial<DataRow>]> {}
export interface EditRowHandler extends CancelableHandler<[string | number, Partial<DataRow>]> {}
export interface RemoveRowHandler extends CancelableHandler<[string | number]> {}
