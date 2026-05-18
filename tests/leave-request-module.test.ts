import { describe, expect, it } from 'vitest'

import {
  LeaveRequestModule,
  type LeaveRequestRuntimeContext,
} from '../packages/spark-ai/src'

function createContext(leaveDraftId: string, instanceId = `${leaveDraftId}:session`): LeaveRequestRuntimeContext {
  return {
    moduleId: LeaveRequestModule.moduleId,
    moduleInstanceId: leaveDraftId,
    instanceId,
  }
}

describe('leave-request module', () => {
  it('exports JSON-persistable registration data', async () => {
    const leave = new LeaveRequestModule({ now: () => 1778030000000 })
    const registrationData = leave.getRegistrationData()
    const registrationStore = leave.getRegistrationStoreSnapshot()

    expect(JSON.parse(JSON.stringify(registrationData))).toEqual(registrationData)
    expect(JSON.parse(JSON.stringify(registrationStore))).toEqual(registrationStore)
    expect(registrationData.moduleId).toBe(LeaveRequestModule.moduleId)
    expect(registrationData.functions.map((item) => item.functionId)).toEqual([
      'describeDraft',
      'setDraftFields',
      'submitDraft',
      'cancelDraft',
    ])
    const setDraftFields = registrationData.functions.find((item) => item.functionId === 'setDraftFields')
    expect(JSON.stringify(setDraftFields?.paramsSchema)).toContain('系统提示中的当前日期')
    expect(setDraftFields?.usageRules).toEqual(expect.arrayContaining([
      expect.stringContaining('当前日期换算'),
      expect.stringContaining('setDraftFields 成功'),
    ]))

    const projection = await leave.startSession(createContext('leaveDraft:a'))
    expect(projection.availableFunctions.map((item) => item.action)).toEqual([
      'leaveDraft%3Aa@manualLeave@describeDraft',
      'leaveDraft%3Aa@manualLeave@setDraftFields',
      'leaveDraft%3Aa@manualLeave@submitDraft',
      'leaveDraft%3Aa@manualLeave@cancelDraft',
    ])
  })

  it('isolates live draft state by leaveDraftId while core history stays scoped', async () => {
    const leave = new LeaveRequestModule({ now: () => 1778030000000 })
    const draftA = createContext('leaveDraft:a', 'session-a')
    const draftB = createContext('leaveDraft:b', 'session-b')
    const projectionA = await leave.startSession(draftA)
    const projectionB = await leave.startSession(draftB)

    await leave.executeFunctionCall({
      ...draftA,
      action: 'leaveDraft%3Aa@manualLeave@setDraftFields',
      args: { fields: { applicantName: 'Ada', leaveType: 'annual', startDate: '2026-05-14' } },
      projection: projectionA,
    })
    await leave.executeFunctionCall({
      ...draftB,
      action: 'leaveDraft%3Ab@manualLeave@setDraftFields',
      args: { fields: { applicantName: 'Lin', leaveType: 'sick', startDate: '2026-05-15' } },
      projection: projectionB,
    })

    expect(leave.getDraft('leaveDraft:a').fields.applicantName).toBe('Ada')
    expect(leave.getDraft('leaveDraft:b').fields.applicantName).toBe('Lin')
    expect(leave.getSessionHistory(draftA)).toHaveLength(1)
    expect(leave.getSessionHistory(draftB)).toHaveLength(1)
  })

  it('validates required fields and preserves live state across AI session restart', async () => {
    const leave = new LeaveRequestModule({ now: () => 1778030000000 })
    const draft = createContext('leaveDraft:restart', 'session-1')
    const projection = await leave.startSession(draft)

    const incomplete = await leave.executeFunctionCall({
      ...draft,
      action: 'leaveDraft%3Arestart@manualLeave@setDraftFields',
      args: { fields: { applicantName: 'Ada', leaveType: 'annual', startDate: '2026-05-14' } },
      projection,
    })
    expect(incomplete).toMatchObject({ ok: true })

    const rejected = await leave.executeFunctionCall({
      ...draft,
      action: 'leaveDraft%3Arestart@manualLeave@submitDraft',
      args: {},
      projection,
    })
    expect(rejected).toMatchObject({
      ok: false,
      code: 'MISSING_REQUIRED_FIELDS',
    })

    leave.stopSession({ ...draft, reason: 'restart' })
    const restarted = await leave.startSession(createContext('leaveDraft:restart', 'session-2'))
    const described = await leave.executeFunctionCall({
      ...createContext('leaveDraft:restart', 'session-2'),
      action: 'leaveDraft%3Arestart@manualLeave@describeDraft',
      args: {},
      projection: restarted,
    })

    expect(described).toMatchObject({
      ok: true,
      data: {
        draft: {
          fields: {
            applicantName: 'Ada',
          },
        },
        missingFields: ['endDate', 'reason'],
      },
    })
  })

  it('submits complete draft and releaseModuleInstance clears only live draft state', async () => {
    const leave = new LeaveRequestModule({ now: () => 1778030000000 })
    const draft = createContext('leaveDraft:submit')
    const projection = await leave.startSession(draft)

    await leave.executeFunctionCall({
      ...draft,
      action: 'leaveDraft%3Asubmit@manualLeave@setDraftFields',
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
      projection,
    })
    const submitted = await leave.executeFunctionCall({
      ...draft,
      action: 'leaveDraft%3Asubmit@manualLeave@submitDraft',
      args: {},
      projection,
    })

    expect(submitted).toMatchObject({
      ok: true,
      data: {
        draft: {
          status: 'submitted',
        },
      },
    })
    expect(leave.getSessionHistory(draft)).toHaveLength(2)

    leave.releaseModuleInstance('leaveDraft:submit')
    expect(leave.getDraft('leaveDraft:submit').status).toBe('draft')
    expect(leave.getSessionHistory(draft)).toHaveLength(2)
  })
})
