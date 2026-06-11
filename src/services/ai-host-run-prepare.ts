/**
 * @module app:services/ai-host-run-prepare
 * app 的 services/ai-host-run-prepare 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
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
