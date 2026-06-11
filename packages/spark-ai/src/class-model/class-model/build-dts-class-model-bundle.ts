/**
 * @module @spark-appworks/spark-ai:class-model/class-model/build-dts-class-model-bundle
 * @spark-appworks/spark-ai 的 class-model/class-model/build-dts-class-model-bundle 模块。
 * 导出 ClassModel symbol: BuildDtsClassModelBundleProgressPhase, BuildDtsClassModelBundleProgress, BuildDtsClassModelBundleOptions, BuildDtsClassModelBundleResult（共 4 个 symbol）。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

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
import type { ClassModel, SourceProvenanceMeta } from './types'
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
  let modelCount = 0

  for (const [index, absolutePath] of rootFiles.entries()) {
    const sourcePath = normalizeRepoPath(absolutePath, repoRoot)
    const sourceFile = resolveProgramSourceFile(program, absolutePath)

    const projection = projectDtsSourceFileProjection({
      repoRoot,
      absolutePath,
      sourceFile,
      checker,
      exportedOnly: options.exportedOnly ?? false,
    })
    const bundleFile = dtsSourcePathToBundleRelativeJson(sourcePath)
    const outputPath = resolve(outputDir, bundleFile)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${JSON.stringify(projection, null, 2)}\n`, 'utf8')

    files[sourcePath] = {
      file: bundleFile.replace(/\\/g, '/'),
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
        file: bundleFile.replace(/\\/g, '/'),
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

function collectSemanticGaps(projection: DtsFileProjectionDocument): readonly DtsClassModelSemanticGap[] {
  const gaps: DtsClassModelSemanticGap[] = []
  if (isMissingJsDoc(projection.module.jsdoc) || projection.module.jsdocSource === 'inferred') {
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
    reason: module.jsdocSource === 'inferred' ? 'inferred-module-jsdoc' : 'missing-jsdoc',
    chainBreak: `${module.name} 的模块级语义链断开：文件入口没有 JSDoc；当前只能使用路径、组件目录和导出 symbol 推导。`,
    fixHint: `在 ${module.sourceFile} 文件顶部补模块级 JSDoc，然后重新生成 declarations 和 dts-class-model。`,
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
