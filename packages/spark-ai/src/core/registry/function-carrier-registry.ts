import type { FunctionCarrierContract, FunctionCarrierKey } from '../protocol/function-contracts'

const carrierRegistry = new Map<FunctionCarrierKey, FunctionCarrierContract<unknown>>()

export function actionToCarrierKey(action: string): FunctionCarrierKey {
  const parts = action.split('@')
  const business = parts[0]?.trim() ?? ''
  const moduleName = parts[1]?.trim() ?? ''
  if (business.length === 0 || moduleName.length === 0) {
    throw new Error(`非法 action 地址: ${action}，无法推导 carrierKey`) 
  }
  return `${business}@${moduleName}`
}

export function registerFunctionCarrier<TInstance>(carrier: FunctionCarrierContract<TInstance>): void {
  carrierRegistry.set(carrier.carrierKey, carrier as FunctionCarrierContract<unknown>)
}

export function registerFunctionCarriers<TInstance>(carriers: ReadonlyArray<FunctionCarrierContract<TInstance>>): void {
  for (const carrier of carriers) {
    carrierRegistry.set(carrier.carrierKey, carrier as FunctionCarrierContract<unknown>)
  }
}

export function getFunctionCarrier(carrierKey: FunctionCarrierKey): FunctionCarrierContract<unknown> | undefined {
  return carrierRegistry.get(carrierKey)
}

export function getFunctionCarrierByAction(action: string): FunctionCarrierContract<unknown> | undefined {
  return carrierRegistry.get(actionToCarrierKey(action))
}

export function getAllFunctionCarriers(): ReadonlyMap<FunctionCarrierKey, FunctionCarrierContract<unknown>> {
  return carrierRegistry
}

export function clearFunctionCarrierRegistry(): void {
  carrierRegistry.clear()
}