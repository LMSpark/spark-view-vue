/**
 * @module @spark-appworks/spark-ai:class-model/class-model/build-dts-class-model-bundle
 * 职责：把内存 emit 的 DTS 文件投影成 ClassModel JSON bundle，生成 manifest、per-file shard 和 semantic-gaps 日志。
 * 边界：只负责编译期索引生成和语义缺口报告，不在运行时解析业务数据，也不替代源文件 JSDoc。
 * AI用途：需要重建知识索引、定位 JSDoc 断链或验证模块/成员语义闭环时，用本模块作为编译入口。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, posix, resolve } from 'node:path'

import ts from 'typescript'

import {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  DTS_CLASS_MODEL_RUNTIME_PROTOCOL,
  DTS_CLASS_MODEL_RUNTIME_VERSION,
  type DtsFileModuleSemanticMeta,
  type DtsClassModelRuntimeClassEntry,
  type DtsClassModelRuntimeConstructor,
  type DtsClassModelRuntimeLink,
  type DtsClassModelRuntimeManifest,
  type DtsClassModelRuntimeMethod,
  type DtsClassModelRuntimeRef,
  type DtsClassModelRuntimeSchemaRef,
  type DtsClassModelRuntimeShard,
  type DtsClassModelSemanticGap,
  type DtsClassModelSemanticGapKind,
  type DtsClassModelSemanticGapReport,
  type DtsClassModelBundleManifest,
  type DtsFileProjectionDocument,
} from './dts-bundle-types'
import type { AttributeMeta, ClassModel, ConstructorMeta, MethodMeta, SourceProvenanceMeta } from './types'
import type { AiJsonSchema, AiJsonSchemaObject } from '../../json'
import { canRenderMethodSignatureFromTypeTree, resolveMethodReturnType, visitDtsTypeMeta } from './dts-type-meta-ops'
import {
  isClassModelEmitPath,
  sourceFileFromEmitPath,
} from './class-model-emit-path'
import { normalizeRepoPath, resolveAliasedSymbol, declarationNameText } from './dts-ast-utils'
import { projectDtsSourceFileProjection } from './project-from-declarations'

/** Build Dts Class Model Bundle Progress Phase 的语义模型。 */
export type BuildDtsClassModelBundleProgressPhase =
  | 'create-program'
  | 'program-ready'
  | 'project-file'
  | 'write-runtime'
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
  compilerHost?: ts.CompilerHost
  exportedOnly?: boolean
  runtimeClassIndexBase?: Readonly<Record<string, DtsClassModelRuntimeClassEntry>>
  onProgress?: (event: BuildDtsClassModelBundleProgress) => void
  progressInterval?: number
}>

/** Build Dts Class Model Bundle Result 的返回结果。 */
export type BuildDtsClassModelBundleResult = Readonly<{
  manifest: DtsClassModelBundleManifest
  manifestPath: string
  runtimeManifest: DtsClassModelRuntimeManifest
  runtimeManifestPath: string
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

type RuntimeClassTarget = DtsClassModelRuntimeClassEntry & Readonly<{
  className: string
}>

type RuntimeMethodRefs = Readonly<{
  method: DtsClassModelRuntimeMethod
  paramsSchema: RuntimePooledSchema
  returnSchema?: RuntimePooledSchema
}>

type RuntimeConstructorRefs = Readonly<{
  constructor: DtsClassModelRuntimeConstructor
  paramsSchema: RuntimePooledSchema
}>

type RuntimeSharedSchemaPool = Readonly<{
  refByCanonicalSchema: Map<string, string>
  schemaByRef: Map<string, AiJsonSchema>
}>

type RuntimePooledSchema = Readonly<{
  schemaRef: string
  schema: AiJsonSchema
  schemaNode?: DtsClassModelRuntimeSchemaRef
}>

type BundleSchemaRefContext = Readonly<{
  currentSourcePath: string
  currentBundleFile: string
  projectedClassNamesBySourcePath: ReadonlyMap<string, ReadonlySet<string>>
  typeReferenceIndex: ReadonlyMap<string, ReadonlyMap<string, TypeReferenceTarget>>
}>

type RuntimeBundleContext = BundleSchemaRefContext & Readonly<{
  runtimeClassIndex: Readonly<Record<string, DtsClassModelRuntimeClassEntry>>
  runtimeClassTargetsBySourceAndName: ReadonlyMap<string, RuntimeClassTarget>
  runtimeClassTargetsBySchemaRef: ReadonlyMap<string, RuntimeClassTarget>
  sourcePathByBundleFile: ReadonlyMap<string, string>
  sharedSchemaPool: RuntimeSharedSchemaPool
}>

import { dtsSourcePathToBundleRelativeJson } from './dts-bundle-url'

const parsedTypeReferenceRootNameCache = new Map<string, string | undefined>()

export function buildDtsClassModelBundle(
  options: BuildDtsClassModelBundleOptions,
): BuildDtsClassModelBundleResult {
  const repoRoot = resolve(options.repoRoot)
  const outputDir = resolve(options.outputDir)
  const rootFiles = options.rootFiles.filter(absolutePath => {
    const sourcePath = normalizeRepoPath(absolutePath, repoRoot)
    return isClassModelEmitPath(sourcePath)
  })
  const total = rootFiles.length
  const progressInterval = options.progressInterval ?? 50
  reportProgress(options, { phase: 'create-program', total })
  const program = createBundleProjectionProgram(rootFiles, options.compilerHost)
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

  reportProgress(options, { phase: 'write-runtime', total })
  const runtimeBundle = writeRuntimeClassModelBundle({
    outputDir: resolve(outputDir, 'runtime'),
    projectedFiles,
    classIndex,
    ...(options.runtimeClassIndexBase === undefined ? {} : { runtimeClassIndexBase: options.runtimeClassIndexBase }),
    projectedClassNamesBySourcePath,
    typeReferenceIndex,
  })

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
    runtimeManifest: runtimeBundle.manifest,
    runtimeManifestPath: runtimeBundle.manifestPath,
    semanticLogPath,
    semanticLogJsonPath,
    semanticGapCount: semanticReport.gapCount,
    fileCount: Object.keys(files).length,
    modelCount,
  }
}

