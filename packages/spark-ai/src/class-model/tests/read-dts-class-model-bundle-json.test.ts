import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  DTS_CLASS_MODEL_RUNTIME_PROTOCOL,
  DTS_CLASS_MODEL_RUNTIME_VERSION,
  DTS_FILE_PROJECTION_VERSION,
} from '../class-model/dts-bundle-types'
import { buildDtsClassModelBundle } from '../class-model/build-dts-class-model-bundle'
import { DtsClassModelBundleLoader } from '../class-model/dts-class-model-bundle-loader'
import { DtsClassModelRuntimeLoader } from '../class-model/dts-class-model-runtime-loader'
import { projectDtsFileProjection } from '../class-model/project-from-declarations'
import { createDtsBundleClassModelKnowledgeProvider } from '../knowledge'
import {
  readDtsClassModelBundleManifest,
  readDtsClassModelRuntimeManifest,
  readDtsClassModelRuntimeShard,
  readDtsFileProjectionDocument,
} from '../class-model/read-dts-class-model-bundle-json'

const removedReturnTypeField = ['return', 'Type'].join('')
const removedReturnTypeRefsField = ['return', 'Type', 'Refs'].join('')
const removedReturnTextField = ['return', 'Type', 'Text'].join('')
const removedParamsTextField = ['params', 'Type', 'Text'].join('')

