/**
 * AI 能力模块元数据生成器。
 *
 * 这条链路和组件 catalog 共享“源码 JSDoc -> 构建期元数据”的 VCM 思路，
 * 但提取对象是领域能力 class，而不是 Vue SFC 组件。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, relative, basename } from 'node:path'
import ts from 'typescript'
import { createChecker } from 'vue-component-meta'
import {
  tsTypeToJsonSchema,
  type GeneratedJsonSchema,
  type GeneratedJsonSchemaObject,
  type JsonSchemaDescriptionTodo,
  type TsTypeToJsonSchemaOptions,
} from './ts-type-to-json-schema'
import { compactModuleMetadataApiRegistry } from './module-api-registry-compact'
import { buildModuleMetadataPooledDocument, buildModuleMetadataRuntimeDocument } from './module-schema-pool'

export type ModuleAbilityMetadataGeneratorOptions = {
  sources: readonly string[]
  outFile?: string
  moduleOutFile?: string
  vcmCatalogOutFile?: string
  runtimeOutFile?: string
  moduleRuntimeOutFile?: string
  apiRoots?: readonly string[]
  trace?: boolean
  extractResults?: boolean
  extractResultSchemas?: boolean
  reflectionMode?: ModuleMetadataReflectionMode
  writeFiles?: boolean}

export type ModuleMetadataReflectionMode = 'source' | 'type-entry'

type ModuleDocTag = {
  name: string
  text: string
  node: ts.Node
  paramName?: string}

type ModuleSourceRef = {
  file: string
  line: number}

type ModuleSourceProvenance = ModuleSourceRef & {
  className: string
  memberName?: string
  typeEntryFile?: string}

type ModuleEntityMetadata = {
  id: string
  label: string}

type ModuleAttackSurfaceMetadata = {
  id: string
  risk: string
  description: string}

type ModuleMutationMetadata = {
  resource: string
  mode: string
  description: string}

type ModuleActionParameterMetadata = {
  name: string
  type: string
  optional: boolean
  description?: string}

type ModuleFailureModeMetadata = {
  code: string
  when: string
  fix: string}

type JsDocMeta = {
  raw?: string
  summary: string
  tags: readonly JsDocTagMeta[]}

type JsDocTagMeta = {
  name: string
  text: string
  paramName?: string}

type ModuleActionMetadata = {
  name: string
  methodName: string
  description?: string
  params: readonly ModuleActionParameterMetadata[]
  returnType?: string
  usageRules: readonly string[]
  requiredBeforeCall?: readonly string[]
  failureModes: readonly ModuleFailureModeMetadata[]
  examples: readonly unknown[]
  attackSurfaces: readonly ModuleAttackSurfaceMetadata[]
  guards: readonly string[]
  mutations: readonly ModuleMutationMetadata[]
  source: ModuleSourceRef}

type ModuleConstructorMetadata = {
  description?: string
  params: readonly ModuleActionParameterMetadata[]
  source: ModuleSourceRef}

type ModuleAbilityMetadata = {
  abilityId: string
  kind?: string
  name?: string
  description?: string
  entity?: ModuleEntityMetadata
  scope?: string
  attackSurfaces: readonly ModuleAttackSurfaceMetadata[]
  trustBoundaries: readonly string[]
  guards: readonly string[]
  mutations: readonly ModuleMutationMetadata[]
  constructorSignature?: ModuleConstructorMetadata
  actions: readonly ModuleActionMetadata[]
  source: ModuleSourceRef & { className: string }}

type AiApiResultApiRefMetadata = {
  resultPath: readonly string[]
  api: AiApiObjectMetadata}

type AiApiActionMetadata = {
  name: string
  methodName: string
  description: string
  jsdoc?: JsDocMeta
  provenance?: ModuleSourceProvenance
  paramsSchema: GeneratedJsonSchema
  takesContext?: boolean
  resultSchema?: GeneratedJsonSchema
  resultApis?: readonly AiApiResultApiRefMetadata[]
  usageRules?: readonly string[]
  requiredBeforeCall?: readonly string[]
  failureModes?: readonly ModuleFailureModeMetadata[]
  example?: unknown
  examples?: readonly unknown[]
  antiExamples?: readonly unknown[]
}


type AiApiAttributeMetadata = {
  name: string
  description: string
  jsdoc?: JsDocMeta
  provenance?: ModuleSourceProvenance
  schema: GeneratedJsonSchema
  readable: boolean
  writable: boolean
  api?: AiApiObjectMetadata}

type AiApiConstructorMetadata = {
  description: string
  jsdoc?: JsDocMeta
  provenance?: ModuleSourceProvenance
  paramsSchema: GeneratedJsonSchema}

type AiApiObjectMetadata = {
  className: string
  kind: string
  name: string
  description: string
  jsdoc?: JsDocMeta
  provenance?: ModuleSourceProvenance
  constructorSignature?: AiApiConstructorMetadata
  attributes?: readonly AiApiAttributeMetadata[]
  actions: readonly AiApiActionMetadata[]}

type AiModuleMetadataJson = {
  schemaVersion: 1
  rootApi: AiApiObjectMetadata}

type VcmComponentMeta = {
  name: string
  description: string
  type: unknown
  props: readonly unknown[]
  events: readonly unknown[]
  slots: readonly unknown[]
  exposed: readonly unknown[]}

type ModuleMetadataTrace = {
  enabled: boolean
  extractResults: boolean
  extractResultSchemas: boolean
  log: (message: string) => void}

type ApiObjectExtractionState = {
  readonly root: string
  readonly reflectionMode: ModuleMetadataReflectionMode
  readonly apiByContextKey: Map<string, MutableAiApiObjectMetadata>
  readonly expandingKeys: Set<string>
  readonly sourceClassIndex: SourceClassIndex
  readonly typeEntryFileBySourceClassKey: Map<string, string>
  readonly schemaDescriptionTodoLog: ModuleMetadataSchemaDescriptionTodoLogEntry[]}

type SourceClassIndex = ReadonlyMap<string, readonly ts.ClassDeclaration[]>

type MutableAiApiObjectMetadata = {
  className: string
  kind: string
  name: string
  description: string
  jsdoc?: JsDocMeta
  provenance?: ModuleSourceProvenance
  constructorSignature?: AiApiConstructorMetadata
  attributes?: AiApiAttributeMetadata[]
  actions: AiApiActionMetadata[]}

function createModuleMetadataTrace(
  enabled: boolean,
  extractResults = false,
  extractResultSchemas = false,
): ModuleMetadataTrace {
  return {
    enabled,
    extractResults,
    extractResultSchemas,
    log(message) {
      if (!enabled) return
      console.info(`[module-metadata] ${message}`)
    },
  }
}

export type ModuleMetadataDiagnosticFinding = {
  level: 'info' | 'warn' | 'error'
  rule: string
  target: string
  message: string
  fix?: string}

export type ModuleMetadataDiagnosticActionSummary = {
  kind: string
  action: string
  paramsPropertyCount: number
  resultApiCount: number
  emptySchemaNodeCount: number
  maxSchemaDepth: number}

export type ModuleMetadataDiagnosticModuleSummary = {
  kind: string
  name: string
  actionCount: number
  directResultApiKinds: readonly string[]
  resultApiCount: number
  emptySchemaNodeCount: number
  maxSchemaDepth: number
  actions: readonly ModuleMetadataDiagnosticActionSummary[]}

export type ModuleMetadataDiagnostics = {
  abilityCount: number
  moduleCount: number
  actionCount: number
  resultApiCount: number
  referencedApiKinds: readonly string[]
  emptySchemaNodeCount: number
  maxSchemaDepth: number
  modules: readonly ModuleMetadataDiagnosticModuleSummary[]
  findings: readonly ModuleMetadataDiagnosticFinding[]}

export type ModuleMetadataJsDocTodoLogEntry = {
  kind: string
  className: string
  memberType: 'class' | 'constructor' | 'attribute' | 'method'
  memberName?: string
  file: string
  line: number
  reasons: readonly string[]
  expectedParams?: readonly string[]
  documentedParams?: readonly string[]
  typeEntryFile?: string}

export type ModuleMetadataSchemaDescriptionTodoLogEntry = {
  kind: string
  className: string
  memberType: 'constructor' | 'attribute' | 'method'
  memberName?: string
  schemaRole: 'params' | 'attribute' | 'return'
  path: readonly string[]
  propertyName: string
  typeText: string
  file: string
  line: number
  declarationOwnerKind: JsonSchemaDescriptionTodo['declarationOwnerKind']
  declarationOwnerName?: string
  reason: string}

export type ModuleMetadataGenerationResult = {
  abilities: readonly ModuleAbilityMetadata[]
  outFile?: string
  moduleMetadata: readonly AiModuleMetadataJson[]
  diagnostics: ModuleMetadataDiagnostics
  runtimeAudit: ModuleMetadataRuntimeAudit
  jsdocTodoLog: readonly ModuleMetadataJsDocTodoLogEntry[]
  schemaDescriptionTodoLog: readonly ModuleMetadataSchemaDescriptionTodoLogEntry[]
  moduleOutFile?: string
  vcmCatalogOutFile?: string
  vcmCatalogElementCount?: number}

export type ModuleMetadataRuntimeAudit = ReturnType<typeof createRuntimeGeneratedApiObjectMetadataAudit>

export type ModuleMetadataBuildConsistencyIssue = Readonly<{
  code: string
  path: string
  message: string
}>

const MODULE_METADATA_SCHEMA_VERSION = 1
const MODULE_ATTACK_SURFACE_RISKS = ['low', 'medium', 'high', 'critical'] as const
const MODULE_MUTATION_MODES = ['read', 'write', 'delete', 'execute', 'read-write'] as const
const MODULE_ATTACK_SURFACE_RISK_VALUES: ReadonlySet<string> = new Set(MODULE_ATTACK_SURFACE_RISKS)
const MODULE_MUTATION_MODE_VALUES: ReadonlySet<string> = new Set(MODULE_MUTATION_MODES)

const PAGE_DESIGN_MODULE_METADATA_SOURCES = [
  'packages/spark-project-model/src/project/project-model.ts',
  'packages/spark-project-model/src/page/config-page.ts',
  'packages/spark-data/src/dataset-crud-tool.ts',
  'packages/spark-data/src/node-tree/spark-node-tree.ts',
] as const

const PAGE_DESIGN_MODULE_METADATA_API_ROOTS = ['ProjectModel'] as const

const PAGE_DESIGN_MODEL_METADATA_OUT_FILE =
  'src/services/page-design/page-design-module-metadata.generated.json'

export function generatePageDesignModuleMetadata(root: string): ModuleMetadataGenerationResult {
  return generateModuleAbilityMetadata(root, {
    sources: PAGE_DESIGN_MODULE_METADATA_SOURCES,
    vcmCatalogOutFile: PAGE_DESIGN_MODEL_METADATA_OUT_FILE,
    apiRoots: PAGE_DESIGN_MODULE_METADATA_API_ROOTS,
  })
}

export function generateModuleAbilityMetadata(
  root: string,
  options: ModuleAbilityMetadataGeneratorOptions,
): ModuleMetadataGenerationResult {
  const rootFiles = options.sources.map(source => resolve(root, source))
  const reflectionMode = options.reflectionMode ?? 'source'
  const program = ts.createProgram(rootFiles, createModuleMetadataCompilerOptions(root, reflectionMode))
  const checker = program.getTypeChecker()
  const sourceClassIndex = createSourceClassIndex(program)
  const trace = createModuleMetadataTrace(
    options.trace === true,
    options.extractResults === true,
    options.extractResultSchemas === true,
  )
  const schemaDescriptionTodoEntries: ModuleMetadataSchemaDescriptionTodoLogEntry[] = []
  const abilities = rootFiles.flatMap((file) => {
    const sourceFile = program.getSourceFile(file)
    if (sourceFile === undefined) {
      throw new Error(`module metadata source not found: ${file}`)
    }
    return extractAbilityMetadata(root, sourceFile, checker, trace)
  })
  const moduleMetadata = rootFiles.flatMap((file) => {
    const sourceFile = program.getSourceFile(file)
    if (sourceFile === undefined) {
      throw new Error(`module metadata source not found: ${file}`)
    }
    return extractApiObjectMetadata(
      root,
      sourceFile,
      checker,
      new Set(options.apiRoots ?? []),
      trace,
      sourceClassIndex,
      reflectionMode,
      schemaDescriptionTodoEntries,
    )
  })
  validateGeneratedAbilities(abilities)
  const diagnostics = createModuleMetadataDiagnostics(abilities, moduleMetadata)
  const runtimeAudit = createRuntimeGeneratedApiObjectMetadataAudit(moduleMetadata)
  const jsdocTodoLog = collectModuleMetadataJsDocTodoLog(moduleMetadata)
  const schemaDescriptionTodoLog = dedupeSchemaDescriptionTodoLog(schemaDescriptionTodoEntries)
  const vcmCatalogElementCount = moduleMetadata.length

  const outFile = options.outFile === undefined ? undefined : resolve(root, options.outFile)
  const moduleOutFile = options.moduleOutFile === undefined ? undefined : resolve(root, options.moduleOutFile)
  const vcmCatalogOutFile = options.vcmCatalogOutFile === undefined ? undefined : resolve(root, options.vcmCatalogOutFile)
  const runtimeOutFile = options.runtimeOutFile === undefined ? undefined : resolve(root, options.runtimeOutFile)
  const moduleRuntimeOutFile = options.moduleRuntimeOutFile === undefined ? undefined : resolve(root, options.moduleRuntimeOutFile)
  if (options.writeFiles !== false) {
    if (outFile !== undefined) {
      mkdirSync(dirname(outFile), { recursive: true })
      writeFileSync(outFile, formatGeneratedMetadata(abilities, diagnostics), 'utf8')
    }
    if (moduleOutFile !== undefined) {
      mkdirSync(dirname(moduleOutFile), { recursive: true })
      writeFileSync(moduleOutFile, formatGeneratedApiObjectMetadata(moduleMetadata, diagnostics), 'utf8')
    }
    if (vcmCatalogOutFile !== undefined) {
      mkdirSync(dirname(vcmCatalogOutFile), { recursive: true })
      const vcmMeta = extractVcmRootClassSchemas(root, options.sources, moduleMetadata)
      writeFileSync(vcmCatalogOutFile, formatVcmObjectElementCatalog(moduleMetadata, vcmMeta), 'utf8')
    }
    if (runtimeOutFile !== undefined) {
      mkdirSync(dirname(runtimeOutFile), { recursive: true })
      writeFileSync(runtimeOutFile, formatRuntimeGeneratedMetadata(abilities), 'utf8')
    }
    if (moduleRuntimeOutFile !== undefined) {
      mkdirSync(dirname(moduleRuntimeOutFile), { recursive: true })
      writeFileSync(moduleRuntimeOutFile, formatRuntimeGeneratedApiObjectMetadata(moduleMetadata, { pretty: false }), 'utf8')
      writeFileSync(
        resolveRuntimeMetadataTsOutFile(moduleRuntimeOutFile),
        formatRuntimeMetadataTsModule(basename(moduleRuntimeOutFile)),
        'utf8',
      )
    }
  }
  return {
    abilities,
    ...(outFile === undefined ? {} : { outFile }),
    moduleMetadata,
    diagnostics,
    runtimeAudit,
    jsdocTodoLog,
    schemaDescriptionTodoLog,
    ...(moduleOutFile === undefined ? {} : { moduleOutFile }),
    ...(vcmCatalogOutFile === undefined ? {} : { vcmCatalogOutFile }),
    ...(vcmCatalogOutFile === undefined ? {} : { vcmCatalogElementCount }),
  }
}

function createModuleMetadataCompilerOptions(
  root: string,
  reflectionMode: ModuleMetadataReflectionMode,
): ts.CompilerOptions {
  const fallback: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
  }
  if (reflectionMode === 'type-entry') return fallback
  const tsconfigPath = resolve(root, 'tsconfig.catalog.json')
  if (!existsSync(tsconfigPath)) return fallback

  const config = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (config.error !== undefined) {
    throw new Error(`Failed to read ${tsconfigPath}: ${formatTsDiagnostic(config.error)}`)
  }

  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(tsconfigPath), fallback, tsconfigPath)
  if (parsed.errors.length > 0) {
    throw new Error(`Failed to parse ${tsconfigPath}: ${parsed.errors.map(formatTsDiagnostic).join('\n')}`)
  }

  return {
    ...parsed.options,
    noEmit: true,
    skipLibCheck: true,
  }
}

function formatTsDiagnostic(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
}

export function compareModuleMetadataForBuildConsistency(
  sourceModules: readonly AiModuleMetadataJson[],
  buildEntryModules: readonly AiModuleMetadataJson[],
): readonly ModuleMetadataBuildConsistencyIssue[] {
  const issues: ModuleMetadataBuildConsistencyIssue[] = []
  const sourceApis = collectApiMetadataByKind(sourceModules)
  const buildEntryApis = collectApiMetadataByKind(buildEntryModules)
  compareBuildValue(issues, 'apiKinds', [...sourceApis.keys()].sort().join(','), [...buildEntryApis.keys()].sort().join(','))

  for (const [kind, sourceApi] of sourceApis) {
    const buildEntryApi = buildEntryApis.get(kind)
    if (buildEntryApi === undefined) continue
    compareApiMetadata(issues, kind, sourceApi, buildEntryApi)
  }
  return issues
}

function collectApiMetadataByKind(modules: readonly AiModuleMetadataJson[]): Map<string, AiApiObjectMetadata> {
  const result = new Map<string, AiApiObjectMetadata>()
  const pending = modules.map(module => module.rootApi)
  while (pending.length > 0) {
    const api = pending.shift()
    if (api === undefined || result.has(api.kind)) continue
    result.set(api.kind, api)
    for (const action of api.actions) {
      for (const ref of action.resultApis ?? []) pending.push(ref.api)
    }
    for (const attribute of api.attributes ?? []) {
      if (attribute.api !== undefined) pending.push(attribute.api)
    }
  }
  return result
}

function compareApiMetadata(
  issues: ModuleMetadataBuildConsistencyIssue[],
  kind: string,
  sourceApi: AiApiObjectMetadata,
  buildEntryApi: AiApiObjectMetadata,
): void {
  compareBuildValue(issues, `${kind}.className`, sourceApi.className, buildEntryApi.className)
  compareBuildValue(issues, `${kind}.name`, sourceApi.name, buildEntryApi.name)
  compareBuildValue(issues, `${kind}.jsdoc.summary`, sourceApi.jsdoc?.summary, buildEntryApi.jsdoc?.summary)
  compareBuildValue(
    issues,
    `${kind}.constructor.jsdoc.summary`,
    sourceApi.constructorSignature?.jsdoc?.summary,
    buildEntryApi.constructorSignature?.jsdoc?.summary,
  )
  compareBuildValue(
    issues,
    `${kind}.attributes`,
    (sourceApi.attributes ?? []).map(attribute => attribute.name).sort().join(','),
    (buildEntryApi.attributes ?? []).map(attribute => attribute.name).sort().join(','),
  )
  compareBuildValue(
    issues,
    `${kind}.actions`,
    sourceApi.actions.map(action => action.name).sort().join(','),
    buildEntryApi.actions.map(action => action.name).sort().join(','),
  )
}

function compareBuildValue(
  issues: ModuleMetadataBuildConsistencyIssue[],
  path: string,
  sourceValue: unknown,
  buildEntryValue: unknown,
): void {
  if (sourceValue === buildEntryValue) return
  issues.push({
    code: 'MODULE_METADATA_BUILD_CONSISTENCY_MISMATCH',
    path,
    message: `源码反射与构建产物入口不一致: source=${String(sourceValue)} buildEntry=${String(buildEntryValue)}`,
  })
}

function extractAbilityMetadata(
  root: string,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  trace: ModuleMetadataTrace,
): ModuleAbilityMetadata[] {
  const abilities: ModuleAbilityMetadata[] = []

  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node)) {
      const tags = readDocTags(node, sourceFile)
      const abilityId = firstTagText(tags, 'moduleAbility')
      if (abilityId !== undefined) {
        abilities.push(createAbilityMetadata({
          root,
          sourceFile,
          checker,
          node,
          tags,
          abilityId,
          trace,
        }))
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return abilities
}

function extractApiObjectMetadata(
  root: string,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  apiRoots: ReadonlySet<string>,
  trace: ModuleMetadataTrace,
  sourceClassIndex: SourceClassIndex,
  reflectionMode: ModuleMetadataReflectionMode,
  schemaDescriptionTodoLog: ModuleMetadataSchemaDescriptionTodoLogEntry[],
): AiModuleMetadataJson[] {
  const modules: AiModuleMetadataJson[] = []
  const state = createApiObjectExtractionState(root, sourceClassIndex, reflectionMode, schemaDescriptionTodoLog)

  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node)) {
      const className = node.name?.text
      if (apiRoots.size > 0 && (className === undefined || !apiRoots.has(className))) {
        ts.forEachChild(node, visit)
        return
      }
      const api = createApiObjectMetadata(checker, node, new Set(), trace, state)
      if (api !== undefined) {
        modules.push({ schemaVersion: MODULE_METADATA_SCHEMA_VERSION, rootApi: api })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return modules
}

function createApiObjectExtractionState(
  root = process.cwd(),
  sourceClassIndex: SourceClassIndex = new Map(),
  reflectionMode: ModuleMetadataReflectionMode = 'source',
  schemaDescriptionTodoLog: ModuleMetadataSchemaDescriptionTodoLogEntry[] = [],
): ApiObjectExtractionState {
  return {
    root,
    reflectionMode,
    apiByContextKey: new Map(),
    expandingKeys: new Set(),
    sourceClassIndex,
    typeEntryFileBySourceClassKey: new Map(),
    schemaDescriptionTodoLog,
  }
}

function createSourceClassIndex(program: ts.Program): SourceClassIndex {
  const index = new Map<string, ts.ClassDeclaration[]>()
  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue
    visitSourceClassDeclarations(sourceFile, (declaration) => {
      const className = declaration.name?.text
      if (className === undefined) return
      const declarations = index.get(className) ?? []
      declarations.push(declaration)
      index.set(className, declarations)
    })
  }
  return index
}

function visitSourceClassDeclarations(
  node: ts.Node,
  visit: (declaration: ts.ClassDeclaration) => void,
): void {
  if (ts.isClassDeclaration(node)) visit(node)
  ts.forEachChild(node, child => visitSourceClassDeclarations(child, visit))
}

function apiObjectContextKey(symbol: ts.Symbol, visited: ReadonlySet<ts.Symbol>): string {
  const target = symbolIdentityKey(symbol)
  const ancestors = [...visited].map(symbolIdentityKey).sort().join(',')
  return `${target}|${ancestors}`
}

function symbolIdentityKey(symbol: ts.Symbol): string {
  const declaration = symbol.declarations?.[0]
  if (declaration === undefined) return symbol.getName()
  const sourceFile = declaration.getSourceFile()
  return `${normalizePath(sourceFile.fileName)}:${String(declaration.pos)}:${symbol.getName()}`
}

function createApiObjectMetadata(
  checker: ts.TypeChecker,
  node: ts.ClassDeclaration,
  visited: Set<ts.Symbol>,
  trace: ModuleMetadataTrace = createModuleMetadataTrace(false),
  state: ApiObjectExtractionState = createApiObjectExtractionState(),
): AiApiObjectMetadata | undefined {
  const tags = readDocTags(node, node.getSourceFile())
  const className = node.name?.text
  if (className === undefined) return undefined
  const symbol = node.name === undefined ? undefined : checker.getSymbolAtLocation(node.name)
  const cacheVisited = new Set(visited)
  if (symbol !== undefined) cacheVisited.add(symbol)
  const contextKey = symbol === undefined ? undefined : apiObjectContextKey(symbol, cacheVisited)
  if (contextKey !== undefined) {
    const cached = state.apiByContextKey.get(contextKey)
    if (cached !== undefined) return cached
  }
  const summary = readSummary(node)
  const explicitKind = firstTagText(tags, 'moduleKind')
  if (explicitKind === undefined && summary === undefined) return undefined
  const kind = explicitKind ?? kebabCase(className)
  const description = firstTagText(tags, 'moduleDescription') ?? summary ?? kind
  const jsdoc = createJsDocMeta(node, tags, description)
  trace.log(`class ${className} -> kind=${kind}`)
  const api: MutableAiApiObjectMetadata = {
    className,
    kind,
    name: firstTagText(tags, 'moduleName') ?? className,
    description,
    ...(jsdoc === undefined ? {} : { jsdoc }),
    provenance: createSourceProvenance(state, node, className),
    attributes: createApiAttributeMetadata(checker, node, cacheVisited, trace, state),
    actions: [],
  }
  const constructorSignature = createApiConstructorMetadata(checker, node, state)
  if (constructorSignature !== undefined) {
    api.constructorSignature = constructorSignature
  }
  if (contextKey !== undefined) {
    state.apiByContextKey.set(contextKey, api)
    state.expandingKeys.add(contextKey)
  }
  api.actions = node.members
    .filter(ts.isMethodDeclaration)
    .map(method => createApiActionMetadata(checker, method, cacheVisited, trace, state))
    .filter(isNotUndefined)
  if (contextKey !== undefined) {
    state.expandingKeys.delete(contextKey)
  }
  return api
}

function createApiConstructorMetadata(
  checker: ts.TypeChecker,
  node: ts.ClassDeclaration,
  state: ApiObjectExtractionState,
): AiApiConstructorMetadata | undefined {
  const constructorNode = node.members.find(ts.isConstructorDeclaration)
  if (constructorNode === undefined) return undefined
  const tags = readDocTags(constructorNode, constructorNode.getSourceFile())
  const description = readSummary(constructorNode) ?? `Create ${node.name?.text ?? 'module'} instance.`
  const jsdoc = createJsDocMeta(constructorNode, tags, description)
  const className = node.name?.text ?? '(anonymous)'
  return {
    description,
    ...(jsdoc === undefined ? {} : { jsdoc }),
    provenance: createSourceProvenance(state, constructorNode, className, 'constructor'),
    paramsSchema: generateParamsSchema(checker, constructorNode, tags, state, {
      kind: firstTagText(readDocTags(node, node.getSourceFile()), 'moduleKind') ?? kebabCase(className),
      className,
      memberType: 'constructor',
      memberName: 'constructor',
      schemaRole: 'params',
    }),
  }
}

function createApiAttributeMetadata(
  checker: ts.TypeChecker,
  node: ts.ClassDeclaration,
  visited: Set<ts.Symbol>,
  trace: ModuleMetadataTrace,
  state: ApiObjectExtractionState,
): AiApiAttributeMetadata[] {
  return collectApiAttributeMembers(checker, node, state)
    .map(member => createApiAttributeMetadataFromMember(checker, member, visited, trace, state))
    .filter(isNotUndefined)
}

type ApiAttributeMember = ts.PropertyDeclaration | ts.GetAccessorDeclaration

function collectApiAttributeMembers(
  checker: ts.TypeChecker,
  node: ts.ClassDeclaration,
  state: ApiObjectExtractionState,
): ApiAttributeMember[] {
  const baseClass = readBaseClassDeclaration(checker, node, state)
  const inherited = baseClass?.members.filter(isApiAttributeMember) ?? []
  const members = [...inherited, ...node.members.filter(isApiAttributeMember)]
  const seen = new Set<string>()
  const result: ApiAttributeMember[] = []
  for (const member of members) {
    const name = propertyNameText(member.name, member.getSourceFile())
    if (seen.has(name)) continue
    seen.add(name)
    result.push(member)
  }
  return result
}

function readBaseClassDeclaration(
  checker: ts.TypeChecker,
  node: ts.ClassDeclaration,
  state: ApiObjectExtractionState,
): ts.ClassDeclaration | undefined {
  const extendsClause = node.heritageClauses
    ?.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)
    ?.types[0]
  if (extendsClause === undefined) return undefined
  const baseType = checker.getTypeAtLocation(extendsClause.expression)
  return resolveClassDeclarationFromType(baseType, state)
}

function isApiAttributeMember(node: ts.ClassElement): node is ApiAttributeMember {
  return ts.isPropertyDeclaration(node) || ts.isGetAccessorDeclaration(node)
}

function createApiAttributeMetadataFromMember(
  checker: ts.TypeChecker,
  member: ApiAttributeMember,
  visited: Set<ts.Symbol>,
  trace: ModuleMetadataTrace,
  state: ApiObjectExtractionState,
): AiApiAttributeMetadata | undefined {
  const sourceFile = member.getSourceFile()
  const tags = readDocTags(member, sourceFile)
  if (hasIgnoreActionTag(tags)) return undefined
  if (!isPublicClassElement(member)) return undefined
  const description = readSummary(member)
  if (description === undefined) return undefined
  const name = propertyNameText(member.name, sourceFile)
  const schema = tsTypeToJsonSchema(checker, checker.getTypeAtLocation(member), createSchemaDescriptionAuditOptions(state, {
    kind: readApiKindFromClassMember(member),
    className: classNameForMember(member),
    memberType: 'attribute',
    memberName: name,
    schemaRole: 'attribute',
    rootPath: ['attributes', name, 'schema'],
  }))
  const api = createApiObjectFromType(checker, checker.getTypeAtLocation(member), visited, trace, state)
  const jsdoc = createJsDocMeta(member, tags, description)
  return {
    name,
    description,
    ...(jsdoc === undefined ? {} : { jsdoc }),
    provenance: createSourceProvenance(
      state,
      member,
      classNameForMember(member),
      name,
    ),
    schema,
    readable: true,
    writable: ts.isPropertyDeclaration(member) && !hasReadonlyModifier(member),
    ...(api === undefined ? {} : { api }),
  }
}

function isPublicClassElement(node: ts.ClassElement): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  return modifiers?.some(modifier =>
    modifier.kind === ts.SyntaxKind.PrivateKeyword
    || modifier.kind === ts.SyntaxKind.ProtectedKeyword
    || modifier.kind === ts.SyntaxKind.StaticKeyword) !== true
}

function hasReadonlyModifier(node: ts.PropertyDeclaration): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  return modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) === true
}

function createApiActionMetadata(
  checker: ts.TypeChecker,
  node: ts.MethodDeclaration,
  visited: Set<ts.Symbol>,
  trace: ModuleMetadataTrace,
  state: ApiObjectExtractionState,
): AiApiActionMetadata | undefined {
  const sourceFile = node.getSourceFile()
  const tags = readDocTags(node, sourceFile)
  const actionName = resolveActionName({ checker, node, tags })
  if (actionName === undefined) return undefined
  trace.log(`  action ${propertyNameText(node.name, sourceFile)}: start`)
  const startedAt = Date.now()
  trace.log(`  action ${actionName}: params schema`)
  const className = classNameForMember(node)
  const paramsSchema = generateParamsSchema(checker, node, tags, state, {
    kind: readApiKindFromClassMember(node),
    className,
    memberType: 'method',
    memberName: actionName,
    schemaRole: 'params',
  })
  const takesContext = hasLeadingContextParameter(checker, node)
  const resultType = trace.extractResults ? getInnerReturnType(checker, node) : undefined
  const resultSchema = !trace.extractResultSchemas || resultType === undefined || isVoidLikeType(resultType)
    ? undefined
    : tsTypeToJsonSchema(checker, resultType, createSchemaDescriptionAuditOptions(state, {
      kind: readApiKindFromClassMember(node),
      className,
      memberType: 'method',
      memberName: actionName,
      schemaRole: 'return',
      rootPath: ['methods', actionName, 'resultSchema'],
    }))
  let resultApis = hasDocTag(tags, 'vcmNoResultApis') || resultType === undefined || isVoidLikeType(resultType)
    ? undefined
    : discoverResultApis({ checker, type: resultType, resultPath: [], visited, trace, state, seenTypes: new Set() })
  if (resultApis === undefined && (hasDocTag(tags, 'vcmScriptOnly') || paramsSchemaUsesCallback(paramsSchema))) {
    const callbackResultApis = discoverMutatorCallbackResultApis({ checker, node, visited, trace, state })
    if (callbackResultApis.length > 0) {
      resultApis = callbackResultApis
    }
  }
  trace.log(`  action ${actionName}: done ${String(Date.now() - startedAt)}ms`)
  const usageRules = buildActionUsageRules(tags, paramsSchema)
  const failureModes = parseFailureModeTags(tags)
  const requiredBeforeCall = tagTexts(tags, 'requiredBeforeCall')
  const description = readSummary(node) ?? actionName
  const jsdoc = createJsDocMeta(node, tags, description)
  return {
    name: actionName,
    methodName: propertyNameText(node.name, sourceFile),
    description,
    ...(jsdoc === undefined ? {} : { jsdoc }),
    provenance: createSourceProvenance(
      state,
      node,
      className,
      propertyNameText(node.name, sourceFile),
    ),
    paramsSchema,
    takesContext,
    ...(resultSchema === undefined ? {} : { resultSchema }),
    ...(resultApis === undefined ? {} : { resultApis }),
    usageRules,
    ...(requiredBeforeCall.length === 0 ? {} : { requiredBeforeCall }),
    failureModes,
  }
}

function buildActionUsageRules(
  tags: readonly ModuleDocTag[],
  paramsSchema: GeneratedJsonSchema,
): string[] {
  const rules: string[] = []
  if (hasDocTag(tags, 'vcmScriptOnly') || paramsSchemaUsesCallback(paramsSchema)) {
    rules.push('Must use module_script; direct function call is not supported.')
  }
  for (const rule of tagTexts(tags, 'usageRule')) {
    if (rule.length > 0 && !rules.includes(rule)) {
      rules.push(rule)
    }
  }
  return rules
}

function parseFailureModeTags(tags: readonly ModuleDocTag[]): ModuleFailureModeMetadata[] {
  const modes: ModuleFailureModeMetadata[] = []
  for (const text of tagTexts(tags, 'failureMode')) {
    const parsed = parseFailureModeTagText(text)
    if (parsed !== undefined) {
      modes.push(parsed)
    }
  }
  return modes
}

function parseFailureModeTagText(text: string): ModuleFailureModeMetadata | undefined {
  const arrowIndex = text.indexOf('=>')
  if (arrowIndex <= 0) return undefined
  const left = text.slice(0, arrowIndex).trim()
  const fix = text.slice(arrowIndex + 2).trim()
  if (left.length === 0 || fix.length === 0) return undefined
  const spaceIndex = left.indexOf(' ')
  if (spaceIndex <= 0) return undefined
  const code = left.slice(0, spaceIndex).trim()
  const when = left.slice(spaceIndex + 1).trim()
  if (code.length === 0 || when.length === 0) return undefined
  return { code, when, fix }
}

function paramsSchemaUsesCallback(schema: GeneratedJsonSchema): boolean {
  if (!isGeneratedSchemaObject(schema) || schema.type !== 'object') return false
  const runSchema = schema.properties?.['run']
  if (runSchema === undefined) return false
  if (runSchema === true) return true
  if (isGeneratedSchemaObject(runSchema) && runSchema.type === 'function') return true
  return false
}

type DiscoverMutatorCallbackResultApisCommand = Readonly<{
  checker: ts.TypeChecker
  node: ts.MethodDeclaration
  visited: Set<ts.Symbol>
  trace: ModuleMetadataTrace
  state: ApiObjectExtractionState
}>

function discoverMutatorCallbackResultApis(
  command: DiscoverMutatorCallbackResultApisCommand,
): AiApiResultApiRefMetadata[] {
  for (const param of command.node.parameters) {
    if (isContextParameter(command.checker, param)) continue
    const callbackTargetType = readCallbackFirstArgumentType(command.checker, param)
    if (callbackTargetType === undefined) continue
    const refs = discoverResultApis({
      checker: command.checker,
      type: callbackTargetType,
      resultPath: [],
      visited: command.visited,
      trace: command.trace,
      state: command.state,
      seenTypes: new Set(),
    })
    if (refs.length > 0) return refs
  }
  return []
}

function readCallbackFirstArgumentType(
  checker: ts.TypeChecker,
  param: ts.ParameterDeclaration,
): ts.Type | undefined {
  const fromSyntax = readCallbackFirstArgumentTypeFromSyntax(checker, param.type)
  if (fromSyntax !== undefined) return fromSyntax

  const paramType = checker.getTypeAtLocation(param)
  const signatures = paramType.getCallSignatures()
  if (signatures.length === 0) return undefined
  for (const signature of signatures) {
    const callbackParams = signature.getParameters()
    if (callbackParams.length === 0) continue
    const firstCallbackParam = callbackParams[0]
    if (firstCallbackParam === undefined) continue
    const resolved = safeGetTypeOfSymbolAtLocation(checker, firstCallbackParam, param)
    if (resolved !== undefined) return resolved
  }
  return undefined
}

function readCallbackFirstArgumentTypeFromSyntax(
  checker: ts.TypeChecker,
  typeNode: ts.TypeNode | undefined,
): ts.Type | undefined {
  if (typeNode === undefined) return undefined
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return readCallbackFirstArgumentTypeFromSyntax(checker, typeNode.type)
  }
  if (!ts.isFunctionTypeNode(typeNode)) return undefined
  const firstParam = typeNode.parameters[0]
  if (firstParam === undefined) return undefined
  return checker.getTypeAtLocation(firstParam)
}

type ApiCallableDeclaration = ts.MethodDeclaration | ts.ConstructorDeclaration

type SchemaDescriptionAuditContext = Readonly<{
  kind: string
  className: string
  memberType: ModuleMetadataSchemaDescriptionTodoLogEntry['memberType']
  memberName?: string
  schemaRole: ModuleMetadataSchemaDescriptionTodoLogEntry['schemaRole']
  rootPath?: readonly string[]
  skipMissingDescriptionPathLengthLessThan?: number
}>

function mergeSchemaDescriptionAuditContext(
  context: SchemaDescriptionAuditContext | undefined,
  overrides: Pick<SchemaDescriptionAuditContext, 'rootPath' | 'skipMissingDescriptionPathLengthLessThan'>,
): SchemaDescriptionAuditContext | undefined {
  return context === undefined ? undefined : { ...context, ...overrides }
}

function createSchemaDescriptionAuditOptions(
  state: ApiObjectExtractionState | undefined,
  context: SchemaDescriptionAuditContext | undefined,
): TsTypeToJsonSchemaOptions {
  if (state === undefined || context === undefined) return {}
  return {
    ...(context.rootPath === undefined ? {} : { rootPath: context.rootPath }),
    ...(context.skipMissingDescriptionPathLengthLessThan === undefined
      ? {}
      : { skipMissingDescriptionPathLengthLessThan: context.skipMissingDescriptionPathLengthLessThan }),
    onMissingDescription: todo => pushSchemaDescriptionTodoLogEntry(state, context, todo),
  }
}

function pushSchemaDescriptionTodoLogEntry(
  state: ApiObjectExtractionState,
  context: SchemaDescriptionAuditContext,
  todo: JsonSchemaDescriptionTodo,
): void {
  state.schemaDescriptionTodoLog.push({
    kind: context.kind,
    className: context.className,
    memberType: context.memberType,
    ...(context.memberName === undefined ? {} : { memberName: context.memberName }),
    schemaRole: context.schemaRole,
    path: todo.path,
    propertyName: todo.propertyName,
    typeText: todo.typeText,
    file: normalizePath(relative(state.root, todo.file)),
    line: todo.line,
    declarationOwnerKind: todo.declarationOwnerKind,
    ...(todo.declarationOwnerName === undefined ? {} : { declarationOwnerName: todo.declarationOwnerName }),
    reason: 'missing source JSDoc/VCM description for schema field',
  })
}

function generateParamsSchema(
  checker: ts.TypeChecker,
  node: ApiCallableDeclaration,
  tags: readonly ModuleDocTag[] = [],
  state?: ApiObjectExtractionState,
  context?: SchemaDescriptionAuditContext,
): GeneratedJsonSchema {
  const paramDescriptions = readParamDescriptions(tags)
  const argsParam = readArgsObjectParameter(checker, node)
  if (argsParam !== undefined) {
    const schema = tsTypeToJsonSchema(checker, checker.getTypeAtLocation(argsParam), createSchemaDescriptionAuditOptions(state, mergeSchemaDescriptionAuditContext(context, {
      rootPath: ['params'],
      skipMissingDescriptionPathLengthLessThan: 3,
    })))
    return isGeneratedSchemaObject(schema) && schema.type === 'object'
      ? withTopLevelParamDescriptions(schema, paramDescriptions)
      : { type: 'object', properties: {}, required: [] }
  }
  const params = node.parameters.filter(param => !isContextParameter(checker, param))
  if (params.length === 0) return { type: 'object', properties: {}, required: [] }
  const properties: Record<string, GeneratedJsonSchema> = {}
  const required: string[] = []
  for (const param of params) {
    const name = propertyNameText(param.name, node.getSourceFile())
    properties[name] = withGeneratedSchemaDescription(
      tsTypeToJsonSchema(checker, checker.getTypeAtLocation(param), createSchemaDescriptionAuditOptions(state, mergeSchemaDescriptionAuditContext(context, {
        rootPath: ['params', name],
      }))),
      paramDescriptions.get(name),
    )
    if (param.questionToken === undefined && param.initializer === undefined) required.push(name)
  }
  return {
    type: 'object',
    properties,
    required,
  }
}

function withTopLevelParamDescriptions(
  schema: GeneratedJsonSchemaObject,
  descriptions: ReadonlyMap<string, string>,
): GeneratedJsonSchemaObject {
  if (schema.properties === undefined || descriptions.size === 0) return schema
  const properties: Record<string, GeneratedJsonSchema> = {}
  for (const [name, propertySchema] of Object.entries(schema.properties)) {
    properties[name] = withGeneratedSchemaDescription(propertySchema, descriptions.get(name))
  }
  return { ...schema, properties }
}

function withGeneratedSchemaDescription(
  schema: GeneratedJsonSchema,
  description: string | undefined,
): GeneratedJsonSchema {
  if (description === undefined || description.trim().length === 0 || schema === false) return schema
  if (schema === true) return { description }
  if (typeof schema['description'] === 'string' && schema['description'].trim().length > 0) return schema
  return { ...schema, description }
}

function readArgsObjectParameter(checker: ts.TypeChecker, node: ApiCallableDeclaration): ts.ParameterDeclaration | undefined {
  const [firstParam, secondParam] = node.parameters
  if (firstParam === undefined || secondParam === undefined) return undefined
  if (!isContextParameter(checker, firstParam)) return undefined
  const schema = tsTypeToJsonSchema(checker, checker.getTypeAtLocation(secondParam))
  return isGeneratedSchemaObject(schema) && schema.type === 'object' ? secondParam : undefined
}

function hasLeadingContextParameter(checker: ts.TypeChecker, node: ApiCallableDeclaration): boolean {
  const [firstParam] = node.parameters
  return firstParam !== undefined && isContextParameter(checker, firstParam)
}

function isContextParameter(checker: ts.TypeChecker, param: ts.ParameterDeclaration): boolean {
  const text = param.type?.getText(param.getSourceFile()) ?? checker.typeToString(checker.getTypeAtLocation(param))
  return /\b(AiModulePathContext|AiAgentRuntimeContext)\b/u.test(text)
}

function isActionReturnType(checker: ts.TypeChecker, node: ts.MethodDeclaration): boolean {
  void checker
  void node
  return true
}

function isVoidLikeType(type: ts.Type): boolean {
  return (type.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Never)) !== 0
}

function getInnerReturnType(checker: ts.TypeChecker, node: ts.MethodDeclaration): ts.Type | undefined {
  const signature = checker.getSignatureFromDeclaration(node)
  if (signature === undefined) return undefined
  return unwrapAiModuleResult(checker, checker.getReturnTypeOfSignature(signature))
}

function unwrapAiModuleResult(checker: ts.TypeChecker, type: ts.Type): ts.Type {
  const awaited = checker.getAwaitedType(type) ?? type
  if (!isTypeReferenceTo(checker, awaited, 'AiModuleResult')) return awaited
  const args = readTypeReferenceArguments(awaited)
  return args[0] ?? awaited
}

type DiscoverResultApisCommand = Readonly<{
  checker: ts.TypeChecker
  type: ts.Type
  resultPath: readonly string[]
  visited: Set<ts.Symbol>
  trace: ModuleMetadataTrace
  state: ApiObjectExtractionState
  seenTypes: Set<ts.Type>
  depth?: number
}>

const MAX_RESULT_API_DISCOVERY_DEPTH = 4

function discoverResultApis(command: DiscoverResultApisCommand): AiApiResultApiRefMetadata[] {
  const depth = command.depth ?? 0
  if (depth > MAX_RESULT_API_DISCOVERY_DEPTH) return []
  if (command.seenTypes.has(command.type)) return []
  command.seenTypes.add(command.type)
  const results: AiApiResultApiRefMetadata[] = []

  if (command.type.isUnion()) {
    for (const part of command.type.types) {
      if (isNullishType(part)) continue
      results.push(...discoverResultApis({
        ...command,
        type: part,
        depth,
        trace: command.trace,
        seenTypes: new Set(command.seenTypes),
      }))
    }
    return results
  }

  const api = createApiObjectFromType(command.checker, command.type, command.visited, command.trace, command.state)
  if (api !== undefined) {
    results.push({ resultPath: command.resultPath, api })
    return results
  }
  if (isClassInstanceType(command.type)) return results

  if (isArrayLike(command.checker, command.type)) return results

  for (const prop of command.type.getProperties()) {
    const declaration = prop.declarations?.[0]
    if (declaration === undefined) continue
    const propType = safeGetTypeOfSymbolAtLocation(command.checker, prop, declaration)
    if (propType === undefined) continue
    results.push(...discoverResultApis({
      checker: command.checker,
        type: propType,
        resultPath: [...command.resultPath, prop.name],
        visited: command.visited,
        depth: depth + 1,
        trace: command.trace,
        state: command.state,
        seenTypes: new Set(command.seenTypes),
      }))
  }
  return results
}

function isNullishType(type: ts.Type): boolean {
  return (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) !== 0
}

function createApiObjectFromType(
  checker: ts.TypeChecker,
  type: ts.Type,
  visited: Set<ts.Symbol>,
  trace: ModuleMetadataTrace,
  state: ApiObjectExtractionState,
): AiApiObjectMetadata | undefined {
  const classDeclaration = resolveClassDeclarationFromType(type, state)
  if (classDeclaration !== undefined) {
    const symbol = readClassDeclarationSymbol(checker, classDeclaration) ?? type.getSymbol()
    if (symbol === undefined || visited.has(symbol)) return undefined
    const tags = readDocTags(classDeclaration, classDeclaration.getSourceFile())
    if (firstTagText(tags, 'moduleKind') === undefined) return undefined
    const nextVisited = new Set(visited)
    nextVisited.add(symbol)
    return createApiObjectMetadata(checker, classDeclaration, nextVisited, trace, state)
  }
  return undefined
}

function isClassInstanceType(type: ts.Type): boolean {
  return type.getSymbol()?.declarations?.some(ts.isClassDeclaration) === true
}

function resolveClassDeclarationFromType(
  type: ts.Type,
  state: ApiObjectExtractionState,
): ts.ClassDeclaration | undefined {
  const declarations = type.getSymbol()?.declarations?.filter(ts.isClassDeclaration) ?? []
  return selectSourceClassDeclaration(declarations, state)
}

function selectSourceClassDeclaration(
  declarations: readonly ts.ClassDeclaration[],
  state: ApiObjectExtractionState,
): ts.ClassDeclaration | undefined {
  const sourceDeclaration = declarations.find(declaration => !declaration.getSourceFile().isDeclarationFile)
  if (sourceDeclaration !== undefined) return sourceDeclaration

  const declaration = declarations[0]
  if (declaration === undefined) return undefined
  if (state.reflectionMode === 'type-entry') return declaration
  const sourceDeclarations = state.sourceClassIndex.get(declaration.name?.text ?? '')
  if (sourceDeclarations === undefined || sourceDeclarations.length === 0) return declaration

  // 生成阶段以源码实现声明为 JSDoc/VCM 语义 SSOT；.d.ts 只作为类型入口。
  const matchedByPath = sourceDeclarations.find(source => isSourceForDeclarationFile(source, declaration))
  const resolved = matchedByPath ?? sourceDeclarations[0] ?? declaration
  if (resolved !== declaration) {
    state.typeEntryFileBySourceClassKey.set(
      sourceClassKey(resolved),
      sourceFilePath(state.root, declaration.getSourceFile()),
    )
  }
  return resolved
}

function isSourceForDeclarationFile(
  source: ts.ClassDeclaration,
  declaration: ts.ClassDeclaration,
): boolean {
  const sourcePath = normalizePath(source.getSourceFile().fileName)
  const declarationPath = normalizePath(declaration.getSourceFile().fileName)
  if (!declarationPath.endsWith('.d.ts')) return false
  const expectedSourcePath = declarationPath
    .replace('/dist/types/', '/src/')
    .replace(/\.d\.ts$/u, '.ts')
  return sourcePath === expectedSourcePath
}

function readClassDeclarationSymbol(
  checker: ts.TypeChecker,
  declaration: ts.ClassDeclaration,
): ts.Symbol | undefined {
  return declaration.name === undefined ? undefined : checker.getSymbolAtLocation(declaration.name)
}

type CreateAbilityMetadataRequest = {
  root: string
  sourceFile: ts.SourceFile
  checker: ts.TypeChecker
  node: ts.ClassDeclaration
  tags: readonly ModuleDocTag[]
  abilityId: string
  trace: ModuleMetadataTrace}

function createAbilityMetadata(request: CreateAbilityMetadataRequest): ModuleAbilityMetadata {
  const {
    root,
    sourceFile,
    checker,
    node,
    tags,
    abilityId,
    trace,
  } = request
  const source = sourceRef(root, sourceFile, node)
  const kind = firstTagText(tags, 'moduleKind')
  const name = firstTagText(tags, 'moduleName')
  const description = firstTagText(tags, 'moduleDescription') ?? readSummary(node)
  const entity = parseEntity(firstTag(tags, 'moduleEntity'))
  const scope = firstTagText(tags, 'moduleScope')

  const ability: ModuleAbilityMetadata = {
    abilityId,
    ...(kind !== undefined ? { kind } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(entity !== undefined ? { entity } : {}),
    ...(scope !== undefined ? { scope } : {}),
    attackSurfaces: parseAttackSurfaces(tags),
    trustBoundaries: tagTexts(tags, 'moduleTrustBoundary'),
    guards: tagTexts(tags, 'moduleGuard'),
    mutations: parseMutations(tags),
    actions: node.members
      .filter(ts.isMethodDeclaration)
      .map(member => createActionMetadata({ root, sourceFile, checker, node: member, trace }))
      .filter(isNotUndefined),
    source: {
      ...source,
      className: node.name?.text ?? '(anonymous)',
    },
  }
  const constructorSignature = createConstructorMetadata({ root, sourceFile, node })
  if (constructorSignature !== undefined) {
    ability.constructorSignature = constructorSignature
  }
  validateGeneratedActions(ability)
  return ability
}

function createConstructorMetadata(input: Readonly<{
  root: string
  sourceFile: ts.SourceFile
  node: ts.ClassDeclaration
}>): ModuleConstructorMetadata | undefined {
  const constructorNode = input.node.members.find(ts.isConstructorDeclaration)
  if (constructorNode === undefined) return undefined
  const tags = readDocTags(constructorNode, input.sourceFile)
  const description = readSummary(constructorNode)
  return {
    ...(description === undefined ? {} : { description }),
    params: constructorNode.parameters.map(param => createParameterMetadata(input.sourceFile, param, tags)),
    source: sourceRef(input.root, input.sourceFile, constructorNode),
  }
}

type ActionMetadataCreateInput = Readonly<{
  root: string
  sourceFile: ts.SourceFile
  checker: ts.TypeChecker
  node: ts.MethodDeclaration
  trace: ModuleMetadataTrace
}>

function createActionMetadata(input: ActionMetadataCreateInput): ModuleActionMetadata | undefined {
  const { root, sourceFile, checker, node } = input
  const tags = readDocTags(node, sourceFile)
  const actionName = resolveActionName({ checker, node, tags })
  if (actionName === undefined) return undefined
  input.trace.log(`  ability action ${actionName}`)

  const description = readSummary(node)
  const returnType = input.trace.extractResults ? readReturnType(checker, node) : undefined
  const usageRules = buildActionUsageRules(tags, { type: 'object', properties: {} })
  const failureModes = parseFailureModeTags(tags)
  const requiredBeforeCall = tagTexts(tags, 'requiredBeforeCall')

  return {
    name: actionName,
    methodName: propertyNameText(node.name, sourceFile),
    ...(description !== undefined ? { description } : {}),
    params: node.parameters.map(param => createParameterMetadata(sourceFile, param, tags)),
    ...(returnType !== undefined ? { returnType } : {}),
    usageRules,
    ...(requiredBeforeCall.length === 0 ? {} : { requiredBeforeCall }),
    failureModes,
    examples: [],
    attackSurfaces: [],
    guards: [],
    mutations: [],
    source: sourceRef(root, sourceFile, node),
  }
}

function createParameterMetadata(
  sourceFile: ts.SourceFile,
  node: ts.ParameterDeclaration,
  tags: readonly ModuleDocTag[],
): ModuleActionParameterMetadata {
  const name = propertyNameText(node.name, sourceFile)
  const description = readParamDescriptions(tags).get(name)
  return {
    name,
    type: node.type?.getText(sourceFile) ?? 'unknown',
    optional: node.questionToken !== undefined || node.initializer !== undefined,
    ...(description !== undefined ? { description } : {}),
  }
}

function readReturnType(checker: ts.TypeChecker, node: ts.MethodDeclaration): string | undefined {
  if (node.type !== undefined) return node.type.getText(node.getSourceFile())
  const signature = checker.getSignatureFromDeclaration(node)
  if (signature === undefined) return undefined
  return checker.typeToString(checker.getReturnTypeOfSignature(signature))
}

function sourceRef(root: string, sourceFile: ts.SourceFile, node: ts.Node): ModuleSourceRef {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return {
    file: sourceFilePath(root, sourceFile),
    line: pos.line + 1,
  }
}

function createSourceProvenance(
  state: ApiObjectExtractionState,
  node: ts.Node,
  className: string,
  memberName?: string,
): ModuleSourceProvenance {
  const owningClass = findOwningClassDeclaration(node)
  const typeEntryFile = owningClass === undefined
    ? undefined
    : state.typeEntryFileBySourceClassKey.get(sourceClassKey(owningClass))
  return {
    ...sourceRef(state.root, node.getSourceFile(), node),
    className,
    ...(memberName === undefined ? {} : { memberName }),
    ...(typeEntryFile === undefined ? {} : { typeEntryFile }),
  }
}

function findOwningClassDeclaration(node: ts.Node): ts.ClassDeclaration | undefined {
  return ts.findAncestor(node, ts.isClassDeclaration)
}

function classNameForMember(node: ts.Node): string {
  return findOwningClassDeclaration(node)?.name?.text ?? '(anonymous)'
}

function readApiKindFromClassMember(node: ts.Node): string {
  const owningClass = findOwningClassDeclaration(node)
  const className = owningClass?.name?.text ?? classNameForMember(node)
  return owningClass === undefined
    ? kebabCase(className)
    : firstTagText(readDocTags(owningClass, owningClass.getSourceFile()), 'moduleKind') ?? kebabCase(className)
}

function sourceClassKey(declaration: ts.ClassDeclaration): string {
  return `${sourceFilePath(process.cwd(), declaration.getSourceFile())}:${String(declaration.pos)}:${declaration.name?.text ?? '(anonymous)'}`
}

function sourceFilePath(root: string, sourceFile: ts.SourceFile): string {
  return normalizePath(relative(root, sourceFile.fileName))
}

function readDocTags(node: ts.Node, sourceFile: ts.SourceFile): ModuleDocTag[] {
  const tags = ts.getJSDocTags(node).map(tag => ({
    name: tag.tagName.getText(sourceFile),
    text: normalizeJsDocTagText(tag.comment),
    node: tag,
    ...(ts.isJSDocParameterTag(tag) ? { paramName: tag.name.getText(sourceFile) } : {}),
  }))
  if (tags.length > 0) return tags

  const raw = readRawJsDoc(node)
  return raw === undefined ? [] : parseRawJsDocTags(raw, node)
}

function readSummary(node: ts.Node): string | undefined {
  const jsDoc = readLastJsDoc(node)
  const summary = normalizeJsDocText(jsDoc?.comment)
  if (summary.length > 0) return summary

  const rawSummary = parseRawJsDocSummary(readRawJsDoc(node))
  return rawSummary.length > 0 ? rawSummary : undefined
}

function createJsDocMeta(
  node: ts.Node,
  tags: readonly ModuleDocTag[],
  summary: string,
): JsDocMeta | undefined {
  const raw = readRawJsDoc(node)
  if (raw === undefined && summary.length === 0 && tags.length === 0) return undefined
  return {
    ...(raw === undefined ? {} : { raw }),
    summary,
    tags: tags.map(tag => ({
      name: tag.name,
      text: tag.text,
      ...(tag.paramName === undefined ? {} : { paramName: tag.paramName }),
    })),
  }
}

function readRawJsDoc(node: ts.Node): string | undefined {
  const jsDoc = readLastJsDoc(node)
  const sourceFile = node.getSourceFile()
  const raw = jsDoc === undefined
    ? readLeadingRawJsDoc(node, sourceFile)
    : sourceFile.text.slice(jsDoc.pos, jsDoc.end).trim()
  return raw.length > 0 ? raw : undefined
}

function readLeadingRawJsDoc(node: ts.Node, sourceFile: ts.SourceFile): string {
  const ranges = ts.getLeadingCommentRanges(sourceFile.text, node.pos) ?? []
  const range = ranges
    .filter(item => item.kind === ts.SyntaxKind.MultiLineCommentTrivia)
    .filter(item => sourceFile.text.slice(item.pos, item.pos + 3) === '/**')
    .at(-1)
  return range === undefined ? '' : sourceFile.text.slice(range.pos, range.end).trim()
}

function readLastJsDoc(node: ts.Node): ts.JSDoc | undefined {
  const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc)
  if (docs.length === 0) return undefined
  return docs[docs.length - 1]
}

function normalizeJsDocText(comment: ts.JSDoc['comment']): string {
  if (comment === undefined) return ''
  if (typeof comment === 'string') return comment.trim()
  return comment
    .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : part.getText()))
    .join('')
    .trim()
}

function parseRawJsDocSummary(raw: string | undefined): string {
  if (raw === undefined) return ''
  const lines = normalizeRawJsDocLines(raw)
  const summary: string[] = []
  for (const line of lines) {
    if (line.trimStart().startsWith('@')) break
    summary.push(line)
  }
  return summary.join('\n').trim()
}

function parseRawJsDocTags(raw: string, node: ts.Node): ModuleDocTag[] {
  const tags: ModuleDocTag[] = []
  let current: { name: string; text: string[]; paramName?: string } | undefined

  const flush = () => {
    if (current === undefined) return
    tags.push({
      name: current.name,
      text: current.text.join('\n').trim(),
      node,
      ...(current.paramName === undefined ? {} : { paramName: current.paramName }),
    })
    current = undefined
  }

  for (const line of normalizeRawJsDocLines(raw)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('@')) {
      if (current !== undefined && trimmed.length > 0) current.text.push(trimmed)
      continue
    }

    flush()
    const match = /^@([A-Za-z][A-Za-z0-9_-]*)(?:\s+([\s\S]*))?$/u.exec(trimmed)
    if (match === null) continue
    const tagName = match[1]
    if (tagName === undefined) continue
    const tagBody = match[2]?.trim() ?? ''
    if (tagName === 'param') {
      const paramMatch = /^(\S+)\s*(?:-\s*)?([\s\S]*)$/u.exec(tagBody)
      current = {
        name: tagName,
        text: [paramMatch?.[2]?.trim() ?? ''].filter(text => text.length > 0),
        ...(paramMatch?.[1] === undefined ? {} : { paramName: paramMatch[1] }),
      }
      continue
    }

    current = {
      name: tagName,
      text: tagBody.length === 0 ? [] : [tagBody],
    }
  }

  flush()
  return tags
}

function normalizeRawJsDocLines(raw: string): string[] {
  return raw
    .replace(/^\/\*\*/u, '')
    .replace(/\*\/$/u, '')
    .split(/\r?\n/u)
    .map(line => line.replace(/^\s*\*\s?/u, '').trimEnd())
}

