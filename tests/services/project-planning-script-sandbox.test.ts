import { describe, expect, it } from 'vitest'
import { executeAiNativeScript } from '@spark-appworks/spark-ai/agent'
import { resolveModuleMetadataJson } from '@spark-appworks/spark-ai/vcm-native'
import { ProjectModel } from '@spark-appworks/spark-project-model'
import { projectPageSurfaceRuntimeMetadataDocument } from '../../generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime'

function readProjectPlanningMetadata() {
  const projectModule = projectPageSurfaceRuntimeMetadataDocument.modules.find(
    module => module.rootApi.kind === 'project',
  )
  if (projectModule === undefined) {
    throw new Error('project-page-surface runtime metadata missing ProjectModel rootApi.')
  }
  return resolveModuleMetadataJson(projectModule, {
    inlineSchemaRefs: false,
    ...readProjectPlanningSchemaDefs(),
  })
}

function readProjectPlanningSchemaDefs() {
  return projectPageSurfaceRuntimeMetadataDocument.$defs === undefined
    ? {}
    : { schemaDefs: projectPageSurfaceRuntimeMetadataDocument.$defs }
}

function createNativeScriptCommand(project: ProjectModel, script: string) {
  return {
    instance: project,
    metadata: readProjectPlanningMetadata(),
    ...readProjectPlanningSchemaDefs(),
    script,
  }
}

function createPlanningProject(): ProjectModel {
  const project = new ProjectModel({
    projectId: 'demo',
    project: { description: '订单与库存管理' },
  })
  project.replaceNavigationRoot({
    id: 'homepage_root',
    title: 'Demo',
    nodeKind: 'module',
    childPlacement: 'header',
    description: '订单与库存管理',
    children: [],
  })
  return project
}

describe('projectPlanning vcm_script sandbox (offline)', () => {
  it('writes navigation children through this.replaceNavigationChildren', async () => {
    const project = createPlanningProject()
    const result = await executeAiNativeScript(createNativeScriptCommand(project, [
      'const children = [{',
      '  id: "orders",',
      '  title: "订单",',
      '  nodeKind: "page",',
      '  path: "/orders",',
      '  description: "订单页概要",',
      '}];',
      'return await this.replaceNavigationChildren({ children });',
    ].join('\n')))

    expect(result.ok, result.ok ? '' : JSON.stringify(result)).toBe(true)
    if (!result.ok) return
    expect(project.navigationRoot.children?.map(node => node.id)).toEqual(['orders'])
    expect(project.navigationDirty).toBe(true)
  })

  it('reads planning inputs through this-scoped actions', async () => {
    const project = createPlanningProject()
    const result = await executeAiNativeScript(createNativeScriptCommand(project, [
      'const planning = await this.readProjectPlanningInput();',
      'const nodes = await this.readNavigationPlanningInputs();',
      'return { requirement: planning.requirement, nodeCount: nodes.length };',
    ].join('\n')))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toMatchObject({
      requirement: '订单与库存管理',
      nodeCount: 1,
    })
  })

  it('fails fast for project.replaceNavigationChildren anti-pattern', async () => {
    const project = createPlanningProject()
    const result = await executeAiNativeScript(createNativeScriptCommand(
      project,
      'return await project.replaceNavigationChildren({ children: [] })',
    ))

    expect(result.ok).toBe(false)
    if (result.ok) return
    const serialized = JSON.stringify(result)
    expect(serialized).toMatch(/replaceNavigationChildren|SCRIPT_EXECUTION_FAILED|attribute not found/iu)
    expect(serialized).toContain('vcm_action_guide')
  })
})
