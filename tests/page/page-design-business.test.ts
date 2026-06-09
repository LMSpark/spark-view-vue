import { describe, expect, it, vi } from 'vitest'
import { VcmNativeAgentAdapter } from '@spark-appworks/spark-ai/agent'
import { resolveModuleMetadataJson } from '@spark-appworks/spark-ai/vcm-native'
import { ProjectModel } from '@spark-appworks/spark-project-model'
import {
  PAGE_DESIGN_MODULE_ID,
  resolvePageDesignPlanningContext,
} from '@/services/page-design-business'
import { projectPageSurfaceRuntimeMetadataDocument } from '../../generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime'

function readPageDesignProjectMetadata() {
  const projectModule = projectPageSurfaceRuntimeMetadataDocument.modules.find(
    module => module.rootApi.kind === 'project',
  )
  if (projectModule === undefined) {
    throw new Error('pageDesign runtime metadata missing ProjectModel rootApi.')
  }
  return resolveModuleMetadataJson(projectModule, {
    inlineSchemaRefs: false,
    ...(projectPageSurfaceRuntimeMetadataDocument.$defs === undefined
      ? {}
      : { schemaDefs: projectPageSurfaceRuntimeMetadataDocument.$defs }),
  })
}

function expectRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('expected record')
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function expectStringField(value: Record<string, unknown>, key: string): string {
  const field = value[key]
  if (typeof field !== 'string') {
    throw new Error(`expected string field ${key}`)
  }
  return field
}

describe('resolvePageDesignPlanningContext', () => {
  it('returns effectiveDescription from readPlanningProjection', () => {
    const project = new ProjectModel({ projectId: 'demo' })
    vi.spyOn(project, 'readPlanningProjection').mockReturnValue([{
      pageId: 'orders',
      path: '/orders',
      title: '订单',
      nodeId: 'orders-node',
      nodeKind: 'page',
      designSurface: 'config-files',
      description: '订单列表',
      descriptionContext: [],
      effectiveDescription: '订单列表页：展示与筛选订单',
    }])

    expect(resolvePageDesignPlanningContext(project, 'orders')).toEqual({
      effectiveDescription: '订单列表页：展示与筛选订单',
      planningTitle: '订单',
      planningPath: '/orders',
    })
  })

  it('uses fallbackDescription when effectiveDescription is empty', () => {
    const project = new ProjectModel({ projectId: 'demo' })
    vi.spyOn(project, 'readPlanningProjection').mockReturnValue([{
      pageId: 'orders',
      path: '/orders',
      title: '订单',
      nodeId: 'orders-node',
      nodeKind: 'page',
      designSurface: 'config-files',
      description: '',
      descriptionContext: [],
      effectiveDescription: '',
    }])

    expect(resolvePageDesignPlanningContext(project, 'orders', {
      fallbackDescription: '本轮需求描述',
    })).toEqual({
      effectiveDescription: '本轮需求描述',
      planningTitle: '订单',
      planningPath: '/orders',
    })
  })

  it('throws when pageId is missing from planning projection', () => {
    const project = new ProjectModel({ projectId: 'demo' })
    vi.spyOn(project, 'readPlanningProjection').mockReturnValue([])

    expect(() => resolvePageDesignPlanningContext(project, 'missing')).toThrow(
      'pageDesign: no planning projection for pageId "missing".',
    )
  })
})


describe('pageDesign vcm_script model edit', () => {
  it('executes LLM-generated native code and returns four page files', async () => {
    const project = new ProjectModel({ projectId: 'homepage' })
    const registration = VcmNativeAgentAdapter.createRegistration({
      moduleClass: ProjectModel,
      metadata: readPageDesignProjectMetadata(),
      options: {
        moduleId: PAGE_DESIGN_MODULE_ID,
        instance: project,
        ...(projectPageSurfaceRuntimeMetadataDocument.$defs === undefined
          ? {}
          : { jsonSchemaDefs: projectPageSurfaceRuntimeMetadataDocument.$defs }),
      },
    })

    const result = await registration.runtime.executeTool('vcm_script', {
      script: `
        const pageId = 'orders-page'
        const page = await this.openPageDesign({ pageId })

        await page.editDataSet(async (ds) => {
          const table = ds.getTable({ tableName: 'orders' }) ?? ds.createTable({
            tableName: 'orders',
            columns: [
              { name: 'orderNo', type: 'string', label: '订单号' },
              { name: 'amount', type: 'number', label: '金额' }
            ]
          })
          void table
        })

        await page.editNodeTree(async (tree) => {
          tree.addNode({
            parentComponentId: null,
            node: {
              id: 'orders-table',
              type: 'r-table',
              props: {
                dataViewKey: 'orders@default',
                dataMember: 'rows'
              }
            }
          })
        })

        page.setFileText('script.js', 'export function setupOrdersPage() { return true }\\n')
        page.setFileText('style.css', '.orders-table { width: 100%; }\\n')

        return {
          ruleJson: page.getFileText('rule.json'),
          pageDataJson: page.getFileText('pagedata.json'),
          script: page.getFileText('script.js'),
          style: page.getFileText('style.css')
        }
      `,
    }, {
      moduleId: PAGE_DESIGN_MODULE_ID,
      moduleInstanceId: 'orders-page',
      instanceId: 'turn-1',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(result.checks?.map(check => `${check.code}: ${check.message}`).join('\n') ?? 'vcm_script failed')
    }

    const files = expectRecord(result.data)
    const ruleJson = expectStringField(files, 'ruleJson')
    const pageDataJson = expectStringField(files, 'pageDataJson')
    const script = expectStringField(files, 'script')
    const style = expectStringField(files, 'style')
    const rule = expectRecord(JSON.parse(ruleJson))
    const pageData = expectRecord(JSON.parse(pageDataJson))
    const tables = expectRecord(pageData['tables'])
    const ordersTable = expectRecord(tables['orders'])

    expect(rule).toMatchObject({
      id: 'orders-table',
      type: 'r-table',
      props: {
        dataViewKey: 'orders@default',
        dataMember: 'rows',
      },
    })
    expect(ordersTable['columns']).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'orderNo', type: 'string' }),
      expect.objectContaining({ name: 'amount', type: 'number' }),
    ]))
    expect(script).toContain('setupOrdersPage')
    expect(style).toContain('.orders-table')
    expect(project.openPageDesign('orders-page').getFileText('rule.json')).toBe(ruleJson)
    expect(JSON.stringify(result.data)).not.toMatch(/\/[A-Za-z0-9_-]+\[/u)
  })
})
