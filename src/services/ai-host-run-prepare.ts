import type { AiHostRunPrepare, AiHostRunTarget } from '@/services/ai-host-run-bridge'

/** 串联多个 Host Run prepare；各业务 alias 只处理自己的 event，其余透传。 */
export function chainAiHostRunPrepare<THost extends AiHostRunTarget>(
  ...preparers: ReadonlyArray<AiHostRunPrepare<THost>>
): AiHostRunPrepare<THost> {
  return async (event, host) => {
    let current: THost = host
    for (const prepare of preparers) {
      current = await prepare(event, current) as THost
    }
    return current
  }
}
