import type { CrudResult, IDataRow } from '@spark-view/spark-data'

// ── 可取消控制器（从 core/cancellable-control 内聚至此） ──────────────────

export interface CancellableControl {
  cancel: boolean
}

export function createCancellableControl(): CancellableControl {
  return { cancel: false }
}

export function isCancellableControl(value: unknown): value is CancellableControl {
  return value !== null
    && value !== undefined
    && typeof value === 'object'
    && 'cancel' in value
    && typeof (value as Record<string, unknown>)['cancel'] === 'boolean'
}

export type InteractionControl = CancellableControl

export type CancelableHandler<TArgs extends unknown[]> = (
  ...args: [...TArgs, InteractionControl]
) => void | Promise<void>

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

export type RowClickHandler = CancelableHandler<[IDataRow, unknown, Event | undefined]>
export type RowSelectionHandler = CancelableHandler<[IDataRow[]]>
export type CurrentRowChangeHandler = CancelableHandler<[IDataRow | null, IDataRow | null | undefined]>
export type AddRowHandler = CancelableHandler<[Partial<IDataRow>]>
export type EditRowHandler = CancelableHandler<[string | number, Partial<IDataRow>]>
export type RemoveRowHandler = CancelableHandler<[string | number]>