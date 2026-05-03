/**
 * action-utils.ts — 跨 actions 子模块共享的最小工具函数。
 */

/**
 * 将比较值规范化：空字符串和 null/undefined 都视为 null，便于字段相等比较。
 */
export function normalizeComparable(value: unknown): unknown {
  if (value === '') return null
  return value ?? null
}
