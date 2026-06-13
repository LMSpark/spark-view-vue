#!/usr/bin/env node
// 一气呵成生成 DTS ClassModel 产物：
// 1. TypeScript + Volar 在内存中生成 .d.ts
// 2. 每个 .d.ts 生成一个同路径 .d.ts.json
// 3. 写入 generated/dts-class-model/manifest.json
// 4. 写入 generated/dts-class-model/runtime/manifest.json
// 5. 写入缺 JSDoc 语义补充日志 semantic-gaps.log / semantic-gaps.json

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

import { buildDtsClassModelBundle } from '../packages/spark-ai/src/class-model/class-model/build-dts-class-model-bundle.ts'

const require = createRequire(import.meta.url)
const vueTscRequire = createRequire(require.resolve('vue-tsc'))

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const declarationsDir = resolve(repoRoot, 'declarations')
const outputDir = resolve(repoRoot, 'generated/dts-class-model')
const dtsManifestPath = resolve(outputDir, '.dts-manifest.json')
const fromDiskDeclarations = process.argv.includes('--skip-declarations') || process.argv.includes('--from-disk')
const deleteDeclarations = process.argv.includes('--delete-declarations')
const checkDiagnostics = process.argv.includes('--check-diagnostics')
const emitBackend = readEmitBackend()
const timings = createTimings()

let dtsFiles
let declarationCompilerHost

if (fromDiskDeclarations) {
  console.log('Using existing declarations from disk.')
  dtsFiles = collectDeclarationFiles(declarationsDir)
} else {
  console.log(`Emitting declarations in memory (${emitBackend})...`)
  const declarationEmit = emitDeclarationsToMemory({
    repoRoot,
    configPath: resolve(repoRoot, 'tsconfig.declarations.json'),
    checkDiagnostics,
    backend: emitBackend,
    onEvent: event => {
      const line = renderDeclarationEmitEvent(event)
      if (line.length > 0) console.log(line)
    },
  })
  dtsFiles = [...declarationEmit.files.keys()].sort((left, right) => left.localeCompare(right))
  declarationCompilerHost = createInMemoryDeclarationCompilerHost(declarationEmit.files)
}

if (dtsFiles.length === 0) {
  throw new Error(fromDiskDeclarations
    ? 'No .d.ts files found under declarations/.'
    : 'No in-memory .d.ts outputs were emitted.')
}
console.log(`Collected DTS files: ${String(dtsFiles.length)}`)

timings.mark('collect-dts')
removeTreeSync(outputDir)
mkdirSync(outputDir, { recursive: true })
writeFileSync(dtsManifestPath, `${JSON.stringify(dtsFiles, null, 2)}\n`, 'utf8')
timings.mark('prepare-output')

console.log('Building DTS ClassModel bundle...')
const result = buildDtsClassModelBundle({
  repoRoot,
  rootFiles: dtsFiles,
  outputDir,
  ...(declarationCompilerHost === undefined ? {} : { compilerHost: declarationCompilerHost }),
  exportedOnly: false,
  progressInterval: 50,
  onProgress: event => {
    const line = renderProgress(event)
    if (line.length > 0) console.log(line)
  },
})

if (result.fileCount !== dtsFiles.length) {
  throw new Error(`DTS JSON count mismatch: dts=${String(dtsFiles.length)} json=${String(result.fileCount)}`)
}
timings.mark('build-bundle')

console.log(`DTS files: ${String(dtsFiles.length)}`)
console.log(`Wrote ${relative(repoRoot, result.manifestPath)}`)
console.log(`Wrote runtime ${relative(repoRoot, result.runtimeManifestPath)}`)
console.log(`Per-file JSON: ${String(result.fileCount)}`)
console.log(`ClassModel symbols (incl. duplicates in files): ${String(result.modelCount)}`)
console.log(`classIndex entries: ${String(Object.keys(result.manifest.classIndex).length)}`)
console.log(`Semantic gaps: ${String(result.semanticGapCount)}`)
console.log(`Semantic gap log: ${relative(repoRoot, result.semanticLogPath)}`)
console.log(`Semantic gap JSON: ${relative(repoRoot, result.semanticLogJsonPath)}`)
if (result.manifest.duplicates !== undefined && result.manifest.duplicates.length > 0) {
  console.log(`Duplicate className skipped in classIndex: ${String(result.manifest.duplicates.length)}`)
}

if (deleteDeclarations) {
  removeDeclarationsDir()
  console.log(`Deleted ${relative(repoRoot, declarationsDir)}`)
}
timings.mark('cleanup')
console.log(renderTimings(timings))

