/**
 * 通用 LLM 参数校验器（llm-params-validator）
 *
 * 职责
 * ────
 * 对 LLM 回传的 JSON 参数（协议块反序列化后）做结构一致性校验。
 * 输出是 fail-fast 的结构化问题列表，供 still runtime 或更上层 adapter
 * 决定如何向 LLM 反馈并触发修复重试。
 *
 * 设计约束
 * ────────
 * 1. 叶子 schema 是"面向 LLM 的可读描述字符串"，而非完整类型系统。
 *    校验采用保守启发式，只拦明显错误，不过度解释描述文本。
 * 2. 对象/数组使用显式 DSL（kind: 'object' | 'array'）以支持递归嵌套。
 *    简写对象（{ field: 'desc' }）会被自动提升，保持 catalog 可读性。
 * 3. 通配键（<keyName>）和 additionalProperties 用于"键名动态、值类型固定"场景。
 * 4. 校验结果按 path 定位问题，方便 LLM 定点修复，而非整体拒绝。
 *
 * 模块分区
 * ────────
 *  一、公共类型定义           — 对外导出的 schema 与结果接口
 *  二、内部类型与规则常量      — 模块私有的推断规则与上下文类型
 *  三、基础工具函数            — 类型守卫 / 文本规则辅助
 *  四、Schema 归一化与问题收集  — schema 标准化与 issue 追加
 *  五、叶子规则推断与基础值校验  — 描述型叶子到类型期望的映射
 *  六、对象/数组节点校验        — 递归主逻辑（含通配键、additionalProperties）
 *  七、入口辅助               — root 层必填合并与 oneOf 检查
 *  八、对外入口与输出格式化    — 公开 API 函数
 */

// =========================================================
// 一、公共类型定义（对外可见）
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
 * - ok    : 无问题时为 true；有任意问题时为 false（fail-fast 语义）。
 * - issues: 问题列表，空数组表示通过。
 */
export interface LlmParamValidationResult {
  ok: boolean
  issues: LlmParamValidationIssue[]
}

/**
 * 校验入口调用选项，允许调用方在不修改 catalog schema 的前提下叠加约束。
 *
 * - requiredKeys           : 额外追加的必填字段名列表，与 schema.required 合并后统一校验。
 * - oneOfRequiredKeyGroups : 多组互斥 required 组合；至少满足其中一组即通过。
 *                            例：[['selector'], ['parentTable', 'childTable']]
 * - allowUnknownRootKeys   : 根层是否允许存在未声明的字段（默认 false = 严格模式）。
 */
export interface LlmParamValidationOptions {
  requiredKeys?: readonly string[]
  oneOfRequiredKeyGroups?: ReadonlyArray<readonly string[]>
  allowUnknownRootKeys?: boolean
}

// =========================================================
// 二、内部类型与规则常量（模块私有）
// =========================================================

/**
 * 对象层校验上下文，跨层传递不可变的策略参数。
 *
 * 根层通过 options.allowUnknownRootKeys 控制，嵌套层始终使用严格模式（false）。
 */
type ValidationContext = {
  /** 当前对象层是否允许存在未声明字段。 */
  allowUnknownKeys: boolean
}

/**
 * 叶子描述能推断出的所有基础类型，包含特殊值 'unknown'。
 *
 * 'unknown' 表示无法从描述文本中推断出具体类型，校验器对该字段放行。
 */
type ExpectedKind = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'unknown'

/**
 * 单条"描述 → 类型"推断规则。
 *
 * - description: 规则的中文说明（与规则本体同源，减少注释漂移风险）。
 * - kind       : 命中后推断的目标类型。
 * - predicate  : 对归一化（toLowerCase）后的描述字符串判断是否命中。
 */
type KindRule = {
  description: string
  kind: Exclude<ExpectedKind, 'unknown'>
  predicate: (normalized: string) => boolean
}

