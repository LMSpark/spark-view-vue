import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { listManifestAttributeReachableKinds } from '../metadata/vcm-bundle-assembler'
import {
  compareVcmBundleWithMonolithicRuntime,
  loadVcmBundlePartsFromDist,
} from '../metadata/vcm-bundle-parity'
import { resolveModuleMetadataJson } from '../metadata/resolve-api-object-metadata'
import { readModuleMetadataRuntimeDocument } from '../metadata/module-metadata-runtime-document'

const root = resolve(import.meta.dirname, '../../../../..')
const distDir = resolve(root, 'generated/vcm/project-page-surface')

describe('VCM bundle assembler', () => {
  it('reassembles split kinds into the same module shape as monolithic runtime', () => {
    const monolithicRaw = readJson(resolve(distDir, 'project-page-surface-module-metadata.runtime.generated.json'))
    const bundleParts = loadVcmBundlePartsFromDist(distDir, readJson)
    const parityIssues = compareVcmBundleWithMonolithicRuntime({
      bundle: bundleParts,
      monolithic: monolithicRaw,
    })

    expect(parityIssues).toEqual([])
    expect(listManifestAttributeReachableKinds(bundleParts.manifest)).toEqual([
      'project',
      'config-page',
      'node-tree',
      'dataset',
      'data-table',
      'data-view',
    ])

    const monolithic = readModuleMetadataRuntimeDocument(monolithicRaw)
    const resolvedMonolithic = resolveModuleMetadataJson(monolithic.modules[0]!, {
      ...(monolithic.$defs === undefined ? {} : { schemaDefs: monolithic.$defs }),
    })
    expect(resolvedMonolithic.rootApi.kind).toBe('project')
  })
})

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}
