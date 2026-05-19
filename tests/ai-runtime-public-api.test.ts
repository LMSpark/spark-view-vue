import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as SparkAi from '../packages/spark-ai/src'
import * as SparkAiHost from '@spark-view/spark-ai/host'

const CONSUMER_SOURCE_ROOTS: readonly string[] = [
  'packages/spark-ai/src/registrations',
  'src/services/app-ai',
]

const AI_CORE_AND_CONSUMER_SOURCE_ROOTS: readonly string[] = [
  'packages/spark-ai/src/core',
  ...CONSUMER_SOURCE_ROOTS,
]

const LEGACY_REGISTRATION_SOURCE_RE = /\bI(?:ModuleRegistration|BusinessRegistration|BusinessRegistrationData|BusinessRegistrationStoreSnapshot)\b|\bAi(?:ModuleRegistrationData|ModuleRegistrationStoreSnapshot|RegisteredBusinessApi|RegisteredModuleApi|RuntimeApi|KnowledgeCatalogOptions|KnowledgeProjection)\b|\bcreateAiRuntimeToolCodec\b|\bregisterBusiness\s*\(|\bgetRegistration(?:Data|StoreSnapshot)\b|from\s+['"](?:\.\.\/)+(?:index|core|core\/host)?['"]|from\s+['"]@spark-view\/spark-ai['"]|new\s*\(\s*class\s+extends/
const LEGACY_FUNCTIONS_READ_RE = /\.functions\b/
const CONSUMER_INTERFACE_DECL_RE = /^\s*(?:export\s+)?interface\s+/
const TS_ASSERTION_RE = /\bas\s+(?!const\s+[_a-zA-Z])(?:const\b|unknown\b|readonly\b|Record\b|Partial\b|\{|[A-Za-z_$][\w$]*(?:\b|<|\[))/

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

function legacyRegistrationSourceViolations(): string[] {
  return AI_CORE_AND_CONSUMER_SOURCE_ROOTS
    .flatMap((root) => collectSourceFiles(join(process.cwd(), root)))
    .flatMap((file) => {
      const content = readFileSync(file, 'utf8')
      return content.split(/\r?\n/).flatMap((line, index) => (
        LEGACY_REGISTRATION_SOURCE_RE.test(line)
          ? [`${relative(process.cwd(), file)}:${index + 1}`]
          : []
      ))
    })
}

function legacyFunctionsReadViolations(): string[] {
  return collectSourceFiles(join(process.cwd(), 'packages/spark-ai/src/registrations'))
    .flatMap((file) => {
      const content = readFileSync(file, 'utf8')
      return content.split(/\r?\n/).flatMap((line, index) => (
        LEGACY_FUNCTIONS_READ_RE.test(line)
          ? [`${relative(process.cwd(), file)}:${index + 1}`]
          : []
      ))
    })
}

function consumerInterfaceDeclViolations(): string[] {
  return CONSUMER_SOURCE_ROOTS
    .flatMap((root) => collectSourceFiles(join(process.cwd(), root)))
    .flatMap((file) => {
      const content = readFileSync(file, 'utf8')
      return content.split(/\r?\n/).flatMap((line, index) => (
        CONSUMER_INTERFACE_DECL_RE.test(line)
          ? [`${relative(process.cwd(), file)}:${index + 1}`]
          : []
      ))
    })
}

function typeAssertionViolations(): string[] {
  return AI_CORE_AND_CONSUMER_SOURCE_ROOTS
    .flatMap((root) => collectSourceFiles(join(process.cwd(), root)))
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
          ? [`${relative(process.cwd(), file)}:${index + 1}`]
          : []
      })
    })
}

describe('ai runtime class-only public surface', () => {
  it('exposes class-first runtime only', () => {
    expect('createAiRuntime' in SparkAi).toBe(false)

    expect(typeof SparkAi.AiRuntime).toBe('function')
    expect(typeof SparkAi.AiRegisteredModule).toBe('function')
    expect(typeof SparkAi.AiRuntimeToolCodec).toBe('function')
    expect('createAiRuntimeToolCodec' in SparkAi).toBe(false)
    expect('PageDesignBusiness' in SparkAi).toBe(false)
    expect(typeof SparkAi.PageDesignModule).toBe('function')
    expect(typeof SparkAi.LeaveRequestModule).toBe('function')
    expect(typeof SparkAi.LifecycleModule).toBe('function')
    expect(typeof SparkAiHost.AiHostBusinessRegistry).toBe('function')
  })

  it('exposes class-first registrations without legacy compatibility fields', () => {
    const lifecycle = new SparkAi.LifecycleModule()
    const leaveRegistration = new SparkAi.LeaveRequestModuleRegistration()
    const leaveModule = new SparkAi.LeaveRequestModule()
    const pageDesignModule = new SparkAi.PageDesignModule({
      getEditToolHost: () => {
        throw new Error('not needed')
      },
    })

    expect(lifecycle.getFunctions().length).toBeGreaterThan(0)
    expect('functions' in lifecycle).toBe(false)
    expect('entity' in lifecycle).toBe(false)

    expect(leaveRegistration.getFunctions().length).toBeGreaterThan(0)
    expect('functions' in leaveRegistration).toBe(false)

    expect('businessId' in leaveModule).toBe(false)
    expect('entity' in leaveModule).toBe(false)
    expect(leaveModule.getFunctions().length).toBeGreaterThan(0)
    expect(pageDesignModule.getFunctions()).toEqual([])
    expect('getRegistrationData' in leaveModule).toBe(false)
    expect('getRegistrationStoreSnapshot' in leaveModule).toBe(false)
  })

  it('removes legacy business registration entrypoints from core', () => {
    const core = new SparkAi.AiRuntime()
    expect('registerBusiness' in core).toBe(false)
  })

  it('keeps ai core and consumers off legacy registration contracts and entrypoints', () => {
    expect(legacyRegistrationSourceViolations()).toEqual([])
  })

  it('keeps runtime-backed modules on getFunctions as the primary function path', () => {
    expect(legacyFunctionsReadViolations()).toEqual([])
  })

  it('keeps registrations and app-ai consumers off interface declarations', () => {
    expect(consumerInterfaceDeclViolations()).toEqual([])
  })

  it('keeps ai core and consumers off TypeScript assertion escapes', () => {
    expect(typeAssertionViolations()).toEqual([])
  })
})
