import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as SparkComponentApi from '../packages/spark-component/src/index'

const ROOT_INDEX_FILE = join(process.cwd(), 'packages', 'spark-component', 'src', 'index.ts')

describe('spark-component public only root api', () => {
  it('does not leak internal grouped barrels or internal capability keys to public root', () => {
    const forbiddenKeys = [
      'coreFiles',
      'systemFiles',
      'pageFiles',
      'componentFiles',
      'pageContextFiles',
      'pageServiceFiles',
      'pageSandboxFiles',
      'pageActionFiles',
      'pageBindingFiles',
      'INTERNAL_PARENT_CAPABILITY_CONTEXT_KEY',
    ]

    for (const key of forbiddenKeys) {
      expect(SparkComponentApi).not.toHaveProperty(key)
    }
  })

  it('does not re-export deprecated type aliases from public root', () => {
    const source = readFileSync(ROOT_INDEX_FILE, 'utf8')
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
})