export { dtsSourcePathToBundleRelativeJson, resolveDtsBundleRelativeUrl } from './dts-bundle-url'

function createBundleProjectionProgram(rootFiles: readonly string[], compilerHost?: ts.CompilerHost): ts.Program {
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
    ...(compilerHost === undefined ? {} : { host: compilerHost }),
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
  if (!isClassModelEmitPath(targetSourcePath)) return undefined
  const targetName = declarationNameText(declaration) ?? symbol?.name
  if (targetName === undefined || targetName.length === 0 || targetName === '__type') return undefined
  return {
    targetName,
    targetSourcePath,
  }
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
      : { constructorMeta: compactConstructorMetaForBundle(model.constructorMeta, refContext) }),
    attributes: model.attributes.map(attribute => compactAttributeMetaForBundle(attribute, refContext)),
    methods: model.methods.map(method => compactMethodMetaForBundle(method, refContext)),
  }
}

function compactConstructorMetaForBundle(
  constructorMeta: ConstructorMeta,
  refContext: BundleSchemaRefContext,
): ConstructorMeta {
  const signatureText = constructorMeta.signatureText?.trim()
  if (signatureText === undefined || signatureText.length === 0) {
    throw new Error('DTS constructor is missing signatureText')
  }
  const paramsSchema = constructorMeta.paramsSchema === undefined
    ? undefined
    : referenceSchemaObjectForBundle(constructorMeta.paramsSchema, refContext)
  return {
    jsdoc: constructorMeta.jsdoc,
    signatureText,
    parameterStyle: constructorMeta.parameterStyle ?? 'positional',
    parameters: constructorMeta.parameters ?? [],
    ...(paramsSchema === undefined ? {} : { paramsSchema }),
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

function compactMethodMetaForBundle(method: MethodMeta, refContext: BundleSchemaRefContext): MethodMeta {
  const parameters = method.parameters ?? []
  const typeMeta = resolveMethodReturnType(method)
  if (typeMeta === undefined) {
    throw new Error(`DTS method is missing type: ${method.name}`)
  }
  const paramsSchema = method.paramsSchema === undefined
    ? undefined
    : referenceSchemaObjectForBundle(method.paramsSchema, refContext)
  const returnSchema = method.returnSchema === undefined
    ? undefined
    : referenceSchemaForBundle(method.returnSchema, refContext)
  const compact: MethodMeta = {
    name: method.name,
    jsdoc: method.jsdoc,
    parameterStyle: method.parameterStyle ?? 'positional',
    parameters,
    type: typeMeta,
    ...(paramsSchema === undefined ? {} : { paramsSchema }),
    ...(returnSchema === undefined ? {} : { returnSchema }),
    ...(method.takesContext === undefined ? {} : { takesContext: method.takesContext }),
  }
  if (canRenderMethodSignatureFromTypeTree(compact)) {
    return compact
  }
  const signatureText = method.signatureText?.trim()
  if (signatureText === undefined || signatureText.length === 0) {
    throw new Error(`DTS method is missing signatureText: ${method.name}`)
  }
  return { ...compact, signatureText }
}

function writeRuntimeClassModelBundle(command: {
  outputDir: string
  projectedFiles: readonly ProjectedBundleFile[]
  classIndex: DtsClassModelBundleManifest['classIndex']
  runtimeClassIndexBase?: Readonly<Record<string, DtsClassModelRuntimeClassEntry>>
  projectedClassNamesBySourcePath: ReadonlyMap<string, ReadonlySet<string>>
  typeReferenceIndex: ReadonlyMap<string, ReadonlyMap<string, TypeReferenceTarget>>
}): Readonly<{ manifest: DtsClassModelRuntimeManifest; manifestPath: string }> {
  const runtimeClassIndex: Record<string, DtsClassModelRuntimeClassEntry> = {
    ...(command.runtimeClassIndexBase ?? {}),
  }
  for (const [className, entry] of Object.entries(command.classIndex)) {
    runtimeClassIndex[className] = {
      sourcePath: entry.sourcePath,
      file: entry.file,
      modelRef: runtimeModelRef(className),
      schemaRef: runtimeClassSchemaRef(className),
    }
  }

  const runtimeClassTargetsBySourceAndName = new Map<string, RuntimeClassTarget>()
  const runtimeClassTargetsBySchemaRef = new Map<string, RuntimeClassTarget>()
  for (const [className, entry] of Object.entries(runtimeClassIndex)) {
    const target: RuntimeClassTarget = {
      className,
      sourcePath: entry.sourcePath,
      file: entry.file,
      modelRef: entry.modelRef,
      schemaRef: entry.schemaRef,
    }
    runtimeClassTargetsBySourceAndName.set(runtimeClassKey(entry.sourcePath, className), target)
    runtimeClassTargetsBySchemaRef.set(target.schemaRef, target)
  }
  for (const projectedFile of command.projectedFiles) {
    for (const className of Object.keys(projectedFile.projection.models)) {
      const target: RuntimeClassTarget = {
        className,
        sourcePath: projectedFile.sourcePath,
        file: projectedFile.bundleFile,
        modelRef: runtimeModelRef(className),
        schemaRef: runtimeClassSchemaRef(className),
      }
      runtimeClassTargetsBySourceAndName.set(runtimeClassKey(projectedFile.sourcePath, className), target)
      runtimeClassTargetsBySchemaRef.set(target.schemaRef, target)
    }
  }

  const sourcePathByBundleFile = new Map(
    [
      ...Object.values(runtimeClassIndex).map(entry => [entry.file, entry.sourcePath] as const),
      ...command.projectedFiles.map(file => [file.bundleFile, file.sourcePath] as const),
    ],
  )
  const files: Record<string, DtsClassModelRuntimeManifest['files'][string]> = {}
  const refIndex: Record<string, DtsClassModelRuntimeManifest['refIndex'][string]> = {}
  const sharedSchemaPool: RuntimeSharedSchemaPool = {
    refByCanonicalSchema: new Map(),
    schemaByRef: new Map(),
  }

  for (const projectedFile of command.projectedFiles) {
    files[projectedFile.sourcePath] = {
      file: projectedFile.bundleFile,
      symbols: projectedFile.projection.symbols,
    }

    const runtimeShard = createRuntimeShard(projectedFile, {
      currentSourcePath: projectedFile.sourcePath,
      currentBundleFile: projectedFile.bundleFile,
      projectedClassNamesBySourcePath: command.projectedClassNamesBySourcePath,
      typeReferenceIndex: command.typeReferenceIndex,
      runtimeClassIndex,
      runtimeClassTargetsBySourceAndName,
      runtimeClassTargetsBySchemaRef,
      sourcePathByBundleFile,
      sharedSchemaPool,
    })
    for (const ref of Object.keys(runtimeShard['@refs'])) {
      refIndex[ref] ??= { file: projectedFile.bundleFile }
    }
    const outputPath = resolve(command.outputDir, projectedFile.bundleFile)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${JSON.stringify(runtimeShard, null, 2)}\n`, 'utf8')
  }

  const manifest: DtsClassModelRuntimeManifest = {
    schemaVersion: DTS_CLASS_MODEL_RUNTIME_VERSION,
    protocol: DTS_CLASS_MODEL_RUNTIME_PROTOCOL,
    files,
    classIndex: runtimeClassIndex,
    refIndex,
  }
  const manifestPath = resolve(command.outputDir, 'manifest.json')
  mkdirSync(command.outputDir, { recursive: true })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return { manifest, manifestPath }
}

function createRuntimeShard(
  projectedFile: ProjectedBundleFile,
  context: RuntimeBundleContext,
): DtsClassModelRuntimeShard {
  const refs: Record<string, DtsClassModelRuntimeRef> = {}
  for (const model of Object.values(projectedFile.projection.models)) {
    Object.assign(refs, createRuntimeModel(model, context))
  }
  return {
    schemaVersion: DTS_CLASS_MODEL_RUNTIME_VERSION,
    protocol: DTS_CLASS_MODEL_RUNTIME_PROTOCOL,
    sourcePath: projectedFile.sourcePath,
    symbols: projectedFile.projection.symbols,
    '@refs': refs,
  }
}

function createRuntimeModel(
  model: ClassModel,
  context: RuntimeBundleContext,
): Record<string, DtsClassModelRuntimeRef> {
  const modelRef = runtimeModelRef(model.className)
  const schemaRef = runtimeClassSchemaRef(model.className)
  const refs: Record<string, DtsClassModelRuntimeRef> = {
    [schemaRef]: {
      ref: schemaRef,
      kind: 'schema',
      schema: runtimeClassSchemaForBundle(model, schemaRef, context),
    },
  }
  const attributeRefs: string[] = []
  const methodRefs: string[] = []
  const linkRefs: string[] = []
  const seenLinks = new Set<string>()
  let constructorRef: string | undefined

  model.attributes.forEach((attribute, index) => {
    const attributeRef = runtimeAttributeRef(model.className, attribute.name, index)
    const schema = referenceRequiredSchemaForRuntime(attribute.schema, context)
    const attributeSchema = poolRuntimeSchemaForBundle(schema, context)
    if (attributeSchema.schemaNode !== undefined) refs[attributeSchema.schemaRef] = attributeSchema.schemaNode
    refs[attributeRef] = {
      ref: attributeRef,
      kind: 'attribute',
      ownerRef: modelRef,
      name: attribute.name,
      schemaRef: attributeSchema.schemaRef,
      readable: attribute.readable,
      writable: attribute.writable,
    }
    attributeRefs.push(attributeRef)
    collectRuntimeLinksFromSchema({
      schema: attributeSchema.schema,
      fromRef: attributeRef,
      relation: 'attribute',
      context,
      refs,
      linkRefs,
      seenLinks,
    })
  })

  if (model.constructorMeta !== undefined) {
    const runtimeConstructor = createRuntimeConstructor(modelRef, model.className, model.constructorMeta, context)
    refs[runtimeConstructor.constructor.ref] = runtimeConstructor.constructor
    if (runtimeConstructor.paramsSchema.schemaNode !== undefined) {
      refs[runtimeConstructor.paramsSchema.schemaRef] = runtimeConstructor.paramsSchema.schemaNode
    }
    constructorRef = runtimeConstructor.constructor.ref
    for (const parameter of model.constructorMeta.parameters ?? []) {
      collectRuntimeLinksFromTypeMeta({
        typeMeta: parameter.type,
        fromRef: runtimeConstructor.constructor.ref,
        relation: 'constructor-parameter',
        context,
        refs,
        linkRefs,
        seenLinks,
      })
    }
    collectRuntimeLinksFromSchema({
      schema: runtimeConstructor.paramsSchema.schema,
      fromRef: runtimeConstructor.constructor.ref,
      relation: 'constructor-parameter',
      context,
      refs,
      linkRefs,
      seenLinks,
    })
  }

  model.methods.forEach((method, index) => {
    const runtimeMethod = createRuntimeMethod(modelRef, model.className, method, index, context)
    refs[runtimeMethod.method.ref] = runtimeMethod.method
    if (runtimeMethod.paramsSchema.schemaNode !== undefined) {
      refs[runtimeMethod.paramsSchema.schemaRef] = runtimeMethod.paramsSchema.schemaNode
    }
    if (runtimeMethod.returnSchema?.schemaNode !== undefined) {
      refs[runtimeMethod.returnSchema.schemaRef] = runtimeMethod.returnSchema.schemaNode
    }
    methodRefs.push(runtimeMethod.method.ref)
    for (const parameter of method.parameters ?? []) {
      collectRuntimeLinksFromTypeMeta({
        typeMeta: parameter.type,
        fromRef: runtimeMethod.method.ref,
        relation: 'method-parameter',
        context,
        refs,
        linkRefs,
        seenLinks,
      })
    }
    collectRuntimeLinksFromTypeMeta({
      typeMeta: resolveMethodReturnType(method),
      fromRef: runtimeMethod.method.ref,
      relation: 'method-return',
      context,
      refs,
      linkRefs,
      seenLinks,
    })
    collectRuntimeLinksFromSchema({
      schema: runtimeMethod.paramsSchema.schema,
      fromRef: runtimeMethod.method.ref,
      relation: 'method-parameter',
      context,
      refs,
      linkRefs,
      seenLinks,
    })
    collectRuntimeLinksFromSchema({
      schema: runtimeMethod.returnSchema?.schema,
      fromRef: runtimeMethod.method.ref,
      relation: 'method-return',
      context,
      refs,
      linkRefs,
      seenLinks,
    })
  })

  refs[modelRef] = {
    ref: modelRef,
    kind: 'model',
    className: model.className,
    schemaRef,
    ...(constructorRef === undefined ? {} : { constructorRef }),
    attributeRefs,
    methodRefs,
    linkRefs,
  }
  return refs
}

function createRuntimeConstructor(
  ownerRef: string,
  className: string,
  constructorMeta: ConstructorMeta,
  context: RuntimeBundleContext,
): RuntimeConstructorRefs {
  const constructorRef = runtimeConstructorRef(className)
  const paramsSchema = poolRuntimeSchemaForBundle(runtimeParamsSchemaForConstructor(constructorMeta, context), context)
  return {
    constructor: {
      ref: constructorRef,
      kind: 'constructor',
      ownerRef,
      parameterStyle: constructorMeta.parameterStyle ?? 'positional',
      paramsSchemaRef: paramsSchema.schemaRef,
    },
    paramsSchema,
  }
}

function createRuntimeMethod(
  ownerRef: string,
  className: string,
  method: MethodMeta,
  methodIndex: number,
  context: RuntimeBundleContext,
): RuntimeMethodRefs {
  const methodRef = runtimeMethodRef(className, method.name, methodIndex)
  const paramsSchema = poolRuntimeSchemaForBundle(runtimeParamsSchemaForMethod(method, context), context)
  const returnSchema = runtimeReturnSchemaForMethod(method, context)
  const pooledReturnSchema = returnSchema === undefined
    ? undefined
    : poolRuntimeSchemaForBundle(returnSchema, context)
  return {
    method: {
      ref: methodRef,
      kind: 'method',
      ownerRef,
      name: method.name,
      parameterStyle: method.parameterStyle ?? 'positional',
      paramsSchemaRef: paramsSchema.schemaRef,
      ...(pooledReturnSchema === undefined ? {} : { returnSchemaRef: pooledReturnSchema.schemaRef }),
    },
    paramsSchema,
    ...(pooledReturnSchema === undefined ? {} : { returnSchema: pooledReturnSchema }),
  }
}

function poolRuntimeSchemaForBundle(
  schema: AiJsonSchema,
  context: RuntimeBundleContext,
): RuntimePooledSchema {
  const canonicalJson = canonicalRuntimeSchemaJson(schema)
  const existingRef = context.sharedSchemaPool.refByCanonicalSchema.get(canonicalJson)
  if (existingRef !== undefined) {
    const existingSchema = context.sharedSchemaPool.schemaByRef.get(existingRef)
    if (existingSchema === undefined) {
      throw new Error(`DTS class-model runtime schema pool lost schema for ref "${existingRef}".`)
    }
    return {
      schemaRef: existingRef,
      schema: existingSchema,
    }
  }

  const schemaRef = runtimeSharedSchemaRef(canonicalJson)
  const runtimeSchema = schemaForRuntimeRef(schema, schemaRef)
  context.sharedSchemaPool.refByCanonicalSchema.set(canonicalJson, schemaRef)
  context.sharedSchemaPool.schemaByRef.set(schemaRef, runtimeSchema)
  return {
    schemaRef,
    schema: runtimeSchema,
    schemaNode: {
      ref: schemaRef,
      kind: 'schema',
      schema: runtimeSchema,
    },
  }
}

function schemaForRuntimeRef(schema: AiJsonSchema, schemaRef: string): AiJsonSchema {
  return isJsonSchemaObject(schema) ? withRuntimeSchemaId(schema, schemaRef) : schema
}

function runtimeClassSchemaForBundle(
  model: ClassModel,
  schemaRef: string,
  context: RuntimeBundleContext,
): AiJsonSchemaObject {
  const properties: Record<string, AiJsonSchema> = {}
  for (const attribute of model.attributes) {
    if (!attribute.readable) continue
    properties[attribute.name] = referenceRequiredSchemaForRuntime(attribute.schema, context)
  }
  return withRuntimeSchemaId({
    type: 'object',
    title: model.className,
    ...(Object.keys(properties).length === 0 ? {} : { properties }),
  }, schemaRef)
}

function runtimeParamsSchemaForConstructor(
  constructorMeta: ConstructorMeta,
  context: RuntimeBundleContext,
): AiJsonSchemaObject {
  const schema = constructorMeta.paramsSchema ?? {
    type: 'object',
    properties: {},
    additionalProperties: false,
  }
  const referenced = referenceSchemaObjectForRuntime(schema, context)
  return {
    ...referenced,
    type: referenced.type ?? 'object',
    properties: referenced.properties ?? {},
    additionalProperties: referenced.additionalProperties ?? false,
  }
}

function runtimeParamsSchemaForMethod(
  method: MethodMeta,
  context: RuntimeBundleContext,
): AiJsonSchemaObject {
  const schema = method.paramsSchema ?? {
    type: 'object',
    properties: {},
    additionalProperties: false,
  }
  const referenced = referenceSchemaObjectForRuntime(schema, context)
  return {
    ...referenced,
    type: referenced.type ?? 'object',
    properties: referenced.properties ?? {},
    additionalProperties: referenced.additionalProperties ?? false,
  }
}

function runtimeReturnSchemaForMethod(
  method: MethodMeta,
  context: RuntimeBundleContext,
): AiJsonSchema | undefined {
  const returnType = resolveMethodReturnType(method)
  if (isVoidLikeDtsType(returnType)) return undefined
  const schema = method.returnSchema ?? dtsTypeMetaToRuntimeSchema(returnType, context)
  return referenceSchemaForRuntime(schema, context)
}

function dtsTypeMetaToRuntimeSchema(
  typeMeta: MethodMeta['type'],
  context: RuntimeBundleContext,
): AiJsonSchema | undefined {
  if (typeMeta === undefined) return undefined
  switch (typeMeta.type) {
    case 'intrinsic':
      if (typeMeta.name === 'string') return { type: 'string' }
      if (typeMeta.name === 'number') return { type: 'number' }
      if (typeMeta.name === 'boolean') return { type: 'boolean' }
      if (typeMeta.name === 'null') return { type: 'null' }
      if (typeMeta.name === 'never') return false
      if (typeMeta.name === 'void' || typeMeta.name === 'undefined') return undefined
      return true
    case 'literal':
      if (typeMeta.value === null) return { type: 'null' }
      return { enum: [typeMeta.value] }
    case 'reference': {
      if (typeMeta.refersToTypeParameter === true) return true
      const typeArgument = typeMeta.typeArguments?.[0]
      if ((typeMeta.name === 'Array' || typeMeta.name === 'ReadonlyArray') && typeArgument !== undefined) {
        return {
          type: 'array',
          items: dtsTypeMetaToRuntimeSchema(typeArgument, context) ?? true,
        }
      }
      const target = resolveRuntimeTypeReferenceTarget(typeMeta.name, typeMeta.sourcePath, context)
      return target === undefined ? true : { $ref: target.schemaRef }
    }
    case 'array':
      return {
        type: 'array',
        items: dtsTypeMetaToRuntimeSchema(typeMeta.elementType, context) ?? true,
      }
    case 'optional':
    case 'rest':
      return dtsTypeMetaToRuntimeSchema(typeMeta.elementType, context)
    case 'union': {
      const schemas = typeMeta.types
        .map(item => dtsTypeMetaToRuntimeSchema(item, context))
        .filter((schema): schema is AiJsonSchema => schema !== undefined)
      if (schemas.length === 0) return undefined
      if (schemas.length === 1) return schemas[0] ?? true
      return { anyOf: schemas }
    }
    case 'intersection': {
      const schemas = typeMeta.types
        .map(item => dtsTypeMetaToRuntimeSchema(item, context))
        .filter((schema): schema is AiJsonSchema => schema !== undefined)
      if (schemas.length === 0) return undefined
      if (schemas.length === 1) return schemas[0] ?? true
      return { allOf: schemas }
    }
    case 'tuple':
      return {
        type: 'array',
        prefixItems: typeMeta.elements.map(item => dtsTypeMetaToRuntimeSchema(item, context) ?? true),
      }
    case 'reflection':
      return { type: 'object' }
    case 'unknown':
      return true
  }
}

function referenceRequiredSchemaForRuntime(
  schema: AiJsonSchema,
  context: RuntimeBundleContext,
): AiJsonSchema {
  return referenceSchemaForRuntime(schema, context) ?? true
}

function referenceSchemaObjectForRuntime(
  schema: AiJsonSchemaObject,
  context: RuntimeBundleContext,
): AiJsonSchemaObject {
  const referenced = referenceSchemaForRuntime(schema, context)
  return isJsonSchemaObject(referenced) ? referenced : {}
}

function referenceSchemaForRuntime(
  schema: AiJsonSchema | undefined,
  context: RuntimeBundleContext,
): AiJsonSchema | undefined {
  if (schema === undefined || schema === true || schema === false || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema
  }

  const directTarget = runtimeTargetForPlaceholderSchema(schema, context)
  if (directTarget !== undefined) {
    const title = typeof schema.title === 'string' && schema.title !== directTarget.className
      ? schema.title
      : undefined
    return {
      $ref: directTarget.schemaRef,
      ...(title === undefined ? {} : { title }),
    }
  }

  const schemaRefTarget = typeof schema.$ref === 'string'
    ? runtimeTargetForSchemaRef(schema.$ref, context)
    : undefined
  const next: Record<string, unknown> = {
    ...schema,
    ...(schemaRefTarget === undefined ? {} : { $ref: schemaRefTarget.schemaRef }),
  }
  if (schema.items !== undefined) next['items'] = referenceSchemaForRuntime(schema.items, context)
  if (schema.prefixItems !== undefined) {
    next['prefixItems'] = schema.prefixItems.map(child => referenceSchemaForRuntime(child, context) ?? true)
  }
  if (schema.properties !== undefined) {
    const properties: Record<string, AiJsonSchema> = {}
    for (const [name, child] of Object.entries(schema.properties)) {
      const referenced = referenceSchemaForRuntime(child, context)
      if (referenced !== undefined) properties[name] = referenced
    }
    next['properties'] = properties
  }
  if (schema.anyOf !== undefined) {
    next['anyOf'] = schema.anyOf.map(child => referenceSchemaForRuntime(child, context) ?? true)
  }
  if (schema.oneOf !== undefined) {
    next['oneOf'] = schema.oneOf.map(child => referenceSchemaForRuntime(child, context) ?? true)
  }
  if (schema.allOf !== undefined) {
    next['allOf'] = schema.allOf.map(child => referenceSchemaForRuntime(child, context) ?? true)
  }
  if (schema.not !== undefined) next['not'] = referenceSchemaForRuntime(schema.not, context)
  return next
}

function collectRuntimeLinksFromSchema(command: {
  schema: AiJsonSchema | undefined
  fromRef: string
  relation: DtsClassModelRuntimeLink['relation']
  context: RuntimeBundleContext
  refs: Record<string, DtsClassModelRuntimeRef>
  linkRefs: string[]
  seenLinks: Set<string>
}): void {
  const { schema, fromRef, relation, context, refs, linkRefs, seenLinks } = command
  if (schema === undefined || schema === true || schema === false || typeof schema !== 'object' || Array.isArray(schema)) return
  if (typeof schema.$ref === 'string') {
    const target = runtimeTargetForSchemaRef(schema.$ref, context)
    if (target !== undefined) addRuntimeLink({ fromRef, relation, target, refs, linkRefs, seenLinks })
  }
  if (schema.items !== undefined) {
    collectRuntimeLinksFromSchema({ schema: schema.items, fromRef, relation, context, refs, linkRefs, seenLinks })
  }
  for (const child of schema.prefixItems ?? []) {
    collectRuntimeLinksFromSchema({ schema: child, fromRef, relation, context, refs, linkRefs, seenLinks })
  }
  for (const child of Object.values(schema.properties ?? {})) {
    collectRuntimeLinksFromSchema({
      schema: child,
      fromRef,
      relation,
      context,
      refs,
      linkRefs,
      seenLinks,
    })
  }
  for (const child of schema.anyOf ?? []) collectRuntimeLinksFromSchema({ schema: child, fromRef, relation, context, refs, linkRefs, seenLinks })
  for (const child of schema.oneOf ?? []) collectRuntimeLinksFromSchema({ schema: child, fromRef, relation, context, refs, linkRefs, seenLinks })
  for (const child of schema.allOf ?? []) collectRuntimeLinksFromSchema({ schema: child, fromRef, relation, context, refs, linkRefs, seenLinks })
  if (schema.not !== undefined) collectRuntimeLinksFromSchema({ schema: schema.not, fromRef, relation, context, refs, linkRefs, seenLinks })
}

function collectRuntimeLinksFromTypeMeta(command: {
  typeMeta: MethodMeta['type']
  fromRef: string
  relation: DtsClassModelRuntimeLink['relation']
  context: RuntimeBundleContext
  refs: Record<string, DtsClassModelRuntimeRef>
  linkRefs: string[]
  seenLinks: Set<string>
}): void {
  const { typeMeta, fromRef, relation, context, refs, linkRefs, seenLinks } = command
  visitDtsTypeMeta(typeMeta, (node) => {
    if (node.type !== 'reference' || node.refersToTypeParameter === true) return
    const target = resolveRuntimeTypeReferenceTarget(node.name, node.sourcePath, context)
    if (target !== undefined) addRuntimeLink({ fromRef, relation, target, refs, linkRefs, seenLinks })
  })
}

function addRuntimeLink(command: {
  fromRef: string
  relation: DtsClassModelRuntimeLink['relation']
  target: RuntimeClassTarget
  refs: Record<string, DtsClassModelRuntimeRef>
  linkRefs: string[]
  seenLinks: Set<string>
}): void {
  const { fromRef, relation, target, refs, linkRefs, seenLinks } = command
  const linkRef = runtimeLinkRef(fromRef, relation, target.modelRef)
  if (seenLinks.has(linkRef)) return
  seenLinks.add(linkRef)
  refs[linkRef] = {
    ref: linkRef,
    kind: 'link',
    fromRef,
    relation,
    targetModelRef: target.modelRef,
    targetClassName: target.className,
    targetFile: target.file,
    targetSchemaRef: target.schemaRef,
  }
  linkRefs.push(linkRef)
}

function runtimeTargetForPlaceholderSchema(
  schema: AiJsonSchemaObject,
  context: RuntimeBundleContext,
): RuntimeClassTarget | undefined {
  if (!isTypeReferencePlaceholderSchema(schema)) return undefined
  const title = schema.title
  if (typeof title !== 'string') return undefined
  const dtsTarget = dtsTypeReferenceTargetForBundle(title, context)
  if (dtsTarget === undefined) return runtimeTargetForTypeExpressionTitle(title, context)
  return resolveRuntimeTypeReferenceTarget(dtsTarget.targetName, dtsTarget.targetSourcePath, context)
}

function runtimeTargetForTypeExpressionTitle(
  title: string,
  context: RuntimeBundleContext,
): RuntimeClassTarget | undefined {
  const className = parseTypeReferenceRootName(title)
  if (className === undefined) return undefined
  return resolveRuntimeTypeReferenceTarget(className, undefined, context)
}

function parseTypeReferenceRootName(typeText: string): string | undefined {
  if (parsedTypeReferenceRootNameCache.has(typeText)) {
    return parsedTypeReferenceRootNameCache.get(typeText)
  }
  const sourceFile = ts.createSourceFile(
    'runtime-type-ref.ts',
    `type __RuntimeTypeRef = ${typeText}`,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  )
  const statement = sourceFile.statements[0]
  const className = statement === undefined || !ts.isTypeAliasDeclaration(statement)
    ? undefined
    : typeReferenceRootNameFromTypeNode(statement.type)
  parsedTypeReferenceRootNameCache.set(typeText, className)
  return className
}

function typeReferenceRootNameFromTypeNode(node: ts.TypeNode): string | undefined {
  if (ts.isParenthesizedTypeNode(node)) return typeReferenceRootNameFromTypeNode(node.type)
  if (ts.isArrayTypeNode(node)) return typeReferenceRootNameFromTypeNode(node.elementType)
  if (!ts.isTypeReferenceNode(node)) return undefined
  return entityNameRightText(node.typeName)
}

function entityNameRightText(name: ts.EntityName): string {
  return ts.isIdentifier(name) ? name.text : name.right.text
}

function runtimeTargetForSchemaRef(
  ref: string,
  context: RuntimeBundleContext,
): RuntimeClassTarget | undefined {
  const directTarget = context.runtimeClassTargetsBySchemaRef.get(ref)
  if (directTarget !== undefined) return directTarget

  const parsedRef = parseBundleSchemaRef(ref, context)
  if (parsedRef === undefined) return undefined
  return context.runtimeClassTargetsBySourceAndName.get(runtimeClassKey(parsedRef.sourcePath, parsedRef.className))
}

function parseBundleSchemaRef(
  ref: string,
  context: RuntimeBundleContext,
): Readonly<{ sourcePath: string; className: string }> | undefined {
  const [filePart = '', fragment = ''] = ref.split('#', 2)
  const prefix = '/$defs/'
  if (!fragment.startsWith(prefix)) return undefined
  const className = decodeJsonPointerToken(fragment.slice(prefix.length))
  const targetBundleFile = filePart.length === 0
    ? context.currentBundleFile
    : posix.normalize(posix.join(posix.dirname(context.currentBundleFile), filePart))
  const sourcePath = context.sourcePathByBundleFile.get(targetBundleFile)
  if (sourcePath === undefined) return undefined
  return { sourcePath, className }
}

function resolveRuntimeTypeReferenceTarget(
  className: string,
  sourcePath: string | undefined,
  context: RuntimeBundleContext,
): RuntimeClassTarget | undefined {
  if (sourcePath !== undefined) {
    const sourceScoped = context.runtimeClassTargetsBySourceAndName.get(runtimeClassKey(sourcePath, className))
    if (sourceScoped !== undefined) return sourceScoped
  }
  const manifestEntry = context.runtimeClassIndex[className]
  if (manifestEntry === undefined) return undefined
  return {
    className,
    sourcePath: manifestEntry.sourcePath,
    file: manifestEntry.file,
    modelRef: manifestEntry.modelRef,
    schemaRef: manifestEntry.schemaRef,
  }
}

function withRuntimeSchemaId(schema: AiJsonSchemaObject, schemaRef: string): AiJsonSchemaObject {
  return {
    ...schema,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: schemaRef,
  }
}

function canonicalRuntimeSchemaJson(schema: AiJsonSchema): string {
  return JSON.stringify(canonicalRuntimeSchemaValue(schema))
}

function canonicalRuntimeSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => canonicalRuntimeSchemaValue(item))
  if (value === null || typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) {
    if (key === '$id' || key === '$schema') continue
    const child = record[key]
    if (child !== undefined) next[key] = canonicalRuntimeSchemaValue(child)
  }
  return next
}

function runtimeModelRef(className: string): string {
  return `spark-class-model://model/${encodeURIComponent(className)}`
}

function runtimeClassSchemaRef(className: string): string {
  return `spark-class-model://schema/${encodeURIComponent(className)}`
}

function runtimeSharedSchemaRef(canonicalSchemaJson: string): string {
  const digest = createHash('sha256').update(canonicalSchemaJson).digest('hex')
  return `spark-class-model://schema/shared/${digest}`
}

function runtimeAttributeRef(className: string, attributeName: string, attributeIndex: number): string {
  return `${runtimeModelRef(className)}/attributes/${encodeURIComponent(attributeName)}/${String(attributeIndex)}`
}

function runtimeConstructorRef(className: string): string {
  return `${runtimeModelRef(className)}/constructors/0`
}

function runtimeMethodRef(className: string, methodName: string, methodIndex: number): string {
  return `${runtimeModelRef(className)}/methods/${encodeURIComponent(methodName)}/${String(methodIndex)}`
}

function runtimeLinkRef(
  fromRef: string,
  relation: DtsClassModelRuntimeLink['relation'],
  targetModelRef: string,
): string {
  return `spark-class-model://link/${encodeURIComponent(fromRef)}/${relation}/${encodeURIComponent(targetModelRef)}`
}

function runtimeClassKey(sourcePath: string, className: string): string {
  return `${sourcePath}\0${className}`
}

function isVoidLikeDtsType(typeMeta: MethodMeta['type']): boolean {
  return typeMeta?.type === 'intrinsic'
    && (typeMeta.name === 'void' || typeMeta.name === 'undefined')
}

function isJsonSchemaObject(schema: AiJsonSchema | undefined): schema is AiJsonSchemaObject {
  return schema !== undefined && schema !== true && schema !== false && typeof schema === 'object' && !Array.isArray(schema)
}

function decodeJsonPointerToken(value: string): string {
  return value.replaceAll('~1', '/').replaceAll('~0', '~')
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

function referenceSchemaObjectForBundle(
  schema: AiJsonSchemaObject,
  refContext: BundleSchemaRefContext,
): AiJsonSchemaObject {
  const referenced = referenceSchemaForBundle(schema, refContext)
  return isJsonSchemaObject(referenced) ? referenced : {}
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
    fixHint: `在 ${module.sourceFile} 文件顶部补高质量模块级 JSDoc：说明职责、边界和 AI 选择该模块的用途，然后重新运行 generate:class-model-surface。`,
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
  const sourceFile = sourceFileFromEmitPath(declarationFile)
  return {
    kind,
    className: model.className,
    ...(memberName === undefined ? {} : { memberName }),
    reason: 'missing-jsdoc',
    chainBreak: describeSemanticGapChainBreak(kind, model, memberName),
    fixHint: `在 ${sourceFile} 的对应声明前补 JSDoc，然后重新运行 generate:class-model-surface。`,
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