function normalizeJsDocTagText(comment: ts.JSDocTag['comment']): string {
  return normalizeJsDocText(comment)
    .split(/\r?\n/u)
    .map(line => line.trim())
    .find(line => line.length > 0) ?? ''
}

function firstTagText(tags: readonly ModuleDocTag[], name: string): string | undefined {
  const tag = firstTag(tags, name)
  if (tag === undefined) return undefined
  return requireTagText(tag)
}

function firstTag(tags: readonly ModuleDocTag[], name: string): ModuleDocTag | undefined {
  return tags.find(tag => tag.name === name)
}

function tagTexts(tags: readonly ModuleDocTag[], name: string): string[] {
  return tags
    .filter(tag => tag.name === name)
    .map(requireTagText)
}

function parseEntity(tag: ModuleDocTag | undefined): ModuleEntityMetadata | undefined {
  if (tag === undefined) return undefined
  const [id, ...labelParts] = splitTagText(tag)
  const label = labelParts.join(' ').trim()
  if (id === undefined) {
    throw invalidTag(tag, 'expected "<id> <label>"')
  }
  if (label.length === 0) {
    throw invalidTag(tag, 'expected "<id> <label>"')
  }
  return {
    id,
    label,
  }
}

function parseAttackSurfaces(tags: readonly ModuleDocTag[]): ModuleAttackSurfaceMetadata[] {
  return tags.filter(tag => tag.name === 'moduleAttackSurface').map((tag) => {
    const [id, risk, ...descriptionParts] = splitTagText(tag)
    if (id === undefined || risk === undefined || descriptionParts.length === 0) {
      throw invalidTag(tag, 'expected "<id> <risk> <description>"')
    }
    if (!isModuleAttackSurfaceRisk(risk)) {
      throw invalidTag(tag, `risk must be one of: ${MODULE_ATTACK_SURFACE_RISKS.join(', ')}`)
    }
    return {
      id,
      risk,
      description: descriptionParts.join(' ').trim(),
    }
  })
}

