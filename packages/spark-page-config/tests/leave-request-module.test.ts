import { describe, expect, it } from 'vitest'

import {
  AiHostToolLoopRunner,
  createAiHostBusinessScope,
  startRegistrationSession,
  toAiHostRuntimeScope,
  type AiHostBusinessRegistration,
  type AiHostBusinessScope,
  type AiHostFcCallRecord,
  type AiHostTransport,
  type AiHostTurnMeta,
} from '@spark-view/spark-ai/host'
import {
  LEAVE_REQUEST_KIND,
  LEAVE_REQUEST_MODULE_ID,
  createLeaveRequestBusinessRegistration,
} from '@spark-view/spark-page-config/ai'
import type { LlmJsonValue } from '@spark-view/spark-ai/schema'
import { isRecord } from '@spark-view/spark-page-config/json-document'

function createScope(leaveDraftId: string): AiHostBusinessScope {
  return createAiHostBusinessScope(LEAVE_REQUEST_MODULE_ID, leaveDraftId)
}

function turn(seq: number): AiHostTurnMeta {
  return {
    turnId: `turn-${seq}`,
    seq,
    baseRevision: 0,
    queuedAt: '2026-05-21T00:00:00.000Z',
    startedAt: '2026-05-21T00:00:00.000Z',
    maxParallelTurns: 1,
  }
}

async function runToolCall(
  registration: AiHostBusinessRegistration,
  scope: AiHostBusinessScope,
  args: Readonly<Record<string, LlmJsonValue>>,
  seq: number,
): Promise<{ record: AiHostFcCallRecord; cleared: boolean; deltas: string[] }> {
  await startRegistrationSession(registration, toAiHostRuntimeScope(scope))
  let streamCount = 0
  let record: AiHostFcCallRecord | null = null
  let cleared = false
  const deltas: string[] = []
  const transport: AiHostTransport = {
    streamTurn: () => {
      streamCount += 1
      if (streamCount > 1) return Promise.resolve({ text: '', toolCalls: [] })
      return Promise.resolve({
        text: '',
        toolCalls: [{
          id: `call-${seq}`,
          type: 'function',
          function: {
            name: 'invokeAction',
            arguments: JSON.stringify(args),
          },
        }],
      })
    },
    appendMessages: () => Promise.resolve(),
  }
  const runner = new AiHostToolLoopRunner({
    registry: { get: () => registration, list: () => [registration] },
    transport,
    maxToolRounds: 2,
  })
  await runner.runToolLoop(
    registration,
    scope,
    { historyMsgs: [], onDelta: (delta) => deltas.push(delta), onFcCall: (item) => { record = item } },
    turn(seq),
    () => { cleared = true },
  )
  if (record === null) throw new Error('expected function call record')
  return { record, cleared, deltas }
}

async function invokeDirect(
  registration: AiHostBusinessRegistration,
  scope: AiHostBusinessScope,
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>> = {},
) {
  return registration.runtime.executeTool('invokeAction', {
    path: `/${LEAVE_REQUEST_KIND}[${scope.businessInstanceId}]`,
    actionName,
    args,
  }, toAiHostRuntimeScope(scope))
}

function draftFields(result: { readonly ok: boolean; readonly data?: unknown }): Record<string, unknown> {
  if (!result.ok || !isRecord(result.data) || !isRecord(result.data['draft']) || !isRecord(result.data['draft']['fields'])) {
    throw new Error('expected draft fields')
  }
  return result.data['draft']['fields']
}