/**
 * 单条"描述 → 数组元素类型"推断规则，用于 primitive array 场景（string[] / number[] / boolean[]）。
 *
 * - description: 规则中文说明。
 * - itemKind   : 命中后期望的数组元素类型。
 * - predicate  : 对归一化描述字符串判断是否命中。
 */
type ArrayItemKindRule = {
  description: string
  itemKind: 'string' | 'number' | 'boolean'
  predicate: (normalized: string) => boolean
}

/** primitive 类型的三元联合，用于固定迭代顺序避免输出抖动。 */
type PrimitiveKind = 'string' | 'number' | 'boolean'

/** 通配键正则：匹配 <任意字符> 形式的 schema 键，如 <customViewId>。 */
const WILDCARD_KEY_PATTERN = /^<.+>$/u

/** 嵌套对象/数组层始终使用严格上下文（禁止未知键）。 */
const NESTED_CONTEXT: ValidationContext = { allowUnknownKeys: false }

/**
 * 字符串类型的 fallback 提示词列表。
 *
 * 当描述文本未命中任何明确类型规则时，若包含这些提示词之一，
 * 则推断为 string 类型（宽松兜底，避免误报）。
 */
const STRING_FALLBACK_HINTS = ['typeresource', 'type', 'category', 'dependencytype'] as const

/**
 * 禁传字段的提示词列表。
 *
 * 包含这些词的叶子 schema 描述表示该字段"不应由 LLM 填入"
 *（运行时计算字段 / 函数字段），若 LLM 仍然传入则报错。
 */
const OMITTED_FIELD_HINTS = ['应省略', '不要传函数'] as const

/**
 * 描述 → 期望类型的推断规则表。
 *
 * 规则按优先级排列：array / object 在前，防止后续 primitive 分支误判。
 * 规则之间不互斥，一条描述可同时命中多条（如 string|number 混合描述）。
 */
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

/**
 * 描述 → 数组元素类型的推断规则表。
 *
 * 仅针对"基础类型数组"（string[] / number[] / boolean[]）做推断，
 * 复杂元素类型（对象数组）由 items schema 的递归校验处理。
 */
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

/**
 * 数组元素类型不匹配时的错误文案映射。
 *
 * 与 ARRAY_ITEM_KIND_RULES 配合使用，避免在循环中重复拼接条件分支。
 */
const ARRAY_ITEM_KIND_MISMATCH_MESSAGE: Readonly<Record<ArrayItemKindRule['itemKind'], string>> = {
  string: '应为字符串',
  number: '应为数字',
  boolean: '应为布尔值',
}

/**
 * primitive 类型的固定迭代顺序。
 *
 * 使用固定顺序而非 Set 遍历，保证错误文案输出顺序稳定，
 * 避免不同 JS 引擎或版本下集合遍历顺序差异导致的文案抖动。
 */
const PRIMITIVE_KIND_ORDER: readonly PrimitiveKind[] = ['string', 'number', 'boolean']

/**
 * primitive 类型的运行时判断函数映射。
 *
 * 与 PRIMITIVE_KIND_ORDER 配合，统一管理每种 primitive 的判断逻辑，
 * 便于后续扩展（如新增 bigint 支持）时只改此处。
 */
const PRIMITIVE_KIND_CHECKERS: Readonly<Record<PrimitiveKind, (value: unknown) => boolean>> = {
  string: value => typeof value === 'string',
  number: value => typeof value === 'number',
  boolean: value => typeof value === 'boolean',
}

// =========================================================
// 三、基础工具函数（类型守卫 / 文本规则辅助）
// =========================================================

/**
 * 判断 schema 键名是否为通配键（<keyName> 形式）。
 *
 * 通配键用于"对象键名动态、但值的结构固定"场景，
 * 如 `<customViewId>` 表示任意视图 id 对应的 schema 结构。
 */
function isWildcardKey(key: string): boolean {
  return WILDCARD_KEY_PATTERN.test(key)
}