function parseMutations(tags: readonly ModuleDocTag[]): ModuleMutationMetadata[] {
  return tags.filter(tag => tag.name === 'moduleMutation').map((tag) => {
    const [resource, mode, ...descriptionParts] = splitTagText(tag)
    if (resource === undefined || mode === undefined || descriptionParts.length === 0) {
      throw invalidTag(tag, 'expected "<resource> <mode> <description>"')
    }
    if (!isModuleMutationMode(mode)) {
      throw invalidTag(tag, `mode must be one of: ${MODULE_MUTATION_MODES.join(', ')}`)
    }
    return {
      resource,
      mode,
      description: descriptionParts.join(' ').trim(),
    }
  })
}

type ResolveActionNameCommand = Readonly<{
  checker: ts.TypeChecker
  node: ts.MethodDeclaration
  tags: readonly ModuleDocTag[]
}>

function resolveActionName(command: ResolveActionNameCommand): string | undefined {
  if (hasIgnoreActionTag(command.tags)) return undefined
  if (!isPublicMethod(command.node)) return undefined
  if (readSummary(command.node) === undefined) return undefined
  if (requiresExplicitActionTag(command.node) && !hasDocTag(command.tags, 'moduleMutation')) return undefined
  if (!isActionReturnType(command.checker, command.node)) return undefined
  return propertyNameText(command.node.name, command.node.getSourceFile())
}

