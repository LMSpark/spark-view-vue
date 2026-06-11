/**
 * @module @spark-appworks/spark-ai:class-model/class-model/build-dts-class-model-bundle
 * 职责：把 declarations 下的 DTS 文件投影成 ClassModel JSON bundle，生成 manifest、per-file shard 和 semantic-gaps 日志。
 * 边界：只负责编译期索引生成和语义缺口报告，不在运行时解析业务数据，也不替代源文件 JSDoc。
 * AI用途：需要重建知识索引、定位 JSDoc 断链或验证模块/成员语义闭环时，用本模块作为编译入口。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, posix, relative, resolve } from 'node:path'

import ts from 'typescript'

import {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  type DtsFileModuleSemanticMeta,
  type DtsClassModelSemanticGap,
  type DtsClassModelSemanticGapKind,
  type DtsClassModelSemanticGapReport,
  type DtsClassModelBundleManifest,
  type DtsFileProjectionDocument,
} from './dts-bundle-types'
import type { AttributeMeta, ClassModel, ConstructorMeta, MethodMeta, SourceProvenanceMeta } from './types'
import type { AiJsonSchema, AiJsonSchemaObject } from '../../json'
import { projectDtsSourceFileProjection } from './project-from-declarations'

/** Build Dts Class Model Bundle Progress Phase 的语义模型。 */
export type BuildDtsClassModelBundleProgressPhase =
  | 'create-program'
  | 'program-ready'
  | 'project-file'
  | 'write-semantic-gaps'
  | 'write-manifest'
  | 'done'

/** Build Dts Class Model Bundle Progress 的语义模型。 */
export type BuildDtsClassModelBundleProgress = Readonly<{
  phase: BuildDtsClassModelBundleProgressPhase
  current?: number
  total?: number
  sourcePath?: string
}>

/** Build Dts Class Model Bundle Options 的调用配置。 */
export type BuildDtsClassModelBundleOptions = Readonly<{
  repoRoot: string
  rootFiles: readonly string[]
  outputDir: string
  exportedOnly?: boolean
  onProgress?: (event: BuildDtsClassModelBundleProgress) => void
  progressInterval?: number
}>

/** Build Dts Class Model Bundle Result 的返回结果。 */
export type BuildDtsClassModelBundleResult = Readonly<{
  manifest: DtsClassModelBundleManifest
  manifestPath: string
  semanticLogPath: string
  semanticLogJsonPath: string
  semanticGapCount: number
  fileCount: number
  modelCount: number
}>

type CreateSemanticGapCommand = Readonly<{
  kind: Exclude<DtsClassModelSemanticGapKind, 'module'>
  model: ClassModel
  provenance: SourceProvenanceMeta | undefined
  memberName?: string
}>

type ProjectedBundleFile = Readonly<{
  sourcePath: string
  projection: DtsFileProjectionDocument
  bundleFile: string
  outputPath: string
}>

type TypeReferenceTarget = Readonly<{
  targetName: string
  targetSourcePath: string
}>

type BundleSchemaRefContext = Readonly<{
  currentSourcePath: string
  currentBundleFile: string
  projectedClassNamesBySourcePath: ReadonlyMap<string, ReadonlySet<string>>
  typeReferenceIndex: ReadonlyMap<string, ReadonlyMap<string, TypeReferenceTarget>>
}>

export function dtsSourcePathToBundleRelativeJson(sourcePath: string): string {
  return `files/${sourcePath}.json`
}

