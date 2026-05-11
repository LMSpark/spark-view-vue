/**
 * 通用 LLM 参数校验器（llm-params-validator）
 *
 * 职责
 * ────
 * 对 LLM 回传的 JSON 参数（协议块反序列化后）做结构一致性校验。
 * 输出是 fail-fast 的结构化问题列表，供函数运行时或更上层 adapter
 * 决定如何向 LLM 反馈并触发修复重试。
 *
 * 设计约束
 * ────────
 * 1. 叶子 schema 是"面向 LLM 的可读描述字符串"，而非完整类型系统。
 *    校验采用保守启发式，只拦明显错误，不过度解释描述文本。
 * 2. 对象/数组/枚举的参数 schema 与归一化逻辑统一在 `./parameter-schema` 维护，
 *    本模块只消费它们，不再重复声明类型守卫与规则表。
 * 3. 通配键（<keyName>）和 additionalProperties 用于"键名动态、值类型固定"场景。
 * 4. 校验结果按 path 定位问题，方便 LLM 定点修复，而非整体拒绝。
 *
 * 模块分区
 * ────────
 *  一、公共类型定义           — 对外导出的 schema 与结果接口
 *  二、内部类型与规则常量      — 模块私有的推断规则与上下文类型
 *  三、叶子规则推断与基础值校验  — 描述型叶子到类型期望的映射
 *  四、对象/数组节点校验        — 递归主逻辑（含通配键、additionalProperties）
 *  五、入口辅助               — root 层必填合并与 oneOf 检查
 *  六、对外入口与输出格式化    — 公开 API 函数
 */

import {
  LlmParameterSchema,
  type ArrayItemKind,
  type LlmParamArraySchema,
  type LlmParamEnumSchema,
  type LlmParamObjectSchema,
} from './parameter-schema'

// =========================================================
// 一、公共类型定义（对外可见）
// =========================================================

export type {
  LlmParamObjectSchema,
  LlmParamArraySchema,
  LlmParamEnumSchema,
} from './parameter-schema'

/**
 * 单条校验问题。
 *
 * - path   : 出错字段的 JSON 路径；`$` 为根，`.field` / `[index]` 表示层级。
 * - message: 人类可读的中文问题描述，直接返回给 LLM 作为定点修复提示。
 */
export interface LlmParamValidationIssue {
  path: string
  message: string
}


/**
 * 校验结果。
 *
 * - ok     : true 表示无问题，false 表示有一条或多条结构问题。
 * - issues : 结构问题列表；`ok === true` 时保证为空数组。
 */
export interface LlmParamValidationResult {
  readonly ok: boolean
  readonly issues: readonly LlmParamValidationIssue[]
}

/**
 * 校验入口调用选项，允许调用方在不修改函数 schema 的前提下叠加约束。
 */
export interface LlmParamValidationOptions {
  /**
   * 额外必填字段键名列表，在 schema 的 required 基础上追加。
   */
  requiredKeys?: readonly string[]
  /**
   * “至少满足其中一组”的字段组约束，每组是一批字段名。
   */
  oneOfRequiredKeyGroups?: ReadonlyArray<readonly string[]>
}

/**
 * 对象层校验上下文，跨层传递不可变的策略参数。
 */
type ValidationContext = {
  /** 当前对象层是否允许存在未声明字段。 */
  allowUnknownKeys: boolean
}

/** primitive 类型的三元联合，用于固定迭代顺序避免输出抖动。 */
type PrimitiveKind = ArrayItemKind

export class LlmParamsValidator {
  /** 嵌套对象默认不允许未知字段；根层通过入口统一传入该策略。 */
  private static readonly NESTED_CONTEXT: ValidationContext = { allowUnknownKeys: false }

  /** 叶子描述中出现这些提示时，字段存在本身就是错误。 */
  private static readonly OMITTED_FIELD_HINTS = ['应省略', '不要传函数'] as const

  /** primitive 数组元素类型不匹配时的中文提示表。 */
  private static readonly ARRAY_ITEM_KIND_MISMATCH_MESSAGE: Readonly<Record<PrimitiveKind, string>> = {
    string: '应为字符串',
    number: '应为数字',
    boolean: '应为布尔值',
  }

  /** primitive 类型检查顺序固定，保证错误文案可预测。 */
  private static readonly PRIMITIVE_KIND_ORDER: readonly PrimitiveKind[] = ['string', 'number', 'boolean']