function requiresExplicitActionTag(node: ts.MethodDeclaration): boolean {
  const parent = node.parent
  if (!ts.isClassDeclaration(parent)) return false
  const tags = readDocTags(parent, parent.getSourceFile())
  return firstTagText(tags, 'moduleActionMode') === 'explicit'
}

function isPublicMethod(node: ts.MethodDeclaration): boolean {
  return !node.modifiers?.some(modifier =>
    modifier.kind === ts.SyntaxKind.PrivateKeyword
    || modifier.kind === ts.SyntaxKind.ProtectedKeyword
    || modifier.kind === ts.SyntaxKind.StaticKeyword)
}

function hasDocTag(tags: readonly ModuleDocTag[], name: string): boolean {
  return tags.some(tag => tag.name === name)
}

function hasIgnoreActionTag(tags: readonly ModuleDocTag[]): boolean {
  return hasDocTag(tags, 'internal') || hasDocTag(tags, 'vcmIgnore')
}

function readParamDescriptions(tags: readonly ModuleDocTag[]): Map<string, string> {
  const result = new Map<string, string>()
  for (const tag of tags) {
    if (tag.name !== 'param') continue
    if (tag.paramName !== undefined) {
      if (tag.text.length > 0) result.set(tag.paramName, tag.text.replace(/^-\s*/u, ''))
      continue
    }
    const paramTag = tag.node
    if (!ts.isJSDocParameterTag(paramTag)) continue
    const paramName = paramTag.name.getText()
    if (tag.text.length > 0) result.set(paramName, tag.text.replace(/^-\s*/u, ''))
  }
  return result
}

