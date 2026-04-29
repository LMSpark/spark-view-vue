/**
 * Schema IR (单一事实源)
 *
 * 职责
 * ────
 * 把 still `paramsSchema` 的四种写法（叶子字符串 / 显式 DSL / 简写对象 / unknown）
 * 收敛到唯一的归一化层与叶子描述解析层；
 * 校验器（llm-params-validator）与 FC 工具描述生成器（fc-schema）共享本模块。
 *
 * 设计约束
 * ────────
 * 1. 这里只做 **结构归一化** 与 **描述字符串解析**，不做任何业务级语义校验。
 * 2. 输出必须保持 fail-fast：找不到类型的描述返回空 `expectedKinds`，
 *    具体如何报错由调用方决定。
 * 3. 不依赖 Vue / 其他 UI 框架，仅依赖纯 TS。
 */

// =========================================================
// 一、对外类型定义
// =========================================================

/**
 * 显式对象 schema 节点。
 *
 * - required            : 必传字段名列表，不在列表中的字段皆视为可选。
 * - properties          : 必传字段的 schema 定义（key → schema）。
 * - optional            : 可选字段的 schema 定义；值存在时才递归校验，不存在不报错。
 * - additionalProperties: 声明范围外的额外字段统一走此 schema 递归校验；
 *                         设置时未声明字段合法，不设置且层不允许未知键时报错。
 * - note                : 附加说明文本，仅供 LLM 参考，不参与校验逻辑。
 */
export interface LlmParamObjectSchema {
  kind: 'object'
  required?: readonly string[]
  properties?: Record<string, unknown>
  optional?: Record<string, unknown>
  additionalProperties?: unknown
  note?: string
}

/**
 * 显式数组 schema 节点。
 *
 * - items: 数组元素的统一 schema；若省略则只校验是否为数组，不校验元素内容。
 * - note : 附加说明文本，不参与校验逻辑。
 */
export interface LlmParamArraySchema {
  kind: 'array'
  items?: unknown
  note?: string
}

/**
 * 开放枚举 schema 节点。
 *
 * - enum     : 推荐值字典；当 openEnded = false 时同时作为硬校验集合。
 * - type     : 基础类型，当前常用 string，也可扩展到 number。
 * - nullable : 是否允许传 null。
 * - openEnded: 是否允许传入 enum 之外的同类型自定义值。
 * - optional : 是否在父对象层视为可选（仅给上层 mapper 看，validator 不读）。
 * - note     : 附加说明文本，仅供 LLM 参考，不参与校验逻辑。
 */
export interface LlmParamEnumSchema {
  kind: 'enum'
  enum: ReadonlyArray<string | number>
  type?: 'string' | 'number'
  nullable?: boolean
  optional?: boolean
  openEnded?: boolean
  note?: string
}

/** 叶子描述能推断出的所有基础类型，包含特殊值 'unknown'。 */
export type LeafKind = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'unknown'

/** primitive 数组场景下的元素类型。 */
export type ArrayItemKind = 'string' | 'number' | 'boolean'

/**
 * 叶子描述字符串解析结果。
 *
 * - raw           : 原始描述字符串（未做任何变换）。
 * - description   : "—" 之后的人类描述；不存在分隔符时为 undefined。
 * - expectedKinds : 描述命中的所有期望基础类型；空集合表示描述不合法。
 * - arrayItemKind : primitive 数组元素类型；非 primitive 数组返回 undefined。
 * - allowsNull    : 是否允许传 null（描述包含 null 或 undefined）。
 * - optional      : 是否在父 object 层视为可选（描述以 `?` 结尾或包含 undefined）。
 */
export interface ParsedLeafDescription {
  raw: string
  description?: string
  expectedKinds: ReadonlySet<LeafKind>
  arrayItemKind?: ArrayItemKind
  allowsNull: boolean
  optional: boolean
}

// =========================================================
// 二、规则常量（共享导出）
// =========================================================

/** 通配键正则：匹配 <任意字符> 形式的 schema 键，如 <customViewId>。 */
export const WILDCARD_KEY_PATTERN = /^<.+>$/u

/** 期望类型推断结果集合元素类型。 */
export type ExpectedKind = LeafKind

export type KindRule = {
  kind: Exclude<LeafKind, 'unknown'>
  predicate: (normalized: string) => boolean
}

/**
 * 描述 → 期望类型的推断规则表。
 *
 * 规则按优先级排列：array / object 在前，防止后续 primitive 分支误判。
 * 规则之间不互斥，一条描述可同时命中多条（如 string|number 混合描述）。
 */
export const EXPECTED_KIND_RULES: readonly KindRule[] = [
  {
    kind: 'array',
    predicate: normalized => normalized.includes('[]') || normalized.includes('array<'),
  },
  {
    kind: 'object',
    predicate: normalized =>
      normalized.includes('record<')
      || normalized.includes('对象')
      || normalized.includes('filterexpression')
      || normalized.startsWith('{'),
  },
  {
    kind: 'string',
    predicate: normalized => normalized.includes('string') || normalized.includes('"'),
  },
  {
    kind: 'number',
    predicate: normalized => normalized.includes('number'),
  },
  {
    kind: 'boolean',
    predicate: normalized => normalized.includes('boolean'),
  },
]

