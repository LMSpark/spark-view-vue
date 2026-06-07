import { describe, expect, it } from 'vitest'
import { AiModule, AiModuleResult, AiModuleRuntime, mergeCompanionChildDeclarations } from '@spark-appworks/spark-ai/modules'
import { pageDesignRuntimeMetadataDocument } from '@/services/page-design/page-design-module-metadata.runtime'
import { createPageDesignSparkComponentModuleBundle } from '@/services/page-design/spark-component-module'

function createStubProjectModule(): AiModule {
  return new AiModule({
    kind: 'project',
    name: 'ProjectModel',
    description: 'pageDesign 根模块（测试桩）。',
    find: () => AiModuleResult.ok([]),
  })
}

function createPageDesignKnowledgeRuntime(): AiModuleRuntime {
  const projectModule = pageDesignRuntimeMetadataDocument.modules.find(
    module => module.rootApi.kind === 'project',
  )
  const bundle = createPageDesignSparkComponentModuleBundle(
    projectModule?.apiRegistry === undefined
      ? {}
      : { apiRegistry: projectModule.apiRegistry },
  )

  const runtime = new AiModuleRuntime()
  const wiredModules = mergeCompanionChildDeclarations([
    createStubProjectModule(),
    bundle.catalogModule,
    ...bundle.guideModules,
  ])
  for (const moduleKind of wiredModules) {
    runtime.register(moduleKind)
  }
  return runtime
}

