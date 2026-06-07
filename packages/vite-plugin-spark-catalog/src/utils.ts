/**
 * module-metadata 生成器共享工具。
 */

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

export function createLogger(namespace: string) {
  const prefix = `[${namespace}]`
  return {
    info: (...args: unknown[]) => { console.info(prefix, ...args) },
    warn: (...args: unknown[]) => { console.warn(prefix, ...args) },
    error: (...args: unknown[]) => { console.error(prefix, ...args) },
    debug: (..._args: unknown[]) => {},
  }
}
