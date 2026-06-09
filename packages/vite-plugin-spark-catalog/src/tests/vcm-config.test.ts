import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  VCM_CONFIG_PROTOCOL,
  createVcmTargetGeneratorOptions,
  findVcmMetadataTarget,
  readVcmMetadataConfig,
  resolveComponentCatalogOutput,
} from '../vcm-config'

const tempRoots: string[] = []

describe('VCM registry config protocol', () => {
  afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('reads capability-surface targets and maps them to generator options', () => {
    const root = createTempRoot()
    writeJson(root, 'config/ai/vcm.json', {
      protocol: VCM_CONFIG_PROTOCOL,
      schemaVersion: 1,
      componentCatalogOutput: 'generated/vcm/component-catalog.json',
      metadataTargets: [{
        id: 'project-page-surface',
        kind: 'native-metadata',
        source: {
          files: ['packages/spark-project-model/src/project/project-model.ts'],
        },
        roots: [{ className: 'ProjectModel', kind: 'project' }],
        outputs: {
          runtime: 'generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime.generated.json',
          jsdocTodoLog: 'generated/vcm/project-page-surface/project-page-surface-module-metadata.jsdoc-todo.generated.json',
        },
      }],
    })

    const config = readVcmMetadataConfig(root)
    const target = findVcmMetadataTarget(config, 'project-page-surface')
    const options = createVcmTargetGeneratorOptions(target, { writeFiles: false })

    expect(target.roots).toEqual([{ className: 'ProjectModel', kind: 'project' }])
    expect(resolveComponentCatalogOutput(config)).toBe('generated/vcm/component-catalog.json')
    expect(options).toMatchObject({
      sources: ['packages/spark-project-model/src/project/project-model.ts'],
      apiRoots: ['ProjectModel'],
      moduleRuntimeOutFile: 'generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime.generated.json',
      jsdocTodoLogOutFile: 'generated/vcm/project-page-surface/project-page-surface-module-metadata.jsdoc-todo.generated.json',
      writeFiles: false,
    })
  })

  it('maps project-model surface separately from page surface', () => {
    const root = createTempRoot()
    writeJson(root, 'config/ai/vcm.json', {
      protocol: VCM_CONFIG_PROTOCOL,
      schemaVersion: 1,
      metadataTargets: [
        {
          id: 'project-model',
          kind: 'native-metadata',
          source: { files: ['packages/spark-project-model/src/project/project-model.ts'] },
          roots: [{ className: 'ProjectModel', kind: 'project' }],
          outputs: {
            runtime: 'generated/vcm/project-model/project-model-module-metadata.runtime.generated.json',
            jsdocTodoLog: 'generated/vcm/project-model/project-model-module-metadata.jsdoc-todo.generated.json',
          },
        },
        {
          id: 'project-page-surface',
          kind: 'native-metadata',
          source: { files: ['packages/spark-project-model/src/project/project-model.ts'] },
          roots: [{ className: 'ProjectModel', kind: 'project' }],
          outputs: {
            runtime: 'generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime.generated.json',
            jsdocTodoLog: 'generated/vcm/project-page-surface/project-page-surface-module-metadata.jsdoc-todo.generated.json',
          },
        },
      ],
    })

    const config = readVcmMetadataConfig(root)
    const target = findVcmMetadataTarget(config, 'project-model')
    const options = createVcmTargetGeneratorOptions(target, { writeFiles: false })

    expect(target.source.files).toEqual(['packages/spark-project-model/src/project/project-model.ts'])
    expect(options).toMatchObject({
      moduleRuntimeOutFile: 'generated/vcm/project-model/project-model-module-metadata.runtime.generated.json',
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
