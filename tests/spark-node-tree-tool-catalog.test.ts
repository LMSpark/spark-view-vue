import { describe, expect, it } from 'vitest'

import {
  getSparkNodeTreeToolCapabilityRow,
  getSparkNodeTreeToolParameterRow,
  SPARK_NODE_TREE_TOOL_CAPABILITY_TABLE,
  SPARK_NODE_TREE_TOOL_PARAMETER_TABLE,
} from '../packages/spark-ai/src/business/page-design/stills/spark-node-tree-tool-catalog'

describe('SparkNodeTree tool catalog', () => {
  it('应提供完整的 catalog-only 参数表与能力表', () => {
    expect(SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.length).toBeGreaterThan(0)
    expect(SPARK_NODE_TREE_TOOL_CAPABILITY_TABLE.length).toBe(SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.length)
    expect(SPARK_NODE_TREE_TOOL_CAPABILITY_TABLE.every(row => row.integrationStatus === 'catalog-only')).toBe(true)
    expect(SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.every(row => row.action.startsWith('sparkNodeTree.'))).toBe(true)
  })

  it('应能按 action 查询参数行和能力行', () => {
    const paramRow = getSparkNodeTreeToolParameterRow('sparkNodeTree.setProps')
    const capabilityRow = getSparkNodeTreeToolCapabilityRow('sparkNodeTree.setProps')

    expect(paramRow).toMatchObject({
      action: 'sparkNodeTree.setProps',
      type: 'request',
      coreMethod: 'setProps',
    })
    expect(capabilityRow).toMatchObject({
      action: 'sparkNodeTree.setProps',
      integrationStatus: 'catalog-only',
      paramsRef: 'sparkNodeTree.setProps',
    })
  })

  it('catalog 应强调核心层隔离和命名参数约束', () => {
    const addNode = getSparkNodeTreeToolParameterRow('sparkNodeTree.addNode')
    const listChildren = getSparkNodeTreeToolParameterRow('sparkNodeTree.listChildren')

    expect(addNode?.usageRules).toContain('本 catalog 只定义核心层动作目录，不接 spark-ai stills registry，也不提供 execute 实现。')
    expect(addNode?.usageRules).toContain('运行时应优先使用命名参数对象，而不是位置参数。')
    expect(addNode?.usageRules).toContain('parentComponentId 仅接受 string 或 null 原子值，禁止对象嵌套（例如 { componentId: "root-table" }）。')
    expect(listChildren?.failureModes.map(item => item.code)).toContain('PARENT_NOT_FOUND')
  })

  it('catalog 应对高风险 children 写动作声明必填字段', () => {
    const addNode = getSparkNodeTreeToolParameterRow('sparkNodeTree.addNode')
    const addNodes = getSparkNodeTreeToolParameterRow('sparkNodeTree.addNodes')

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
    expect(getSparkNodeTreeToolParameterRow('sparkNodeTree.getAllData')?.coreMethod).toBe('getAllData')
    expect(getSparkNodeTreeToolParameterRow('sparkNodeTree.addNodes')?.coreMethod).toBe('addNodes')
    expect(getSparkNodeTreeToolParameterRow('sparkNodeTree.setPropsBatch')?.coreMethod).toBe('setPropsBatch')
    expect(getSparkNodeTreeToolParameterRow('sparkNodeTree.replaceNodes')?.coreMethod).toBe('replaceNodes')
    expect(getSparkNodeTreeToolParameterRow('sparkNodeTree.removeNodes')?.coreMethod).toBe('removeNodes')
    expect(getSparkNodeTreeToolParameterRow('sparkNodeTree.findByType')?.coreMethod).toBe('findByType')
    expect(getSparkNodeTreeToolParameterRow('sparkNodeTree.undo')).toBeUndefined()
    expect(getSparkNodeTreeToolParameterRow('sparkNodeTree.redo')).toBeUndefined()
    expect(getSparkNodeTreeToolParameterRow('sparkNodeTree.listVersions')).toBeUndefined()
  })

  it('findByType 应返回可直接用于 componentId 的真实 id 指引', () => {
    const row = getSparkNodeTreeToolParameterRow('sparkNodeTree.findByType')
    const usageRules = row?.usageRules ?? []
    expect(usageRules.some(rule => rule.includes('真实 componentId'))).toBe(true)
  })
})