function propertyNameText(name: ts.PropertyName | ts.BindingName, sourceFile: ts.SourceFile): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return name.getText(sourceFile)
}

function splitTagText(tag: ModuleDocTag): string[] {
  return requireTagText(tag).split(/\s+/u)
}

function requireTagText(tag: ModuleDocTag): string {
  if (tag.text.length === 0) {
    throw invalidTag(tag, 'tag text is required')
  }
  return tag.text
}

function invalidTag(tag: ModuleDocTag, message: string): Error {
  const sourceFile = tag.node.getSourceFile()
  const position = sourceFile.getLineAndCharacterOfPosition(tag.node.getStart(sourceFile))
  return new Error(
    `Invalid @${tag.name} at ${normalizePath(sourceFile.fileName)}:${position.line + 1}:${position.character + 1}: ${message}`,
  )
}

function validateGeneratedAbilities(abilities: readonly ModuleAbilityMetadata[]): void {
  const seen = new Set<string>()
  for (const ability of abilities) {
    if (seen.has(ability.abilityId)) {
      throw new Error(`Duplicate @moduleAbility generated: ${ability.abilityId}`)
    }
    seen.add(ability.abilityId)
  }
}

function validateGeneratedActions(ability: ModuleAbilityMetadata): void {
  const seen = new Set<string>()
  for (const action of ability.actions) {
    if (seen.has(action.name)) {
      throw new Error(`Duplicate @moduleAction generated in ${ability.abilityId}: ${action.name}`)
    }
    seen.add(action.name)
  }
}

function createModuleMetadataDiagnostics(
  abilities: readonly ModuleAbilityMetadata[],
  moduleMetadata: readonly AiModuleMetadataJson[],
): ModuleMetadataDiagnostics {
  const findings: ModuleMetadataDiagnosticFinding[] = []
  const modules = moduleMetadata.map(module => summarizeDiagnosticModule(module.rootApi))
  const moduleKinds = new Set<string>()
  const referencedApiKinds = new Set<string>()
  let actionCount = 0
  let resultApiCount = 0
  let emptySchemaNodeCount = 0
  let maxSchemaDepth = 0

  for (const module of modules) {
    actionCount += module.actionCount
    resultApiCount += module.resultApiCount
    emptySchemaNodeCount += module.emptySchemaNodeCount
    maxSchemaDepth = Math.max(maxSchemaDepth, module.maxSchemaDepth)
    for (const kind of module.directResultApiKinds) referencedApiKinds.add(kind)

    if (moduleKinds.has(module.kind)) {
      findings.push({
        level: 'error',
        rule: 'module-kind-duplicate',
        target: module.kind,
        message: `重复的 API module kind: ${module.kind}`,
        fix: '检查 @moduleKind 是否重复，或为嵌套 API class 使用唯一 kind。',
      })
    }
    moduleKinds.add(module.kind)
    if (module.actionCount === 0 && module.resultApiCount === 0) {
      findings.push({
        level: 'error',
        rule: 'module-actions-empty',
        target: module.kind,
        message: `${module.kind} 没有可调用 action。`,
        fix: '确认 action 方法是 public、返回 AiModuleResult，并有自然语言 JSDoc summary。',
      })
    }
    if (module.resultApiCount === 0) {
      findings.push({
        level: 'info',
        rule: 'module-result-apis-empty',
        target: module.kind,
        message: `${module.kind} 当前没有发现嵌套 API 对象；不会生成子模块。`,
      })
    }
  }

  for (const ability of abilities) {
    const abilityKind = ability.kind
    const matchingModule = abilityKind === undefined ? undefined : modules.find(module => module.kind === abilityKind)
    if (ability.actions.length === 0 && (matchingModule?.resultApiCount ?? 0) === 0) {
      findings.push({
        level: 'warn',
        rule: 'ability-actions-empty',
        target: ability.abilityId,
        message: `${ability.abilityId} 没有提取到 action。`,
        fix: '确认能力 class 的 public 方法返回 AiModuleResult，且有 JSDoc summary。',
      })
    }
  }

  return {
    abilityCount: abilities.length,
    moduleCount: moduleMetadata.length,
    actionCount,
    resultApiCount,
    referencedApiKinds: [...referencedApiKinds].sort(),
    emptySchemaNodeCount,
    maxSchemaDepth,
    modules,
    findings,
  }
}

