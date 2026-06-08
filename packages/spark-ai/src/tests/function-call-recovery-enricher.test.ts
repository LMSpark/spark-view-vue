import { describe, expect, it } from 'vitest'

import { enrichFunctionCallResult } from '../agent/tool-loop/function-call-recovery-enricher'
import { VCM_NATIVE_TOOL_NAMES } from '../vcm-native'

describe('enrichFunctionCallResult', () => {
  it('adds VCM-native schema recovery checks for invalid tool args', () => {
    const invalidArgs = enrichFunctionCallResult({
      protocolToolName: VCM_NATIVE_TOOL_NAMES.actionGuide,
      args: { kind: 'task', actionName: 'doWork' },
      callResult: {
        ok: false,
        code: 'INVALID_TOOL_ARGS',
        msg: 'missing args',
        fix: 'fix shape',
      },
    })

    expect(invalidArgs.ok).toBe(false)
    if (invalidArgs.ok) return
    expect(invalidArgs.fix).toContain('vcm_action_guide')
    expect(invalidArgs.checks?.some(check => check.message.includes('actionName'))).toBe(true)
    expect(invalidArgs.checks?.some(check => check.message.includes('vcm_script 形状'))).toBe(true)
    expect(invalidArgs.checks?.some(check => check.message.includes('module_'))).toBe(false)
  })

  it('adds pageDesign script hints for script execution failures', () => {
    const scriptFailed = enrichFunctionCallResult({
      protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
      args: { script: 'page.editDataSet({})' },
      callResult: {
        ok: false,
        code: 'SCRIPT_EXECUTION_FAILED',
        msg: 'editDataSet is not a function',
        fix: 'fix script',
      },
    })

    expect(scriptFailed.ok).toBe(false)
    if (scriptFailed.ok) return
    expect(scriptFailed.checks?.some(check => check.message.includes('openPageDesign'))).toBe(true)
    expect(scriptFailed.checks?.some(check => check.message.includes('module_find'))).toBe(false)
  })

  it('rejects old script argument aliases in recovery guidance', () => {
    const invalidScript = enrichFunctionCallResult({
      protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
      args: { code: 'return 1' },
      callResult: {
        ok: false,
        code: 'INVALID_VCM_NATIVE_TOOL_ARGS',
        msg: 'script required',
        fix: 'use schema',
      },
    })

    expect(invalidScript.ok).toBe(false)
    if (invalidScript.ok) return
    expect(invalidScript.checks?.some(check => check.message.includes('不再接受 code/javascript/path'))).toBe(true)
  })
})