function renderProgress(event) {
  if (event.phase === 'create-program') {
    return `Creating TypeScript Program for ${String(event.total ?? 0)} DTS file(s)...`
  }
  if (event.phase === 'program-ready') {
    return 'TypeScript Program ready.'
  }
  if (event.phase === 'project-file') {
    return `Projected DTS file ${String(event.current ?? 0)}/${String(event.total ?? 0)}: ${event.sourcePath ?? ''}`
  }
  if (event.phase === 'write-runtime') {
    return 'Writing runtime bundle...'
  }
  if (event.phase === 'write-semantic-gaps') {
    return 'Writing semantic gap logs...'
  }
  if (event.phase === 'write-manifest') {
    return 'Writing bundle manifest...'
  }
  if (event.phase === 'done') {
    return 'DTS ClassModel bundle complete.'
  }
  return ''
}

function renderDeclarationEmitEvent(event) {
  if (event.phase === 'timing') {
    return `  ${event.label}: ${formatSeconds(event.stepMs)}s (emit total ${formatSeconds(event.totalMs)}s)`
  }
  if (event.phase === 'vue-tsc-start') {
    return `Running vue-tsc with in-memory declaration write interception: ${relative(repoRoot, event.configPath)}`
  }
  if (event.phase === 'parse-config') {
    return `Parsing declaration tsconfig: ${relative(repoRoot, event.configPath)}`
  }
  if (event.phase === 'create-program') {
    return `Creating Vue-aware TypeScript Program: ${String(event.rootFileCount)} root file(s), ${String(event.vueFileCount)} Vue file(s).`
  }
  if (event.phase === 'program-ready') {
    return 'Vue-aware TypeScript Program ready.'
  }
  if (event.phase === 'diagnostics-start') {
    return 'Checking pre-emit diagnostics...'
  }
  if (event.phase === 'diagnostics-skipped') {
    return 'Skipping pre-emit diagnostics; emit diagnostics are still enforced.'
  }
  if (event.phase === 'diagnostics-done') {
    return `Pre-emit diagnostics passed: ${String(event.total)} diagnostic(s).`
  }
  if (event.phase === 'emit-start') {
    return 'Subscribing to declaration emit via writeFile callback...'
  }
  if (event.phase === 'emit-file' && shouldReportFileProgress(event.current, event.total, 50)) {
    return `Captured declaration ${String(event.current)}/${String(event.total)}: ${event.sourcePath}`
  }
  if (event.phase === 'emit-done') {
    return `Declaration emit complete: ${String(event.total)} in-memory DTS file(s).`
  }
  return ''
}

function shouldReportFileProgress(current, total, interval) {
  if (total === 0) return false
  if (current === total) return true
  if (interval <= 0) return false
  return current % interval === 0
}

function emitDeclarationsToMemory(options) {
  if (options.backend === 'vue-tsc') {
    return emitDeclarationsWithVueTscToMemory(options)
  }
  return emitDeclarationsWithCompilerApiToMemory(options)
}

function emitDeclarationsWithVueTscToMemory(options) {
  const timings = createTimings()
  const configPath = resolve(options.configPath)
  const files = new Map()
  const nodeFs = require('node:fs')
  const fakeFdToPath = new Map()
  const fakeFdBuffers = new Map()
  let nextFakeFd = -1000
  const original = {
    argv: process.argv,
    exit: process.exit,
    openSync: nodeFs.openSync,
    writeSync: nodeFs.writeSync,
    closeSync: nodeFs.closeSync,
  }
  let exitCode = 0

  options.onEvent?.({ phase: 'vue-tsc-start', configPath })
  process.argv = [process.argv[0] ?? 'node', 'vue-tsc', '-p', configPath]
  process.exit = code => {
    exitCode = Number(code ?? 0)
    throw new Error(`process.exit(${String(exitCode)})`)
  }
  nodeFs.openSync = function openSyncPatched(fileName, flags) {
    if (isDeclarationOutput(fileName) && String(flags).includes('w')) {
      const fd = nextFakeFd--
      fakeFdToPath.set(fd, resolve(String(fileName)))
      fakeFdBuffers.set(fd, '')
      return fd
    }
    return Reflect.apply(original.openSync, this, arguments)
  }
  nodeFs.writeSync = function writeSyncPatched(fd, data, positionOrOffset, encodingOrLength) {
    if (fakeFdToPath.has(fd)) {
      const text = typeof data === 'string'
        ? data
        : Buffer.from(data).toString(typeof encodingOrLength === 'string' ? encodingOrLength : 'utf8')
      fakeFdBuffers.set(fd, `${fakeFdBuffers.get(fd) ?? ''}${text}`)
      return typeof data === 'string' ? data.length : data.byteLength
    }
    return Reflect.apply(original.writeSync, this, arguments)
  }
  nodeFs.closeSync = function closeSyncPatched(fd) {
    if (fakeFdToPath.has(fd)) {
      files.set(fakeFdToPath.get(fd), fakeFdBuffers.get(fd) ?? '')
      fakeFdToPath.delete(fd)
      fakeFdBuffers.delete(fd)
      return undefined
    }
    return Reflect.apply(original.closeSync, this, arguments)
  }

  try {
    require('vue-tsc').run()
  } catch (error) {
    if (!String(error?.message ?? '').startsWith('process.exit(')) throw error
  } finally {
    process.argv = original.argv
    process.exit = original.exit
    nodeFs.openSync = original.openSync
    nodeFs.writeSync = original.writeSync
    nodeFs.closeSync = original.closeSync
  }

  reportTiming(options, timings, 'vue-tsc-emit')
  if (exitCode !== 0) {
    throw new Error(`vue-tsc declaration emit failed with exit code ${String(exitCode)}`)
  }
  options.onEvent?.({ phase: 'emit-done', total: files.size, emitSkipped: false })
  return { files, emitSkipped: false }
}

