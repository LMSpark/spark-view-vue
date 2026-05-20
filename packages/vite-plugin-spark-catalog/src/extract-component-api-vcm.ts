/**
 * vue-component-meta 驱动的组件 API 提取器
 *
 * 这个文件只负责两件事：
 * 1. 复用 vue-component-meta checker，避免重复创建带来的高成本。
 * 2. 把 VCM 返回的组件元信息整理成 component-catalog 使用的稳定结构。
 *
 * 提取范围聚焦在目录真正消费的字段：
 * - Props：名称、类型、必填、默认值、JSDoc、可选 schema
 * - Events：名称、签名、JSDoc、可选 schema
 *
 * @module extract-component-api-vcm
 * @since 2.0.0
 */

import { readFileSync } from 'node:fs'
import { createChecker } from 'vue-component-meta'
import type { ComponentMetaChecker, MetaCheckerOptions, PropertyMetaSchema } from 'vue-component-meta'

import type {
  PropEntry,
  EmitEntry,
  EmitPayloadParamDoc,
  PropSchema,
  PropSchemaProperty,
  JsonSchemaTypeName,
} from './component-catalog-schema'

import { nestedSchemaCollector } from './nested-schema-collector'

/* ==========================================================================
 * 1) checker 缓存
 *
 * createChecker 会加载 tsconfig 并初始化完整类型系统，开销较大。
 * 这里按 tsconfigPath 做单例缓存，命中时直接复用。
 * ========================================================================== */

let _checker: ComponentMetaChecker | null = null
let _tsconfigPath: string | null = null
let _checkerOptionsKey: string | null = null

type SupportedCheckerOptions = Pick<MetaCheckerOptions, 'rawType' | 'schema' | 'noDeclarations'>

export type VcmCheckerOptions = Partial<SupportedCheckerOptions>

const DEFAULT_CHECKER_OPTIONS: SupportedCheckerOptions = {
  // 默认同时启用 rawType + schema：
  // - rawType: 追溯工作区声明文件、字符串字面量 union 等
  // - schema: 展开结构化 prop 类型（如 ActionsNode / ToolbarNode）供 catalog 落盘
  // convertSchema 仍按扁平规则过滤 noise（单层 object / 仅字面量 enum）
  rawType: true,
  schema: true,
  noDeclarations: false,
}

function resolveCheckerOptions(options: VcmCheckerOptions): SupportedCheckerOptions {
  return {
    ...DEFAULT_CHECKER_OPTIONS,
    ...options,
  }
}

function stringifySchemaOption(schema: SupportedCheckerOptions['schema']): string {
  if (schema === undefined || typeof schema === 'boolean') return String(schema)
  const normalizedIgnores = (schema.ignore ?? [])
    .map((item) => (typeof item === 'string' ? `s:${item}` : 'f:dynamic'))
    .sort()
  return `object(${normalizedIgnores.join(',')})`
}

function buildCheckerOptionsKey(options: SupportedCheckerOptions): string {
  return `rawType:${String(options.rawType)}|schema:${stringifySchemaOption(options.schema)}|noDeclarations:${String(options.noDeclarations)}`
}

/**
 * 创建或复用 vue-component-meta checker
 *
 * checker 绑定 tsconfig，文件范围由 tsconfig.catalog.json 的 include 决定。
 * 这里默认使用 `rawType: true` + `schema: true` + `noDeclarations: false`。
 * - rawType: true 允许从 `getTypeObject()` 获取 ts.Type 做类型来源分析
 * - schema: true 依赖 VCM schema 展开结构，再由 catalog 过滤低信息量噪音
 * - noDeclarations: false 保留声明位置信息，便于调试/溯源
 * 同一进程内复用同一个 checker（重建开销大）。
 */
export function getOrCreateChecker(
  tsconfigPath: string,
  checkerOptions: VcmCheckerOptions = {},
): ComponentMetaChecker {
  const resolvedCheckerOptions = resolveCheckerOptions(checkerOptions)
  const optionsKey = buildCheckerOptionsKey(resolvedCheckerOptions)

  if (_checker !== null && _tsconfigPath === tsconfigPath && _checkerOptionsKey === optionsKey) {
    return _checker
  }

  _checker = createChecker(tsconfigPath, resolvedCheckerOptions)
  _tsconfigPath = tsconfigPath
  _checkerOptionsKey = optionsKey
  return _checker
}

/** 清除 checker 缓存（测试用） */
export function resetChecker(): void {
  _checker = null
  _tsconfigPath = null
  _checkerOptionsKey = null
}

/* ==========================================================================
 * 2) 提取结果结构
 * ========================================================================== */

export type VcmApiDescriptor = {
  /** kebab-case 注册名 */
  type: string
  /** 相对于项目 root 的文件路径 */
  filePath: string
  props: PropEntry[]
  emits: EmitEntry[]
}

export type ExtractComponentApiVcmOptions = {
  /** 是否保留 VCM 注入的全局 props（class/style/key/ref 等） */
  includeGlobalProps?: boolean
}

type SchemaOwner = 'workspace' | 'external'

type RawTypeDeclarationLike = {
  getSourceFile?: () => { fileName?: string }
  getFullText?: () => string
  jsDoc?: Array<{
    comment?: unknown
    getFullText?: () => string
  }>
}