describe('pageDesign knowledge integration', () => {
  it('projects spark-component and dataset kinds in prompt snapshot', () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const snapshot = runtime.projectKnowledge()

    expect(snapshot.modules.some(module => module.kind === 'spark-component')).toBe(true)
    expect(snapshot.modules.some(module => module.kind === 'dataset')).toBe(true)
    expect(snapshot.promptSnapshot).toContain('spark-component')
    expect(runtime.inspect().ok).toBe(true)
  })

  it('addNode guide includes spark.component payload lookup steps', () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const guide = runtime.guideKnowledgeFunction({
      kind: 'node-tree',
      functionName: 'addNode',
    })

    expect(guide.ok).toBe(true)
    if (!guide.ok || guide.data === undefined) {
      throw new Error('expected addNode guide')
    }

    expect(guide.data.payloadRefs).toContain('spark.component')
    expect(guide.data.payloadLookupSteps.some(step => step.includes('queryPayloads'))).toBe(true)
    expect(guide.data.payloadLookupSteps.some(step => step.includes('guidePayload'))).toBe(true)
  })

  it('getNodeTree guide deep-links to node-tree via resultApis', () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const guide = runtime.guideKnowledgeFunction({
      kind: 'config-page',
      functionName: 'getNodeTree',
    })

    expect(guide.ok).toBe(true)
    if (!guide.ok || guide.data === undefined) {
      throw new Error('expected getNodeTree guide')
    }

    expect(guide.data.resultApis.map(resultApi => resultApi.kind)).toContain('node-tree')
    expect(guide.data.programmingFlow.some(step => step.includes('node-tree'))).toBe(true)
  })

  it('getTable guide deep-links to data-table via resultApis', () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const guide = runtime.guideKnowledgeFunction({
      kind: 'dataset',
      functionName: 'getTable',
    })

    expect(guide.ok).toBe(true)
    if (!guide.ok || guide.data === undefined) {
      throw new Error('expected getTable guide')
    }

    expect(guide.data.resultApis.map(resultApi => resultApi.kind)).toContain('data-table')
    expect(guide.data.programmingFlow.some(step => step.includes('data-table'))).toBe(true)
  })

  it('editNodeTree guide deep-links to node-tree via mutator callback resultApis', () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const guide = runtime.guideKnowledgeFunction({
      kind: 'config-page',
      functionName: 'editNodeTree',
    })

    expect(guide.ok).toBe(true)
    if (!guide.ok || guide.data === undefined) {
      throw new Error('expected editNodeTree guide')
    }

    expect(guide.data.resultApis.map(resultApi => resultApi.kind)).toContain('node-tree')
    expect(guide.data.programmingFlow.some(step => step.includes('node-tree'))).toBe(true)
    expect(guide.data.usageRules.some(rule => rule.includes('module_script'))).toBe(true)
    expect(guide.data.failureModes.some(mode => mode.code === 'PAYLOAD_GUIDE_REQUIRED')).toBe(true)
  })

  it('createColumn guide is available on dataset kind', () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const guide = runtime.guideKnowledgeFunction({
      kind: 'dataset',
      functionName: 'createColumn',
    })

    expect(guide.ok).toBe(true)
    if (!guide.ok || guide.data === undefined) {
      throw new Error('expected createColumn guide')
    }

    expect(guide.data.kind).toBe('dataset')
    expect(guide.data.functionName).toBe('createColumn')
    expect(guide.data.programmingFlow.some(step => step.includes('module_script'))).toBe(true)
  })

  it('openPageDesign metadata includes INVALID_TOOL_ARGS failureMode', () => {
    const projectModule = pageDesignRuntimeMetadataDocument.modules.find(
      module => module.rootApi.kind === 'project',
    )
    const openPageDesign = projectModule?.rootApi.actions.find(action => action.name === 'openPageDesign')
    expect(openPageDesign).toBeDefined()
    expect(openPageDesign?.failureModes?.some(mode => mode.code === 'INVALID_TOOL_ARGS')).toBe(true)
  })

  it('editNodeTree metadata guides native page callback usage', () => {
    const configPageApi = pageDesignRuntimeMetadataDocument.modules
      .flatMap(module => Object.values(module.apiRegistry ?? {}))
      .find(api => api.kind === 'config-page')
    const editNodeTree = configPageApi?.actions.find(action => action.name === 'editNodeTree')
    expect(editNodeTree).toBeDefined()
    expect(editNodeTree?.usageRules?.some(rule => rule.includes('page.editNodeTree'))).toBe(true)
    expect(editNodeTree?.failureModes?.some(mode => mode.code === 'SCRIPT_EXECUTION_FAILED')).toBe(true)
  })

  it('accepts flat queryPayloads args with inferred spark-component path', async () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const host = { moduleId: 'pageDesign', moduleInstanceId: 'leave-page', instanceId: 'turn-1' }
    const result = await runtime.executeTool('queryPayloads', {
      moduleKind: 'node-tree',
      payloadRef: 'spark.component',
      keyword: 'form',
      limit: 3,
    }, host)

    expect(result.ok).toBe(true)
    if (!result.ok || !Array.isArray(result.data)) return
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('defaults module_find root path when childKind and query are provided', async () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const result = await runtime.executeTool('module_find', {
      childKind: 'spark-component',
      query: { id: 'catalog' },
    })

    expect(result.ok).toBe(true)
  })

  it('coalesces flat module_find id when query is null', async () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const result = await runtime.executeTool('module_find', {
      path: '/',
      childKind: 'project',
      query: null,
      id: 'homepage',
    })

    expect(result.ok).toBe(true)
  })

  it('defaults queryPayloads catalog args when call is empty', async () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const host = { moduleId: 'pageDesign', moduleInstanceId: 'leave-page', instanceId: 'turn-1' }
    const result = await runtime.executeTool('queryPayloads', {}, host)
    expect(result.ok).toBe(true)
  })

  it('defaults spark-component root find query when list mode is used', async () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const result = await runtime.executeTool('module_find', {
      path: '/',
      childKind: 'spark-component',
    })

    expect(result.ok).toBe(true)
    if (!result.ok || !Array.isArray(result.data)) return
    expect(result.data.some(item => typeof item === 'object' && item !== null && !Array.isArray(item) && item['id'] === 'catalog')).toBe(true)
  })

  it('coalesces guidePayload type alias into key', async () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const host = { moduleId: 'pageDesign', moduleInstanceId: 'leave-page', instanceId: 'turn-1' }
    const result = await runtime.executeTool('guidePayload', {
      type: 'r-form',
    }, host)

    expect(result.ok).toBe(true)
  })

  it('fills guidePayload key from prior queryPayloads cache', async () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const host = { moduleId: 'pageDesign', moduleInstanceId: 'leave-page', instanceId: 'turn-2' }
    const queryResult = await runtime.executeTool('queryPayloads', {
      keyword: 'form',
      limit: 5,
    }, host)
    expect(queryResult.ok).toBe(true)

    const guideResult = await runtime.executeTool('guidePayload', {}, host)
    expect(guideResult.ok).toBe(true)
  })
})
