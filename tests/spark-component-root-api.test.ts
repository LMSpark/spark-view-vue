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
        'SparkComponentRenderer',
        'registerAllRenderers',
        'useSparkComponent',
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
        "fieldComposables",
        "fieldDataComponentComposables",
        "fieldDataComponents",
        "fieldDataComponentSupport",
        "fieldNonDataComponentComposables",
        "fieldNonDataComponents",
        "getGlobalRegistry",
        "registerAllRenderers",
        "Spark",
        "SparkComponentRenderer",
        "useSparkComponent",
        "useSparkConsume",
      ]
    `)
  })
})