export function buildDtsClassModelBundle(
  options: BuildDtsClassModelBundleOptions,
): BuildDtsClassModelBundleResult {
  const repoRoot = resolve(options.repoRoot)
  const outputDir = resolve(options.outputDir)
  const rootFiles = options.rootFiles.filter(absolutePath => {
    const sourcePath = normalizeRepoPath(absolutePath, repoRoot)
    return sourcePath.startsWith('declarations/')
  })
  const total = rootFiles.length
  const progressInterval = options.progressInterval ?? 50
  reportProgress(options, { phase: 'create-program', total })
  const program = createBundleProjectionProgram(rootFiles)
  const checker = program.getTypeChecker()
  reportProgress(options, { phase: 'program-ready', total })
  const files: Record<string, DtsClassModelBundleManifest['files'][string]> = {}
  const classIndex: Record<string, DtsClassModelBundleManifest['classIndex'][string]> = {}
  const duplicates: Array<{ className: string; keptFile: string; skippedFile: string }> = []
  const semanticGaps: DtsClassModelSemanticGap[] = []
  const projectedFiles: ProjectedBundleFile[] = []
  const typeReferenceIndex = new Map<string, ReadonlyMap<string, TypeReferenceTarget>>()
  let modelCount = 0

  for (const [index, absolutePath] of rootFiles.entries()) {
    const sourcePath = normalizeRepoPath(absolutePath, repoRoot)
    const sourceFile = resolveProgramSourceFile(program, absolutePath)
    const typeReferenceTargets = collectDtsTypeReferenceTargets({
      checker,
      repoRoot,
      sourceFile,
    })
    if (typeReferenceTargets.size > 0) typeReferenceIndex.set(sourcePath, typeReferenceTargets)

    const projection = projectDtsSourceFileProjection({
      repoRoot,
      absolutePath,
      sourceFile,
      checker,
      exportedOnly: options.exportedOnly ?? false,
    })
    const bundleFile = dtsSourcePathToBundleRelativeJson(sourcePath)
    const normalizedBundleFile = bundleFile.replace(/\\/g, '/')
    const outputPath = resolve(outputDir, bundleFile)
    projectedFiles.push({
      sourcePath,
      projection,
      bundleFile: normalizedBundleFile,
      outputPath,
    })

    files[sourcePath] = {
      file: normalizedBundleFile,
      module: projection.module,
    }
    modelCount += Object.keys(projection.models).length
    semanticGaps.push(...collectSemanticGaps(projection))

    for (const className of projection.symbols) {
      const existing = classIndex[className]
      if (existing !== undefined) {
        duplicates.push({
          className,
          keptFile: existing.sourcePath,
          skippedFile: sourcePath,
        })
        continue
      }
      classIndex[className] = {
        sourcePath,
        file: normalizedBundleFile,
      }
    }

    const current = index + 1
    if (shouldReportFileProgress(current, total, progressInterval)) {
      reportProgress(options, {
        phase: 'project-file',
        current,
        total,
        sourcePath,
      })
    }
  }

  const projectedClassNamesBySourcePath = new Map(
    projectedFiles.map(file => [file.sourcePath, new Set(Object.keys(file.projection.models))] as const),
  )
  for (const projectedFile of projectedFiles) {
    const compactProjection = compactDtsFileProjectionForBundle(projectedFile.projection, {
      currentSourcePath: projectedFile.sourcePath,
      currentBundleFile: projectedFile.bundleFile,
      projectedClassNamesBySourcePath,
      typeReferenceIndex,
    })
    mkdirSync(dirname(projectedFile.outputPath), { recursive: true })
    writeFileSync(projectedFile.outputPath, `${JSON.stringify(compactProjection, null, 2)}\n`, 'utf8')
  }

  const generatedAt = new Date().toISOString()
  const semanticReport = createSemanticGapReport(generatedAt, semanticGaps)
  const semanticLogPath = resolve(outputDir, 'semantic-gaps.log')
  const semanticLogJsonPath = resolve(outputDir, 'semantic-gaps.json')
  reportProgress(options, { phase: 'write-semantic-gaps', total })
  writeFileSync(semanticLogPath, renderSemanticGapLog(semanticReport), 'utf8')
  writeFileSync(semanticLogJsonPath, `${JSON.stringify(semanticReport, null, 2)}\n`, 'utf8')

  const manifest: DtsClassModelBundleManifest = {
    schemaVersion: DTS_CLASS_MODEL_BUNDLE_VERSION,
    protocol: DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
    generatedAt,
    scannedFileCount: Object.keys(files).length,
    files,
    classIndex,
    ...(duplicates.length === 0 ? {} : { duplicates }),
  }
  const manifestPath = resolve(outputDir, 'manifest.json')
  mkdirSync(outputDir, { recursive: true })
  reportProgress(options, { phase: 'write-manifest', total })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  assertBundleFilesExist(outputDir, files)
  reportProgress(options, { phase: 'done', total })

  return {
    manifest,
    manifestPath,
    semanticLogPath,
    semanticLogJsonPath,
    semanticGapCount: semanticReport.gapCount,
    fileCount: Object.keys(files).length,
    modelCount,
  }
}

export function resolveDtsBundleRelativeUrl(manifestUrl: string, relativePath: string): string {
  return new URL(relativePath.replace(/\\/g, '/'), new URL(manifestUrl)).href
}