/**
 * 类型守卫：判断值是否为普通对象（非 null、非数组）。
 *
 * 用于区分 JSON 对象与其他类型，JSON 数组、null、primitive 均不满足。
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 类型守卫：判断值是否为显式对象 schema 节点（kind === 'object'）。
 *
 * 用于区分"显式 DSL"与"简写对象"，简写对象由 normalizeSchemaNode 提升后才满足此判断。
 */
function isObjectSchema(value: unknown): value is LlmParamObjectSchema {
  return isPlainRecord(value) && value['kind'] === 'object'
}

/** 类型守卫：判断值是否为显式数组 schema 节点（kind === 'array'）。 */
function isArraySchema(value: unknown): value is LlmParamArraySchema {
  return isPlainRecord(value) && value['kind'] === 'array'
}

// =========================================================
// 四、Schema 归一化与问题收集
// =========================================================

/**
 * 将任意 schema 节点归一化为标准形态。
 *
 * 兼容四种写法：
 *  1. 叶子字符串：直接返回，表示"面向 LLM 的描述字符串"，由叶子校验函数处理。
 *  2. 显式 DSL：{ kind: 'object' | 'array', ... } 直接返回，不再包装。
 *  3. 简写对象：{ fieldA: 'desc', ... } → 自动提升为 object schema（properties = 原对象）。
 *     这让 catalog 维护者可以用更紧凑的格式书写浅层 schema。
 *  4. 其他（null / 数字等无法识别的值）：返回 'unknown'，校验器放行。
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

/**
 * 向问题列表追加一条问题。
 *
 * 统一通过此函数追加，方便后续在此插入截断、去重或日志逻辑。
 */
function pushIssue(issues: LlmParamValidationIssue[], path: string, message: string): void {
  issues.push({ path, message })
}

// =========================================================
// 五、叶子规则推断与基础值校验
// =========================================================

/**
 * 从叶子描述字符串推断出期望的基础类型集合。
 *
 * 推断策略（保守启发式）：
 *  1. 若描述含 'unknown' → 直接返回 {unknown}，校验器放行该字段。
 *  2. 遍历 EXPECTED_KIND_RULES，命中则加入期望集合（多条可同时命中）。
 *  3. 若无命中但含 STRING_FALLBACK_HINTS → 宽松兜底为 string。
 *  4. 若仍无命中 → 返回 {unknown}，放行。
 *
 * 设计原则：宁可放行也不误报，避免把"说明文本"过度解释成强约束。
 */
function inferExpectedKinds(description: string): Set<'string' | 'number' | 'boolean' | 'array' | 'object' | 'unknown'> {
  const normalized = description.toLowerCase()
  const expected = new Set<ExpectedKind>()

  // 快速路径：明确声明 unknown 的字段直接放行。
  if (normalized.includes('unknown')) {
    expected.add('unknown')
    return expected
  }

  // 逐条规则匹配，把描述文本映射到基础类型集合。
  for (const rule of EXPECTED_KIND_RULES) {
    if (rule.predicate(normalized)) {
      expected.add(rule.kind)
    }
  }

  // fallback 1：含特定提示词时推断为 string（宽松兜底）。
  if (expected.size === 0 && STRING_FALLBACK_HINTS.some(hint => normalized.includes(hint))) {
    expected.add('string')
  }

  // fallback 2：无法推断时放行，避免误报。
  if (expected.size === 0) {
    expected.add('unknown')
  }

  return expected
}

/**
 * 对 primitive 类型的数组元素做基础类型校验（string[] / number[] / boolean[]）。
 *
 * 只做类型兜底，不做深层语义判断（如数值范围、字符串格式等），
 * 这类语义约束应由更上层调用方自行处理。
 * 若描述未命中任何元素类型规则则跳过（视为放行）。
 */
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
    if (typeof item !== itemKind) {
      pushIssue(issues, itemPath, mismatchMessage)
    }
  }
}

