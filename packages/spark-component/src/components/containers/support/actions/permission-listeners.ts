type ListenerMap = Record<string, unknown>
type ListenerHandler = (...args: unknown[]) => unknown

export interface PermissionListenerWrapOptions {
  allowed: boolean
  scopedArgs?: unknown[]
}

function asListenerMap(value: unknown): ListenerMap | undefined {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as ListenerMap
}

export function wrapPermissionListener(handler: unknown, options: PermissionListenerWrapOptions): unknown {
  const { allowed, scopedArgs } = options
  if (!allowed) {
    return (..._args: unknown[]) => undefined
  }

  if (!Array.isArray(scopedArgs) || scopedArgs.length === 0) {
    return handler
  }

  if (typeof handler === 'function') {
    return (...args: unknown[]) => (handler as ListenerHandler)(...scopedArgs, ...args)
  }

  if (Array.isArray(handler)) {
    return (...args: unknown[]) => {
      for (const item of handler) {
        if (typeof item === 'function') {
          ;(item as ListenerHandler)(...scopedArgs, ...args)
        }
      }
    }
  }

  return handler
}

export function wrapPermissionListeners(listenerSource: unknown, options: PermissionListenerWrapOptions): ListenerMap | undefined {
  const listenerMap = asListenerMap(listenerSource)
  if (!listenerMap) return undefined

  return Object.fromEntries(
    Object.entries(listenerMap).map(([eventName, handler]) => [
      eventName,
      wrapPermissionListener(handler, options),
    ])
  )
}
