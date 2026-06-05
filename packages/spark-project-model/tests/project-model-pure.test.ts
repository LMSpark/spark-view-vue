import { describe, expect, it } from 'vitest'
import type { ProjectNodeData } from '@spark-appworks/spark-project-model'
import {
  ConfigPageNode,
  ProjectModel,
  createBareProjectModel,
} from '@spark-appworks/spark-project-model'

describe('ProjectModel — model vs instance separation', () => {
  function createRoot(children: ProjectNodeData[]) {
    return {
      id: 'homepage_root',
      title: 'CRM',
      nodeKind: 'module' as const,
      childPlacement: 'header' as const,
      children,
    }
  }

  it('creates bare domain instance without IO or ProjectEditor', () => {
    const project = createBareProjectModel({ projectId: 'crm' })
    project.replaceRoot(createRoot([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ]))
    expect(project.projectId).toBe('crm')
    expect(project.findConfigPageByPageId('orders')).toBeInstanceOf(ConfigPageNode)
  })

  it('ProjectModel.create is equivalent to createBareProjectModel', () => {
    const project = ProjectModel.create({ projectId: 'demo' })
    expect(project.projectId).toBe('demo')
    project.replaceRoot(createRoot([]))
    expect(project.design.navigationRoot.title).toBe('CRM')
  })

  it('ConfigPageNode is pure domain without persistence methods', () => {
    const project = createBareProjectModel({ projectId: 'crm' })
    project.replaceRoot(createRoot([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ]))
    const page = project.findConfigPageByPageId('orders')
    expect(page).toBeInstanceOf(ConfigPageNode)
    expect('load' in (page as object)).toBe(false)
    expect('saveFile' in (page as object)).toBe(false)
    expect('createFiles' in (page as object)).toBe(false)
  })

  it('domain instance is independent of facade — no session/revision', () => {
    const project = createBareProjectModel({ projectId: 'crm' })
    project.replaceRoot(createRoot([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ]))
    expect('revision' in project).toBe(false)
    expect('session' in project).toBe(false)
    expect('subscribe' in project).toBe(false)
  })
})
