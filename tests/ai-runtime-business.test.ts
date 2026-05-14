import { describe, expect, it, vi } from 'vitest'

import {
  AiRuntime,
  type AiBusinessRegistration,
  type AiFunctionRegistration,
  type AiKnowledgeProjection,
  type AiModuleRegistration,
  type AiRuntimeApi,
  type FunctionExecutionContext,
} from '../packages/spark-ai/src'

type ExecutableFunctionRegistration = AiFunctionRegistration & {
  execute(args: unknown, context: FunctionExecutionContext): object
}

interface LeaveFormState {
  draft: {
    reason: string | null
  }
}

const NO_PARAMS_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const

function createDeterministicRuntime(): AiRuntimeApi {
  return new AiRuntime({
    now: () => 1778030000000,
  })
}

function createLeaveModule(execute = vi.fn()): AiModuleRegistration {
  const functions: ReadonlyArray<ExecutableFunctionRegistration> = [
    {
      functionId: 'setReason',
      description: 'Set leave reason.',
      paramsSchema: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
        required: ['reason'],
      },
      failureModes: [{ code: 'REASON_REQUIRED', when: 'reason is empty', fix: 'Provide a non-empty reason.' }],
      execute(args) {
        execute(args)
        return { accepted: true }
      },
    },
  ]

  return {
    moduleId: 'leaveApproval',
    name: 'Leave approval',
    description: 'Help users finish a leave request.',
    prompt: 'Collect leave reason only.',
    getFunctions: () => functions,
  }
}

