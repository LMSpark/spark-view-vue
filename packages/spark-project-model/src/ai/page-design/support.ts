/**
 * PageDesign AI 会话质量诊断。
 *
 * 这里只检查会话历史是否显式查询过组件 payload 指南；页面业务验收留给上层 smoke/e2e。
 */

import type { AiAgentSessionRecord } from '@spark-view/spark-ai/agent'
import { isRecord } from '@spark-view/spark-utils'
import { hasPageDesignComponentPayloadKey } from './tool-catalog/payload-catalog'

export type PageDesignFileSnapshot = Readonly<Record<string, string | undefined>>

export type PageDesignPayloadGuideValidation = Readonly<{
  ok: boolean
  componentTypes: readonly string[]
  guidedPayloadKeys: readonly string[]
  missingGuides: readonly string[]
}>

type PageDesignJsonParseResult = Readonly<
  | { ok: true; data: unknown }
  | { ok: false; error: string }
>

export function validatePageDesignPayloadGuidesFromSession(
  files: PageDesignFileSnapshot,
  sessionRecord: AiAgentSessionRecord | null | undefined,
): PageDesignPayloadGuideValidation {
  const componentTypes = componentTypesFromPageDesignRule(files)
  const guidedPayloadKeys = guidedPageDesignPayloadKeysFromSession(sessionRecord)
  const guidedSet = new Set(guidedPayloadKeys)
  const missingGuides = componentTypes.filter((type) => !guidedSet.has(type))
  return {
    ok: missingGuides.length === 0,
    componentTypes,
    guidedPayloadKeys,
    missingGuides,
  }
}

export function componentTypesFromPageDesignRule(files: PageDesignFileSnapshot): readonly string[] {
  const rule = parsePageDesignJsonFile(files, 'rule.json')
  if (!rule.ok) return []
  return [...new Set(flattenPageDesignSparkNodes(rule.data)
    .map((node) => typeof node['type'] === 'string' ? node['type'].trim() : '')
    .filter((type) => type.length > 0 && hasPageDesignComponentPayloadKey(type)))]
    .sort()
}

export function guidedPageDesignPayloadKeysFromSession(
  sessionRecord: AiAgentSessionRecord | null | undefined,
): readonly string[] {
  return [...new Set((sessionRecord?.history ?? []).flatMap((entry) => {
    if (entry.kind !== 'functionCall') return []
    const key = guidePayloadKeyFromFunctionCall(entry.toolName, entry.args)
    return key === null ? [] : [key]
  }))].sort()
}

function guidePayloadKeyFromFunctionCall(toolName: string, args: unknown): string | null {
  const callArgs = guidePayloadArgsFromFunctionCall(toolName, args)
  if (!isRecord(callArgs)) return null
  const key = typeof callArgs['key'] === 'string' ? callArgs['key'].trim() : ''
  return key.length > 0 ? key : null
}

function guidePayloadArgsFromFunctionCall(toolName: string, args: unknown): unknown {
  if (!isRecord(args)) return null
  if (toolName === 'guidePayload') return args['args']
  if (toolName === 'module_call' && args['functionName'] === 'guidePayload') return args['args']
  return null
}

export function parsePageDesignJsonFile(
  files: PageDesignFileSnapshot,
  name: string,
): PageDesignJsonParseResult {
  try {
    return { ok: true, data: JSON.parse(files[name] ?? '') }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function flattenPageDesignSparkNodes(value: unknown): ReadonlyArray<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(flattenPageDesignSparkNodes)
  if (!isRecord(value)) return []
  const current = isSparkNodeLike(value) ? [value] : []
  const nested = Object.values(value).flatMap(flattenPageDesignSparkNodes)
  return [...current, ...nested]
}

function isSparkNodeLike(value: Record<string, unknown>): boolean {
  return typeof value['type'] === 'string'
    && (
      typeof value['id'] === 'string'
      || isRecord(value['props'])
      || Array.isArray(value['children'])
    )
}
