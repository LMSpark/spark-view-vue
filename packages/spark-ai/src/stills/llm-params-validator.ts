/**
 * 通用 LLM 参数校验器。
 *
 * 输入是“协议块反序列化后的 JSON 参数”和 catalog 中的 schema DSL，
 * 输出是 fail-fast 的结构化问题列表，供 still runtime 或更上层 adapter 决定如何反馈给 LLM。
 */

// =========================================================
// 一、公共类型定义（对外可见）
// =========================================================

export interface LlmParamObjectSchema {
  kind: 'object'
  required?: readonly string[]
  properties?: Record<string, unknown>
  optional?: Record<string, unknown>
  additionalProperties?: unknown
  note?: string
}

export interface LlmParamArraySchema {
  kind: 'array'
  items?: unknown
  note?: string
}

export interface LlmParamValidationIssue {
  path: string
  message: string
}

export interface LlmParamValidationResult {
  ok: boolean
  issues: LlmParamValidationIssue[]
}

export interface LlmParamValidationOptions {
  requiredKeys?: readonly string[]
  oneOfRequiredKeyGroups?: ReadonlyArray<readonly string[]>
  allowUnknownRootKeys?: boolean
}

// =========================================================
// 二、内部类型与常量（模块私有）
// =========================================================

type ValidationContext = {
  /** 当前对象层是否允许未知键。 */
  allowUnknownKeys: boolean
}

type ExpectedKind = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'unknown'

type KindRule = {
  /** 规则说明（用于文档/注释与规则本体保持同源）。 */
  description: string
  /** 命中的推断类型。 */
  kind: Exclude<ExpectedKind, 'unknown'>
  /** 基于描述字符串判断当前规则是否命中。 */
  predicate: (normalized: string) => boolean
}

type ArrayItemKindRule = {
  /** 规则说明（用于快速定位触发来源）。 */
  description: string
  /** 目标元素类型。 */
  itemKind: 'string' | 'number' | 'boolean'
  /** 描述文本命中条件。 */
  predicate: (normalized: string) => boolean
}

type PrimitiveKind = 'string' | 'number' | 'boolean'

const WILDCARD_KEY_PATTERN = /^<.+>$/u
const NESTED_CONTEXT: ValidationContext = { allowUnknownKeys: false }
const STRING_FALLBACK_HINTS = ['typeresource', 'type', 'category', 'dependencytype'] as const
const OMITTED_FIELD_HINTS = ['应省略', '不要传函数'] as const

const EXPECTED_KIND_RULES: readonly KindRule[] = [
  {
    description: '命中数组特征（[] 或 array<...>）',
    kind: 'array',
    predicate: normalized => normalized.includes('[]') || normalized.includes('array<'),
  },
  {
    description: '命中对象特征（record / 对象 / FilterExpression / { 开头）',
    kind: 'object',
    predicate: normalized =>
      normalized.includes('record<')
      || normalized.includes('对象')
      || normalized.includes('filterexpression')
      || normalized.startsWith('{'),
  },
  {
    description: '命中字符串特征（string 或字面量引号）',
    kind: 'string',
    predicate: normalized => normalized.includes('string') || normalized.includes('"'),
  },
  {
    description: '命中数字特征（number）',
    kind: 'number',
    predicate: normalized => normalized.includes('number'),
  },
  {
    description: '命中布尔特征（boolean）',
    kind: 'boolean',
    predicate: normalized => normalized.includes('boolean'),
  },
]

const ARRAY_ITEM_KIND_RULES: readonly ArrayItemKindRule[] = [
  {
    description: '数组元素应为字符串（string[]）',
    itemKind: 'string',
    predicate: normalized => normalized.includes('string[]'),
  },
  {
    description: '数组元素应为数字（number[]）',
    itemKind: 'number',
    predicate: normalized => normalized.includes('number[]'),
  },
  {
    description: '数组元素应为布尔值（boolean[]）',
    itemKind: 'boolean',
    predicate: normalized => normalized.includes('boolean[]'),
  },
]

const ARRAY_ITEM_KIND_MISMATCH_MESSAGE: Readonly<Record<ArrayItemKindRule['itemKind'], string>> = {
  string: '应为字符串',
  number: '应为数字',
  boolean: '应为布尔值',
}

const PRIMITIVE_KIND_ORDER: readonly PrimitiveKind[] = ['string', 'number', 'boolean']
const PRIMITIVE_KIND_CHECKERS: Readonly<Record<PrimitiveKind, (value: unknown) => boolean>> = {
  string: value => typeof value === 'string',
  number: value => typeof value === 'number',
  boolean: value => typeof value === 'boolean',
}

// =========================================================
// 三、基础工具函数（类型守卫 / 文本规则）
// =========================================================