function emitDeclarationsWithCompilerApiToMemory(options) {
  const timings = createTimings()
  const configPath = resolve(options.configPath)
  options.onEvent?.({ phase: 'parse-config', configPath })

  const vueCore = require('@vue/language-core')
  const { proxyCreateProgram } = vueTscRequire('@volar/typescript/lib/node/proxyCreateProgram')
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error !== undefined) {
    throw new Error(formatDiagnostics([configFile.error]))
  }

  const vueParsed = vueCore.createParsedCommandLine(ts, ts.sys, toPosixPath(configPath))
  const extraFileExtensions = vueCore.getAllExtensions(vueParsed.vueOptions).map(extension => ({
    extension,
    isMixedContent: true,
    scriptKind: ts.ScriptKind.Deferred,
  }))
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    options.repoRoot,
    undefined,
    configPath,
    undefined,
    extraFileExtensions,
  )
  if (parsed.errors.length > 0) {
    throw new Error(formatDiagnostics(parsed.errors))
  }
  reportTiming(options, timings, 'parse-config')

  const compilerOptions = {
    ...parsed.options,
    // vue-tsc patches TypeScript's supported extensions. Direct Compiler API mode
    // instead lets root .vue files enter the Program, then Volar supplies virtual TS.
    allowNonTsExtensions: true,
  }
  const host = ts.createCompilerHost(compilerOptions, true)
  const files = new Map()

  const vueCreateProgram = proxyCreateProgram(ts, ts.createProgram, (tsObject, createProgramOptions) => {
    const vueOptions = vueCore.createParsedCommandLine(tsObject, tsObject.sys, toPosixPath(configPath)).vueOptions
    return {
      languagePlugins: [
        vueCore.createVueLanguagePlugin(tsObject, createProgramOptions.options, vueOptions, id => id),
      ],
    }
  })

  options.onEvent?.({
    phase: 'create-program',
    rootFileCount: parsed.fileNames.length,
    vueFileCount: parsed.fileNames.filter(fileName => fileName.endsWith('.vue')).length,
  })
  const program = vueCreateProgram({
    rootNames: parsed.fileNames,
    options: compilerOptions,
    host,
    ...(parsed.projectReferences === undefined ? {} : { projectReferences: parsed.projectReferences }),
  })
  options.onEvent?.({ phase: 'program-ready' })
  reportTiming(options, timings, 'create-vue-program')

  if (options.checkDiagnostics === true) {
    options.onEvent?.({ phase: 'diagnostics-start' })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    if (diagnostics.length > 0) {
      throw new Error(formatDiagnostics(diagnostics))
    }
    options.onEvent?.({ phase: 'diagnostics-done', total: diagnostics.length })
    reportTiming(options, timings, 'pre-emit-diagnostics')
  } else {
    options.onEvent?.({ phase: 'diagnostics-skipped' })
  }

  options.onEvent?.({ phase: 'emit-start' })
  const writeFile = (fileName, text) => {
    if (!isDeclarationOutput(fileName)) return
    const absolutePath = resolve(fileName)
    files.set(absolutePath, text)
    options.onEvent?.({
      phase: 'emit-file',
      current: files.size,
      total: parsed.fileNames.length,
      sourcePath: toPosixPath(relative(options.repoRoot, absolutePath)),
    })
  }
  const emitResult = program.emit(undefined, writeFile, undefined, true)
  if (emitResult.diagnostics.length > 0) {
    throw new Error(formatDiagnostics(emitResult.diagnostics))
  }
  reportTiming(options, timings, 'emit-declarations')
  options.onEvent?.({ phase: 'emit-done', total: files.size, emitSkipped: emitResult.emitSkipped })
  return { files, emitSkipped: emitResult.emitSkipped }
}

