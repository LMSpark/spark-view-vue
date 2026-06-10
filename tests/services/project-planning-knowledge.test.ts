import { describe, expect, it } from 'vitest'
import {
  createClassModelDocumentFromRuntimeDocument,
  VcmNativeRuntime,
} from '@spark-appworks/spark-ai/vcm-native'
import { projectPageSurfaceRuntimeMetadataDocument } from '../../generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime'

function createProjectPlanningVcmRuntime(): VcmNativeRuntime {
  return new VcmNativeRuntime({
    document: createClassModelDocumentFromRuntimeDocument(projectPageSurfaceRuntimeMetadataDocument),
    scriptExecutor: () => null,
  })
}

describe('projectPlanning VCM-native knowledge (offline)', () => {
  it('queries project-page-surface planning actions from ClassModel document', async () => {
    const runtime = createProjectPlanningVcmRuntime()
    const result = await runtime.executeTool('vcm_query', {
      kind: 'project',
      includeMembers: true,
    })

    expect(result.ok).toBe(true)
    const text = JSON.stringify(result.data)
    expect(text).toContain('replaceNavigationChildren')
    expect(text).toContain('readProjectPlanningInput')
    expect(text).toContain('readNavigationPlanningInputs')
  })

  it('exposes replaceNavigationChildren through vcm_action_guide', async () => {
    const runtime = createProjectPlanningVcmRuntime()
    const guide = await runtime.executeTool('vcm_action_guide', {
      kind: 'project',
      actionName: 'replaceNavigationChildren',
    })

    expect(guide.ok).toBe(true)
    const text = String(guide.data)
    expect(text).toContain('replaceNavigationChildren')
    expect(text).toContain('navigation')
    expect(text).not.toContain('resultApis')
  })

  it('fails when replaceNavigationChildren is queried as an attribute', async () => {
    const runtime = createProjectPlanningVcmRuntime()
    await expect(runtime.executeTool('vcm_attribute_guide', {
      kind: 'project',
      attributeName: 'replaceNavigationChildren',
    })).rejects.toThrow(/attribute not found: project\.replaceNavigationChildren/u)
  })

  it('loads project-page-surface runtime metadata with ProjectModel root', () => {
    const projectModule = projectPageSurfaceRuntimeMetadataDocument.modules.find(
      module => module.rootApi.kind === 'project',
    )
    expect(projectModule).toBeDefined()
    const actionNames = projectModule?.rootApi.actions.map(action => action.name) ?? []
    expect(actionNames).toContain('replaceNavigationChildren')
    expect(actionNames).toContain('readProjectPlanningInput')
    expect(projectModule?.rootApi.attributes?.some(attribute => attribute.name === 'navigationRoot')).toBe(false)
  })
})
