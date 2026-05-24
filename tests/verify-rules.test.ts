import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

type CommandResult = Readonly<{
  status: number | null
  stdout: string
  stderr: string
}>

const repoRoot = process.cwd()
const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

describe('verification rules', () => {
  it('allows type aliases, classes, and as const', () => {
    const root = createTempRoot()
    writeFile(root, 'src/ok.ts', [
      'export type Payload = Readonly<{ value: string }>',
      "const values = ['stable'] as const",
      'export class StableRule {',
      '  public readonly value = values[0]',
      '}',
    ].join('\n'))

    const result = runNode(['tools/verify-ai-codegen-rules.mjs', '--root', root, '--include-root', 'src'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('AI codegen rule scan passed')
  })

  it('rejects forbidden codegen patterns including Vue script blocks', () => {
    const root = createTempRoot()
    writeFile(root, 'src/bad.ts', [
      "import '@spark-view/spark-ai/core'",
      'export interface BadPayload { value: string }',
      'namespace LegacyNamespace { export const value = 1 }',
      "export * from './other'",
      "const value = {} as Record<string, unknown>",
      'type OldType = LlmParameterSchemaRoot',
      'type OldMember = ModuleKind.PathContext',
    ].join('\n'))
    writeFile(root, 'src/bad.vue', [
      '<script setup lang="ts">',
      "const value = {} as Record<string, unknown>",
      '</script>',
    ].join('\n'))

    const result = runNode(['tools/verify-ai-codegen-rules.mjs', '--root', root, '--include-root', 'src'])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('forbidden @spark-view/spark-ai subpath')
    expect(output).toContain('interface declaration is forbidden')
    expect(output).toContain('TypeScript namespace declaration is forbidden')
    expect(output).toContain('export * is forbidden')
    expect(output).toContain('type assertion is forbidden')
    expect(output).toContain('legacy AI type name is forbidden')
    expect(output).toContain('legacy ModuleKind namespace member is forbidden')
    expect(output).toContain('bad.vue')
  })

  it('rejects flat public surfaces and bulk workspace imports', () => {
    const root = createTempRoot()
    writeFile(root, 'packages/spark-ai/src/index.ts', [
      'export type {',
      '  RuntimeProvider,',
      '  RuntimeResolver,',
      '  RuntimeAdapter,',
      '  RuntimeContext,',
      "} from './flat'",
    ].join('\n'))
    writeFile(root, 'packages/spark-ai/src/consumer.ts', [
      "import { One, Two, Three, Four, Five, Six, Seven, Eight, Nine } from '@spark-view/spark-ai/host'",
      'export const names = [One, Two, Three, Four, Five, Six, Seven, Eight, Nine]',
    ].join('\n'))
    writeFile(root, 'packages/spark-ai/src/flat.ts', [
      'export type RuntimeProvider = () => void',
      'export type RuntimeResolver = () => void',
      'export type RuntimeAdapter = () => void',
      'export type RuntimeContext = { value: string }',
      'export class RuntimeImpl {}',
    ].join('\n'))

    const result = runNode(['tools/verify-ai-codegen-rules.mjs', '--root', root, '--include-root', 'packages'])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('flat public surface')
    expect(output).toContain('too many named imports')
    expect(output).toContain('mechanical Interface/Impl name is forbidden')
  })

  it('rejects signature patterns that make generated code hard to read', () => {
    const root = createTempRoot()
    writeFile(root, 'src/bad-signature.ts', [
      'export class BadSignature {',
      '  public constructor(',
      '    /** dependency hidden inside the signature */',
      '    private readonly getValue: () => string,',
      '  ) {}',
      '}',
      'export function tooWide(a: string, b: string, c: string, d: string, e: string): string {',
      '  return a + b + c + d + e',
      '}',
    ].join('\n'))

    const result = runNode(['tools/verify-ai-codegen-rules.mjs', '--root', root, '--include-root', 'src'])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('parameter JSDoc is forbidden')
    expect(output).toContain('signature has too many positional parameters')
  })

  it('rejects public method drift on critical facade classes', () => {
    const root = createTempRoot()
    writeFile(root, 'packages/spark-ai/src/module-semantic/runtime/module-semantic-runtime.ts', [
      'export class ModuleSemanticRuntime {',
      '  public registerKind(): void {}',
      '  public getLlmTools(): void {}',
      '  public executeTool(): void {}',
      '  public getAttribute(): void {}',
      '  public setAttribute(): void {}',
      '  public invokeAction(): void {}',
      '  public listChildren(): void {}',
      '  public findInstance(): void {}',
      '  public describeKind(): void {}',
      '  public projectKnowledge(): void {}',
      '  public queryKnowledgeModules(): void {}',
      '  public queryKnowledgeFunctions(): void {}',
      '  public guideKnowledgeFunction(): void {}',
      '  public buildKnowledgePromptSnapshot(): string { return "" }',
      '}',
    ].join('\n'))

    const result = runNode(['tools/verify-ai-codegen-rules.mjs', '--root', root, '--include-root', 'packages'])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('public method surface drift for ModuleSemanticRuntime')
    expect(output).toContain('extra=[buildKnowledgePromptSnapshot]')
  })

  it('rejects framework imports inside framework-free packages', () => {
    const root = createTempRoot()
    writeJson(root, 'packages/spark-data/package.json', {
      name: '@spark-view/spark-data',
      dependencies: {},
    })
    writeFile(root, 'packages/spark-data/src/index.ts', "import { ref } from 'vue'\nexport const value = ref(1)\n")

    const result = runNode(['tools/verify-architecture.mjs', '--root', root])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('framework-free')
    expect(output).toContain('vue')
  })

  it('validates the spark-ai public subpath allowlist', () => {
    const root = createTempRoot()
    writeJson(root, 'packages/spark-ai/package.json', {
      name: '@spark-view/spark-ai',
      exports: {
        '.': './dist/index.js',
        './schema': './dist/schema/index.js',
        './host': './dist/host/index.js',
        './module-semantic': './dist/module-semantic/index.js',
        './core': './dist/core/index.js',
      },
    })
    writeFile(root, 'tsconfig.json', [
      '{',
      '  "compilerOptions": {',
      '    "paths": {',
      '      "@spark-view/spark-ai": ["./packages/spark-ai/src/index.ts"],',
      '      "@spark-view/spark-ai/schema": ["./packages/spark-ai/src/schema/index.ts"],',
      '      "@spark-view/spark-ai/host": ["./packages/spark-ai/src/host/index.ts"],',
      '      "@spark-view/spark-ai/module-semantic": ["./packages/spark-ai/src/module-semantic/index.ts"],',
      '      "@spark-view/spark-ai/core": ["./packages/spark-ai/src/core/index.ts"]',
      '    }',
      '  }',
      '}',
    ].join('\n'))

    const result = runNode(['tools/verify-architecture.mjs', '--root', root])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('spark-ai package exports')
    expect(output).toContain('spark-ai aliases')
  })
})

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-rules-'))
  tempRoots.push(root)
  return root
}

function runNode(args: readonly string[]): CommandResult {
  const result = spawnSync(process.execPath, [...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  return {
    status: result.status,
    stdout: String(result.stdout),
    stderr: String(result.stderr),
  }
}

function writeJson(root: string, relativeFile: string, value: unknown): void {
  writeFile(root, relativeFile, `${JSON.stringify(value, null, 2)}\n`)
}

function writeFile(root: string, relativeFile: string, content: string): void {
  const filePath = path.join(root, relativeFile)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}