type RawTypeSymbolLike = {
  declarations?: RawTypeDeclarationLike[]
}

function isRawTypeSymbolLike(value: unknown): value is RawTypeSymbolLike {
  if (value === null || typeof value !== 'object') return false
  const declarations = readObjectProperty(value, 'declarations')
  return declarations === undefined || Array.isArray(declarations)
}

type PropEntryWithIdentity = PropEntry & {
  __schemaIdentityKey?: string
  __schemaOwner?: SchemaOwner
  /** 自动从 rawType 中提取的字符串字面量枚举 variants（引号包裹，如 `"\"start\""`） */
  __enumVariants?: string[]
  /** 从 JSDoc @enumValue 标签提取的枚举值说明。 */
  __enumValueDocs?: Record<string, EnumValueDoc>
}

type EnumValueDoc = {
  title?: string
  description?: string
}

type EmitDoc = {
  description?: string
  params: EmitPayloadParamDoc[]
}

const normalizedWorkspaceRoot = `${process.cwd().replace(/\\/g, '/').toLowerCase()}/`

function readObjectProperty(value: object, key: string): unknown {
  let current: object | null = value
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key)
    if (descriptor !== undefined) return descriptor.value
    const prototype: unknown = Object.getPrototypeOf(current)
    current = prototype !== null && typeof prototype === 'object' ? prototype : null
  }
  return undefined
}

function callBooleanMethod(owner: object, key: string): boolean {
  const method = readObjectProperty(owner, key)
  if (typeof method !== 'function') return false
  const result: unknown = Reflect.apply(method, owner, [])
  return result === true
}

/* ==========================================================================
 * 3) 消费 VCM rawType
 *
 * rawType 不是这里额外推导出来的，而是 VCM 在 `rawType: true` 时原生提供的底层 TS 类型对象。
 * 当前主流程同时启用 VCM `rawType` 与 `schema`，这里用 rawType 补足来源与字面量信息。
 * VCM 自带的 schema 有时不足以区分“工作区内类型”与“外部依赖类型”，
 * 所以这里继续消费 rawType，追溯声明文件并整理出两类辅助信息：
 * - owner：类型来源于 workspace 还是 external
 * - identityKey：对象 schema 的稳定身份标识
 * ========================================================================== */

/**
 * 从 TS rawType 中提取字符串字面量 union 的所有 variants。
 *
 * 仅当 rawType 是一个纯字符串字面量 union（允许包含 undefined）时才返回结果；
 * 遇到非字符串字面量成员（boolean、number 等）时返回 undefined，不生成枚举 schema。
 * 返回值已用双引号包裹，例如 `["\"start\"", "\"center\""]`。
 */
function getRawTypeStringLiteralVariants(rawType: unknown): string[] | undefined {
  if (rawType === null || typeof rawType !== 'object') return undefined
  if (!callBooleanMethod(rawType, 'isUnion')) return undefined
  const rawTypes = readObjectProperty(rawType, 'types')
  if (!Array.isArray(rawTypes)) return undefined
  const typeItems: readonly unknown[] = rawTypes
  const variants: string[] = []
  for (const t of typeItems) {
    if (t === null || typeof t !== 'object') return undefined
    const intrinsicName = readObjectProperty(t, 'intrinsicName')
    const value = readObjectProperty(t, 'value')
    if (intrinsicName === 'undefined') continue
    if (!callBooleanMethod(t, 'isStringLiteral')) return undefined
    if (typeof value !== 'string') return undefined
    variants.push(`"${value}"`)
  }
  return variants.length > 0 ? variants : undefined
}

function getRawTypeSymbols(rawType: unknown): RawTypeSymbolLike[] {
  if (rawType === null || typeof rawType !== 'object') return []

  const symbols = [
    readObjectProperty(rawType, 'symbol'),
    readObjectProperty(rawType, 'aliasSymbol'),
  ].filter(isRawTypeSymbolLike)

  return symbols
}

function getRawTypeDeclarationFiles(rawType: unknown): string[] {
  const files: string[] = []
  for (const symbol of getRawTypeSymbols(rawType)) {
    for (const declaration of symbol.declarations ?? []) {
      const sourceFile = declaration.getSourceFile?.()
      const fileName = sourceFile?.fileName
      if (typeof fileName === 'string' && fileName.length > 0) {
        files.push(fileName.replace(/\\/g, '/'))
      }
    }
  }
  return [...new Set(files)]
}

function getRawTypeOwner(rawType: unknown): SchemaOwner | undefined {
  const declarationFiles = getRawTypeDeclarationFiles(rawType)
  if (declarationFiles.length === 0) return undefined

  const hasWorkspaceDeclaration = declarationFiles.some((filePath) => {
    const normalizedPath = filePath.toLowerCase()
    return normalizedPath.startsWith(normalizedWorkspaceRoot) && !normalizedPath.includes('/node_modules/')
  })
  return hasWorkspaceDeclaration ? 'workspace' : 'external'
}

function getRawTypeIdentityKey(rawType: unknown): string | undefined {
  if (rawType === null || typeof rawType !== 'object') return undefined

  const rawTypeId = readObjectProperty(rawType, 'id')
  return typeof rawTypeId === 'number' ? `ts:${rawTypeId}` : undefined
}

