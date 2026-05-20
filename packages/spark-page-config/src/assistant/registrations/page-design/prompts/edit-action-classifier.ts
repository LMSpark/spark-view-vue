/**
 * 编辑动作分类器。
 *
 * 通过函数名首字母前缀判断 read-only 或 write 动作，用于 prompt 生成和函数调用策略选择。
 * 只读前缀：bootstrap / collect / count / describe / find / get / guide / list / query / read
 * 写入前缀：add / append / clear / create / delete / import / insert / move / remove / replace / reset / restore / set / update / write
 */

const READ_ONLY_ACTION_PREFIXES: readonly string[] = [
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
]

const WRITE_ACTION_PREFIXES: readonly string[] = [
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
]

function startsWithActionPrefix(functionId: string, prefixes: readonly string[]): boolean {
  const normalized = functionId.trim()
  return prefixes.some((prefix) => normalized === prefix || normalized.startsWith(prefix))
}

/** 基于函数名前缀判断是否为写入动作：只读前缀先匹配，未命中再匹配写入前缀。 */
export class PageDesignEditActionClassifier {
  isWriteAction(functionId: string): boolean {
    if (startsWithActionPrefix(functionId, READ_ONLY_ACTION_PREFIXES)) return false
    return startsWithActionPrefix(functionId, WRITE_ACTION_PREFIXES)
  }
}