function hasStringFallbackHint(normalized: string): boolean {
  return STRING_FALLBACK_HINTS.some(hint => normalized.includes(hint))
}

function isOmittedFieldDescription(description: string): boolean {
  return OMITTED_FIELD_HINTS.some(hint => description.includes(hint))
}

function isWildcardKey(key: string): boolean {
  return WILDCARD_KEY_PATTERN.test(key)
}

/** 当前 expected 是否包含任意 primitive 期望。 */
function hasPrimitiveExpectation(expected: ReadonlySet<ExpectedKind>): boolean {
  return PRIMITIVE_KIND_ORDER.some(kind => expected.has(kind))
}

/**
 * 判断 value 是否命中 expected 中任意 primitive 类型。
 *
 * 例如 expected 同时包含 string|number 时，只要 value 命中其一即可通过。
 */
function matchesExpectedPrimitiveKind(value: unknown, expected: ReadonlySet<ExpectedKind>): boolean {
  return PRIMITIVE_KIND_ORDER.some(kind => expected.has(kind) && PRIMITIVE_KIND_CHECKERS[kind](value))
}

/**
 * 生成 primitive 期望文案，固定输出顺序，避免集合遍历顺序导致文案抖动。
 */
function formatExpectedPrimitiveKinds(expected: ReadonlySet<ExpectedKind>): string {
  return PRIMITIVE_KIND_ORDER.filter(kind => expected.has(kind)).join(' | ')
}

/** 判断是否为普通对象（非 null、非数组）。 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 判断是否为对象 schema 节点。 */
function isObjectSchema(value: unknown): value is LlmParamObjectSchema {
  return isPlainRecord(value) && value['kind'] === 'object'
}

/** 判断是否为数组 schema 节点。 */
function isArraySchema(value: unknown): value is LlmParamArraySchema {
  return isPlainRecord(value) && value['kind'] === 'array'
}

// =========================================================
// 四、Schema 归一化与问题收集
// =========================================================

/**
 * 兼容两种 schema 写法：
 * 1. 显式 DSL：{ kind: 'object' | 'array', ... }
 * 2. 简写对象：{ fieldA: 'string', fieldB: ... }
 *
 * 简写对象会被自动提升成 object schema，便于 catalog 保持可读性。
 */
function normalizeSchemaNode(schema: unknown): unknown {
  if (typeof schema === 'string') return schema
  if (isObjectSchema(schema) || isArraySchema(schema)) return schema
  if (isPlainRecord(schema)) {
    return {
      kind: 'object',
      properties: schema,
    } satisfies LlmParamObjectSchema
  }
  return 'unknown'
}

function pushIssue(issues: LlmParamValidationIssue[], path: string, message: string): void {
  issues.push({ path, message })
}

// =========================================================
// 五、叶子规则推断与基础值校验
// =========================================================

/**
 * 叶子描述目前不是完整类型系统，而是“面向 LLM 的可读说明”。
 * 这里用保守启发式把 string/number/boolean/array/object 推断出来，
 * 只拦明显错误，避免把说明文本过度解释成强约束。
 */
function inferExpectedKinds(description: string): Set<'string' | 'number' | 'boolean' | 'array' | 'object' | 'unknown'> {
  const normalized = description.toLowerCase()
  const expected = new Set<ExpectedKind>()

  if (normalized.includes('unknown')) {
    expected.add('unknown')
    return expected
  }

  for (const rule of EXPECTED_KIND_RULES) {
    // 逐条规则匹配，把“描述文本”映射到可执行的基础类型集合。
    if (rule.predicate(normalized)) {
      expected.add(rule.kind)
    }
  }

  if (expected.size === 0 && hasStringFallbackHint(normalized)) {
    expected.add('string')
  }

  if (expected.size === 0) {
    expected.add('unknown')
  }

  return expected
}

function validatePrimitiveArrayItems(
  value: unknown[],
  description: string,
  path: string,
  issues: LlmParamValidationIssue[],
): void {
  const normalized = description.toLowerCase()
  const matchedRule = ARRAY_ITEM_KIND_RULES.find(rule => rule.predicate(normalized))
  if (matchedRule === undefined) return

  const { itemKind } = matchedRule
  const mismatchMessage = ARRAY_ITEM_KIND_MISMATCH_MESSAGE[itemKind]

  for (const [index, item] of value.entries()) {
    const itemPath = `${path}[${index}]`
    // 这里只做基础类型兜底校验，不做深层语义判断。
    // 例如 number[] 不会继续判断最小值/范围，这类约束应交给更上层语义校验。
    if (typeof item !== itemKind) {
      pushIssue(issues, itemPath, mismatchMessage)
    }
  }
}

