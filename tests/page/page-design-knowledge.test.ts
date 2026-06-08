import { describe, expect, it } from 'vitest'
import {
  createClassModelDocumentFromRuntimeDocument,
  VcmNativeRuntime,
} from '@spark-appworks/spark-ai/vcm-native'
import componentCatalogDocumentJson from '@/services/page-design/payload/component-catalog.json'
import { pageDesignRuntimeMetadataDocument } from '@/services/page-design/page-design-module-metadata.runtime'

function createPageDesignVcmRuntime(): VcmNativeRuntime {
  return new VcmNativeRuntime({
    document: createClassModelDocumentFromRuntimeDocument(pageDesignRuntimeMetadataDocument),
    componentCatalog: componentCatalogDocumentJson,
    scriptExecutor: () => null,
  })
}

describe('pageDesign VCM-native knowledge integration', () => {
  it('queries VCM result kinds from ClassModel document', async () => {
    const runtime = createPageDesignVcmRuntime()
    const result = await runtime.executeTool('vcm_query', { includeMembers: true })

    expect(result.ok).toBe(true)
    const text = JSON.stringify(result.data)
    expect(text).toContain('project')
    expect(text).toContain('config-page')
    expect(text).toContain('dataset')
    expect(text).toContain('node-tree')
  })

  it('addNode action guide comes from VCM metadata and component catalog', async () => {
    const runtime = createPageDesignVcmRuntime()
    const guide = await runtime.executeTool('vcm_action_guide', {
      kind: 'node-tree',
      actionName: 'addNode',
      componentType: 'r-table',
    })

    expect(guide.ok).toBe(true)
    expect(String(guide.data)).toContain('addNode')
    expect(String(guide.data)).toContain('type RTableProps')
  })

  it('getNodeTree guide exposes native return type without protocol fields', async () => {
    const runtime = createPageDesignVcmRuntime()
    const guide = await runtime.executeTool('vcm_action_guide', {
      kind: 'config-page',
      actionName: 'getNodeTree',
    })

    expect(guide.ok).toBe(true)
    expect(String(guide.data)).toContain('getNodeTree(): SparkNodeTree')
    expect(String(guide.data)).not.toContain('resultApis')
  })

  it('config-page model guide exposes constructor signature from VCM runtime metadata', async () => {
    const runtime = createPageDesignVcmRuntime()
    const guide = await runtime.executeTool('vcm_model_guide', { kind: 'config-page' })

    expect(guide.ok).toBe(true)
    expect(String(guide.data)).toContain('constructor(')
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
})
