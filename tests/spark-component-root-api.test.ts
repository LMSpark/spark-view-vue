import { describe, expect, it } from 'vitest'
import * as SparkComponentApi from '../packages/spark-component/src/index'

function pickRootKeys(): string[] {
  return Object.keys(SparkComponentApi)
    .filter(key => {
      if (key.endsWith('Ui')) return true
      if (key.endsWith('UiComposables')) return true
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
        "containerActionComposables",
        "containerComposables",
        "containerContextComposables",
        "containerDataComponentComposables",
        "containerDataComponents",
        "containerDataComponentSupport",
        "containerDataComposables",
        "containerDataUi",
        "containerDataUiComposables",
        "containerLayoutComposables",
        "containerNonDataComponentComposables",
        "containerNonDataComponents",
        "containerNonDataUi",
        "containerNonDataUiComposables",
        "createComponentRegistry",
        "createSparkPlugin",
        "fieldActionComposables",
        "fieldComposables",
        "fieldContextComposables",
        "fieldDataComponentComposables",
        "fieldDataComponents",
        "fieldDataComponentSupport",
        "fieldDataUi",
        "fieldDataUiComposables",
        "fieldNonDataComponentComposables",
        "fieldNonDataComponents",
        "fieldNonDataUi",
        "fieldNonDataUiComposables",
        "fieldOptionComposables",
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