function normalizeRepoPath(absolutePath: string, repoRoot: string): string {
  return relative(resolve(repoRoot), resolve(absolutePath)).replace(/\\/g, '/')
}

function createBundleProjectionProgram(rootFiles: readonly string[]): ts.Program {
  return ts.createProgram({
    rootNames: rootFiles.map(file => resolve(file)),
    options: {
      allowJs: false,
      declaration: true,
      emitDeclarationOnly: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  })
}

function resolveProgramSourceFile(program: ts.Program, absolutePath: string): ts.SourceFile {
  const resolvedPath = resolve(absolutePath)
  const direct = program.getSourceFile(resolvedPath)
  if (direct !== undefined) return direct

  const sourceFile = program.getSourceFiles().find(candidate => {
    return normalizeSourceFileKey(candidate.fileName) === normalizeSourceFileKey(resolvedPath)
  })
  if (sourceFile !== undefined) return sourceFile

  throw new Error(`DTS source file not found in shared TypeScript program: ${resolvedPath}`)
}

function collectDtsTypeReferenceTargets(command: {
  checker: ts.TypeChecker
  repoRoot: string
  sourceFile: ts.SourceFile
}): ReadonlyMap<string, TypeReferenceTarget> {
  const { checker, repoRoot, sourceFile } = command
  const targets = new Map<string, TypeReferenceTarget>()
  const visit = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node)) {
      const target = resolveDtsTypeReferenceTarget(checker, repoRoot, node)
      if (target !== undefined) targets.set(node.getText(sourceFile), target)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return targets
}

function resolveDtsTypeReferenceTarget(
  checker: ts.TypeChecker,
  repoRoot: string,
  node: ts.TypeReferenceNode,
): TypeReferenceTarget | undefined {
  const symbol = resolveAliasedSymbol(checker, checker.getSymbolAtLocation(node.typeName))
  const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0]
  if (declaration === undefined) return undefined
  const targetSourcePath = normalizeRepoPath(declaration.getSourceFile().fileName, repoRoot)
  if (!targetSourcePath.startsWith('declarations/')) return undefined
  const targetName = declarationNameText(declaration) ?? symbol?.name
  if (targetName === undefined || targetName.length === 0 || targetName === '__type') return undefined
  return {
    targetName,
    targetSourcePath,
  }
}

function resolveAliasedSymbol(checker: ts.TypeChecker, symbol: ts.Symbol | undefined): ts.Symbol | undefined {
  if (symbol === undefined) return undefined
  return (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol)
}

function declarationNameText(declaration: ts.Declaration): string | undefined {
  const name = (declaration as ts.Declaration & { name?: ts.Node }).name
  return name !== undefined && ts.isIdentifier(name) ? name.text : undefined
}

function normalizeSourceFileKey(fileName: string): string {
  const resolved = resolve(fileName)
  return ts.sys.useCaseSensitiveFileNames ? resolved : resolved.toLowerCase()
}

function shouldReportFileProgress(current: number, total: number, interval: number): boolean {
  if (total === 0) return false
  if (current === total) return true
  if (interval <= 0) return false
  return current % interval === 0
}

function reportProgress(
  options: BuildDtsClassModelBundleOptions,
  event: BuildDtsClassModelBundleProgress,
): void {
  options.onProgress?.(event)
}

function assertBundleFilesExist(
  outputDir: string,
  files: DtsClassModelBundleManifest['files'],
): void {
  const missing: string[] = []
  for (const [sourcePath, entry] of Object.entries(files)) {
    if (!existsSync(resolve(outputDir, entry.file))) missing.push(sourcePath)
  }
  if (missing.length > 0) {
    throw new Error([
      `DTS ClassModel bundle is missing ${String(missing.length)} shard file(s).`,
      ...missing.slice(0, 20).map(sourcePath => `- ${sourcePath}`),
      ...(missing.length > 20 ? [`... ${String(missing.length - 20)} more`] : []),
    ].join('\n'))
  }
}

function compactDtsFileProjectionForBundle(
  projection: DtsFileProjectionDocument,
  refContext: BundleSchemaRefContext,
): DtsFileProjectionDocument {
  const models: Record<string, ClassModel> = {}
  for (const [className, model] of Object.entries(projection.models)) {
    models[className] = compactClassModelForBundle(model, refContext)
  }
  const schemaDefs = createSchemaDefsForBundle(models, refContext)
  return {
    ...projection,
    ...(Object.keys(schemaDefs).length === 0 ? {} : { $defs: schemaDefs }),
    models,
  }
}

