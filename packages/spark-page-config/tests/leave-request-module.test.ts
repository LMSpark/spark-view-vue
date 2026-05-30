import { describe, expect, it } from 'vitest'

import {
  AiAgentToolLoopRunner,
  createAiAgentScope,
  startAiAgentRegistrationSession,
  toAiAgentRuntimeScope,
  type AiAgentRegistration,
  type AiAgentScope,
  type AiAgentToolCallRecord,
  type AiAgentTurnCallbacks,
  type AiAgentTurnMeta,
} from '@spark-view/spark-ai/agent'
import {
  LEAVE_REQUEST_KIND,
  LEAVE_REQUEST_MODULE_ID,
  LEAVE_REQUEST_PERSON_KIND,
  createLeaveRequestBusinessRegistration,
} from '../src/leave-request/index'
import type { AiJsonValue } from '@spark-view/spark-ai/json'
import { isRecord } from '@spark-view/spark-utils'

function createScope(leaveDraftId: string): AiAgentScope {
  return createAiAgentScope(LEAVE_REQUEST_MODULE_ID, leaveDraftId)
}

function turn(seq: number): AiAgentTurnMeta {
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
  registration: AiAgentRegistration,
  scope: AiAgentScope,
  toolName: string,
  toolArgs: Readonly<Record<string, AiJsonValue>>,
  seq: number,
): Promise<{ record: AiAgentToolCallRecord; cleared: boolean; deltas: string[] }> {
  await startAiAgentRegistrationSession(registration, toAiAgentRuntimeScope(scope))
  let streamCount = 0
  let record: AiAgentToolCallRecord | null = null
  let cleared = false
  const deltas: string[] = []
  const turnCallbacks: AiAgentTurnCallbacks = {
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
  const runner = new AiAgentToolLoopRunner(turnCallbacks, 2)
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
  registration: AiAgentRegistration,
  scope: AiAgentScope,
  actionName: string,
  args: Readonly<Record<string, AiJsonValue>> = {},
) {
  return registration.runtime.executeTool('module_call', {
    path: `/${LEAVE_REQUEST_KIND}[${scope.businessInstanceId}]`,
    functionName: actionName,
    args,
  }, toAiAgentRuntimeScope(scope))
}

function leaveModuleCall(
  scope: AiAgentScope,
  functionName: string,
  args: Readonly<Record<string, AiJsonValue>> = {},
): Readonly<Record<string, AiJsonValue>> {
  return {
    path: `/${LEAVE_REQUEST_KIND}[${scope.businessInstanceId}]`,
    functionName,
    args,
  }
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
    const started = await startAiAgentRegistrationSession(registration, toAiAgentRuntimeScope(scope))

    expect(registration.moduleId).toBe(LEAVE_REQUEST_MODULE_ID)
    expect(started.tools.map((tool) => tool.function.name)).toEqual(expect.arrayContaining([
      'module_query',
      'module_guide',
      'module_attribute_guide',
      'module_function_guide',
      'module_find',
      'module_attr',
      'module_call',
      'human_question',
      'agent_complete',
      'describeDraft',
      'setDraftFields',
      'submitDraft',
      'cancelDraft',
    ]))
    expect(registration.systemPrompt?.(toAiAgentRuntimeScope(scope))).toContain('当前日期')

    const described = await registration.runtime.executeTool('module_guide', { kind: LEAVE_REQUEST_KIND }, toAiAgentRuntimeScope(scope))
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
    const knowledge = await registration.runtime.executeTool('module_query', { keyword: '人员编码' }, toAiAgentRuntimeScope(scope))
    expect(knowledge.ok).toBe(true)
    const knowledgeData = Array.isArray(knowledge.data)
      ? knowledge.data
      : isRecord(knowledge.data) && Array.isArray(knowledge.data['modules'])
        ? knowledge.data['modules']
        : []
    expect(knowledgeData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: LEAVE_REQUEST_KIND,
        childKindSummaries: expect.arrayContaining([
          expect.objectContaining({
            kind: LEAVE_REQUEST_PERSON_KIND,
            description: expect.stringContaining('人员编码'),
            attributeSummaries: expect.arrayContaining([
              expect.objectContaining({ name: 'code', description: expect.stringContaining('人员编码') }),
            ]),
            detailLookupSteps: expect.arrayContaining([
              expect.stringContaining(`module_query({ kind: "${LEAVE_REQUEST_PERSON_KIND}", includeFunctions: true })`),
            ]),
          }),
        ]),
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
      expect(action).toHaveProperty('description')
      expect(action).not.toHaveProperty('paramsSchema')
      expect(action).not.toHaveProperty('failureModes')
    }
    const setDraftGuide = await registration.runtime.executeTool('module_function_guide', {
      kind: LEAVE_REQUEST_KIND,
      functionName: 'setDraftFields',
    }, toAiAgentRuntimeScope(scope))
    expect(setDraftGuide.ok).toBe(true)
    expect(setDraftGuide.data).toMatchObject({
      functionName: 'setDraftFields',
      paramsSchema: expect.any(Object),
      usageRules: expect.any(Array),
      failureModes: expect.any(Array),
    })
  })

  it('填写假条前可通过 leave-person 实例查询人员编码并写入草稿', async () => {
    const registration = createLeaveRequestBusinessRegistration({ now: () => 1778030000000 })
    const scope = createScope('leaveDraft:person')
    await startAiAgentRegistrationSession(registration, toAiAgentRuntimeScope(scope))

    const found = await registration.runtime.executeTool('module_find', {
      path: `/${LEAVE_REQUEST_KIND}[${scope.businessInstanceId}]`,
      childKind: LEAVE_REQUEST_PERSON_KIND,
      query: { name: 'Ada' },
    }, toAiAgentRuntimeScope(scope))
    expect(found.ok).toBe(true)
    expect(found.data).toEqual([
      expect.objectContaining({
        id: 'E1001',
        label: 'Ada',
      }),
    ])

    const code = await registration.runtime.executeTool('module_attr', {
      op: 'get',
      path: `/${LEAVE_REQUEST_KIND}[${scope.businessInstanceId}]/${LEAVE_REQUEST_PERSON_KIND}[E1001]`,
      attrName: 'code',
    }, toAiAgentRuntimeScope(scope))
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

    await runToolCall(registration, draftA, 'module_call', leaveModuleCall(draftA, 'setDraftFields', {
      fields: { applicantName: 'Ada', leaveType: 'annual', startDate: '2026-05-14' },
    }), 1)
    await runToolCall(registration, draftB, 'module_call', leaveModuleCall(draftB, 'setDraftFields', {
      fields: { applicantName: 'Lin', leaveType: 'sick', startDate: '2026-05-15' },
    }), 2)

    expect(draftFields(await invokeDirect(registration, draftA, 'describeDraft'))['applicantName']).toBe('Ada')
    expect(draftFields(await invokeDirect(registration, draftB, 'describeDraft'))['applicantName']).toBe('Lin')
    expect(registration.sessionStore?.getSessionHistory(toAiAgentRuntimeScope(draftA))).toHaveLength(1)
    expect(registration.sessionStore?.getSessionHistory(toAiAgentRuntimeScope(draftB))).toHaveLength(1)
  })

  it('校验必填字段并在会话重启后保留 live state', async () => {
    const registration = createLeaveRequestBusinessRegistration({ now: () => 1778030000000 })
    const scope = createScope('leaveDraft:restart')

    await runToolCall(registration, scope, 'module_call', leaveModuleCall(scope, 'setDraftFields', {
      fields: { applicantName: 'Ada', leaveType: 'annual', startDate: '2026-05-14' },
    }), 1)
    const rejected = await runToolCall(registration, scope, 'module_call', leaveModuleCall(scope, 'submitDraft'), 2)
    expect(rejected.record.result).toMatchObject({ ok: false, code: 'MISSING_REQUIRED_FIELDS' })

    registration.sessionStore?.stopSession(toAiAgentRuntimeScope(scope), 'restart')
    await startAiAgentRegistrationSession(registration, toAiAgentRuntimeScope(scope))
    const described = await invokeDirect(registration, scope, 'describeDraft')
    expect(draftFields(described)['applicantName']).toBe('Ada')
  })

  it('submit/cancel 读取 business function tool args,release 只清 live state 不删历史', async () => {
    const registration = createLeaveRequestBusinessRegistration({ now: () => 1778030000000 })
    const submitScope = createScope('leaveDraft:submit')

    await runToolCall(registration, submitScope, 'module_call', leaveModuleCall(submitScope, 'setDraftFields', {
      fields: {
        applicantName: 'Ada',
        leaveType: 'annual',
        startDate: '2026-05-14',
        endDate: '2026-05-15',
        totalDays: 2,
        reason: 'family care',
      },
    }), 1)
    const submitted = await runToolCall(registration, submitScope, 'module_call', leaveModuleCall(submitScope, 'submitDraft'), 2)
    expect(submitted.record.result).toMatchObject({ ok: true })
    expect(submitted.cleared).toBe(true)
    expect(submitted.deltas.join('\n')).toContain('请假申请已提交成功')
    expect(registration.sessionStore?.getSession(toAiAgentRuntimeScope(submitScope))?.status).toBe('Stopped')
    expect(registration.sessionStore?.getSessionHistory(toAiAgentRuntimeScope(submitScope)).map((entry) => entry.kind)).toEqual([
      'functionCall',
      'functionCall',
      'message',
    ])
    const afterRelease = await invokeDirect(registration, submitScope, 'describeDraft')
    expect(afterRelease).toMatchObject({ ok: true })
    expect(draftFields(afterRelease)['applicantName']).toBeUndefined()

    const cancelScope = createScope('leaveDraft:cancel')
    await runToolCall(registration, cancelScope, 'module_call', leaveModuleCall(cancelScope, 'setDraftFields', {
      fields: { applicantName: 'Ada' },
    }), 3)
    const cancelled = await runToolCall(registration, cancelScope, 'module_call', leaveModuleCall(cancelScope, 'cancelDraft', {
      reason: '用户取消申请',
    }), 4)
    expect(cancelled.record.result).toMatchObject({ ok: true })
    expect(cancelled.cleared).toBe(true)
    expect(cancelled.deltas.join('\n')).toContain('当前请假草稿已取消')
    expect(registration.sessionStore?.getSessionHistory(toAiAgentRuntimeScope(cancelScope)).map((entry) => entry.kind)).toEqual([
      'functionCall',
      'functionCall',
      'message',
    ])
  })
})
