/**
 * AI 能力模块元数据生成器。
 *
 * 这条链路和组件 catalog 共享“源码 JSDoc -> 构建期元数据”的 VCM 思路，
 * 但提取对象是领域能力 class，而不是 Vue SFC 组件。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import ts from 'typescript'
import { createChecker } from 'vue-component-meta'
import { tsTypeToJsonSchema, type GeneratedJsonSchema } from './ts-type-to-json-schema'

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
  writeFiles?: boolean}

type ModuleDocTag = {
  name: string
  text: string
  node: ts.JSDocTag}

type ModuleSourceRef = {
  file: string
  line: number}

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

type ModuleActionMetadata = {
  name: string
  methodName: string
  description?: string
  params: readonly ModuleActionParameterMetadata[]
  returnType?: string
  usageRules: readonly string[]
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
  paramsSchema: GeneratedJsonSchema
  takesContext?: boolean
  resultSchema?: GeneratedJsonSchema
  resultApis?: readonly AiApiResultApiRefMetadata[]
  usageRules?: readonly string[]
  failureModes?: readonly ModuleFailureModeMetadata[]}

type AiApiAttributeMetadata = {
  name: string
  description: string
  schema: GeneratedJsonSchema
  readable: boolean
  writable: boolean
  api?: AiApiObjectMetadata}

type AiApiConstructorMetadata = {
  description: string
  paramsSchema: GeneratedJsonSchema}

type AiApiObjectMetadata = {
  className: string
  kind: string
  name: string
  description: string
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
  readonly apiByContextKey: Map<string, MutableAiApiObjectMetadata>
  readonly expandingKeys: Set<string>}

type MutableAiApiObjectMetadata = {
  className: string
  kind: string
  name: string
  description: string
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

export type ModuleMetadataGenerationResult = {
  abilities: readonly ModuleAbilityMetadata[]
  outFile?: string
  moduleMetadata: readonly AiModuleMetadataJson[]
  diagnostics: ModuleMetadataDiagnostics
  moduleOutFile?: string
  vcmCatalogOutFile?: string
  vcmCatalogElementCount?: number}

const MODULE_METADATA_SCHEMA_VERSION = 1
const MODULE_ATTACK_SURFACE_RISKS = ['low', 'medium', 'high', 'critical'] as const
const MODULE_MUTATION_MODES = ['read', 'write', 'delete', 'execute', 'read-write'] as const
const MODULE_ATTACK_SURFACE_RISK_VALUES: ReadonlySet<string> = new Set(MODULE_ATTACK_SURFACE_RISKS)
const MODULE_MUTATION_MODE_VALUES: ReadonlySet<string> = new Set(MODULE_MUTATION_MODES)

const PAGE_DESIGN_MODULE_METADATA_SOURCES = [
  'packages/spark-project-model/src/entity/project/project.entity.ts',
  'packages/spark-project-model/src/entity/node/config-page.entity.ts',
  'packages/spark-data/src/dataset-crud-tool.ts',
  'packages/spark-data/src/node-tree/spark-node-tree.ts',
] as const

const PAGE_DESIGN_MODULE_METADATA_API_ROOTS = ['ProjectModel'] as const

const PAGE_DESIGN_VCM_MODEL_METADATA_OUT_FILE =
  'packages/spark-project-model/src/ai/page-design/page-design-vcm-metadata.generated.json'

export function generatePageDesignModuleMetadata(root: string): ModuleMetadataGenerationResult {
  return generateModuleAbilityMetadata(root, {
    sources: PAGE_DESIGN_MODULE_METADATA_SOURCES,
    vcmCatalogOutFile: PAGE_DESIGN_VCM_MODEL_METADATA_OUT_FILE,
    apiRoots: PAGE_DESIGN_MODULE_METADATA_API_ROOTS,
  })
}

export function generateModuleAbilityMetadata(
  root: string,
  options: ModuleAbilityMetadataGeneratorOptions,
): ModuleMetadataGenerationResult {
  const rootFiles = options.sources.map(source => resolve(root, source))
  const program = ts.createProgram(rootFiles, {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
  })
  const checker = program.getTypeChecker()
  const trace = createModuleMetadataTrace(
    options.trace === true,
    options.extractResults === true,
    options.extractResultSchemas === true,
  )
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
    return extractApiObjectMetadata(sourceFile, checker, new Set(options.apiRoots ?? []), trace)
  })
  validateGeneratedAbilities(abilities)
  const diagnostics = createModuleMetadataDiagnostics(abilities, moduleMetadata)
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
      writeFileSync(moduleRuntimeOutFile, formatRuntimeGeneratedApiObjectMetadata(moduleMetadata), 'utf8')
    }
  }
  return {
    abilities,
    ...(outFile === undefined ? {} : { outFile }),
    moduleMetadata,
    diagnostics,
    ...(moduleOutFile === undefined ? {} : { moduleOutFile }),
    ...(vcmCatalogOutFile === undefined ? {} : { vcmCatalogOutFile }),
    ...(vcmCatalogOutFile === undefined ? {} : { vcmCatalogElementCount }),
  }
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
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  apiRoots: ReadonlySet<string>,
  trace: ModuleMetadataTrace,
): AiModuleMetadataJson[] {
  const modules: AiModuleMetadataJson[] = []
  const state = createApiObjectExtractionState()

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

function createApiObjectExtractionState(): ApiObjectExtractionState {
  return {
    apiByContextKey: new Map(),
    expandingKeys: new Set(),
  }
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
  trace.log(`class ${className} -> kind=${kind}`)
  const api: MutableAiApiObjectMetadata = {
    className,
    kind,
    name: firstTagText(tags, 'moduleName') ?? className,
    description: firstTagText(tags, 'moduleDescription') ?? summary ?? kind,
    attributes: createApiAttributeMetadata(checker, node, cacheVisited, trace, state),
    actions: [],
  }
  const constructorSignature = createApiConstructorMetadata(checker, node)
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
): AiApiConstructorMetadata | undefined {
  const constructorNode = node.members.find(ts.isConstructorDeclaration)
  if (constructorNode === undefined) return undefined
  const description = readSummary(constructorNode) ?? `Create ${node.name?.text ?? 'module'} instance.`
  return {
    description,
    paramsSchema: generateParamsSchema(checker, constructorNode),
  }
}

function createApiAttributeMetadata(
  checker: ts.TypeChecker,
  node: ts.ClassDeclaration,
  visited: Set<ts.Symbol>,
  trace: ModuleMetadataTrace,
  state: ApiObjectExtractionState,
): AiApiAttributeMetadata[] {
  return collectApiAttributeMembers(checker, node)
    .map(member => createApiAttributeMetadataFromMember(checker, member, visited, trace, state))
    .filter(isNotUndefined)
}

type ApiAttributeMember = ts.PropertyDeclaration | ts.GetAccessorDeclaration

function collectApiAttributeMembers(checker: ts.TypeChecker, node: ts.ClassDeclaration): ApiAttributeMember[] {
  const baseClass = readBaseClassDeclaration(checker, node)
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

function readBaseClassDeclaration(checker: ts.TypeChecker, node: ts.ClassDeclaration): ts.ClassDeclaration | undefined {
  const extendsClause = node.heritageClauses
    ?.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)
    ?.types[0]
  if (extendsClause === undefined) return undefined
  const baseType = checker.getTypeAtLocation(extendsClause.expression)
  const declaration = baseType.symbol.declarations?.find(ts.isClassDeclaration)
  return declaration
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
  const schema = tsTypeToJsonSchema(checker, checker.getTypeAtLocation(member))
  const api = createApiObjectFromType(checker, checker.getTypeAtLocation(member), visited, trace, state)
  return {
    name,
    description,
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
  const paramsSchema = generateParamsSchema(checker, node)
  const takesContext = hasLeadingContextParameter(checker, node)
  const resultType = trace.extractResults ? getInnerReturnType(checker, node) : undefined
  const resultSchema = !trace.extractResultSchemas || resultType === undefined || isVoidLikeType(resultType)
    ? undefined
    : tsTypeToJsonSchema(checker, resultType)
  const resultApis = hasDocTag(tags, 'vcmNoResultApis') || resultType === undefined || isVoidLikeType(resultType)
    ? undefined
    : discoverResultApis({ checker, type: resultType, resultPath: [], visited, trace, state, seenTypes: new Set() })
  trace.log(`  action ${actionName}: done ${String(Date.now() - startedAt)}ms`)
  return {
    name: actionName,
    methodName: propertyNameText(node.name, sourceFile),
    description: readSummary(node) ?? actionName,
    paramsSchema,
    takesContext,
    ...(resultSchema === undefined ? {} : { resultSchema }),
    ...(resultApis === undefined ? {} : { resultApis }),
    usageRules: [],
    failureModes: [],
  }
}

type ApiCallableDeclaration = ts.MethodDeclaration | ts.ConstructorDeclaration

function generateParamsSchema(checker: ts.TypeChecker, node: ApiCallableDeclaration): GeneratedJsonSchema {
  const argsParam = readArgsObjectParameter(checker, node)
  if (argsParam !== undefined) {
    const schema = tsTypeToJsonSchema(checker, checker.getTypeAtLocation(argsParam))
    return isGeneratedSchemaObject(schema) && schema.type === 'object' ? schema : { type: 'object', properties: {}, required: [] }
  }
  const params = node.parameters.filter(param => !isContextParameter(checker, param))
  if (params.length === 0) return { type: 'object', properties: {}, required: [] }
  const properties: Record<string, GeneratedJsonSchema> = {}
  const required: string[] = []
  for (const param of params) {
    const name = propertyNameText(param.name, node.getSourceFile())
    properties[name] = tsTypeToJsonSchema(checker, checker.getTypeAtLocation(param))
    if (param.questionToken === undefined && param.initializer === undefined) required.push(name)
  }
  return {
    type: 'object',
    properties,
    required,
  }
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
  const symbol = type.getSymbol()
  if (symbol === undefined || visited.has(symbol)) return undefined
  const classDeclaration = symbol.declarations?.find(ts.isClassDeclaration)
  if (classDeclaration !== undefined) {
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

  return {
    name: actionName,
    methodName: propertyNameText(node.name, sourceFile),
    ...(description !== undefined ? { description } : {}),
    params: node.parameters.map(param => createParameterMetadata(sourceFile, param, tags)),
    ...(returnType !== undefined ? { returnType } : {}),
    usageRules: [],
    failureModes: [],
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
    file: normalizePath(relative(root, sourceFile.fileName)),
    line: pos.line + 1,
  }
}

function readDocTags(node: ts.Node, sourceFile: ts.SourceFile): ModuleDocTag[] {
  return ts.getJSDocTags(node).map(tag => ({
    name: tag.tagName.getText(sourceFile),
    text: normalizeJsDocTagText(tag.comment),
    node: tag,
  }))
}

function readSummary(node: ts.Node): string | undefined {
  const jsDoc = readLastJsDoc(node)
  const summary = normalizeJsDocText(jsDoc?.comment)
  return summary.length > 0 ? summary : undefined
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
  return `${JSON.stringify({
    schemaVersion: MODULE_METADATA_SCHEMA_VERSION,
    generatedBy: 'packages/vite-plugin-spark-catalog/src/module-metadata-cli.ts',
    note: 'Do not edit by hand; update domain API class JSDoc and rerun pnpm run generate:module-metadata.',
    diagnostics,
    modules: moduleMetadata,
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
): string {
  return `${JSON.stringify({
    schemaVersion: MODULE_METADATA_SCHEMA_VERSION,
    generatedBy: 'packages/vite-plugin-spark-catalog/src/module-metadata-cli.ts',
    note: 'Runtime metadata; diagnostics are emitted in page-design-module-metadata.generated.json.',
    modules: moduleMetadata,
  }, null, 2)}\n`
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
