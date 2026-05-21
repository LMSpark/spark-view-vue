/**
 * Assistant 业务注册入口。
 *
 * Host 直接注册 module-semantic 业务，注册对象就是 Host 可调度的业务单元。
 */

import type {
  AiHostBusinessRegistry,
  AiHostBusinessRuntimeContext,
} from '@spark-view/spark-ai/host'
import type { PageDesignEditHost } from '../../page/workspace/editing/page-design-edit-session'
import { createLeaveRequestBusinessRegistration } from './leave-request'
import { createPageDesignBusinessRegistration } from './page-design'

export interface RegisterAssistantBusinessesOptions {
  readonly registry: AiHostBusinessRegistry
  readonly getPageDesignEditHost?: (context: AiHostBusinessRuntimeContext) => PageDesignEditHost
}

export function registerAssistantBusinesses(options: RegisterAssistantBusinessesOptions): void {
  options.registry.register(createLeaveRequestBusinessRegistration())

  if (options.getPageDesignEditHost === undefined) return

  options.registry.register(createPageDesignBusinessRegistration({
    getEditToolHost: (context) => options.getPageDesignEditHost?.(context) ?? missingPageDesignEditHost(),
  }))
}

function missingPageDesignEditHost(): never {
  throw new Error('PageDesign edit host unavailable: 请先在开发系统中打开并选中目标配置页面。')
}
