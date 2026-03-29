import { describe, expect, it } from 'vitest'
import * as SparkComponentApi from '../packages/spark-component/src/index'

function pickRootKeys(): string[] {
  return Object.keys(SparkComponentApi)
    .filter(key => {
      if (key.endsWith('Components')) return true
      if (key.endsWith('Composables')) return true
      if (key.endsWith('Support')) return true
      return [
        'Spark',
        'ElTableColumns',
        'SparkChildrenBridge',
        'SparkComponentRenderer',
        'SparkTableColumns',
        'registerAllRenderers',
        'permission',
        'useSparkComponent',
        'useSparkHost',
        'useSparkHostScope',
        'useSparkPageComponent',
        'useSparkConsume',
        'createSparkPlugin',
        'createComponentRegistry',
        'getGlobalRegistry',
      ].includes(key)
    })
    .sort((left, right) => left.localeCompare(right))
}

describe('spark-component root api', () => {
  it('keeps the grouped public root surface stable', () => {
    expect(pickRootKeys()).toMatchInlineSnapshot(`
      [
        "componentComposables",
        "containerComposables",
        "containerDataComponentComposables",
        "containerDataComponents",
        "containerDataComponentSupport",
        "containerNonDataComponentComposables",
        "containerNonDataComponents",
        "createComponentRegistry",
        "createSparkPlugin",
        "ElTableColumns",
        "fieldComposables",
        "fieldDataComponentComposables",
        "fieldDataComponents",
        "fieldDataComponentSupport",
        "fieldNonDataComponentComposables",
        "fieldNonDataComponents",
        "getGlobalRegistry",
        "permission",
        "registerAllRenderers",
        "Spark",
        "SparkChildrenBridge",
        "SparkComponentRenderer",
        "SparkTableColumns",
        "useSparkComponent",
        "useSparkConsume",
        "useSparkHost",
        "useSparkHostScope",
        "useSparkPageComponent",
      ]
    `)
  })
})