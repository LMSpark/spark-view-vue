import { describe, expect, it } from 'vitest'
import { AiModuleAdapter } from '@spark-appworks/spark-ai/agent'
import { AiModuleRuntime, resolveModuleMetadataJson } from '@spark-appworks/spark-ai/modules'
import { ProjectModel } from '@spark-appworks/spark-project-model'
import { pageDesignRuntimeMetadataDocument } from '@/services/page-design/page-design-module-metadata.runtime'

function readPageDesignProjectMetadata() {
  const projectModule = pageDesignRuntimeMetadataDocument.modules.find(
    module => module.rootApi.kind === 'project',
  )
  if (projectModule === undefined) {
    throw new Error('pageDesign runtime metadata missing ProjectModel rootApi.')
  }
  return resolveModuleMetadataJson(projectModule, {
    inlineSchemaRefs: false,
    ...(pageDesignRuntimeMetadataDocument.$defs === undefined
      ? {}
      : { schemaDefs: pageDesignRuntimeMetadataDocument.$defs }),
  })
}

function createPageDesignKnowledgeRuntime(): AiModuleRuntime {
  return AiModuleAdapter.createRegistration({
    moduleClass: ProjectModel,
    metadata: readPageDesignProjectMetadata(),
    options: {
      moduleId: 'pageDesign',
      instance: new ProjectModel({ projectId: 'homepage' }),
      ...(pageDesignRuntimeMetadataDocument.$defs === undefined
        ? {}
        : { jsonSchemaDefs: pageDesignRuntimeMetadataDocument.$defs }),
    },
  }).runtime
}

describe('pageDesign knowledge integration', () => {
  it('projects VCM result kinds in prompt snapshot', () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const snapshot = runtime.projectKnowledge()
    const kinds = snapshot.modules.map(module => module.kind)

    expect(kinds).toContain('project')
    expect(kinds).toContain('config-page')
    expect(kinds).toContain('dataset')
    expect(kinds).toContain('node-tree')
    expect(snapshot.promptSnapshot).toContain('config-page')
    expect(snapshot.promptSnapshot).toContain('module_script')
    expect(runtime.inspect().ok).toBe(true)
  })

  it('addNode guide comes from VCM metadata', () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const guide = runtime.guideKnowledgeFunction({
      kind: 'node-tree',
      functionName: 'addNode',
    })

    expect(guide.ok).toBe(true)
    if (!guide.ok || guide.data === undefined) {
      throw new Error('expected addNode guide')
    }
    expect(guide.data.programmingFlow.some(step => step.includes('module_script'))).toBe(true)
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

  it('config-page guide exposes constructorSignature from VCM runtime metadata', () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const configPage = runtime.describeKind('config-page')

    expect(configPage.ok).toBe(true)
    if (!configPage.ok || configPage.data === undefined) {
      throw new Error('expected config-page description')
    }
    expect(configPage.data.constructorSignature?.paramsSchema.type).toBe('object')
    expect(configPage.data.constructorSignature?.description.length).toBeGreaterThan(0)
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

  it('prompt snapshot includes script and VCM knowledge lookup guidance', () => {
    const runtime = createPageDesignKnowledgeRuntime()
    const snapshot = runtime.projectKnowledge().promptSnapshot

    expect(snapshot).toContain('module_script')
    expect(snapshot).toMatch(/vcm_query|module_function_guide/)
  })
})