/**
 * 校验叶子（描述字符串）schema 对应的值。
 *
 * 本函数只处理"描述型叶子"能表达的有限约束：
 *  1. 禁传字段检查（运行时字段 / 函数字段）。
 *  2. null 允许性（描述中含 'null' 则允许传 null）。
 *  3. 基础类型检查（通过 inferExpectedKinds 推断后验证）。
 *
 * 复杂嵌套结构（对象/数组）交给 object/array schema 节点处理；
 * 当描述同时命中 array 特征时，会进一步调用 validatePrimitiveArrayItems。
 */
function validateLeafSchema(
  value: unknown,
  description: string,
  path: string,
  issues: LlmParamValidationIssue[],
): void {
  // 禁传字段：运行时计算字段 / 函数字段，LLM 不应填入。
  if (OMITTED_FIELD_HINTS.some(hint => description.includes(hint))) {
    if (value !== undefined) {
      pushIssue(issues, path, '该字段在 LLM 参数中应省略')
    }
    return
  }

  // null 处理：描述中含 'null' 则允许传 null，否则报错。
  if (value === null) {
    if (description.toLowerCase().includes('null')) return
    pushIssue(issues, path, '不能为 null')
    return
  }

  const expected = inferExpectedKinds(description)
  // 'unknown' 表示无法推断类型，放行所有值。
  if (expected.has('unknown')) return

  // array / object 优先检查，避免后续 primitive 分支对复合类型误判。
  if (expected.has('array')) {
    if (!Array.isArray(value)) {
      pushIssue(issues, path, '应为数组')
      return
    }
    // 进一步尝试 primitive 元素类型校验（string[] / number[] / boolean[]）。
    validatePrimitiveArrayItems(value, description, path, issues)
    return
  }

  if (expected.has('object')) {
    if (!isPlainRecord(value)) {
      pushIssue(issues, path, '应为对象')
    }
    return
  }

  // primitive 组合检查：支持 string | number | boolean 混合描述，命中其一即通过。
  const matchedPrimitive = PRIMITIVE_KIND_ORDER.some(
    kind => expected.has(kind) && PRIMITIVE_KIND_CHECKERS[kind](value),
  )
  if (matchedPrimitive) return

  const expectedPrimitiveKinds = PRIMITIVE_KIND_ORDER.filter(kind => expected.has(kind))
  if (expectedPrimitiveKinds.length > 0) {
    pushIssue(
      issues,
      path,
      `类型不匹配，期望 ${expectedPrimitiveKinds.join(' | ')}`,
    )
  }
}

// =========================================================
// 六、对象/数组节点校验（递归主逻辑）
// =========================================================

/**
 * 校验对象节点。
 *
 * 校验流程分三个阶段：
 *  阶段 1 — 必填字段缺失检查（schema.required）
 *  阶段 2 — 显式声明字段递归校验（properties / optional，值存在时才校验）
 *  阶段 3 — 遍历未知键，按优先级分发（通配键 / additionalProperties / 报错）
 *
 * context.allowUnknownKeys 控制当前层是否允许未声明字段；
 * 根层由调用选项控制，嵌套层始终为 false（严格模式）。
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

  // 预计算显式键集合，用于在遍历 value 时快速跳过已校验字段。
  const explicitPropertyKeys = new Set([
    ...Object.keys(properties).filter(key => !isWildcardKey(key)),
    ...Object.keys(optional).filter(key => !isWildcardKey(key)),
  ])
  const wildcardSchemas = [
    ...Object.entries(properties)
      .filter(([key]) => isWildcardKey(key))
      .map(([, childSchema]) => childSchema),
    ...Object.entries(optional)
      .filter(([key]) => isWildcardKey(key))
      .map(([, childSchema]) => childSchema),
  ]

  // 阶段 1：必填字段缺失检查。
  for (const key of schema.required ?? []) {
    if (!(key in value)) {
      pushIssue(issues, `${path}.${key}`, '缺少必填字段')
    }
  }

  // 阶段 2：显式声明字段递归校验（值存在时才校验）。
  for (const [key, childSchema] of Object.entries(properties)) {
    if (isWildcardKey(key) || !(key in value)) continue
    validateSchemaNode(value[key], childSchema, `${path}.${key}`, issues, NESTED_CONTEXT)
  }
  for (const [key, childSchema] of Object.entries(optional)) {
    if (isWildcardKey(key) || !(key in value)) continue
    validateSchemaNode(value[key], childSchema, `${path}.${key}`, issues, NESTED_CONTEXT)
  }

  // 阶段 3：遍历 value 中的所有键，处理显式键之外的未知键。
  for (const [key, childValue] of Object.entries(value)) {
    if (explicitPropertyKeys.has(key)) continue
    const childPath = `${path}.${key}`

    if (wildcardSchemas.length > 0) {
      validateSchemaNode(childValue, wildcardSchemas[0], childPath, issues, NESTED_CONTEXT)
      continue
    }

    if (schema.additionalProperties !== undefined) {
      validateSchemaNode(childValue, schema.additionalProperties, childPath, issues, NESTED_CONTEXT)
      continue
    }

    if (!context.allowUnknownKeys) {
      pushIssue(issues, childPath, '未声明的字段')
    }
  }
}

/**
 * 校验数组节点。
 *
 * - 先判断 value 是否为数组。
 * - 若 schema.items 未声明，则只校验是否为数组，不校验元素内容。
 * - 否则对每个元素递归调用 validateSchemaNode，使用严格嵌套上下文。
 *
 * 数组元素层始终使用 NESTED_CONTEXT（strictMode），
 * 因为元素结构通常比根层更确定，不需要放宽未知键限制。
 */
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

    validateSchemaNode(item, schema.items, `${path}[${index}]`, issues, NESTED_CONTEXT)
  }
}