function summarizeDiagnosticModule(api: AiApiObjectMetadata): ModuleMetadataDiagnosticModuleSummary {
  const actions = api.actions.map(action => summarizeDiagnosticAction(api.kind, action))
  const resultRefs = collectAllResultApiRefs(api)
  return {
    kind: api.kind,
    name: api.name,
    actionCount: api.actions.length,
    directResultApiKinds: collectDirectResultApiRefs(api).map(ref => ref.api.kind),
    resultApiCount: resultRefs.length,
    emptySchemaNodeCount: actions.reduce((sum, action) => sum + action.emptySchemaNodeCount, 0),
    maxSchemaDepth: actions.reduce((max, action) => Math.max(max, action.maxSchemaDepth), 0),
    actions,
  }
}

function summarizeDiagnosticAction(
  kind: string,
  action: AiApiActionMetadata,
): ModuleMetadataDiagnosticActionSummary {
  const paramsStats = inspectGeneratedSchema(action.paramsSchema)
  const resultStats = action.resultSchema === undefined
    ? { emptyNodeCount: 0, maxDepth: 0 }
    : inspectGeneratedSchema(action.resultSchema)
  return {
    kind,
    action: action.name,
    paramsPropertyCount: isGeneratedSchemaObject(action.paramsSchema) ? Object.keys(action.paramsSchema.properties ?? {}).length : 0,
    resultApiCount: collectAllResultApiRefsFromAction(action).length,
    emptySchemaNodeCount: paramsStats.emptyNodeCount + resultStats.emptyNodeCount,
    maxSchemaDepth: Math.max(paramsStats.maxDepth, resultStats.maxDepth),
  }
}

function inspectGeneratedSchema(schema: GeneratedJsonSchema): { emptyNodeCount: number; maxDepth: number } {
  let emptyNodeCount = 0
  let maxDepth = 0
  const visit = (node: unknown, depth: number): void => {
    if (!isIndexableObject(node)) return
    maxDepth = Math.max(maxDepth, depth)
    if (Object.keys(node).length === 0) emptyNodeCount++
    const properties = node['properties']
    if (isIndexableObject(properties)) {
      for (const child of Object.values(properties)) visit(child, depth + 1)
    }
    visit(node['items'], depth + 1)
    for (const key of ['anyOf', 'oneOf', 'allOf', 'prefixItems']) {
      const children = node[key]
      if (!Array.isArray(children)) continue
      for (const child of children) visit(child, depth + 1)
    }
    const defs = node['$defs']
    if (isIndexableObject(defs)) {
      for (const child of Object.values(defs)) visit(child, depth + 1)
    }
  }
  visit(schema, 1)
  return { emptyNodeCount, maxDepth }
}

function collectDirectResultApiRefs(api: AiApiObjectMetadata): readonly AiApiResultApiRefMetadata[] {
  return [
    ...api.actions.flatMap(action => action.resultApis ?? []),
    ...(api.attributes ?? []).flatMap(attribute => attribute.api === undefined ? [] : [{ resultPath: [attribute.name], api: attribute.api }]),
  ]
}

function collectAllResultApiRefs(api: AiApiObjectMetadata): readonly AiApiResultApiRefMetadata[] {
  const attributeRefs = (api.attributes ?? []).flatMap(attribute => attribute.api === undefined
    ? []
    : [{ resultPath: [attribute.name], api: attribute.api }, ...collectAllResultApiRefs(attribute.api)])
  return [
    ...api.actions.flatMap(collectAllResultApiRefsFromAction),
    ...attributeRefs,
  ]
}

function collectAllResultApiRefsFromAction(action: AiApiActionMetadata): readonly AiApiResultApiRefMetadata[] {
  const refs = action.resultApis ?? []
  return refs.flatMap(ref => [ref, ...collectAllResultApiRefs(ref.api)])
}

function collectModuleMetadataJsDocTodoLog(
  moduleMetadata: readonly AiModuleMetadataJson[],
): readonly ModuleMetadataJsDocTodoLogEntry[] {
  const entries: ModuleMetadataJsDocTodoLogEntry[] = []
  for (const api of collectUniqueApiObjects(moduleMetadata)) {
    pushJsDocTodoLogEntry(entries, api.kind, api.provenance, 'class', api.jsdoc, [])
    if (api.constructorSignature !== undefined) {
      pushJsDocTodoLogEntry(
        entries,
        api.kind,
        api.constructorSignature.provenance,
        'constructor',
        api.constructorSignature.jsdoc,
        collectSchemaPropertyNames(api.constructorSignature.paramsSchema),
      )
    }
    for (const attribute of api.attributes ?? []) {
      pushJsDocTodoLogEntry(entries, api.kind, attribute.provenance, 'attribute', attribute.jsdoc, [])
    }
    for (const action of api.actions) {
      pushJsDocTodoLogEntry(
        entries,
        api.kind,
        action.provenance,
        'method',
        action.jsdoc,
        collectSchemaPropertyNames(action.paramsSchema),
      )
    }
  }
  return entries.sort((left, right) =>
    left.file.localeCompare(right.file)
    || left.line - right.line
    || left.kind.localeCompare(right.kind)
    || (left.memberName ?? '').localeCompare(right.memberName ?? ''),
  )
}

function dedupeSchemaDescriptionTodoLog(
  entries: readonly ModuleMetadataSchemaDescriptionTodoLogEntry[],
): readonly ModuleMetadataSchemaDescriptionTodoLogEntry[] {
  const result = new Map<string, ModuleMetadataSchemaDescriptionTodoLogEntry>()
  for (const entry of entries) {
    const key = [
      entry.file,
      String(entry.line),
      entry.propertyName,
      entry.typeText,
      entry.kind,
      entry.className,
      entry.memberType,
      entry.memberName ?? '',
      entry.schemaRole,
      entry.path.join('.'),
    ].join('|')
    if (!result.has(key)) result.set(key, entry)
  }
  return [...result.values()].sort((left, right) =>
    left.file.localeCompare(right.file)
    || left.line - right.line
    || left.kind.localeCompare(right.kind)
    || left.className.localeCompare(right.className)
    || (left.memberName ?? '').localeCompare(right.memberName ?? '')
    || left.path.join('.').localeCompare(right.path.join('.')),
  )
}

function collectUniqueApiObjects(moduleMetadata: readonly AiModuleMetadataJson[]): readonly AiApiObjectMetadata[] {
  const result = new Map<string, AiApiObjectMetadata>()
  const pending = moduleMetadata.map(module => module.rootApi)
  while (pending.length > 0) {
    const api = pending.shift()
    if (api === undefined || result.has(api.kind)) continue
    result.set(api.kind, api)
    for (const attribute of api.attributes ?? []) {
      if (attribute.api !== undefined) pending.push(attribute.api)
    }
    for (const action of api.actions) {
      for (const ref of action.resultApis ?? []) pending.push(ref.api)
    }
  }
  return [...result.values()]
}

function pushJsDocTodoLogEntry(
  entries: ModuleMetadataJsDocTodoLogEntry[],
  kind: string,
  provenance: ModuleSourceProvenance | undefined,
  memberType: ModuleMetadataJsDocTodoLogEntry['memberType'],
  jsdoc: JsDocMeta | undefined,
  expectedParams: readonly string[],
): void {
  if (provenance === undefined) return
  const documentedParams = collectDocumentedParamNames(jsdoc)
  const reasons = createJsDocTodoReasons(jsdoc, expectedParams, documentedParams)
  if (reasons.length === 0) return
  entries.push({
    kind,
    className: provenance.className,
    memberType,
    ...(provenance.memberName === undefined ? {} : { memberName: provenance.memberName }),
    file: provenance.file,
    line: provenance.line,
    reasons,
    ...(expectedParams.length === 0 ? {} : { expectedParams }),
    ...(documentedParams.length === 0 ? {} : { documentedParams }),
    ...(provenance.typeEntryFile === undefined ? {} : { typeEntryFile: provenance.typeEntryFile }),
  })
}

function createJsDocTodoReasons(
  jsdoc: JsDocMeta | undefined,
  expectedParams: readonly string[],
  documentedParams: readonly string[],
): readonly string[] {
  const reasons: string[] = []
  if (jsdoc === undefined) {
    reasons.push('missing JSDoc')
  } else if (jsdoc.summary.trim().length === 0) {
    reasons.push('missing JSDoc summary')
  }
  const documented = new Set(documentedParams)
  const missingParams = expectedParams.filter(param => !documented.has(param))
  if (missingParams.length > 0) {
    reasons.push(`missing @param: ${missingParams.join(', ')}`)
  }
  const emptyParamDescriptions = expectedParams.filter((param) => {
    return jsdoc?.tags.find(item => item.name === 'param' && item.paramName === param)?.text.trim().length === 0
  })
  if (emptyParamDescriptions.length > 0) {
    reasons.push(`empty @param description: ${emptyParamDescriptions.join(', ')}`)
  }
  return reasons
}

function collectDocumentedParamNames(jsdoc: JsDocMeta | undefined): readonly string[] {
  if (jsdoc === undefined) return []
  return jsdoc.tags
    .filter(tag => tag.name === 'param')
    .map(tag => tag.paramName)
    .filter(isNotUndefined)
}

function collectSchemaPropertyNames(schema: GeneratedJsonSchema): readonly string[] {
  if (!isIndexableObject(schema)) return []
  const properties = schema['properties']
  return isIndexableObject(properties) ? Object.keys(properties) : []
}

function isModuleAttackSurfaceRisk(value: string): value is typeof MODULE_ATTACK_SURFACE_RISKS[number] {
  return MODULE_ATTACK_SURFACE_RISK_VALUES.has(value)
}

function isModuleMutationMode(value: string): value is typeof MODULE_MUTATION_MODES[number] {
  return MODULE_MUTATION_MODE_VALUES.has(value)
}

function formatGeneratedMetadata(
  abilities: readonly ModuleAbilityMetadata[],
  diagnostics: ModuleMetadataDiagnostics,
): string {
  return `${JSON.stringify({
    schemaVersion: MODULE_METADATA_SCHEMA_VERSION,
    generatedBy: 'packages/vite-plugin-spark-catalog/src/module-metadata-cli.ts',
    note: 'Do not edit by hand; update domain ability class JSDoc and rerun pnpm run generate:module-metadata.',
    diagnostics,
    abilities,
  }, null, 2)}\n`
}

function formatGeneratedApiObjectMetadata(
  moduleMetadata: readonly AiModuleMetadataJson[],
  diagnostics: ModuleMetadataDiagnostics,
): string {
  const pooled = buildModuleMetadataPooledDocument(moduleMetadata)
  return `${JSON.stringify({
    schemaVersion: MODULE_METADATA_SCHEMA_VERSION,
    generatedBy: 'packages/vite-plugin-spark-catalog/src/module-metadata-cli.ts',
    note: 'Do not edit by hand; update domain API class JSDoc and rerun pnpm run generate:module-metadata.',
    diagnostics,
    ...(pooled.$defs === undefined ? {} : { $schema: pooled.$schema, $defs: pooled.$defs }),
    modules: pooled.modules,
  }, null, 2)}\n`
}

function formatVcmObjectElementCatalog(
  moduleMetadata: readonly AiModuleMetadataJson[],
  vcmMeta: VcmComponentMeta | undefined,
): string {
  return `${JSON.stringify(normalizeGeneratedJsonSchemaValue(vcmMeta ?? createFallbackVcmComponentMeta(moduleMetadata)), null, 2)}\n`
}

function extractVcmRootClassSchemas(
  root: string,
  sources: readonly string[],
  moduleMetadata: readonly AiModuleMetadataJson[],
): VcmComponentMeta | undefined {
  const rootApis = moduleMetadata.map(module => module.rootApi)
  if (rootApis.length === 0) return undefined
  const tsconfigPath = resolve(root, 'tsconfig.catalog.json')
  if (!existsSync(tsconfigPath)) return undefined

  const sourceByClassName = findClassSourceFiles(root, sources, rootApis.map(api => api.className))
  if (sourceByClassName.size === 0) return undefined

  const virtualFile = resolve(root, '__spark_vcm_object_metadata_probe.vue').replace(/\\/g, '/')
  const imports = rootApis
    .map((api) => {
      const source = sourceByClassName.get(api.className)
      if (source === undefined) return undefined
      return `import type { ${api.className} } from './${normalizePath(relative(root, source))}'`
    })
    .filter(isNotUndefined)
  if (imports.length === 0) return undefined

  const props = rootApis
    .filter(api => sourceByClassName.has(api.className))
    .map(api => `  ${api.className}: ${api.className}`)
    .join('\n')
  const source = `<script setup lang="ts">\n${imports.join('\n')}\n\ndefineProps<{\n${props}\n}>()\n</script>\n`

  const checker = createChecker(tsconfigPath.replace(/\\/g, '/'), {
    rawType: true,
    schema: true,
    noDeclarations: false,
  })
  checker.updateFile(virtualFile, source)
  try {
    const meta = checker.getComponentMeta(virtualFile)
    return sanitizeVcmComponentMeta(meta)
  } finally {
    checker.deleteFile(virtualFile)
  }
}

