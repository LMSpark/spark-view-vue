/**
 * AI 能力模块元数据生成器。
 *
 * 这条链路和组件 catalog 共享“源码 JSDoc -> 构建期元数据”的 VCM 思路，
 * 但提取对象是领域能力 class，而不是 Vue SFC 组件。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import ts from 'typescript'

export type ModuleAbilityMetadataGeneratorOptions = {
  sources: readonly string[]
  outFile: string}

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
  actions: readonly ModuleActionMetadata[]
  source: ModuleSourceRef & { className: string }}

export type ModuleMetadataGenerationResult = {
  abilities: readonly ModuleAbilityMetadata[]
  outFile: string}

const MODULE_METADATA_SCHEMA_VERSION = 1
const MODULE_ATTACK_SURFACE_RISKS = ['low', 'medium', 'high', 'critical'] as const
const MODULE_MUTATION_MODES = ['read', 'write', 'delete', 'execute', 'read-write'] as const
const MODULE_ATTACK_SURFACE_RISK_VALUES: ReadonlySet<string> = new Set(MODULE_ATTACK_SURFACE_RISKS)
const MODULE_MUTATION_MODE_VALUES: ReadonlySet<string> = new Set(MODULE_MUTATION_MODES)

const PAGE_DESIGN_MODULE_METADATA_SOURCES = [
  'packages/spark-page-config/src/page/model/spark-node-tree.ts',
  'packages/spark-data/src/dataset-crud-tool.ts',
] as const

const PAGE_DESIGN_MODULE_METADATA_OUT_FILE =
  'packages/spark-page-config/src/registrations/page-design-ability-metadata.generated.json'

export function generatePageDesignModuleMetadata(root: string): ModuleMetadataGenerationResult {
  return generateModuleAbilityMetadata(root, {
    sources: PAGE_DESIGN_MODULE_METADATA_SOURCES,
    outFile: PAGE_DESIGN_MODULE_METADATA_OUT_FILE,
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
  const abilities = rootFiles.flatMap((file) => {
    const sourceFile = program.getSourceFile(file)
    if (sourceFile === undefined) {
      throw new Error(`module metadata source not found: ${file}`)
    }
    return extractAbilityMetadata(root, sourceFile, checker)
  })
  validateGeneratedAbilities(abilities)

  const outFile = resolve(root, options.outFile)
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, formatGeneratedMetadata(abilities), 'utf8')
  return { abilities, outFile }
}

function extractAbilityMetadata(
  root: string,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
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
        }))
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return abilities
}

type CreateAbilityMetadataRequest = {
  root: string
  sourceFile: ts.SourceFile
  checker: ts.TypeChecker
  node: ts.ClassDeclaration
  tags: readonly ModuleDocTag[]
  abilityId: string}

function createAbilityMetadata(request: CreateAbilityMetadataRequest): ModuleAbilityMetadata {
  const {
    root,
    sourceFile,
    checker,
    node,
    tags,
    abilityId,
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
      .map(member => createActionMetadata({ root, sourceFile, checker, node: member }))
      .filter(isNotUndefined),
    source: {
      ...source,
      className: node.name?.text ?? '(anonymous)',
    },
  }
  validateGeneratedActions(ability)
  return ability
}

type ActionMetadataCreateInput = Readonly<{
  root: string
  sourceFile: ts.SourceFile
  checker: ts.TypeChecker
  node: ts.MethodDeclaration
}>

function createActionMetadata(input: ActionMetadataCreateInput): ModuleActionMetadata | undefined {
  const { root, sourceFile, checker, node } = input
  const tags = readDocTags(node, sourceFile)
  const actionName = firstTagText(tags, 'moduleAction')
  if (actionName === undefined) return undefined

  const description = readSummary(node)
  const returnType = readReturnType(checker, node)

  return {
    name: actionName,
    methodName: propertyNameText(node.name, sourceFile),
    ...(description !== undefined ? { description } : {}),
    params: node.parameters.map(param => createParameterMetadata(sourceFile, param, tags)),
    ...(returnType !== undefined ? { returnType } : {}),
    usageRules: tagTexts(tags, 'usageRule'),
    failureModes: tags
      .filter(tag => tag.name === 'failureMode')
      .map(parseFailureMode),
    examples: tagTexts(tags, 'example').map(parseExample),
    attackSurfaces: parseAttackSurfaces(tags),
    guards: tagTexts(tags, 'moduleGuard'),
    mutations: parseMutations(tags),
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

function parseFailureMode(tag: ModuleDocTag): ModuleFailureModeMetadata {
  const text = requireTagText(tag)
  const match = /^(\S+)\s+(.+?)\s*=>\s*(.+)$/u.exec(text)
  if (match?.[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
    return {
      code: match[1],
      when: match[2].trim(),
      fix: match[3].trim(),
    }
  }
  throw invalidTag(tag, 'expected "<code> <when> => <fix>"')
}

function parseExample(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
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

function isModuleAttackSurfaceRisk(value: string): value is typeof MODULE_ATTACK_SURFACE_RISKS[number] {
  return MODULE_ATTACK_SURFACE_RISK_VALUES.has(value)
}

function isModuleMutationMode(value: string): value is typeof MODULE_MUTATION_MODES[number] {
  return MODULE_MUTATION_MODE_VALUES.has(value)
}

function formatGeneratedMetadata(abilities: readonly ModuleAbilityMetadata[]): string {
  return `${JSON.stringify({
    schemaVersion: MODULE_METADATA_SCHEMA_VERSION,
    generatedBy: 'packages/vite-plugin-spark-catalog/src/module-metadata-cli.ts',
    note: 'Do not edit by hand; update domain ability class JSDoc and rerun pnpm run generate:module-metadata.',
    abilities,
  }, null, 2)}\n`
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