describe('readDtsClassModelBundleJson', () => {
  it('parses generated manifest with structural validation', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-manifest-${String(process.pid)}-${String(Date.now())}`)
    try {
      const sourcePath = 'class-model-emit/packages/spark-utils/src/ai-model.d.ts'
      const absolutePath = resolve(tempRoot, sourcePath)
      const outputDir = resolve(tempRoot, 'generated/dts-class-model')
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** AI editable model base. */',
        'export abstract class SparkAIModel {',
        '  /** Converts model state to JSON. */',
        '  abstract toJson(): Record<string, unknown>',
        '  /** Removes a model by module id. */',
        '  abstract remove(moduleId: string): boolean',
        '  /** Attaches another model. */',
        '  abstract attach(model: SparkAIModel): SparkAIModel',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const raw: unknown = JSON.parse(readFileSync(result.manifestPath, 'utf8'))
      const manifest = readDtsClassModelBundleManifest(raw)
      expect(manifest.schemaVersion).toBe(DTS_CLASS_MODEL_BUNDLE_VERSION)
      expect(manifest.protocol).toBe(DTS_CLASS_MODEL_BUNDLE_PROTOCOL)
      expect(Object.keys(manifest.classIndex)).toContain('SparkAIModel')
      expect(Object.keys(manifest.files)).toContain(sourcePath)
      expect(manifest.files[sourcePath]?.module).toMatchObject({
        name: '@spark-appworks/spark-utils:ai-model',
        sourceFile: 'packages/spark-utils/src/ai-model.ts',
        jsdocSource: 'inferred',
      })
      expect(manifest.files[sourcePath]?.module.symbols).toContain('SparkAIModel')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('parses a generated per-file projection shard', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-shard-${String(process.pid)}-${String(Date.now())}`)
    try {
      const sourcePath = 'class-model-emit/packages/spark-utils/src/ai-model.d.ts'
      const absolutePath = resolve(tempRoot, sourcePath)
      const outputDir = resolve(tempRoot, 'generated/dts-class-model')
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** AI editable model base. */',
        'export abstract class SparkAIModel {',
        '  /** Converts model state to JSON. */',
        '  abstract toJson(): Record<string, unknown>',
        '  /** Removes a model by module id. */',
        '  abstract remove(moduleId: string): boolean',
        '  /** Attaches another model. */',
        '  abstract attach(model: SparkAIModel): SparkAIModel',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const entry = result.manifest.files[sourcePath]
      if (entry === undefined) throw new Error(`Missing test shard entry: ${sourcePath}`)
      const raw: unknown = JSON.parse(readFileSync(resolve(outputDir, entry.file), 'utf8'))
      const projection = readDtsFileProjectionDocument(raw)
      const rawRecord = raw as {
        models?: Record<string, {
          methods?: Array<Record<string, unknown>>
        }>
      }
      expect(projection.schemaVersion).toBe(DTS_FILE_PROJECTION_VERSION)
      expect(projection.module).toMatchObject({
        name: '@spark-appworks/spark-utils:ai-model',
        sourceFile: 'packages/spark-utils/src/ai-model.ts',
        modulePath: 'ai-model',
        jsdocSource: 'inferred',
      })
      expect(projection.symbols).toContain('SparkAIModel')
      expect(projection.$defs?.['SparkAIModel']).toMatchObject({
        type: 'object',
        title: 'SparkAIModel',
      })
      expect(Object.keys(projection.models)).toContain('SparkAIModel')
      const removeMethod = projection.models['SparkAIModel']?.methods.find(method => method.name === 'remove')
      const rawRemoveMethod = rawRecord.models?.['SparkAIModel']?.methods
        ?.find(method => method['name'] === 'remove')
      expect(Object.keys(rawRemoveMethod ?? {})).toEqual([
        'name',
        'jsdoc',
        'parameterStyle',
        'parameters',
        'type',
        'paramsSchema',
        'returnSchema',
      ])
      expect(rawRemoveMethod).not.toHaveProperty(removedReturnTypeField)
      expect(rawRemoveMethod).not.toHaveProperty('signatureText')
      expect(removeMethod?.signatureText).toContain('remove(moduleId: string): boolean')
      expect(removeMethod?.parameterStyle).toBe('positional')
      expect(removeMethod?.parameters).toEqual([{
        name: 'moduleId',
        type: { type: 'intrinsic', name: 'string' },
      }])
      expect(removeMethod?.type).toEqual({ type: 'intrinsic', name: 'boolean' })
      expect(removeMethod).not.toHaveProperty(removedReturnTypeField)
      expect(removeMethod).not.toHaveProperty(removedReturnTypeRefsField)
      expect(removeMethod).not.toHaveProperty(removedReturnTextField)
      expect(removeMethod?.paramsSchema).toMatchObject({
        type: 'object',
        properties: {
          moduleId: { type: 'string' },
        },
      })
      expect(removeMethod?.returnSchema).toEqual({ type: 'boolean' })
      expect(removeMethod).not.toHaveProperty(removedParamsTextField)
      expect(removeMethod).not.toHaveProperty('provenance')
      const attachMethod = projection.models['SparkAIModel']?.methods.find(method => method.name === 'attach')
      expect(attachMethod?.signatureText).toContain('attach(model: SparkAIModel): SparkAIModel')
      expect(attachMethod?.parameterStyle).toBe('positional')
      expect(attachMethod?.parameters).toEqual([{
        name: 'model',
        type: {
          type: 'reference',
          name: 'SparkAIModel',
          sourcePath,
        },
      }])
      expect(attachMethod).not.toHaveProperty(removedReturnTextField)
      expect(attachMethod?.type).toEqual({
        type: 'reference',
        name: 'SparkAIModel',
        sourcePath,
      })
      expect(attachMethod).not.toHaveProperty(removedReturnTypeField)
      expect(attachMethod).not.toHaveProperty(removedReturnTypeRefsField)
      expect(attachMethod?.paramsSchema).toMatchObject({
        type: 'object',
        properties: {
          model: { $ref: '#/$defs/SparkAIModel' },
        },
      })
      expect(attachMethod?.returnSchema).toEqual({ $ref: '#/$defs/SparkAIModel' })
      expect(attachMethod).not.toHaveProperty(removedParamsTextField)
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('classifies spark component declarations from dts paths', () => {
    const cases = [
      {
        sourcePath: 'class-model-emit/packages/spark-component/src/components/containers/data-views/RendererTable/RendererTable.props.d.ts',
        declaration: 'export type RTableProps = { dataViewKey?: string }',
        className: 'RTableProps',
        expected: {
          componentName: 'RendererTable',
          componentType: 'r-table',
          componentLevel: 'table-level',
          componentLayer: 'data-view-container',
          componentDirectory: 'containers/data-views',
        },
      },
      {
        sourcePath: 'class-model-emit/packages/spark-component/src/components/containers/layout/RendererSection/RendererSection.props.d.ts',
        declaration: 'export type RSectionProps = { title?: string }',
        className: 'RSectionProps',
        expected: {
          componentName: 'RendererSection',
          componentType: 'r-section',
          componentLevel: 'container',
          componentLayer: 'layout-container',
          componentDirectory: 'containers/layout',
        },
      },
      {
        sourcePath: 'class-model-emit/packages/spark-component/src/components/fields/data-components/FieldText.props.d.ts',
        declaration: 'export type RTextProps = { field?: string }',
        className: 'RTextProps',
        expected: {
          componentName: 'FieldText',
          componentType: 'r-text',
          componentLevel: 'field-level',
          componentLayer: 'data-field',
          componentDirectory: 'fields/data-components',
        },
      },
    ]
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-${String(process.pid)}-${String(Date.now())}`)
    try {
      for (const item of cases) {
        const absolutePath = resolve(tempRoot, item.sourcePath)
        mkdirSync(dirname(absolutePath), { recursive: true })
        writeFileSync(absolutePath, `${item.declaration}\n`, 'utf8')
        const projection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath })
        expect(projection.models[item.className]?.provenance).toMatchObject(item.expected)
        expect(projection.module).toMatchObject(item.expected)
        expect(projection.module.jsdoc).toContain(String(item.expected.componentLayer))
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('captures module-level leading jsdoc before imports', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-module-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-project-model/src/project/project-workspace.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/**',
        ' * ProjectWorkspace module boundary.',
        ' * Owns project editing IO and delegates state to ProjectModel.',
        ' */',
        "import type { HttpClientBase } from '@spark-appworks/spark-utils'",
        '/** Workspace options. */',
        'export type ProjectWorkspaceOptions = { http: HttpClientBase }',
      ].join('\n'), 'utf8')

      const projection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath })
      expect(projection.module).toMatchObject({
        name: '@spark-appworks/spark-project-model:project/project-workspace',
        sourceFile: 'packages/spark-project-model/src/project/project-workspace.ts',
        modulePath: 'project/project-workspace',
        jsdocSource: 'leading-jsdoc',
      })
      expect(projection.module.jsdoc).toContain('ProjectWorkspace module boundary')
      expect(projection.models['ProjectWorkspaceOptions']?.jsdoc).toContain('Workspace options')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('normalizes class member jsdoc without raw comment delimiters', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-member-jsdoc-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/demo-registry.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** Registry model used by the host. */',
        'export class DemoRegistry {',
        '  /**',
        '   * Registers a business entry.',
        '   *',
        '   * @param moduleId stable business module id.',
        '   * @returns true when the entry is accepted.',
        '   */',
        '  register(moduleId: string): boolean',
        '}',
      ].join('\n'), 'utf8')

      const projection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath })
      const model = projection.models['DemoRegistry']
      const method = model?.methods.find(item => item.name === 'register')

      expect(model?.jsdoc).toBe('Registry model used by the host.')
      expect(method?.jsdoc).toContain('Registers a business entry.')
      expect(method?.jsdoc).toContain('@param moduleId')
      expect(method?.jsdoc).toContain('@returns true when the entry is accepted.')
      expect(method?.jsdoc).not.toContain('/**')
      expect(method?.jsdoc).not.toContain('*/')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('captures module-level source file comments when dts cannot carry them', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-source-module-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-component/src/components/containers/layout/RendererButton.vue.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const vueSourcePath = resolve(tempRoot, 'packages/spark-component/src/components/containers/layout/RendererButton.vue')
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      mkdirSync(dirname(vueSourcePath), { recursive: true })
      writeFileSync(vueSourcePath, [
        '<!--',
        '@module RendererButton',
        'RendererButton 模块封装按钮容器的显示、动作触发和禁用态语义。',
        '-->',
        '<template><button /></template>',
      ].join('\n'), 'utf8')
      writeFileSync(absolutePath, [
        '/** Button props. */',
        'export type RButtonProps = { text?: string }',
      ].join('\n'), 'utf8')

      const projection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath })
      expect(projection.module).toMatchObject({
        sourceFile: 'packages/spark-component/src/components/containers/layout/RendererButton.vue',
        jsdocSource: 'source-file-jsdoc',
        componentName: 'RendererButton',
      })
      expect(projection.module.jsdoc).toContain('按钮容器')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('preserves raw declaration relations from dts syntax', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-relations-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-component/src/components/fields/data-components/FieldText.props.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        'export type SparkNodeProps = { id?: string }',
        'export type SparkFieldSemanticProps<T> = { value?: T }',
        'export interface RBaseProps { base?: string }',
        'export interface RDerivedProps extends RBaseProps { label?: string }',
        'export type RTextProps = SparkNodeProps & SparkFieldSemanticProps<string>',
      ].join('\n'), 'utf8')

      const projection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath })
      expect(projection.models['RDerivedProps']?.declarationRelations).toEqual([
        {
          kind: 'extends',
          typeText: 'RBaseProps',
          targetName: 'RBaseProps',
        },
      ])
      expect(projection.models['RTextProps']?.declarationTypeText)
        .toBe('SparkNodeProps & SparkFieldSemanticProps<string>')
      expect(projection.models['RTextProps']?.declarationRelations).toEqual([
        {
          kind: 'intersection',
          typeText: 'SparkNodeProps',
          targetName: 'SparkNodeProps',
        },
        {
          kind: 'intersection',
          typeText: 'SparkFieldSemanticProps<string>',
          targetName: 'SparkFieldSemanticProps',
        },
      ])
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('resolves cross-file dts refs through the bundle loader', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-cross-ref-${String(process.pid)}-${String(Date.now())}`)
    const registrationSourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/registration-types.d.ts'
    const registrySourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/business-registry.d.ts'
    const registrationPath = resolve(tempRoot, registrationSourcePath)
    const registryPath = resolve(tempRoot, registrySourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(registrationPath), { recursive: true })
      writeFileSync(registrationPath, [
        '/** Business registration passed into the host registry. */',
        'export type AiAgentRegistration<TInput = unknown> = {',
        '  /** Stable business module id. */',
        '  moduleId: string',
        '  /** Business input contract carried by the registration. */',
        '  input?: TInput',
        '}',
      ].join('\n'), 'utf8')
      writeFileSync(registryPath, [
        "import type { AiAgentRegistration } from './registration-types'",
        '/** Host registry for AI business registrations. */',
        'export class AiAgentRegistry<TInput = unknown> {',
        '  /** Stores a registration for later session resolution. */',
        '  register(registration: AiAgentRegistration<TInput>): void',
        '  /** Resolves a registration by module id. */',
        '  get(moduleId: string): AiAgentRegistration<TInput>',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [registrationPath, registryPath],
        outputDir,
      })
      const registryEntry = result.manifest.files[registrySourcePath]
      if (registryEntry === undefined) throw new Error(`Missing registry shard entry: ${registrySourcePath}`)
      const registryProjection = readDtsFileProjectionDocument(
        JSON.parse(readFileSync(resolve(outputDir, registryEntry.file), 'utf8')) as unknown,
      )
      const registerMethod = registryProjection.models['AiAgentRegistry']?.methods.find(method => method.name === 'register')

      expect(registerMethod?.signatureText).toBe('register(registration: AiAgentRegistration<TInput>): void')
      expect(registerMethod?.parameterStyle).toBe('positional')
      expect(registerMethod?.parameters).toEqual([{
        name: 'registration',
        type: {
          type: 'reference',
          name: 'AiAgentRegistration',
          sourcePath: registrationSourcePath,
          typeArguments: [{
            type: 'reference',
            name: 'TInput',
            refersToTypeParameter: true,
          }],
        },
      }])
      expect(registerMethod).not.toHaveProperty(removedReturnTextField)
      expect(registerMethod?.type).toEqual({ type: 'intrinsic', name: 'void' })
      expect(registerMethod).not.toHaveProperty(removedReturnTypeField)
      expect(registerMethod).not.toHaveProperty(removedReturnTypeRefsField)
      expect(registerMethod?.paramsSchema).toMatchObject({
        type: 'object',
        properties: {
          registration: {
            $ref: 'registration-types.d.ts.json#/$defs/AiAgentRegistration',
            title: 'AiAgentRegistration<TInput>',
          },
        },
      })
      expect(registerMethod?.returnSchema).toBe(true)

      const runtimeManifest = readDtsClassModelRuntimeManifest(
        JSON.parse(readFileSync(result.runtimeManifestPath, 'utf8')) as unknown,
      )
      expect(runtimeManifest.schemaVersion).toBe(DTS_CLASS_MODEL_RUNTIME_VERSION)
      expect(runtimeManifest.protocol).toBe(DTS_CLASS_MODEL_RUNTIME_PROTOCOL)
      expect(runtimeManifest.classIndex['AiAgentRegistry']).toMatchObject({
        file: registryEntry.file,
        modelRef: 'spark-class-model://model/AiAgentRegistry',
        schemaRef: 'spark-class-model://schema/AiAgentRegistry',
      })
      const runtimeRegistryEntry = runtimeManifest.classIndex['AiAgentRegistry']
      if (runtimeRegistryEntry === undefined) throw new Error('Missing runtime registry entry.')
      const runtimeRegistryShard = readDtsClassModelRuntimeShard(
        JSON.parse(readFileSync(resolve(dirname(result.runtimeManifestPath), runtimeRegistryEntry.file), 'utf8')) as unknown,
      )
      const runtimeRegistry = runtimeRegistryShard['@refs'][runtimeRegistryEntry.modelRef]
      if (runtimeRegistry?.kind !== 'model') throw new Error('Missing runtime registry model.')
      const runtimeRegisterMethod = runtimeRegistry.methodRefs
        .map(ref => runtimeRegistryShard['@refs'][ref])
        .find(method => method?.kind === 'method' && method.name === 'register')
      if (runtimeRegisterMethod?.kind !== 'method') throw new Error('Missing runtime register method.')

      const runtimeLoader = new DtsClassModelRuntimeLoader({
        manifestUrl: pathToFileURL(result.runtimeManifestPath).href,
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      const runtimeRegisterParams = await runtimeLoader.ensureRef(runtimeRegisterMethod.paramsSchemaRef)
      if (runtimeRegisterParams?.kind !== 'schema') throw new Error('Missing runtime register params schema.')
      expect(runtimeRegisterMethod.paramsSchemaRef).toMatch(/^spark-class-model:\/\/schema\/shared\//)
      expect(runtimeRegisterParams.schema).toMatchObject({
        $id: runtimeRegisterMethod.paramsSchemaRef,
        type: 'object',
        additionalProperties: false,
        properties: {
          registration: {
            $ref: 'spark-class-model://schema/AiAgentRegistration',
          },
        },
      })
      const runtimeRegisterSchemaClosure = await runtimeLoader.ensureSchemaClosure(runtimeRegisterMethod.paramsSchemaRef)
      const runtimeRegisterSchemaClosureRefs = runtimeRegisterSchemaClosure.schemas.map(schema => schema.ref)
      expect(runtimeRegisterSchemaClosure.rootRef).toBe(runtimeRegisterMethod.paramsSchemaRef)
      expect(runtimeRegisterSchemaClosureRefs).toContain('spark-class-model://schema/AiAgentRegistration')
      expect(runtimeRegisterSchemaClosureRefs.at(-1)).toBe(runtimeRegisterMethod.paramsSchemaRef)
      expect(runtimeRegisterSchemaClosure.schemaByRef[runtimeRegisterMethod.paramsSchemaRef]?.kind).toBe('schema')
      const runtimeRegisterContract = await runtimeLoader.ensureMethodContract({
        className: 'AiAgentRegistry',
        methodName: 'register',
      })
      expect(runtimeRegisterContract.method.ref).toBe(runtimeRegisterMethod.ref)
      expect(runtimeRegisterContract.paramsSchema.ref).toBe(runtimeRegisterMethod.paramsSchemaRef)
      expect(runtimeRegisterContract.paramsSchemaClosure.rootRef).toBe(runtimeRegisterMethod.paramsSchemaRef)
      expect(runtimeRegisterContract.parameterLinks.map(link => link.targetClassName)).toEqual(['AiAgentRegistration'])
      expect(runtimeRegisterContract.returnLinks).toEqual([])
      expect(runtimeRegisterContract.targetModels.map(model => model.className)).toEqual(['AiAgentRegistration'])

      const runtimeGetContract = await runtimeLoader.ensureMethodContract({
        className: 'AiAgentRegistry',
        methodName: 'get',
      })
      expect(runtimeGetContract.parameterLinks).toEqual([])
      expect(runtimeGetContract.returnLinks.map(link => link.targetClassName)).toEqual(['AiAgentRegistration'])
      expect(runtimeGetContract.returnSchema?.schema).toMatchObject({
        $id: runtimeGetContract.method.returnSchemaRef,
        $ref: 'spark-class-model://schema/AiAgentRegistration',
      })
      expect(runtimeGetContract.returnSchemaClosure?.schemas.map(schema => schema.ref)).toContain(
        'spark-class-model://schema/AiAgentRegistration',
      )
      expect(runtimeRegisterMethod).not.toHaveProperty('signatureText')
      const runtimeLinks = runtimeRegistry.linkRefs.map(ref => runtimeRegistryShard['@refs'][ref])
      expect(runtimeLinks).toContainEqual({
        ref: expect.stringContaining('spark-class-model://link/'),
        kind: 'link',
        fromRef: runtimeRegisterMethod.ref,
        relation: 'method-parameter',
        targetModelRef: 'spark-class-model://model/AiAgentRegistration',
        targetClassName: 'AiAgentRegistration',
        targetFile: result.manifest.files[registrationSourcePath]?.file,
        targetSchemaRef: 'spark-class-model://schema/AiAgentRegistration',
      })

      const runtimeRegistrationSchema = await runtimeLoader.ensureRef('spark-class-model://schema/AiAgentRegistration')
      const runtimeReachable = await runtimeLoader.ensureReachableClosure('AiAgentRegistry')

      expect(runtimeRegistrationSchema).toMatchObject({
        kind: 'schema',
        ref: 'spark-class-model://schema/AiAgentRegistration',
      })
      expect(runtimeReachable).toEqual(['AiAgentRegistry', 'AiAgentRegistration'])
      expect(runtimeLoader.buildLoadedModels()).toMatchObject({
        AiAgentRegistry: { className: 'AiAgentRegistry' },
        AiAgentRegistration: { className: 'AiAgentRegistration' },
      })

      const loader = new DtsClassModelBundleLoader({
        manifestUrl: pathToFileURL(result.manifestPath).href,
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      const reachable = await loader.ensureReachableClosure('AiAgentRegistry')
      const surface = loader.buildLoadedSurface()

      expect(reachable).toContain('AiAgentRegistry')
      expect(reachable).toContain('AiAgentRegistration')
      expect(Object.keys(surface.models)).toEqual(expect.arrayContaining([
        'AiAgentRegistry',
        'AiAgentRegistration',
      ]))
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('pools identical runtime schemas by normalized type shape', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-runtime-pool-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/duplicate-input-registry.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** Registry used to verify runtime schema pooling. */',
        'export class DuplicateInputRegistry {',
        '  /** Stores the first duplicated input shape. */',
        '  first(input: string): void',
        '  /** Stores the second duplicated input shape. */',
        '  second(input: string): void',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const runtimeManifest = readDtsClassModelRuntimeManifest(
        JSON.parse(readFileSync(result.runtimeManifestPath, 'utf8')) as unknown,
      )
      const runtimeEntry = runtimeManifest.classIndex['DuplicateInputRegistry']
      if (runtimeEntry === undefined) throw new Error('Missing runtime DuplicateInputRegistry entry.')
      const runtimeShard = readDtsClassModelRuntimeShard(
        JSON.parse(readFileSync(resolve(dirname(result.runtimeManifestPath), runtimeEntry.file), 'utf8')) as unknown,
      )
      const runtimeModel = runtimeShard['@refs'][runtimeEntry.modelRef]
      if (runtimeModel?.kind !== 'model') throw new Error('Missing runtime DuplicateInputRegistry model.')
      const firstMethod = runtimeModel.methodRefs
        .map(ref => runtimeShard['@refs'][ref])
        .find(method => method?.kind === 'method' && method.name === 'first')
      const secondMethod = runtimeModel.methodRefs
        .map(ref => runtimeShard['@refs'][ref])
        .find(method => method?.kind === 'method' && method.name === 'second')
      if (firstMethod?.kind !== 'method') throw new Error('Missing runtime first method.')
      if (secondMethod?.kind !== 'method') throw new Error('Missing runtime second method.')

      expect(firstMethod.paramsSchemaRef).toBe(secondMethod.paramsSchemaRef)
      expect(firstMethod.paramsSchemaRef).toMatch(/^spark-class-model:\/\/schema\/shared\//)

      const runtimeLoader = new DtsClassModelRuntimeLoader({
        manifestUrl: pathToFileURL(result.runtimeManifestPath).href,
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      const paramsSchema = await runtimeLoader.ensureRef(firstMethod.paramsSchemaRef)
      if (paramsSchema.kind !== 'schema') throw new Error('Missing pooled params schema.')
      expect(paramsSchema.schema).toMatchObject({
        $id: firstMethod.paramsSchemaRef,
        type: 'object',
        additionalProperties: false,
        properties: {
          input: { type: 'string' },
        },
      })
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('extracts constructors into runtime refs and knowledge surface', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-constructor-${String(process.pid)}-${String(Date.now())}`)
    const optionsSourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/widget-options.d.ts'
    const widgetSourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/widget.d.ts'
    const optionsPath = resolve(tempRoot, optionsSourcePath)
    const widgetPath = resolve(tempRoot, widgetSourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(optionsPath), { recursive: true })
      writeFileSync(optionsPath, [
        '/** Options used to create a widget. */',
        'export type WidgetOptions = {',
        '  /** Stable widget id. */',
        '  id: string',
        '}',
      ].join('\n'), 'utf8')
      writeFileSync(widgetPath, [
        "import type { WidgetOptions } from './widget-options'",
        '/** Runtime widget created from typed options. */',
        'export class Widget {',
        '  /** Creates a widget from typed options. */',
        '  constructor(options: WidgetOptions, label?: string)',
        '  /** Stable widget id. */',
        '  readonly id: string',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [optionsPath, widgetPath],
        outputDir,
      })
      const widgetEntry = result.manifest.files[widgetSourcePath]
      if (widgetEntry === undefined) throw new Error(`Missing widget shard entry: ${widgetSourcePath}`)
      const widgetProjection = readDtsFileProjectionDocument(
        JSON.parse(readFileSync(resolve(outputDir, widgetEntry.file), 'utf8')) as unknown,
      )
      const widgetModel = widgetProjection.models['Widget']
      if (widgetModel === undefined) throw new Error('Missing Widget model.')
      expect(widgetModel.constructorMeta?.signatureText).toContain('constructor(options: WidgetOptions, label?: string)')
      expect(widgetModel.constructorMeta?.parameters?.map(parameter => parameter.name)).toEqual(['options', 'label'])

      const runtimeManifest = readDtsClassModelRuntimeManifest(
        JSON.parse(readFileSync(result.runtimeManifestPath, 'utf8')) as unknown,
      )
      const runtimeWidgetEntry = runtimeManifest.classIndex['Widget']
      if (runtimeWidgetEntry === undefined) throw new Error('Missing runtime Widget entry.')
      const runtimeWidgetShard = readDtsClassModelRuntimeShard(
        JSON.parse(readFileSync(resolve(dirname(result.runtimeManifestPath), runtimeWidgetEntry.file), 'utf8')) as unknown,
      )
      const runtimeWidget = runtimeWidgetShard['@refs'][runtimeWidgetEntry.modelRef]
      if (runtimeWidget?.kind !== 'model') throw new Error('Missing runtime Widget model.')
      expect(runtimeWidget.constructorRef).toMatch(/^spark-class-model:\/\/model\/Widget\/constructors\/0$/)
      const runtimeConstructor = runtimeWidgetShard['@refs'][runtimeWidget.constructorRef ?? '']
      if (runtimeConstructor?.kind !== 'constructor') throw new Error('Missing runtime Widget constructor.')
      expect(runtimeConstructor.paramsSchemaRef).toMatch(/^spark-class-model:\/\/schema\/shared\//)

      const runtimeLoader = new DtsClassModelRuntimeLoader({
        manifestUrl: pathToFileURL(result.runtimeManifestPath).href,
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      const constructorContract = await runtimeLoader.ensureConstructorContract({ className: 'Widget' })
      expect(constructorContract.constructor.ref).toBe(runtimeConstructor.ref)
      expect(constructorContract.parameterLinks.map(link => link.targetClassName)).toEqual(['WidgetOptions'])
      expect(constructorContract.paramsSchemaClosure.schemas.map(schema => schema.ref)).toContain(
        'spark-class-model://schema/WidgetOptions',
      )
      expect(constructorContract.targetModels.map(model => model.className)).toEqual(['WidgetOptions'])

      const provider = createDtsBundleClassModelKnowledgeProvider({
        dtsClassModelManifestUrl: pathToFileURL(result.manifestPath).href,
        rootClassName: 'Widget',
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      await provider.init()
      const query = await provider.query({ includeMembers: true })
      const payload = query as {
        models?: Array<{
          kind?: string
          constructorSignature?: { signature?: string }
        }>
      }
      const queryWidget = payload.models?.find(item => item.kind === 'Widget')
      expect(queryWidget?.constructorSignature?.signature).toContain('constructor(options: WidgetOptions, label?: string)')
      expect(payload.models?.map(model => model.kind)).toContain('WidgetOptions')
      await expect(provider.modelGuide({ kind: 'Widget' })).resolves.toContain(
        'constructor(options: WidgetOptions, label?: string)',
      )
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('projects readonly business factory commands with create return links', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-business-factory-${String(process.pid)}-${String(Date.now())}`)
    const registrationSourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/registration-types.d.ts'
    const hostSourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/ai-host.d.ts'
    const registrationPath = resolve(tempRoot, registrationSourcePath)
    const hostPath = resolve(tempRoot, hostSourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(registrationPath), { recursive: true })
      writeFileSync(registrationPath, [
        '/** Business registration created by a host factory. */',
        'export type AiAgentRegistration = {',
        '  /** Unique business module id. */',
        '  moduleId: string',
        '}',
      ].join('\n'), 'utf8')
      writeFileSync(hostPath, [
        "import type { AiAgentRegistration } from './registration-types'",
        '/** ensure 命令：延迟创建 registration 的工厂指令。 */',
        'export type AiAgentHostEnsureCommand = Readonly<{',
        '  /** Expected module id. */',
        '  moduleId: string',
        '  /** Factory that creates the business registration. */',
        '  create: () => AiAgentRegistration',
        '}>',
        '/** Host that accepts business factories. */',
        'export class AiAgentHost {',
        '  /** Ensures a business registration exists. */',
        '  ensure(alias: string, command: AiAgentHostEnsureCommand): AiAgentHost',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [registrationPath, hostPath],
        outputDir,
      })
      const hostEntry = result.manifest.files[hostSourcePath]
      if (hostEntry === undefined) throw new Error(`Missing host shard entry: ${hostSourcePath}`)
      const hostProjection = readDtsFileProjectionDocument(
        JSON.parse(readFileSync(resolve(outputDir, hostEntry.file), 'utf8')) as unknown,
      )
      const commandModel = hostProjection.models['AiAgentHostEnsureCommand']
      if (commandModel === undefined) throw new Error('Missing AiAgentHostEnsureCommand model.')
      expect(commandModel.attributes.map(attribute => attribute.name)).toEqual(['moduleId'])
      expect(commandModel.methods.map(method => method.name)).toEqual(['create'])

      const runtimeLoader = new DtsClassModelRuntimeLoader({
        manifestUrl: pathToFileURL(result.runtimeManifestPath).href,
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      const ensureContract = await runtimeLoader.ensureMethodContract({
        className: 'AiAgentHost',
        methodName: 'ensure',
      })
      expect(ensureContract.parameterLinks.map(link => link.targetClassName)).toEqual(['AiAgentHostEnsureCommand'])
      expect(ensureContract.returnLinks.map(link => link.targetClassName)).toEqual(['AiAgentHost'])
      expect(ensureContract.paramsSchemaClosure.schemas.map(schema => schema.ref)).toContain(
        'spark-class-model://schema/AiAgentHostEnsureCommand',
      )

      const moduleIdContract = await runtimeLoader.ensureAttributeContract({
        className: 'AiAgentHostEnsureCommand',
        attributeName: 'moduleId',
      })
      expect(moduleIdContract.valueSchema.schema).toMatchObject({
        type: 'string',
      })

      const createContract = await runtimeLoader.ensureMethodContract({
        className: 'AiAgentHostEnsureCommand',
        methodName: 'create',
      })
      expect(createContract.parameterLinks).toEqual([])
      expect(createContract.returnLinks.map(link => link.targetClassName)).toEqual(['AiAgentRegistration'])
      expect(createContract.returnSchemaClosure?.schemas.map(schema => schema.ref)).toContain(
        'spark-class-model://schema/AiAgentRegistration',
      )
      expect(createContract.targetModels.map(model => model.className)).toEqual(['AiAgentRegistration'])
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('creates a DTS bundle knowledge provider from manifest/root/fetchJson', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-knowledge-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/business-registry.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** Host registry for AI business registrations. */',
        'export class AiAgentRegistry {',
        '  /** Stable registry status. */',
        '  status: string',
        '  /** Stores a registration for later session resolution. */',
        '  register(moduleId: string): boolean',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const provider = createDtsBundleClassModelKnowledgeProvider({
        dtsClassModelManifestUrl: pathToFileURL(result.manifestPath).href,
        rootClassName: 'AiAgentRegistry',
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      await provider.init()

      const query = await provider.query({ keyword: 'registry', includeMembers: true })
      const payload = query as {
        rootKind?: string
        models?: Array<{
          kind?: string
          attributes?: Array<{ name?: string }>
          methods?: Array<{ name?: string }>
        }>
      }
      const model = payload.models?.find(item => item.kind === 'AiAgentRegistry')

      expect(payload.rootKind).toBe('AiAgentRegistry')
      expect(model?.attributes?.map(attribute => attribute.name)).toContain('status')
      expect(model?.methods?.map(method => method.name)).toContain('register')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('reloads DTS bundle knowledge after host refresh rebuilds the bundle', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-refresh-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-ai/src/refresh/refresh-model.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** Refreshable model v1. */',
        'export class RefreshModel {',
        '  /** Reads old knowledge. */',
        '  readOld(): string',
        '}',
      ].join('\n'), 'utf8')

      const first = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const provider = createDtsBundleClassModelKnowledgeProvider({
        dtsClassModelManifestUrl: pathToFileURL(first.manifestPath).href,
        rootClassName: 'RefreshModel',
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
        refreshBundle: async () => {
          writeFileSync(absolutePath, [
            '/** Refreshable model v2. */',
            'export class RefreshModel {',
            '  /** Reads new knowledge. */',
            '  readNew(): string',
            '}',
          ].join('\n'), 'utf8')
          buildDtsClassModelBundle({
            repoRoot: tempRoot,
            rootFiles: [absolutePath],
            outputDir,
          })
        },
      })
      await provider.init()

      const before = await provider.query({ kind: 'RefreshModel', includeMembers: true })
      expect(JSON.stringify(before)).toContain('readOld')

      await provider.refresh('RefreshModel')
      const after = await provider.query({ kind: 'RefreshModel', includeMembers: true })
      expect(JSON.stringify(after)).toContain('readNew')
      expect(JSON.stringify(after)).not.toContain('readOld')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('resolves recursive dts ref closures without looping', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-recursive-ref-${String(process.pid)}-${String(Date.now())}`)
    const nodeSourcePath = 'class-model-emit/packages/spark-data/src/node-tree/tree-node.d.ts'
    const edgeSourcePath = 'class-model-emit/packages/spark-data/src/node-tree/tree-edge.d.ts'
    const nodePath = resolve(tempRoot, nodeSourcePath)
    const edgePath = resolve(tempRoot, edgeSourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(nodePath), { recursive: true })
      writeFileSync(nodePath, [
        "import type { TreeEdge } from './tree-edge'",
        '/** Tree node whose children are expressed through recursive edges. */',
        'export type TreeNode = {',
        '  /** Stable node id. */',
        '  id: string',
        '  /** Edges from this node to child nodes. */',
        '  edges: TreeEdge[]',
        '}',
      ].join('\n'), 'utf8')
      writeFileSync(edgePath, [
        "import type { TreeNode } from './tree-node'",
        '/** Directed edge that points back to a tree node. */',
        'export type TreeEdge = {',
        '  /** Edge label shown to users. */',
        '  label: string',
        '  /** Child node reached by this edge. */',
        '  child: TreeNode',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [nodePath, edgePath],
        outputDir,
      })
      const nodeEntry = result.manifest.files[nodeSourcePath]
      const edgeEntry = result.manifest.files[edgeSourcePath]
      if (nodeEntry === undefined) throw new Error(`Missing node shard entry: ${nodeSourcePath}`)
      if (edgeEntry === undefined) throw new Error(`Missing edge shard entry: ${edgeSourcePath}`)
      const nodeProjection = readDtsFileProjectionDocument(
        JSON.parse(readFileSync(resolve(outputDir, nodeEntry.file), 'utf8')) as unknown,
      )
      const edgeProjection = readDtsFileProjectionDocument(
        JSON.parse(readFileSync(resolve(outputDir, edgeEntry.file), 'utf8')) as unknown,
      )
      const nodeDef = nodeProjection.$defs?.['TreeNode']
      const edgeDef = edgeProjection.$defs?.['TreeEdge']
      if (nodeDef === undefined) throw new Error('Missing TreeNode schema def.')
      if (edgeDef === undefined) throw new Error('Missing TreeEdge schema def.')

      expect(nodeDef.properties?.['edges']).toEqual({
        type: 'array',
        items: {
          $ref: 'tree-edge.d.ts.json#/$defs/TreeEdge',
        },
      })
      expect(edgeDef.properties?.['child']).toEqual({
        $ref: 'tree-node.d.ts.json#/$defs/TreeNode',
      })

      const runtimeManifest = readDtsClassModelRuntimeManifest(
        JSON.parse(readFileSync(result.runtimeManifestPath, 'utf8')) as unknown,
      )
      const runtimeNodeEntry = runtimeManifest.classIndex['TreeNode']
      if (runtimeNodeEntry === undefined) throw new Error('Missing runtime TreeNode entry.')
      const runtimeNodeShard = readDtsClassModelRuntimeShard(
        JSON.parse(readFileSync(resolve(dirname(result.runtimeManifestPath), runtimeNodeEntry.file), 'utf8')) as unknown,
      )
      const runtimeTreeNode = runtimeNodeShard['@refs'][runtimeNodeEntry.modelRef]
      if (runtimeTreeNode?.kind !== 'model') throw new Error('Missing runtime TreeNode model.')
      const runtimeEdgesAttribute = runtimeTreeNode.attributeRefs
        .map(ref => runtimeNodeShard['@refs'][ref])
        .find(attribute => attribute?.kind === 'attribute' && attribute.name === 'edges')
      if (runtimeEdgesAttribute?.kind !== 'attribute') throw new Error('Missing runtime TreeNode.edges attribute.')

      const runtimeLoader = new DtsClassModelRuntimeLoader({
        manifestUrl: pathToFileURL(result.runtimeManifestPath).href,
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      const runtimeEdgesSchema = await runtimeLoader.ensureRef(runtimeEdgesAttribute.schemaRef)
      if (runtimeEdgesSchema?.kind !== 'schema') throw new Error('Missing runtime TreeNode.edges schema.')
      expect(runtimeEdgesAttribute.schemaRef).toMatch(/^spark-class-model:\/\/schema\/shared\//)
      expect(runtimeEdgesSchema.schema).toEqual({
        $id: runtimeEdgesAttribute.schemaRef,
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'array',
        items: {
          $ref: 'spark-class-model://schema/TreeEdge',
        },
      })
      const runtimeEdgesSchemaClosure = await runtimeLoader.ensureSchemaClosure(runtimeEdgesAttribute.schemaRef)
      const runtimeEdgesSchemaClosureRefs = runtimeEdgesSchemaClosure.schemas.map(schema => schema.ref)
      expect(runtimeEdgesSchemaClosure.rootRef).toBe(runtimeEdgesAttribute.schemaRef)
      expect(runtimeEdgesSchemaClosureRefs).toContain('spark-class-model://schema/TreeEdge')
      expect(runtimeEdgesSchemaClosureRefs).toContain('spark-class-model://schema/TreeNode')
      expect(runtimeEdgesSchemaClosureRefs.at(-1)).toBe(runtimeEdgesAttribute.schemaRef)
      const runtimeTreeNodeLinks = runtimeTreeNode.linkRefs.map(ref => runtimeNodeShard['@refs'][ref])
      expect(runtimeTreeNodeLinks).toContainEqual({
        ref: expect.stringContaining('spark-class-model://link/'),
        kind: 'link',
        fromRef: runtimeEdgesAttribute.ref,
        relation: 'attribute',
        targetModelRef: 'spark-class-model://model/TreeEdge',
        targetClassName: 'TreeEdge',
        targetFile: edgeEntry.file,
        targetSchemaRef: 'spark-class-model://schema/TreeEdge',
      })

      const loader = new DtsClassModelBundleLoader({
        manifestUrl: pathToFileURL(result.manifestPath).href,
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      const reachable = await loader.ensureReachableClosure('TreeNode')

      expect(reachable).toEqual(['TreeNode', 'TreeEdge'])
      expect(loader.buildLoadedSurface().models).toMatchObject({
        TreeNode: { className: 'TreeNode' },
        TreeEdge: { className: 'TreeEdge' },
      })
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('writes semantic gap logs for declarations missing jsdoc', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-log-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-component/src/components/fields/data-components/FieldText.props.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        'export type RTextProps = {',
        '  /** Bound data field name. */',
        '  field?: string',
        '  missingLabel?: string',
        '}',
        'export class DemoModel {',
        '  /** Display name. */',
        '  name: string',
        '  missingCount: number',
        '  /** Saves the current model. */',
        '  save(): void',
        '  reset(): void',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const report = JSON.parse(readFileSync(result.semanticLogJsonPath, 'utf8')) as {
        gapCount: number
        notes: string[]
        gaps: Array<{
          className: string
          kind: string
          memberName?: string
          reason: string
          chainBreak: string
          fixHint: string
          sourceFile: string
        }>
      }
      const logText = readFileSync(result.semanticLogPath, 'utf8')
      const gapIds = report.gaps.map(gap => `${gap.kind}:${gap.className}.${gap.memberName ?? '<model>'}`)

      expect(report.gapCount).toBe(result.semanticGapCount)
      expect(gapIds).toContain('model:RTextProps.<model>')
      expect(gapIds).toContain('attribute:RTextProps.missingLabel')
      expect(gapIds).toContain('model:DemoModel.<model>')
      expect(gapIds).toContain('attribute:DemoModel.missingCount')
      expect(gapIds).toContain('method:DemoModel.reset')
      expect(gapIds).not.toContain('attribute:RTextProps.field')
      expect(gapIds).not.toContain('attribute:DemoModel.name')
      expect(gapIds).not.toContain('method:DemoModel.save')
      expect(report.gaps.find(gap => gap.memberName === 'missingLabel')?.sourceFile)
        .toBe('packages/spark-component/src/components/fields/data-components/FieldText.props.ts')
      expect(report.notes.join('\n')).toContain('.d.ts')
      expect(report.gaps.find(gap => gap.memberName === 'missingLabel')).toMatchObject({
        reason: 'missing-jsdoc',
      })
      expect(report.gaps.find(gap => gap.memberName === 'missingLabel')?.chainBreak)
        .toContain('RTextProps.missingLabel')
      expect(report.gaps.find(gap => gap.memberName === 'missingLabel')?.fixHint)
        .toContain('FieldText.props.ts')
      expect(logText).toContain('[attribute] RTextProps.missingLabel')
      expect(logText).toContain('reason: missing-jsdoc')
      expect(logText).toContain('chainBreak:')
      expect(logText).toContain('component: type=r-text; name=FieldText; level=field-level')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects manifest with wrong protocol', () => {
    expect(() => readDtsClassModelBundleManifest({
      schemaVersion: DTS_CLASS_MODEL_BUNDLE_VERSION,
      protocol: 'unsupported-protocol',
      generatedAt: '2026-01-01T00:00:00.000Z',
      scannedFileCount: 0,
      files: {},
      classIndex: {},
    })).toThrow(/protocol/)
  })

  it('rejects projection missing required class model fields', () => {
    expect(() => readDtsFileProjectionDocument({
      schemaVersion: DTS_FILE_PROJECTION_VERSION,
      sourcePath: 'class-model-emit/x.d.ts',
      module: {
        name: 'workspace:x',
        sourcePath: 'class-model-emit/x.d.ts',
        sourceFile: 'x.ts',
        modulePath: 'x',
        jsdoc: 'Test module.',
        jsdocSource: 'leading-jsdoc',
        symbols: ['Broken'],
      },
      symbols: ['Broken'],
      models: {
        Broken: {
          kind: 'Broken',
        },
      },
    })).toThrow(/className/)
  })

  it('projects optional return types and reflection callback parameters (PR-2)', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-pr2-${String(process.pid)}-${String(Date.now())}`)
    const registrationSourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/registration-types.d.ts'
    const registrySourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/business-registry.d.ts'
    const toolSourcePath = 'class-model-emit/packages/spark-ai/src/tools/data-set-crud-tool.d.ts'
    const configPageSourcePath = 'class-model-emit/packages/spark-project-model/src/page/config-page.d.ts'
    const registrationPath = resolve(tempRoot, registrationSourcePath)
    const registryPath = resolve(tempRoot, registrySourcePath)
    const toolPath = resolve(tempRoot, toolSourcePath)
    const configPagePath = resolve(tempRoot, configPageSourcePath)
    try {
      mkdirSync(dirname(registrationPath), { recursive: true })
      mkdirSync(dirname(toolPath), { recursive: true })
      mkdirSync(dirname(configPagePath), { recursive: true })
      writeFileSync(registrationPath, [
        'export type AiAgentRegistration<TInput = unknown> = {',
        '  moduleId: string',
        '  input?: TInput',
        '}',
      ].join('\n'), 'utf8')
      writeFileSync(registryPath, [
        "import type { AiAgentRegistration } from './registration-types'",
        'export class AiAgentRegistry<TInput = unknown> {',
        '  get(moduleId: string): AiAgentRegistration<TInput> | undefined',
        '}',
      ].join('\n'), 'utf8')
      writeFileSync(toolPath, [
        'export class DataSetCrudTool {}',
      ].join('\n'), 'utf8')
      writeFileSync(configPagePath, [
        "import type { DataSetCrudTool } from '../../../spark-ai/src/tools/data-set-crud-tool'",
        'export class ConfigPage {',
        '  editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): void',
        '}',
      ].join('\n'), 'utf8')

      const registryProjection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath: registryPath })
      const configPageProjection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath: configPagePath })

      const getMethod = registryProjection.models['AiAgentRegistry']?.methods.find(method => method.name === 'get')
      expect(getMethod?.type).toEqual({
        type: 'optional',
        elementType: {
          type: 'reference',
          name: 'AiAgentRegistration',
          sourcePath: registrationSourcePath,
          typeArguments: [{
            type: 'reference',
            name: 'TInput',
            refersToTypeParameter: true,
          }],
        },
      })
      expect(getMethod).not.toHaveProperty(removedReturnTypeField)

      const editMethod = configPageProjection.models['ConfigPage']?.methods.find(method => method.name === 'editDataSet')
      expect(editMethod?.parameters?.[0]?.type).toEqual({
        type: 'reflection',
        declaration: {
          signatures: [{
            parameters: [{
              name: 'tool',
              type: {
                type: 'reference',
                name: 'DataSetCrudTool',
                sourcePath: toolSourcePath,
              },
            }],
            type: {
              type: 'union',
              types: [
                { type: 'intrinsic', name: 'void' },
                {
                  type: 'reference',
                  name: 'Promise',
                  typeArguments: [{ type: 'intrinsic', name: 'void' }],
                },
              ],
            },
          }],
        },
      })
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('follows reflection callback refs in bundle loader closure (PR-3)', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-pr3-${String(process.pid)}-${String(Date.now())}`)
    const toolSourcePath = 'class-model-emit/packages/spark-ai/src/tools/data-set-crud-tool.d.ts'
    const configPageSourcePath = 'class-model-emit/packages/spark-project-model/src/page/config-page.d.ts'
    const toolPath = resolve(tempRoot, toolSourcePath)
    const configPagePath = resolve(tempRoot, configPageSourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(toolPath), { recursive: true })
      mkdirSync(dirname(configPagePath), { recursive: true })
      writeFileSync(toolPath, [
        '/** Dataset CRUD tool passed into page mutators. */',
        'export class DataSetCrudTool {}',
      ].join('\n'), 'utf8')
      writeFileSync(configPagePath, [
        "import type { DataSetCrudTool } from '../../../spark-ai/src/tools/data-set-crud-tool'",
        'export class ConfigPage {',
        '  editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void>',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [toolPath, configPagePath],
        outputDir,
      })
      const loader = new DtsClassModelBundleLoader({
        manifestUrl: pathToFileURL(result.manifestPath).href,
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      const reachable = await loader.ensureReachableClosure('ConfigPage')

      expect(reachable).toContain('ConfigPage')
      expect(reachable).toContain('DataSetCrudTool')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