function findClassSourceFiles(
  root: string,
  sources: readonly string[],
  classNames: readonly string[],
): ReadonlyMap<string, string> {
  const wanted = new Set(classNames)
  const found = new Map<string, string>()
  for (const source of sources) {
    const file = resolve(root, source)
    const program = ts.createProgram([file], {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      noEmit: true,
    })
    const sourceFile = program.getSourceFile(file)
    if (sourceFile === undefined) continue
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && node.name !== undefined && wanted.has(node.name.text)) {
        found.set(node.name.text, file)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return found
}

function createFallbackVcmComponentMeta(moduleMetadata: readonly AiModuleMetadataJson[]): VcmComponentMeta {
  return {
    name: '',
    description: '',
    type: 1,
    props: moduleMetadata.map(module => ({
      name: module.rootApi.className,
      global: false,
      description: module.rootApi.description,
      tags: [],
      required: true,
      type: module.rootApi.className,
      schema: {
        kind: 'object',
        type: module.rootApi.className,
        schema: {},
      },
    })),
    events: [],
    slots: [],
    exposed: [],
  }
}

function sanitizeVcmComponentMeta(meta: unknown): VcmComponentMeta {
  return sanitizeVcmJsonValue(meta) as VcmComponentMeta
}

function sanitizeVcmJsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) return value.map(item => sanitizeVcmJsonValue(item, seen))
  if (!isIndexableObject(value)) return value
  if (seen.has(value)) return undefined
  seen.add(value)
  const entries = Object.entries(value)
    .filter(([key]) => !isNonSerializableVcmKey(key))
    .map(([key, child]) => [key, sanitizeVcmJsonValue(child, seen)])
    .filter(([, child]) => child !== undefined)
  return Object.fromEntries(entries)
}

function isNonSerializableVcmKey(key: string): boolean {
  return key === 'declarations'
    || key === 'rawType'
    || key === 'schemaSource'
    || key === 'getDeclarations'
    || key === 'getTypeObject'
}

function normalizeGeneratedJsonSchemaValue<T>(value: T): T {
  if (Array.isArray(value)) {
    const items = value as unknown[]
    const normalized = items.map((item: unknown) => normalizeGeneratedJsonSchemaValue(item))
    return normalized as unknown as T
  }
  if (!isIndexableObject(value)) return value

  const entries = Object.entries(value)
    .filter(([key, child]) => !(key === 'required' && Array.isArray(child) && child.length === 0))
    .map(([key, child]) => [key, normalizeGeneratedJsonSchemaValue(child)])
  return Object.fromEntries(entries) as T
}

function formatRuntimeGeneratedMetadata(
  abilities: readonly ModuleAbilityMetadata[],
): string {
  return `${JSON.stringify({
    schemaVersion: MODULE_METADATA_SCHEMA_VERSION,
    generatedBy: 'packages/vite-plugin-spark-catalog/src/module-metadata-cli.ts',
    note: 'Runtime metadata; diagnostics are emitted in page-design-ability-metadata.generated.json.',
    abilities,
  }, null, 2)}\n`
}

function formatRuntimeGeneratedApiObjectMetadata(
  moduleMetadata: readonly AiModuleMetadataJson[],
  options: Readonly<{ pretty: boolean }>,
): string {
  const document = createRuntimeGeneratedApiObjectMetadataDocument(moduleMetadata)
  return `${options.pretty ? JSON.stringify(document, null, 2) : JSON.stringify(document)}\n`
}

function createRuntimeGeneratedApiObjectMetadataDocument(
  moduleMetadata: readonly AiModuleMetadataJson[],
) {
  const compactModules = moduleMetadata.map(module => compactModuleMetadataApiRegistry({
    schemaVersion: 1,
    rootApi: module.rootApi,
  }))
  const document = buildModuleMetadataRuntimeDocument({
    generatedBy: 'packages/vite-plugin-spark-catalog/src/module-metadata-cli.ts',
    note: 'Runtime metadata: apiRegistry $ref for action returns; document $defs for pooled JSON Schema.',
    modules: compactModules,
  })
  return document
}

function createRuntimeGeneratedApiObjectMetadataAudit(
  moduleMetadata: readonly AiModuleMetadataJson[],
) {
  const document = createRuntimeGeneratedApiObjectMetadataDocument(moduleMetadata)
  const minifiedRuntimeJson = JSON.stringify(document)
  const prettyRuntimeJson = JSON.stringify(document, null, 2)
  const schemaRefAudit = createRuntimeSchemaRefAudit(document)
  const redundancy = createRuntimeRedundancyAudit(document)

  return {
    schemaVersion: 1,
    generatedBy: 'packages/vite-plugin-spark-catalog/src/module-metadata-cli.ts',
    note: 'In-memory human/build audit summary for page-design-module-metadata.runtime.generated.json; logged by the generator and not written for AI runtime.',
    runtimeDocument: {
      schemaVersion: document.schemaVersion,
      moduleCount: document.modules.length,
      rootKinds: document.modules.map(module => readApiKind(module['rootApi'])).filter(isNotUndefined),
      apiRegistryCount: document.modules.reduce((total, module) => total + Object.keys(readRecord(module['apiRegistry'])).length, 0),
      defsCount: Object.keys(document.$defs ?? {}).length,
      compactBytes: Buffer.byteLength(minifiedRuntimeJson, 'utf8'),
      prettyBytes: Buffer.byteLength(prettyRuntimeJson, 'utf8'),
      prettyOverheadBytes: Buffer.byteLength(prettyRuntimeJson, 'utf8') - Buffer.byteLength(minifiedRuntimeJson, 'utf8'),
    },
    schemaRefAudit,
    schemaPool: {
      refBase: '#/$defs',
      $defs: document.$defs ?? {},
    },
    redundancy,
    knowledgeReadiness: createRuntimeKnowledgeReadinessAudit(document),
    models: collectRuntimeAuditApis(document).map(api => createRuntimeApiAuditSummary(api, runtimeApiByKind(document))),
  }
}

function createRuntimeSchemaRefAudit(document: ReturnType<typeof createRuntimeGeneratedApiObjectMetadataDocument>) {
  const defs = readRecord(document.$defs)
  const directDefRefs = collectDefRefNames(document, { includeDefs: false })
  const allDefRefs = collectDefRefNames(document, { includeDefs: true })
  const reachableDefs = collectReachableDefNames(directDefRefs, defs)
  const missingDefRefs = [...allDefRefs].filter(name => defs[name] === undefined).sort()
  const deadDefs = Object.keys(defs).filter(name => !reachableDefs.has(name)).sort()
  return {
    defs: Object.keys(defs).length,
    directDefRefs: directDefRefs.size,
    allDefRefs: allDefRefs.size,
    reachableDefs: reachableDefs.size,
    missingDefRefs,
    deadDefs,
    topRefs: collectTopRuntimeRefs(document, 12),
  }
}

function createRuntimeRedundancyAudit(document: unknown) {
  const stats = {
    jsdocNodes: 0,
    jsdocRawCount: 0,
    jsdocRawBytes: 0,
    jsdocTagCount: 0,
    jsdocTagBytes: 0,
    descriptionCount: 0,
    descriptionBytes: 0,
    descriptionEqualsJsdocSummary: 0,
    methodNameEqualsName: 0,
    provenanceNodes: 0,
    provenanceFileRepeats: new Map<string, number>(),
  }

  visitRuntimeAuditNode(document, (node) => {
    const jsdoc = readRecord(node['jsdoc'])
    if (Object.keys(jsdoc).length > 0) {
      stats.jsdocNodes += 1
      const raw = jsdoc['raw']
      if (typeof raw === 'string') {
        stats.jsdocRawCount += 1
        stats.jsdocRawBytes += Buffer.byteLength(JSON.stringify(raw), 'utf8')
      }
      const tags = jsdoc['tags']
      if (Array.isArray(tags)) {
        stats.jsdocTagCount += tags.length
        stats.jsdocTagBytes += Buffer.byteLength(JSON.stringify(tags), 'utf8')
      }
      if (typeof node['description'] === 'string' && node['description'] === jsdoc['summary']) {
        stats.descriptionEqualsJsdocSummary += 1
      }
    }

    if (typeof node['description'] === 'string') {
      stats.descriptionCount += 1
      stats.descriptionBytes += Buffer.byteLength(JSON.stringify(node['description']), 'utf8')
    }
    if (typeof node['methodName'] === 'string' && node['methodName'] === node['name']) {
      stats.methodNameEqualsName += 1
    }

    const provenance = readRecord(node['provenance'])
    if (Object.keys(provenance).length > 0) {
      stats.provenanceNodes += 1
      const file = provenance['file']
      if (typeof file === 'string') {
        stats.provenanceFileRepeats.set(file, (stats.provenanceFileRepeats.get(file) ?? 0) + 1)
      }
    }
  })

  return {
    jsdocNodes: stats.jsdocNodes,
    jsdocRawCount: stats.jsdocRawCount,
    jsdocRawBytes: stats.jsdocRawBytes,
    jsdocTagCount: stats.jsdocTagCount,
    jsdocTagBytes: stats.jsdocTagBytes,
    descriptionCount: stats.descriptionCount,
    descriptionBytes: stats.descriptionBytes,
    descriptionEqualsJsdocSummary: stats.descriptionEqualsJsdocSummary,
    methodNameEqualsName: stats.methodNameEqualsName,
    provenanceNodes: stats.provenanceNodes,
    provenanceFiles: [...stats.provenanceFileRepeats.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([file, count]) => ({ file, count })),
  }
}

function createRuntimeKnowledgeReadinessAudit(
  document: ReturnType<typeof createRuntimeGeneratedApiObjectMetadataDocument>,
) {
  const apis = collectRuntimeAuditApis(document)
  const attributes = apis.flatMap(api => readArray(api['attributes']))
  const methods = apis.flatMap(api => readArray(api['actions']))
  const methodsWithChildModel = methods.filter(actionValue => readArray(readRecord(actionValue)['resultApis']).length > 0)
  const schemaDescriptions = collectRuntimeSchemaDescriptionStats(document)
  return {
    source: 'page-design-module-metadata.runtime.generated.json',
    projection: 'runtime JSON -> ClassModel -> d.ts-like guide string',
    consumerRuntimeReflection: false,
    coverage: {
      modelCount: apis.length,
      attributeCount: attributes.length,
      typedAttributeCount: attributes.filter(attributeValue => readRecord(attributeValue)['schema'] !== undefined).length,
      methodCount: methods.length,
      typedMethodParamCount: methods.filter(actionValue => readRecord(actionValue)['paramsSchema'] !== undefined).length,
      methodReturnKnowledgeCount: methods.filter((actionValue) => {
        const action = readRecord(actionValue)
        return action['resultSchema'] !== undefined || readArray(action['resultApis']).length > 0
      }).length,
      childModelMethodCount: methodsWithChildModel.length,
      schemaPropertyDescriptionCount: schemaDescriptions.described,
      schemaPropertyCount: schemaDescriptions.total,
    },
    schemaDescriptionTodo: schemaDescriptions.missingSamples,
    smokeExamples: [
      createRuntimeAttributeGuideSmoke(document, 'config-page', 'pid'),
      createRuntimeMethodGuideSmoke(document, 'config-page', 'getFileText'),
      createRuntimeMethodGuideSmoke(document, 'config-page', 'setFileText'),
      createRuntimeMethodGuideSmoke(document, 'config-page', 'getNodeTree'),
      createRuntimeMethodGuideSmoke(document, 'config-page', 'editNodeTree'),
    ].filter(isNotUndefined),
  }
}

function collectRuntimeSchemaDescriptionStats(document: unknown): {
  total: number
  described: number
  missingSamples: readonly string[]
} {
  let total = 0
  let described = 0
  const missingSamples: string[] = []
  const visit = (value: unknown, path: readonly string[]): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, String(index)]))
      return
    }
    if (!isIndexableObject(value)) return
    const properties = readRecord(value['properties'])
    for (const [name, propertySchema] of Object.entries(properties)) {
      total += 1
      const property = readRecord(propertySchema)
      const description = readString(property['description'])
      if (description !== undefined && description.trim().length > 0) {
        described += 1
      } else if (missingSamples.length < 40) {
        missingSamples.push([...path, 'properties', name].join('.'))
      }
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, [...path, key])
    }
  }
  visit(document, [])
  return { total, described, missingSamples }
}

function createRuntimeAttributeGuideSmoke(
  document: ReturnType<typeof createRuntimeGeneratedApiObjectMetadataDocument>,
  kind: string,
  attributeName: string,
) {
  const api = runtimeApiByKind(document).get(kind)
  const attribute = readArray(api?.['attributes']).map(readRecord).find(item => item['name'] === attributeName)
  if (api === undefined || attribute === undefined) return undefined
  const writable = attribute['writable'] === true
  return {
    tool: 'vcm_attribute_guide',
    kind,
    attributeName,
    declaration: `${writable ? '' : 'readonly '}${attributeName}: ${runtimeSchemaToTypeText(attribute['schema'])}`,
  }
}

function createRuntimeMethodGuideSmoke(
  document: ReturnType<typeof createRuntimeGeneratedApiObjectMetadataDocument>,
  kind: string,
  methodName: string,
) {
  const apiByKind = runtimeApiByKind(document)
  const api = apiByKind.get(kind)
  const action = readArray(api?.['actions']).map(readRecord).find(item => item['name'] === methodName)
  if (api === undefined || action === undefined) return undefined
  return {
    tool: 'vcm_method_guide',
    kind,
    methodName,
    signature: `${methodName}(${runtimeParamsToText(action['paramsSchema'], action, apiByKind)}): ${runtimeReturnToTypeText(action, apiByKind)}`,
  }
}

function runtimeApiByKind(
  document: ReturnType<typeof createRuntimeGeneratedApiObjectMetadataDocument>,
): Map<string, Readonly<Record<string, unknown>>> {
  const result = new Map<string, Readonly<Record<string, unknown>>>()
  for (const api of collectRuntimeAuditApis(document)) {
    const kind = readString(api['kind'])
    if (kind !== undefined) result.set(kind, api)
  }
  return result
}

function runtimeParamsToText(
  paramsSchema: unknown,
  action: Readonly<Record<string, unknown>>,
  apiByKind: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
): string {
  const callbackChild = readArray(action['resultApis'])
    .map(readRuntimeResultApiRef)
    .find(ref => ref !== undefined && readString(action['name'])?.startsWith('edit') === true)
  if (callbackChild !== undefined) {
    const typeName = runtimeClassNameByKind(apiByKind, callbackChild.targetKind)
    return `run: (${callbackChild.targetKind === 'node-tree' ? 'tree' : 'model'}: ${typeName}) => void | Promise<void>`
  }

  const schema = readRecord(paramsSchema)
  const properties = readRecord(schema['properties'])
  const required = new Set(readArray(schema['required']).filter((value): value is string => typeof value === 'string'))
  return Object.entries(properties)
    .map(([name, propertySchema]) => `${name}${required.has(name) ? '' : '?'}: ${runtimeSchemaToTypeText(propertySchema)}`)
    .join(', ')
}

