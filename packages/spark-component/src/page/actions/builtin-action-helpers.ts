/**
 * 内置声明式动作系统 — 纯函数工具集
 *
 * 值解析等无状态纯函数，供 meta / disabled / handler 三个模块共用。
 */

import type { PageMessageType } from '../../components/internal'
import type { SparkNode } from '../../components/internal'
import { nodeInputProps } from '../../components/internal'
import { readString } from './executor-helpers'

// ── 值解析 ────────────────────────────────────────────────────────────────

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const filtered = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return filtered.length > 0 ? filtered : undefined
}

export function readOptionalMessageType(value: unknown): PageMessageType | undefined {
  const text = readString(value)
  if (!text) return undefined

  switch (text) {
    case 'success':
    case 'error':
    case 'warning':
    case 'info':
      return text
    default:
      return undefined
  }
}

export function getActionProps(action: SparkNode): Record<string, unknown> {
  return nodeInputProps(action)
}
