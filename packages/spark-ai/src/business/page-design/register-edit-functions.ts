import { registerCoreKnowledgeFunctions } from '../../core/knowledge/register-knowledge-functions'
import { registerFunctions } from '../../core/registry/function-registry'
import { registerPageDesignPayloadProviders } from './payloads'
import { createPageDesignEditFunctions, type EditState } from './functions'

/**
 * 注册 page-design 编辑态函数。
 *
 * 该入口归属于业务层：业务层声明自身函数和 payload provider，core 只提供注册机。
 */
export function registerPageDesignEditFunctions(state: EditState): void {
  registerFunctions(createPageDesignEditFunctions(state))
  registerPageDesignPayloadProviders()
  registerCoreKnowledgeFunctions()
}