/**
 * 校验 string 叶子 schema。
 *
 * 这层只处理“描述型叶子”能表达的约束：基本类型、null 允许性、以及
 * “该字段不应由 LLM 传入”这种协议边界；复杂嵌套结构交给 object/array schema。
 */
function validateLeafSchema(
  value: unknown,
  description: string,
  path: string,
  issues: LlmParamValidationIssue[],
): void {
  // 约定型禁传字段：用于表达“运行时计算字段/函数字段，不应由 LLM 输入”。
  if (isOmittedFieldDescription(description)) {
    if (value !== undefined) {
      pushIssue(issues, path, '该字段在 LLM 参数中应省略')
    }
    return
  }

  if (value === null) {
    if (description.toLowerCase().includes('null')) return
    pushIssue(issues, path, '不能为 null')
    return
  }

  const expected = inferExpectedKinds(description)
  if (expected.has('unknown')) return

  // array/object 优先分支，避免后续 primitive 分支误判。
  if (expected.has('array')) {
    if (!Array.isArray(value)) {
      pushIssue(issues, path, '应为数组')
      return
    }
    validatePrimitiveArrayItems(value, description, path, issues)
    return
  }

  if (expected.has('object')) {
    if (!isPlainRecord(value)) {
      pushIssue(issues, path, '应为对象')
    }
    return
  }

  // primitive 组合分支：支持 string|number|boolean 混合描述。
  if (matchesExpectedPrimitiveKind(value, expected)) return
  if (hasPrimitiveExpectation(expected)) {
    pushIssue(
      issues,
      path,
      `类型不匹配，期望 ${formatExpectedPrimitiveKinds(expected)}`,
    )
  }
}

// =========================================================
// 六、对象/数组节点校验（递归主逻辑）
// =========================================================

/**
 * 支持像 <customViewId> 这样的通配键，用于“对象键未知但 value 结构固定”的场景。
 */
function findWildcardSchemas(source: Record<string, unknown>): unknown[] {
  return Object.entries(source)
    .filter(([key]) => isWildcardKey(key))
    .map(([, value]) => value)
}

function validateDeclaredFields(
  value: Record<string, unknown>,
  fields: Record<string, unknown>,
  path: string,
  issues: LlmParamValidationIssue[],
): void {
  // 只校验显式字段；通配键会在对象未知键阶段统一处理。
  for (const [key, childSchema] of Object.entries(fields)) {
    if (isWildcardKey(key)) continue
    if (key in value) {
      validateSchemaNode(value[key], childSchema, `${path}.${key}`, issues, NESTED_CONTEXT)
    }
  }
}

/**
 * 处理对象中的单个“未知键”条目，严格遵循以下优先级：
 * 1. 通配键 schema
 * 2. additionalProperties
 * 3. 未知键报错（当层级不允许未知键时）
 */
function validateUnknownObjectEntry(
  key: string,
  childValue: unknown,
  path: string,
  issues: LlmParamValidationIssue[],
  wildcardSchemas: readonly unknown[],
  additionalProperties: unknown,
  context: ValidationContext,
): void {
  const childPath = `${path}.${key}`

  if (wildcardSchemas.length > 0) {
    validateSchemaNode(childValue, wildcardSchemas[0], childPath, issues, NESTED_CONTEXT)
    return
  }

  if (additionalProperties !== undefined) {
    validateSchemaNode(childValue, additionalProperties, childPath, issues, NESTED_CONTEXT)
    return
  }

  if (!context.allowUnknownKeys) {
    pushIssue(issues, childPath, '未声明的字段')
  }
}

/**
 * 对象节点的字段优先级：
 * 1. 显式 properties / optional
 * 2. 通配键 schema（如 <customViewId>）
 * 3. additionalProperties
 * 4. 若仍未命中且不允许未知键，则直接报错
 */
function validateObjectSchema(
  value: unknown,
  schema: LlmParamObjectSchema,
  path: string,
  issues: LlmParamValidationIssue[],
  context: ValidationContext,
): void {
  if (!isPlainRecord(value)) {
    pushIssue(issues, path, '应为对象')
    return
  }

  const properties = schema.properties ?? {}
  const optional = schema.optional ?? {}
  const explicitPropertyKeys = new Set([
    ...Object.keys(properties).filter(key => !isWildcardKey(key)),
    ...Object.keys(optional).filter(key => !isWildcardKey(key)),
  ])
  const wildcardSchemas = [
    ...findWildcardSchemas(properties),
    ...findWildcardSchemas(optional),
  ]

  // 阶段 1：必填字段检查。
  for (const key of schema.required ?? []) {
    if (!(key in value)) {
      pushIssue(issues, `${path}.${key}`, '缺少必填字段')
    }
  }

  // 阶段 2：显式声明字段（properties / optional）递归校验。
  validateDeclaredFields(value, properties, path, issues)
  validateDeclaredFields(value, optional, path, issues)

  // 阶段 3 + 4：处理未知键（通配键 / additionalProperties / 不允许未知键报错）。
  for (const [key, childValue] of Object.entries(value)) {
    if (explicitPropertyKeys.has(key)) continue
    validateUnknownObjectEntry(
      key,
      childValue,
      path,
      issues,
      wildcardSchemas,
      schema.additionalProperties,
      context,
    )
  }
}