function getJsDocNodeDescription(node: { comment?: unknown; getFullText?: () => string }): string | undefined {
  if (typeof node.comment === 'string') {
    const direct = normalizeDescription(node.comment).trim()
    if (direct.length > 0) return direct
  }

  const text = node.getFullText?.()
  if (typeof text !== 'string' || text.trim().length === 0) return undefined
  return parseJsDocComment(text.split('\n')).description
}

function getDeclarationJsDocDescription(declaration: RawTypeDeclarationLike): string | undefined {
  for (const jsDoc of declaration.jsDoc ?? []) {
    const description = getJsDocNodeDescription(jsDoc)
    if (description !== undefined) return description
  }

  const fullText = declaration.getFullText?.()
  const leadingComment = fullText?.match(/\/\*\*[\s\S]*?\*\//u)?.[0]
  if (leadingComment === undefined) return undefined
  return parseJsDocComment(leadingComment.split('\n')).description
}

function getRawTypeJsDocDescription(rawType: unknown): string | undefined {
  for (const symbol of getRawTypeSymbols(rawType)) {
    for (const declaration of symbol.declarations ?? []) {
      const description = getDeclarationJsDocDescription(declaration)
      if (description !== undefined) {
        const clean = stripCatalogDocTags(description).trim()
        if (clean.length > 0) return clean
      }
    }
  }
  return undefined
}

/* ==========================================================================
 * 4) 对外提取入口
 *
 * extractComponentApiVcm：提取单个组件
 * extractAllComponentApisVcm：批量提取组件
 * ========================================================================== */

/**
 * 使用 vue-component-meta 提取单个组件的完整 API
 *
 * @param checker    - VCM checker 实例
 * @param absPath    - Vue 文件绝对路径（正斜杠）
 * @param relativePath - 相对路径（用于输出）
 * @param componentType - 组件注册名（kebab-case）
 */
export function extractComponentApiVcm(
  checker: ComponentMetaChecker,
  absPath: string,
  relativePath: string,
  componentType: string,
  options: ExtractComponentApiVcmOptions = {},
): VcmApiDescriptor | null {
  const normalizedPath = absPath.replace(/\\/g, '/')
  const { includeGlobalProps = false } = options

  try {
    const meta = checker.getComponentMeta(normalizedPath)
    const sourceEmitDocs = readSourceEmitDocs(normalizedPath)

    // 默认过滤 VCM 自动注入的全局 props，例如 class/style/key/ref。
    // 同时过滤带 @internal JSDoc 标签的 props（由 Vue 源码声明，不属于配置层面）。
    // 另外剔除 TSX 监听器透传伪属性（onUpdate:*），避免与 emits 重复污染目录。
    const sourceProps = (includeGlobalProps ? meta.props : meta.props.filter(p => !p.global))
      .filter(p => !p.tags.some(t => t.name === 'internal'))
      .filter(p => !p.name.startsWith('onUpdate:'))
    const props: PropEntryWithIdentity[] = sourceProps.map(buildPropEntry)

    const emits: EmitEntry[] = meta.events.map((event) => buildEmitEntry(event, sourceEmitDocs.get(event.name)))

    return {
      type: componentType,
      filePath: relativePath,
      props,
      emits,
    }
  } catch {
    return null
  }
}

/**
 * 批量提取多个组件。
 *
 * 保持“单组件失败不拖垮全量生成”的策略：
 * 某个组件解析失败时，extractComponentApiVcm 会返回 null，这里直接跳过。
 */
export function extractAllComponentApisVcm(
  checker: ComponentMetaChecker,
  components: Array<{ absolutePath: string; relativePath: string; skillType: string }>,
  options: ExtractComponentApiVcmOptions = {},
): VcmApiDescriptor[] {
  const results: VcmApiDescriptor[] = []
  for (const comp of components) {
    const api = extractComponentApiVcm(
      checker,
      comp.absolutePath,
      comp.relativePath,
      comp.skillType,
      options,
    )
    if (api !== null) results.push(api)
  }
  return results
}

/* ==========================================================================
 * 5) props / emits 组装
 *
 * 这一层把 VCM 元信息收敛为 catalog 需要的字段，保持“只保留目录实际消费的值”。
 * ========================================================================== */

function buildPropEntry(p: {
  name: string
  type: string
  required: boolean
  default?: string | undefined
  description: string
  tags: Array<{ name: string; text?: string }>
  schema?: PropertyMetaSchema
  rawType?: unknown
  getTypeObject?: (() => unknown) | undefined
}): PropEntryWithIdentity {
  const description = normalizeDescription(p.description)
  const enumValueDocs = {
    ...parseEnumValueDocs(description),
    ...parseEnumValueDocsFromTags(p.tags),
  }
  const tagExamples = parseCatalogExamplesFromTags(p.tags)
  const descriptionExamples = parseCatalogExamplesFromDescription(description)
  const defaultTagText = parseCatalogDefaultTextFromTags(p.tags) ?? parseCatalogDefaultTextFromDescription(description)
  const cleanDescription = stripCatalogDocTags(description)
  const entry: PropEntryWithIdentity = {
    name: p.name,
    type: p.type,
    required: p.required,
  }

  if (isMeaningfulDefaultText(p.default)) entry.default = p.default.trim()
  else if (defaultTagText !== undefined) entry.default = defaultTagText
  if (cleanDescription !== '') entry.description = cleanDescription
  const examples = [...descriptionExamples, ...tagExamples]
  if (examples.length > 0) entry.examples = examples
  if (Object.keys(enumValueDocs).length > 0) entry.__enumValueDocs = enumValueDocs

  const typeObject = resolveTypeObject(p)

  // 从 rawType 自动提取字符串字面量 union variants（如 InlineAlign、InlineJustify 等命名枚举）
  const enumVariants = getRawTypeStringLiteralVariants(typeObject)
  if (enumVariants !== undefined) {
    entry.__enumVariants = enumVariants
  }

  // schema 为纯字符串时不落盘；只有真正的结构信息才保留。
  const rootSchemaDescription = cleanDescription !== ''
    ? cleanDescription
    : getRawTypeJsDocDescription(typeObject)
  const schema = convertSchema(p.schema, rootSchemaDescription)
  if (schema === undefined) return entry

  entry.schema = schema

  // 这里不是生成 rawType，而是消费 VCM 已经给出的 rawType，提取稳定身份。
  if (isObjectSchema(schema)) {
    const schemaIdentityKey = getRawTypeIdentityKey(typeObject)
    if (schemaIdentityKey !== undefined) entry.__schemaIdentityKey = schemaIdentityKey
  }

  // 对象 / 数组 schema 才有继续利用 rawType 追踪来源的意义。
  if (isObjectSchema(schema) || schema.type === 'array') {
    const schemaOwner = getRawTypeOwner(typeObject)
    if (schemaOwner !== undefined) entry.__schemaOwner = schemaOwner
  }

  return entry
}

function resolveTypeObject(p: { rawType?: unknown; getTypeObject?: (() => unknown) | undefined }): unknown {
  if (typeof p.getTypeObject === 'function') {
    try {
      return p.getTypeObject()
    } catch {
      // ignore and fallback to rawType
    }
  }
  return p.rawType
}

function buildEmitEntry(e: {
  name: string
  type: string
  description: string
  schema?: PropertyMetaSchema[]
}, doc?: EmitDoc): EmitEntry {
  const description = normalizeDescription(e.description)
  const entry: EmitEntry = {
    name: e.name,
    type: e.type,
  }

  entry.description = doc?.description ?? (description !== '' ? description : createGenericEmitDescription(e.name))
  const paramDocs = mergeEmitParamDocs(doc?.params ?? [], parseEmitParamsFromType(e.type), e.name)
  if (paramDocs.length > 0) entry.__payloadParamDocs = paramDocs

  // 事件参数 schema 是数组；逐项转换后仅保留有效结构。
  if (Array.isArray(e.schema) && e.schema.length > 0) {
    const converted = e.schema.map((schema) => convertSchema(schema)).filter(isNotUndefined)
    if (converted.length > 0) entry.__payloadSchemas = converted
  }

  return entry
}

function isMeaningfulDefaultText(value: string | undefined): value is string {
  if (value === undefined) return false
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed !== 'undefined' && trimmed !== 'void 0'
}

function readSourceEmitDocs(filePath: string): Map<string, EmitDoc> {
  try {
    return extractDefineEmitsDocs(readFileSync(filePath, 'utf8'))
  } catch {
    return new Map()
  }
}

function extractDefineEmitsDocs(source: string): Map<string, EmitDoc> {
  const content = readDefineEmitsTypeArgument(source)
  if (content === undefined) return new Map()

  const docs = new Map<string, EmitDoc>()
  let pendingComment: string[] = []
  let inComment = false

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (line.startsWith('/**')) {
      inComment = true
      pendingComment = [line]
      if (line.includes('*/')) inComment = false
      continue
    }
    if (inComment) {
      pendingComment.push(line)
      if (line.includes('*/')) inComment = false
      continue
    }

    const event = parseEmitDeclarationLine(line)
    if (event === undefined) continue
    const parsedComment = parseJsDocComment(pendingComment)
    const params = event.params.map((param) => {
      const description = parsedComment.params.get(param)
      return {
        name: param,
        ...(description !== undefined ? { description } : {}),
      }
    })
    docs.set(event.name, {
      ...(parsedComment.description !== undefined ? { description: parsedComment.description } : {}),
      params,
    })
    pendingComment = []
  }

  return docs
}

