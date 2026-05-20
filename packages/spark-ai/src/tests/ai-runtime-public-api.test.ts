import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import * as SparkAi from '../index'
import * as SparkAiHost from '../host/index'

function resolveAiSourceRoot(): string {
  try {
    return fileURLToPath(new URL('..', import.meta.url))
  } catch {
    return join(process.cwd(), 'packages', 'spark-ai', 'src')
  }
}

const AI_SOURCE_ROOT = resolveAiSourceRoot()
const AI_RUNTIME_SOURCE_ROOTS = [
  join(AI_SOURCE_ROOT, 'protocol'),
  join(AI_SOURCE_ROOT, 'internal'),
  join(AI_SOURCE_ROOT, 'host'),
]
const PAGE_CONFIG_PACKAGE_NAME = `@spark-view/${'spark-page'}-${'config'}`
const PAGE_CONFIG_PACKAGE_SEGMENT = `${'spark-page'}-${'config'}`

const LEGACY_REGISTER_BUSINESS_CALL = String.raw`register` + String.raw`Business\s*\(`
const LEGACY_CORE_SOURCE_RE = new RegExp([
  String.raw`\bI(?:ModuleRegistration|BusinessRegistration|BusinessRegistrationData|BusinessRegistrationStoreSnapshot)\b`,
  String.raw`\bAi(?:ModuleRegistrationData|ModuleRegistrationStoreSnapshot|RegisteredBusinessApi|RegisteredModuleApi|RuntimeApi|KnowledgeCatalogOptions|KnowledgeProjection)\b`,
  String.raw`\bcreateAiRuntimeToolCodec\b`,
  String.raw`\b${LEGACY_REGISTER_BUSINESS_CALL}`,
  String.raw`\bgetRegistration(?:Data|StoreSnapshot)\b`,
].join('|'))
const TS_ASSERTION_RE = /\bas\s+(?!const\s+[_a-zA-Z])(?:const\b|unknown\b|readonly\b|Record\b|Partial\b|\{|[A-Za-z_$][\w$]*(?:\b|<|\[))/
const PAGE_CONFIG_IMPORT_RE = new RegExp(
  `from\\s+['"](?:${PAGE_CONFIG_PACKAGE_NAME}|.*${PAGE_CONFIG_PACKAGE_SEGMENT})`
  + `|import\\s*\\(\\s*['"](?:${PAGE_CONFIG_PACKAGE_NAME}|.*${PAGE_CONFIG_PACKAGE_SEGMENT})`,
)

function stripNonCodeSegments(line: string, inBlockComment: boolean): { code: string; inBlockComment: boolean } {
  let code = ''
  let quote: string | null = null
  let escaping = false
  let index = 0
  let blockComment = inBlockComment

  while (index < line.length) {
    const char = line[index] ?? ''
    const next = line[index + 1] ?? ''

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        code += '  '
        index += 2
        continue
      }
      code += ' '
      index += 1
      continue
    }

    if (quote !== null) {
      if (escaping) {
        escaping = false
      } else if (char === '\\') {
        escaping = true
      } else if (char === quote) {
        quote = null
      }
      code += ' '
      index += 1
      continue
    }

    if (char === '/' && next === '/') break
    if (char === '/' && next === '*') {
      blockComment = true
      code += '  '
      index += 2
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      code += ' '
      index += 1
      continue
    }
    code += char
    index += 1
  }

  return { code, inBlockComment: blockComment }
}

function collectSourceFiles(root: string): string[] {
  const files: string[] = []
  for (const item of readdirSync(root)) {
    const path = join(root, item)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(path))
      continue
    }
    if (path.endsWith('.ts') || path.endsWith('.tsx')) {
      files.push(path)
    }
  }
  return files
}

function legacyCoreSourceViolations(): string[] {
  return AI_RUNTIME_SOURCE_ROOTS.flatMap((root) => collectSourceFiles(root))
    .flatMap((file) => {
      const content = readFileSync(file, 'utf8')
      return content.split(/\r?\n/).flatMap((line, index) => (
        LEGACY_CORE_SOURCE_RE.test(line)
          ? [`${relative(AI_SOURCE_ROOT, file)}:${index + 1}`]
          : []
      ))
    })
}

function typeAssertionViolations(): string[] {
  return AI_RUNTIME_SOURCE_ROOTS.flatMap((root) => collectSourceFiles(root))
    .flatMap((file) => {
      const content = readFileSync(file, 'utf8')
      let importOrExportBlock = false
      let inBlockComment = false
      return content.split(/\r?\n/).flatMap((line, index) => {
        const trimmed = line.trim()
        if (/^(import|export)\s+(?:type\s+)?\{/.test(trimmed)) importOrExportBlock = true
        const inImportOrExportBlock = importOrExportBlock
        if (inImportOrExportBlock && /\}\s+from\s+['"]/.test(trimmed)) importOrExportBlock = false
        if (inImportOrExportBlock) return []
        const scan = stripNonCodeSegments(line, inBlockComment)
        inBlockComment = scan.inBlockComment
        return TS_ASSERTION_RE.test(scan.code)
          ? [`${relative(AI_SOURCE_ROOT, file)}:${index + 1}`]
          : []
      })
    })
}

function pageConfigImportViolations(): string[] {
  return AI_RUNTIME_SOURCE_ROOTS.flatMap((root) => collectSourceFiles(root))
    .flatMap((file) => {
      const content = readFileSync(file, 'utf8')
      return content.split(/\r?\n/).flatMap((line, index) => (
        PAGE_CONFIG_IMPORT_RE.test(line)
          ? [`${relative(AI_SOURCE_ROOT, file)}:${index + 1}`]
          : []
      ))
    })
}

describe('ai runtime public surface', () => {
  it('exposes runtime protocol, host, function calling, and knowledge classes from spark-ai', () => {
    expect(typeof SparkAi.AiRuntime).toBe('function')
    expect(typeof SparkAi.AiRegisteredModule).toBe('function')
    expect(typeof SparkAi.AiRuntimeToolCodec).toBe('function')
    expect(typeof SparkAiHost.AiHostBusinessRegistry).toBe('function')

    const legacyAppRegistrationExport = ['register', 'App', 'Ai', 'Businesses'].join('')
    expect(legacyAppRegistrationExport in SparkAi).toBe(false)
    expect('createAiRuntimeToolCodec' in SparkAi).toBe(false)
    const legacyRegisterBusinessMethod = ['register', 'Business'].join('')
    expect(legacyRegisterBusinessMethod in new SparkAi.AiRuntime()).toBe(false)
  })

  it('keeps ai runtime off legacy registration contracts and entrypoints', () => {
    expect(legacyCoreSourceViolations()).toEqual([])
  })

  it('keeps ai runtime off TypeScript assertion escapes', () => {
    expect(typeAssertionViolations()).toEqual([])
  })

  it('keeps spark-ai independent from page config package imports', () => {
    expect(pageConfigImportViolations()).toEqual([])
  })
})
