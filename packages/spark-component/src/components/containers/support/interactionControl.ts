import type { CrudResult, IDataRow } from '@spark-view/spark-data'
import {
  createDefaultBehaviorControl,
  type DefaultBehaviorControl,
} from '../../../internal/defaultBehaviorControl'

export type InteractionControl = DefaultBehaviorControl

export type CancelableHandler<TArgs extends unknown[]> = (
  ...args: [...TArgs, InteractionControl]
) => void | Promise<void>

export function createInteractionControl(): InteractionControl {
  return createDefaultBehaviorControl()
}

export async function runControlledInteraction<TArgs extends unknown[]>(
  handler: CancelableHandler<TArgs> | undefined,
  args: TArgs,
  defaultAction?: () => void | Promise<void>,
): Promise<InteractionControl> {
  const control = createInteractionControl()
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