function readDefineEmitsTypeArgument(source: string): string | undefined {
  const marker = 'defineEmits<'
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) return undefined

  const start = markerIndex + marker.length
  let depth = 1
  for (const [offset, char] of Array.from(source.slice(start)).entries()) {
    const index = start + offset
    const previous = source[index - 1]
    if (char === '<') depth++
    else if (char === '>' && previous !== '=') {
      depth--
      if (depth === 0) return source.slice(start, index)
    }
  }
  return undefined
}

function parseEmitDeclarationLine(line: string): { name: string; params: string[] } | undefined {
  const callMatch = /^\(e:\s*['"]([^'"]+)['"]\s*(?:,\s*(.*?))?\)\s*:/u.exec(line)
  if (callMatch !== null) {
    const name = callMatch[1]
    if (name === undefined) return undefined
    return { name, params: parseEmitParamNames(callMatch[2] ?? '') }
  }

  const tupleMatch = /^(?:['"]([^'"]+)['"]|([A-Za-z_$][\w$-]*))\s*:\s*\[(.*)\]/u.exec(line)
  if (tupleMatch !== null) {
    const name = tupleMatch[1] ?? tupleMatch[2]
    if (name === undefined) return undefined
    return { name, params: parseEmitParamNames(tupleMatch[3] ?? '') }
  }

  return undefined
}

