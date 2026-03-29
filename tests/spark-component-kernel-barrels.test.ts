import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as CoreApi from '../packages/spark-component/src/core/index'
import * as SystemApi from '../packages/spark-component/src/system/index'
import * as InternalApi from '../packages/spark-component/src/internal/index'

const CORE_INDEX_FILE = join(process.cwd(), 'packages', 'spark-component', 'src', 'core', 'index.ts')
const CORE_TYPES_FILE = join(process.cwd(), 'packages', 'spark-component', 'src', 'core', 'types.ts')

function sortedKeys(record: object): string[] {
  return Object.keys(record).sort((left, right) => left.localeCompare(right))
}

describe('spark-component kernel barrels', () => {
  it('exposes stable core and system grouped barrels', () => {
    expect({
      core: sortedKeys(CoreApi).filter(key => [
        'useSparkComponent',
        'useSparkPageComponent',
        'useSparkConsume',
        'PAGE_DATASET',
        'DATA_SOURCE',
        'SPARK_REGISTRY_KEY',
        'SPARK_NODE_STRUCT_KEYS',
        'DEFAULT_DOCK',
      ].includes(key)),
      system: sortedKeys(SystemApi),
    }).toMatchInlineSnapshot(`
      {
        "core": [
          "DATA_SOURCE",
          "DEFAULT_DOCK",
          "PAGE_DATASET",
          "SPARK_NODE_STRUCT_KEYS",
          "SPARK_REGISTRY_KEY",
          "useSparkComponent",
          "useSparkConsume",
          "useSparkPageComponent",
        ],
        "system": [
          "createComponentRegistry",
          "createSparkPlugin",
          "getGlobalRegistry",
          "Spark",
        ],
      }
    `)
  })

  it('keeps internal convenience barrel grouped by domain', () => {
    expect(sortedKeys(InternalApi)).toMatchInlineSnapshot(`
      [
        "bindAppRootCapabilityContext",
        "bindCapabilityContextOwner",
        "resolveParentCapabilityContext",
        "unbindAppRootCapabilityContext",
        "unbindCapabilityContextOwner",
      ]
    `)
  })

  it('does not re-export deprecated type aliases from core barrel', () => {
    const source = readFileSync(CORE_INDEX_FILE, 'utf8')
    const forbiddenTypeExports = [
      'SparkNodeFilterItem',
      'SparkNodeToolbar',
      'SparkNodeActions',
      'SparkNodeFilter',
      'ComponentContext',
    ]

    for (const typeName of forbiddenTypeExports) {
      expect(source).not.toContain(typeName)
    }
  })

  it('does not keep deprecated type definitions in core types', () => {
    const source = readFileSync(CORE_TYPES_FILE, 'utf8')
    const forbiddenTypeDefinitions = [
      'SparkNodeFilterItem',
      'SparkNodeToolbar',
      'SparkNodeActions',
      'SparkNodeFilter',
      'ComponentContext',
    ]

    for (const typeName of forbiddenTypeDefinitions) {
      expect(source).not.toContain(typeName)
    }
  })
})