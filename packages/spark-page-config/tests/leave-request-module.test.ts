import { describe, expect, it } from 'vitest'

import {
  AiHostToolLoopRunner,
  createAiHostBusinessScope,
  startRegistrationSession,
  toAiHostRuntimeScope,
  type AiHostBusinessRegistration,
  type AiHostBusinessScope,
  type AiHostToolCallRecord,
  type AiHostTurnCallbacks,
  type AiHostTurnMeta,
} from '@spark-view/spark-ai/host'
import {
  LEAVE_REQUEST_KIND,
  LEAVE_REQUEST_MODULE_ID,
  LEAVE_REQUEST_PERSON_KIND,
  createLeaveRequestBusinessRegistration,
} from '../src/ai/index'
import type { LlmJsonValue } from '@spark-view/spark-ai/schema'
import { isRecord } from '@spark-view/spark-utils'

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
  toolName: string,
  toolArgs: Readonly<Record<string, LlmJsonValue>>,
  seq: number,
): Promise<{ record: AiHostToolCallRecord; cleared: boolean; deltas: string[] }> {
  await startRegistrationSession(registration, toAiHostRuntimeScope(scope))
  let streamCount = 0
  let record: AiHostToolCallRecord | null = null
  let cleared = false
  const deltas: string[] = []
  const turnCallbacks: AiHostTurnCallbacks = {
    executeTurn: () => {
      streamCount += 1
      if (streamCount > 1) return Promise.resolve({ text: '', toolCalls: [] })
      return Promise.resolve({
        text: '',
        toolCalls: [{
          id: `call-${seq}`,
          type: 'function',
          function: {
            name: toolName,
            arguments: JSON.stringify(toolArgs),
          },
        }],
      })
    },
    appendMessages: () => Promise.resolve(),
  }
  const runner = new AiHostToolLoopRunner(turnCallbacks, 2)
  await runner.runToolLoop({
    registration,
    scope,
    request: { historyMsgs: [], onDelta: (delta) => deltas.push(delta), onToolCall: (item) => { record = item } },
    turn: turn(seq),
    clearSelected: () => { cleared = true },
  })
  if (record === null) throw new Error('expected function call record')
  return { record, cleared, deltas }
}

async function invokeDirect(
  registration: AiHostBusinessRegistration,
  scope: AiHostBusinessScope,
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>> = {},
) {
  return registration.runtime.executeTool(`${LEAVE_REQUEST_KIND}_${actionName}`, {
    $paths: [scope.businessInstanceId],
    ...args,
  }, toAiHostRuntimeScope(scope))
}

function draftFields(result: { readonly ok: boolean; readonly data?: unknown }): Record<string, unknown> {
  if (!result.ok || !isRecord(result.data) || !isRecord(result.data['draft']) || !isRecord(result.data['draft']['fields'])) {
    throw new Error('expected draft fields')
  }
  return result.data['draft']['fields']
}

