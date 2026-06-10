import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectVcmFailureModeRecoveryHints } from '../recovery/vcm-failure-mode-recovery'
import type { AiModuleMetadataJson } from '../metadata'
import { readModuleMetadataRuntimeDocument } from '../metadata/module-metadata-runtime-document'

function resolveProjectMetadata(): AiModuleMetadataJson {
  const root = resolve(import.meta.dirname, '../../../../..')
  const raw = JSON.parse(
    readFileSync(
      resolve(root, 'generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime.generated.json'),
      'utf8',
    ),
  )
  const runtime = readModuleMetadataRuntimeDocument(raw)
  const projectModule = runtime.modules.find(
    (module: AiModuleMetadataJson) => module.rootApi.kind === 'project',
  )
  if (projectModule === undefined) {
    throw new Error('project module metadata missing')
  }
  return projectModule
}

describe('collectVcmFailureModeRecoveryHints', () => {
  it('derives openPageDesign hint from @failureMode when editDataSet is not a function', () => {
    const metadata = resolveProjectMetadata()
    const hints = collectVcmFailureModeRecoveryHints(metadata, {
      callResult: {
        code: 'SCRIPT_EXECUTION_FAILED',
        msg: 'editDataSet is not a function',
      },
      moduleInstanceId: 'leave-request-page',
    })

    expect(hints.some(hint => hint.includes('openPageDesign'))).toBe(true)
    expect(hints.some(hint => hint.includes('pageId: "leave-request-page"'))).toBe(true)
    expect(hints.some(hint => hint.includes('vcm_action_guide'))).toBe(true)
  })

  it('derives editNodeTree call-chain hint from @failureMode', () => {
    const metadata = resolveProjectMetadata()
    const hints = collectVcmFailureModeRecoveryHints(metadata, {
      callResult: {
        code: 'SCRIPT_EXECUTION_FAILED',
        msg: '.call is not a function',
      },
    })

    expect(hints.some(hint => hint.includes('editNodeTree'))).toBe(true)
  })

  it('returns empty hints when code has no matching failureMode', () => {
    const metadata = resolveProjectMetadata()
    const hints = collectVcmFailureModeRecoveryHints(metadata, {
      callResult: {
        code: 'UNKNOWN_CODE_XYZ',
        msg: 'anything',
      },
    })
    expect(hints).toEqual([])
  })
})
