/**
 * 深克隆工具
 *
 * 基于原生 `structuredClone`，保留 `undefined`、`Date`、`Map`、`Set`、`ArrayBuffer` 等
 * 结构化克隆算法支持的所有类型。
 *
 * 不可克隆值（函数、Symbol 键、DOM 节点等）由 `structuredClone` 原生抛 `DataCloneError`，
 * 不做包装、不做退化。
 */

export function deepClone<T>(value: T): T {
  return structuredClone(value)
}
