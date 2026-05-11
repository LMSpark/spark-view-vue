/**
 * JSON Pointer 工具函数（RFC 6901 子集实现）
 *
 * 路径格式：以 `/` 开头，段间以 `/` 分隔。
 *   空字符串 "" = 文档根
 *   "/tables/0/columns" = tables[0].columns
 * 转义规则：~1 → /，~0 → ~
 */

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray
export type JsonObject = { [key: string]: JsonValue }
export type JsonArray = JsonValue[]

export class JsonPointerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JsonPointerError'
  }
}

export function decodePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~')
}

export function encodePointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1')
}

export function parsePointer(pointer: string): string[] {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) {
    throw new JsonPointerError(`JSON Pointer 必须以 "/" 开头，收到: ${JSON.stringify(pointer)}`)
  }
  return pointer.slice(1).split('/').map(decodePointerToken)
}

// ── 读取 ──────────────────────────────────────────────────────────────────────

export type ResolveResult = { ok: true; value: JsonValue } | { ok: false; reason: string }

export function resolvePointer(doc: JsonValue, pointer: string): ResolveResult {
  let tokens: string[]
  try {
    tokens = parsePointer(pointer)
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }

  let current: JsonValue = doc
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === undefined) return { ok: false, reason: '内部错误：JSON Pointer 段不存在' }

    if (Array.isArray(current)) {
      const idx = arrayIndex(token, current.length)
      if (idx === null) return { ok: false, reason: `[${buildPointer(tokens, i + 1)}] 数组索引无效 "${token}"，长度 ${current.length}` }
      const next = current[idx]
      if (next === undefined) return { ok: false, reason: `[${buildPointer(tokens, i + 1)}] 数组索引 "${token}" 不存在` }
      current = next
    } else if (current !== null && typeof current === 'object') {
      if (!Object.prototype.hasOwnProperty.call(current, token)) {
        return { ok: false, reason: `[${buildPointer(tokens, i + 1)}] key "${token}" 不存在` }
      }
      const next = current[token]
      if (next === undefined) return { ok: false, reason: `[${buildPointer(tokens, i + 1)}] key "${token}" 不存在` }
      current = next
    } else {
      return { ok: false, reason: `[${buildPointer(tokens, i + 1)}] 父节点为标量值，无法继续导航` }
    }
  }
  return { ok: true, value: current }
}

// ── 写入（不可变，返回新 doc）────────────────────────────────────────────────

export type MutateResult = { ok: true; doc: JsonValue } | { ok: false; reason: string }