function validateArraySchema(
  value: unknown,
  schema: LlmParamArraySchema,
  path: string,
  issues: LlmParamValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    pushIssue(issues, path, '应为数组')
    return
  }

  if (schema.items === undefined) return

  for (const [index, item] of value.entries()) {
    // 数组元素始终沿用“未知键不允许”的严格策略。
    validateSchemaNode(item, schema.items, `${path}[${index}]`, issues, NESTED_CONTEXT)
  }
}

/**
 * 递归调度入口：先把 schema 归一化，再按 leaf / object / array 分发。
 */
function validateSchemaNode(
  value: unknown,
  schema: unknown,
  path: string,
  issues: LlmParamValidationIssue[],
  context: ValidationContext,
): void {
  const normalized = normalizeSchemaNode(schema)

  if (typeof normalized === 'string') {
    validateLeafSchema(value, normalized, path, issues)
    return
  }

  if (isObjectSchema(normalized)) {
    validateObjectSchema(value, normalized, path, issues, context)
    return
  }

  if (isArraySchema(normalized)) {
    validateArraySchema(value, normalized, path, issues)
  }
}

// =========================================================
// 七、入口辅助（root 合并策略）
// =========================================================

function mergeRequiredKeys(
  schemaRequired: readonly string[] | undefined,
  optionsRequired: readonly string[] | undefined,
): readonly string[] {
  return [
    ...(schemaRequired ?? []),
    ...(optionsRequired ?? []),
  ]
}

/**
 * oneOfRequiredKeyGroups 语义：至少满足其中一组 required key。
 *
 * 例：[['selector'], ['parentTable', 'childTable']]
 * 表示要么传 selector，要么同时传 parentTable + childTable。
 */
function validateOneOfRequiredGroups(
  params: Record<string, unknown>,
  groups: ReadonlyArray<readonly string[]>,
  issues: LlmParamValidationIssue[],
): void {
  if (groups.length === 0) return
  const hasSatisfiedGroup = groups.some(group => group.every(key => key in params))
  if (hasSatisfiedGroup) return

  const groupsText = groups.map(group => `[${group.join(', ')}]`).join(' 或 ')
  pushIssue(issues, '$', `以下字段至少满足一组: ${groupsText}`)
}

// =========================================================
// 八、对外入口与输出格式化
// =========================================================

export function validateLlmDeserializedParams(
  params: unknown,
  schema: Record<string, unknown>,
  options: LlmParamValidationOptions = {},
): LlmParamValidationResult {
  const issues: LlmParamValidationIssue[] = []

  // 根参数必须是对象，这是协议层最基础约束。
  if (!isPlainRecord(params)) {
    return {
      ok: false,
      issues: [{ path: '$', message: '参数必须是 JSON 对象' }],
    }
  }

  const rootSchema = normalizeSchemaNode(schema)
  if (!isObjectSchema(rootSchema)) {
    return {
      ok: false,
      issues: [{ path: '$', message: 'schema 根节点必须是对象' }],
    }
  }

  // catalog 自身的 required 与调用点临时叠加的 requiredKeys 会合并后统一校验。
  const mergedRootSchema: LlmParamObjectSchema = {
    ...rootSchema,
    required: mergeRequiredKeys(rootSchema.required, options.requiredKeys),
  }

  validateObjectSchema(params, mergedRootSchema, '$', issues, {
    allowUnknownKeys: options.allowUnknownRootKeys ?? false,
  })

  validateOneOfRequiredGroups(params, options.oneOfRequiredKeyGroups ?? [], issues)

  return {
    ok: issues.length === 0,
    issues,
  }
}

/**
 * 把结构化 issue 压成一条短消息，适合直接回填到 still validate/fix 文案里。
 */
export function formatLlmParamValidationIssues(
  issues: readonly LlmParamValidationIssue[],
  maxCount = 5,
): string {
  if (issues.length === 0) return '参数校验通过'
  const head = issues.slice(0, maxCount).map(issue => `${issue.path} ${issue.message}`)
  const suffix = issues.length > maxCount ? `；另有 ${issues.length - maxCount} 个问题` : ''
  return `参数校验失败：${head.join('；')}${suffix}`
}