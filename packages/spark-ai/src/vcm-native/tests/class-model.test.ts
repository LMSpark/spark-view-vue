import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  compareClassModelDocumentsForBuildConsistency,
  createClassModelDocumentFromRuntimeDocument,
  renderAttributeGuide,
  renderMethodGuide,
  renderMethodSignature,
  renderModelGuide,
  VCM_NATIVE_TOOL_NAMES,
  VcmNativeRuntime,
  createVcmNativeKnowledgeWorkerApi,
} from '../index'

const root = resolve(import.meta.dirname, '../../../../..')

describe('vcm-native ClassModel projection', () => {
  it('converts page-design runtime metadata into isolated ClassModel models', () => {
    const document = readRuntimeDocument()
    const classModel = createClassModelDocumentFromRuntimeDocument(document)
    const sourceApis = runtimeApisByKind(document)

    expect(Object.keys(classModel.models).sort()).toEqual([
      'config-page',
      'data-table',
      'data-view',
      'dataset',
      'node-tree',
      'project',
    ])
    for (const [kind, api] of sourceApis) {
      expect(classModel.models[kind]?.methods, kind).toHaveLength(api.actions.length)
    }
    expect(classModel.diagnostics).toEqual([])

    for (const model of Object.values(classModel.models)) {
      for (const attribute of model.attributes) {
        expect(attribute.jsdoc.trim(), `${model.kind}.${attribute.name}`).not.toHaveLength(0)
      }
      for (const method of model.methods) {
        expect(method.jsdoc.trim(), `${model.kind}.${method.name}`).not.toHaveLength(0)
      }
    }
    expect(classModel.models['data-table']?.constructor?.jsdoc).toContain('创建 DataTable 实例，并自动创建 `default` DataView。')
    expect(classModel.models['data-table']?.constructor?.jsdoc).toContain('@param tableName')
    expect(classModel.models['data-view']?.constructor?.jsdoc).toContain('创建数据视图实例。')
    expect(classModel.models['data-view']?.constructor?.jsdoc).toContain('@param viewId')
  })

  it('compares source and build-entry ClassModel documents for cross-build consistency', () => {
    const sourceDocument = createClassModelDocumentFromRuntimeDocument(readRuntimeDocument())
    const sameDocument = createClassModelDocumentFromRuntimeDocument(readRuntimeDocument())

    expect(compareClassModelDocumentsForBuildConsistency(sourceDocument, sameDocument)).toEqual([])

    const project = sameDocument.models['project']
    if (project === undefined) throw new Error('project ClassModel missing.')
    const staleBuildEntryDocument = {
      ...sameDocument,
      models: {
        ...sameDocument.models,
        project: {
          ...project,
          jsdoc: '/** stale d.ts summary */',
        },
      },
    }

    expect(compareClassModelDocumentsForBuildConsistency(sourceDocument, staleBuildEntryDocument)).toEqual([
      {
        code: 'CLASS_MODEL_BUILD_CONSISTENCY_MISMATCH',
        path: 'project.jsdoc',
        message: expect.stringContaining('stale d.ts summary'),
      },
    ])
  })

  it('derives return and callback signatures without legacy edge protocol fields', () => {
    const classModel = createClassModelDocumentFromRuntimeDocument(readRuntimeDocument())

    expect(renderMethodSignature(classModel, findMethod(classModel, 'project', 'openPageDesign')!)).toBe('openPageDesign(pageId: string): ConfigPageNode')
    expect(renderMethodSignature(classModel, findMethod(classModel, 'config-page', 'getNodeTree')!)).toBe('getNodeTree(): SparkNodeTree')
    expect(renderMethodSignature(classModel, findMethod(classModel, 'config-page', 'getDataSetTool')!)).toBe('getDataSetTool(): DataSetCrudTool')
    expect(renderMethodSignature(classModel, findMethod(classModel, 'config-page', 'editNodeTree')!)).toBe(
      'editNodeTree(run: (tree: SparkNodeTree) => void | Promise<void>): Promise<void>',
    )
    expect(renderMethodSignature(classModel, findMethod(classModel, 'config-page', 'editDataSet')!)).toBe(
      'editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void>',
    )
    expect(JSON.stringify(classModel)).not.toContain(['child', 'Models'].join(''))
  })

  it('renders method guides as d.ts-like declarations with JSDoc, not protocol fields', () => {
    const classModel = createClassModelDocumentFromRuntimeDocument(readRuntimeDocument())
    const guide = renderMethodGuide({
      document: classModel,
      kind: 'config-page',
      methodName: 'editNodeTree',
    })

    expect(guide.text).toContain('修改 rule.json 节点树。')
    expect(guide.text).toContain('editNodeTree(run: (tree: SparkNodeTree) => void | Promise<void>): Promise<void>')
    expect(guide.text).toContain('@usageRule')
    expect(guide.text).not.toContain('resultApis')
    expect(guide.text).not.toContain('callbackApis')
  })

  it('renders model and attribute guides from ClassModel projection', () => {
    const classModel = createClassModelDocumentFromRuntimeDocument(readRuntimeDocument())
    const modelGuide = renderModelGuide({
      document: classModel,
      kind: 'project',
    })
    const attributeGuide = renderAttributeGuide({
      document: classModel,
      kind: 'project',
      attributeName: 'projectId',
    })

    expect(modelGuide.text).toContain('class ProjectModel')
    expect(modelGuide.text).toContain('openPageDesign')
    expect(attributeGuide.text).toContain('projectId: string')
    expect(attributeGuide.text).toContain('项目唯一标识')
    expect(attributeGuide.text).not.toContain('resultApis')
    expect(attributeGuide.text).not.toContain('callbackApis')
  })

  it('projects complete LLM-consumable attribute and method types from generated runtime metadata', () => {
    const classModel = createClassModelDocumentFromRuntimeDocument(readRuntimeDocument())
    const pidGuide = renderAttributeGuide({
      document: classModel,
      kind: 'config-page',
      attributeName: 'pid',
    })
    const getFileTextGuide = renderMethodGuide({
      document: classModel,
      kind: 'config-page',
      methodName: 'getFileText',
    })
    const setFileTextGuide = renderMethodGuide({
      document: classModel,
      kind: 'config-page',
      methodName: 'setFileText',
    })
    const getNodeTreeGuide = renderMethodGuide({
      document: classModel,
      kind: 'config-page',
      methodName: 'getNodeTree',
    })

    expect(pidGuide.text).toContain('readonly pid: string')
    expect(getFileTextGuide.text).toContain(
      'getFileText(name: "rule.json" | "pagedata.json" | "script.js" | "style.css"): string',
    )
    expect(setFileTextGuide.text).toContain(
      'setFileText(name: "rule.json" | "pagedata.json" | "script.js" | "style.css", text: string): void',
    )
    expect(getNodeTreeGuide.text).toContain('getNodeTree(): SparkNodeTree')
  })

  it('preserves native raw JSDoc when ClassModel carries it', () => {
    const classModel = createClassModelDocumentFromRuntimeDocument(readRuntimeDocument())
    const project = classModel.models['project']
    if (project === undefined) throw new Error('project ClassModel missing.')
    const withRawJsDoc = {
      ...classModel,
      models: {
        ...classModel.models,
        project: {
          ...project,
          jsdoc: '/** 原生 JSDoc：项目模型根。 */',
        },
      },
    }

    const guide = renderModelGuide({
      document: withRawJsDoc,
      kind: 'project',
    })

    expect(guide.text).toContain('/** 原生 JSDoc：项目模型根。 */')
    expect(guide.text).not.toContain('summary should not replace raw')
  })

  it('merges component catalog props into method guide projection on demand', () => {
    const classModel = createClassModelDocumentFromRuntimeDocument(readRuntimeDocument())
    const guide = renderMethodGuide({
      document: classModel,
      kind: 'node-tree',
      methodName: 'addNode',
      componentCatalog: readComponentCatalog(),
      componentType: 'r-table',
    })

    expect(guide.text).toContain('type RTableProps = {')
    expect(guide.text).toContain('dataViewKey?: string')
    expect(guide.text).toContain('dataMember?')
    expect(guide.text).toContain('DataView 定位键')
  })

  it('defines the seven VCM-native OpenAI tool names outside ClassModel methods', () => {
    expect(Object.values(VCM_NATIVE_TOOL_NAMES)).toEqual([
      'vcm_query',
      'vcm_model_guide',
      'vcm_attribute_guide',
      'vcm_action_guide',
      'vcm_script',
      'human_question',
      'agent_complete',
    ])
  })

  it('runs the isolated seven VCM-native tool handlers from ClassModel SSOT', async () => {
    const classModel = createClassModelDocumentFromRuntimeDocument(readRuntimeDocument())
    const scriptCommands: unknown[] = []
    const runtime = new VcmNativeRuntime({
      document: classModel,
      componentCatalog: readComponentCatalog(),
      scriptExecutor: async (command) => {
        scriptCommands.push(command)
        return {
          executed: true,
          script: command.script,
        }
      },
    })

    expect(runtime.getTools().map(tool => tool.function.name)).toEqual([
      'vcm_query',
      'vcm_model_guide',
      'vcm_attribute_guide',
      'vcm_action_guide',
      'vcm_script',
      'human_question',
      'agent_complete',
    ])

    const query = await runtime.executeTool('vcm_query', {
      keyword: 'node',
      includeMembers: true,
    })
    expect(query.ok).toBe(true)
    expect(JSON.stringify(query.data)).toContain('node-tree')

    const modelGuide = await runtime.executeTool('vcm_model_guide', { kind: 'project' })
    expect(JSON.stringify(modelGuide.data)).toContain('class ProjectModel')

    const attributeGuide = await runtime.executeTool('vcm_attribute_guide', {
      kind: 'project',
      attributeName: 'projectId',
    })
    expect(JSON.stringify(attributeGuide.data)).toContain('projectId: string')

    const methodGuide = await runtime.executeTool('vcm_action_guide', {
      kind: 'node-tree',
      actionName: 'addNode',
      componentType: 'r-table',
    })
    expect(JSON.stringify(methodGuide.data)).toContain('type RTableProps = {')
    expect(JSON.stringify(methodGuide.data)).not.toContain('resultApis')
    expect(JSON.stringify(methodGuide.data)).not.toContain('callbackApis')

    const script = await runtime.executeTool('vcm_script', {
      script: 'return true',
    })
    expect(script).toMatchObject({
      ok: true,
      data: {
        executed: true,
        script: 'return true',
      },
    })
    expect(scriptCommands).toHaveLength(1)

    const question = await runtime.executeTool('human_question', {
      context: '补齐页面配置',
      reason: '缺少目标组件类型',
      missingFacts: ['componentType'],
    })
    expect(question).toMatchObject({
      ok: true,
      data: {
        awaitingHuman: true,
        context: '补齐页面配置',
      },
    })

    const complete = await runtime.executeTool('agent_complete', { summary: '已完成' })
    expect(complete).toMatchObject({
      ok: true,
      data: { completed: true, summary: '已完成' },
      state: {
        agentLifecycle: 'complete',
        finalAssistantMessage: '已完成',
      },
    })
  })

  it('keeps runtime execution separate from injectable knowledge lookup', async () => {
    const knowledgeCalls: string[] = []
    const host = { pageId: 'page-a' }
    const runtime = new VcmNativeRuntime({
      knowledge: {
        query: (input) => {
          knowledgeCalls.push(`query:${input.keyword ?? ''}`)
          return { models: [{ kind: 'project' }] }
        },
        modelGuide: (input) => {
          knowledgeCalls.push(`model:${input.kind}`)
          return `class ${input.kind}`
        },
        attributeGuide: (input) => {
          knowledgeCalls.push(`attribute:${input.kind}.${input.attributeName}`)
          return `${input.attributeName}: string`
        },
        methodGuide: (input) => {
          knowledgeCalls.push(`method:${input.kind}.${input.methodName}`)
          return `${input.methodName}()`
        },
      },
      scriptExecutor: (command) => ({
        hostIsSameObject: command.host === host,
        script: command.script,
      }),
    })

    expect(await runtime.executeTool('vcm_query', { keyword: 'page' })).toMatchObject({
      ok: true,
      data: { models: [{ kind: 'project' }] },
    })
    expect(await runtime.executeTool('vcm_action_guide', {
      kind: 'project',
      actionName: 'openPageDesign',
    })).toMatchObject({
      ok: true,
      data: 'openPageDesign()',
    })
    expect(await runtime.executeTool('vcm_script', { script: 'return true' }, host)).toMatchObject({
      ok: true,
      data: {
        hostIsSameObject: true,
        script: 'return true',
      },
    })
    expect(knowledgeCalls).toEqual([
      'query:page',
      'method:project.openPageDesign',
    ])
  })

  it('rejects legacy module_* tool names as unknown VCM-native tools', async () => {
    const runtime = new VcmNativeRuntime({
      knowledge: {
        query: () => ({ models: [] }),
        modelGuide: () => 'class ProjectModel {}',
        attributeGuide: () => 'projectId: string',
        methodGuide: () => 'openPageDesign()',
      },
      scriptExecutor: (command) => command.script,
    })

    await expect(runtime.executeTool('module_find', { kind: 'project' })).resolves.toMatchObject({
      ok: false,
      checks: [expect.objectContaining({
        code: 'UNKNOWN_VCM_NATIVE_TOOL',
        message: expect.stringContaining('module_find'),
      })],
    })
  })

  it('rejects old path/direct-call aliases at runtime', async () => {
    const runtime = new VcmNativeRuntime({
      knowledge: {
        query: () => ({ models: [] }),
        modelGuide: () => 'class ProjectModel {}',
        attributeGuide: () => 'projectId: string',
        methodGuide: () => 'openPageDesign()',
      },
      scriptExecutor: (command) => command.script,
    })

    await expect(runtime.executeTool('vcm_script', {
      code: 'return true',
      path: '/project[demo]',
    })).resolves.toMatchObject({
      ok: false,
      checks: [expect.objectContaining({
        code: 'INVALID_VCM_NATIVE_TOOL_ARGS',
        message: expect.stringContaining('code, path'),
      })],
    })

    await expect(runtime.executeTool('vcm_action_guide', {
      kind: 'project',
      methodName: 'openPageDesign',
    })).resolves.toMatchObject({
      ok: false,
      checks: [expect.objectContaining({
        code: 'INVALID_VCM_NATIVE_TOOL_ARGS',
        message: expect.stringContaining('methodName'),
      })],
    })
  })

  it('loads metadata inside knowledge worker API from URL and returns guide strings', async () => {
    const fetchedUrls: string[] = []
    const api = createVcmNativeKnowledgeWorkerApi({
      fetchJson: async (url) => {
        fetchedUrls.push(url)
        if (url === 'metadata://page-design-runtime') return readRuntimeDocument()
        if (url === 'catalog://components') return readComponentCatalog()
        throw new Error(`missing test document: ${url}`)
      },
    })

    await api.init({
      metadataUrl: 'metadata://page-design-runtime',
      componentCatalogUrl: 'catalog://components',
    })
    expect(fetchedUrls).toEqual(['metadata://page-design-runtime'])

    const query = await api.query({
      keyword: 'node',
      includeMembers: false,
    })
    const baseMethodGuide = await api.methodGuide({
      kind: 'node-tree',
      methodName: 'addNode',
    })
    expect(fetchedUrls).toEqual(['metadata://page-design-runtime'])

    const methodGuide = await api.methodGuide({
      kind: 'node-tree',
      methodName: 'addNode',
      componentType: 'r-table',
    })
    const cachedMethodGuide = await api.methodGuide({
      kind: 'node-tree',
      methodName: 'addNode',
      componentType: 'r-table',
    })

    expect(JSON.stringify(query)).toContain('node-tree')
    expect(baseMethodGuide).not.toContain('type RTableProps = {')
    expect(methodGuide).toContain('type RTableProps = {')
    expect(cachedMethodGuide).toContain('type RTableProps = {')
    expect(typeof methodGuide).toBe('string')
    expect(fetchedUrls).toEqual([
      'metadata://page-design-runtime',
      'catalog://components',
    ])
  })

  it('fails worker init with spark-json-document missing $defs audit', async () => {
    const api = createVcmNativeKnowledgeWorkerApi({
      fetchJson: async () => ({
        $defs: {},
        modules: [{
          rootApi: {
            kind: 'project',
            className: 'ProjectModel',
            name: 'ProjectModel',
            description: 'Project',
            jsdoc: '/** Project */',
            actions: [],
            attributes: [{
              name: 'broken',
              description: 'Broken',
              jsdoc: '/** Broken */',
              schema: { $ref: '#/$defs/MissingType' },
              readable: true,
              writable: false,
            }],
          },
        }],
      }),
    })

    await expect(api.init({ metadataUrl: 'metadata://broken' })).rejects.toThrow('MissingType')
  })

  it('keeps Comlink client on main thread without schema or metadata imports', () => {
    const moduleText = readFileSync(
      resolve(root, 'packages/spark-ai/src/vcm-native/knowledge/worker-knowledge-client.ts'),
      'utf8',
    )

    expect(moduleText).toContain("from 'comlink'")
    expect(moduleText).not.toContain('@spark-appworks/spark-json-document')
    expect(moduleText).not.toContain('page-design-module-metadata.runtime.generated.json')
  })

  it('keeps spark-json-document on worker handler side', () => {
    const moduleText = readFileSync(
      resolve(root, 'packages/spark-ai/src/vcm-native/knowledge/worker-knowledge-handler.ts'),
      'utf8',
    )

    expect(moduleText).toContain('@spark-appworks/spark-json-document')
    expect(moduleText).toContain('findMissingJsonSchemaDefRefs')
  })
})