describe('leave-request host business registration', () => {
  it('注册 manualLeave 为单 kind module-semantic 业务', async () => {
    const registration = createLeaveRequestBusinessRegistration({ now: () => 1778030000000 })
    const scope = createScope('leaveDraft:a')
    const started = await startRegistrationSession(registration, toAiHostRuntimeScope(scope))

    expect(registration.moduleId).toBe(LEAVE_REQUEST_MODULE_ID)
    expect(started.tools.map((tool) => tool.function.name)).toEqual([
      'getAttribute',
      'setAttribute',
      'invokeAction',
      'listChildren',
      'findInstance',
      'describeKind',
    ])
    expect(registration.systemPrompt?.(toAiHostRuntimeScope(scope))).toContain('当前日期')

    const described = await registration.runtime.executeTool('describeKind', { kind: LEAVE_REQUEST_KIND }, toAiHostRuntimeScope(scope))
    expect(described.ok).toBe(true)
    if (!described.ok || !isRecord(described.data) || !Array.isArray(described.data['actions'])) {
      throw new Error('describeKind failed')
    }
    expect(described.data['actions'].map((action) => isRecord(action) ? action['name'] : null)).toEqual([
      'describeDraft',
      'setDraftFields',
      'submitDraft',
      'cancelDraft',
    ])
    for (const action of described.data['actions']) {
      if (!isRecord(action)) throw new Error('action not record')
      expect(action).toHaveProperty('paramsSchema')
      expect(action).toHaveProperty('resultSchema')
      expect(action).toHaveProperty('usageRules')
      expect(action).toHaveProperty('failureModes')
      expect(action).toHaveProperty('example')
    }
  })

  it('隔离不同 leaveDraftId 的草稿和 Host 历史', async () => {
    const registration = createLeaveRequestBusinessRegistration({ now: () => 1778030000000 })
    const draftA = createScope('leaveDraft:a')
    const draftB = createScope('leaveDraft:b')

    await runToolCall(registration, draftA, {
      path: '/manual-leave[leaveDraft:a]',
      actionName: 'setDraftFields',
      args: { fields: { applicantName: 'Ada', leaveType: 'annual', startDate: '2026-05-14' } },
    }, 1)
    await runToolCall(registration, draftB, {
      path: '/manual-leave[leaveDraft:b]',
      actionName: 'setDraftFields',
      args: { fields: { applicantName: 'Lin', leaveType: 'sick', startDate: '2026-05-15' } },
    }, 2)

    expect(draftFields(await invokeDirect(registration, draftA, 'describeDraft'))['applicantName']).toBe('Ada')
    expect(draftFields(await invokeDirect(registration, draftB, 'describeDraft'))['applicantName']).toBe('Lin')
    expect(registration.sessionStore?.getSessionHistory(toAiHostRuntimeScope(draftA))).toHaveLength(1)
    expect(registration.sessionStore?.getSessionHistory(toAiHostRuntimeScope(draftB))).toHaveLength(1)
  })

  it('校验必填字段并在会话重启后保留 live state', async () => {
    const registration = createLeaveRequestBusinessRegistration({ now: () => 1778030000000 })
    const scope = createScope('leaveDraft:restart')

    await runToolCall(registration, scope, {
      path: '/manual-leave[leaveDraft:restart]',
      actionName: 'setDraftFields',
      args: { fields: { applicantName: 'Ada', leaveType: 'annual', startDate: '2026-05-14' } },
    }, 1)
    const rejected = await runToolCall(registration, scope, {
      path: '/manual-leave[leaveDraft:restart]',
      actionName: 'submitDraft',
      args: {},
    }, 2)
    expect(rejected.record.result).toMatchObject({ ok: false, code: 'MISSING_REQUIRED_FIELDS' })

    registration.sessionStore?.stopSession(toAiHostRuntimeScope(scope), 'restart')
    await startRegistrationSession(registration, toAiHostRuntimeScope(scope))
    const described = await invokeDirect(registration, scope, 'describeDraft')
    expect(draftFields(described)['applicantName']).toBe('Ada')
  })

  it('submit/cancel 读取 invokeAction.args.actionName,release 只清 live state 不删历史', async () => {
    const registration = createLeaveRequestBusinessRegistration({ now: () => 1778030000000 })
    const submitScope = createScope('leaveDraft:submit')

    await runToolCall(registration, submitScope, {
      path: '/manual-leave[leaveDraft:submit]',
      actionName: 'setDraftFields',
      args: {
        fields: {
          applicantName: 'Ada',
          leaveType: 'annual',
          startDate: '2026-05-14',
          endDate: '2026-05-15',
          totalDays: 2,
          reason: 'family care',
        },
      },
    }, 1)
    const submitted = await runToolCall(registration, submitScope, {
      path: '/manual-leave[leaveDraft:submit]',
      actionName: 'submitDraft',
      args: {},
    }, 2)
    expect(submitted.record.result).toMatchObject({ ok: true })
    expect(submitted.cleared).toBe(true)
    expect(submitted.deltas.join('\n')).toContain('请假申请已提交成功')
    expect(registration.sessionStore?.getSession(toAiHostRuntimeScope(submitScope))?.status).toBe('Stopped')
    expect(registration.sessionStore?.getSessionHistory(toAiHostRuntimeScope(submitScope)).map((entry) => entry.kind)).toEqual([
      'functionCall',
      'functionCall',
      'message',
    ])
    const afterRelease = await invokeDirect(registration, submitScope, 'describeDraft')
    expect(afterRelease).toMatchObject({ ok: true })
    expect(draftFields(afterRelease)['applicantName']).toBeUndefined()

    const cancelScope = createScope('leaveDraft:cancel')
    await runToolCall(registration, cancelScope, {
      path: '/manual-leave[leaveDraft:cancel]',
      actionName: 'setDraftFields',
      args: { fields: { applicantName: 'Ada' } },
    }, 3)
    const cancelled = await runToolCall(registration, cancelScope, {
      path: '/manual-leave[leaveDraft:cancel]',
      actionName: 'cancelDraft',
      args: { reason: '用户取消申请' },
    }, 4)
    expect(cancelled.record.result).toMatchObject({ ok: true })
    expect(cancelled.cleared).toBe(true)
    expect(cancelled.deltas.join('\n')).toContain('当前请假草稿已取消')
    expect(registration.sessionStore?.getSessionHistory(toAiHostRuntimeScope(cancelScope)).map((entry) => entry.kind)).toEqual([
      'functionCall',
      'functionCall',
      'message',
    ])
  })
})

