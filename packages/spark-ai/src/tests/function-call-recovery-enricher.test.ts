import { describe, expect, it } from 'vitest'

import { enrichFunctionCallResult } from '../agent/tool-loop/function-call-recovery-enricher'
import { PROTOCOL_TOOL_NAMES } from '../modules/internal/protocol-tool-generator'
import { paramsSchema, stringSchema } from '../json'
import {
  AiModule,
  AiModuleResult,
  AiModuleRuntime,
  type AiModuleInstanceRef,
} from '../modules'

function createTaskRuntime(): AiModuleRuntime {
  const runtime = new AiModuleRuntime()
  runtime.register(new AiModule({
    kind: 'task',
    name: 'Task',
    description: 'Task module.',
    functions: [{
      name: 'doWork',
      description: 'Execute work.',
      paramsSchema: paramsSchema({ input: stringSchema('Work input.') }, ['input']),
      requiredBeforeCall: ['先确认目标 task 实例。'],
      usageRules: ['禁止在未 guide 前猜参数。'],
      failureModes: [
        { code: 'SCHEMA_VALIDATION_FAILED', when: '参数不符合 schema', fix: '重新读取 module_function_guide 并按 paramsSchema 构造 args。' },
      ],
    }],
    runner: (_ctx, _functionName, args) => AiModuleResult.ok(args),
    find: () => AiModuleResult.ok<readonly AiModuleInstanceRef[]>([{ id: 'task-1', label: 'Task' }]),
  }))
  return runtime
}

describe('enrichFunctionCallResult', () => {
  it('反查 VCM failureMode 与 guide/catalog 步骤并回灌 RECOVERY_HINT checks', () => {
    const runtime = createTaskRuntime()
    const enriched = enrichFunctionCallResult({
      runtime,
      protocolToolName: 'doWork',
      args: { input: '' },
      callResult: {
        ok: false,
        code: 'SCHEMA_VALIDATION_FAILED',
        msg: 'params invalid',
        fix: 'fix args',
      },
    })

    expect(enriched.ok).toBe(false)
    if (enriched.ok) return
    expect(enriched.fix).toContain('module_function_guide')
    expect(enriched.checks?.some(check => check.code === 'RECOVERY_HINT')).toBe(true)
    expect(enriched.checks?.some(check => check.message.includes('module_query'))).toBe(true)
    expect(enriched.checks?.some(check => check.message.includes('VCM failureMode(SCHEMA_VALIDATION_FAILED)'))).toBe(true)
  })

  it('为 INVALID_TOOL_ARGS 回灌 schema 与 module_script 形状提示（不含 path 语法）', () => {
    const runtime = createTaskRuntime()
    const invalidArgs = enrichFunctionCallResult({
      runtime,
      protocolToolName: 'doWork',
      args: { pageId: 'page-1' },
      callResult: {
        ok: false,
        code: 'INVALID_TOOL_ARGS',
        msg: 'missing args',
        fix: 'fix shape',
      },
    })
    if (invalidArgs.ok) return
    expect(invalidArgs.checks?.some(check => check.message.includes('module_function_guide'))).toBe(true)
    expect(invalidArgs.checks?.some(check => check.message.includes('module_script 形状'))).toBe(true)
    expect(invalidArgs.checks?.some(check => check.message.includes('直接函数形状'))).toBe(false)
    expect(invalidArgs.checks?.some(check => check.message.includes('ROOT_LIST_REQUIRES_FIND'))).toBe(false)
  })

  it('为 SCRIPT_EXECUTION_FAILED 回灌 pageDesign 脚本提示', () => {
    const runtime = createTaskRuntime()
    const scriptFailed = enrichFunctionCallResult({
      runtime,
      protocolToolName: PROTOCOL_TOOL_NAMES.moduleScript,
      args: { script: 'page.editDataSet({})' },
      callResult: {
        ok: false,
        code: 'SCRIPT_EXECUTION_FAILED',
        msg: 'editDataSet is not a function',
        fix: 'fix script',
      },
    })
    if (scriptFailed.ok) return
    expect(scriptFailed.checks?.some(check => check.message.includes('openPageDesign'))).toBe(true)
    expect(scriptFailed.checks?.some(check => check.message.includes('module_find'))).toBe(false)
  })
})