function compactClassModelForBundle(model: ClassModel, refContext: BundleSchemaRefContext): ClassModel {
  return {
    ...model,
    ...(model.constructorMeta === undefined
      ? {}
      : { constructorMeta: compactConstructorMetaForBundle(model.constructorMeta) }),
    attributes: model.attributes.map(attribute => compactAttributeMetaForBundle(attribute, refContext)),
    methods: model.methods.map(compactMethodMetaForBundle),
  }
}

function compactConstructorMetaForBundle(constructorMeta: ConstructorMeta): ConstructorMeta {
  const signatureText = constructorMeta.signatureText?.trim()
  if (signatureText === undefined || signatureText.length === 0) {
    throw new Error('DTS constructor is missing signatureText')
  }
  return {
    jsdoc: constructorMeta.jsdoc,
    signatureText,
    parameterStyle: constructorMeta.parameterStyle ?? 'positional',
    parameters: constructorMeta.parameters ?? [],
  }
}

function compactAttributeMetaForBundle(
  attribute: AttributeMeta,
  refContext: BundleSchemaRefContext,
): AttributeMeta {
  return {
    name: attribute.name,
    jsdoc: attribute.jsdoc,
    schema: referenceRequiredSchemaForBundle(attribute.schema, refContext),
    readable: attribute.readable,
    writable: attribute.writable,
  }
}

function compactMethodMetaForBundle(method: MethodMeta): MethodMeta {
  const signatureText = method.signatureText?.trim()
  if (signatureText === undefined || signatureText.length === 0) {
    throw new Error(`DTS method is missing signatureText: ${method.name}`)
  }
  return {
    name: method.name,
    jsdoc: method.jsdoc,
    signatureText,
    parameterStyle: method.parameterStyle ?? 'positional',
    parameters: method.parameters ?? [],
    ...(method.returnType === undefined ? {} : { returnType: method.returnType }),
    ...(method.takesContext === undefined ? {} : { takesContext: method.takesContext }),
  }
}

function createSchemaDefsForBundle(
  models: Readonly<Record<string, ClassModel>>,
  refContext: BundleSchemaRefContext,
): Record<string, AiJsonSchemaObject> {
  const defs: Record<string, AiJsonSchemaObject> = {}
  for (const [className, model] of Object.entries(models)) {
    defs[className] = classModelSchemaDefForBundle(model, refContext)
  }
  return defs
}

function classModelSchemaDefForBundle(
  model: ClassModel,
  refContext: BundleSchemaRefContext,
): AiJsonSchemaObject {
  const properties: Record<string, AiJsonSchema> = {}
  for (const attribute of model.attributes) {
    if (!attribute.readable) continue
    properties[attribute.name] = referenceRequiredSchemaForBundle(attribute.schema, refContext)
  }
  return {
    type: 'object',
    title: model.className,
    ...(model.jsdoc.trim().length === 0 ? {} : { description: model.jsdoc.trim() }),
    ...(Object.keys(properties).length === 0 ? {} : { properties }),
  }
}

function referenceRequiredSchemaForBundle(
  schema: AiJsonSchema,
  refContext: BundleSchemaRefContext,
): AiJsonSchema {
  return referenceSchemaForBundle(schema, refContext) ?? true
}

function referenceSchemaForBundle(
  schema: AiJsonSchema | undefined,
  refContext: BundleSchemaRefContext,
): AiJsonSchema | undefined {
  if (schema === undefined || schema === true || schema === false || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema
  }

  const directRef = directSchemaRefForBundle(schema, refContext)
  if (directRef !== undefined) return directRef

  const next: Record<string, unknown> = { ...schema }
  if (schema['items'] !== undefined) next['items'] = referenceSchemaForBundle(schema['items'], refContext)
  if (schema['properties'] !== undefined) {
    const properties: Record<string, AiJsonSchema> = {}
    for (const [name, child] of Object.entries(schema['properties'])) {
      const referenced = referenceSchemaForBundle(child, refContext)
      if (referenced !== undefined) properties[name] = referenced
    }
    next['properties'] = properties
  }
  if (schema['anyOf'] !== undefined) {
    next['anyOf'] = schema['anyOf'].map(child => referenceSchemaForBundle(child, refContext) ?? true)
  }
  if (schema['oneOf'] !== undefined) {
    next['oneOf'] = schema['oneOf'].map(child => referenceSchemaForBundle(child, refContext) ?? true)
  }
  if (schema['allOf'] !== undefined) {
    next['allOf'] = schema['allOf'].map(child => referenceSchemaForBundle(child, refContext) ?? true)
  }
  if (schema['not'] !== undefined) next['not'] = referenceSchemaForBundle(schema['not'], refContext)
  return next
}

