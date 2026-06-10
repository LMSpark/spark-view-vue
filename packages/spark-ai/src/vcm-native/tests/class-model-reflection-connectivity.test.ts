import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  auditClassModelReflectionConnectivity,
  createClassModelDocumentFromRuntimeDocument,
  listAttributeReachableKinds,
  projectClassModelFromApi,
  resolveModuleApi,
} from '../index'

type RuntimeDocumentForTest = Parameters<typeof createClassModelDocumentFromRuntimeDocument>[0]

describe('ClassModel reflection connectivity', () => {
  it('projects every apiRegistry kind on demand without a stored models map', () => {
    const document = createClassModelDocumentFromRuntimeDocument(readPageDesignRuntimeDocument())
    expect(document).not.toHaveProperty('models')
    expect(() => projectClassModelFromApi(resolveModuleApi(document, 'node-tree'))).not.toThrow()
  })

  it('reaches page-design kinds via project.activePage attribute chain', () => {
    const document = createClassModelDocumentFromRuntimeDocument(readPageDesignRuntimeDocument())
    const issues = auditClassModelReflectionConnectivity(document)
    const unreachable = issues
      .filter(issue => issue.code === 'REFLECTION_KIND_UNREACHABLE_VIA_ATTRIBUTES')
      .map(issue => issue.path)
      .sort()

    expect(unreachable).toEqual([])
    expect([...listAttributeReachableKinds(document)].sort()).toEqual([
      'config-page',
      'data-table',
      'data-view',
      'dataset',
      'node-tree',
      'project',
    ])
  })

  it('detects attribute.api targets missing from apiRegistry', () => {
    const document = createClassModelDocumentFromRuntimeDocument({
      modules: [{
        schemaVersion: 2,
        rootApi: {
          kind: 'demo-root',
          name: 'DemoRoot',
          description: 'root',
          actions: [],
          attributes: [{
            name: 'child',
            description: 'child',
            schema: { type: 'object', title: 'DemoChild' },
            readable: true,
            writable: false,
            api: {
              kind: 'missing-child',
              name: 'DemoChild',
              description: 'child',
              actions: [],
            },
          }],
        },
        apiRegistry: {},
      }],
    })

    const issues = auditClassModelReflectionConnectivity(document)
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'REFLECTION_ATTRIBUTE_API_DISCONNECTED',
      path: 'demo-root.attributes.child',
    }))
  })
})

function readPageDesignRuntimeDocument(): RuntimeDocumentForTest {
  const root = resolve(import.meta.dirname, '../../../../..')
  return JSON.parse(
    readFileSync(
      resolve(root, 'generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime.generated.json'),
      'utf8',
    ),
  ) as RuntimeDocumentForTest
}
