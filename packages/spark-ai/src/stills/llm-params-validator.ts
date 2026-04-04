/**
 * 通用 LLM 参数校验器。
 *
 * 输入是“协议块反序列化后的 JSON 参数”和 catalog 中的 schema DSL，
 * 输出是 fail-fast 的结构化问题列表，供 still runtime 或更上层 adapter 决定如何反馈给 LLM。
 */
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

type ValidationContext = {
  allowUnknownKeys: boolean
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isObjectSchema(value: unknown): value is LlmParamObjectSchema {
  return isPlainRecord(value) && value['kind'] === 'object'
}

function isArraySchema(value: unknown): value is LlmParamArraySchema {
  return isPlainRecord(value) && value['kind'] === 'array'
}

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

/**
 * 叶子描述目前不是完整类型系统，而是“面向 LLM 的可读说明”。
 * 这里用保守启发式把 string/number/boolean/array/object 推断出来，
 * 只拦明显错误，避免把说明文本过度解释成强约束。
 */
function inferExpectedKinds(description: string): Set<'string' | 'number' | 'boolean' | 'array' | 'object' | 'unknown'> {
  const normalized = description.toLowerCase()
  const expected = new Set<'string' | 'number' | 'boolean' | 'array' | 'object' | 'unknown'>()

  if (normalized.includes('unknown')) {
    expected.add('unknown')
    return expected
  }

  if (normalized.includes('[]') || normalized.includes('array<')) {
    expected.add('array')
  }

  if (
    normalized.includes('record<')
    || normalized.includes('对象')
    || normalized.includes('filterexpression')
    || normalized.startsWith('{')
  ) {
    expected.add('object')
  }

  if (normalized.includes('string') || normalized.includes('"')) {
    expected.add('string')
  }

  if (normalized.includes('number')) {
    expected.add('number')
  }

  if (normalized.includes('boolean')) {
    expected.add('boolean')
  }

  if (
    expected.size === 0
    && (normalized.includes('typeresource')
      || normalized.includes('type')
      || normalized.includes('category')
      || normalized.includes('dependencytype'))
  ) {
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
  const itemKind = normalized.includes('string[]')
    ? 'string'
    : normalized.includes('number[]')
      ? 'number'
      : normalized.includes('boolean[]')
        ? 'boolean'
        : null

  if (itemKind === null) return

  for (const [index, item] of value.entries()) {
    const itemPath = `${path}[${index}]`
    if (itemKind === 'string' && typeof item !== 'string') {
      pushIssue(issues, itemPath, '应为字符串')
    }
    if (itemKind === 'number' && typeof item !== 'number') {
      pushIssue(issues, itemPath, '应为数字')
    }
    if (itemKind === 'boolean' && typeof item !== 'boolean') {
      pushIssue(issues, itemPath, '应为布尔值')
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
  if (description.includes('应省略') || description.includes('不要传函数')) {
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

  if (expected.has('string') && typeof value === 'string') return
  if (expected.has('number') && typeof value === 'number') return
  if (expected.has('boolean') && typeof value === 'boolean') return
  if (expected.has('string') || expected.has('number') || expected.has('boolean')) {
    pushIssue(
      issues,
      path,
      `类型不匹配，期望 ${Array.from(expected).join(' | ')}`,
    )
  }
}

/**
 * 支持像 <customViewId> 这样的通配键，用于“对象键未知但 value 结构固定”的场景。
 */
function findWildcardSchemas(source: Record<string, unknown>): unknown[] {
  return Object.entries(source)
    .filter(([key]) => /^<.+>$/.test(key))
    .map(([, value]) => value)
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
    ...Object.keys(properties).filter(key => !/^<.+>$/.test(key)),
    ...Object.keys(optional).filter(key => !/^<.+>$/.test(key)),
  ])
  const wildcardSchemas = [
    ...findWildcardSchemas(properties),
    ...findWildcardSchemas(optional),
  ]

  for (const key of schema.required ?? []) {
    if (!(key in value)) {
      pushIssue(issues, `${path}.${key}`, '缺少必填字段')
    }
  }

  for (const [key, childSchema] of Object.entries(properties)) {
    if (/^<.+>$/.test(key)) continue
    if (key in value) {
      validateSchemaNode(value[key], childSchema, `${path}.${key}`, issues, { allowUnknownKeys: false })
    }
  }

  for (const [key, childSchema] of Object.entries(optional)) {
    if (/^<.+>$/.test(key)) continue
    if (key in value) {
      validateSchemaNode(value[key], childSchema, `${path}.${key}`, issues, { allowUnknownKeys: false })
    }
  }

  for (const [key, childValue] of Object.entries(value)) {
    if (explicitPropertyKeys.has(key)) continue

    if (wildcardSchemas.length > 0) {
      validateSchemaNode(childValue, wildcardSchemas[0], `${path}.${key}`, issues, { allowUnknownKeys: false })
      continue
    }

    if (schema.additionalProperties !== undefined) {
      validateSchemaNode(childValue, schema.additionalProperties, `${path}.${key}`, issues, { allowUnknownKeys: false })
      continue
    }

    if (!context.allowUnknownKeys) {
      pushIssue(issues, `${path}.${key}`, '未声明的字段')
    }
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
    validateSchemaNode(item, schema.items, `${path}[${index}]`, issues, { allowUnknownKeys: false })
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

export function validateLlmDeserializedParams(
  params: unknown,
  schema: Record<string, unknown>,
  options: LlmParamValidationOptions = {},
): LlmParamValidationResult {
  const issues: LlmParamValidationIssue[] = []

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
    required: [
      ...(rootSchema.required ?? []),
      ...(options.requiredKeys ?? []),
    ],
  }

  validateObjectSchema(params, mergedRootSchema, '$', issues, {
    allowUnknownKeys: options.allowUnknownRootKeys ?? false,
  })

  const oneOfGroups = options.oneOfRequiredKeyGroups ?? []
  if (oneOfGroups.length > 0) {
    const hasSatisfiedGroup = oneOfGroups.some(group => group.every(key => key in params))
    if (!hasSatisfiedGroup) {
      const groupsText = oneOfGroups.map(group => `[${group.join(', ')}]`).join(' 或 ')
      pushIssue(issues, '$', `以下字段至少满足一组: ${groupsText}`)
    }
  }

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