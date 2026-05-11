const READ_ONLY_ACTION_PREFIXES = [
  'bootstrap',
  'collect',
  'count',
  'describe',
  'find',
  'get',
  'guide',
  'list',
  'query',
  'read',
] as const

const WRITE_ACTION_PREFIXES = [
  'add',
  'append',
  'clear',
  'create',
  'delete',
  'import',
  'insert',
  'move',
  'remove',
  'replace',
  'reset',
  'restore',
  'set',
  'update',
  'write',
] as const

function startsWithActionPrefix(functionId: string, prefixes: readonly string[]): boolean {
  const normalized = functionId.trim()
  return prefixes.some((prefix) => normalized === prefix || normalized.startsWith(prefix))
}

export class PageDesignEditActionClassifier {
  isWriteAction(functionId: string): boolean {
    if (startsWithActionPrefix(functionId, READ_ONLY_ACTION_PREFIXES)) return false
    return startsWithActionPrefix(functionId, WRITE_ACTION_PREFIXES)
  }
}