function parseEmitParamNames(text: string): string[] {
  if (text.trim().length === 0) return []
  return splitTopLevel(text, ',')
    .map(parseEmitParamName)
    .filter((name): name is string => name !== undefined)
}

function parseJsDocComment(lines: string[]): { description?: string; params: Map<string, string> } {
  const descriptionLines: string[] = []
  const params = new Map<string, string>()

  for (const rawLine of lines) {
    const line = rawLine
      .replace(/^\/\*\*/u, '')
      .replace(/\*\/$/u, '')
      .replace(/^\*\s?/u, '')
      .trim()
    if (line.length === 0) continue

    const paramMatch = /^@param\s+(\w+)\s+(.+)$/u.exec(line)
    if (paramMatch?.[1] !== undefined && paramMatch[2] !== undefined) {
      params.set(paramMatch[1], paramMatch[2].trim().replace(/^-\s*/u, ''))
      continue
    }
    if (!line.startsWith('@')) descriptionLines.push(line)
  }

  const description = descriptionLines.join(' ').trim()
  return {
    ...(description.length > 0 ? { description } : {}),
    params,
  }
}

function parseEmitParamsFromType(type: string | undefined): EmitPayloadParamDoc[] {
  if (type === undefined) return []
  const match = /^\[(.*)\]$/u.exec(type.trim())
  if (match?.[1] === undefined || match[1].trim() === '') return []
  return splitTopLevel(match[1], ',')
    .map(parseEmitParamName)
    .filter((name): name is string => name !== undefined)
    .map((name) => ({ name }))
}

function splitTopLevel(text: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let depth = 0
  for (const char of text) {
    if (char === '<' || char === '(' || char === '[' || char === '{') depth++
    else if (char === '>' || char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1)
    if (char === delimiter && depth === 0) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim().length > 0) result.push(current.trim())
  return result
}

function normalizeCatalogTypeText(typeText: string): string {
  const trimmed = typeText.trim()
  if (trimmed.length === 0) return trimmed

  let normalized = trimmed
  let previous: string
  do {
    previous = normalized
    normalized = normalized
      .replace(/\s*\|\s*undefined\b/gu, '')
      .replace(/\bundefined\s*\|\s*/gu, '')
      .trim()
  } while (normalized !== previous && normalized.length > 0)

  const parts = splitTopLevel(normalized, '|')
  if (parts.length <= 1) return normalized.length > 0 ? normalized : trimmed

  const filteredParts = parts.filter((part) => part.trim() !== 'undefined')
  if (filteredParts.length === 0) return trimmed
  if (filteredParts.length === parts.length) return normalized
  return filteredParts.join(' | ')
}

function parseEmitParamName(text: string): string | undefined {
  const match = /^(?:\.\.\.)?([A-Za-z_$][\w$]*)\??\s*:/u.exec(text.trim())
  return match?.[1]
}

function mergeEmitParamDocs(sourceDocs: EmitPayloadParamDoc[], fallbackDocs: EmitPayloadParamDoc[], eventName: string): EmitPayloadParamDoc[] {
  const names = sourceDocs.length > 0 ? sourceDocs.map((param) => param.name) : fallbackDocs.map((param) => param.name)
  return names.map((name, index) => {
    const source = sourceDocs.find((param) => param.name === name) ?? sourceDocs[index]
    const fallback = fallbackDocs.find((param) => param.name === name) ?? fallbackDocs[index]
    return {
      name: source?.name ?? fallback?.name ?? `payload${index + 1}`,
      description: source?.description ?? createGenericEmitParamDescription(source?.name ?? fallback?.name ?? `payload${index + 1}`, eventName),
    }
  })
}

function createGenericEmitDescription(eventName: string): string {
  if (eventName.startsWith('update:')) {
    const target = eventName.slice('update:'.length)
    return `Emitted when ${target} changes; 用于同步父级绑定值。`
  }
  const knownDescriptions: Record<string, string> = {
    change: 'Value or active item changed; 用于通知父级同步当前状态。',
    click: 'User clicked the component; 用于处理点击交互。',
    close: 'Close requested; 用户关闭当前组件或浮层。',
    open: 'Open requested; 用户或程序打开当前组件。',
    confirm: 'Confirm requested; 用户确认当前操作。',
    cancel: 'Cancel requested; 用户取消当前操作。',
    finish: 'Flow finished; 当前流程、步骤或倒计时已完成。',
    select: 'Option selected; 用户选择了一个候选项。',
    search: 'Search keyword changed; 用户输入搜索关键字。',
    back: 'Back requested; 用户触发返回操作。',
    clear: 'Clear requested; 用户请求清空当前内容。',
  }
  const known = knownDescriptions[eventName]
  if (known !== undefined) return known
  const readable = eventName.replace(/[-:]/g, ' ')
  return `Emitted when ${readable} occurs; 用于通知父级处理该事件。`
}

