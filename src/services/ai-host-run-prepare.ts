/**
 * @module app:services/ai-host-run-prepare
 * 职责：提供主应用 ai-host-run-prepare 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
 * 边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
 * AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 services/ai-host-run-prepare。
 */
import type { AiHostRunPrepare, AiHostRunTarget } from '@/services/ai-host-run-bridge'

/** 串联多个 Host Run prepare；各业务 alias 只处理自己的 event，其余透传。 */
export function chainAiHostRunPrepare<THost extends AiHostRunTarget>(
  ...preparers: ReadonlyArray<AiHostRunPrepare<THost>>
): AiHostRunPrepare<THost> {
  return async (event, host): Promise<THost> => {
    let current: THost = host
    for (const prepare of preparers) {
      const next = await prepare(event, current)
      if (!isPreparedHost<THost>(next)) {
        throw new Error('ai-host-run prepare returned an invalid host target.')
      }
      current = next
    }
    return current
  }
}

function isPreparedHost<THost extends AiHostRunTarget>(_host: AiHostRunTarget): _host is THost {
  return true
}
