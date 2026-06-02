import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { generateModuleAbilityMetadata } from '../module-metadata-generator'

const root = resolve(import.meta.dirname, '../../../..')

const pageDesignSources = [
  'packages/spark-project-model/src/entity/project/project.entity.ts',
  'packages/spark-project-model/src/entity/node/config-page.entity.ts',
  'packages/spark-data/src/dataset-crud-tool.ts',
  'packages/spark-data/src/node-tree/spark-node-tree.ts',
] as const

describe('page-design VCM metadata reflection', () => {
  it('extracts ProjectModel without the legacy nodes child model', () => {
    const result = generateModuleAbilityMetadata(root, {
      sources: pageDesignSources,
      outFile: 'unused/ability.json',
      moduleOutFile: 'unused/module.json',
      apiRoots: ['ProjectModel'],
      extractResults: true,
      writeFiles: false,
    })

    expect(result.moduleMetadata).toHaveLength(1)
    const projectApi = result.moduleMetadata[0]?.rootApi
    expect(projectApi?.kind).toBe('project')
    expect(projectApi?.actions.map(action => action.name)).toEqual([])
    expect(projectApi?.attributes?.map(attribute => attribute.name)).toEqual([
      'children',
      'projectId',
      'root',
      'navigationChildren',
      'flatRows',
    ])
    expect(projectApi?.attributes?.find(attribute => attribute.name === 'nodes')).toBeUndefined()
    expect(result.diagnostics).toMatchObject({
      moduleCount: 1,
      resultApiCount: 0,
      referencedApiKinds: [],
      emptySchemaNodeCount: 0,
    })
    expect(result.diagnostics.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'module-result-apis-empty',
        target: 'project',
      }),
    ]))
  })
})