  /** primitive 类型到运行时检查函数的映射。 */
  private static readonly PRIMITIVE_KIND_CHECKERS: Readonly<Record<PrimitiveKind, (value: unknown) => boolean>> = {
    string: value => typeof value === 'string',
    number: value => typeof value === 'number',
    boolean: value => typeof value === 'boolean',
  }

  private constructor() {}

  /** 生成缺少顶层参数的统一提示，供注册方工具复用。 */
  static missingParam(name: string): string {
    return `缺少 ${name} 参数`
  }

  /** 判断值是否为非空字符串；常用于 adapter 解析模型输出后的快速检查。 */
  static isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0
  }

  /**
   * 校验 LLM 反序列化后的 JSON 参数。
   *
   * 调用时序：
   * 1. 先确认 params 是对象，避免数组或 primitive 进入函数调用。
   * 2. 将 schema 根节点归一成 object schema。
   * 3. 合并调用方额外 requiredKeys 后递归校验对象树。
   * 4. 最后校验 oneOfRequiredKeyGroups 这种跨字段约束。
   */
  static validateLlmDeserializedParams(
    params: unknown,
    schema: Record<string, unknown>,
    options: LlmParamValidationOptions = {},
  ): LlmParamValidationResult {
    const issues: LlmParamValidationIssue[] = []
    if (!LlmParameterSchema.isPlainRecord(params)) {
      return {
        ok: false,
        issues: [{ path: '$', message: '参数必须是 JSON 对象' }],
      }
    }

    const rootSchema = LlmParameterSchema.normalizeSchemaNode(schema)
    if (!LlmParameterSchema.isObjectSchema(rootSchema)) {
      return {
        ok: false,
        issues: [{ path: '$', message: 'schema 根节点必须是对象' }],
      }
    }

    const mergedRootSchema: LlmParamObjectSchema = {
      ...rootSchema,
      required: [
        ...(rootSchema.required ?? []),
        ...(options.requiredKeys ?? []),
      ],
    }

    LlmParamsValidator.validateObjectSchema(
      params,
      mergedRootSchema,
      '$',
      issues,
      LlmParamsValidator.NESTED_CONTEXT,
    )
    LlmParamsValidator.validateOneOfRequiredGroups(params, options.oneOfRequiredKeyGroups ?? [], issues)

    return {
      ok: issues.length === 0,
      issues,
    }
  }

  /** 把问题列表压缩成一段适合直接反馈给 LLM 的中文修复提示。 */
  static formatLlmParamValidationIssues(
    issues: readonly LlmParamValidationIssue[],
    maxCount = 5,
  ): string {
    if (issues.length === 0) return '参数校验通过'
    const head = issues.slice(0, maxCount).map(issue => `${issue.path} ${issue.message}`)
    const suffix = issues.length > maxCount ? `；另有 ${issues.length - maxCount} 个问题` : ''
    return `参数校验失败：${head.join('；')}${suffix}`
  }

  /** 统一追加问题，集中维护 path/message 结构。 */
  private static pushIssue(issues: LlmParamValidationIssue[], path: string, message: string): void {
    issues.push({ path, message })
  }

  /** 校验 primitive 数组元素，逐个元素给出精确 path。 */
  private static validatePrimitiveArrayItems(
    value: unknown[],
    itemKind: PrimitiveKind,
    path: string,
    issues: LlmParamValidationIssue[],
  ): void {
    const mismatchMessage = LlmParamsValidator.ARRAY_ITEM_KIND_MISMATCH_MESSAGE[itemKind]
    for (const [index, item] of value.entries()) {
      if (typeof item !== itemKind) {
        LlmParamsValidator.pushIssue(issues, `${path}[${index}]`, mismatchMessage)
      }
    }
  }

  /**
   * 校验叶子描述 schema。
   *
   * 叶子 schema 是给 LLM 看的描述字符串，本方法只做保守推断：
   * 能明确识别 string/number/boolean/array/object 时才做类型拦截，
   * 识别不到则返回“schema 描述缺少可识别类型”，提醒维护者补充说明。
   */
  private static validateLeafSchema(
    value: unknown,
    description: string,
    path: string,
    issues: LlmParamValidationIssue[],
  ): void {
    if (LlmParamsValidator.OMITTED_FIELD_HINTS.some(hint => description.includes(hint))) {
      if (value !== undefined) {
        LlmParamsValidator.pushIssue(issues, path, '该字段在 LLM 参数中应省略')
      }
      return
    }

    const parsed = LlmParameterSchema.parseLeafDescription(description)

    if (value === null) {
      if (parsed.allowsNull) return
      LlmParamsValidator.pushIssue(issues, path, '不能为 null')
      return
    }

    const expected = parsed.expectedKinds
    if (expected.has('unknown')) return

    if (expected.size === 0) {
      LlmParamsValidator.pushIssue(
        issues,
        path,
        'schema 描述缺少可识别类型，请显式标注 string/number/boolean/array/object 或 unknown',
      )
      return
    }

    if (expected.has('array')) {
      if (!Array.isArray(value)) {
        LlmParamsValidator.pushIssue(issues, path, '应为数组')
        return
      }
      if (parsed.arrayItemKind !== undefined) {
        LlmParamsValidator.validatePrimitiveArrayItems(value, parsed.arrayItemKind, path, issues)
      }
      return
    }

    if (expected.has('object')) {
      if (!LlmParameterSchema.isPlainRecord(value)) {
        LlmParamsValidator.pushIssue(issues, path, '应为对象')
      }
      return
    }

    const matchedPrimitive = LlmParamsValidator.PRIMITIVE_KIND_ORDER.some(
      kind => expected.has(kind) && LlmParamsValidator.PRIMITIVE_KIND_CHECKERS[kind](value),
    )
    if (matchedPrimitive) return

    const expectedPrimitiveKinds = LlmParamsValidator.PRIMITIVE_KIND_ORDER.filter(kind => expected.has(kind))
    if (expectedPrimitiveKinds.length > 0) {
      LlmParamsValidator.pushIssue(issues, path, `类型不匹配，期望 ${expectedPrimitiveKinds.join(' | ')}`)
    }
  }

  /** 校验 enum 节点，支持 nullable、number/string 类型和 openEnded 软枚举。 */
  private static validateEnumSchema(
    value: unknown,
    schema: LlmParamEnumSchema,
    path: string,
    issues: LlmParamValidationIssue[],
  ): void {
    if (value === null) {
      if (schema.nullable === true) return
      LlmParamsValidator.pushIssue(issues, path, '不能为 null')
      return
    }

    const expectedType = schema.type ?? 'string'
    if (expectedType === 'number') {
      if (typeof value !== 'number') {
        LlmParamsValidator.pushIssue(issues, path, '应为数字')
        return
      }
    } else if (typeof value !== 'string') {
      LlmParamsValidator.pushIssue(issues, path, '应为字符串')
      return
    }

    if (schema.openEnded === true || schema.enum.length === 0) {
      return
    }

    if (!schema.enum.includes(value)) {
      const allowedValues = schema.enum.map(item => JSON.stringify(item)).join(' | ')
      LlmParamsValidator.pushIssue(issues, path, `必须是以下枚举之一: ${allowedValues}`)
    }
  }

  /**
   * 校验 object 节点。
   *
   * 顺序安排：
   * 1. 先检查对象本身和 required 字段。
   * 2. 再递归检查显式 properties 与 optional。
   * 3. 最后处理未知字段：优先通配键，其次 additionalProperties，再决定是否报错。
   */
  private static validateObjectSchema(
    value: unknown,
    schema: LlmParamObjectSchema,
    path: string,
    issues: LlmParamValidationIssue[],
    context: ValidationContext,
  ): void {
    if (!LlmParameterSchema.isPlainRecord(value)) {
      LlmParamsValidator.pushIssue(issues, path, '应为对象')
      return
    }

    const properties = schema.properties ?? {}
    const optional = schema.optional ?? {}
    const explicitPropertyKeys = new Set([
      ...Object.keys(properties).filter(key => !LlmParameterSchema.isWildcardKey(key)),
      ...Object.keys(optional).filter(key => !LlmParameterSchema.isWildcardKey(key)),
    ])
    const wildcardSchemas = [
      ...Object.entries(properties)
        .filter(([key]) => LlmParameterSchema.isWildcardKey(key))
        .map(([, childSchema]) => childSchema),
      ...Object.entries(optional)
        .filter(([key]) => LlmParameterSchema.isWildcardKey(key))
        .map(([, childSchema]) => childSchema),
    ]

    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        LlmParamsValidator.pushIssue(issues, `${path}.${key}`, '缺少必填字段')
      }
    }

    for (const [key, childSchema] of Object.entries(properties)) {
      if (LlmParameterSchema.isWildcardKey(key) || !(key in value)) continue
      LlmParamsValidator.validateSchemaNode(
        value[key],
        childSchema,
        `${path}.${key}`,
        issues,
        LlmParamsValidator.NESTED_CONTEXT,
      )
    }
    for (const [key, childSchema] of Object.entries(optional)) {
      if (LlmParameterSchema.isWildcardKey(key) || !(key in value)) continue
      LlmParamsValidator.validateSchemaNode(
        value[key],
        childSchema,
        `${path}.${key}`,
        issues,
        LlmParamsValidator.NESTED_CONTEXT,
      )
    }

    for (const [key, childValue] of Object.entries(value)) {
      if (explicitPropertyKeys.has(key)) continue
      const childPath = `${path}.${key}`

      if (wildcardSchemas.length > 0) {
        LlmParamsValidator.validateSchemaNode(
          childValue,
          wildcardSchemas[0],
          childPath,
          issues,
          LlmParamsValidator.NESTED_CONTEXT,
        )
        continue
      }

      if (schema.additionalProperties !== undefined) {
        LlmParamsValidator.validateSchemaNode(
          childValue,
          schema.additionalProperties,
          childPath,
          issues,
          LlmParamsValidator.NESTED_CONTEXT,
        )
        continue
      }

      if (!context.allowUnknownKeys) {
        LlmParamsValidator.pushIssue(issues, childPath, '未声明的字段')
      }
    }
  }

  /** 校验 array 节点；声明 items 时逐项递归，否则只检查数组外形。 */
  private static validateArraySchema(
    value: unknown,
    schema: LlmParamArraySchema,
    path: string,
    issues: LlmParamValidationIssue[],
  ): void {
    if (!Array.isArray(value)) {
      LlmParamsValidator.pushIssue(issues, path, '应为数组')
      return
    }
    if (schema.items === undefined) return

    for (const [index, item] of value.entries()) {
      LlmParamsValidator.validateSchemaNode(
        item,
        schema.items,
        `${path}[${index}]`,
        issues,
        LlmParamsValidator.NESTED_CONTEXT,
      )
    }
  }

  /** 根据归一化后的 schema kind 分派到叶子、枚举、对象或数组校验分支。 */
  private static validateSchemaNode(
    value: unknown,
    schema: unknown,
    path: string,
    issues: LlmParamValidationIssue[],
    context: ValidationContext,
  ): void {
    const normalized = LlmParameterSchema.normalizeSchemaNode(schema)
    if (typeof normalized === 'string') {
      LlmParamsValidator.validateLeafSchema(value, normalized, path, issues)
    } else if (LlmParameterSchema.isEnumSchema(normalized)) {
      LlmParamsValidator.validateEnumSchema(value, normalized, path, issues)
    } else if (LlmParameterSchema.isObjectSchema(normalized)) {
      LlmParamsValidator.validateObjectSchema(value, normalized, path, issues, context)
    } else if (LlmParameterSchema.isArraySchema(normalized)) {
      LlmParamsValidator.validateArraySchema(value, normalized, path, issues)
    } else {
      LlmParamsValidator.assertNeverSchemaKind(normalized)
    }
  }

  /**
   * 穷举性保护：当 normalizeSchemaNode 返回类型扩展时，TypeScript 编译器
   * 会在此处报错，强制维护者补充新分支——"不可达"比"静默忽略"更安全。
   */
  private static assertNeverSchemaKind(_n: never): void {}

  /** 校验“至少满足一组必填字段”的跨字段约束。 */
  private static validateOneOfRequiredGroups(
    params: Record<string, unknown>,
    groups: ReadonlyArray<readonly string[]>,
    issues: LlmParamValidationIssue[],
  ): void {
    if (groups.length === 0) return
    const hasSatisfiedGroup = groups.some(group => group.every(key => key in params))
    if (hasSatisfiedGroup) return

    const groupsText = groups.map(group => `[${group.join(', ')}]`).join(' 或 ')
    LlmParamsValidator.pushIssue(issues, '$', `以下字段至少满足一组: ${groupsText}`)
  }
}