function createGenericEmitParamDescription(paramName: string, eventName: string): string {
  if (paramName === 'value' && eventName.startsWith('update:')) return 'Next value for the bound model; 用于同步父级状态。'
  if (paramName === 'value') return 'Next event value; 表示本次事件后的当前值。'
  if (paramName === 'checked') return 'Next checked state; true 表示已选中。'
  if (paramName === 'current') return 'Current step index; 表示当前步骤或当前位置。'
  if (paramName === 'href') return 'Anchor href; 用于定位目标锚点。'
  if (paramName === 'e' || paramName === 'event') return 'Native browser event; 用于读取原始交互上下文。'
  if (paramName === 'item' || paramName === 'option') return 'Selected option item; 表示用户选择的候选项。'
  if (paramName === 'pattern') return 'Current search keyword; 表示用户输入的搜索文本。'
  if (paramName === 'prefix') return 'Active trigger prefix; 表示触发当前候选项的前缀。'
  if (paramName === 'index') return 'Target index; 用于定位当前项。'
  if (paramName === 'page') return 'Current page number; 用于分页状态同步。'
  if (paramName === 'active') return 'Current active state; true 表示已激活。'
  if (paramName === 'payload') return 'Event payload; 承载本次事件的上下文数据。'
  return `${paramName} payload; 用于描述 ${eventName} 事件的参数。`
}

/* ==========================================================================
 * 6) schema 转换
 *
 * VCM 的 PropertyMetaSchema 是一个通用联合结构，这里投影为标准 JSON Schema 子集。
 * ========================================================================== */

