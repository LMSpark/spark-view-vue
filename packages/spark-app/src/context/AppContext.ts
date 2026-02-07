/**
 * Application Context
 * 应用级上下文管理
 */

import { reactive } from 'vue'
import type { AppContext, UserInfo, TenantInfo, EnvironmentInfo } from '../types'

/**
 * 创建应用上下文
 */
export function createAppContext(options: {
  user: UserInfo
  tenant: TenantInfo
  env: EnvironmentInfo
  config?: Record<string, unknown>
}): AppContext {
  return reactive({
    user: options.user,
    tenant: options.tenant,
    env: options.env,
    config: options.config ?? {},
    initializedAt: new Date().toISOString()
  })
}
