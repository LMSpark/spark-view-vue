import { describe, expect, it } from 'vitest'

import {
  NodeTreeModule,
} from '../registrations/page-design/modules/node-tree-tool-catalog'

const NODE_TREE_ROWS = new NodeTreeModule().getFunctions()

function getRow(functionId: string) {
  return NODE_TREE_ROWS.find(r => r.functionId === functionId)
}

describe('SparkNodeTree tool catalog', () => {
  it('应提供完整的函数行', () => {
    expect(NODE_TREE_ROWS.length).toBeGreaterThan(0)
    expect(NODE_TREE_ROWS.every(row => !row.functionId.includes('/'))).toBe(true)
  })

  it('应能按 functionId 查询', () => {
    const row = getRow('setProps')
    expect(row).toMatchObject({
      functionId: 'setProps',
    })
    expect(row?.paramsSchema).toMatchObject({
      properties: expect.any(Object),
    })
  })

  it('catalog 应强调 SparkNodeTree 业务模型和命名参数约束', () => {
    const addNode = getRow('addNode')

    expect(addNode?.usageRules).toContain('该动作直接作用于当前 PageDesignEditHost.getNodeTree() 返回的 SparkNodeTree/rule.json 模型。')
    expect(addNode?.usageRules).toContain('运行时应优先使用命名参数对象，而不是位置参数。')
    expect(addNode?.usageRules).toContain('parentComponentId 仅接受 string 或 null 原子值，禁止对象嵌套（例如 { componentId: "root-table" }）。')
    expect((addNode?.failureModes ?? []).some(item => item.code === 'PARENT_NOT_FOUND')).toBe(true)
  })

  it('catalog 应对高风险 children 写动作声明必填字段', () => {
    const addNode = getRow('addNode')
    const addNodes = getRow('addNodes')

    expect(addNode?.paramsSchema).toMatchObject({
      type: 'object',
      required: ['node'],
    })
    expect(addNodes?.paramsSchema).toMatchObject({
      type: 'object',
      required: ['nodes'],
    })
  })

  it('catalog 应包含批量节点动作，且不暴露历史版本动作', () => {
    expect(getRow('getAllData')?.functionId).toBe('getAllData')
    expect(getRow('addNodes')?.functionId).toBe('addNodes')
    expect(getRow('moveNode')?.functionId).toBe('moveNode')
    expect(getRow('setPropsBatch')?.functionId).toBe('setPropsBatch')
    expect(getRow('replaceNodes')?.functionId).toBe('replaceNodes')
    expect(getRow('removeNodes')?.functionId).toBe('removeNodes')
    expect(getRow('findByType')?.functionId).toBe('findByType')
    expect(getRow('undo')).toBeUndefined()
    expect(getRow('redo')).toBeUndefined()
    expect(getRow('listVersions')).toBeUndefined()
  })

  it('findByType 应返回可直接用于 componentId 的真实 id 指引', () => {
    const row = getRow('findByType')
    const usageRules = row?.usageRules ?? []
    expect(usageRules.some(rule => rule.includes('真实 componentId'))).toBe(true)
  })

  it('moveNode 应声明小结果并阻止 remove/add 重建子树', () => {
    const row = getRow('moveNode')
    expect(row?.paramsSchema).toMatchObject({
      type: 'object',
      required: ['componentId'],
    })
    expect(row?.resultSchema).toMatchObject({
      componentId: expect.any(String),
      fromParentComponentId: expect.any(String),
      toParentComponentId: expect.any(String),
      previousIndex: expect.any(String),
      index: expect.any(String),
    })
    expect(row?.resultSchema).not.toHaveProperty('node')
    expect((row?.usageRules ?? []).some(rule => rule.includes('不要用 removeNode + addNode'))).toBe(true)
  })
})