function directSchemaRefForBundle(
  schema: AiJsonSchemaObject,
  refContext: BundleSchemaRefContext,
): AiJsonSchemaObject | undefined {
  if (!isTypeReferencePlaceholderSchema(schema)) return undefined
  const title = schema.title
  if (typeof title !== 'string') return undefined
  const dtsTarget = dtsTypeReferenceTargetForBundle(title, refContext)
  if (dtsTarget !== undefined) {
    return {
      $ref: schemaRefForBundleFile(
        refContext.currentBundleFile,
        dtsSourcePathToBundleRelativeJson(dtsTarget.targetSourcePath).replace(/\\/g, '/'),
        dtsTarget.targetName,
      ),
      ...(title === dtsTarget.targetName ? {} : { title }),
    }
  }
  return undefined
}

function dtsTypeReferenceTargetForBundle(
  title: string,
  refContext: BundleSchemaRefContext,
): TypeReferenceTarget | undefined {
  const sourceTargets = refContext.typeReferenceIndex.get(refContext.currentSourcePath)
  const target = sourceTargets?.get(title)
  if (target === undefined) return undefined
  return refTargetExists(target, refContext) ? target : undefined
}

function refTargetExists(
  target: TypeReferenceTarget,
  refContext: BundleSchemaRefContext,
): boolean {
  return refContext.projectedClassNamesBySourcePath.get(target.targetSourcePath)?.has(target.targetName) ?? false
}

function isTypeReferencePlaceholderSchema(schema: AiJsonSchemaObject): boolean {
  return schema.type === 'object'
    && typeof schema.title === 'string'
    && schema.properties === undefined
    && schema.items === undefined
    && schema.anyOf === undefined
    && schema.oneOf === undefined
    && schema.allOf === undefined
    && schema.not === undefined
    && schema.$ref === undefined
}

function schemaRefForBundleFile(
  currentBundleFile: string,
  targetBundleFile: string | undefined,
  className: string,
): string {
  const pointer = `#/$defs/${jsonPointerToken(className)}`
  if (targetBundleFile === undefined || targetBundleFile === currentBundleFile) return pointer
  const relativePath = posix.relative(posix.dirname(currentBundleFile), targetBundleFile)
  return `${relativePath}${pointer}`
}