export type ArrayItemKindRule = {
  itemKind: ArrayItemKind
  predicate: (normalized: string) => boolean
}

export const ARRAY_ITEM_KIND_RULES: readonly ArrayItemKindRule[] = [
  { itemKind: 'string', predicate: normalized => normalized.includes('string[]') },
  { itemKind: 'number', predicate: normalized => normalized.includes('number[]') },
  { itemKind: 'boolean', predicate: normalized => normalized.includes('boolean[]') },
]

// =========================================================
// 三、类型守卫与归一化
// =========================================================

/** 类型守卫：值是否为普通对象（非 null、非数组）。 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 类型守卫：值是否为显式对象 schema 节点（kind === 'object'）。 */
export function isObjectSchema(value: unknown): value is LlmParamObjectSchema {
  return isPlainRecord(value) && value['kind'] === 'object'
}

/** 类型守卫：值是否为显式数组 schema 节点（kind === 'array'）。 */
export function isArraySchema(value: unknown): value is LlmParamArraySchema {
  return isPlainRecord(value) && value['kind'] === 'array'
}

/** 类型守卫：值是否为显式开放枚举 schema 节点（kind === 'enum'）。 */
export function isEnumSchema(value: unknown): value is LlmParamEnumSchema {
  return isPlainRecord(value) && value['kind'] === 'enum' && Array.isArray(value['enum'])
}

/** 判断 schema 键名是否为通配键（<keyName> 形式）。 */
export function isWildcardKey(key: string): boolean {
  return WILDCARD_KEY_PATTERN.test(key)
}

/**
 * 将任意 schema 节点归一化为标准形态。
 *
 * 支持四种当前 schema 写法：
 *  1. 叶子字符串：直接返回，表示"面向 LLM 的描述字符串"，由叶子解析器处理。
 *  2. 显式 DSL：{ kind: 'object' | 'array' | 'enum', ... } 直接返回，不再包装。
 *  3. 简写对象：{ fieldA: 'desc', ... } → 自动提升为 object schema（properties = 原对象）。
 *  4. 其他（null / 数字等无法识别的值）：返回 'unknown'，调用方按需放行或报错。
 */
export function normalizeSchemaNode(schema: unknown): unknown {
  if (typeof schema === 'string') return schema
  if (isObjectSchema(schema) || isArraySchema(schema) || isEnumSchema(schema)) return schema
  if (isPlainRecord(schema)) {
    return {
      kind: 'object',
      properties: schema,
    } satisfies LlmParamObjectSchema
  }
  return 'unknown'
}

// =========================================================
// 四、叶子描述解析
// =========================================================

/**
 * 解析叶子描述字符串。
 *
 * 解析步骤：
 *  1. 拆分 `typePart — descPart`，descPart 可能为空。
 *  2. 由 typePart 推断 optional（`?` 结尾或含 undefined）。
 *  3. 由整串 lower-case 文本推断 allowsNull / expectedKinds / arrayItemKind。
 *  4. 含 'unknown' 时短路：仅返回 unknown 期望，调用方放行。
 *
 * 严格模式：未命中任何规则时 `expectedKinds` 为空集合，
 * 由调用方按"schema 描述不合法"报错或降级处理；不在此处兜底。
 */
export function parseLeafDescription(raw: string): ParsedLeafDescription {
  const dashIdx = raw.indexOf('—')
  const typePart = (dashIdx > 0 ? raw.slice(0, dashIdx) : raw).trim()
  const description = dashIdx > 0 ? raw.slice(dashIdx + 1).trim() : undefined
  const normalized = raw.toLowerCase()

  const optional = typePart.endsWith('?') || normalized.includes('undefined')
  const allowsNull = normalized.includes('null') || normalized.includes('undefined')
  const expectedKinds = new Set<LeafKind>()

  if (normalized.includes('unknown')) {
    expectedKinds.add('unknown')
    return {
      raw,
      ...(description !== undefined ? { description } : {}),
      expectedKinds,
      allowsNull,
      optional,
    }
  }

  for (const rule of EXPECTED_KIND_RULES) {
    if (rule.predicate(normalized)) expectedKinds.add(rule.kind)
  }

  let arrayItemKind: ArrayItemKind | undefined
  if (expectedKinds.has('array')) {
    arrayItemKind = ARRAY_ITEM_KIND_RULES.find(rule => rule.predicate(normalized))?.itemKind
  }

  return {
    raw,
    ...(description !== undefined ? { description } : {}),
    expectedKinds,
    ...(arrayItemKind !== undefined ? { arrayItemKind } : {}),
    allowsNull,
    optional,
  }
}
