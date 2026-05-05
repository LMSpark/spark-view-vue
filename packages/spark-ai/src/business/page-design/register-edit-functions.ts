import type { RegisteredFunctionDefinition } from '../../core/protocol/function-contracts'
import { registerCoreKnowledgeFunctions } from '../../core/knowledge/register-knowledge-functions'
import { registerFunctionCarriers } from '../../core/registry/function-carrier-registry'
import { registerFunctions } from '../../core/registry/function-registry'
import { registerPageDesignPayloadProviders } from './payloads'
import { createPageDesignEditFunctions, type EditState } from './functions'
import { createEditLifecycleCarrier } from './functions/lifecycle/edit-lifecycle-functions'
import { createTextModelCarrier } from './functions/text-model/text-model-functions'
import {
  createEditDataSetCarrier,
  createEditNodeTreeCarrier,
} from './functions/edit/actions/edit-functions'

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
  registerCoreKnowledgeFunctions()
}