type RuntimeDocumentForTest = Parameters<typeof createClassModelDocumentFromRuntimeDocument>[0]
type RuntimeApiForTest = RuntimeDocumentForTest['modules'][number]['rootApi']

function readRuntimeDocument(): RuntimeDocumentForTest {
  return readJson('src/services/page-design/page-design-module-metadata.runtime.generated.json') as RuntimeDocumentForTest
}

function readComponentCatalog(): NonNullable<Parameters<typeof renderMethodGuide>[0]['componentCatalog']> {
  return readJson('src/services/page-design/payload/component-catalog.json') as NonNullable<
    Parameters<typeof renderMethodGuide>[0]['componentCatalog']
  >
}

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'))
}

function runtimeApisByKind(document: RuntimeDocumentForTest): Map<string, RuntimeApiForTest> {
  const module = document.modules[0]
  if (module === undefined) throw new Error('Runtime document has no module metadata.')
  return new Map([
    [module.rootApi.kind, module.rootApi],
    ...Object.values(module.apiRegistry ?? {}).map((api): [string, RuntimeApiForTest] => [api.kind, api]),
  ])
}

function findMethod(
  document: ReturnType<typeof createClassModelDocumentFromRuntimeDocument>,
  kind: string,
  methodName: string,
) {
  return document.models[kind]?.methods.find(method => method.name === methodName)
}
