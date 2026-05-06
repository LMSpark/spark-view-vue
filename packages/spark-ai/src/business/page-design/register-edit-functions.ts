import {
  coreKnowledgeFunctions,
  registerFunctionCarriers,
  registerFunctions,
  type RegisteredFunctionDefinition,
} from '../../core'
import { registerPageDesignPayloadProviders } from './payloads'
import {
  createPageDesignEditFunctions,
  createEditLifecycleCarrier,
  createTextModelCarrier,
  createEditDataSetCarrier,
  createEditNodeTreeCarrier,
  type EditState,
} from './functions'

/**
 * 注册 page-design 编辑态函数。
 *
 * 该入口归属于业务层：业务层声明自身函数和 payload provider，core 只提供注册机。
 */
export function registerPageDesignEditFunctions(state: EditState): void {
  registerFunctionCarriers([
    createEditLifecycleCarrier(state),
    createTextModelCarrier(state),
    createEditNodeTreeCarrier(state),
    createEditDataSetCarrier(state),
  ])
  registerFunctions(createPageDesignEditFunctions() as unknown as ReadonlyArray<RegisteredFunctionDefinition<unknown, unknown>>)
  registerPageDesignPayloadProviders()
  registerFunctions(coreKnowledgeFunctions as unknown as ReadonlyArray<RegisteredFunctionDefinition<unknown, unknown>>)
}