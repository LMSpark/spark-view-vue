import { registerDomain } from '../../core/stills/domain'
import { registerCoreStills } from '../../core/stills/register-core-stills'
import { registerPageDesignPayloadProviders } from './payloads'
import { editDomain } from './stills'

/**
 * 注册 page-design 编辑态 stills。
 *
 * 该入口归属于业务域：业务域声明自身 domain 和 payload provider，core 只提供注册机。
 */
export function registerPageDesignEditStills(): void {
  registerDomain(editDomain)
  registerPageDesignPayloadProviders()
  registerCoreStills()
}