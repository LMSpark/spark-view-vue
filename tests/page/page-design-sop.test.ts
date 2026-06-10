import { describe, expect, it } from 'vitest'
import { VCM_NATIVE_TOOL_NAMES } from '@spark-appworks/spark-ai/vcm-native'
import {
  buildPageDesignToolLoopNudge,
  PAGE_DESIGN_RECOVERY_RULES,
  pageDesignScriptShapeLines,
  readPageDesignHint,
  resolvePageDesignRecoveryHints,
} from '@/services/page-design/page-design-sop'

const FIXTURE_PAGE_ID = 'leave-request-page'

describe('pageDesignScriptShapeLines', () => {
  it('interpolates pageId and includes script chain keywords', () => {
    const lines = pageDesignScriptShapeLines(FIXTURE_PAGE_ID)
    expect(lines.join('\n')).toContain('openPageDesign')
    expect(lines.join('\n')).toContain(`pageId: "${FIXTURE_PAGE_ID}"`)
    expect(lines.join('\n')).toContain('createTable({ tableName')
  })
})

describe('buildPageDesignToolLoopNudge', () => {
  it('includes createTableNamedArgs reminder on vcm_script_retry', () => {
    const nudge = buildPageDesignToolLoopNudge('vcm_script_retry', FIXTURE_PAGE_ID)
    expect(nudge).toContain(readPageDesignHint('createTableNudgeReminder'))
    expect(nudge).toContain(FIXTURE_PAGE_ID)
  })
})

describe('resolvePageDesignRecoveryHints', () => {
  it('returns openPageFirst hint when editDataSet is not a function', () => {
    const hints = resolvePageDesignRecoveryHints({
      protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
      args: { script: 'page.editDataSet({})' },
      callResult: {
        ok: false,
        code: 'SCRIPT_EXECUTION_FAILED',
        msg: 'editDataSet is not a function',
        fix: 'fix script',
      },
    })
    expect(hints.some(hint => hint.includes('openPageDesign'))).toBe(true)
    expect(hints.some(hint => hint.includes(readPageDesignHint('openPageFirst')))).toBe(true)
  })

  it('interpolates moduleInstanceId into openPageFirst recovery hint', () => {
    const hints = resolvePageDesignRecoveryHints({
      protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
      args: { script: 'page.editDataSet({})' },
      moduleInstanceId: FIXTURE_PAGE_ID,
      callResult: {
        ok: false,
        code: 'SCRIPT_EXECUTION_FAILED',
        msg: 'editDataSet is not a function',
        fix: 'fix script',
      },
    })
    expect(hints.some(hint => hint.includes(`pageId: "${FIXTURE_PAGE_ID}"`))).toBe(true)
  })

  it('returns vcmQueryShape hint for invalid vcm_query member args', () => {
    const hints = resolvePageDesignRecoveryHints({
      protocolToolName: VCM_NATIVE_TOOL_NAMES.query,
      args: { member: 'rows' },
      callResult: {
        ok: false,
        code: 'INVALID_VCM_NATIVE_TOOL_ARGS',
        msg: 'unknown member field',
        fix: 'fix args',
      },
    })
    expect(hints).toContain(readPageDesignHint('vcmQueryShape'))
  })

  it('covers every recovery rule with a matching command', () => {
    const samples: Record<number, Parameters<typeof resolvePageDesignRecoveryHints>[0]> = {
      0: {
        protocolToolName: VCM_NATIVE_TOOL_NAMES.actionGuide,
        args: { kind: 'project', actionName: 'missing' },
        callResult: { ok: false, code: 'FUNCTION_NOT_FOUND', msg: 'missing', fix: 'fix' },
      },
      1: {
        protocolToolName: VCM_NATIVE_TOOL_NAMES.query,
        args: { member: 'x' },
        callResult: { ok: false, code: 'INVALID_VCM_NATIVE_TOOL_ARGS', msg: 'member invalid', fix: 'fix' },
      },
      2: {
        protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
        args: { script: 'function foo(){}' },
        callResult: {
          ok: false,
          code: 'SCRIPT_EXECUTION_FAILED',
          msg: 'Function statements require a function name',
          fix: 'fix',
        },
      },
      3: {
        protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
        args: { script: 'x.toJSON()' },
        callResult: { ok: false, code: 'SCRIPT_EXECUTION_FAILED', msg: 'toJSON failed', fix: 'fix' },
      },
      4: {
        protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
        args: { script: 'page.call()' },
        callResult: {
          ok: false,
          code: 'SCRIPT_EXECUTION_FAILED',
          msg: '.call is not a function',
          fix: 'fix',
        },
      },
      5: {
        protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
        args: { script: 'page.editDataSet({})' },
        callResult: {
          ok: false,
          code: 'SCRIPT_EXECUTION_FAILED',
          msg: 'editDataSet is not a function',
          fix: 'fix',
        },
      },
      6: {
        protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
        args: { script: 'page.editNodeTree({})' },
        callResult: {
          ok: false,
          code: 'SCRIPT_EXECUTION_FAILED',
          msg: 'editNodeTree is not a function',
          fix: 'fix',
        },
      },
      7: {
        protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
        args: { script: 'ds.createTable("x")' },
        callResult: {
          ok: false,
          code: 'SCRIPT_EXECUTION_FAILED',
          msg: "reading 'includes'",
          fix: 'fix',
        },
      },
      8: {
        protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
        args: { script: 'page.editDataSet({ tableName: "x" })' },
        callResult: {
          ok: false,
          code: 'SCRIPT_EXECUTION_FAILED',
          msg: 'run is not a function',
          fix: 'fix',
        },
      },
      9: {
        protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
        args: { script: 'throw 1' },
        callResult: { ok: false, code: 'SCRIPT_EXECUTION_FAILED', msg: 'boom', fix: 'fix' },
      },
      10: {
        protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
        args: { script: 'page.editDataSet({})' },
        callResult: {
          ok: false,
          code: 'SCHEMA_VALIDATION_FAILED',
          msg: 'editDataSet requires a callback argument',
          fix: 'fix',
        },
      },
      11: {
        protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
        args: { script: 'page.editDataSet({})' },
        callResult: {
          ok: false,
          code: 'SCHEMA_VALIDATION_FAILED',
          msg: 'editDataSet must be a function',
          fix: 'fix',
        },
      },
    }

    for (let index = 0; index < PAGE_DESIGN_RECOVERY_RULES.length; index += 1) {
      const rule = PAGE_DESIGN_RECOVERY_RULES[index]
      const command = samples[index]
      if (rule === undefined || command === undefined) {
        throw new Error(`missing rule or sample at index ${index}`)
      }
      const hints = resolvePageDesignRecoveryHints(command)
      for (const key of rule.hintKeys) {
        expect(hints, `rule ${index} key ${key}`).toContain(readPageDesignHint(key))
      }
    }
  })
})