/**
 * Schema 节点递归调度入口。
 *
 * 先将 schema 归一化，再按以下顺序分发：
 *  1. 字符串叶子 → validateLeafSchema
 *  2. 对象节点   → validateObjectSchema
 *  3. 数组节点   → validateArraySchema
 *
 * 归一化可能将简写对象提升为 object schema，
 * 也可能将无法识别的 schema 降级为 'unknown' 字符串（放行）。
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
// 七、入口辅助（root 层必填合并与 oneOf 检查）
// =========================================================

/**
 * 校验"至少满足一组 required key"的互斥必填约束。
 *
 * 语义：groups 中的每一组是一套完整的 required key 集合，
 * 只要参数满足其中任意一组（该组所有 key 都存在），则整体通过。
 *
 * 典型用法：关系选择器可以传 selector 字符串，
 * 也可以传 { parentTable, childTable } 对，两种方式任选其一：
 *   groups = [['selector'], ['parentTable', 'childTable']]
 *
 * 若 groups 为空则跳过检查（不额外施加约束）。
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

/**
 * 校验 LLM 反序列化后的工具参数是否符合 catalog schema 声明。
 *
 * 完整校验流程（5 步）：
 *  1. 顶层必须是普通对象（非数组、非 null）
 *  2. 从 schema 和 options.requiredKeys 合并 required 列表
 *  3. 执行对象节点校验（必填检查 / 字段递归 / 未知键处理）
 *  4. 执行 oneOf 必填互斥约束校验
 *  5. 汇总所有 issues 并返回结构化结果
 *
 * 设计约束：
 * - schema 来自 catalog 的静态声明，不可在运行时修改。
 * - 通过 options 叠加动态约束（requiredKeys / allowUnknownKeys 等）。
 * - 仅校验参数合法性，不做任何值转换或副作用。
 */
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
    required: [
      ...(rootSchema.required ?? []),
      ...(options.requiredKeys ?? []),
    ],
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
 * 将结构化 issue 列表压缩为单条短文本，适合直接嵌入 still 的 validate / fix 提示词。
 *
 * 设计考量：
 * - 使用简短分号分隔而非换行，节约 token（常见场景每条仅约 10-20 token）。
 * - maxCount 默认 5，超出部分折叠为"另有 N 个问题"，避免提示词膨胀。
 * - 调用方可按需调大 maxCount，或对 issues 过滤后再传入此函数。
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