import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

import {
  COMPONENT_CATALOG_JSON,
  guidePageDesignComponentPayload,
  projectFunctionCatalog,
  queryComponentCatalog,
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
    const componentEntries = Object.values(catalog.components)
    const componentTypes = componentEntries.map(entry => entry.type)
    const propertyNames = componentEntries.flatMap(entry => entry.props.map(prop => prop.name))
    const emitNames = componentEntries.flatMap(entry => (entry.emits ?? []).map(emit => emit.name))

    expect(serializedCatalog).not.toContain('modelValue')
    expect(serializedCatalog).not.toContain('update:modelValue')
    expect(serializedCatalog).not.toContain('Vue')
    expect(serializedCatalog).not.toContain('.vue')

    expect(propertyNames).not.toContain('modelValue')
    expect(emitNames).not.toContain('update:modelValue')

    for (const entry of Object.values(functionCatalog.components)) {
      expect(entry.props.map(prop => prop.name)).not.toContain('modelValue')
      expect(entry.emits?.map(emit => emit.name) ?? []).not.toContain('update:modelValue')
    }

    expect(componentTypes).not.toContain('ai-chat-shell')
    expect(componentTypes).not.toContain('dashboard')
    expect(functionCatalog.components['ai-chat-shell']).toBeUndefined()
    expect(functionCatalog.components['dashboard']).toBeUndefined()

  })

  it('publishes a standard JSON Schema VCM component catalog payload', () => {
    const catalogPath = path.join(packageRoot, 'src/registrations/page-design/payloads/component-catalog.json')
    const catalogText = fs.readFileSync(catalogPath, 'utf8')
    const catalog = JSON.parse(catalogText) as ComponentCatalog
    const componentEntries = Object.values(catalog.components)
    const schemaEntries = Object.entries(catalog.$defs ?? {})
    const componentTypes = componentEntries.map(entry => entry.type)

    expect(catalog.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(catalog.version).toBe('3.0.0')
    expect(componentTypes).not.toContain('template-dsl-demo')
    expect(componentTypes).not.toContain('capability-demo')
    expect(componentTypes).not.toContain('custom-rtable-demo')
    expect(componentTypes).not.toContain('rform-compare-demo')
    expect(catalog.components['ai-chat-shell']).toMatchObject({ internal: true, configurable: false })
    expect(catalog.components['dashboard']).toMatchObject({ internal: true, configurable: false })
    expect(catalog).not.toHaveProperty('canonical')
    expect(catalog).not.toHaveProperty('registry')
    expect(catalog).not.toHaveProperty('schemaPool')
    expect(catalog).not.toHaveProperty('schemaNodes')
    expect(catalog).not.toHaveProperty('bindingDescriptors')
    expect(catalog).not.toHaveProperty('constraints')
    expect(catalog).not.toHaveProperty('metadata')
    expect(catalog).not.toHaveProperty('sharedTypes')
    expect(catalog).toHaveProperty('$defs')
    expect(catalog).not.toHaveProperty('objects')
    expect(catalog).not.toHaveProperty('objectCount')
    expect(catalog).not.toHaveProperty('groups')
    expect(catalog).not.toHaveProperty('types')
    expect(catalog).not.toHaveProperty('typeCount')
    expect(catalogText).not.toMatch(/\bschema_\d+\b/u)
    expect(catalogText).not.toMatch(/\bprop_\d+\b/u)
    expect(catalogText).not.toMatch(/\bemit_\d+\b/u)
    expect(catalogText).not.toMatch(/\bRenderer[A-Z][A-Za-z0-9]*Props\b/u)
    expect(catalogText).not.toContain('schema_00333')
    expect(catalogText).not.toMatch(/"kind"\s*:/u)
    expect(catalogText).not.toContain('"schemaRef"')
    expect(catalogText).not.toContain('"schemaRefs"')
    expect(catalogText).not.toContain('"componentRef"')
    expect(catalogText).not.toContain('"$id"')
    expect(catalogText).not.toContain('"x-ts-')

    expect(componentEntries.length).toBeGreaterThan(0)
    expect(schemaEntries.length).toBeGreaterThan(0)
    expect(new Set(Object.keys(catalog.components)).size).toBe(Object.keys(catalog.components).length)
    expect(catalog.componentCount).toBe(Object.keys(catalog.components).length)
    expect(Object.keys(catalog)).toEqual(['$schema', 'version', 'buildTime', 'componentCount', 'components', '$defs'])
    for (const [key, entry] of Object.entries(catalog.components)) {
      expect(entry.type).toBe(key)
      expect(entry.description).toBeTruthy()
      expect(entry).not.toHaveProperty('id')
      expect(entry).not.toHaveProperty('ownerId')
      expect(entry).not.toHaveProperty('parentId')
      expect(entry).not.toHaveProperty('rootId')
      expect(entry).not.toHaveProperty('refId')
      expect(Array.isArray(entry.props)).toBe(true)
    }

    const isBlank = (value: unknown): boolean => value === undefined || String(value).trim() === ''
    const allProps = componentEntries.flatMap(entry => entry.props)
    const allEmits = componentEntries.flatMap(entry => entry.emits ?? [])
    expect(allProps.filter(prop => isBlank(prop.description))).toHaveLength(0)
    expect(allEmits.filter(emit => isBlank(emit.description))).toHaveLength(0)
    expect(allProps.filter(prop => 'examples' in prop)).toHaveLength(0)
    const schemaDescriptions = schemaEntries.filter(([, schema]) => !isBlank(schema.description))
    expect(schemaDescriptions.length).toBeGreaterThan(0)

    const missingRefs: string[] = []
    const nonStandardRefs: string[] = []
    const refToDefKey = (ref: string): string => ref
      .slice('#/$defs/'.length)
      .replace(/~1/gu, '/')
      .replace(/~0/gu, '~')
    const collectRefs = (schema: unknown): void => {
      if (schema === null || typeof schema !== 'object') return
      const current = schema as {
        $ref?: unknown
        properties?: Record<string, unknown>
        items?: unknown
        prefixItems?: unknown[]
        oneOf?: unknown[]
        anyOf?: unknown[]
      }
      if (typeof current.$ref === 'string') {
        if (!current.$ref.startsWith('#/$defs/')) nonStandardRefs.push(current.$ref)
        else if (catalog.$defs?.[refToDefKey(current.$ref)] === undefined) missingRefs.push(current.$ref)
      }
      Object.values(current.properties ?? {}).forEach(collectRefs)
      collectRefs(current.items)
      ;(current.prefixItems ?? []).forEach(collectRefs)
      ;(current.oneOf ?? []).forEach(collectRefs)
      ;(current.anyOf ?? []).forEach(collectRefs)
    }
    const schemasWithEnumExamples: string[] = []
    const collectEnumExamples = (schema: unknown, pathName: string): void => {
      if (schema === null || typeof schema !== 'object') return
      const current = schema as {
        enum?: unknown[]
        examples?: unknown[]
        oneOf?: unknown[]
        anyOf?: unknown[]
        properties?: Record<string, unknown>
        items?: unknown
        prefixItems?: unknown[]
      }
      const enumLike = (current.enum?.length ?? 0) > 0
        || current.oneOf?.some(item => item !== null && typeof item === 'object' && 'const' in item) === true
      if (enumLike && Array.isArray(current.examples)) schemasWithEnumExamples.push(pathName)
      Object.entries(current.properties ?? {}).forEach(([key, child]) => collectEnumExamples(child, `${pathName}.properties.${key}`))
      collectEnumExamples(current.items, `${pathName}.items`)
      ;(current.prefixItems ?? []).forEach((child, index) => collectEnumExamples(child, `${pathName}.prefixItems.${index}`))
      ;(current.oneOf ?? []).forEach((child, index) => collectEnumExamples(child, `${pathName}.oneOf.${index}`))
      ;(current.anyOf ?? []).forEach((child, index) => collectEnumExamples(child, `${pathName}.anyOf.${index}`))
    }
    for (const entry of componentEntries) {
      entry.props.forEach(prop => collectRefs(prop.schema))
      ;(entry.emits ?? []).forEach(emit => collectRefs(emit.schema))
      entry.props.forEach(prop => collectEnumExamples(prop.schema, `components.${entry.type}.props.${prop.name}`))
      ;(entry.emits ?? []).forEach(emit => collectEnumExamples(emit.schema, `components.${entry.type}.emits.${emit.name}`))
    }
    for (const [, schema] of schemaEntries) {
      collectRefs(schema)
      collectEnumExamples(schema, '$defs')
    }
    expect(missingRefs).toEqual([])
    expect(nonStandardRefs).toEqual([])
    expect(schemasWithEnumExamples).toEqual([])
    expect(Object.keys(catalog.$defs ?? {}).filter(type => type.endsWith('[]'))).toEqual([])
    expect(Object.keys(catalog.$defs ?? {}).filter(type => type.includes('"') || type.includes('|'))).toEqual([])
    expect(catalogText).not.toContain('Gets or sets the length of the array')

    const rTable = catalog.components['r-table']
    const toolbarProp = rTable?.props.find(prop => prop.name === 'toolbar')
    expect(toolbarProp?.type).toBe('r-toolbar')
    expect(toolbarProp).not.toHaveProperty('componentRef')
    expect(toolbarProp?.schema).toEqual({ $ref: '#/$defs/r-toolbar' })
    expect(catalog.$defs?.['r-toolbar']).toEqual(expect.objectContaining({
      title: 'r-toolbar',
      type: 'object',
      properties: expect.objectContaining({
        type: expect.objectContaining({ const: 'r-toolbar' }),
        props: expect.objectContaining({ type: 'object' }),
        children: expect.objectContaining({ items: { $ref: '#/$defs/SparkNode' } }),
      }),
    }))
    expect(catalog.$defs?.['RToolbarProps']).toBeUndefined()

    const rButton = catalog.components['r-button']
    const actionProp = rButton?.props.find(prop => prop.name === 'action')
    expect(actionProp?.description).not.toContain('@enumValue')
    expect(actionProp).not.toHaveProperty('examples')
    expect(actionProp?.schema).not.toHaveProperty('$ref')
    const actionSchema = actionProp?.schema as { enum?: unknown[]; oneOf?: Array<Record<string, unknown>>; examples?: unknown[] } | undefined
    expect(actionSchema?.enum).toEqual(expect.arrayContaining(['append-row', 'delete-selected', 'message-current']))
    const actionBranches = actionSchema?.oneOf ?? []
    expect(actionBranches).toHaveLength(16)
    expect(actionBranches).toContainEqual(expect.objectContaining({
      const: 'append-row',
      title: '新增行',
      description: '向当前数据视图追加一行。适合普通新增按钮；可配 appendPayload、inheritFields 或 prompt。',
    }))
    expect(actionSchema).not.toHaveProperty('examples')

    const payloadParam = componentEntries
      .flatMap(entry => (entry.emits ?? []).map(emit => emit.schema as { prefixItems?: Array<Record<string, unknown>> } | undefined))
      .flatMap(schema => schema?.prefixItems ?? [])
      .find(item => item['title'] === 'value')
    expect(payloadParam).toBeDefined()
    expect(payloadParam?.['description']).not.toEqual('')
    expect(payloadParam).not.toHaveProperty('examples')
  })

  it('queries component catalog with JMESPath without leaking raw shape details', () => {
    const rawComponentTypes = queryComponentCatalog<string[]>('components.*.type | sort(@)', { source: 'raw' })
    const publicComponentTypes = queryComponentCatalog<string[]>('components.*.type | sort(@)')
    const actionValues = queryComponentCatalog<string[]>(
      'components."r-button".props[?name==`action`].schema.enum[]',
      { source: 'raw' },
    )
    const fieldTypes = queryComponentCatalog<string[]>(
      'components.* | [?category==`field`].type | sort(@)',
    )

    expect(rawComponentTypes).toContain('ai-chat-shell')
    expect(publicComponentTypes).not.toContain('ai-chat-shell')
    expect(actionValues).toEqual(expect.arrayContaining(['append-row', 'delete-selected', 'message-current']))
    expect(fieldTypes).toContain('r-text')
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

  it('builds component payload parameter schema from JSON Schema, not type text guesses', () => {
    const guide = guidePageDesignComponentPayload('r-button')
    const schema = guide?.paramsSchema as {
      properties?: {
        props?: {
          properties?: Record<string, unknown>
        }
      }
    } | undefined
    const action = schema?.properties?.props?.properties?.['action']

    expect(action).toMatchObject({
      kind: 'enum',
      openEnded: false,
      enum: expect.arrayContaining(['append-row', 'delete-selected', 'message-current']),
    })
  })
})