function createInMemoryDeclarationCompilerHost(files) {
  const compilerOptions = {
    allowJs: false,
    declaration: true,
    emitDeclarationOnly: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  }
  const host = ts.createCompilerHost(compilerOptions, true)
  const originalFileExists = host.fileExists.bind(host)
  const originalReadFile = host.readFile.bind(host)
  const originalGetSourceFile = host.getSourceFile.bind(host)
  const fileByKey = new Map([...files.entries()].map(([fileName, text]) => [
    normalizeSourceFileKey(fileName),
    { fileName: resolve(fileName), text },
  ]))

  host.fileExists = fileName => fileByKey.has(normalizeSourceFileKey(fileName)) || originalFileExists(fileName)
  host.readFile = fileName => fileByKey.get(normalizeSourceFileKey(fileName))?.text ?? originalReadFile(fileName)
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    const inMemoryFile = fileByKey.get(normalizeSourceFileKey(fileName))
    if (inMemoryFile !== undefined) {
      return ts.createSourceFile(
        inMemoryFile.fileName,
        inMemoryFile.text,
        languageVersionOrOptions,
        true,
        ts.ScriptKind.TS,
      )
    }
    return originalGetSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile)
  }

  return host
}

function collectDeclarationFiles(rootDir) {
  if (!existsSync(rootDir)) {
    throw new Error(`Missing declarations dir: ${rootDir}`)
  }

  const files = []
  walk(rootDir, files)
  return files.sort((left, right) => left.localeCompare(right))
}

function walk(currentDir, files) {
  const entries = readdirSync(currentDir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = resolve(currentDir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, files)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      files.push(fullPath)
    }
  }
}

function removeTreeSync(targetPath) {
  if (!existsSync(targetPath)) return
  rmSync(targetPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

function removeDeclarationsDir() {
  const expected = resolve(repoRoot, 'declarations')
  if (declarationsDir !== expected) {
    throw new Error(`Refusing to delete unexpected declarations dir: ${declarationsDir}`)
  }
  if (!existsSync(declarationsDir)) return
  removeTreeSync(declarationsDir)
}

function isDeclarationOutput(fileName) {
  return /\.d\.[cm]?ts$/u.test(fileName)
}

function readEmitBackend() {
  if (process.argv.includes('--vue-tsc-emit')) return 'vue-tsc'
  if (process.argv.includes('--compiler-api-emit')) return 'compiler-api'
  const prefixed = process.argv.find(arg => arg.startsWith('--emit-backend='))
  if (prefixed === undefined) return 'compiler-api'
  const value = prefixed.slice('--emit-backend='.length)
  if (value === 'vue-tsc' || value === 'compiler-api') return value
  throw new Error(`Unsupported --emit-backend value: ${value}`)
}

function normalizeSourceFileKey(fileName) {
  const resolved = resolve(fileName)
  return ts.sys.useCaseSensitiveFileNames ? resolved : resolved.toLowerCase()
}

function toPosixPath(fileName) {
  return fileName.replace(/\\/g, '/')
}

function formatDiagnostics(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => repoRoot,
    getCanonicalFileName: fileName => fileName,
    getNewLine: () => '\n',
  })
}

function reportTiming(options, timings, label) {
  const mark = timings.mark(label)
  options.onEvent?.({
    phase: 'timing',
    label,
    stepMs: mark.stepMs,
    totalMs: mark.totalMs,
  })
}

function createTimings() {
  return {
    start: process.hrtime.bigint(),
    last: process.hrtime.bigint(),
    marks: [],
    mark(label) {
      const now = process.hrtime.bigint()
      const mark = {
        label,
        stepMs: Number(now - this.last) / 1_000_000,
        totalMs: Number(now - this.start) / 1_000_000,
      }
      this.marks.push(mark)
      this.last = now
      return mark
    },
  }
}

function renderTimings(timer) {
  const lines = ['Timing:']
  for (const mark of timer.marks) {
    lines.push(`  ${mark.label}: ${formatSeconds(mark.stepMs)}s (total ${formatSeconds(mark.totalMs)}s)`)
  }
  return lines.join('\n')
}

function formatSeconds(ms) {
  return (ms / 1000).toFixed(3)
}
