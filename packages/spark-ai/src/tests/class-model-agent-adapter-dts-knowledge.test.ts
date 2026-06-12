import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { ClassModelAgentAdapter } from '../agent'
import { buildDtsClassModelBundle } from '../class-model/class-model/build-dts-class-model-bundle'
import { CLASS_MODEL_TOOL_NAMES } from '../class-model'

class DemoBusiness {
  public status = 'ready'
}

describe('ClassModelAgentAdapter DTS knowledge wiring', () => {
  it('creates dynamic DTS knowledge when registration only provides manifest and root class', async () => {
    const tempRoot = resolve(tmpdir(), `spark-agent-dts-knowledge-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'declarations/packages/spark-ai/src/tests/demo-business.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** Business root exposed to ClassModel runtime. */',
        'export class DemoBusiness {',
        '  /** Current runtime status. */',
        '  status: string',
        '}',
      ].join('\n'), 'utf8')

      const bundle = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const registration = ClassModelAgentAdapter.createRegistration({
        moduleClass: DemoBusiness,
        options: {
          moduleId: 'demoBusiness',
          rootClassName: 'DemoBusiness',
          dtsClassModelManifestUrl: pathToFileURL(bundle.manifestPath).href,
          dtsClassModelFetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
        },
      })

      const result = await registration.runtime.executeTool(
        CLASS_MODEL_TOOL_NAMES.query,
        { includeMembers: true },
        {
          moduleId: 'demoBusiness',
          moduleInstanceId: 'demo',
          instanceId: 'demo',
        },
      )
      const payload = result.data as {
        rootKind?: string
        models?: Array<{
          kind?: string
          attributes?: Array<{ name?: string }>
        }>
      } | undefined

      expect(result.ok).toBe(true)
      expect(payload?.rootKind).toBe('DemoBusiness')
      expect(payload?.models?.[0]?.kind).toBe('DemoBusiness')
      expect(payload?.models?.[0]?.attributes?.map(attribute => attribute.name)).toContain('status')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