function runtimeReturnToTypeText(
  action: Readonly<Record<string, unknown>>,
  apiByKind: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
): string {
  const childRef = readArray(action['resultApis']).map(readRuntimeResultApiRef).find(ref => ref !== undefined)
  if (childRef !== undefined) {
    if (readString(action['name'])?.startsWith('edit') === true) return 'Promise<void>'
    return runtimeClassNameByKind(apiByKind, childRef.targetKind)
  }
  return runtimeSchemaToTypeText(action['resultSchema'], 'void')
}

function readRuntimeResultApiRef(value: unknown): { targetKind: string; resultPath: readonly string[] } | undefined {
  const record = readRecord(value)
  const targetKind = readString(record['$ref']) ?? readApiRef(record['api'])
  const resultPath = readArray(record['resultPath']).filter((item): item is string => typeof item === 'string')
  return targetKind === undefined ? undefined : { targetKind, resultPath }
}

function runtimeClassNameByKind(
  apiByKind: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  kind: string,
): string {
  return readString(apiByKind.get(kind)?.['className']) ?? kind
}

function runtimeSchemaToTypeText(schemaValue: unknown, fallback = 'unknown'): string {
  if (typeof schemaValue === 'boolean') return schemaValue ? 'unknown' : 'never'
  const schema = readRecord(schemaValue)
  const ref = readString(schema['$ref'])
  if (ref !== undefined) return ref.startsWith('#/$defs/') ? ref.slice('#/$defs/'.length) : ref
  const enumValues = readArray(schema['enum'])
  if (enumValues.length > 0) return enumValues.map(value => JSON.stringify(value)).join(' | ')
  const type = schema['type']
  if (Array.isArray(type)) return type.map(item => runtimePrimitiveTypeToText(item)).join(' | ')
  if (typeof type === 'string') {
    if (type === 'array') return `${runtimeSchemaToTypeText(readRecord(schema['items']), 'unknown')}[]`
    if (type === 'object') {
      const properties = readRecord(schema['properties'])
      if (Object.keys(properties).length === 0) return 'Record<string, unknown>'
      return `{ ${Object.entries(properties)
        .map(([name, propertySchema]) => `${name}: ${runtimeSchemaToTypeText(propertySchema)}`)
        .join('; ')} }`
    }
    return runtimePrimitiveTypeToText(type)
  }
  return fallback
}

function runtimePrimitiveTypeToText(value: unknown): string {
  if (value === 'integer') return 'number'
  if (value === 'null') return 'null'
  return typeof value === 'string' ? value : 'unknown'
}

function collectRuntimeAuditApis(
  document: ReturnType<typeof createRuntimeGeneratedApiObjectMetadataDocument>,
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  return document.modules.flatMap((module) => {
    const rootApi = readRecord(module['rootApi'])
    const registryApis = Object.values(readRecord(module['apiRegistry'])).map(readRecord)
    return Object.keys(rootApi).length === 0 ? registryApis : [rootApi, ...registryApis]
  })
}

function createRuntimeApiAuditSummary(
  api: Readonly<Record<string, unknown>>,
  apiByKind: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
) {
  const attributes = readArray(api['attributes'])
  const methods = readArray(api['actions'])
  const constructorSignature = readRecord(api['constructorSignature'])
  const constructorParams = runtimeParamsToText(constructorSignature['paramsSchema'], {}, apiByKind)
  return omitUndefined({
    kind: readString(api['kind']),
    className: readString(api['className']),
    name: readString(api['name']),
    declaration: `class ${readString(api['className']) ?? readString(api['name']) ?? readString(api['kind']) ?? 'UnknownModel'}`,
    jsdoc: runtimeJsDocAudit(api),
    constructor: Object.keys(constructorSignature).length === 0
      ? undefined
      : omitUndefined({
        signature: `constructor(${constructorParams})`,
        paramsText: constructorParams,
        paramsSchema: constructorSignature['paramsSchema'],
        jsdoc: runtimeJsDocAudit(constructorSignature),
      }),
    attributes: attributes.map(attributeValue => createRuntimeAttributeKnowledgeAudit(readRecord(attributeValue))),
    methods: methods.map(methodValue => createRuntimeMethodKnowledgeAudit(readRecord(methodValue), apiByKind)),
  })
}

function createRuntimeAttributeKnowledgeAudit(attribute: Readonly<Record<string, unknown>>) {
  const name = readString(attribute['name']) ?? ''
  const typeText = runtimeSchemaToTypeText(attribute['schema'])
  const writable = attribute['writable'] === true
  const childModels = collectAttributeChildModelLinks([attribute])
  return omitUndefined({
    name,
    declaration: `${writable ? '' : 'readonly '}${name}: ${typeText}`,
    typeText,
    schema: attribute['schema'],
    readable: attribute['readable'] === true,
    writable,
    jsdoc: runtimeJsDocAudit(attribute),
    childModels: childModels.length === 0 ? undefined : childModels,
  })
}

function createRuntimeMethodKnowledgeAudit(
  action: Readonly<Record<string, unknown>>,
  apiByKind: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
) {
  const name = readString(action['name']) ?? ''
  const paramsText = runtimeParamsToText(action['paramsSchema'], action, apiByKind)
  const returnTypeText = runtimeReturnToTypeText(action, apiByKind)
  const childModels = createRuntimeMethodChildModels(action, apiByKind)
  const resultApiRefs = readArray(action['resultApis']).map(readRuntimeResultApiRef).filter(isNotUndefined)
  const usageRules = readArray(action['usageRules']).filter((value): value is string => typeof value === 'string')
  const requiredBeforeCall = readArray(action['requiredBeforeCall']).filter((value): value is string => typeof value === 'string')
  const failureModes = readArray(action['failureModes'])
  return omitUndefined({
    name,
    methodName: readString(action['methodName']),
    signature: `${name}(${paramsText}): ${returnTypeText}`,
    paramsText,
    paramsSchema: action['paramsSchema'],
    returnTypeText,
    resultSchema: action['resultSchema'],
    resultApiRefs: resultApiRefs.length === 0 ? undefined : resultApiRefs,
    jsdoc: runtimeJsDocAudit(action),
    childModels: childModels.length === 0 ? undefined : childModels,
    usageRules: usageRules.length === 0 ? undefined : usageRules,
    requiredBeforeCall: requiredBeforeCall.length === 0 ? undefined : requiredBeforeCall,
    failureModes: failureModes.length === 0 ? undefined : failureModes,
  })
}

function runtimeJsDocAudit(value: Readonly<Record<string, unknown>>) {
  const jsdoc = readRecord(value['jsdoc'])
  const tags = readArray(jsdoc['tags'])
    .map(tagValue => {
      const tag = readRecord(tagValue)
      return omitUndefined({
        name: readString(tag['name']),
        paramName: readString(tag['paramName']),
        text: readString(tag['text']) ?? '',
      })
    })
  return omitUndefined({
    summary: readString(jsdoc['summary']) ?? readString(value['description']),
    tags: tags.length === 0 ? undefined : tags,
  })
}

function createRuntimeMethodChildModels(
  action: Readonly<Record<string, unknown>>,
  apiByKind: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
) {
  const refs = readArray(action['resultApis']).map(readRuntimeResultApiRef).filter(isNotUndefined)
  if (runtimeActionRequiresRunCallback(action)) {
    return refs.map(ref => ({
      source: 'callback-param',
      targetKind: ref.targetKind,
      methodParamName: 'run',
      methodParamIndex: 0,
      callbackParamName: inferRuntimeCallbackParamName(ref.targetKind),
      callbackParamIndex: 0,
      callbackTypeText: runtimeClassNameByKind(apiByKind, ref.targetKind),
    }))
  }
  return refs.map(ref => ({
    source: 'return',
    targetKind: ref.targetKind,
    path: ref.resultPath,
    returnTypeText: runtimeClassNameByKind(apiByKind, ref.targetKind),
  }))
}

function runtimeActionRequiresRunCallback(action: Readonly<Record<string, unknown>>): boolean {
  const paramsSchema = readRecord(action['paramsSchema'])
  const properties = readRecord(paramsSchema['properties'])
  const required = readArray(paramsSchema['required'])
  return properties['run'] !== undefined && required.includes('run')
}

function inferRuntimeCallbackParamName(targetKind: string): string {
  if (targetKind === 'node-tree') return 'tree'
  if (targetKind === 'dataset') return 'tool'
  return 'model'
}

function collectAttributeChildModelLinks(attributes: readonly unknown[]) {
  return attributes
    .map(attributeValue => {
      const attribute = readRecord(attributeValue)
      const targetKind = readApiRef(attribute['api'])
      return targetKind === undefined
        ? undefined
        : {
            via: 'attribute',
            name: readString(attribute['name']),
            targetKind,
          }
    })
    .filter(isNotUndefined)
}

function readApiRef(api: unknown): string | undefined {
  const record = readRecord(api)
  return readString(record['kind']) ?? readString(record['$ref'])
}

function collectTopRuntimeRefs(document: unknown, limit: number): ReadonlyArray<{ ref: string; count: number }> {
  const counts = new Map<string, number>()
  visitRuntimeAuditNode(document, (node) => {
    const ref = node['$ref']
    if (typeof ref === 'string') counts.set(ref, (counts.get(ref) ?? 0) + 1)
  }, { includeDefs: false })
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([ref, count]) => ({ ref, count }))
}

function collectDefRefNames(
  value: unknown,
  options: Readonly<{ includeDefs: boolean }>,
): Set<string> {
  const refs = new Set<string>()
  visitRuntimeAuditNode(value, (node) => {
    const ref = node['$ref']
    if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
      refs.add(ref.slice('#/$defs/'.length))
    }
  }, options)
  return refs
}

function collectReachableDefNames(
  directRefs: ReadonlySet<string>,
  defs: Readonly<Record<string, unknown>>,
): Set<string> {
  const reachable = new Set(directRefs)
  const queue = [...directRefs]
  while (queue.length > 0) {
    const name = queue.shift()
    if (name === undefined) continue
    const nestedRefs = collectDefRefNames(defs[name], { includeDefs: false })
    for (const ref of nestedRefs) {
      if (reachable.has(ref)) continue
      reachable.add(ref)
      queue.push(ref)
    }
  }
  return reachable
}

function readApiKind(value: unknown): string | undefined {
  const kind = readRecord(value)['kind']
  return typeof kind === 'string' ? kind : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> {
  return isIndexableObject(value) ? value : {}
}

function omitUndefined<T extends Readonly<Record<string, unknown>>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Partial<T>
}

function visitRuntimeAuditNode(
  value: unknown,
  visitor: (node: Readonly<Record<string, unknown>>) => void,
  options: Readonly<{ includeDefs?: boolean }> = {},
): void {
  if (Array.isArray(value)) {
    for (const item of value) visitRuntimeAuditNode(item, visitor, options)
    return
  }
  if (!isIndexableObject(value)) return

  visitor(value)
  for (const [key, child] of Object.entries(value)) {
    if (key === '$defs' && options.includeDefs !== true) continue
    visitRuntimeAuditNode(child, visitor, options)
  }
}

function resolveRuntimeMetadataTsOutFile(jsonOutFile: string): string {
  return jsonOutFile.replace(/\.generated\.json$/u, '.ts')
}

function formatRuntimeMetadataTsModule(jsonFileName: string): string {
  return [
    '/**',
    ' * @generated by module-metadata-cli — do not edit.',
    ' *',
    ' * 契约：同名 *.runtime.generated.json 是 AI/Worker 消费的 compact JSON。',
    ' * 构建审计在 generator 内存中完成，并通过 CLI 日志输出引用闭包、知识覆盖率和待补 JSDoc。',
    ' * VCM 提取在生成器 TS 程序内完成；resolveJsonModule 推断为窄字面量，此处一次性断言类型。',
    ' */',
    "import type { ModuleMetadataRuntimeDocument } from '@spark-appworks/spark-ai/modules'",
    `import runtimeDocumentJson from './${jsonFileName}'`,
    '',
    'export const pageDesignRuntimeMetadataDocument =',
    '  runtimeDocumentJson as ModuleMetadataRuntimeDocument',
    '',
  ].join('\n')
}

function isTypeReferenceTo(checker: ts.TypeChecker, type: ts.Type, name: string): boolean {
  if (!isIndexableObject(type)) return false
  const target = type['target']
  if (!isIndexableObject(target)) return false
  const symbol = target['symbol']
  return isTsSymbol(symbol) && checker.symbolToString(symbol) === name
}

function readTypeReferenceArguments(type: ts.Type): readonly ts.Type[] {
  if (!isIndexableObject(type)) return []
  const args = type['typeArguments']
  if (!Array.isArray(args)) return []
  return args.filter(isTsType)
}

function safeGetTypeOfSymbolAtLocation(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  node: ts.Node,
): ts.Type | undefined {
  try {
    return checker.getTypeOfSymbolAtLocation(symbol, node)
  } catch {
    return undefined
  }
}

function isArrayLike(checker: ts.TypeChecker, type: ts.Type): boolean {
  return checker.isArrayType(type) || checker.isTupleType(type)
}

function isTsType(value: unknown): value is ts.Type {
  return isIndexableObject(value) && typeof value['flags'] === 'number'
}

function isTsSymbol(value: unknown): value is ts.Symbol {
  return isIndexableObject(value) && typeof value['escapedName'] !== 'undefined'
}

function isIndexableObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object'
}

function isGeneratedSchemaObject(schema: GeneratedJsonSchema): schema is Exclude<GeneratedJsonSchema, boolean> {
  return typeof schema === 'object'
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/gu, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/gu, '$1-$2')
    .replace(/[_\s]+/gu, '-')
    .toLowerCase()
}

function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