function inferJsonSchemaTypes(typeText: string): JsonSchemaTypeName[] {
  const parts = splitTopLevel(normalizeCatalogTypeText(typeText), '|')
    .map(part => part.trim())
    .filter(part => part.length > 0 && part !== 'undefined')

  if (parts.length === 0) return []
  if (parts.every(part => /^['"].*['"]$/u.test(part))) return ['string']

  const types: JsonSchemaTypeName[] = []
  for (const part of parts) {
    const normalized = part.toLowerCase()
    if (normalized === 'null') pushUniqueType(types, 'null')
    else if (/^['"].*['"]$/u.test(part) || normalized.includes('string')) pushUniqueType(types, 'string')
    else if (normalized.includes('boolean')) pushUniqueType(types, 'boolean')
    else if (normalized.includes('number') || normalized.includes('integer') || normalized.includes('float')) pushUniqueType(types, 'number')
    else if (normalized.includes('[]') || normalized.includes('array<') || normalized.includes('readonlyarray<')) pushUniqueType(types, 'array')
    else if (normalized.includes('record<') || normalized.includes('object') || normalized.includes('{')) pushUniqueType(types, 'object')
  }

  return types
}

function pushUniqueType(types: JsonSchemaTypeName[], type: JsonSchemaTypeName): void {
  if (!types.includes(type)) types.push(type)
}

function schemaForTsType(typeText: string): PropSchema {
  const schema: PropSchema = {}
  const jsonTypes = inferJsonSchemaTypes(normalizeCatalogTypeText(typeText))
  if (jsonTypes.length === 1) {
    const [jsonType] = jsonTypes
    if (jsonType !== undefined) schema.type = jsonType
  } else if (jsonTypes.length > 1) schema.type = jsonTypes
  return schema
}

function parseEnumVariant(variant: string): string | number | boolean | null | undefined {
  if (/^".*"$/u.test(variant)) {
    try {
      const parsed: unknown = JSON.parse(variant)
      if (typeof parsed === 'string') return parsed
      return undefined
    } catch {
      return variant.slice(1, -1)
    }
  }
  if (/^'.*'$/u.test(variant)) return variant.slice(1, -1)
  if (variant === 'true') return true
  if (variant === 'false') return false
  if (variant === 'null') return null
  if (/^-?\d+(?:\.\d+)?$/u.test(variant)) return Number(variant)
  return undefined
}

function createEnumSchema(typeText: string, variants: string[]): PropSchema | undefined {
  const normalizedTypeText = normalizeCatalogTypeText(typeText)
  const enumValues = variants
    .map(parseEnumVariant)
    .filter((value): value is Exclude<ReturnType<typeof parseEnumVariant>, undefined> => value !== undefined)

  if (enumValues.length === 0) return undefined

  const valueTypes = new Set(enumValues.map(value => value === null ? 'null' : typeof value))
  const schema: PropSchema = {
    title: normalizedTypeText,
    enum: enumValues,
  }
  if (valueTypes.size === 1) {
    const [valueType] = [...valueTypes]
    if (valueType === 'string' || valueType === 'boolean' || valueType === 'null') schema.type = valueType
    else if (valueType === 'number') schema.type = 'number'
  }
  return schema
}

function parseEnumValueDocs(description: string): Record<string, EnumValueDoc> {
  const docs: Record<string, EnumValueDoc> = {}
  for (const rawLine of description.split('\n')) {
    const line = rawLine.trim()
    const match = /^@enumValue\s+(\S+)\s+(.+)$/u.exec(line)
    if (match === null) continue

    const [, value, rawBody] = match
    if (value === undefined || rawBody === undefined) continue
    const body = rawBody.trim()
    const titleMatch = /^([^:：-]+)\s*[:：-]\s*(.+)$/u.exec(body)
    if (titleMatch?.[1] === undefined || titleMatch[2] === undefined) {
      docs[value] = { description: body }
    } else {
      docs[value] = { title: titleMatch[1].trim(), description: titleMatch[2].trim() }
    }
  }
  return docs
}

function parseCatalogDocValue(text: string | undefined): unknown {
  const value = text?.trim()
  if (value === undefined || value.length === 0) return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  if (/^-?\d+(?:\.\d+)?$/u.test(value)) return Number(value)
  const quoted = /^(['"])([\s\S]*)\1$/u.exec(value)
  if (quoted?.[2] !== undefined) return quoted[2]
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function parseCatalogExamplesFromTags(tags: Array<{ name: string; text?: string }>): unknown[] {
  return tags
    .filter((tag) => tag.name === 'example' || tag.name === 'catalogExample')
    .map((tag) => parseCatalogDocValue(tag.text))
    .filter((value) => value !== undefined)
}

function parseCatalogExamplesFromDescription(description: string): unknown[] {
  return description
    .split('\n')
    .map((line) => /^@(?:example|catalogExample)\s+(.+)$/u.exec(line.trim())?.[1])
    .map(parseCatalogDocValue)
    .filter((value) => value !== undefined)
}

function parseCatalogDefaultTextFromTags(tags: Array<{ name: string; text?: string }>): string | undefined {
  return tags.find((tag) => tag.name === 'default' || tag.name === 'defaultValue')?.text?.trim()
}

function parseCatalogDefaultTextFromDescription(description: string): string | undefined {
  for (const rawLine of description.split('\n')) {
    const match = /^@(?:default|defaultValue)\s+(.+)$/u.exec(rawLine.trim())
    if (match?.[1] !== undefined) return match[1].trim()
  }
  return undefined
}

function parseEnumValueDocsFromTags(tags: Array<{ name: string; text?: string }>): Record<string, EnumValueDoc> {
  const docs: Record<string, EnumValueDoc> = {}
  for (const tag of tags) {
    if (tag.name !== 'enumValue') continue
    const text = tag.text?.trim()
    if (text === undefined || text.length === 0) continue
    const match = /^(\S+)\s+(.+)$/u.exec(text)
    if (match === null) continue

    const [, value, rawBody] = match
    if (value === undefined || rawBody === undefined) continue
    const body = rawBody.trim()
    const titleMatch = /^([^:：-]+)\s*[:：-]\s*(.+)$/u.exec(body)
    if (titleMatch?.[1] === undefined || titleMatch[2] === undefined) {
      docs[value] = { description: body }
    } else {
      docs[value] = { title: titleMatch[1].trim(), description: titleMatch[2].trim() }
    }
  }
  return docs
}

function stripCatalogDocTags(description: string): string {
  return description
    .split('\n')
    .filter((line) => !/^@(?:enumValue|example|catalogExample|default|defaultValue)\b/u.test(line.trim()))
    .join('\n')
    .trim()
}

function createUnionSchema(typeText: string, variants: string[]): PropSchema {
  const normalizedTypeText = normalizeCatalogTypeText(typeText)
  const anyOf = variants.map(schemaForTsType)
  return anyOf.length === 1
    ? { title: normalizedTypeText, ...anyOf[0] }
    : {
        title: normalizedTypeText,
        anyOf,
      }
}

function isObjectSchema(schema: PropSchema | undefined): schema is PropSchema & {
  type: 'object'
  properties: Record<string, PropSchemaProperty>
} {
  return schema?.type === 'object' && schema.properties !== undefined
}

/**
 * 将 VCM 的 PropertyMetaSchema 转换为我们的 PropSchema
 *
 * 设计约束：
 * - 纯字符串类型不生成 schema，避免无意义噪音
 * - object 只保留一层 properties，避免把目录变成深度结构镜像
 * - enum / array / event 使用 JSON Schema 标准字段表达，不再使用自定义 kind
 */
function withSchemaDescription(schema: PropSchema, description: string | undefined): PropSchema {
  const normalized = description?.trim()
  if (normalized === undefined || normalized.length === 0 || schema.description !== undefined) return schema
  return { ...schema, description: normalized }
}

function isVcmNoiseDescription(description: string): boolean {
  return description.includes('Gets or sets the length of the array')
}

function readVcmSchemaDescription(vcmSchema: PropertyMetaSchema): string | undefined {
  if (typeof vcmSchema === 'string') return undefined
  const rawDescription = readObjectProperty(vcmSchema, 'description')
  const description = normalizeDescription(typeof rawDescription === 'string' ? rawDescription : '').trim()
  if (description.length === 0 || isVcmNoiseDescription(description)) return undefined
  return stripCatalogDocTags(description)
}

function createArrayItemsSchema(itemSchemas: PropertyMetaSchema[]): PropSchema | undefined {
  const convertedItems = itemSchemas
    .map((item) => {
      if (typeof item === 'string') return schemaForTsType(item)
      return convertSchema(item) ?? schemaForTsType(item.type)
    })
    .filter((schema) => Object.keys(schema).length > 0)

  if (convertedItems.length === 1) return convertedItems[0]
  if (convertedItems.length > 1) return { anyOf: convertedItems }

  const itemTypes = uniqueSchemaTypes(itemSchemas)
  if (itemTypes.length === 0) return undefined
  return createUnionSchema('array item', itemTypes)
}

function convertSchema(vcmSchema: PropertyMetaSchema | undefined, rootDescription?: string): PropSchema | undefined {
  if (vcmSchema === undefined) {
    return undefined
  }

  if (typeof vcmSchema === 'string') {
    return undefined
  }

  const schemaDescription = rootDescription ?? readVcmSchemaDescription(vcmSchema)

  if (vcmSchema.kind === 'object' && vcmSchema.schema !== undefined) {
    const properties: Record<string, PropSchemaProperty> = {}
    const required: string[] = []
    let hasProperties = false
    for (const [key, propMeta] of Object.entries(vcmSchema.schema)) {
      hasProperties = true
      const childSchema: PropSchemaProperty = schemaForTsType(propMeta.type)
      const description = normalizeDescription(propMeta.description)
      if (description !== '') childSchema.description = description
      if (propMeta.required === true) required.push(key)

      // 递归处理嵌套 schema（如 ActionsNode.props 中的结构化对象类型）
      const nestedPropSchema = convertSchema(propMeta.schema, description !== '' ? stripCatalogDocTags(description) : undefined)
      if (nestedPropSchema !== undefined) {
        // 暂存完整的嵌套 schema，供后续处理时提升到 schema type 池
        childSchema.__nestedSchema = nestedPropSchema
      }
      // 如果是 object schema，记录到收集器以供共池化处理
      if (isObjectSchema(nestedPropSchema)) {
        nestedSchemaCollector.add(propMeta.type, nestedPropSchema)
      }
      properties[key] = childSchema
    }
    if (hasProperties) {
      return withSchemaDescription({
        title: normalizeCatalogTypeText(vcmSchema.type),
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      }, schemaDescription)
    }
  }

  if (vcmSchema.kind === 'enum' && vcmSchema.schema !== undefined) {
    // 情形 1：XxxNode | undefined —— 仅含一个 object variant 时，提升该 object 为 prop schema，
    //        让 AI 直接拿到结构节点（如 ActionsNode { type, props, children }）的一层展开。
    const objectVariants = vcmSchema.schema.filter(
      (variant): variant is Extract<PropertyMetaSchema, { kind: 'object' }> =>
        typeof variant !== 'string' && variant.kind === 'object',
    )
    const nonUndefinedStringVariants = vcmSchema.schema.filter(
      (variant) => typeof variant === 'string' && variant !== 'undefined',
    )
    if (objectVariants.length === 1 && nonUndefinedStringVariants.length === 0) {
      return convertSchema(objectVariants[0], schemaDescription)
    }

    // 情形 2：普通 enum —— 仅在包含字符串字面量时保留，避免把 `string | undefined` 等
    //        原始类型 union 污染目录（此类 prop 本就无 schema 价值，交给 type 字符串即可）。
    const variants = uniqueSchemaTypes(vcmSchema.schema)
    const hasLiteralVariant = variants.some(
      (variant) => /^".*"$/.test(variant) || /^'.*'$/.test(variant),
    )
    if (hasLiteralVariant && variants.length > 0) {
      const enumSchema = createEnumSchema(vcmSchema.type, variants)
      if (enumSchema !== undefined) {
        return withSchemaDescription(enumSchema, schemaDescription)
      }
    }
  }

  if (vcmSchema.kind === 'array' && vcmSchema.schema !== undefined) {
    const items = createArrayItemsSchema(vcmSchema.schema)
    return withSchemaDescription({
      title: normalizeCatalogTypeText(vcmSchema.type),
      type: 'array',
      ...(items !== undefined ? { items } : {}),
    }, schemaDescription)
  }

  if (vcmSchema.kind === 'event' && vcmSchema.schema !== undefined) {
    const paramTypes = uniqueSchemaTypes(vcmSchema.schema)
    if (paramTypes.length > 0) {
      return withSchemaDescription({
        title: normalizeCatalogTypeText(vcmSchema.type),
        type: 'array',
        prefixItems: paramTypes.map(schemaForTsType),
      }, schemaDescription)
    }
  }

  return undefined
}

function normalizeDescription(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function uniqueSchemaTypes(schemas: PropertyMetaSchema[]): string[] {
  const values = schemas
    .map((schema) => (typeof schema === 'string' ? schema : schema.type))
    .map(normalizeCatalogTypeText)
    .filter((value) => value.length > 0 && value !== 'undefined')
  return [...new Set(values)]
}

/* ==========================================================================
 * 7) 通用小工具
 * ========================================================================= */

/** 过滤掉 undefined，便于数组链式处理中保留精确类型。 */
function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
