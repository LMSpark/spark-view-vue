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

  it('keeps page-design services in page-config grouped by responsibility', () => {
    const serviceRoot = path.join(pageConfigPackageRoot, 'src', 'page-design')
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

  it('does not publish legacy spark-ai services entrypoints', () => {
    expect(fs.existsSync(path.join(packageRoot, 'src', 'services'))).toBe(false)

    const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      exports?: Record<string, unknown>
    }
    expect(Object.keys(packageJson.exports ?? {})).not.toContain('./services')
    expect(Object.keys(packageJson.exports ?? {})).not.toContain('./services/page-design')
  })

  it('keeps DevSystem out of the generated component catalog', () => {
    const serializedCatalog = JSON.stringify(COMPONENT_CATALOG_JSON)

    expect(serializedCatalog).not.toContain('src/views/app/dev-system')
    expect(serializedCatalog).not.toContain('dev-system')
  })

  it('keeps DevSystem editing independent from the AI core runtime', () => {
    const devSystemRoot = path.join(repoRoot, 'src', 'views', 'app', 'dev-system')
    const serviceRoot = path.join(pageConfigPackageRoot, 'src', 'page-design')
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

    expect(COMPONENT_CATALOG_JSON.components['ai-chat-shell']).toBeUndefined()
    expect(COMPONENT_CATALOG_JSON.components['dashboard']).toBeUndefined()
    expect(functionCatalog.components['ai-chat-shell']).toBeUndefined()
    expect(functionCatalog.components['dashboard']).toBeUndefined()

  })

  it('publishes a self-referential schema-node VCM component catalog payload', () => {
    const catalogPath = path.join(packageRoot, 'src/registrations/page-design/payloads/component-catalog.json')
    const catalogText = fs.readFileSync(catalogPath, 'utf8')
    const catalog = JSON.parse(catalogText) as ComponentCatalog
    const schemaNodes = catalog.schemaNodes ?? []
    const nodeById = new Map(schemaNodes.map((node) => [node.id, node]))
    const childrenByParent = new Map<string, typeof schemaNodes>()
    for (const node of schemaNodes) {
      if (node.parentId === undefined) continue
      const children = childrenByParent.get(node.parentId) ?? []
      children.push(node)
      childrenByParent.set(node.parentId, children)
    }

    expect(catalog.version).toBe('4.0.0')
    expect(catalog.components['template-dsl-demo']).toBeUndefined()
    expect(catalog.components['capability-demo']).toBeUndefined()
    expect(catalog.components['custom-rtable-demo']).toBeUndefined()
    expect(catalog.components['rform-compare-demo']).toBeUndefined()
    expect(catalog.components['ai-chat-shell']).toMatchObject({ internal: true, configurable: false })
    expect(catalog.components['dashboard']).toMatchObject({ internal: true, configurable: false })
    expect(catalog).not.toHaveProperty('canonical')
    expect(catalog).not.toHaveProperty('registry')
    expect(catalog).not.toHaveProperty('schemaPool')
    expect(catalog).not.toHaveProperty('$defs')
    expect(catalogText).not.toMatch(/\bschema_\d+\b/u)
    expect(catalogText).not.toMatch(/\bprop_\d+\b/u)
    expect(catalogText).not.toMatch(/\bemit_\d+\b/u)
    expect(catalogText).not.toContain('schema_00333')
    expect(catalogText).not.toMatch(/"kind"\s*:/u)
    expect(catalogText).not.toContain('"schemaRef"')
    expect(catalogText).not.toContain('"schemaRefs"')
    expect(catalogText).not.toContain('"$id"')
    expect(catalogText).not.toContain('"x-ts-')

    expect(schemaNodes.length).toBeGreaterThan(0)
    expect(nodeById.size).toBe(schemaNodes.length)
    expect(Object.keys(catalog).slice(0, 4)).toEqual(['version', 'buildTime', 'componentCount', 'components'])
    for (const node of schemaNodes) {
      expect(nodeById.has(node.rootId)).toBe(true)
      if (node.parentId !== undefined) expect(nodeById.has(node.parentId)).toBe(true)
      if (node.refId !== undefined) expect(nodeById.has(node.refId)).toBe(true)
    }

    for (const entry of Object.values(catalog.components)) {
      for (const prop of entry.props) {
        if (prop.schemaNodeId !== undefined) expect(nodeById.has(prop.schemaNodeId)).toBe(true)
      }
      for (const emit of entry.emits ?? []) {
        if (emit.schemaNodeId !== undefined) expect(nodeById.has(emit.schemaNodeId)).toBe(true)
      }
    }

    const isBlank = (value: unknown): boolean => value === undefined || String(value).trim() === ''
    const allProps = Object.values(catalog.components).flatMap(entry => entry.props)
    const allEmits = Object.values(catalog.components).flatMap(entry => entry.emits ?? [])
    const keyNodes = schemaNodes.filter(node => ['root', 'property', 'oneOf', 'prefixItem'].includes(node.relation))
    expect(allProps.filter(prop => isBlank(prop.description))).toHaveLength(0)
    expect(allEmits.filter(emit => isBlank(emit.description))).toHaveLength(0)
    expect(keyNodes.filter(node => isBlank(node.description))).toHaveLength(0)
    expect(allProps.filter(prop => /\|\s*undefined\b/u.test(prop.type))).toHaveLength(0)
    expect(allEmits.filter(emit => /\|\s*undefined\b/u.test(emit.type ?? ''))).toHaveLength(0)
    expect(schemaNodes.filter(node => /\|\s*undefined\b/u.test(node.id) || /\|\s*undefined\b/u.test(node.title ?? ''))).toHaveLength(0)

    const actionProp = catalog.components['r-button']?.props.find(prop => prop.name === 'action')
    expect(actionProp?.description).not.toContain('@enumValue')
    expect(actionProp?.examples).toEqual(expect.arrayContaining(['append-row']))
    expect(actionProp?.schemaNodeId).toBeDefined()
    const actionBranches = actionProp?.schemaNodeId === undefined
      ? []
      : (childrenByParent.get(actionProp.schemaNodeId) ?? []).filter(node => node.relation === 'oneOf')
    expect(actionBranches).toHaveLength(16)
    expect(actionBranches).toContainEqual(expect.objectContaining({
      const: 'append-row',
      title: '新增行',
      description: '向当前数据视图追加一行。适合普通新增按钮；可配 appendPayload、inheritFields 或 prompt。',
    }))
    const actionRootNode = actionProp?.schemaNodeId === undefined ? undefined : nodeById.get(actionProp.schemaNodeId)
    expect(actionRootNode?.examples).toEqual(expect.arrayContaining(['append-row']))

    const payloadParamNode = schemaNodes.find(node => node.relation === 'prefixItem' && node.name === 'value')
    expect(payloadParamNode).toBeDefined()
    expect(payloadParamNode?.description).not.toEqual('')
    expect(payloadParamNode?.examples?.length ?? 0).toBeGreaterThan(0)
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
