import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { generateModuleAbilityMetadata } from '../module-metadata-generator'

const root = resolve(import.meta.dirname, '../../../..')

const pageDesignSources = [
  'packages/spark-project-model/src/entity/project/project.entity.ts',
  'packages/spark-project-model/src/entity/node/config-page.entity.ts',
  'packages/spark-data/src/dataset-crud-tool.ts',
  'packages/spark-data/src/node-tree/spark-node-tree.ts',
] as const

const tempRoots: string[] = []

describe('page-design VCM metadata reflection', () => {
  afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

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

  it('writes ProjectModel through the native Vue metadata envelope', { timeout: 30_000 }, () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'spark-page-design-vcm-'))
    tempRoots.push(tempRoot)
    const outFile = join(tempRoot, 'page-design-vcm-metadata.generated.json')

    const result = generateModuleAbilityMetadata(root, {
      sources: pageDesignSources,
      vcmCatalogOutFile: outFile,
      apiRoots: ['ProjectModel'],
    })

    expect(result.vcmCatalogOutFile).toBe(outFile)
    const generated = JSON.parse(readFileSync(outFile, 'utf8')) as {
      name?: string
      description?: string
      type?: unknown
      props?: Array<{
        name?: string
        schema?: {
          kind?: string
          type?: string
          schema?: Record<string, unknown>
        }
      }>
      events?: unknown[]
      slots?: unknown[]
      exposed?: unknown[]
    }
    const projectProp = generated.props?.find(prop => prop.name === 'ProjectModel')
    expect(generated).toMatchObject({
      props: expect.any(Array),
      events: expect.any(Array),
      slots: expect.any(Array),
      exposed: expect.any(Array),
    })
    expect(projectProp).toMatchObject({
      name: 'ProjectModel',
      schema: {
        kind: 'object',
        type: 'ProjectModel',
      },
    })
    expect(projectProp?.schema?.schema).toHaveProperty('projectId')
  })
})
