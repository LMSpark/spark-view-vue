import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  VCM_CONFIG_PROTOCOL,
  createVcmTargetGeneratorOptions,
  findVcmMetadataTarget,
  readVcmMetadataConfig,
} from '../vcm-config'

const tempRoots: string[] = []

describe('VCM registry config protocol', () => {
  afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('reads native metadata targets and maps them to generator options', () => {
    const root = createTempRoot()
    writeJson(root, 'config/ai/vcm.json', {
      protocol: VCM_CONFIG_PROTOCOL,
      schemaVersion: 1,
      metadataTargets: [{
        id: 'page-design',
        kind: 'native-metadata',
        source: {
          files: ['packages/spark-project-model/src/project/project-model.ts'],
        },
        roots: [{ className: 'ProjectModel', kind: 'project' }],
        outputs: {
          vcmCatalog: 'src/services/page-design/page-design-module-metadata.generated.json',
          apiDiagnostics: 'src/services/page-design/page-design-module-metadata.api.generated.json',
          runtime: 'src/services/page-design/page-design-module-metadata.runtime.generated.json',
        },
      }],
    })

    const config = readVcmMetadataConfig(root)
    const target = findVcmMetadataTarget(config, 'page-design')
    const options = createVcmTargetGeneratorOptions(target, { writeFiles: false })

    expect(target.roots).toEqual([{ className: 'ProjectModel', kind: 'project' }])
    expect(options).toMatchObject({
      sources: ['packages/spark-project-model/src/project/project-model.ts'],
      apiRoots: ['ProjectModel'],
      vcmCatalogOutFile: 'src/services/page-design/page-design-module-metadata.generated.json',
      moduleOutFile: 'src/services/page-design/page-design-module-metadata.api.generated.json',
      moduleRuntimeOutFile: 'src/services/page-design/page-design-module-metadata.runtime.generated.json',
      writeFiles: false,
    })
  })

  it('rejects non-protocol JSON early', () => {
    const root = createTempRoot()
    writeJson(root, 'config/ai/vcm.json', {
      schemaVersion: 1,
      targets: [],
    })

    expect(() => readVcmMetadataConfig(root)).toThrow('protocol must be')
  })
})

function createTempRoot(): string {
  const root = join(tmpdir(), `spark-vcm-config-${String(Date.now())}-${String(tempRoots.length)}`)
  mkdirSync(root, { recursive: true })
  tempRoots.push(root)
  return root
}

function writeJson(root: string, relativeFile: string, value: unknown): void {
  const filePath = join(root, relativeFile)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