function createDepartmentModule(): AiModuleRegistration {
  return {
    moduleId: 'department',
    name: 'Department',
    description: 'Manage department information.',
    instanceParam: { name: 'departmentId', description: '当前部门 ID' },
    getFunctions: () => [],
    modules: [
      {
        moduleId: 'personnel',
        name: 'Personnel',
        description: 'Manage personnel in a department.',
        instanceParam: { name: 'personId', description: '当前人员 ID' },
        getFunctions: () => [],
        modules: [
          {
            moduleId: 'basicInfo',
            name: 'Basic info',
            description: 'Manage basic personnel information.',
            getFunctions: () => [
              {
                functionId: 'update',
                description: 'Update person basic info.',
                paramsSchema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                  },
                  required: ['name'],
                },
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('AI core module projection and translation API', () => {
  it('registers business roots without owning business live state', async () => {
    const core = createDeterministicRuntime()
    const liveState = { touched: false }
    const business: AiBusinessRegistration = {
      businessId: 'leaveApproval',
      name: 'Leave approval',
      description: 'Help users finish a leave request.',
      prompt: 'Collect leave reason only.',
      getFunctions: () => [{
        functionId: 'setReason',
        description: 'Set leave reason.',
        paramsSchema: {
          type: 'object',
          properties: { reason: { type: 'string' } },
          required: ['reason'],
        },
      }],
    }

    const api = core.registerBusiness(business)
    const started = await api.startInstance({
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
    })

    expect(api.businessId).toBe('leaveApproval')
    expect(api.moduleId).toBe('leaveApproval')
    expect(api.getBusinessRegistrationData()).toMatchObject({
      businessId: 'leaveApproval',
      name: 'Leave approval',
    })
    expect(api.getBusinessRegistrationStoreSnapshot()).toMatchObject({
      rootBusinessPath: 'leaveApproval',
      rootModulePath: 'leaveApproval',
    })
    expect(core.getBusinessRegistrationData('leaveApproval')).toEqual(api.getBusinessRegistrationData())
    expect(core.listBusinessRegistrationData()).toEqual([api.getBusinessRegistrationData()])
    expect(started.availableFunctions.map((item) => item.action)).toEqual([
      'leave-instance@leaveApproval@setReason',
    ])
    expect(liveState.touched).toBe(false)

    const translated = await api.translateFunctionCall({
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      action: 'leave-instance@leaveApproval@setReason',
      args: { reason: 'family care' },
      projection: started,
    })
    expect(translated.ok).toBe(true)
    expect(liveState.touched).toBe(false)

    const executed = await api.executeFunctionCall({
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      action: 'leave-instance@leaveApproval@setReason',
      args: { reason: 'family care' },
      projection: started,
      run: () => {
        liveState.touched = true
        return { ok: true, data: { accepted: true }, summary: 'accepted' }
      },
    })
    expect(executed).toMatchObject({ ok: true })
    expect(liveState.touched).toBe(true)

    const stopped = api.stopInstance({
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      reason: 'business completed',
    })
    expect(stopped.status).toBe('Stopped')
    expect(core.getSession('leave-session-1')?.status).toBe('Stopped')
  })

  it('treats startInstance as a session-started notification and projects LLM knowledge', async () => {
    const core = createDeterministicRuntime()
    core.registerModule(createLeaveModule())

    const started = await core.startInstance({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
    })

    expect(started.status).toBe('Started')
    expect(started.instanceId).toBe('leave-session-1')
    expect(started.promptSnapshot).toContain('Collect leave reason')
    expect(started.availableFunctions.map((definition) => definition.action)).toEqual([
      'leave-instance@leaveApproval@setReason',
    ])
    expect(started.availableFunctions[0]).not.toHaveProperty('functionId')
    expect(started.availableFunctions[0]?.failureModes).toEqual([
      { code: 'REASON_REQUIRED', when: 'reason is empty', fix: 'Provide a non-empty reason.' },
    ])
    const knowledge = core.getKnowledgeProjection() as AiKnowledgeProjection
    const summaries = knowledge.queryFunctions({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
    })
    expect(summaries[0]).toMatchObject({
      action: 'leave-instance@leaveApproval@setReason',
      moduleId: 'leaveApproval',
      modulePath: 'leaveApproval',
      paramNames: ['reason'],
      requiredParamNames: ['reason'],
      failureCodes: ['REASON_REQUIRED'],
    })
    expect(summaries[0]).not.toHaveProperty('paramsSchema')
    expect(summaries[0]).not.toHaveProperty('usageRules')
    expect(summaries[0]).not.toHaveProperty('failureModes')
    const modules = knowledge.queryModules({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
    })
    expect(modules[0]).toMatchObject({
      moduleId: 'leaveApproval',
      modulePath: 'leaveApproval',
      functionCount: 1,
      childModuleCount: 0,
    })
    expect(modules[0]).not.toHaveProperty('functions')
    expect(modules[0]).not.toHaveProperty('modules')
    expect(knowledge.guideFunction({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
    }, 'leave-instance@leaveApproval@setReason')).toHaveProperty('paramsSchema')
    expect(started.lifecycle).toMatchObject({
      status: 'Started',
      instanceId: 'leave-session-1',
    })
    expect(started.session).toMatchObject({
      status: 'Started',
      instanceId: 'leave-session-1',
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      history: [],
    })
    expect(core.getSession('leave-session-1')?.status).toBe('Started')
  })

  it('returns a module-bound API wrapper that keeps the session data chain continuous', async () => {
    const core = createDeterministicRuntime()
    const leaveApi = core.registerModule(createLeaveModule())

    const projection = await leaveApi.startInstance({
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
    })
    leaveApi.appendMessage({
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      role: 'user',
      content: 'I need family leave.',
    })

    const translated = await leaveApi.translateFunctionCall({
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      action: 'leave-instance@leaveApproval@setReason',
      args: { reason: 'family care' },
      projection,
    })

    expect(translated.ok).toBe(true)
    if (!translated.ok) return

    const requested = leaveApi.recordFunctionCallRequest({
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      action: translated.translation.action,
      args: translated.translation.rawArgs,
      modulePath: translated.translation.context.modulePath,
      functionId: translated.translation.context.functionId,
      activePath: translated.translation.context.activePath,
    })
    const result = { ok: true, data: { accepted: true }, summary: 'accepted' }
    const resultMessage = leaveApi.createFunctionResultMessage({
      action: translated.translation.action,
      result,
    })
    leaveApi.completeFunctionCall({
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      historyEntryId: requested.id,
      status: 'completed',
      result,
      resultMessage,
    })

    const session = leaveApi.getSessionByModuleInstance('leave-instance')
    expect(session?.moduleId).toBe('leaveApproval')
    expect(session?.history.map((entry) => entry.kind)).toEqual(['message', 'functionCall'])
    expect(leaveApi.getSessionHistoryByModuleInstance('leave-instance').map((entry) => entry.kind)).toEqual(['message', 'functionCall'])
    expect(session?.history[1]).toMatchObject({
      action: 'leave-instance@leaveApproval@setReason',
      status: 'completed',
      modulePath: 'leaveApproval',
      functionId: 'setReason',
    })
  })

  it('exports registration as JSON-persistable data without runtime methods', () => {
    const core = createDeterministicRuntime()
    const departmentApi = core.registerModule(createDepartmentModule())

    const data = departmentApi.getRegistrationData()
    const storeSnapshot = departmentApi.getRegistrationStoreSnapshot()
    const roundTripped = JSON.parse(JSON.stringify(data))
    const storeRoundTripped = JSON.parse(JSON.stringify(storeSnapshot))

    expect(core.getModuleRegistrationData('department')).toEqual(data)
    expect(core.listModuleRegistrationData()).toEqual([data])
    expect(core.getModuleRegistrationStoreSnapshot('department')).toEqual(storeSnapshot)
    expect(core.listModuleRegistrationStoreSnapshots()).toEqual([storeSnapshot])
    expect(roundTripped).toEqual(data)
    expect(storeRoundTripped).toEqual(storeSnapshot)
    expect(data).not.toHaveProperty('getFunctions')
    expect(data.modules[0]).not.toHaveProperty('getFunctions')
    expect(data.modules[0]?.modules[0]?.functions[0]).toMatchObject({
      functionId: 'update',
      description: 'Update person basic info.',
      paramsSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    })
    expect(data.functions).toEqual([])
    expect(storeSnapshot.modules.map((item) => item.modulePath)).toEqual([
      'department',
      'department/personnel',
      'department/personnel/basicInfo',
    ])
    expect(storeSnapshot.functions).toMatchObject([{
      modulePath: 'department/personnel/basicInfo',
      functionId: 'update',
      sortOrder: 0,
    }])
    expect(storeSnapshot.modules[0]).not.toHaveProperty('modules')
    expect(storeSnapshot.modules[0]).not.toHaveProperty('functions')
    expect(storeSnapshot.functions[0]).not.toHaveProperty('usageRules')
    expect(storeSnapshot.functions[0]).not.toHaveProperty('failureModes')
  })

  it('splits function rules and failure modes into structured store rows', () => {
    const core = createDeterministicRuntime()
    const snapshot = core.registerModule(createLeaveModule()).getRegistrationStoreSnapshot()

    expect(snapshot.modules).toEqual([{
      modulePath: 'leaveApproval',
      moduleId: 'leaveApproval',
      sortOrder: 0,
      name: 'Leave approval',
      description: 'Help users finish a leave request.',
      prompt: 'Collect leave reason only.',
    }])
    expect(snapshot.functions[0]).toMatchObject({
      modulePath: 'leaveApproval',
      functionId: 'setReason',
      sortOrder: 0,
      description: 'Set leave reason.',
    })
    expect(snapshot.functions[0]).not.toHaveProperty('failureModes')
    expect(snapshot.failureModes).toEqual([{
      modulePath: 'leaveApproval',
      functionId: 'setReason',
      sortOrder: 0,
      code: 'REASON_REQUIRED',
      when: 'reason is empty',
      fix: 'Provide a non-empty reason.',
    }])
  })

  it('registers pure registration data as a database-loaded module source', async () => {
    const sourceCore = createDeterministicRuntime()
    const data = sourceCore.registerModule(createDepartmentModule()).getRegistrationData()
    const core = createDeterministicRuntime()
    core.registerModule(data)

    const projection = await core.startInstance({
      moduleId: 'department',
      moduleInstanceId: 'dept-1',
      instanceId: 'department-session-from-data',
    })

    expect(core.getModuleRegistrationData('department')).toEqual(data)
    expect(projection.availableFunctions.map((item) => item.action)).toEqual([
      'dept-1/{personId}@basicInfo@update',
    ])
    expect(projection.availableFunctions[0]).not.toHaveProperty('functionId')

    const translated = await core.translateFunctionCall({
      moduleId: 'department',
      moduleInstanceId: 'dept-1',
      instanceId: 'department-session-from-data',
      runtimeInstanceId: 'department-session-from-data',
      action: 'dept-1/person-9@basicInfo@update',
      args: { name: 'Ada' },
      activePath: [{ modulePath: 'department/personnel', instanceId: 'person-9' }],
      projection,
    })

    expect(translated.ok).toBe(true)
    if (!translated.ok) return
    expect(translated.translation.executionArgs).toEqual({ name: 'Ada' })
    expect(translated.translation.functionRegistration).not.toHaveProperty('execute')
  })

  it('registers store snapshots as a database-loaded module source', async () => {
    const sourceCore = createDeterministicRuntime()
    const data = sourceCore.registerModule(createDepartmentModule()).getRegistrationData()
    const snapshot = sourceCore.getModuleRegistrationStoreSnapshot('department')
    const core = createDeterministicRuntime()
    expect(snapshot).toBeDefined()
    if (snapshot === undefined) return

    core.registerModule(snapshot)

    const projection = await core.startInstance({
      moduleId: 'department',
      moduleInstanceId: 'dept-1',
      instanceId: 'department-session-from-store',
    })

    expect(core.getModuleRegistrationData('department')).toEqual(data)
    expect(core.getModuleRegistrationStoreSnapshot('department')).toEqual(snapshot)
    expect(projection.availableFunctions.map((item) => item.action)).toEqual([
      'dept-1/{personId}@basicInfo@update',
    ])
    expect(projection.availableFunctions[0]).not.toHaveProperty('functionId')
  })

  it('rejects runtime providers when exporting registration data for persistence', () => {
    const core = createDeterministicRuntime()
    const dynamicApi = core.registerModule({
      moduleId: 'dynamicPrompt',
      name: 'Dynamic prompt',
      description: 'Uses session data to render prompt.',
      prompt: () => 'runtime-only prompt',
      getFunctions: () => [],
    })

    expect(() => dynamicApi.getRegistrationData()).toThrow('Dynamic module prompt provider cannot be persisted')
    expect(() => core.getModuleRegistrationData('dynamicPrompt')).toThrow('Dynamic module prompt provider cannot be persisted')
  })

  it('rejects registration schemas that would be lossy in JSON persistence', () => {
    const core = createDeterministicRuntime()
    const invalidApi = core.registerModule({
      moduleId: 'invalidSchema',
      name: 'Invalid schema',
      description: 'Contains runtime values in schema.',
      getFunctions: () => [{
        functionId: 'run',
        description: 'Run invalid function.',
        paramsSchema: {
          createdAt: new Date('2026-05-11T00:00:00.000Z'),
        } as unknown as AiFunctionRegistration['paramsSchema'],
      }],
    })

    expect(() => invalidApi.getRegistrationData()).toThrow('must be JSON-persistable')
  })

  it('isolates AI sessions by module registration id and root module entity id', async () => {
    const core = createDeterministicRuntime()
    core.registerModule(createLeaveModule())

    const first = await core.startInstance({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
    })
    core.appendMessage({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-alias',
      runtimeInstanceId: 'leave-session-alias',
      role: 'user',
      content: 'same root entity',
    })
    const resumed = await core.startInstance({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-2',
    })
    const other = await core.startInstance({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'another-leave-instance',
      instanceId: 'leave-session-3',
    })

    expect(first.instanceId).toBe('leave-session-1')
    expect(resumed.instanceId).toBe('leave-session-2')
    expect(core.getSessionByModuleScope({ moduleId: 'leaveApproval', moduleInstanceId: 'leave-instance' })?.history).toHaveLength(1)
    expect(core.getSessionHistoryByModuleScope({ moduleId: 'leaveApproval', moduleInstanceId: 'leave-instance' })).toHaveLength(1)
    expect(core.getSession('leave-session-alias')?.instanceId).toBe('leave-session-2')
    expect(other.instanceId).toBe('leave-session-3')
    expect(core.getSessionByModuleScope({ moduleId: 'leaveApproval', moduleInstanceId: 'another-leave-instance' })?.history).toHaveLength(0)
  })

  it('encodes root business entity ids in projected actions and decodes them during translation', async () => {
    const core = createDeterministicRuntime()
    core.registerModule(createLeaveModule())
    const projection = await core.startInstance({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'workspace/page@A',
      instanceId: 'leave-session-encoded',
    })

    expect(projection.availableFunctions.map((definition) => definition.action)).toEqual([
      'workspace%2Fpage%40A@leaveApproval@setReason',
    ])

    const translated = await core.translateFunctionCall({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'workspace/page@A',
      instanceId: 'leave-session-encoded',
      runtimeInstanceId: 'leave-session-encoded',
      action: 'workspace%2Fpage%40A@leaveApproval@setReason',
      args: { reason: 'encoded page id' },
      projection,
    })

    expect(translated.ok).toBe(true)
    if (!translated.ok) return
    expect(translated.translation.context.moduleInstanceId).toBe('workspace/page@A')
  })

  it('rejects reusing one technical session alias for another root business entity', async () => {
    const core = createDeterministicRuntime()
    core.registerModule(createLeaveModule())
    await core.startInstance({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance-a',
      instanceId: 'shared-session',
    })

    await expect(core.startInstance({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance-b',
      instanceId: 'shared-session',
    })).rejects.toThrow('AI session alias shared-session is already bound to leaveApproval/leave-instance-a')
  })

  it('translates a function call but leaves execution to the registering service', async () => {
    const executeSpy = vi.fn()
    const core = createDeterministicRuntime()
    core.registerModule(createLeaveModule(executeSpy))
    const projection = await core.startInstance({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
    })

    const translated = await core.translateFunctionCall({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      action: 'leave-instance@leaveApproval@setReason',
      args: { reason: 'family care' },
      projection,
    })

    expect(translated.ok).toBe(true)
    if (!translated.ok) return
    expect(executeSpy).not.toHaveBeenCalled()
    expect(translated.translation.executionArgs).toEqual({ reason: 'family care' })
    expect(translated.translation.context).toMatchObject({
      instanceId: 'leave-session-1',
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      modulePath: 'leaveApproval',
      functionId: 'setReason',
      action: 'leave-instance@leaveApproval@setReason',
    })

    const executable = translated.translation.functionRegistration as ExecutableFunctionRegistration
    const state: LeaveFormState = { draft: { reason: null } }
    const result = executable.execute(translated.translation.executionArgs, translated.translation.context)
    state.draft.reason = (translated.translation.executionArgs as { reason: string }).reason

    expect(result).toEqual({ accepted: true })
    expect(state.draft.reason).toBe('family care')
    expect(executeSpy).toHaveBeenCalledWith({ reason: 'family care' })
  })

  it('serializes execution results for LLM without interpreting business fields', () => {
    const core = createDeterministicRuntime()
    const domainResult = {
      ok: false,
      code: 'DOMAIN_NEEDS_MORE_INPUT',
      msg: 'Need an approver.',
      fix: 'Ask the user for an approver.',
    }

    const message = core.createFunctionResultMessage({
      action: 'leave-instance@leaveApproval@setReason',
      result: domainResult,
    })

    expect(message).toEqual({
      action: 'leave-instance@leaveApproval@setReason',
      result: domainResult,
      content: JSON.stringify(domainResult),
    })
  })

  it('keeps AI session history for UI messages, LLM messages, and LLM-planned function calls', async () => {
    const core = createDeterministicRuntime()
    core.registerModule(createLeaveModule())
    await core.startInstance({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
    })

    const user = core.appendMessage({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      role: 'user',
      content: 'I need family leave.',
    })
    const assistant = core.appendMessage({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      role: 'assistant',
      content: 'I will set the leave reason.',
    })
    const resultMessage = core.createFunctionResultMessage({
      action: 'leave-instance@leaveApproval@setReason',
      result: { ok: true, data: { accepted: true }, summary: 'accepted' },
    })
    const requested = core.recordFunctionCallRequest({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      action: 'leave-instance@leaveApproval@setReason',
      args: { reason: 'family care' },
    })
    const call = core.completeFunctionCall({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      historyEntryId: requested.id,
      result: { ok: true, data: { accepted: true }, summary: 'accepted' },
      resultMessage,
    })

    expect(user.source).toBe('ui')
    expect(assistant.source).toBe('llm')
    expect(requested.status).toBe('requested')
    expect(call.status).toBe('completed')
    expect(call.id).toBe(requested.id)
    expect(core.getSessionByModuleScope({ moduleId: 'leaveApproval', moduleInstanceId: 'leave-instance' })?.instanceId).toBe('leave-session-1')
    expect(core.getSessionHistory('leave-session-1').map((entry) => entry.kind)).toEqual([
      'message',
      'message',
      'functionCall',
    ])
  })

  it('projects recursive module context params and strips them from execution args', async () => {
    const core = createDeterministicRuntime()
    core.registerModule(createDepartmentModule())
    const projection = await core.startInstance({
      moduleId: 'department',
      moduleInstanceId: 'dept-1',
      instanceId: 'department-session-1',
    })

    const update = projection.availableFunctions.find((item) => item.action === 'dept-1/{personId}@basicInfo@update')
    expect(update?.paramsSchema).toMatchObject({
      type: 'object',
      properties: {
        departmentId: { type: 'string' },
        personId: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['name', 'departmentId', 'personId'],
    })

    const translated = await core.translateFunctionCall({
      moduleId: 'department',
      moduleInstanceId: 'dept-1',
      instanceId: 'department-session-1',
      runtimeInstanceId: 'department-session-1',
      action: 'dept-1/person-9@basicInfo@update',
      args: { name: 'Ada' },
      activePath: [{ modulePath: 'department/personnel', instanceId: 'person-9' }],
      projection,
    })

    expect(translated.ok).toBe(true)
    if (!translated.ok) return
    expect(translated.translation.executionArgs).toEqual({ name: 'Ada' })
    expect(translated.translation.context.moduleInstances).toEqual({ departmentId: 'dept-1', personId: 'person-9' })
    expect(translated.translation.context.modulePath).toBe('department/personnel/basicInfo')
  })

  it('rejects active path conflicts and missing module instances during translation', async () => {
    const core = createDeterministicRuntime()
    core.registerModule(createDepartmentModule())
    const projection = await core.startInstance({
      moduleId: 'department',
      moduleInstanceId: 'dept-1',
      instanceId: 'department-session-1',
    })

    const conflict = await core.translateFunctionCall({
      moduleId: 'department',
      moduleInstanceId: 'dept-1',
      instanceId: 'department-session-1',
      runtimeInstanceId: 'department-session-1',
      action: 'dept-1/person-2@basicInfo@update',
      args: { personId: 'person-2', name: 'Ada' },
      activePath: [{ modulePath: 'department/personnel', instanceId: 'person-1' }],
      projection,
    })
    expect(conflict.ok).toBe(false)
    if (!conflict.ok) expect(conflict.code).toBe('CONTEXT_MISMATCH')

    const missing = await core.translateFunctionCall({
      moduleId: 'department',
      moduleInstanceId: 'dept-1',
      instanceId: 'department-session-1',
      runtimeInstanceId: 'department-session-1',
      action: 'dept-1@basicInfo@update',
      args: { name: 'Ada' },
      projection,
    })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.code).toBe('INVALID_ACTION_INSTANCE_PATH')
  })

  it('fails fast when action module and current scope do not match', async () => {
    const core = createDeterministicRuntime()
    core.registerModule(createLeaveModule())
    const projection = await core.startInstance({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
    })

    const output = await core.translateFunctionCall({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      action: 'leave-instance@otherModule@setReason',
      args: { reason: 'family care' },
      projection,
    })

    expect(output.ok).toBe(false)
    if (!output.ok) expect(output.code).toBe('MODULE_NOT_AVAILABLE')
  })

  it('validates args from the projected function schema before returning a translation', async () => {
    const executeSpy = vi.fn()
    const core = createDeterministicRuntime()
    core.registerModule(createLeaveModule(executeSpy))
    const projection = await core.startInstance({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
    })

    const output = await core.translateFunctionCall({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      action: 'leave-instance@leaveApproval@setReason',
      args: { reason: 3 },
      projection,
    })

    expect(output.ok).toBe(false)
    if (!output.ok) {
      expect(output.code).toBe('INVALID_ARGS')
      expect(output.msg).toContain('reason')
    }
    expect(executeSpy).not.toHaveBeenCalled()
  })

  it('marks an AI session stopped and blocks later function translation until restart', async () => {
    const core = createDeterministicRuntime()
    core.registerModule(createLeaveModule())
    await core.startInstance({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
    })

    const stopped = core.stopInstance({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      reason: 'session closed',
    })

    expect(stopped.status).toBe('Stopped')
    expect(stopped.lifecycle).toMatchObject({
      status: 'Stopped',
      instanceId: 'leave-session-1',
      reason: 'session closed',
    })
    expect(stopped.session.status).toBe('Stopped')
    expect(core.getSession('leave-session-1')?.status).toBe('Stopped')

    const translated = await core.translateFunctionCall({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      action: 'leave-instance@leaveApproval@setReason',
      args: { reason: 'family care' },
    })

    expect(translated.ok).toBe(false)
    if (!translated.ok) expect(translated.code).toBe('SESSION_STOPPED')

    await core.startInstance({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
    })
    const resumed = await core.translateFunctionCall({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'leave-instance',
      instanceId: 'leave-session-1',
      runtimeInstanceId: 'leave-session-1',
      action: 'leave-instance@leaveApproval@setReason',
      args: { reason: 'family care' },
    })
    expect(resumed.ok).toBe(true)
  })

  it('rejects duplicate module registrations instead of creating parallel registries', () => {
    const core = createDeterministicRuntime()
    core.registerModule(createLeaveModule())

    expect(() => core.registerModule(createLeaveModule())).toThrow('Duplicate AI module registration')
  })

  it('rejects duplicate module ids inside one registration tree before LLM action projection', () => {
    const core = createDeterministicRuntime()
    const duplicatedModuleTree: AiModuleRegistration = {
      moduleId: 'workflow',
      name: 'Workflow',
      description: 'Root workflow.',
      getFunctions: () => [],
      modules: [
        {
          moduleId: 'tool',
          name: 'Tool A',
          description: 'First tool.',
          getFunctions: () => [{
            functionId: 'run',
            description: 'Run first tool.',
            paramsSchema: NO_PARAMS_SCHEMA,
          }],
        },
        {
          moduleId: 'tool',
          name: 'Tool B',
          description: 'Second tool.',
          getFunctions: () => [{
            functionId: 'run',
            description: 'Run second tool.',
            paramsSchema: NO_PARAMS_SCHEMA,
          }],
        },
      ],
    }

    expect(() => core.registerModule(duplicatedModuleTree)).toThrow('Duplicate module id in registration tree')
  })
})