describe('leave-request host business registration', () => {
  it('注册 manualLeave 草稿 kind 和人员实例子 kind', async () => {
    const registration = createLeaveRequestBusinessRegistration({ now: () => 1778030000000 })
    const scope = createScope('leaveDraft:a')
    const started = await startRegistrationSession(registration, toAiHostRuntimeScope(scope))

    expect(registration.moduleId).toBe(LEAVE_REQUEST_MODULE_ID)
    expect(started.tools.map((tool) => tool.function.name)).toEqual(expect.arrayContaining([
      'queryModules',
      'queryFunctions',
      'guideFunction',
      'guideHumanQuestion',
      'getAttribute',
      'setAttribute',
      'listChildren',
      'findInstance',
      'describeKind',
      'manual-leave_describeDraft',
    ]))
    expect(registration.systemPrompt?.(toAiHostRuntimeScope(scope))).toContain('当前日期')

    const described = await registration.runtime.executeTool('describeKind', { kind: LEAVE_REQUEST_KIND }, toAiHostRuntimeScope(scope))
    expect(described.ok).toBe(true)
    if (!described.ok || !isRecord(described.data) || !Array.isArray(described.data['functions'])) {
      throw new Error('describeKind failed')
    }
    expect(described.data['functions'].map((action) => isRecord(action) ? action['name'] : null)).toEqual([
      'describeDraft',
      'setDraftFields',
      'submitDraft',
      'cancelDraft',
    ])
    expect(described.data['children']).toEqual([LEAVE_REQUEST_PERSON_KIND])
    const knowledge = await registration.runtime.executeTool('queryModules', { keyword: '人员编码' }, toAiHostRuntimeScope(scope))
    expect(knowledge.ok).toBe(true)
    expect(knowledge.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: LEAVE_REQUEST_KIND,
        childKindSummaries: [
          expect.objectContaining({
            kind: LEAVE_REQUEST_PERSON_KIND,
            description: expect.stringContaining('人员编码'),
            attributeSummaries: expect.arrayContaining([
              expect.objectContaining({ name: 'code', description: expect.stringContaining('人员编码') }),
            ]),
            detailLookupSteps: expect.arrayContaining([
              expect.stringContaining(`queryModules({ kind: "${LEAVE_REQUEST_PERSON_KIND}" })`),
            ]),
          }),
        ],
      }),
      expect.objectContaining({
        kind: LEAVE_REQUEST_PERSON_KIND,
        instanceGuide: expect.objectContaining({
          queryFields: expect.arrayContaining(['code', 'name', 'department', 'role']),
        }),
        attributeGuides: expect.arrayContaining([
          expect.objectContaining({
            name: 'code',
            description: expect.stringContaining('人员编码'),
          }),
        ]),
      }),
    ]))
    for (const action of described.data['functions']) {
      if (!isRecord(action)) throw new Error('action not record')
      expect(action).toHaveProperty('paramsSchema')
      expect(action).toHaveProperty('resultSchema')
      expect(action).toHaveProperty('usageRules')
      expect(action).toHaveProperty('failureModes')
      expect(action).toHaveProperty('example')
    }
  })

  it('填写假条前可通过 leave-person 实例查询人员编码并写入草稿', async () => {
    const registration = createLeaveRequestBusinessRegistration({ now: () => 1778030000000 })
    const scope = createScope('leaveDraft:person')
    await startRegistrationSession(registration, toAiHostRuntimeScope(scope))

    const found = await registration.runtime.executeTool('findInstance', {
      path: `/${LEAVE_REQUEST_KIND}[${scope.businessInstanceId}]`,
      childKind: LEAVE_REQUEST_PERSON_KIND,
      query: { name: 'Ada' },
    }, toAiHostRuntimeScope(scope))
    expect(found.ok).toBe(true)
    expect(found.data).toEqual([
      expect.objectContaining({
        id: 'E1001',
        label: 'Ada',
      }),
    ])

    const code = await registration.runtime.executeTool('getAttribute', {
      path: `/${LEAVE_REQUEST_KIND}[${scope.businessInstanceId}]/${LEAVE_REQUEST_PERSON_KIND}[E1001]`,
      attrName: 'code',
    }, toAiHostRuntimeScope(scope))
    expect(code).toMatchObject({ ok: true, data: 'E1001' })

    const updated = await invokeDirect(registration, scope, 'setDraftFields', {
      fields: {
        applicantName: 'Ada',
        applicantCode: 'E1001',
        approver: 'Lin',
        approverCode: 'E1002',
      },
    })
    expect(draftFields(updated)).toMatchObject({
      applicantName: 'Ada',
      applicantCode: 'E1001',
      approver: 'Lin',
      approverCode: 'E1002',
    })
  })

  it('隔离不同 leaveDraftId 的草稿和 Host 历史', async () => {
    const registration = createLeaveRequestBusinessRegistration({ now: () => 1778030000000 })
    const draftA = createScope('leaveDraft:a')
    const draftB = createScope('leaveDraft:b')

    await runToolCall(registration, draftA, 'manual-leave_setDraftFields', {
      $paths: ['leaveDraft:a'],
      fields: { applicantName: 'Ada', leaveType: 'annual', startDate: '2026-05-14' },
    }, 1)
    await runToolCall(registration, draftB, 'manual-leave_setDraftFields', {
      $paths: ['leaveDraft:b'],
      fields: { applicantName: 'Lin', leaveType: 'sick', startDate: '2026-05-15' },
    }, 2)

    expect(draftFields(await invokeDirect(registration, draftA, 'describeDraft'))['applicantName']).toBe('Ada')
    expect(draftFields(await invokeDirect(registration, draftB, 'describeDraft'))['applicantName']).toBe('Lin')
    expect(registration.sessionStore?.getSessionHistory(toAiHostRuntimeScope(draftA))).toHaveLength(1)
    expect(registration.sessionStore?.getSessionHistory(toAiHostRuntimeScope(draftB))).toHaveLength(1)
  })

  it('校验必填字段并在会话重启后保留 live state', async () => {
    const registration = createLeaveRequestBusinessRegistration({ now: () => 1778030000000 })
    const scope = createScope('leaveDraft:restart')

    await runToolCall(registration, scope, 'manual-leave_setDraftFields', {
      $paths: ['leaveDraft:restart'],
      fields: { applicantName: 'Ada', leaveType: 'annual', startDate: '2026-05-14' },
    }, 1)
    const rejected = await runToolCall(registration, scope, 'manual-leave_submitDraft', {
      $paths: ['leaveDraft:restart'],
    }, 2)
    expect(rejected.record.result).toMatchObject({ ok: false, code: 'MISSING_REQUIRED_FIELDS' })

    registration.sessionStore?.stopSession(toAiHostRuntimeScope(scope), 'restart')
    await startRegistrationSession(registration, toAiHostRuntimeScope(scope))
    const described = await invokeDirect(registration, scope, 'describeDraft')
    expect(draftFields(described)['applicantName']).toBe('Ada')
  })

  it('submit/cancel 读取 business function tool args,release 只清 live state 不删历史', async () => {
    const registration = createLeaveRequestBusinessRegistration({ now: () => 1778030000000 })
    const submitScope = createScope('leaveDraft:submit')

    await runToolCall(registration, submitScope, 'manual-leave_setDraftFields', {
      $paths: ['leaveDraft:submit'],
      fields: {
        applicantName: 'Ada',
        leaveType: 'annual',
        startDate: '2026-05-14',
        endDate: '2026-05-15',
        totalDays: 2,
        reason: 'family care',
      },
    }, 1)
    const submitted = await runToolCall(registration, submitScope, 'manual-leave_submitDraft', {
      $paths: ['leaveDraft:submit'],
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
    await runToolCall(registration, cancelScope, 'manual-leave_setDraftFields', {
      $paths: ['leaveDraft:cancel'],
      fields: { applicantName: 'Ada' },
    }, 3)
    const cancelled = await runToolCall(registration, cancelScope, 'manual-leave_cancelDraft', {
      $paths: ['leaveDraft:cancel'],
      reason: '用户取消申请',
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