export function setAtPointer(doc: JsonValue, pointer: string, value: JsonValue): MutateResult {
  let tokens: string[]
  try {
    tokens = parsePointer(pointer)
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
  if (tokens.length === 0) return { ok: true, doc: clone(value) }
  return setRec(doc, tokens, 0, value)
}

function setRec(node: JsonValue, tokens: string[], depth: number, value: JsonValue): MutateResult {
  const token = tokens[depth]
  if (token === undefined) return { ok: false, reason: '内部错误：JSON Pointer 段不存在' }

  const isLast = depth === tokens.length - 1

  if (Array.isArray(node)) {
    const copy = [...node] as JsonArray
    const maxIdx = isLast ? copy.length + 1 : copy.length
    const idx = isLast && token === '-' ? copy.length : arrayIndex(token, maxIdx)
    if (idx === null) return { ok: false, reason: `数组索引无效 "${token}"，长度 ${copy.length}` }
    if (isLast) {
      copy[idx] = clone(value)
    } else {
      const r = setRec((copy[idx] ?? null) as JsonValue, tokens, depth + 1, value)
      if (!r.ok) return r
      copy[idx] = r.doc
    }
    return { ok: true, doc: copy }
  }

  if (node !== null && typeof node === 'object') {
    const copy = { ...node } as JsonObject
    if (isLast) {
      copy[token] = clone(value)
    } else {
      const r = setRec((copy[token] ?? null) as JsonValue, tokens, depth + 1, value)
      if (!r.ok) return r
      copy[token] = r.doc
    }
    return { ok: true, doc: copy }
  }

  if (!isLast) {
    return { ok: false, reason: `[${buildPointer(tokens, depth + 1)}] 父节点为标量值，无法深入设置子路径` }
  }
  return { ok: false, reason: '内部错误' }
}

export function deleteAtPointer(doc: JsonValue, pointer: string): MutateResult {
  let tokens: string[]
  try {
    tokens = parsePointer(pointer)
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
  if (tokens.length === 0) return { ok: false, reason: '不能删除文档根' }
  return deleteRec(doc, tokens, 0)
}

function deleteRec(node: JsonValue, tokens: string[], depth: number): MutateResult {
  const token = tokens[depth]
  if (token === undefined) return { ok: false, reason: '内部错误：JSON Pointer 段不存在' }

  const isLast = depth === tokens.length - 1

  if (Array.isArray(node)) {
    const copy = [...node] as JsonArray
    const idx = arrayIndex(token, copy.length)
    if (idx === null) return { ok: false, reason: `数组索引无效 "${token}"，长度 ${copy.length}` }
    if (isLast) { copy.splice(idx, 1) }
    else {
      const r = deleteRec(copy[idx] as JsonValue, tokens, depth + 1)
      if (!r.ok) return r
      copy[idx] = r.doc
    }
    return { ok: true, doc: copy }
  }

  if (node !== null && typeof node === 'object') {
    const copy = { ...node } as JsonObject
    if (!Object.prototype.hasOwnProperty.call(copy, token)) {
      return { ok: false, reason: `key "${token}" 不存在` }
    }
    if (isLast) {
      return { ok: true, doc: omitObjectKey(copy, token) }
    }
    else {
      const r = deleteRec((copy[token] ?? null) as JsonValue, tokens, depth + 1)
      if (!r.ok) return r
      copy[token] = r.doc
    }
    return { ok: true, doc: copy }
  }

  return { ok: false, reason: `父节点为标量值` }
}

export function appendAtPointer(doc: JsonValue, arrayPointer: string, element: JsonValue): MutateResult {
  const resolved = resolvePointer(doc, arrayPointer)
  if (!resolved.ok) return { ok: false, reason: `目标路径不存在：${resolved.reason}` }
  if (!Array.isArray(resolved.value)) {
    return { ok: false, reason: `"${arrayPointer}" 不是数组（类型：${typeLabel(resolved.value)}）` }
  }
  return setAtPointer(doc, arrayPointer === '' ? '/-' : `${arrayPointer}/-`, element)
}

// ── 列出子节点 ────────────────────────────────────────────────────────────────

export interface ListEntry {
  key: string
  pointer: string
  type: string
  preview: string
}

export type ListResult = { ok: true; entries: ListEntry[] } | { ok: false; reason: string }

export function listAtPointer(doc: JsonValue, pointer: string): ListResult {
  const resolved = resolvePointer(doc, pointer)
  if (!resolved.ok) return { ok: false, reason: resolved.reason }
  const node = resolved.value
  const base = pointer

  if (Array.isArray(node)) {
    return {
      ok: true,
      entries: node.map((item, i) => ({
        key: String(i),
        pointer: `${base}/${i}`,
        type: typeLabel(item),
        preview: previewValue(item),
      })),
    }
  }

  if (node !== null && typeof node === 'object') {
    return {
      ok: true,
      entries: Object.entries(node).map(([k, v]) => {
        return {
          key: k,
          pointer: `${base}/${encodePointerToken(k)}`,
          type: typeLabel(v),
          preview: previewValue(v),
        }
      }),
    }
  }

  return { ok: false, reason: `"${pointer}" 处为标量值（${typeLabel(node)}），无子节点` }
}

// ── 内部辅助 ──────────────────────────────────────────────────────────────────

function arrayIndex(token: string, maxLen: number): number | null {
  if (!/^\d+$/.test(token)) return null
  const n = Number(token)
  return n >= 0 && n < maxLen ? n : null
}

function buildPointer(tokens: string[], count: number): string {
  return `/${tokens.slice(0, count).map(encodePointerToken).join('/')}`
}

export function typeLabel(v: JsonValue): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `array[${v.length}]`
  if (typeof v === 'object') return `object{${Object.keys(v).length}}`
  return typeof v
}

function previewValue(v: JsonValue): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `[…${v.length} items]`
  if (typeof v === 'object') {
    const keys = Object.keys(v).slice(0, 3)
    return `{${keys.join(', ')}${Object.keys(v).length > 3 ? ', …' : ''}}`
  }
  const s = String(v)
  return s.length > 60 ? `${s.slice(0, 60)}…` : s
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function omitObjectKey(object: JsonObject, key: string): JsonObject {
  return Object.fromEntries(Object.entries(object).filter(([entryKey]) => entryKey !== key)) as JsonObject
}
