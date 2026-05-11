import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

import {
  COMPONENT_CATALOG_JSON,
  guidePageDesignComponentPayload,
  projectFunctionCatalog,
  type ComponentCatalog,
} from '../packages/spark-ai/src/registrations/page-design/payloads'

function walkFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(fullPath))
    else files.push(fullPath)
  }
  return files
}

describe('@spark-view/spark-ai framework boundary', () => {
  const packageRoot = path.resolve(__dirname, '../packages/spark-ai')
  const pageConfigPackageRoot = path.resolve(__dirname, '../packages/spark-page-config')
  const dataPackageRoot = path.resolve(__dirname, '../packages/spark-data')
  const repoRoot = path.resolve(__dirname, '..')

  function packageBoundaryFiles(root: string): string[] {
    const files = [
      path.join(root, 'package.json'),
      path.join(root, 'tsconfig.json'),
      path.join(root, 'tsconfig.build.json'),
      ...walkFiles(path.join(root, 'src'))
        .filter(file => file.endsWith('.ts')),
    ]
    return files.filter(file => fs.existsSync(file))
  }

  it('keeps AI, page-config and DataSet packages free of frontend framework dependencies', () => {
    const forbiddenPatterns = [
      /@spark-view\/spark-component/u,
      /(?:^|['"])vue(?:['"]|$)/u,
      /@vue\//u,
      /(?:^|['"])react(?:['"]|$)/u,
      /(?:^|['"])svelte(?:['"]|$)/u,
      /(?:^|['"])@angular\//u,
    ]

    const files = [
      ...packageBoundaryFiles(packageRoot),
      ...packageBoundaryFiles(pageConfigPackageRoot),
      ...packageBoundaryFiles(dataPackageRoot),
    ]

    const offenders = files.flatMap((file) => {
      const content = fs.readFileSync(file, 'utf8')
      return forbiddenPatterns
        .filter(pattern => pattern.test(content))
        .map(pattern => `${path.relative(repoRoot, file)} :: ${pattern.source}`)
    })

    expect(offenders).toEqual([])
  })

  it('keeps page-design services grouped by responsibility', () => {
    const serviceRoot = path.join(packageRoot, 'src', 'services', 'page-design')
    const allowedRootEntries = new Set([
      'index.ts',
      'editing',
      'operations',
    ])

    const rootEntries = fs.readdirSync(serviceRoot)
    expect(rootEntries.filter(entry => !allowedRootEntries.has(entry))).toEqual([])

    const expectedLayerEntrypoints = [
      path.join('editing', 'index.ts'),
      path.join('operations', 'index.ts'),
    ]
    for (const entrypoint of expectedLayerEntrypoints) {
      expect(fs.existsSync(path.join(serviceRoot, entrypoint))).toBe(true)
    }
  })

  it('keeps DevSystem out of the generated component catalog', () => {
    const serializedCatalog = JSON.stringify(COMPONENT_CATALOG_JSON)

    expect(serializedCatalog).not.toContain('src/views/app/dev-system')
    expect(serializedCatalog).not.toContain('dev-system')
  })

  it('keeps DevSystem editing independent from the AI core runtime', () => {
    const devSystemRoot = path.join(repoRoot, 'src', 'views', 'app', 'dev-system')
    const serviceRoot = path.join(packageRoot, 'src', 'services')
    const files = [
      ...walkFiles(devSystemRoot),
      ...walkFiles(serviceRoot),
    ].filter(file => /\.(ts|vue)$/.test(file))

    const forbiddenPatterns = [
      /@spark-view\/spark-ai\/core/,
      /from\s+['"][^'"]*\/core(?:\/|['"])/,
      /\bAiRuntime\b/,
      /\bAiModule[A-Z]\w*\b/,
      /\bAiRegistered[A-Z]\w*\b/,
      /\bAiInvocation\b/,
      /\bFunctionExecutionContext\b/,
    ]

    const offenders = files.flatMap((file) => {
      const content = fs.readFileSync(file, 'utf8')
      return forbiddenPatterns
        .filter(pattern => pattern.test(content))
        .map(pattern => `${path.relative(repoRoot, file)} :: ${pattern.source}`)
    })

    expect(offenders).toEqual([])
  })

  it('publishes a framework-neutral component catalog surface', () => {
    const catalog = COMPONENT_CATALOG_JSON as ComponentCatalog
    const functionCatalog = projectFunctionCatalog(catalog)
    const serializedCatalog = JSON.stringify(catalog)

    expect(serializedCatalog).not.toContain('modelValue')
    expect(serializedCatalog).not.toContain('update:modelValue')
    expect(serializedCatalog).not.toContain('Vue')
    expect(serializedCatalog).not.toContain('.vue')

    for (const entry of Object.values(catalog.components)) {
      expect(entry.props.map(prop => prop.name)).not.toContain('modelValue')
      expect(entry.emits?.map(emit => emit.name) ?? []).not.toContain('update:modelValue')
    }

    for (const entry of Object.values(functionCatalog.components)) {
      expect(entry.props.map(prop => prop.name)).not.toContain('modelValue')
      expect(entry.emits?.map(emit => emit.name) ?? []).not.toContain('update:modelValue')
    }

  })

  it('publishes component payload guides as parameter schema', () => {
    const guide = guidePageDesignComponentPayload('r-table')

    expect(guide).not.toBeNull()
    expect(guide).not.toHaveProperty('jsonSchema')
    expect(guide).not.toHaveProperty('minimalExample')
    expect(guide).toHaveProperty('minimalParams')
    expect(guide?.paramsSchema).toMatchObject({
      kind: 'object',
      required: ['type', 'props'],
    })

    const schema = guide?.paramsSchema as { properties?: Record<string, unknown> } | undefined
    expect(schema?.properties?.['type']).toMatchObject({
      kind: 'enum',
      enum: ['r-table'],
    })
  })
})
