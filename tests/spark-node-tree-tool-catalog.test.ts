import { describe, expect, it } from 'vitest'

import {
  PageDesignNodeTreeCatalog,
} from '../packages/spark-ai/src/business/page-design/functions/node-tree'

const catalog = new PageDesignNodeTreeCatalog()

describe('SparkNodeTree tool catalog', () => {
  it('应提供完整的 catalog-only 参数表与能力表', () => {
    expect(catalog.parameterTable.length).toBeGreaterThan(0)
    expect(catalog.capabilityTable.length).toBe(catalog.parameterTable.length)
    expect(catalog.capabilityTable.every(row => row.integrationStatus === 'catalog-only')).toBe(true)
    expect(catalog.parameterTable.every(row => !row.functionId.includes('/'))).toBe(true)
  })

  it('应能按 functionId 查询参数行和能力行', () => {
    const paramRow = catalog.getParameterRow('setProps')
    const capabilityRow = catalog.getCapabilityRow('setProps')

    expect(paramRow).toMatchObject({
      functionId: 'setProps',
      type: 'request',
      coreMethod: 'setProps',
    })
    expect(capabilityRow).toMatchObject({
      functionId: 'setProps',
      integrationStatus: 'catalog-only',
      paramsRef: 'setProps',
    })
  })

  it('catalog 应强调核心层隔离和命名参数约束', () => {
    const addNode = catalog.getParameterRow('addNode')
    const listChildren = catalog.getParameterRow('listChildren')

    expect(addNode?.usageRules).toContain('本 catalog 只定义函数目录，不接运行时 registry，也不提供 execute 实现。')
    expect(addNode?.usageRules).toContain('运行时应优先使用命名参数对象，而不是位置参数。')
    expect(addNode?.usageRules).toContain('parentComponentId 仅接受 string 或 null 原子值，禁止对象嵌套（例如 { componentId: "root-table" }）。')
    expect(listChildren?.failureModes.map(item => item.code)).toContain('PARENT_NOT_FOUND')
  })

  it('catalog 应对高风险 children 写动作声明必填字段', () => {
    const addNode = catalog.getParameterRow('addNode')
    const addNodes = catalog.getParameterRow('addNodes')

    expect(addNode?.paramsSchema).toMatchObject({
      kind: 'object',
      required: ['node'],
    })
    expect(addNodes?.paramsSchema).toMatchObject({
      kind: 'object',
      required: ['nodes'],
    })
  })

  it('catalog 应包含批量节点动作，且不暴露历史版本动作', () => {
    expect(catalog.getParameterRow('getAllData')?.coreMethod).toBe('getAllData')
    expect(catalog.getParameterRow('addNodes')?.coreMethod).toBe('addNodes')
    expect(catalog.getParameterRow('moveNode')?.coreMethod).toBe('moveNode')
    expect(catalog.getParameterRow('setPropsBatch')?.coreMethod).toBe('setPropsBatch')
    expect(catalog.getParameterRow('replaceNodes')?.coreMethod).toBe('replaceNodes')
    expect(catalog.getParameterRow('removeNodes')?.coreMethod).toBe('removeNodes')
    expect(catalog.getParameterRow('findByType')?.coreMethod).toBe('findByType')
    expect(catalog.getParameterRow('undo')).toBeUndefined()
    expect(catalog.getParameterRow('redo')).toBeUndefined()
    expect(catalog.getParameterRow('listVersions')).toBeUndefined()
  })

  it('findByType 应返回可直接用于 componentId 的真实 id 指引', () => {
    const row = catalog.getParameterRow('findByType')
    const usageRules = row?.usageRules ?? []
    expect(usageRules.some(rule => rule.includes('真实 componentId'))).toBe(true)
  })

  it('moveNode 应声明小结果并阻止 remove/add 重建子树', () => {
    const row = catalog.getParameterRow('moveNode')
    expect(row?.paramsSchema).toMatchObject({
      kind: 'object',
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
    expect(row?.usageRules.some(rule => rule.includes('不要用 removeNode + addNode'))).toBe(true)
  })
})
