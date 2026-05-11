/**
 * Parameter Schema（单一事实源）
 *
 * 职责
 * ────
 * 把函数 `paramsSchema` 的四种写法（叶子字符串 / 显式 DSL / 简写对象 / unknown）
 * 收敛到唯一的归一化层与叶子描述解析层；
 * 参数校验器与 FC 函数描述生成器共享本模块。
 *
 * 设计约束
 * ────────
 * 1. 这里只做 **结构归一化** 与 **描述字符串解析**，不做任何领域级语义校验。
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

/** 归一化前可接受的参数 schema 节点写法。 */
export type LlmParameterSchemaNode =
  | LlmParamObjectSchema
  | LlmParamArraySchema
  | LlmParamEnumSchema
  | string
  | Record<string, unknown>

/** 函数 paramsSchema / 参数 payload guide 共用的根 schema。 */
export type LlmParameterSchemaRoot = Record<string, unknown>

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

/** 叶子描述到基础类型的推断规则，按数组、对象、字符串、数字、布尔的顺序匹配。 */
export type KindRule = {
  kind: Exclude<LeafKind, 'unknown'>
  predicate: (normalized: string) => boolean
}

/** primitive 数组元素类型的推断规则，例如 string[] / number[] / boolean[]。 */
export type ArrayItemKindRule = {
  itemKind: ArrayItemKind
  predicate: (normalized: string) => boolean
}

/**
 * 参数 schema 归一化与叶子描述解析工具。
 *
 * 调用时序：
 * 1. `normalizeSchemaNode` 把简写对象、显式 DSL、叶子字符串统一成可判别节点。
 * 2. `isObjectSchema` / `isArraySchema` / `isEnumSchema` 帮调用方选择递归分支。
 * 3. `parseLeafDescription` 从描述字符串中提取期望类型、nullable、optional 等信号。
 */
export class LlmParameterSchema {
  /** `<keyName>` 形式代表动态键名，其值统一套用对应 schema。 */
  static readonly WILDCARD_KEY_PATTERN = /^<.+>$/u

  /** 从叶子描述中推断基础类型的规则表；顺序稳定，避免校验输出抖动。 */
  static readonly EXPECTED_KIND_RULES: readonly KindRule[] = [
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

  /** 从数组描述中推断 primitive 元素类型的规则表。 */
  static readonly ARRAY_ITEM_KIND_RULES: readonly ArrayItemKindRule[] = [
    { itemKind: 'string', predicate: normalized => normalized.includes('string[]') },
    { itemKind: 'number', predicate: normalized => normalized.includes('number[]') },
    { itemKind: 'boolean', predicate: normalized => normalized.includes('boolean[]') },
  ]

  private constructor() {}

  /** 判断值是否为普通对象；数组、null 都不算对象 schema。 */
  static isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  /** 判断节点是否为显式 object schema。 */
  static isObjectSchema(value: unknown): value is LlmParamObjectSchema {
    return LlmParameterSchema.isPlainRecord(value) && value['kind'] === 'object'
  }

  /** 判断节点是否为显式 array schema。 */
  static isArraySchema(value: unknown): value is LlmParamArraySchema {
    return LlmParameterSchema.isPlainRecord(value) && value['kind'] === 'array'
  }

  /** 判断节点是否为显式 enum schema。 */
  static isEnumSchema(value: unknown): value is LlmParamEnumSchema {
    return LlmParameterSchema.isPlainRecord(value) && value['kind'] === 'enum' && Array.isArray(value['enum'])
  }

  /** 判断字段名是否为动态键占位符。 */
  static isWildcardKey(key: string): boolean {
    return LlmParameterSchema.WILDCARD_KEY_PATTERN.test(key)
  }

  /**
   * 将任意 schema 写法归一成 validator 可消费的判别联合节点。
   *
   * 返回类型已收窄为 `LlmParamObjectSchema | LlmParamArraySchema | LlmParamEnumSchema | string`，
   * 调用方无需再重复类型守卫；exhaustive switch/if-chain 可依赖此类型。
   */
  static normalizeSchemaNode(
    schema: unknown,
  ): LlmParamObjectSchema | LlmParamArraySchema | LlmParamEnumSchema | string {
    if (typeof schema === 'string') return schema
    if (
      LlmParameterSchema.isObjectSchema(schema)
      || LlmParameterSchema.isArraySchema(schema)
      || LlmParameterSchema.isEnumSchema(schema)
    ) {
      return schema
    }
    if (LlmParameterSchema.isPlainRecord(schema)) {
      return {
        kind: 'object',
        properties: schema,
      } satisfies LlmParamObjectSchema
    }
    return 'unknown'
  }

  /** 解析叶子描述字符串，提取类型、可空、可选和数组元素类型等提示。 */
  static parseLeafDescription(raw: string): ParsedLeafDescription {
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

    for (const rule of LlmParameterSchema.EXPECTED_KIND_RULES) {
      if (rule.predicate(normalized)) expectedKinds.add(rule.kind)
    }

    const arrayItemKind = expectedKinds.has('array')
      ? LlmParameterSchema.ARRAY_ITEM_KIND_RULES.find(rule => rule.predicate(normalized))?.itemKind
      : undefined

    return {
      raw,
      ...(description !== undefined ? { description } : {}),
      expectedKinds,
      ...(arrayItemKind !== undefined ? { arrayItemKind } : {}),
      allowsNull,
      optional,
    }
  }
}