function jsonPointerToken(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function collectSemanticGaps(projection: DtsFileProjectionDocument): readonly DtsClassModelSemanticGap[] {
  const gaps: DtsClassModelSemanticGap[] = []
  if (
    isMissingJsDoc(projection.module.jsdoc)
    || projection.module.jsdocSource === 'inferred'
    || isWeakModuleJsDoc(projection.module.jsdoc)
  ) {
    gaps.push(createModuleSemanticGap(projection.module))
  }
  for (const model of Object.values(projection.models)) {
    if (isMissingJsDoc(model.jsdoc)) {
      gaps.push(createSemanticGap({ kind: 'model', model, provenance: model.provenance }))
    }
    const constructorMeta = model.constructorMeta
    if (constructorMeta !== undefined && isMissingJsDoc(constructorMeta.jsdoc)) {
      gaps.push(createSemanticGap({
        kind: 'constructor',
        model,
        provenance: constructorMeta.provenance,
        memberName: 'constructor',
      }))
    }
    for (const attribute of model.attributes) {
      if (isMissingJsDoc(attribute.jsdoc)) {
        gaps.push(createSemanticGap({
          kind: 'attribute',
          model,
          provenance: attribute.provenance,
          memberName: attribute.name,
        }))
      }
    }
    for (const method of model.methods) {
      if (isMissingJsDoc(method.jsdoc)) {
        gaps.push(createSemanticGap({
          kind: 'method',
          model,
          provenance: method.provenance,
          memberName: method.name,
        }))
      }
    }
  }
  return gaps
}

function createModuleSemanticGap(module: DtsFileModuleSemanticMeta): DtsClassModelSemanticGap {
  return {
    kind: 'module',
    className: module.name,
    moduleName: module.name,
    reason: moduleSemanticGapReason(module),
    chainBreak: describeModuleSemanticGapChainBreak(module),
    fixHint: `在 ${module.sourceFile} 文件顶部补高质量模块级 JSDoc：说明职责、边界和 AI 选择该模块的用途，然后重新生成 declarations 和 dts-class-model。`,
    declarationFile: module.sourcePath,
    declarationLine: 1,
    sourceFile: module.sourceFile,
    ...(module.componentName === undefined ? {} : { componentName: module.componentName }),
    ...(module.componentType === undefined ? {} : { componentType: module.componentType }),
    ...(module.componentLevel === undefined ? {} : { componentLevel: module.componentLevel }),
    ...(module.componentLayer === undefined ? {} : { componentLayer: module.componentLayer }),
    ...(module.componentDirectory === undefined ? {} : { componentDirectory: module.componentDirectory }),
  }
}

function createSemanticGap(command: CreateSemanticGapCommand): DtsClassModelSemanticGap {
  const { kind, model, provenance, memberName } = command
  const declarationFile = provenance?.file ?? ''
  const declarationLine = provenance?.line ?? 1
  const sourceFile = sourceFileFromDeclarationFile(declarationFile)
  return {
    kind,
    className: model.className,
    ...(memberName === undefined ? {} : { memberName }),
    reason: 'missing-jsdoc',
    chainBreak: describeSemanticGapChainBreak(kind, model, memberName),
    fixHint: `在 ${sourceFile} 的对应声明前补 JSDoc，然后重新生成 declarations 和 dts-class-model。`,
    declarationFile,
    declarationLine,
    sourceFile,
    ...(provenance?.componentName === undefined ? {} : { componentName: provenance.componentName }),
    ...(provenance?.componentType === undefined ? {} : { componentType: provenance.componentType }),
    ...(provenance?.componentLevel === undefined ? {} : { componentLevel: provenance.componentLevel }),
    ...(provenance?.componentLayer === undefined ? {} : { componentLayer: provenance.componentLayer }),
    ...(provenance?.componentDirectory === undefined ? {} : { componentDirectory: provenance.componentDirectory }),
    ...(provenance?.declarationKind === undefined ? {} : { declarationKind: provenance.declarationKind }),
  }
}

function isMissingJsDoc(jsdoc: string): boolean {
  return jsdoc.trim().length === 0
}

function isWeakModuleJsDoc(jsdoc: string): boolean {
  const normalized = jsdoc.trim()
  if (normalized.length === 0) return false
  if (!hasModuleSemanticSections(normalized)) return true
  return /^@module\s+[^\n]+\n(?:@spark-appworks\/[^\s]+|app|workspace) 的 [^\n]+ 模块。\n导出 ClassModel symbol:/u.test(normalized)
    || /^@module\s+[^\n]+\n[^\n]+ 模块，属于 SPARK component [^\n]+。\n组件目录:/u.test(normalized)
    || /^@module\s+[^\n]+\n[^\n]+\n该 DTS shard 当前不导出 ClassModel symbol。$/u.test(normalized)
}

function hasModuleSemanticSections(jsdoc: string): boolean {
  return /^@module\s+\S+/u.test(jsdoc.trim())
    && jsdoc.includes('职责：')
    && jsdoc.includes('边界：')
    && jsdoc.includes('AI用途：')
}

function moduleSemanticGapReason(module: DtsFileModuleSemanticMeta): DtsClassModelSemanticGap['reason'] {
  if (module.jsdocSource === 'inferred') return 'inferred-module-jsdoc'
  if (isWeakModuleJsDoc(module.jsdoc)) return 'weak-module-jsdoc'
  return 'missing-jsdoc'
}

function describeModuleSemanticGapChainBreak(module: DtsFileModuleSemanticMeta): string {
  if (module.jsdocSource === 'inferred') {
    return `${module.name} 的模块级语义链断开：文件入口没有 JSDoc；当前只能使用路径、组件目录和导出 symbol 推导。`
  }
  if (isWeakModuleJsDoc(module.jsdoc)) {
    return `${module.name} 的模块级语义链过弱：当前说明只复述包名、路径、组件目录或 symbol 列表，没有表达职责、边界和使用场景。`
  }
  return `${module.name} 的模块级语义链断开：文件入口没有 JSDoc。`
}

function describeSemanticGapChainBreak(
  kind: DtsClassModelSemanticGapKind,
  model: ClassModel,
  memberName: string | undefined,
): string {
  if (kind === 'model') {
    return `${model.className} 的模型语义链在首次声明处断开：声明没有 JSDoc。`
  }
  if (kind === 'constructor') {
    return `${model.className}.constructor 的构造语义链断开：构造签名没有 JSDoc。`
  }
  return `${model.className}.${memberName ?? '<unknown>'} 的成员语义链断开：${kind} 声明没有 JSDoc。`
}

function sourceFileFromDeclarationFile(declarationFile: string): string {
  const sourcePath = declarationFile.startsWith('declarations/')
    ? declarationFile.slice('declarations/'.length)
    : declarationFile
  if (sourcePath.endsWith('.vue.d.ts')) return sourcePath.slice(0, -'.d.ts'.length)
  if (sourcePath.endsWith('.d.ts')) return `${sourcePath.slice(0, -'.d.ts'.length)}.ts`
  return sourcePath
}

function createSemanticGapReport(
  generatedAt: string,
  gaps: readonly DtsClassModelSemanticGap[],
): DtsClassModelSemanticGapReport {
  const sorted = [...gaps].sort(compareSemanticGaps)
  return {
    generatedAt,
    gapCount: sorted.length,
    notes: [
      '.d.ts 是类型关系真源；declarationRelations 保留 extends / alias / intersection / union 等直接声明边。',
      'module 是单个 DTS shard 的入口语义；必须来自源文件头 JSDoc，路径/组件目录/symbol 推导只作为定位日志，不算语义闭环。',
      'attributes 和 methods 是 TypeScript TypeChecker 派生缓存；当 JSDoc 缺失时，语义链断在本报告列出的 declaration/source 位置。',
    ],
    gaps: sorted,
  }
}

function compareSemanticGaps(left: DtsClassModelSemanticGap, right: DtsClassModelSemanticGap): number {
  return left.declarationFile.localeCompare(right.declarationFile)
    || left.declarationLine - right.declarationLine
    || left.className.localeCompare(right.className)
    || left.kind.localeCompare(right.kind)
    || (left.memberName ?? '').localeCompare(right.memberName ?? '')
}

function renderSemanticGapLog(report: DtsClassModelSemanticGapReport): string {
  const lines = [
    '# DTS ClassModel semantic gaps',
    `generatedAt: ${report.generatedAt}`,
    `gapCount: ${String(report.gapCount)}`,
    '',
    'notes:',
    ...report.notes.map(note => `  - ${note}`),
    '',
  ]
  if (report.gapCount === 0) {
    lines.push('No missing JSDoc semantic gaps found.', '')
    return lines.join('\n')
  }
  for (const gap of report.gaps) {
    const member = gap.kind === 'module'
      ? gap.moduleName ?? gap.className
      : gap.memberName === undefined ? gap.className : `${gap.className}.${gap.memberName}`
    lines.push(`[${gap.kind}] ${member}`)
    lines.push(`  reason: ${gap.reason}`)
    lines.push(`  chainBreak: ${gap.chainBreak}`)
    lines.push(`  declaration: ${gap.declarationFile}:${String(gap.declarationLine)}`)
    lines.push(`  source: ${gap.sourceFile}`)
    lines.push(`  fixHint: ${gap.fixHint}`)
    const component = renderSemanticGapComponent(gap)
    if (component.length > 0) lines.push(`  component: ${component}`)
    if (gap.declarationKind !== undefined) lines.push(`  declarationKind: ${gap.declarationKind}`)
    lines.push('')
  }
  return lines.join('\n')
}

function renderSemanticGapComponent(gap: DtsClassModelSemanticGap): string {
  return [
    gap.componentType === undefined ? undefined : `type=${gap.componentType}`,
    gap.componentName === undefined ? undefined : `name=${gap.componentName}`,
    gap.componentLevel === undefined ? undefined : `level=${gap.componentLevel}`,
    gap.componentLayer === undefined ? undefined : `layer=${gap.componentLayer}`,
    gap.componentDirectory === undefined ? undefined : `directory=${gap.componentDirectory}`,
  ].filter(part => part !== undefined).join('; ')
}
